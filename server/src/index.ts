import http from 'node:http';
import dotenv from 'dotenv';
import morgan from 'morgan';
import cors from 'cors';
import express, { type NextFunction, type Request, type Response } from 'express';
import { Server as SocketIoServer } from 'socket.io';
import swaggerUi from 'swagger-ui-express';

import { getGameSettings } from './lib/settingsUtils.ts';
import { initializeDatabase } from './lib/db.ts';
import { initializeData } from './lib/wordUtils.ts';
import { setupSocketHandlers } from './lib/socket.ts';
import gameRoutes from './routes/game.ts'
import getSwaggerSpec from './lib/swagger.ts';

// Type definitions
export type Player = {
  id: string;
  name: string;
  gameId?: string;
  role?: 'spy' | 'regular';
}

export type Game = {
  id: string;
  hostId: string;
  players: Player[];
  status: 'waiting' | 'playing' | 'finished';
  word?: string;
  hintWord?: string;
  spyCount?: number;
}

dotenv.config();
// Load environment variables
const PORT = Number.parseInt(process.env.PORT ?? '3000');

// Initialize Express app
const app = express();
const httpServer = http.createServer(app);
const isProduction = process.env.NODE_ENV !== 'development'; // assume production environment
const isDevelopment = !isProduction;

// Configure allowed origins
const allowedOrigins = process.env.CLIENT_URL?.split(',') || [
    'http://localhost:5173',
    'http://localhost:8100'
];

// Initialize Websocket with CORS
const io = new SocketIoServer(httpServer, isDevelopment ? {
    cors: {
        origin: allowedOrigins,
        credentials: true,
        methods: ['GET', 'POST']
    }
} : {});

// Middleware
if (isDevelopment) {
    app.use(cors({
        origin: allowedOrigins,
        credentials: true
    }));
}
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
if (isDevelopment) app.use(morgan('dev'));

app.use((err: any, req: Request, res: Response, next: NextFunction) => {
    console.error('Error:', err);
    res.status(err.status ?? 500).json({
        message: err.message ?? 'Internal Server Error'
    });
});

app.use('/api-docs', swaggerUi.serve, swaggerUi.setup(getSwaggerSpec(PORT), {
    explorer: true,
    swaggerOptions: {
        persistAuthorization: true,
        displayRequestDuration: true,
        docExpansion: 'list',
        filter: true,
        showExtensions: true,
    }
}));

app.use('/api/game', gameRoutes);

/**
 * @swagger
 * /health:
 *   get:
 *     summary: Health check endpoint
 *     tags:
 *       - Health
 *     responses:
 *       200:
 *         description: Returns the health status and current timestamp
 */
app.get('/health', (_req, res) => {
    res.status(200).json({ status: 'ok', timestamp: new Date() });
});

/**
 * @swagger
 * /error:
 *   get:
 *     summary: Test Error handling
 *     tags:
 *       - Health
 *     responses:
 *       500:
 *         description: Expected Error
 */
app.get('/error', (_req: Request, res: Response) => {
    throw new Error('Test error');
});

// Start server
httpServer.listen(PORT, async () => {
    try {
        await initializeData();
        await initializeDatabase();
        await setupSocketHandlers(io);    

        console.log(`Server running on port ${PORT}`);
        console.log(`Swagger docs available at http://localhost:${PORT}/api-docs`);

        // Fetch and display current admin password
        try {
            const settings = await getGameSettings();
            console.log(`\n🔑 CURRENT ADMIN PASSWORD: ${settings.adminPassword}`);
            console.log(`   Access admin dashboard at: /admin`);
        } catch (passwordError: unknown) {
            console.log(`\n🔑 DEFAULT ADMIN PASSWORD: spymaster2025 (using fallback)`);
            console.log(`   Access admin dashboard at: /admin`);
            console.log(`   Warning: Could not fetch current password from database:`, passwordError);
        }
    } catch (error) {
        console.error('Failed to initialize server:', error);
        process.exit(1);
    }
});

export default app;
