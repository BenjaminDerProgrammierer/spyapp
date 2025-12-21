import { Server, Socket } from 'socket.io';
import { v4 as uuidv4 } from 'uuid';

import type { Game, Player } from '../index.js'
import { query } from './db.js';
import { getGameSettings } from './settingsUtils.js';
import { getRandomWord, getRandomHintForWord } from './wordUtils.js';

// In-memory storage for active games and players
const games = new Map<string, Game>();
const players = new Map<string, Player>();

// Reference to socket.io server instance
let io: Server;

// Helper function to remove a player from a game
async function removePlayerFromGame(playerId: string) {
  const player = players.get(playerId);
  if (player?.gameId && games.has(player.gameId)) {
    const game = games.get(player.gameId)!;

    // Remove player from game
    game.players = game.players.filter(p => p.id !== playerId);

    // Remove from the database
    try {
      await query('DELETE FROM players WHERE id = $1', [playerId]);
    } catch (error) {
      console.error('Error removing player from database:', error);
    }

    // Notify other players in the game
    if (game.status !== 'finished') {
      if (game.hostId === playerId) {
        // If the host leaves, end the game
        game.status = 'finished';

        // Update game status in database
        try {
          await query('UPDATE games SET status = $1 WHERE id = $2', ['finished', player.gameId]);
        } catch (error) {
          console.error('Error updating game status:', error);
        }

        // Notify all players
        io.to(player.gameId).emit('host_left', {
          status: 'finished',
          message: 'Host left the game'
        });
      } else {
        // Notify others that player left
        io.to(player.gameId).emit('player_left', {
          playerId,
          players: game.players.map(p => ({ id: p.id, name: p.name }))
        });
      }
    }

    // If game is empty, remove it
    if (game.players.length === 0) {
      games.delete(player.gameId);

      try {
        await query('DELETE FROM games WHERE id = $1', [player.gameId]);
      } catch (error) {
        console.error('Error removing empty game from database:', error);
      }
    }

    // Clear the player's game reference
    player.gameId = undefined;
    player.role = undefined;
  }
};

// Helper function to safely add a player to the database
async function createPlayerInDb(player: Player, gameId: string, role: 'spy' | 'regular' = 'regular'): Promise<boolean> {
  try {
    console.log(`Creating/updating player ${player.id} in database for game ${gameId} with role ${role}`);

    // First try to delete any existing record
    await query('DELETE FROM players WHERE id = $1', [player.id]);

    // Then insert the new record
    await query(
      'INSERT INTO players (id, game_id, name, role) VALUES ($1, $2, $3, $4)',
      [player.id, gameId, player.name, role]
    );

    return true;
  } catch (error) {
    console.error(`Error creating player ${player.id} in database:`, error);
    return false;
  }
};

// Helper function to send role to a player
async function sendRoleToPlayer(player: Player, gameWord: string | null, hintWord: string | null = null) {
  // Get current game settings
  const settings = await getGameSettings();

  // Add more detailed debugging for socket lookup
  const allSockets = Array.from(io.sockets.sockets.values());
  console.log(`Looking for socket for player ${player.id}. Total sockets: ${allSockets.length}`);

  // Debug socket IDs and their associated player IDs
  allSockets.forEach(s => {
    console.log(`Socket ${s.id} has playerId: ${s.data.playerId}`);
  });

  // Log the current settings status for debugging
  console.log(`Current hint settings - showHintsToRegularUsers: ${settings.showHintsToRegularUsers}`);

  const playerSocket = allSockets.find(s => s.data.playerId === player.id);

  if (!playerSocket) {
    console.error(`No socket found for player ${player.id} to send role information. Will try to send to room instead.`);

    // As a fallback, try to send to the game room for this specific player's ID
    // This might reach more clients than intended but at least ensures message delivery
    const gameId = player.gameId;
    if (gameId) {
      console.log(`Sending role to game room ${gameId} for player ${player.id} as fallback`);
      // Determine if we should send the hint word based on role and settings
      let hintWordToSend = null;
      if (player.role === 'spy' || settings.showHintsToRegularUsers === true) {
        hintWordToSend = hintWord ? String(hintWord).trim() : null;
        console.log(`Sending hint word to ${player.role} player: ${hintWordToSend}`);
      } else {
        console.log(`NOT sending hint word to ${player.role} player due to settings`);
      }

      io.to(gameId).emit('player_role_update', {
        playerId: player.id,
        role: player.role,
        word: player.role === 'regular' ? String(gameWord ?? '').trim() : null,
        hintWord: hintWordToSend
      });
    }
    return;
  }

  // Ensure the word is properly formatted for regular players
  const wordToSend = player.role === 'regular' ? String(gameWord ?? '').trim() : null;

  // Only send hint to regular users if the setting allows it, always send to spy
  let hintWordToSend = null;
  if (player.role === 'spy' || settings.showHintsToRegularUsers === true) {
    hintWordToSend = hintWord ? String(hintWord).trim() : null;
    console.log(`Sending hint word to player ${player.id} (${player.role}): ${hintWordToSend}`);
  } else {
    console.log(`NOT sending hint word to player ${player.id} (${player.role}) due to settings`);
  }

  console.log(`Sending role to ${player.id} (socket ${playerSocket.id}): ${player.role}, word: ${wordToSend ?? 'null'}, hint: ${hintWordToSend ?? 'null'}`);

  // Send directly to this player's socket
  playerSocket.emit('role_assigned', {
    role: player.role,
    word: wordToSend,
    hintWord: hintWordToSend
  });
};

export async function setupSocketHandlers(_io: Server) {
  io = _io;

  // clear games
  try {
    await query('DELETE FROM players', []);
    await query('DELETE FROM games', []);

    // Clear in-memory maps
    games.clear();
    players.clear();

    console.log('Games cleared');
  } catch (error) {
    console.error('Error clearing games on startup:', error);
  }

  io.on('connection', (socket: Socket) => {
    console.log('New client connected:', socket.id);

    // Player joins with a name and optional existing userId
    socket.on('join_as_player', async (playerName: string, existingUserId: string | null, callback) => {
      try {
        // Validate input
        if (!playerName || typeof playerName !== 'string' || playerName.trim().length === 0) {
          callback({ success: false, error: 'Valid player name is required' });
          return;
        }

        // Sanitize player name
        const sanitizedPlayerName = playerName.trim().substring(0, 50); // Limit to 50 characters

        // Use the existing user ID if provided and valid, otherwise generate a new one
        const playerId = (existingUserId && typeof existingUserId === 'string') ? existingUserId : uuidv4();

        // If player already exists with this ID, update their socket connection
        if (players.has(playerId)) {
          const existingPlayer = players.get(playerId)!;
          existingPlayer.name = sanitizedPlayerName; // Update name in case it changed
          socket.data.playerId = playerId;
          callback({ success: true, playerId });
          return;
        }

        // Create a new player
        const player: Player = { id: playerId, name: sanitizedPlayerName };
        players.set(playerId, player);

        socket.data.playerId = playerId;
        callback({ success: true, playerId });
      } catch (error) {
        console.error('Error joining as player:', error);
        callback({ success: false, error: 'Failed to join as player' });
      }
    });

    // Host creates a new game
    socket.on('create_game', async (spyCount: number, callback) => {
      try {
        const playerId = socket.data.playerId;
        if (!playerId || !players.has(playerId)) {
          callback({ success: false, error: 'Player not registered' });
          return;
        }

        const player = players.get(playerId)!;

        // Validate and set default spy count
        const validSpyCount = (spyCount && spyCount >= 1 && spyCount <= 5) ? Math.floor(spyCount) : 1;

        // Check if player is already in another game and remove them
        if (player.gameId) {
          console.log(`Player ${playerId} creating a new game - removing from existing game ${player.gameId}`);
          await removePlayerFromGame(playerId);
        }

        const gameId = uuidv4();

        // Create game in database
        await query(
          'INSERT INTO games (id, host_id, status) VALUES ($1, $2, $3)',
          [gameId, playerId, 'waiting']
        );

        // Update player with game information using the safe helper
        const playerDbSuccess = await createPlayerInDb(player, gameId);
        if (!playerDbSuccess) {
          // If we failed to create the player, try to clean up the game
          await query('DELETE FROM games WHERE id = $1', [gameId]);
          callback({ success: false, error: 'Failed to register player in database' });
          return;
        }

        player.gameId = gameId;

        // Create game in memory
        const game: Game = {
          id: gameId,
          hostId: playerId,
          players: [player],
          status: 'waiting',
          spyCount: validSpyCount
        };

        games.set(gameId, game);

        // Join socket to game room
        socket.join(gameId);

        // Get settings to include minimum player count
        const settings = await getGameSettings();

        callback({
          success: true,
          gameId,
          spyCount: validSpyCount,
          minPlayersToStart: settings.minPlayersToStart || 3
        });
      } catch (error) {
        console.error('Error creating game:', error);
        callback({ success: false, error: 'Failed to create game' });
      }
    });

    // Player joins an existing game
    socket.on('join_game', async (gameId: string, callback) => {
      try {
        const playerId = socket.data.playerId;
        if (!playerId || !players.has(playerId)) {
          return callback({ success: false, error: 'Player not registered' });
        }

        if (!games.has(gameId)) {
          return callback({ success: false, error: 'Game not found' });
        }

        const game = games.get(gameId)!;
        const player = players.get(playerId)!;
        // Check if player is already in the game
        const playerAlreadyInGame = game.players.some(p => p.id === playerId);
        if (playerAlreadyInGame) {
          console.log(`Player ${playerId} already in game ${gameId}, just reconnecting`);
          // Player is already in the game, just reconnect them
          socket.join(gameId);

          // If game is already playing, remind the client of their role
          if (game.status === 'playing') {
            const playerInGame = game.players.find(p => p.id === playerId);
            if (playerInGame?.role) {
              setTimeout(() => {
                // Use our helper function to send role information - convert undefined to null
                sendRoleToPlayer(playerInGame, game.word ?? null, game.hintWord ?? null);
              }, 500); // Short delay to ensure client is ready
            }
          }

          return callback({
            success: true,
            game: {
              id: game.id,
              players: game.players.map(p => ({ id: p.id, name: p.name })),
              hostId: game.hostId,
              status: game.status
            },
            reconnected: true
          });
        }

        // If the game has already started and the player is not already in it, they can't join
        if (game.status !== 'waiting') {
          return callback({ success: false, error: 'Game already started' });
        }

        // Check if player is already in another game and remove them
        if (player.gameId && player.gameId !== gameId) {
          console.log(`Player ${playerId} joining game ${gameId} - removing from existing game ${player.gameId}`);
          await removePlayerFromGame(playerId);
        }

        player.gameId = gameId;

        // Add player to database using the safe helper function
        const playerDbSuccess = await createPlayerInDb(player, gameId);
        if (!playerDbSuccess) {
          console.error(`Failed to add player ${playerId} to game ${gameId} in database`);
          return callback({ success: false, error: 'Database error joining game' });
        }

        // Add player to game
        game.players.push(player);
        // Join socket to game room
        socket.join(gameId);

        // Get settings to include minimum player count
        const settings = await getGameSettings();

        // Notify other players
        io.to(gameId).emit('player_joined', {
          players: game.players.map(p => ({ id: p.id, name: p.name }))
        });

        callback({
          success: true,
          game: {
            id: game.id,
            players: game.players.map(p => ({ id: p.id, name: p.name })),
            hostId: game.hostId,
            status: game.status,
            spyCount: game.spyCount ?? 1,
            minPlayersToStart: settings.minPlayersToStart || 3
          }
        });
      } catch (error) {
        console.error('Error joining game:', error);
        callback({ success: false, error: 'Failed to join game' });
      }
    });

    // Host starts the game
    socket.on('start_game', async (gameId: string, callback) => {
      try {
        const playerId = socket.data.playerId;
        if (!playerId) {
          return callback({ success: false, error: 'Player not registered' });
        }

        if (!games.has(gameId)) {
          return callback({ success: false, error: 'Game not found' });
        }

        const game = games.get(gameId)!;

        if (game.hostId !== playerId) {
          return callback({ success: false, error: 'Only the host can start the game' });
        }

        // Check if the game is already started - if it is, just return success
        // This prevents "Game already started" errors on reconnections
        if (game.status === 'playing') {
          console.log(`Game ${gameId} already started, returning success to prevent error`);
          return callback({ success: true });
        }

        // Get minimum player count from settings
        const settings = await getGameSettings();
        const minPlayersToStart = settings.minPlayersToStart || 3;

        if (game.players.length < minPlayersToStart) {
          return callback({ success: false, error: `Need at least ${minPlayersToStart} players to start` });
        }

        // Get a random word with hints from our JSON wordlist
        const randomWordData = getRandomWord();

        if (!randomWordData) {
          console.error('No words found in wordlist');
          return callback({ success: false, error: 'No words available for the game' });
        }

        const word = randomWordData.word;

        if (!word || word.trim() === '') {
          console.error('Retrieved empty word from wordlist');
          return callback({ success: false, error: 'Invalid word retrieved from wordlist' });
        }

        // Select a random hint from the word's hint array
        // This automatically ensures the hint is related to the word
        const hints = randomWordData.hints;
        const randomHintIndex = Math.floor(Math.random() * hints.length);
        const hintWord = hints[randomHintIndex];

        console.log(`Starting game ${gameId} with word: ${word}, hint word: ${hintWord}`);
        game.word = word;
        game.hintWord = hintWord;

        // Determine number of spies for this game
        const spyCount = game.spyCount ?? 1;
        const totalPlayers = game.players.length;

        // Validate spy count doesn't exceed player count
        const actualSpyCount = Math.min(spyCount, Math.floor(totalPlayers / 2)); // Max 50% of players can be spies

        // Randomly assign players as spies
        const shuffledIndices = Array.from({ length: totalPlayers }, (_, i) => i);
        // Fisher-Yates shuffle
        for (let i = shuffledIndices.length - 1; i > 0; i--) {
          const j = Math.floor(Math.random() * (i + 1));
          [shuffledIndices[i], shuffledIndices[j]] = [shuffledIndices[j], shuffledIndices[i]];
        }

        // Assign roles
        game.players.forEach((player, index) => {
          player.role = shuffledIndices.slice(0, actualSpyCount).includes(index) ? 'spy' : 'regular';
        });

        console.log(`Game ${gameId}: Assigned ${actualSpyCount} spies out of ${totalPlayers} players`);

        // Update game status
        game.status = 'playing';
        await query(
          'UPDATE games SET status = $1, word = $2 WHERE id = $3',
          ['playing', word, gameId]
        );

        // Update player roles using our new helper function
        for (const player of game.players) {
          // Update player role in database
          await createPlayerInDb(player, gameId, player.role);
        }

        // Notify all players that the game has started
        io.to(gameId).emit('game_started', {
          status: 'playing'
        });

        // Add a small delay before sending role information
        // This ensures clients have processed the game_started event first
        setTimeout(async () => {
          // Send role information to each player privately using our helper
          console.log(`Sending role information to ${game.players.length} players after game start`);
          for (const player of game.players) {
            await sendRoleToPlayer(player, word ?? null, game.hintWord ?? null);
          }
        }, 500);

        callback({ success: true });
      } catch (error) {
        console.error('Error starting game:', error);
        callback({ success: false, error: 'Failed to start game' });
      }
    });

    // Helper function to validate role info request
    const validateRoleInfoRequest = (playerId: string | null): {
      valid: false;
      error: string;
    } | {
      valid: true;
      player: Player;
      game: Game;
      gamePlayer: Player;
    } => {
      if (!playerId || !players.has(playerId)) {
        return { valid: false, error: 'Player not registered' };
      }

      const player = players.get(playerId)!;
      if (!player.gameId || !games.has(player.gameId)) {
        return { valid: false, error: 'Player not in a game' };
      }

      const game = games.get(player.gameId)!;
      if (game.status !== 'playing') {
        return { valid: false, error: 'Game not in playing state' };
      }

      const gamePlayer = game.players.find(p => p.id === playerId);
      if (!gamePlayer?.role) {
        return { valid: false, error: 'Player role not found' };
      }

      return { valid: true, player, game, gamePlayer };
    };

    // Request role information (for players reconnecting to a started game)
    socket.on('request_role_info', async (callback) => {
      try {
        const playerId = socket.data.playerId;
        const validation = validateRoleInfoRequest(playerId);

        if (!validation.valid) {
          // TypeScript needs explicit type narrowing
          const error = (validation as { valid: false; error: string }).error;
          console.error(`Player ${playerId} role info request failed: ${error}`);
          return callback({ success: false, error });
        }

        const { player, game, gamePlayer } = validation;

        // Prepare word for regular players
        let wordToSend = null;
        if (gamePlayer.role === 'regular' && game.word) {
          wordToSend = String(game.word).trim();
          if (!wordToSend) {
            console.error(`Game ${player.gameId} has an empty word!`);
          }
        }

        // Get the hint word and determine if we should send it
        let hintWordToSend = null;
        const settings = await getGameSettings();

        if (game.hintWord) {
          const rawHintWord = String(game.hintWord).trim();

          // Only send hint to spies or regular users if the setting allows it
          if (gamePlayer.role === 'spy' || settings.showHintsToRegularUsers === true) {
            hintWordToSend = rawHintWord;
            console.log(`Sending hint word to ${gamePlayer.role} player: ${hintWordToSend}`);
          } else {
            console.log(`NOT sending hint word to ${gamePlayer.role} player due to settings`);
          }
        }

        // Regenerate hint word if missing (but still respect settings)
        if (!hintWordToSend && game.word && (gamePlayer.role === 'spy' || settings.showHintsToRegularUsers === true)) {
          console.log(`Missing hint word for game ${player.gameId}, trying to regenerate it`);
          const newHint = getRandomHintForWord(game.word);
          if (newHint) {
            game.hintWord = newHint;
            hintWordToSend = newHint;
            console.log(`Successfully regenerated hint word: ${newHint}`);
          }
        }

        console.log(`Sending role info to ${playerId}: ${gamePlayer.role}, word: ${wordToSend ?? 'null'}, hint: ${hintWordToSend ?? 'null'}`);

        if (gamePlayer.role === 'regular' && !wordToSend) {
          console.error(`ERROR: No word available to send to regular player ${playerId} in game ${player.gameId}`);
        }

        // Send role information
        callback({
          success: true,
          role: gamePlayer.role,
          word: wordToSend,
          hintWord: hintWordToSend
        });
      } catch (error) {
        console.error('Error requesting role info:', error);
        callback({ success: false, error: 'Failed to get role information' });
      }
    });

    // Add a dedicated handler for requesting just the word
    // Add this right after the request_role_info handler
    socket.on('request_word', (gameId: string, callback) => {
      try {
        const playerId = socket.data.playerId;
        if (!playerId || !players.has(playerId)) {
          console.error(`Player ${playerId} not registered when requesting word`);
          return callback({ success: false, error: 'Player not registered' });
        }

        const player = players.get(playerId)!;
        if (!player.gameId || player.gameId !== gameId) {
          console.error(`Player ${playerId} not in the requested game ${gameId} when requesting word`);
          return callback({ success: false, error: 'Player not in the specified game' });
        }

        if (!games.has(gameId)) {
          console.error(`Game ${gameId} not found when player ${playerId} requested word`);
          return callback({ success: false, error: 'Game not found' });
        }

        const game = games.get(gameId)!;
        if (game.status !== 'playing') {
          console.error(`Game ${gameId} not in playing state when player ${playerId} requested word`);
          return callback({ success: false, error: 'Game not in playing state' });
        }

        // Find the player's role in the game
        const gamePlayer = game.players.find(p => p.id === playerId);
        if (!gamePlayer?.role) {
          console.error(`Player ${playerId} role not found in game ${gameId}`);
          return callback({ success: false, error: 'Player role not found' });
        }

        // Only send the word to regular players
        if (gamePlayer.role === 'regular') {
          if (!game.word) {
            console.error(`Game ${gameId} has no word defined!`);
            return callback({ success: false, error: 'No word defined for this game' });
          }

          const wordToSend = String(game.word).trim();
          console.log(`Sending word to regular player ${playerId}: "${wordToSend}"`);

          return callback({
            success: true,
            word: wordToSend
          });
        } else {
          console.log(`Spy player ${playerId} requested word, declining`);
          return callback({
            success: false,
            error: 'Spies cannot see the word'
          });
        }
      } catch (error) {
        console.error('Error requesting word:', error);
        callback({ success: false, error: 'Failed to get word' });
      }
    });

    // End game (called by host)
    socket.on('end_game', async (gameId: string, callback) => {
      try {
        const playerId = socket.data.playerId;
        if (!playerId) {
          return callback({ success: false, error: 'Player not registered' });
        }

        if (!games.has(gameId)) {
          return callback({ success: false, error: 'Game not found' });
        }

        const game = games.get(gameId)!;

        if (game.hostId !== playerId) {
          return callback({ success: false, error: 'Only the host can end the game' });
        }

        // Update game status
        game.status = 'finished';

        // Update in database
        await query(
          'UPDATE games SET status = $1 WHERE id = $2',
          ['finished', gameId]
        );

        // Notify all players with the players and their roles
        io.to(gameId).emit('game_ended', {
          status: 'finished',
          word: game.word ?? '',
          hintWord: game.hintWord,
          players: game.players.map(p => ({ id: p.id, name: p.name, role: p.role }))
        });

        callback({ success: true });
      } catch (error) {
        console.error('Error ending game:', error);
        callback({ success: false, error: 'Failed to end game' });
      }
    });

    // Player leaves a game voluntarily
    socket.on('leave_game', async (gameId: string, playerId: string) => {
      try {
        console.log(`Player ${playerId} requested to leave game ${gameId}`);

        // Remove the player from the game
        await removePlayerFromGame(playerId);

        // Update the client to leave the game room
        socket.leave(gameId);

        console.log(`Player ${playerId} successfully left game ${gameId}`);
      } catch (error) {
        console.error('Error handling leave game:', error);
      }
    });

    // Admin can trigger a refresh of game settings for all active games
    socket.on('refresh_game_settings', async (callback) => {
      try {
        const playerId = socket.data.playerId;
        if (!playerId) {
          return callback({ success: false, error: 'Player not registered' });
        }

        console.log(`Player ${playerId} requested to refresh game settings for all active games`);

        // Get all active games
        const activeGames = Array.from(games.values()).filter(g => g.status === 'playing');
        console.log(`Found ${activeGames.length} active games`);

        // For each active game, resend roles with updated settings
        for (const game of activeGames) {
          console.log(`Refreshing settings for game ${game.id}`);

          // For each player in the game, resend role information
          for (const player of game.players) {
            await sendRoleToPlayer(player, game.word ?? null, game.hintWord ?? null);
          }
        }

        callback({
          success: true,
          message: `Refreshed settings for ${activeGames.length} active games`
        });
      } catch (error) {
        console.error('Error refreshing game settings:', error);
        callback({ success: false, error: 'Failed to refresh game settings' });
      }
    });

    // Host restarts the game (returns to lobby state)
    socket.on('restart_game', async (gameId: string, callback) => {
      try {
        const playerId = socket.data.playerId;
        if (!playerId) {
          return callback({ success: false, error: 'Player not registered' });
        }

        if (!games.has(gameId)) {
          return callback({ success: false, error: 'Game not found' });
        }

        const game = games.get(gameId)!;

        if (game.hostId !== playerId) {
          return callback({ success: false, error: 'Only the host can restart the game' });
        }

        // Reset game status to waiting
        game.status = 'waiting';

        // Clear word and hint
        game.word = undefined;
        game.hintWord = undefined;

        // Reset player roles
        game.players.forEach(p => {
          p.role = undefined;
        });

        // Update in database
        await query(
          'UPDATE games SET status = $1, word = NULL WHERE id = $2',
          ['waiting', gameId]
        );

        // Also update all player roles in the database
        for (const player of game.players) {
          await query(
            'UPDATE players SET role = NULL WHERE id = $1',
            [player.id]
          );
        }

        // Notify all players
        io.to(gameId).emit('game_restarted', {
          status: 'waiting',
          players: game.players.map(p => ({ id: p.id, name: p.name }))
        });

        callback({ success: true });
      } catch (error) {
        console.error('Error restarting game:', error);
        callback({ success: false, error: 'Failed to restart game' });
      }
    });

    // Player leaves
    socket.on('disconnect', async () => {
      try {
        const playerId = socket.data.playerId;
        if (!playerId) return;

        const player = players.get(playerId);
        if (!player) return;

        const gameId = player.gameId;
        if (gameId && games.has(gameId)) {
          const game = games.get(gameId)!;

          // Remove player from game
          game.players = game.players.filter(p => p.id !== playerId);

          // If host leaves, end the game
          if (game.hostId === playerId) {
            game.status = 'finished';

            // Update game status in database
            await query(
              'UPDATE games SET status = $1 WHERE id = $2',
              ['finished', gameId]
            );

            io.to(gameId).emit('host_left', {
              status: 'finished',
              message: 'Host left the game'
            });
          } else {
            // Notify others that player left
            io.to(gameId).emit('player_left', {
              playerId,
              players: game.players.map(p => ({ id: p.id, name: p.name }))
            });
          }

          // If game is empty, remove it
          if (game.players.length === 0) {
            games.delete(gameId);
          }
        }

        // Remove player from memory
        players.delete(playerId);

        console.log('Client disconnected:', socket.id, playerId);
      } catch (error) {
        console.error('Error handling disconnect:', error);
      }
    });
  });
};
