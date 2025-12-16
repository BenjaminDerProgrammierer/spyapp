import express from 'express';
import cors from 'cors';
import morgan from 'morgan';
import dotenv from 'dotenv';
import { createServer } from 'http';
import { Server } from 'socket.io';
import session from 'express-session';
import swaggerUi from 'swagger-ui-express';
import swaggerJsDoc from 'swagger-jsdoc';

import gameRoutes from './routes/game';
import { setupSocketHandlers } from './utils/socket';
import { swaggerOptions } from './config/swagger';
import { initializeDatabase } from './config/db';
import { initializeServer } from './init';

// Load environment variables
dotenv.config();

// Initialize Express app
const app = express();
const httpServer = createServer(app);
const isDevelopment = process.env.NODE_ENV !== 'production';
const isProduction = !isDevelopment;

// Configure Socket.io with conditional CORS
const io = new Server(httpServer, {
  cors: isDevelopment 
    ? {
        origin: "*",
        methods: ["GET", "POST", "PUT", "DELETE"],
        credentials: true
      } 
    : {
        origin: process.env.CLIENT_URL ?? 'http://localhost:5173',
        methods: ['GET', 'POST'],
        credentials: true
      }
});

// Setup middleware
if (isDevelopment) {
  console.log('Running in development mode - CORS disabled');
  app.use(cors({
    origin: "*",
    methods: ["GET", "POST", "PUT", "DELETE"],
    credentials: true
  }));
} else {
  console.log('Running in production mode - CORS enabled');
  app.use(cors({
    origin: process.env.CLIENT_URL ?? 'http://localhost:5173',
    credentials: true
  }));
}
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(morgan('dev'));

// Session setup
app.use(session({
  secret: process.env.SESSION_SECRET ?? 'spy-game-secret',
  resave: false,
  saveUninitialized: false,
  cookie: {
    maxAge: 1000 * 60 * 60 * 24, // 24 hours
    secure: isProduction
  }
}));

// Swagger documentation
const specs = swaggerJsDoc(swaggerOptions);
app.use('/api/api-docs', swaggerUi.serve, swaggerUi.setup(specs, {
  explorer: true,
  swaggerOptions: {
    persistAuthorization: true,
    displayRequestDuration: true,
    docExpansion: 'list',
    filter: true,
    showExtensions: true,
  }
}));

// Routes
app.use('/api/game', gameRoutes);

// Health check endpoints
app.get('/health', (req, res) => {
  res.status(200).json({ status: 'ok', timestamp: new Date() });
});

app.get('/api/health', (req, res) => {
  res.status(200).json({ status: 'ok', timestamp: new Date() });
});

// Socket.io setup
setupSocketHandlers(io);

// Error handling middleware
app.use((err: any, req: express.Request, res: express.Response, next: express.NextFunction) => {
  console.error('Error:', err);
  res.status(err.status ?? 500).json({
    message: err.message ?? 'Internal Server Error',
    stack: isDevelopment ? err.stack : undefined
  });
});

// Start server
const PORT = process.env.PORT ?? 3000;
httpServer.listen(PORT, async () => {
  try {
    // Initialize database
    await initializeDatabase();
    
    // Initialize server data
    await initializeServer();
    
    console.log(`Server running on port ${PORT}`);
    console.log(`Swagger docs available at http://localhost:${PORT}/api/api-docs`);
    
    // Fetch and display current admin password
    try {
      const { getGameSettings } = await import('./utils/settingsUtils');
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
