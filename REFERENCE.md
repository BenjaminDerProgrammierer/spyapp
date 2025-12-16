# SpyApp - Real-Time Multiplayer Social Deduction Game

A web and mobile social deduction game where players must identify secret spies among them while discussing a hidden word that only regular players can see.

## Overview

SpyApp is a real-time multiplayer social deduction game built with modern web technologies. Players join game rooms using unique 4-character codes. One or more players are secretly assigned as spies, while regular players receive a secret word and hint. Through conversation, regular players must identify the spies, while spies try to deduce the secret word without revealing their identity.

**Core Gameplay:**

- **Regular Players**: See the secret word and optional hints, must identify spies
- **Spies**: Don't see the word, must figure it out through conversation
- **Minimum Players**: 3 (configurable)
- **Spy Count**: 1-5 spies, up to 50% of total players
- **Game Flow**: Lobby → Playing → Finished (with restart option)

## Architecture

### Technology Stack

**Frontend:**

- Vue.js 3 (Composition API)
- Ionic Framework 8 (mobile-optimized UI)
- Capacitor 7 (native mobile apps)
- Socket.io Client (real-time communication)
- TypeScript

**Backend:**

- Node.js + Express 5
- Socket.io Server (WebSocket + polling fallback)
- PostgreSQL (game state persistence)
- Swagger UI (API documentation)
- TypeScript

**Infrastructure:**

- Docker + Docker Compose
- Multi-stage builds for production
- Health checks and automatic restarts

### System Architecture

```text
┌─────────────┐         ┌──────────────┐         ┌──────────────┐
│   Client    │◄───────►│    Server    │◄───────►│  PostgreSQL  │
│  (Vue.js)   │         │  (Express)   │         │   Database   │
└─────────────┘         └──────────────┘         └──────────────┘
      │                        │
      │                        │
      └────── Socket.io ───────┘
      (Real-time bidirectional
       communication)
```

## Key Components

### Frontend Architecture

**State Management:**

- Reactive refs for local state
- Socket.io events for real-time updates
- LocalStorage for persistence (userId, words, hints)

**Key Views:**

1. **HomePage**: Player name entry and navigation
2. **HostGame**: Game creation, lobby management, spy count configuration
3. **JoinGame**: Join games by code
4. **GameRoom**: Main gameplay interface with role-specific displays
5. **AdminDashboard**: Password-protected wordlist management

**Socket Events (Client):**

- `join_as_player` - Register player with server
- `create_game` - Host creates new game
- `join_game` - Player joins existing game
- `start_game` - Host starts the game
- `update_spy_count` - Host changes spy count
- `request_role_info` - Request role and word (reconnection)
- `end_game` - Host ends the game
- `restart_game` - Host restarts to lobby
- `leave_game` - Player leaves game

### Backend Architecture

**In-Memory Game State:**

- Map of active games (gameId → Game)
- Map of connected players (playerId → Player)
- Cleared on server restart

**Database Schema:**

```sql
games (id, host_id, status, word, created_at)
players (id, game_id, name, role, created_at)
wordlist (id, word, category)
settings (key, value, updated_at)
```

**Socket Events (Server):**

- `player_joined` - Broadcast new player
- `player_left` - Broadcast player departure
- `game_started` - Game begins
- `role_assigned` - Send role to specific player
- `player_role_update` - Fallback role broadcast
- `game_ended` - Game finished with results
- `game_restarted` - Return to lobby
- `host_left` - Host disconnected, end game
- `spy_count_updated` - Spy count changed

**REST API Endpoints:**

- `GET /api/game/list` - List waiting games
- `GET /api/game/:id` - Game details
- `POST /api/game/setup` - Upload wordlist (admin)
- `POST /api/game/admin/verify` - Verify admin password
- `GET /api/game/admin/settings` - Get settings (admin)
- `PUT /api/game/admin/settings` - Update settings (admin)
- `GET /api/game/admin/wordlist` - Get wordlist (admin)
- `POST /api/game/admin/wordlist/upload` - Upload JSON wordlist (admin)

### Game Logic Flow

#### 1. Lobby Phase (Status: 'waiting')

```text
Host creates game → Players join → Host configures spy count → Host starts
```

#### 2. Playing Phase (Status: 'playing')

```text
Server:
- Selects random word from wordlist
- Selects random hint from word's hint array
- Randomly assigns spy roles (Fisher-Yates shuffle)
- Sends role-specific information to each player

Regular Players receive: word + hint (if enabled)
Spies receive: hint only
```

#### 3. Finished Phase (Status: 'finished')

```text
Game ends → Display all player roles → Options: Restart or Leave
```

**Reconnection Handling:**

- Persistent userId stored in localStorage
- Players rejoin with same ID
- Server restores role and word from in-memory state
- Fallback to localStorage if server state lost

### Wordlist System

**Structure:**

```json
{
  "words": [
    {
      "id": 1,
      "word": "elephant",
      "category": "animals",
      "hints": [
        "large", "trunk", "tusks", "mammal", "safari",
        "memory", "africa", "gray", "ivory", "ears"
      ]
    }
  ]
}
```

**Features:**

- JSON file-based storage
- In-memory caching
- Multiple hints per word
- Random hint selection per game
- Admin upload interface
- File validation

### Admin Settings

**Configurable Settings:**

- `showHintsToRegularUsers` (boolean) - Whether regular players see hints
- `adminPassword` (string) - Password for admin access
- `minPlayersToStart` (integer) - Minimum players to start game

**Storage:** PostgreSQL settings table with JSONB values

## Deployment

### Development

```bash
# With Docker
docker compose -f docker-compose.dev.yml up

# Manual
cd server && npm run dev
cd client && npm run dev
```

### Production

```bash
docker compose up -d
```

**Environment Variables:**

```env
NODE_ENV=production
PORT=3000
CLIENT_URL=https://yourdomain.com
SESSION_SECRET=your-secret-key
DB_HOST=postgres
DB_PORT=5432
DB_USER=postgres
DB_PASSWORD=your-db-password
DB_NAME=spyapp
```

### Mobile Apps

```bash
cd client

# Build web assets
npm run build

# iOS
npm run cap:add:ios
npm run cap:sync
npm run cap:open:ios

# Android
npm run cap:add:android
npm run cap:sync
npm run cap:open:android
```

## API Documentation

Access Swagger UI at: `http://localhost:3000/api/api-docs`

Authentication for admin endpoints:

- Header: `Authorization: Bearer <admin-password>`

## Game Features

### Core Mechanics

✅ Real-time multiplayer via Socket.io
✅ Unique 4-character game codes
✅ Configurable spy count (1-5)
✅ Random word and hint selection
✅ Role-based information hiding
✅ Automatic reconnection handling
✅ Game state persistence

### Admin Features

✅ Password-protected dashboard
✅ Wordlist upload (JSON format)
✅ Settings management
✅ Hint visibility toggle
✅ Minimum player configuration

### UX Features

✅ Mobile-responsive design
✅ Ionic native UI components
✅ Loading states and error handling
✅ Toast notifications
✅ Copy game code button
✅ Restart game functionality

## Technical Highlights

### Resilience

- Automatic database reconnection
- Socket.io fallback to polling
- LocalStorage backup for words/hints
- Graceful error handling
- Health check endpoints

### Security

- Admin password authentication
- SQL injection prevention (parameterized queries)
- Input sanitization
- CORS configuration
- Session management

### Performance

- In-memory game state (fast access)
- Wordlist caching
- Connection pooling (PostgreSQL)
- Efficient Docker multi-stage builds

## Known Limitations

1. **No persistent user accounts** - Players identified by localStorage UUID
2. **In-memory state** - Games lost on server restart
3. **No game history** - Past games not stored
4. **Single region** - No multi-region deployment
5. **No voice chat** - Text discussion only
6. **No voting system** - Manual spy identification
7. **No timers** - Unlimited discussion time
8. **No scoring** - Win/loss not tracked

## System Requirements

**Server:**

- Node.js 14+
- PostgreSQL 12+
- 512MB RAM minimum
- Docker (optional)

**Client:**

- Modern browser (Chrome, Firefox, Safari, Edge)
- iOS 13+ or Android 5+ for mobile apps

**Development:**

- npm or yarn
- Docker Desktop (recommended)
- Xcode (for iOS)
- Android Studio (for Android)

## License

MIT License
