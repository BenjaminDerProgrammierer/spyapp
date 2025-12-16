import { useState, useEffect } from 'react';
import { useHistory } from 'react-router-dom';
import {
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
  IonPage,
  IonTitle,
  IonToolbar,
  useIonAlert
} from '@ionic/react';
import { settingsOutline } from 'ionicons/icons';
import './HomePage.css';

const HomePage: React.FC = () => {
  const history = useHistory();
  const [presentAlert] = useIonAlert();
  const [playerName, setPlayerName] = useState('');

  // Initialize playerName from localStorage if available
  useEffect(() => {
    const savedName = localStorage.getItem('playerName');
    if (savedName) {
      setPlayerName(savedName);
    }
  }, []);

  const hostGame = () => {
    if (!playerName.trim()) {
      presentAlert({
        header: 'Alert',
        message: 'Please enter your name',
        buttons: ['OK']
      });
      return;
    }

    // Store player name in localStorage
    localStorage.setItem('playerName', playerName);
    history.push('/host');
  };

  const joinGame = () => {
    if (!playerName.trim()) {
      presentAlert({
        header: 'Alert',
        message: 'Please enter your name',
        buttons: ['OK']
      });
      return;
    }

    // Store player name in localStorage
    localStorage.setItem('playerName', playerName);
    history.push('/join');
  };

  const goToAdmin = () => {
    // If already authenticated, go directly to dashboard
    if (localStorage.getItem('adminToken')) {
      history.push('/admin/dashboard');
    } else {
      history.push('/admin/login');
    }
  };

  return (
    <IonPage>
      <IonHeader>
        <IonToolbar>
          <IonTitle>SpyApp Game</IonTitle>
          <IonButtons slot="end">
            <IonButton onClick={goToAdmin}>
              <IonIcon icon={settingsOutline}></IonIcon>
            </IonButton>
          </IonButtons>
        </IonToolbar>
      </IonHeader>
      <IonContent className="ion-padding">
        <div className="container">
          <IonCard>
            <IonCardHeader>
              <IonCardTitle className="ion-text-center">Welcome to SpyApp!</IonCardTitle>
            </IonCardHeader>
            <IonCardContent>
              <p className="ion-text-center">
                A multiplayer word guessing game where one player is the spy.
              </p>

              <IonItem>
                <IonLabel position="floating">Your Name</IonLabel>
                <IonInput
                  value={playerName}
                  onIonInput={(e) => setPlayerName(e.detail.value!)}
                  required
                ></IonInput>
              </IonItem>

              <div className="button-container">
                <IonButton expand="block" onClick={hostGame} disabled={!playerName}>
                  Host Game
                </IonButton>
                <IonButton expand="block" onClick={joinGame} disabled={!playerName}>
                  Join Game
                </IonButton>
              </div>
            </IonCardContent>
          </IonCard>
        </div>
      </IonContent>
    </IonPage>
  );
};

export default HomePage;
