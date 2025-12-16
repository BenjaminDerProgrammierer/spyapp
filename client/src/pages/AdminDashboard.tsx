import { useState, useEffect, useRef } from 'react';
import { useHistory } from 'react-router-dom';
import axios from 'axios';
import { io, Socket } from 'socket.io-client';
import {
  IonButton,
  IonButtons,
  IonCard,
  IonCardContent,
  IonCardHeader,
  IonCardSubtitle,
  IonCardTitle,
  IonCheckbox,
  IonContent,
  IonHeader,
  IonInput,
  IonItem,
  IonItemSliding,
  IonLabel,
  IonList,
  IonPage,
  IonSearchbar,
  IonSegment,
  IonSegmentButton,
  IonSpinner,
  IonText,
  IonTitle,
  IonToast,
  IonToolbar
} from '@ionic/react';
import './AdminDashboard.css';

interface GameSettings {
  showHintsToRegularUsers: boolean;
  adminPassword: string;
  minPlayersToStart: number;
}

interface Word {
  word: string;
  hints: string[];
}

const AdminDashboard: React.FC = () => {
  const history = useHistory();
  const [socket, setSocket] = useState<Socket | null>(null);
  const [activeSegment, setActiveSegment] = useState('settings');
  const [settings, setSettings] = useState<GameSettings>({
    showHintsToRegularUsers: false,
    adminPassword: '',
    minPlayersToStart: 3
  });
  const [wordList, setWordList] = useState<Word[]>([]);
  const [filteredWords, setFilteredWords] = useState<Word[]>([]);
  const [wordSearch, setWordSearch] = useState('');
  const [selectedFile, setSelectedFile] = useState<File | null>(null);

  const [savingSettings, setSavingSettings] = useState(false);
  const [refreshingSettings, setRefreshingSettings] = useState(false);
  const [uploadingWordlist, setUploadingWordlist] = useState(false);
  const [wordlistError, setWordlistError] = useState('');
  const [wordlistSuccess, setWordlistSuccess] = useState('');

  const [toastOpen, setToastOpen] = useState(false);
  const [toastMessage, setToastMessage] = useState('');
  const [toastColor, setToastColor] = useState('success');

  const fileInputRef = useRef<HTMLInputElement>(null);

  const checkAuth = () => {
    const token = localStorage.getItem('adminToken');
    if (!token) {
      history.replace('/admin/login');
    }
    return token;
  };

  useEffect(() => {
    if (!checkAuth()) return;

    loadSettings();
    loadWordList();
    initSocket();
  }, []);

  useEffect(() => {
    if (activeSegment === 'wordlist') {
      loadWordList();
    }
  }, [activeSegment]);

  const loadSettings = async () => {
    const token = checkAuth();
    if (!token) return;

    try {
      const baseUrl = '/api';
      const response = await axios.get(`${baseUrl}/game/admin/settings`, {
        headers: {
          Authorization: `Bearer ${token}`
        }
      });

      if (response.data.success) {
        setSettings({
          ...settings,
          ...response.data.settings,
          adminPassword: ''
        });
      }
    } catch (err) {
      console.error('Error loading settings:', err);
      showToast('Failed to load settings', 'danger');
    }
  };

  const loadWordList = async () => {
    const token = checkAuth();
    if (!token) return;

    try {
      const baseUrl = '/api';
      const response = await axios.get(`${baseUrl}/game/admin/wordlist`, {
        headers: {
          Authorization: `Bearer ${token}`
        }
      });

      if (response.data.success) {
        setWordList(response.data.words);
        setFilteredWords(response.data.words);
      }
    } catch (err) {
      console.error('Error loading wordlist:', err);
      showToast('Failed to load wordlist', 'danger');
    }
  };

  const filterWords = () => {
    if (!wordSearch) {
      setFilteredWords([...wordList]);
      return;
    }

    const search = wordSearch.toLowerCase();
    setFilteredWords(
      wordList.filter(
        (word) =>
          word.word.toLowerCase().includes(search) || word.hints.some((hint) => hint.toLowerCase().includes(search))
      )
    );
  };

  useEffect(() => {
    filterWords();
  }, [wordSearch]);

  const saveSettings = async (e: React.FormEvent) => {
    e.preventDefault();
    const token = checkAuth();
    if (!token) return;

    setSavingSettings(true);

    console.log('Saving settings:', {
      showHintsToRegularUsers: Boolean(settings.showHintsToRegularUsers),
      minPlayersToStart: settings.minPlayersToStart,
      hasPassword: Boolean(settings.adminPassword?.trim())
    });

    try {
      const baseUrl = '/api';
      const response = await axios.put(
        `${baseUrl}/game/admin/settings`,
        {
          showHintsToRegularUsers: Boolean(settings.showHintsToRegularUsers),
          minPlayersToStart: Number(settings.minPlayersToStart),
          adminPassword: settings.adminPassword.trim() || undefined
        },
        {
          headers: {
            Authorization: `Bearer ${token}`
          }
        }
      );

      if (response.data.success) {
        showToast('Settings saved successfully', 'success');

        if (settings.adminPassword.trim()) {
          localStorage.setItem('adminToken', settings.adminPassword.trim());
        }

        setSettings({ ...settings, adminPassword: '' });
      } else {
        showToast('Failed to save settings', 'danger');
      }
    } catch (err) {
      console.error('Error saving settings:', err);
      showToast('Error saving settings', 'danger');
    } finally {
      setSavingSettings(false);
    }
  };

  const handleFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    if (event.target.files && event.target.files.length > 0) {
      setSelectedFile(event.target.files[0]);
      setWordlistError('');
      setWordlistSuccess('');
    }
  };

  const uploadWordlist = async () => {
    if (!selectedFile) return;

    const token = checkAuth();
    if (!token) return;

    setUploadingWordlist(true);
    setWordlistError('');
    setWordlistSuccess('');

    const formData = new FormData();
    formData.append('file', selectedFile);

    try {
      const baseUrl = '/api';
      const response = await axios.post(`${baseUrl}/game/admin/wordlist/upload`, formData, {
        headers: {
          'Content-Type': 'multipart/form-data',
          Authorization: `Bearer ${token}`
        }
      });

      if (response.data.success) {
        setWordlistSuccess(response.data.message || 'Wordlist uploaded successfully');
        showToast('Wordlist uploaded successfully', 'success');

        if (fileInputRef.current) {
          fileInputRef.current.value = '';
        }
        setSelectedFile(null);

        await loadWordList();
      } else {
        setWordlistError(response.data.error || 'Failed to upload wordlist');
      }
    } catch (err: any) {
      console.error('Error uploading wordlist:', err);
      setWordlistError(err.response?.data?.error || 'Error uploading wordlist');
      showToast('Error uploading wordlist', 'danger');
    } finally {
      setUploadingWordlist(false);
    }
  };

  const showToast = (message: string, color: string = 'success') => {
    setToastMessage(message);
    setToastColor(color);
    setToastOpen(true);
  };

  const logout = () => {
    localStorage.removeItem('adminToken');
    history.replace('/home');
  };

  const initSocket = () => {
    const baseUrl = import.meta.env.VITE_SOCKET_URL || '';
    const newSocket = io(baseUrl);
    setSocket(newSocket);

    const playerName = localStorage.getItem('playerName') || 'Admin';
    newSocket.emit('join_as_player', playerName, null, (response: any) => {
      if (response.success) {
        console.log('Connected to socket server as admin');
      } else {
        console.error('Failed to join as admin');
      }
    });
  };

  const refreshActiveGames = () => {
    if (!socket) {
      initSocket();
      setTimeout(refreshActiveGames, 1000);
      return;
    }

    setRefreshingSettings(true);

    socket.emit('refresh_game_settings', (response: any) => {
      setRefreshingSettings(false);

      if (response.success) {
        showToast('Game settings refreshed: ' + response.message, 'success');
      } else {
        showToast('Failed to refresh game settings', 'danger');
      }
    });
  };

  return (
    <IonPage>
      <IonHeader>
        <IonToolbar>
          <IonTitle>Admin Dashboard</IonTitle>
          <IonButtons slot="end">
            <IonButton onClick={logout}>Logout</IonButton>
          </IonButtons>
        </IonToolbar>
      </IonHeader>
      <IonContent className="ion-padding">
        <div className="container">
          <IonSegment value={activeSegment} onIonChange={(e) => setActiveSegment(e.detail.value as string)}>
            <IonSegmentButton value="settings">
              <IonLabel>Game Settings</IonLabel>
            </IonSegmentButton>
            <IonSegmentButton value="wordlist">
              <IonLabel>Word List</IonLabel>
            </IonSegmentButton>
          </IonSegment>

          <div className="segment-content">
            {activeSegment === 'settings' && (
              <div>
                <IonCard>
                  <IonCardHeader>
                    <IonCardTitle>Game Settings</IonCardTitle>
                  </IonCardHeader>
                  <IonCardContent>
                    <form onSubmit={saveSettings}>
                      <IonList>
                        <IonItem>
                          <IonCheckbox
                            checked={settings.showHintsToRegularUsers}
                            onIonChange={(e) =>
                              setSettings({ ...settings, showHintsToRegularUsers: e.detail.checked })
                            }
                            labelPlacement="end"
                          >
                            Show hints to regular players
                          </IonCheckbox>
                        </IonItem>

                        <IonItem>
                          <IonLabel position="floating">Minimum players to start</IonLabel>
                          <IonInput
                            value={settings.minPlayersToStart}
                            onIonInput={(e) =>
                              setSettings({ ...settings, minPlayersToStart: parseInt(e.detail.value!, 10) })
                            }
                            type="number"
                            min="2"
                            max="20"
                          ></IonInput>
                        </IonItem>

                        <IonItem>
                          <IonLabel position="floating">Admin Password</IonLabel>
                          <IonInput
                            value={settings.adminPassword}
                            onIonInput={(e) => setSettings({ ...settings, adminPassword: e.detail.value! })}
                            type="password"
                            placeholder="Leave empty to keep current password"
                          ></IonInput>
                        </IonItem>
                      </IonList>

                      <div className="button-container">
                        <IonButton expand="block" type="submit" disabled={savingSettings}>
                          {savingSettings && <IonSpinner name="crescent" slot="start"></IonSpinner>}
                          Save Settings
                        </IonButton>

                        <IonButton
                          expand="block"
                          color="tertiary"
                          onClick={refreshActiveGames}
                          disabled={refreshingSettings}
                          className="mt-2"
                        >
                          {refreshingSettings && <IonSpinner name="crescent" slot="start"></IonSpinner>}
                          Refresh Settings in Active Games
                        </IonButton>
                      </div>
                    </form>
                  </IonCardContent>
                </IonCard>
              </div>
            )}

            {activeSegment === 'wordlist' && (
              <div>
                <IonCard>
                  <IonCardHeader>
                    <IonCardTitle>Word List Management</IonCardTitle>
                    <IonCardSubtitle>Upload a new wordlist file</IonCardSubtitle>
                  </IonCardHeader>
                  <IonCardContent>
                    <p>Current wordlist contains {wordList.length} words.</p>

                    <IonItem>
                      <IonLabel position="stacked">Upload new wordlist (JSON format)</IonLabel>
                      <input ref={fileInputRef} type="file" accept=".json" onChange={handleFileChange} />
                    </IonItem>

                    <div className="wordlist-format">
                      <h4>Required format:</h4>
                      <pre>
                        {`{
  "words": [
    {
      "word": "example",
      "hints": ["clue1", "clue2", "clue3"]
    },
    ...
  ]
}`}
                      </pre>
                    </div>

                    <div className="button-container">
                      <IonButton expand="block" onClick={uploadWordlist} disabled={!selectedFile || uploadingWordlist}>
                        {uploadingWordlist && <IonSpinner name="crescent" slot="start"></IonSpinner>}
                        Upload Wordlist
                      </IonButton>
                    </div>

                    {wordlistError && (
                      <IonText color="danger">
                        <p>{wordlistError}</p>
                      </IonText>
                    )}

                    {wordlistSuccess && (
                      <IonText color="success">
                        <p>{wordlistSuccess}</p>
                      </IonText>
                    )}
                  </IonCardContent>
                </IonCard>

                <IonCard>
                  <IonCardHeader>
                    <IonCardTitle>Current Words</IonCardTitle>
                  </IonCardHeader>
                  <IonCardContent>
                    <IonSearchbar
                      value={wordSearch}
                      onIonInput={(e) => setWordSearch(e.detail.value!)}
                      placeholder="Search words"
                    ></IonSearchbar>

                    <IonList className={'list'}>
                      {filteredWords.map((word, index) => (
                        <IonItemSliding key={index}>
                          <IonItem>
                            <IonLabel>
                              <h2>{word.word}</h2>
                              <p>{word.hints.join(', ')}</p>
                            </IonLabel>
                          </IonItem>
                        </IonItemSliding>
                      ))}
                    </IonList>

                    {filteredWords.length === 0 && (
                      <div className="no-words">
                        <p>No words found matching "{wordSearch}"</p>
                      </div>
                    )}
                  </IonCardContent>
                </IonCard>
              </div>
            )}
          </div>

          <IonToast
            isOpen={toastOpen}
            message={toastMessage}
            color={toastColor}
            duration={3000}
            onDidDismiss={() => setToastOpen(false)}
          ></IonToast>
        </div>
      </IonContent>
    </IonPage>
  );
};

export default AdminDashboard;
