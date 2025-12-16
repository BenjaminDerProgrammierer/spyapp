import { useState, useEffect } from 'react';
import { useHistory } from 'react-router-dom';
import {
  IonBackButton,
  IonButton,
  IonButtons,
  IonCard,
  IonCardContent,
  IonCardHeader,
  IonCardTitle,
  IonContent,
  IonHeader,
  IonIcon,
  IonInput,
  IonItem,
  IonLabel,
  IonList,
  IonNote,
  IonPage,
  IonSpinner,
  IonTitle,
  IonToolbar,
  useIonToast
} from '@ionic/react';
import { refresh } from 'ionicons/icons';
import { initializeSocket } from '../lib/socketManager';
import { Socket } from 'socket.io-client';
import './JoinGame.css';

interface Game {
  id: string;
  hostId: string;
  hostName: string;
  playerCount: number;
  status: string;
  createdAt: string;
}

const JoinGame: React.FC = () => {
  const history = useHistory();
  const [presentToast] = useIonToast();
  const [socket, setSocket] = useState<Socket | null>(null);
  const [gameCode, setGameCode] = useState('');
  const [loading, setLoading] = useState(false);
  const [loadingGames, setLoadingGames] = useState(true);
  const [availableGames, setAvailableGames] = useState<Game[]>([]);
  const [playerId, setPlayerId] = useState('');
  const apiBaseUrl = '/api';

  useEffect(() => {
    const playerName = localStorage.getItem('playerName');
    if (!playerName) {
      presentToast({
        message: 'Player name not found',
        duration: 2000,
        position: 'bottom'
      });
      history.push('/home');
      return;
    }

    initializeSocket(playerName)
      .then((result) => {
        setSocket(result.socket);
        setPlayerId(result.playerId);
        console.log('Socket connected:', result.socket.connected);
        console.log('Player registered with ID:', result.playerId);

        refreshGames();

        result.socket.on('game_started', () => {
          console.log('Game started event received');
          if (gameCode) {
            history.push(`/game/${gameCode}`);
          }
        });
      })
      .catch((error) => {
        console.error('Error connecting to server:', error);
        presentToast({
          message: 'Failed to connect to server: ' + (error instanceof Error ? error.message : 'Unknown error'),
          duration: 2000,
          position: 'bottom'
        });
      });

    return () => {
      if (socket) {
        socket.off('game_started');
      }
    };
  }, []);

  const refreshGames = async () => {
    setLoadingGames(true);
    try {
      const response = await fetch(`${apiBaseUrl}/game/list`);
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      const data = await response.json();
      console.log('Games list response:', data);

      if (data.success) {
        setAvailableGames(data.games);
      } else {
        presentToast({
          message: 'Failed to load games: ' + (data.error || 'Unknown error'),
          duration: 2000,
          position: 'bottom'
        });
      }
    } catch (error) {
      console.error('Error loading games:', error);
      presentToast({
        message: 'Failed to load games: ' + (error instanceof Error ? error.message : 'Unknown error'),
        duration: 2000,
        position: 'bottom'
      });
    } finally {
      setLoadingGames(false);
    }
  };

  const selectGame = (id: string) => {
    setGameCode(id);
  };

  const joinGame = () => {
    if (!gameCode) {
      presentToast({
        message: 'Please enter a game code',
        duration: 2000,
        position: 'bottom'
      });
      return;
    }

    if (!socket) {
      console.error('Socket not connected');
      presentToast({
        message: 'Not connected to server. Please refresh the page.',
        duration: 2000,
        position: 'bottom'
      });
      return;
    }

    if (!socket.connected) {
      console.error('Socket disconnected');
      presentToast({
        message: 'Connection to server lost. Please refresh the page.',
        duration: 2000,
        position: 'bottom'
      });
      return;
    }

    if (!playerId) {
      console.error('Player ID not set');
      presentToast({
        message: 'Player not registered. Please refresh the page.',
        duration: 2000,
        position: 'bottom'
      });
      return;
    }

    console.log(`Joining game ${gameCode} as player ${playerId}`);
    setLoading(true);

    socket.emit('join_game', gameCode, (response: any) => {
      setLoading(false);
      console.log('Join game response:', response);

      if (!response.success) {
        presentToast({
          message: response.error || 'Failed to join game',
          duration: 2000,
          position: 'bottom'
        });
        return;
      }

      console.log('Navigating to game room:', gameCode);
      history.push(`/game/${gameCode}`);
    });
  };

  const formatTime = (dateString: string) => {
    const date = new Date(dateString);
    return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  };

  return (
    <IonPage>
      <IonHeader>
        <IonToolbar>
          <IonButtons slot="start">
            <IonBackButton defaultHref="/home"></IonBackButton>
          </IonButtons>
          <IonTitle>Join Game</IonTitle>
        </IonToolbar>
      </IonHeader>
      <IonContent className="ion-padding">
        <div className="container">
          <IonCard>
            <IonCardHeader>
              <IonCardTitle>Join an Existing Game</IonCardTitle>
            </IonCardHeader>
            <IonCardContent>
              <IonItem>
                <IonLabel position="floating">Game Code</IonLabel>
                <IonInput
                  value={gameCode}
                  onIonInput={(e) => setGameCode(e.detail.value!)}
                  required
                ></IonInput>
              </IonItem>

              <div className="button-container">
                <IonButton expand="block" onClick={joinGame} disabled={!gameCode || loading}>
                  {loading ? <IonSpinner name="dots"></IonSpinner> : <span>Join Game</span>}
                </IonButton>
              </div>
            </IonCardContent>
          </IonCard>

          <IonCard>
            <IonCardHeader>
              <IonCardTitle>Available Games</IonCardTitle>
            </IonCardHeader>
            <IonCardContent>
              {loadingGames ? (
                <IonSpinner name="crescent"></IonSpinner>
              ) : availableGames.length > 0 ? (
                <IonList>
                  {availableGames.map((game) => (
                    <IonItem key={game.id} button onClick={() => selectGame(game.id)}>
                      <IonLabel>
                        <h2>Host: {game.hostName}</h2>
                        <p>Players: {game.playerCount}</p>
                      </IonLabel>
                      <IonNote slot="end">{formatTime(game.createdAt)}</IonNote>
                    </IonItem>
                  ))}
                </IonList>
              ) : (
                <p className="ion-text-center">No games available</p>
              )}

              <div className="button-container">
                <IonButton expand="block" fill="outline" onClick={refreshGames}>
                  <IonIcon slot="start" icon={refresh}></IonIcon>
                  Refresh
                </IonButton>
              </div>
            </IonCardContent>
          </IonCard>
        </div>
      </IonContent>
    </IonPage>
  );
};

export default JoinGame;
