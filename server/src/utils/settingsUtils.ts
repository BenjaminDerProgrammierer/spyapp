import { query } from '../config/db';

interface GameSettings {
  showHintsToRegularUsers: boolean;
  adminPassword: string;
  minPlayersToStart: number;
}

const DEFAULT_GAME_SETTINGS: GameSettings = {
  showHintsToRegularUsers: false,
  adminPassword: 'spymaster2025',  // Default password
  minPlayersToStart: 3
};

/**
 * Get game settings from database
 * @returns GameSettings object with current settings
 */
export const getGameSettings = async (): Promise<GameSettings> => {
  try {
    const result = await query(
      'SELECT value FROM settings WHERE key = $1',
      ['gameSettings']
    );
    
    if (result.rowCount === 0) {
      // No settings found, create default settings
      await query(
        'INSERT INTO settings (key, value) VALUES ($1, $2)',
        ['gameSettings', JSON.stringify(DEFAULT_GAME_SETTINGS)]
      );
      return DEFAULT_GAME_SETTINGS;
    }
    
    return result.rows[0].value as GameSettings;
  } catch (error) {
    console.error('Error fetching game settings:', error);
    return DEFAULT_GAME_SETTINGS;
  }
};

/**
 * Update game settings in the database
 * @param settings GameSettings object with updated values
 * @returns true if update was successful, false otherwise
 */
export const updateGameSettings = async (settings: Partial<GameSettings>): Promise<boolean> => {
  try {
    // First get current settings
    const currentSettings = await getGameSettings();
    
    // Merge with new settings
    const updatedSettings = { 
      ...currentSettings,
      ...settings,
      // Ensure the password is never empty, use the current one if not provided
      adminPassword: settings.adminPassword ?? currentSettings.adminPassword
    };
    
    // Update in database
    await query(
      'UPDATE settings SET value = $1, updated_at = CURRENT_TIMESTAMP WHERE key = $2',
      [JSON.stringify(updatedSettings), 'gameSettings']
    );
    
    // Log the settings update, especially the showHintsToRegularUsers change
    console.log('Game settings updated:', {
      ...updatedSettings,
      adminPassword: '[REDACTED]' // Don't log the actual password
    });
    
    return true;
  } catch (error) {
    console.error('Error updating game settings:', error);
    return false;
  }
};

/**
 * Verify admin password
 * @param password Password to verify
 * @returns true if password is correct, false otherwise
 */
export const verifyAdminPassword = async (password: string): Promise<boolean> => {
  try {
    const settings = await getGameSettings();
    return password === settings.adminPassword;
  } catch (error) {
    console.error('Error verifying admin password:', error);
    return false;
  }
};
