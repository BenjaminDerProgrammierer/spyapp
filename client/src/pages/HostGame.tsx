import { useState, useEffect } from 'react';
import { useHistory } from 'react-router-dom';
import {
  IonBackButton,
  IonBadge,
  IonButton,
  IonButtons,
  IonCard,
  IonCardContent,
  IonCardHeader,
  IonCardSubtitle,
  IonCardTitle,
  IonContent,
  IonHeader,
  IonIcon,
  IonItem,
  IonLabel,
  IonList,
  IonListHeader,
  IonNote,
  IonPage,
  IonSelect,
  IonSelectOption,
  IonSpinner,
  IonTitle,
  IonToolbar,
  useIonToast
} from '@ionic/react';
import { copy } from 'ionicons/icons';
import { Socket } from 'socket.io-client';
import { initializeSocket } from '../lib/socketManager';
import './HostGame.css';

interface Player {
  id: string;
  name: string;
}

const HostGame: React.FC = () => {
  const history = useHistory();
  const [presentToast] = useIonToast();
  const [socket, setSocket] = useState<Socket | null>(null);
  const [loading, setLoading] = useState(true);
  const [gameId, setGameId] = useState('');
  const [players, setPlayers] = useState<Player[]>([]);
  const [playerId, setPlayerId] = useState('');
  const [hostId, setHostId] = useState('');
  const [spyCount, setSpyCount] = useState(1);
  const [minPlayersToStart, setMinPlayersToStart] = useState(3);
  const [errorMessage, setErrorMessage] = useState('Failed to create game');

  const maxSpies = Math.max(1, Math.floor(Math.max(3, players.length) / 2));
  const availableSpyCounts = Array.from({ length: Math.min(5, maxSpies) }, (_, i) => i + 1);

  useEffect(() => {
    const playerName = localStorage.getItem('playerName');
    if (!playerName) {
      setErrorMessage('Player name not found');
      setLoading(false);
      return;
    }

    const connectAndCreateGame = async () => {
      try {
        const { socket: newSocket, playerId: playerIdFromSocket } = await initializeSocket(playerName);
        setSocket(newSocket);
        setPlayerId(playerIdFromSocket);

        newSocket.emit('create_game', spyCount, (gameResponse: any) => {
          if (!gameResponse.success) {
            setErrorMessage(gameResponse.error || 'Failed to create game');
            setLoading(false);
            return;
          }

          const createdGameId = gameResponse.gameId;
          setGameId(createdGameId);
          setHostId(playerIdFromSocket);
          setSpyCount(gameResponse.spyCount || 1);
          setMinPlayersToStart(gameResponse.minPlayersToStart || 3);
          setPlayers([{ id: playerIdFromSocket, name: playerName }]);
          setLoading(false);

          // Set up game_started handler with the correct gameId
          newSocket.on('game_started', () => {
            history.push(`/game/${createdGameId}`);
          });
        });

        newSocket.on('player_joined', (data: { players: Player[] }) => {
          setPlayers(data.players);
        });

        newSocket.on('player_left', (data: { players: Player[] }) => {
          setPlayers(data.players);
        });

        newSocket.on('spy_count_updated', (data: { spyCount: number }) => {
          setSpyCount(data.spyCount);
        });
      } catch (error) {
        console.error('Error connecting:', error);
        setErrorMessage('Failed to connect to server');
        setLoading(false);
      }
    };

    connectAndCreateGame();

    return () => {
      // Don't disconnect, let socketManager handle it
      if (socket) {
        socket.off('player_joined');
        socket.off('player_left');
        socket.off('spy_count_updated');
        socket.off('game_started');
      }
    };
  }, [history]);

  const copyGameId = async () => {
    if (!gameId) return;

    try {
      await navigator.clipboard.writeText(gameId);
      presentToast({
        message: 'Game code copied to clipboard',
        duration: 2000,
        position: 'bottom'
      });
    } catch (error) {
      console.error('Failed to copy game ID:', error);
    }
  };

  const updateSpyCount = (value: number) => {
    if (!gameId || !socket) return;

    socket.emit('update_spy_count', gameId, value, (response: any) => {
      if (!response.success) {
        presentToast({
          message: response.error || 'Failed to update spy count',
          duration: 2000,
          position: 'bottom'
        });
        setSpyCount(response.spyCount || 1);
      }
    });
  };

  const startGame = () => {
    if (players.length < minPlayersToStart) return;

    socket?.emit('start_game', gameId, (response: any) => {
      if (!response.success) {
        presentToast({
          message: response.error || 'Failed to start game',
          duration: 2000,
          position: 'bottom'
        });
      }
    });
  };

  return (
    <IonPage>
      <IonHeader>
        <IonToolbar>
          <IonButtons slot="start">
            <IonBackButton defaultHref="/home"></IonBackButton>
          </IonButtons>
          <IonTitle>Host Game</IonTitle>
        </IonToolbar>
      </IonHeader>
      <IonContent className="ion-padding">
        <div className="container">
          {loading && (
            <div>
              <IonSpinner name="crescent"></IonSpinner>
              <p>Creating game...</p>
            </div>
          )}

          {!loading && gameId && (
            <IonCard>
              <IonCardHeader>
                <IonCardTitle>Game Created!</IonCardTitle>
                <IonCardSubtitle>Share this code with your friends</IonCardSubtitle>
              </IonCardHeader>
              <IonCardContent>
                <div className="game-code">
                  <h1>{gameId}</h1>
                  <IonButton fill="clear" onClick={copyGameId}>
                    <IonIcon slot="icon-only" icon={copy}></IonIcon>
                  </IonButton>
                </div>

                <IonList>
                  <IonListHeader>
                    <IonLabel>Game Settings</IonLabel>
                  </IonListHeader>
                  <IonItem>
                    <IonLabel position="stacked">Number of Spies</IonLabel>
                    <IonSelect
                      value={spyCount}
                      onIonChange={(e) => {
                        setSpyCount(e.detail.value);
                        updateSpyCount(e.detail.value);
                      }}
                    >
                      {availableSpyCounts.map((count) => (
                        <IonSelectOption key={count} value={count}>
                          {count} {count === 1 ? 'Spy' : 'Spies'}
                        </IonSelectOption>
                      ))}
                    </IonSelect>
                  </IonItem>
                  <IonItem>
                    <IonNote>
                      {players.length < 3 ? (
                        <span>Maximum {maxSpies} spies will be allowed with current player count</span>
                      ) : (
                        <span>
                          Maximum {maxSpies} spies allowed with {players.length} players
                        </span>
                      )}
                    </IonNote>
                  </IonItem>
                </IonList>

                <IonList>
                  <IonListHeader>
                    <IonLabel>Players ({players.length})</IonLabel>
                  </IonListHeader>
                  {players.map((player) => (
                    <IonItem key={player.id}>
                      <IonLabel>{player.name}</IonLabel>
                      {player.id === hostId && <IonBadge color="success">Host</IonBadge>}
                    </IonItem>
                  ))}
                </IonList>

                <div className="button-container">
                  <IonButton
                    expand="block"
                    onClick={startGame}
                    disabled={players.length < minPlayersToStart}
                  >
                    Start Game
                  </IonButton>
                  {players.length < minPlayersToStart && (
                    <IonNote>You need at least {minPlayersToStart} players to start the game</IonNote>
                  )}
                </div>
              </IonCardContent>
            </IonCard>
          )}

          {!loading && !gameId && (
            <IonCard className="error-card">
              <IonCardHeader>
                <IonCardTitle>Error</IonCardTitle>
              </IonCardHeader>
              <IonCardContent>
                <p>{errorMessage}</p>
                <IonButton expand="block" routerLink="/home">
                  Back to Home
                </IonButton>
              </IonCardContent>
            </IonCard>
          )}
        </div>
      </IonContent>
    </IonPage>
  );
};

export default HostGame;
