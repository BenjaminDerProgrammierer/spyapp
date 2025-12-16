# SpyApp - AI Agent Instructions

This document provides comprehensive guidance for AI agents working on the SpyApp project. It covers development workflows, coding patterns, architectural decisions, and common tasks.

## System Context

**Operating System:** Arch Linux

Use the docker compose plugin, not command:

```bash
# CORRECT
docker compose up

# INCORRECT
docker-compose up
```

## Project Overview

SpyApp is a real-time multiplayer social deduction game with the following characteristics:

### Architecture Pattern

- **Backend**: Hybrid state management (in-memory + PostgreSQL)
- **Frontend**: Reactive Vue 3 with Composition API
- **Communication**: Socket.io for real-time, REST for admin/setup
- **Deployment**: Containerized with Docker Compose

### Core Design Principles

1. **Real-time first**: Game logic uses WebSocket, not REST
2. **Client resilience**: LocalStorage backup for critical data
3. **Server simplicity**: In-memory state for performance
4. **Mobile-ready**: Ionic components, Capacitor for native

## Technology Stack Details

### Frontend Stack

#### Vue.js 3 (Composition API)

```typescript
// Pattern: Use reactive refs, not Options API
import { ref, computed, onMounted } from 'vue';

const gameStatus = ref<'waiting' | 'playing' | 'finished'>('waiting');
const isHost = computed(() => playerId.value === hostId.value);
```

#### Ionic Framework

- Always use `<ion-page>` as root component
- Use `<ion-header>`, `<ion-content>`, `<ion-footer>` structure
- Ionic components provide native-like mobile UX

#### Socket.io Client

```typescript
// Pattern: Single socket instance per page
import { io, Socket } from 'socket.io-client';

const socket = ref<Socket | null>(null);
socket.value = io(''); // Empty string = same origin
```

#### TypeScript Configuration

- Strict mode disabled for compatibility
- CommonJS for server, ES modules for client
- Vue SFC TypeScript support via vue-tsc

### Backend Stack

#### Express.js

```typescript
// Pattern: Async route handlers with try-catch
router.get('/api/game/list', async (req, res) => {
  try {
    const result = await query('SELECT ...', []);
    res.json({ success: true, games: result.rows });
  } catch (error) {
    console.error('Error:', error);
    res.status(500).json({ success: false, error: 'Server error' });
  }
});
```

#### Socket.io Server

- Game state stored in Maps (not database)
- Callback pattern for acknowledgments
- Room-based broadcasting

#### PostgreSQL

```typescript
// Pattern: Parameterized queries only
await query(
  'INSERT INTO players (id, game_id, name) VALUES ($1, $2, $3)',
  [playerId, gameId, playerName]
);
```

## Project Structure Deep Dive

### Client Directory

```text
client/
├── src/
│   ├── views/              # Page components (route targets)
│   ├── router/             # Vue Router setup
│   ├── utils/              # Utility functions
│   ├── App.vue             # Root component
│   └── main.ts             # Application entry
├── public/                 # Static assets
├── index.html              # HTML template
├── vite.config.ts          # Vite bundler config
└── capacitor.config.json   # Native app config
```

**Key Files:**

- `views/GameRoom.vue`: Most complex component, handles all game states
- `utils/socketManager.ts`: Socket connection lifecycle
- `utils/userId.ts`: Persistent player identification

### Server Directory

```text
server/
├── src/
│   ├── index.ts            # Server setup, middleware, startup
│   ├── init.ts             # Database initialization
│   ├── routes/
│   │   └── game.ts         # REST API endpoints
│   ├── utils/
│   │   ├── socket.ts       # Socket.io event handlers (CORE LOGIC)
│   │   ├── wordUtils.ts    # Wordlist loading and caching
│   │   └── settingsUtils.ts # Admin settings CRUD
│   ├── config/
│   │   ├── db.ts           # PostgreSQL connection pool
│   │   └── swagger.ts      # OpenAPI documentation
│   └── data/
│       └── wordlist.json   # Game words with hints
└── uploads/                # Temporary file uploads
```

**Key Files:**

- `utils/socket.ts`: 500+ lines, all game logic
- `config/db.ts`: Database schema and initialization

## Development Workflows

### Starting Development Environment

```bash
# Full stack with Docker
docker compose -f docker-compose.dev.yml up

# Manual (requires PostgreSQL running separately)
# Terminal 1
cd server && npm run dev

# Terminal 2
cd client && npm run dev
```

### Making Code Changes

**Frontend Changes:**

1. Vite hot reload works automatically
2. Test in browser at `http://localhost:5173`
3. Check browser console for errors

**Backend Changes:**

1. Nodemon auto-restarts on file changes
2. Test REST API via Swagger UI at `http://localhost:3000/api/api-docs`
3. Test Socket.io via client UI

### Database Changes

```bash
# Connect to database
docker exec -it spyapp-postgres psql -U postgres -d spyapp

# View tables
\dt

# View game data
SELECT * FROM games;
SELECT * FROM players;

# Clear all games (useful for testing)
DELETE FROM players;
DELETE FROM games;
```

### Building for Production

```bash
# Build Docker images
docker compose build

# Deploy
docker compose up -d

# View logs
docker compose logs -f
```

## Core Game Logic Explained

### Game State Machine

```text
WAITING → PLAYING → FINISHED
   ↑                    ↓
   └────── restart ─────┘
```

**State Transitions:**

- `WAITING → PLAYING`: Host clicks "Start Game" (minimum players required)
- `PLAYING → FINISHED`: Host clicks "End Game" or host disconnects
- `FINISHED → WAITING`: Host clicks "Start New Round"

### Player Registration Flow

```typescript
// 1. Client gets/creates userId from localStorage
const userId = getUserId(); // Returns existing or new UUID

// 2. Connect to Socket.io
socket.value = io('');

// 3. Register player with server
socket.emit('join_as_player', playerName, userId, (response) => {
  playerId.value = response.playerId; // Server may return different ID
});

// 4. Create or join game
socket.emit('create_game', spyCount, callback);
// OR
socket.emit('join_game', gameId, callback);
```

### Game Start Sequence

```typescript
// Server side (socket.ts)
socket.on('start_game', async (gameId, callback) => {
  // 1. Validate minimum players
  if (game.players.length < minPlayersToStart) {
    return callback({ success: false, error: '...' });
  }
  
  // 2. Select random word and hint
  const wordData = getRandomWord(); // From wordlist.json
  const hintIndex = Math.floor(Math.random() * wordData.hints.length);
  game.word = wordData.word;
  game.hintWord = wordData.hints[hintIndex];
  
  // 3. Assign roles (Fisher-Yates shuffle)
  const shuffled = shuffleArray([0, 1, 2, ...]);
  game.players.forEach((player, idx) => {
    player.role = shuffled.slice(0, spyCount).includes(idx) ? 'spy' : 'regular';
  });
  
  // 4. Update database
  await query('UPDATE games SET status = $1, word = $2 WHERE id = $3', 
              ['playing', word, gameId]);
  
  // 5. Notify all players
  io.to(gameId).emit('game_started', { status: 'playing' });
  
  // 6. Send role-specific info to each player
  for (const player of game.players) {
    await sendRoleToPlayer(player, game.word, game.hintWord);
  }
});
```

### Role Assignment Logic

```typescript
// Regular players receive:
{
  role: 'regular',
  word: 'elephant',           // The secret word
  hintWord: 'trunk'            // If showHintsToRegularUsers = true
}

// Spies receive:
{
  role: 'spy',
  word: null,                  // Never receive the word
  hintWord: 'trunk'            // Always receive hint
}
```

### Reconnection Handling

**Client Side:**

```typescript
// On page load/reconnect
socket.emit('join_game', gameId, (response) => {
  if (response.reconnected) {
    // Player already in game
    if (game.status === 'playing') {
      // Request role info
      socket.emit('request_role_info', (roleResponse) => {
        playerRole.value = roleResponse.role;
        currentWord.value = roleResponse.word;
        currentHintWord.value = roleResponse.hintWord;
      });
    }
  }
});
```

**Server Side:**

```typescript
// Check if player already in game
const playerAlreadyInGame = game.players.some(p => p.id === playerId);
if (playerAlreadyInGame) {
  socket.join(gameId);
  if (game.status === 'playing') {
    // Restore role information
    sendRoleToPlayer(player, game.word, game.hintWord);
  }
  return callback({ success: true, reconnected: true });
}
```

## Common Development Tasks

### Adding a New Word Category

1. Edit `server/src/data/wordlist.json`:

```json
{
  "words": [
    {
      "id": 999,
      "word": "volcano",
      "category": "nature",
      "hints": [
        "eruption", "lava", "magma", "crater", "ash"
      ]
    }
  ]
}
```

1. Restart server (nodemon auto-restarts)
1. New words available immediately (in-memory cache invalidated)

### Adding a New Admin Setting

1. Update `server/src/config/db.ts` default settings
2. Update TypeScript interface in `server/src/utils/settingsUtils.ts`

```typescript
// db.ts
const defaultSettings = [{
  key: 'gameSettings',
  value: JSON.stringify({
    showHintsToRegularUsers: false,
    adminPassword: 'spymaster2025',
    minPlayersToStart: 3,
    newSetting: 'default value'  // ADD HERE
  })
}];
```

```typescript
// settingsUtils.ts
interface GameSettings {
  showHintsToRegularUsers: boolean;
  adminPassword: string;
  minPlayersToStart: number;
  newSetting: string;  // ADD HERE
}
```

1. Add UI in `client/src/views/AdminDashboard.vue`

### Adding a New Socket Event

**Server Side (`server/src/utils/socket.ts`):**

```typescript
socket.on('new_event', async (data, callback) => {
  try {
    const playerId = socket.data.playerId;
    if (!playerId) {
      return callback({ success: false, error: 'Player not registered' });
    }
    
    // Your logic here
    
    callback({ success: true });
  } catch (error) {
    console.error('Error:', error);
    callback({ success: false, error: 'Server error' });
  }
});
```

**Client Side (e.g., `client/src/views/GameRoom.vue`):**

```typescript
const handleNewEvent = () => {
  socket.value?.emit('new_event', { data: 'example' }, (response) => {
    if (response.success) {
      // Handle success
    } else {
      showError(response.error);
    }
  });
};
```

### Adding a New REST Endpoint

**Server Side (`server/src/routes/game.ts`):**

```typescript
/**
 * @swagger
 * /api/game/new-endpoint:
 *   get:
 *     summary: Description
 *     tags: [Games]
 *     responses:
 *       200:
 *         description: Success
 */
router.get('/new-endpoint', async (req, res) => {
  try {
    // Your logic
    res.json({ success: true, data: {} });
  } catch (error) {
    console.error('Error:', error);
    res.status(500).json({ success: false, error: 'Server error' });
  }
});
```

## Code Patterns and Best Practices

### Error Handling Pattern

**Backend:**

```typescript
// ALWAYS use try-catch in async handlers
router.get('/endpoint', async (req, res) => {
  try {
    const result = await query('...', []);
    res.json({ success: true, data: result.rows });
  } catch (error) {
    console.error('Error in endpoint:', error);
    res.status(500).json({ success: false, error: 'Server error' });
  }
});

// Socket.io: Use callbacks for errors
socket.on('event', async (data, callback) => {
  try {
    // logic
    callback({ success: true });
  } catch (error) {
    console.error('Error:', error);
    callback({ success: false, error: 'Server error' });
  }
});
```

**Frontend:**

```typescript
// Check response.success before proceeding
socket.emit('event', data, (response) => {
  if (!response.success) {
    showError(response.error || 'Unknown error');
    return;
  }
  // Handle success
});

// Use try-catch for async operations
try {
  const result = await someAsyncOperation();
} catch (error) {
  console.error('Error:', error);
  showError('Operation failed');
}
```

### Database Query Pattern

```typescript
// ALWAYS use parameterized queries
// CORRECT
await query(
  'SELECT * FROM games WHERE id = $1 AND status = $2',
  [gameId, 'playing']
);

// INCORRECT - SQL injection risk
await query(`SELECT * FROM games WHERE id = '${gameId}'`, []);
```

### Socket Room Management

```typescript
// Join room
socket.join(gameId);

// Leave room
socket.leave(gameId);

// Broadcast to room (excluding sender)
socket.to(gameId).emit('event', data);

// Broadcast to room (including sender)
io.to(gameId).emit('event', data);

// Broadcast to specific socket
io.sockets.sockets.get(socketId)?.emit('event', data);
```

### Vue Reactive State

```typescript
// Use ref for primitives
const count = ref(0);
count.value++;

// Use ref for objects
const player = ref<Player | null>(null);
player.value = { id: '123', name: 'Alice' };

// Use computed for derived state
const isHost = computed(() => playerId.value === hostId.value);

// Watch for changes
watch(gameStatus, (newStatus) => {
  if (newStatus === 'playing') {
    // Do something
  }
});
```

### LocalStorage Pattern

```typescript
// Utility function pattern
export const getUserId = (): string => {
  let userId = localStorage.getItem('spyapp_userId');
  if (!userId) {
    userId = uuidv4();
    localStorage.setItem('spyapp_userId', userId);
  }
  return userId;
};

// Game-specific data
const gameKey = `spyapp_word_${gameId.value}`;
localStorage.setItem(gameKey, word);
const storedWord = localStorage.getItem(gameKey);
```

## Debugging Tips

### Server Debugging

**View Socket Connections:**

```typescript
// Add to server/src/utils/socket.ts
io.on('connection', (socket) => {
  console.log('Total connections:', io.sockets.sockets.size);
  console.log('Socket ID:', socket.id);
});
```

**Check In-Memory State:**

```typescript
// Add temporary log in socket.ts
console.log('Active games:', Array.from(games.keys()));
console.log('Active players:', Array.from(players.keys()));
console.log('Game state:', JSON.stringify(game, null, 2));
```

**Database Inspection:**

```bash
# Connect to database
docker exec -it spyapp-postgres psql -U postgres -d spyapp

# Check games
SELECT g.id, g.status, COUNT(p.id) as player_count 
FROM games g 
LEFT JOIN players p ON g.id = p.game_id 
GROUP BY g.id;

# Check specific game
SELECT * FROM players WHERE game_id = 'YOUR_GAME_ID';
```

### Client Debugging

**Browser Console:**

```typescript
// Add debug logs in Vue components
console.log('Game status:', gameStatus.value);
console.log('Player role:', playerRole.value);
console.log('Current word:', currentWord.value);
```

**Socket Events:**

```typescript
// Log all socket events
socket.value?.onAny((eventName, ...args) => {
  console.log(`Socket event: ${eventName}`, args);
});
```

**Vue DevTools:**

- Install Vue DevTools browser extension
- Inspect component state in real-time
- Monitor events and props

## Security Considerations

### Admin Password Protection

```typescript
// Middleware pattern (server/src/routes/game.ts)
const checkAdminPassword = async (req, res, next) => {
  const token = req.headers.authorization?.replace('Bearer ', '');
  const isValid = await verifyAdminPassword(token);
  if (!isValid) {
    return res.status(401).json({ success: false, error: 'Invalid password' });
  }
  next();
};

router.get('/admin/endpoint', checkAdminPassword, async (req, res) => {
  // Protected logic
});
```

### Input Sanitization

```typescript
// Server side
const sanitizedPlayerName = playerName.trim().substring(0, 50);

// Validate game codes
if (!/^[A-Z0-9]{4}$/.test(gameId)) {
  return callback({ success: false, error: 'Invalid game code' });
}
```

### CORS Configuration

```typescript
// server/src/index.ts
app.use(cors({
  origin: process.env.CLIENT_URL ?? 'http://localhost:5173',
  credentials: true
}));
```

## Mobile App Development

### Capacitor Integration

**Configuration:**

```json
// client/capacitor.config.json
{
  "appId": "com.spyapp.game",
  "appName": "SpyApp",
  "webDir": "dist",
  "server": {
    "androidScheme": "https"
  }
}
```

**Build Process:**

```bash
# 1. Build web assets
cd client
npm run build

# 2. Sync with Capacitor
npm run cap:sync

# 3. Open native IDE
npm run cap:open:android  # or :ios
```

**Testing on Device:**

```bash
# Change API URL in .env for production
VITE_API_URL=https://your-server.com/api

# Rebuild and sync
npm run build && npm run cap:sync
```

## Performance Optimization

### Backend Optimizations

1. **In-Memory State**: Games stored in Maps for O(1) access
2. **Wordlist Caching**: JSON file loaded once, cached in memory
3. **Database Pooling**: Connection pool with max 20 connections
4. **Efficient Queries**: Indexed columns, minimal JOINs

### Frontend Optimizations

1. **Code Splitting**: Vue Router lazy loads routes
2. **Ionic Components**: Native-like performance
3. **LocalStorage**: Reduce server requests
4. **Socket.io**: Efficient binary protocol

## Testing Guidelines

### Manual Testing Checklist

**Game Creation:**

- [ ] Host can create game with default spy count
- [ ] Game code is displayed and copyable
- [ ] Host appears in player list
- [ ] Spy count can be changed before start

**Game Joining:**

- [ ] Players can join with valid code
- [ ] Invalid code shows error
- [ ] Player list updates in real-time
- [ ] Can't join started game (unless already in it)

**Game Playing:**

- [ ] Minimum player count enforced
- [ ] Roles assigned correctly (spy count respected)
- [ ] Regular players see word and hint (if enabled)
- [ ] Spies see hint only
- [ ] Word is not empty
- [ ] Hint is related to word

**Reconnection:**

- [ ] Closing browser and reopening preserves player ID
- [ ] Rejoining game restores role and word
- [ ] LocalStorage fallback works if server restarted

**Game Ending:**

- [ ] Host can end game
- [ ] All players see results with roles
- [ ] Restart returns to lobby
- [ ] Players can leave game

**Admin:**

- [ ] Admin password protects routes
- [ ] Wordlist upload validates JSON format
- [ ] Settings update persists
- [ ] Hint visibility setting works

## Troubleshooting Common Issues

### "Game not found" Error

**Cause:** Server restarted, in-memory state lost  
**Solution:** Create new game, games not persisted

### Word Not Showing for Regular Players

**Check:**

1. Browser console for errors
2. Server logs for word selection
3. LocalStorage for cached word
4. Socket connection status

**Fix:**

```typescript
// Client side - force refresh
socket.emit('request_role_info', (response) => {
  console.log('Role response:', response);
});
```

### Hints Not Visible

**Check:** Admin settings `showHintsToRegularUsers`  
**Fix:** Update in admin dashboard or database:

```sql
UPDATE settings 
SET value = jsonb_set(value, '{showHintsToRegularUsers}', 'true')
WHERE key = 'gameSettings';
```

### Socket Disconnections

**Causes:**

- Network issues
- Server restart
- CORS misconfiguration

**Debug:**

```typescript
// Client side
socket.on('disconnect', (reason) => {
  console.log('Disconnected:', reason);
});

socket.on('connect_error', (error) => {
  console.error('Connection error:', error);
});
```

## Future Development Roadmap

### Phase 1: Core Improvements

- [ ] Persistent game history
- [ ] User accounts with authentication
- [ ] Game statistics and leaderboards
- [ ] In-game chat system

### Phase 2: Gameplay Features

- [ ] Round timers
- [ ] Voting system for spy identification
- [ ] Multiple game modes
- [ ] Custom word categories
- [ ] Difficulty levels

### Phase 3: Social Features

- [ ] Friend system
- [ ] Private lobbies
- [ ] Push notifications
- [ ] Social media sharing

### Phase 4: Advanced Features

- [ ] Voice chat integration
- [ ] Spectator mode
- [ ] AI players for solo mode
- [ ] Multi-language support

## Resources

### Documentation

- Vue 3: <https://vuejs.org/guide/>
- Ionic: <https://ionicframework.com/docs/vue/overview>
- Socket.io: <https://socket.io/docs/v4/>
- PostgreSQL: <https://www.postgresql.org/docs/>

### Development Tools

- VS Code with Vue extension
- Postman for API testing
- pgAdmin for database management
- Chrome DevTools for debugging

### Deployment

- Docker Hub for image hosting
- DigitalOcean/AWS for VPS hosting
- Nginx for reverse proxy
- Let's Encrypt for SSL certificates

## Conclusion

This guide provides the foundation for working on SpyApp. When in doubt:

1. **Check existing patterns** in the codebase
2. **Test thoroughly** before committing
3. **Log extensively** for debugging
4. **Document changes** in code comments
5. **Ask questions** if architecture is unclear

Happy coding! 🚀
