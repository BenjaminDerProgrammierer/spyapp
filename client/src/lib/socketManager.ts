import { Socket, io } from 'socket.io-client';
import { getUserId } from './userId';

// Socket instance
let socket: Socket | null = null;

/**
 * Initialize the socket connection and register the user
 * @param playerName The name of the player
 * @returns Promise that resolves with the socket and playerId
 */
export const initializeSocket = async (playerName: string): Promise<{ socket: Socket; playerId: string }> => {
  // If socket already exists and is connected, use it
  if (socket?.connected) {
    console.log('Using existing socket connection');
    const userId = getUserId();
    return new Promise((resolve, reject) => {
      socket!.emit('join_as_player', playerName, userId, (response: any) => {
        if (!response.success) {
          console.error('Failed to join as player with existing socket:', response.error);
          reject(new Error(response.error ?? 'Failed to join as player'));
          return;
        }
        console.log('Successfully joined as player with existing socket:', response.playerId);
        resolve({ socket: socket!, playerId: response.playerId });
      });
    });
  }

  // Disconnect the old socket if it exists but is not connected
  if (socket && !socket.connected) {
    console.log('Disconnecting old socket');
    socket.disconnect();
    socket = null;
  }

  // Create new socket connection with more robust options
  console.log('Creating new socket connection');
  const socketUrl = import.meta.env.VITE_SOCKET_URL || '';
  socket = io(socketUrl, {
    reconnectionAttempts: 5,
    reconnectionDelay: 1000,
    timeout: 10000,
    transports: ['websocket', 'polling']
  });
  
  // Add event listeners for connection status
  socket.on('connect', () => {
    console.log('Socket connected:', socket?.id);
  });
  
  socket.on('connect_error', (error: any) => {
    console.error('Socket connection error:', error.message);
  });
  
  // Get userId from localStorage or create a new one
  const userId = getUserId();
  console.log('Using user ID for socket connection:', userId);
  
  // Register the player with the socket server
  return new Promise((resolve, reject) => {
    // Add timeout for the operation
    const timeout = setTimeout(() => {
      reject(new Error('Timeout while connecting to server'));
    }, 10000);
    
    socket!.emit('join_as_player', playerName, userId, (response: any) => {
      clearTimeout(timeout);
      
      if (!response.success) {
        console.error('Failed to join as player with new socket:', response.error);
        reject(new Error(response.error ?? 'Failed to join as player'));
        return;
      }
      
      console.log('Successfully joined as player with new socket:', response.playerId);
      resolve({ socket: socket!, playerId: response.playerId });
    });
  });
};

/**
 * Disconnect the socket
 */
export const disconnectSocket = (): void => {
  if (socket) {
    console.log('Disconnecting socket');
    socket.disconnect();
    socket = null;
  }
};

/**
 * Get the current socket instance
 * @returns The socket instance or null if not connected
 */
export const getSocket = (): Socket | null => {
  return socket;
};

/**
 * Check if the socket is connected
 * @returns True if the socket is connected, false otherwise
 */
export const isSocketConnected = (): boolean => {
  return socket?.connected ?? false;
};
