import { useState, useEffect } from 'react';
import { useParams, useHistory } from 'react-router-dom';
import {
  IonAlert,
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
  IonItem,
  IonLabel,
  IonList,
  IonListHeader,
  IonNote,
  IonPage,
  IonSpinner,
  IonTitle,
  IonToolbar,
  useIonToast
} from '@ionic/react';
import { Socket } from 'socket.io-client';
import { getSocket } from '../lib/socketManager';
import './GameRoom.css';

interface Player {
  id: string;
  name: string;
  role?: 'spy' | 'regular';
}

interface AlertButton {
  text: string;
  handler?: () => void;
}

const GameRoom: React.FC = () => {
  const { id: gameId } = useParams<{ id: string }>();
  const history = useHistory();
  const [presentToast] = useIonToast();
  const [socket, setSocket] = useState<Socket | null>(null);
  const [loading, setLoading] = useState(true);
  const [players, setPlayers] = useState<Player[]>([]);
  const [playersWithRoles, setPlayersWithRoles] = useState<Player[]>([]);
  const [playerId, setPlayerId] = useState('');
  const [hostId, setHostId] = useState('');
  const [spyCount, setSpyCount] = useState(1);
  const [minPlayersToStart, setMinPlayersToStart] = useState(3);
  const [gameStatus, setGameStatus] = useState<'waiting' | 'playing' | 'finished'>('waiting');
  const [playerRole, setPlayerRole] = useState<'spy' | 'regular' | ''>('');
  const [currentWord, setCurrentWord] = useState('');
  const [currentHintWord, setCurrentHintWord] = useState('');
  const [errorAlert, setErrorAlert] = useState({
    show: false,
    header: 'Error',
    message: '',
    buttons: ['OK'] as (string | AlertButton)[]
  });

  const isHost = playerId === hostId;
  const wordDisplay = playerRole === 'spy' ? '???' : currentWord || 'Loading...';
  const hintWordDisplay = currentHintWord || 'Loading hint...';

  useEffect(() => {
    const playerName = localStorage.getItem('playerName');
    if (!playerName) {
      showError('Player name not found', () => {
        history.push('/home');
      });
      return;
    }

    if (!gameId) {
      showError('Game ID not found', () => {
        history.push('/home');
      });
      return;
    }

    // Use the existing socket from socketManager instead of creating a new one
    const existingSocket = getSocket();
    if (!existingSocket || !existingSocket.connected) {
      showError('Not connected to server. Please go back and try again.', () => {
        history.push('/home');
      });
      return;
    }

    setSocket(existingSocket);

    // Get the playerId from the socket data or emit join_as_player if needed
    const socketData = (existingSocket as any).data;
    if (socketData?.playerId) {
      setPlayerId(socketData.playerId);
      joinGame(existingSocket, socketData.playerId);
    } else {
      // Fallback: re-register (shouldn't normally happen)
      const userId = localStorage.getItem('spyapp_user_id');
      existingSocket.emit('join_as_player', playerName, userId, (response: any) => {
        if (!response.success) {
          showError(response.error || 'Failed to join as player');
          return;
        }
        setPlayerId(response.playerId);
        joinGame(existingSocket, response.playerId);
      });
    }

    setupSocketListeners(existingSocket);

    setTimeout(checkMissingWord, 3000);

    return () => {
      // Don't disconnect the socket here, let socketManager handle it
      if (existingSocket) {
        existingSocket.off('player_joined');
        existingSocket.off('player_left');
        existingSocket.off('host_left');
        existingSocket.off('game_started');
        existingSocket.off('role_assigned');
        existingSocket.off('player_role_update');
        existingSocket.off('game_ended');
        existingSocket.off('game_restarted');
      }
    };
  }, [gameId]);

  const joinGame = (socketInstance: Socket, pId: string) => {
    if (!gameId || !pId) return;

    setLoading(true);
    socketInstance.emit('join_game', gameId, (response: any) => {
      setLoading(false);

      if (!response.success) {
        showError(response.error || 'Failed to join game');
        return;
      }

      const game = response.game;
      setHostId(game.hostId);
      setPlayers(game.players);
      setGameStatus(game.status);
      setSpyCount(game.spyCount || 1);
      setMinPlayersToStart(game.minPlayersToStart || 3);

      if (game.status === 'playing') {
        socketInstance.emit('request_role_info', (roleResponse: any) => {
          console.log('Got role info response:', roleResponse);
          if (roleResponse.success) {
            setPlayerRole(roleResponse.role);
            console.log('Role:', roleResponse.role, 'Word:', roleResponse.word, 'Hint:', roleResponse.hintWord);

            if (roleResponse.hintWord) {
              setCurrentHintWord(roleResponse.hintWord);
              try {
                localStorage.setItem(`spyapp_hint_${gameId}`, roleResponse.hintWord);
              } catch (e) {
                console.error('Failed to store hint word in localStorage:', e);
              }
            }

            if (roleResponse.word) {
              setCurrentWord(roleResponse.word);
              console.log('Set word to:', roleResponse.word);
            } else if (roleResponse.role === 'regular') {
              console.warn('Regular player did not receive a word!');
            }
          } else {
            console.error('Failed to get role info:', roleResponse.error);
          }
        });
      }
    });
  };

  const setupSocketListeners = (socketInstance: Socket) => {
    socketInstance.on('player_joined', (data: { players: Player[] }) => {
      setPlayers(data.players);
    });

    socketInstance.on('player_left', (data: { players: Player[] }) => {
      setPlayers(data.players);
    });

    socketInstance.on('host_left', (data: { status: 'finished'; message: string }) => {
      setGameStatus('finished');
      showError(data.message);
    });

    socketInstance.on('game_started', () => {
      setGameStatus('playing');
      setTimeout(() => {
        if (playerRole === '' && gameStatus === 'playing') {
          console.log('Game started but no role assigned yet, requesting role info...');
          socketInstance.emit('request_role_info', handleRoleInfoResponse);
        }
      }, 1000);
    });

    socketInstance.on('role_assigned', (data: { role: 'spy' | 'regular'; word: string | null; hintWord: string | null }) => {
      console.log('Role assigned:', data.role, 'Word:', data.word, 'Hint:', data.hintWord);
      setPlayerRole(data.role);
      
      // Ensure loading is false when we receive role data
      setLoading(false);

      if (data.hintWord) {
        const hintValue = String(data.hintWord).trim();
        setCurrentHintWord(hintValue);
        try {
          localStorage.setItem(`spyapp_hint_${gameId}`, hintValue);
        } catch (e) {
          console.error('Failed to store hint word in localStorage:', e);
        }
      }

      if (data.role === 'regular') {
        if (data.word) {
          const wordValue = String(data.word).trim();
          setCurrentWord(wordValue);
          try {
            localStorage.setItem(`spyapp_word_${gameId}`, wordValue);
          } catch (e) {
            console.error('Failed to store word in localStorage:', e);
          }
        } else {
          console.error('ERROR: Regular player did not receive a word!');
          setTimeout(checkMissingWord, 500);
        }
      } else if (data.role === 'spy') {
        console.log('Spy role assigned, word should be null');
        setCurrentWord('');
      }
    });

    socketInstance.on('player_role_update', (data: {
      playerId: string;
      role: 'spy' | 'regular';
      word: string | null;
      hintWord: string | null;
    }) => {
      console.log('Received player_role_update:', data);

      if (data.playerId === playerId) {
        console.log('This role update is for us!');
        setPlayerRole(data.role);

        if (data.hintWord) {
          const hintValue = String(data.hintWord).trim();
          setCurrentHintWord(hintValue);
          try {
            localStorage.setItem(`spyapp_hint_${gameId}`, hintValue);
          } catch (e) {
            console.error('Failed to store hint word in localStorage:', e);
          }
        }

        if (data.role === 'regular' && data.word) {
          const wordValue = String(data.word).trim();
          setCurrentWord(wordValue);
          console.log('Set word via role update:', wordValue);
          try {
            localStorage.setItem(`spyapp_word_${gameId}`, wordValue);
          } catch (e) {
            console.error('Failed to store word in localStorage:', e);
          }
        } else if (data.role === 'spy') {
          setCurrentWord('');
        }
      }
    });

    socketInstance.on('game_ended', (data: {
      status: 'finished';
      word: string;
      hintWord?: string;
      players: Player[];
    }) => {
      setGameStatus('finished');
      setCurrentWord(data.word);
      if (data.hintWord) {
        setCurrentHintWord(data.hintWord);
      }
      setPlayersWithRoles(data.players);
    });

    socketInstance.on('game_restarted', (data: { status: 'waiting'; players: Player[] }) => {
      setGameStatus('waiting');
      setPlayers(data.players);
      setCurrentWord('');
      setCurrentHintWord('');
      setPlayerRole('');
      setPlayersWithRoles([]);
      localStorage.removeItem(`spyapp_word_${gameId}`);
      localStorage.removeItem(`spyapp_hint_${gameId}`);
    });
  };

  const handleRoleInfoResponse = (roleResponse: any) => {
    console.log('Role info response after game start:', roleResponse);
    if (!roleResponse.success) return;

    setPlayerRole(roleResponse.role);

    if (roleResponse.hintWord) {
      setCurrentHintWord(roleResponse.hintWord);
      try {
        localStorage.setItem(`spyapp_hint_${gameId}`, roleResponse.hintWord);
      } catch (e) {
        console.error('Failed to store hint word in localStorage:', e);
      }
    }

    if (roleResponse.word) {
      setCurrentWord(roleResponse.word);
      console.log('Set word after game start:', roleResponse.word);
    }
  };

  const checkMissingWord = () => {
    if (playerRole === 'regular' && (!currentWord || currentWord.trim() === '') && gameStatus === 'playing') {
      console.log('Regular player missing word, checking local storage first...');

      try {
        const storedWord = localStorage.getItem(`spyapp_word_${gameId}`);
        if (storedWord && storedWord.trim() !== '') {
          console.log('Retrieved word from localStorage:', storedWord);
          setCurrentWord(storedWord);
          return;
        }
      } catch (e) {
        console.error('Error checking localStorage for word:', e);
      }

      console.log('Requesting word from server...');
      socket?.emit('request_role_info', (roleResponse: any) => {
        if (roleResponse.success && roleResponse.word) {
          console.log('Received missing word:', roleResponse.word);
          handleMainWordUpdate(roleResponse.word);
        }
      });
    }
  };

  const handleMainWordUpdate = (word: string | null) => {
    if (playerRole !== 'regular') return true;

    if (word) {
      console.log('Force refresh set word to:', word);
      setCurrentWord(word);
      try {
        localStorage.setItem(`spyapp_word_${gameId}`, word);
      } catch (e) {
        console.error('Failed to store word in localStorage:', e);
      }
      return true;
    }

    console.error('Force refresh did not receive a word for regular player');
    presentToast({
      message: 'Could not get the secret word. Please try again.',
      duration: 3000,
      position: 'bottom',
      color: 'danger'
    });
    return false;
  };

  const forceRefreshWord = () => {
    console.log('Forcing word and hint refresh...');
    if (gameStatus === 'playing') {
      presentToast({
        message: 'Refreshing game data...',
        duration: 2000,
        position: 'bottom',
        color: 'primary'
      });

      socket?.emit('request_role_info', (roleResponse: any) => {
        console.log('Force refresh response:', roleResponse);

        if (roleResponse.success) {
          setPlayerRole(roleResponse.role);

          const hintSuccess = roleResponse.hintWord ? true : false;
          if (roleResponse.hintWord) {
            setCurrentHintWord(roleResponse.hintWord);
            try {
              localStorage.setItem(`spyapp_hint_${gameId}`, roleResponse.hintWord);
            } catch (e) {
              console.error('Failed to store hint word in localStorage:', e);
            }
          }

          const wordSuccess = handleMainWordUpdate(roleResponse.word);

          const isSuccess =
            (playerRole === 'spy' && hintSuccess) || (playerRole === 'regular' && wordSuccess && hintSuccess);

          if (isSuccess) {
            presentToast({
              message: 'Game data refreshed successfully!',
              duration: 2000,
              position: 'bottom',
              color: 'success'
            });
          } else if (!hintSuccess && playerRole === 'regular' && roleResponse.word) {
            presentToast({
              message: 'Could not get hint word. Please try again.',
              duration: 3000,
              position: 'bottom',
              color: 'warning'
            });
          }
        } else {
          console.error('Force refresh failed:', roleResponse.error);
          presentToast({
            message: 'Could not refresh game data: ' + (roleResponse.error || 'Unknown error'),
            duration: 3000,
            position: 'bottom',
            color: 'danger'
          });
        }
      });
    }
  };

  const startGame = () => {
    if (!isHost || players.length < minPlayersToStart) return;

    socket?.emit('start_game', gameId, (response: any) => {
      if (!response.success) {
        showError(response.error || 'Failed to start game');
      } else if (gameStatus !== 'playing') {
        setGameStatus('playing');
      }
    });
  };

  const leaveGame = () => {
    if (socket && playerId && gameId) {
      socket.emit('leave_game', gameId, playerId);
    }

    localStorage.removeItem(`spyapp_word_${gameId}`);
    localStorage.removeItem(`spyapp_hint_${gameId}`);

    socket?.disconnect();
    history.push('/home');
  };

  const endGame = () => {
    if (!isHost) return;

    socket?.emit('end_game', gameId, (response: any) => {
      if (!response.success) {
        showError(response.error || 'Failed to end game');
      }
    });
  };

  const startNewRound = () => {
    if (!isHost) return;

    socket?.emit('restart_game', gameId, (response: any) => {
      if (!response.success) {
        showError(response.error || 'Failed to restart game');
      }
    });
  };

  const showError = (message: string, callback?: () => void) => {
    if (message === 'Game not found') {
      setErrorAlert({
        show: true,
        header: 'Error',
        message,
        buttons: [
          {
            text: 'Back to Home',
            handler: () => {
              history.push('/home');
            }
          }
        ]
      });
    } else {
      setErrorAlert({
        show: true,
        header: 'Error',
        message,
        buttons: ['OK']
      });
    }

    if (callback) {
      setTimeout(callback, 2000);
    }
  };

  return (
    <IonPage>
      <IonHeader>
        <IonToolbar>
          <IonTitle>Game Room</IonTitle>
          <IonButtons slot="end">
            {isHost && gameStatus === 'playing' && <IonButton onClick={endGame}>End Game</IonButton>}
          </IonButtons>
        </IonToolbar>
      </IonHeader>
      <IonContent className="ion-padding">
        <div className="container">
          {loading && (
            <div className="loading-container">
              <IonSpinner name="crescent"></IonSpinner>
              <p>Loading game...</p>
            </div>
          )}

          {!loading && gameStatus === 'waiting' && (
            <IonCard>
              <IonCardHeader>
                <IonCardTitle>Waiting for Game to Start</IonCardTitle>
                <IonCardSubtitle>Game ID: {gameId}</IonCardSubtitle>
              </IonCardHeader>
              <IonCardContent>
                {isHost && spyCount && (
                  <div className="spy-count-info">
                    <IonList>
                      <IonListHeader>
                        <IonLabel>Game Settings</IonLabel>
                      </IonListHeader>
                      <IonItem>
                        <IonLabel>
                          Number of Spies: {spyCount} {spyCount === 1 ? 'Spy' : 'Spies'}
                        </IonLabel>
                      </IonItem>
                    </IonList>
                  </div>
                )}

                <IonList>
                  <IonListHeader>
                    <IonLabel>Players ({players.length})</IonLabel>
                  </IonListHeader>
                  {players.map((player) => (
                    <IonItem key={player.id}>
                      <IonLabel>{player.name}</IonLabel>
                      {player.id === hostId && <IonBadge color="success">Host</IonBadge>}
                      {player.id === playerId && <IonBadge color="primary">You</IonBadge>}
                    </IonItem>
                  ))}
                </IonList>

                {isHost && (
                  <div className="button-container">
                    <IonButton expand="block" onClick={startGame} disabled={players.length < minPlayersToStart}>
                      Start Game
                    </IonButton>
                    {players.length < minPlayersToStart && (
                      <IonNote>You need at least {minPlayersToStart} players to start the game</IonNote>
                    )}
                  </div>
                )}
              </IonCardContent>
            </IonCard>
          )}

          {!loading && gameStatus === 'playing' && (
            <IonCard>
              <IonCardHeader>
                <IonCardTitle>
                  {playerRole === 'spy' ? 'You are the Spy!' : 'You are NOT the Spy'}
                </IonCardTitle>
                {spyCount > 1 && (
                  <IonCardSubtitle>
                    There {spyCount === 1 ? 'is' : 'are'} {spyCount} {spyCount === 1 ? 'spy' : 'spies'} in this game
                  </IonCardSubtitle>
                )}
              </IonCardHeader>
              <IonCardContent>
                {playerRole === 'spy' ? (
                  <div className="spy-instructions">
                    <p>Try to figure out the secret word without revealing that you're the spy.</p>
                    <p>Listen carefully to other players' clues!</p>

                    <div className="hint-section">
                      <p>Hint word to help you guess:</p>
                      <div className="word-display hint-word">{hintWordDisplay}</div>

                      {!currentHintWord && (
                        <div className="word-retry">
                          <p className="error-text">Hint not loaded yet! Try to refresh.</p>
                          <IonButton size="small" onClick={forceRefreshWord}>
                            Refresh Hint
                          </IonButton>
                        </div>
                      )}
                    </div>
                  </div>
                ) : (
                  <div className="regular-player">
                    <p>The secret word is:</p>
                    <div className="word-display">{wordDisplay}</div>

                    {!wordDisplay && playerRole === 'regular' && (
                      <div className="word-retry">
                        <p className="error-text">Word not loaded yet! Try to refresh.</p>
                        <IonButton size="small" onClick={forceRefreshWord}>
                          Refresh Word
                        </IonButton>
                      </div>
                    )}

                    {currentHintWord && (
                      <div className="hint-section">
                        <p>Hint word to help with discussion:</p>
                        <div className="word-display hint-word">{hintWordDisplay}</div>
                      </div>
                    )}

                    <p>Give subtle clues about the word without making it too obvious for the spy.</p>
                  </div>
                )}

                <IonList>
                  <IonListHeader>
                    <IonLabel>Players</IonLabel>
                  </IonListHeader>
                  {players.map((player) => (
                    <IonItem key={player.id}>
                      <IonLabel>{player.name}</IonLabel>
                      {player.id === hostId && <IonBadge color="success">Host</IonBadge>}
                      {player.id === playerId && <IonBadge color="primary">You</IonBadge>}
                    </IonItem>
                  ))}
                </IonList>
              </IonCardContent>
            </IonCard>
          )}

          {!loading && gameStatus === 'finished' && (
            <IonCard>
              <IonCardHeader>
                <IonCardTitle>Game Over</IonCardTitle>
              </IonCardHeader>
              <IonCardContent>
                <p>
                  The secret word was: <strong>{currentWord}</strong>
                </p>
                {currentHintWord && (
                  <p>
                    The hint word was: <strong>{currentHintWord}</strong>
                  </p>
                )}

                <IonList>
                  <IonListHeader>
                    <IonLabel>Players</IonLabel>
                  </IonListHeader>
                  {playersWithRoles.map((player) => (
                    <IonItem key={player.id}>
                      <IonLabel>{player.name}</IonLabel>
                      {player.role === 'spy' ? (
                        <IonBadge color="danger">Spy</IonBadge>
                      ) : (
                        <IonBadge color="success">Regular</IonBadge>
                      )}
                    </IonItem>
                  ))}
                </IonList>

                <div className="button-container">
                  {isHost && (
                    <IonButton expand="block" onClick={startNewRound} color="success" className="mb-2">
                      Start New Round
                    </IonButton>
                  )}
                  <IonButton expand="block" onClick={leaveGame}>
                    Back to Home
                  </IonButton>
                </div>
              </IonCardContent>
            </IonCard>
          )}

          <IonAlert
            isOpen={errorAlert.show}
            header={errorAlert.header}
            message={errorAlert.message}
            buttons={errorAlert.buttons}
            onDidDismiss={() => setErrorAlert({ ...errorAlert, show: false })}
          ></IonAlert>
        </div>
      </IonContent>
    </IonPage>
  );
};

export default GameRoom;
