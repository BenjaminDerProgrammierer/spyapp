# SpyApp

A real-time multiplayer social deduction game where players try to identify secret spies while discussing a hidden word.

## What is SpyApp?

SpyApp is a party game where:

- **Regular players** see a secret word and must identify the spies
- **Spies** don't see the word and must figure it out without being caught
- Players discuss the word while spies try to blend in

Requires 3+ players. Games use unique 4-character room codes.

## Tech Stack

**Frontend:**

- Vue.js 3 (Composition API)
- Ionic Framework (mobile UI)
- Socket.io Client (real-time)

**Backend:**

- Node.js + Express
- Socket.io Server
- PostgreSQL

**Deployment:**

- Docker + Docker Compose

## Quick Start

### Production Deployment (Docker - Recommended)

```bash
# 1. Copy environment file
cp .env.example .env
# Edit .env with your production settings

# 2. Build and start all services
docker compose up -d

# 3. Access the application
# App: http://localhost (or your configured PORT)
# API Docs: http://localhost/api/api-docs

# View logs
docker compose logs -f

# Stop services
docker compose down
```

The production setup uses:
- Single port (default: 80) with nginx reverse proxy
- Built client served as static files
- API and Socket.io proxied to `/api/` and `/socket.io/`
- PostgreSQL database with persistent volumes

### Development (Docker)

```bash
# Start all services with hot-reload
docker compose -f docker-compose.dev.yml up

# Access services
# Frontend: http://localhost:5173
# Backend: http://localhost:3000
# API Docs: http://localhost:3000/api/api-docs
# Database: localhost:5432
```

### Database Only (Docker)

For local development without containerizing the app:

```bash
# Start only PostgreSQL
docker compose -f docker-compose.db.yml up -d

# Stop database
docker compose -f docker-compose.db.yml down
```

### Development (Manual)

```bash
# Terminal 1 - Database
docker compose -f docker-compose.db.yml up

# Terminal 2 - Backend
cd server
cp .env.example .env
npm install
npm run dev

# Terminal 3 - Frontend
cd client
cp .env.example .env
npm install
npm run dev
```

## Environment Variables

### Production (.env in root)

```env
PORT=80                    # Nginx port
DB_USER=postgres
DB_PASSWORD=your-password  # Change in production!
DB_NAME=spyapp
CLIENT_URL=http://localhost  # Your domain in production
SESSION_SECRET=your-secret   # Change in production!
```

### Development (server/.env)

```env
NODE_ENV=development
PORT=3000
DB_HOST=localhost          # Or 'postgres' if using docker-compose.dev.yml
DB_PORT=5432
DB_USER=postgres
DB_PASSWORD=postgres
DB_NAME=spyapp
CLIENT_URL=http://localhost:5173
SESSION_SECRET=spy-game-secret-key-change-me
```

### Client (client/.env)

```env
VITE_API_URL=http://localhost:3000  # Development only
# Leave empty for production (same origin)
```

## Default Admin Password

`spymaster2025`

Access admin dashboard at: `/admin`

## Documentation

- **REFERENCE.md** - Complete technical documentation
- **AGENTS.md** - Developer guide and architecture details

## Mobile Apps

```bash
cd client

# Build and sync
npm run build
npm run cap:sync

# Open in IDE
npm run cap:open:android
npm run cap:open:ios
```

## License

MIT
