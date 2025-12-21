import { Pool } from 'pg';
import dotenv from 'dotenv';
import { getGameSettings } from './settingsUtils.ts';

dotenv.config();

const connectionString = process.env.DB_CONNECTION_STRING;

if (!connectionString) {
  throw new Error('Database connection string is not defined in environment variables');
}

const pool = new Pool({
  connectionString: connectionString,
  ssl: false,
  max: 20,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 2000,
});

async function testConnection(): Promise<boolean> {
  try {
    const client = await pool.connect();
    console.log('Successfully connected to the database');
    client.release();
    return true;
  } catch {
    console.error('Failed to connect to the database');
    return false;
  }
};

// Initialize connection test
if (!await testConnection()) {
  process.exit(1);
}

export function query(text: string, params?: any[]) {
  return pool.query(text, params);
}

export const initializeDatabase = async () => {
  try {
    console.log('Initializing database tables...');

    // Create tables if they don't exist
    await pool.query(`
      CREATE TABLE IF NOT EXISTS games (
        id VARCHAR(36) PRIMARY KEY,
        host_id VARCHAR(36) NOT NULL,
        status VARCHAR(20) NOT NULL DEFAULT 'waiting',
        word VARCHAR(100),
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `);

    await pool.query(`
      CREATE TABLE IF NOT EXISTS players (
        id VARCHAR(36) PRIMARY KEY,
        game_id VARCHAR(36) REFERENCES games(id) ON DELETE CASCADE,
        name VARCHAR(100) NOT NULL,
        role VARCHAR(20) DEFAULT 'regular',
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `);
    
    await pool.query(`
      CREATE TABLE IF NOT EXISTS settings (
        key TEXT PRIMARY KEY,
        value JSONB NOT NULL,
        updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
      );
    `);

    // Populate default game settings
    await getGameSettings();

    console.log('Database initialization completed successfully');
  } catch (error) {
    console.error('Error initializing database');
    throw error;
  }
};
