import { Pool } from 'pg';
import dotenv from 'dotenv';

dotenv.config();


const connectionString = `postgresql://${process.env.DB_USER ?? 'postgres'}:${process.env.DB_PASSWORD ?? 'postgres'}@${process.env.DB_HOST ?? 'localhost'}:${process.env.DB_PORT ?? '5432'}/${process.env.DB_NAME ?? 'spyapp'}`;

// Configure database connection with appropriate SSL settings
const pool = new Pool({
  connectionString: connectionString,
  ssl: false,
  max: 20, // Maximum number of clients in the pool
  idleTimeoutMillis: 30000, // Close idle clients after 30 seconds
  connectionTimeoutMillis: 2000, // Return an error after 2 seconds if connection could not be established
});

// Test the connection with better error handling
const testConnection = async () => {
  try {
    const client = await pool.connect();
    console.log('Successfully connected to the database');
    client.release();
  } catch (err: any) {
    console.error('Database connection error:', err.message);
    console.info('Database URL:', connectionString.replace(/:[^:]*@/, ':***@')); // Hide password in logs
    throw err;
  }
};

// Initialize connection test
testConnection().catch((error) => {
  console.error('Failed to connect to database on startup:', error);
  process.exit(1);
});

export const query = (text: string, params: any[]) => pool.query(text, params);

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
      CREATE TABLE IF NOT EXISTS wordlist (
        id SERIAL PRIMARY KEY,
        word VARCHAR(100) NOT NULL UNIQUE,
        category VARCHAR(50)
      );
    `);

    // Insert initial wordlist if it's empty
    const wordCount = await pool.query('SELECT COUNT(*) FROM wordlist');
    if (parseInt(wordCount.rows[0].count) === 0) {
      console.log('Populating initial wordlist...');
      const initialWords = [
        { word: 'elephant', category: 'animals' },
        { word: 'guitar', category: 'music' },
        { word: 'basketball', category: 'sports' },
        { word: 'pizza', category: 'food' },
        { word: 'tornado', category: 'nature' },
        { word: 'computer', category: 'technology' },
        { word: 'telescope', category: 'science' },
        { word: 'pyramid', category: 'architecture' },
        { word: 'firework', category: 'events' },
        { word: 'ballet', category: 'arts' },
        { word: 'democracy', category: 'politics' },
        { word: 'submarine', category: 'vehicles' },
        { word: 'detective', category: 'professions' },
        { word: 'rainbow', category: 'nature' },
        { word: 'oxygen', category: 'science' },
        { word: 'dictionary', category: 'books' },
        { word: 'vaccination', category: 'medicine' },
        { word: 'meditation', category: 'wellness' },
        { word: 'chandelier', category: 'household' },
        { word: 'origami', category: 'crafts' }
      ];

      for (const wordObj of initialWords) {
        await pool.query(
          'INSERT INTO wordlist (word, category) VALUES ($1, $2)',
          [wordObj.word, wordObj.category]
        );
      }
      console.log(`Initial wordlist loaded with ${initialWords.length} words`);
    }

    // Check if hint_word column exists and drop it if it does (cleanup old schema)
    const columnCheckResult = await pool.query(`
      SELECT column_name
      FROM information_schema.columns
      WHERE table_name = 'games'
      AND column_name = 'hint_word';
    `);
    
    if (columnCheckResult.rows.length > 0) {
      console.log('Dropping unused hint_word column from games table');
      await pool.query('ALTER TABLE games DROP COLUMN hint_word;');
    }

    // Create settings table if it doesn't exist
    await pool.query(`
      CREATE TABLE IF NOT EXISTS settings (
        key TEXT PRIMARY KEY,
        value JSONB NOT NULL,
        updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
      );
    `);
    
    // Add default settings if they don't exist
    const defaultSettings = [
      {
        key: 'gameSettings',
        value: JSON.stringify({
          showHintsToRegularUsers: false,
          adminPassword: 'spymaster2025', // Default password
          minPlayersToStart: 3
        })
      }
    ];
    
    for (const setting of defaultSettings) {
      // Check if setting exists
      const existingResult = await pool.query(
        'SELECT key FROM settings WHERE key = $1',
        [setting.key]
      );
      
      if (existingResult.rowCount === 0) {
        // Insert default setting
        await pool.query(
          'INSERT INTO settings (key, value) VALUES ($1, $2)',
          [setting.key, setting.value]
        );
        console.log(`Created default setting: ${setting.key}`);
      }
    }

    console.log('Database initialization completed successfully');
  } catch (error) {
    console.error('Error initializing database:', error);
    throw error;
  }
};

export default pool;
