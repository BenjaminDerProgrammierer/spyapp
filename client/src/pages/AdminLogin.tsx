import { useState } from 'react';
import { useHistory } from 'react-router-dom';
import axios from 'axios';
import {
  IonBackButton,
  IonButton,
  IonButtons,
  IonCard,
  IonCardContent,
  IonCardHeader,
  IonCardSubtitle,
  IonCardTitle,
  IonContent,
  IonHeader,
  IonInput,
  IonItem,
  IonLabel,
  IonList,
  IonPage,
  IonSpinner,
  IonText,
  IonTitle,
  IonToolbar
} from '@ionic/react';
import './AdminLogin.css';

const AdminLogin: React.FC = () => {
  const history = useHistory();
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const verifyPassword = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!password.trim()) {
      setError('Password is required');
      return;
    }

    setLoading(true);
    setError('');

    try {
      const baseUrl = '/api';
      const response = await axios.post(`${baseUrl}/game/admin/verify`, {
        password: password
      });

      if (response.data.success && response.data.isValid) {
        localStorage.setItem('adminToken', password);
        history.push('/admin/dashboard');
      } else {
        setError('Invalid password');
      }
    } catch (err) {
      console.error('Error verifying password:', err);
      setError('Failed to verify password');
    } finally {
      setLoading(false);
    }
  };

  return (
    <IonPage>
      <IonHeader>
        <IonToolbar>
          <IonButtons slot="start">
            <IonBackButton defaultHref="/home"></IonBackButton>
          </IonButtons>
          <IonTitle>Admin Login</IonTitle>
        </IonToolbar>
      </IonHeader>
      <IonContent className="ion-padding">
        <div className="container">
          <IonCard>
            <IonCardHeader>
              <IonCardTitle>Admin Login</IonCardTitle>
              <IonCardSubtitle>Enter password to access admin dashboard</IonCardSubtitle>
            </IonCardHeader>
            <IonCardContent>
              <form onSubmit={verifyPassword}>
                <IonList>
                  <IonItem>
                    <IonLabel position="floating">Admin Password</IonLabel>
                    <IonInput
                      value={password}
                      onIonInput={(e) => setPassword(e.detail.value!)}
                      type="password"
                      required
                    ></IonInput>
                  </IonItem>
                </IonList>

                <div className="button-container">
                  <IonButton expand="block" type="submit" disabled={loading}>
                    {loading ? <IonSpinner name="crescent"></IonSpinner> : <span>Login</span>}
                  </IonButton>
                </div>

                {error && (
                  <IonText color="danger">
                    <p>{error}</p>
                  </IonText>
                )}
              </form>
            </IonCardContent>
          </IonCard>
        </div>
      </IonContent>
    </IonPage>
  );
};

export default AdminLogin;
