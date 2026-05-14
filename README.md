# SpyApp

SpyApp is a real-time multiplayer social deduction game where regular players see a secret word and spies try to deduce it without being detected. Games use 4-character room codes and require at least three players.

## Tech stack

- Frontend: Vue 3 (Composition API), Ionic, Vite
- Real-time: Socket.io
- Backend: Node.js, Express
- Persistence: PostgreSQL
- Deployment: Docker + Docker Compose

## Quick start — development

- Start a local PostgreSQL instance (e.g. with Docker or a local installation) and note the connection details.

```bash
# Backend
cd server
cp .env.example .env
# Update .env with your details
npm install
npm run dev

# Frontend
cd client
cp .env.example .env
# Update .env with your details (Backend URL)
npm install
npm run dev
```

Frontend runs at `http://localhost:5173` and backend at `http://localhost:3000` by default in development.

## Quick start — production

```bash
docker-compose up --build
```

## Admin

Default admin password used in local/dev setups: `spymaster2025`.

Admin UI is available at `/admin` on the running server.

## License

MIT
