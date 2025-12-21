import fs from 'node:fs';
import path from 'node:path';
import dotenv from 'dotenv';
import multer from 'multer';
import express from 'express';

import { query } from '../lib/db.ts';
import { verifyAdminPassword, getGameSettings, updateGameSettings } from '../lib/settingsUtils.ts';
import { getAllWordsWithHints, invalidateWordlistCache } from '../lib/wordUtils.ts';

dotenv.config();

const router = express.Router();
const upload = multer({ dest: 'uploads/' });

// Middleware to check admin password
const checkAdminPassword = async (req: express.Request, res: express.Response, next: express.NextFunction) => {
  const authHeader = req.headers.authorization;
  if (!authHeader) {
    res.status(401).json({ success: false, error: 'Authorization header missing' });
    return;
  }
  
  // Extract token from Bearer format
  const token = authHeader.replace('Bearer ', '');
  if (!token) {
    res.status(401).json({ success: false, error: 'Invalid token format' });
    return;
  }
  
  try {
    // Verify against admin password in settings
    const isValid = await verifyAdminPassword(token);
    if (!isValid) {
      res.status(401).json({ success: false, error: 'Invalid admin password' });
      return;
    }
    
    next();
  } catch (error) {
    console.error('Error verifying admin password:', error);
    res.status(500).json({ success: false, error: 'Server error verifying admin credentials' });
  }
};

/**
 * @swagger
 * /api/game/list:
 *   get:
 *     summary: Get list of available games
 *     tags: [Games]
 *     description: Returns all games that are currently in waiting status and accepting players
 *     responses:
 *       200:
 *         description: List of games waiting for players
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 games:
 *                   type: array
 *                   items:
 *                     $ref: '#/components/schemas/Game'
 *       500:
 *         description: Server error
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 */
router.get('/list', async (req, res, next) => {
  try {
    const result = await query(
      `SELECT g.id, g.host_id, g.status, g.created_at, 
       COUNT(p.id) as player_count
       FROM games g
       LEFT JOIN players p ON g.id = p.game_id
       WHERE g.status = 'waiting'
       GROUP BY g.id, g.host_id, g.status, g.created_at
       ORDER BY g.created_at DESC`,
      []
    );

    // Get host names for each game
    const gamesWithHostNames = await Promise.all(result.rows.map(async (game) => {
      const hostResult = await query(
        'SELECT name FROM players WHERE id = $1',
        [game.host_id]
      );
      
      const hostName = hostResult.rows.length > 0 ? hostResult.rows[0].name : 'Unknown';
      
      return {
        id: game.id,
        hostId: game.host_id,
        hostName,
        playerCount: Number.parseInt(game.player_count),
        status: game.status,
        createdAt: game.created_at
      };
    }));

    res.json({ success: true, games: gamesWithHostNames });
  } catch (error) {
    console.error('Error listing games:', error);
    res.status(500).json({ success: false, error: 'Server error' });
  }
});

/**
 * @swagger
 * /api/game/admin/wordlist:
 *   get:
 *     summary: Get the complete wordlist (Admin only)
 *     tags: [Admin]
 *     description: Returns all words with their hints and metadata from the active wordlist
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: List of words with hints
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 words:
 *                   type: array
 *                   items:
 *                     $ref: '#/components/schemas/Word'
 *       401:
 *         description: Unauthorized - Invalid or missing admin password
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 *       500:
 *         description: Server error
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 */
router.get('/admin/wordlist', checkAdminPassword, async (req, res, next) => {
  try {
    // Get words from our JSON wordlist instead of database
    const words = getAllWordsWithHints();
    
    res.json({ success: true, words });
  } catch (error) {
    console.error('Error getting wordlist:', error);
    res.status(500).json({ success: false, error: 'Server error' });
  }
});

/**
 * @swagger
 * /api/game/{id}:
 *   get:
 *     summary: Get game details by ID
 *     tags: [Games]
 *     description: Retrieves detailed information about a specific game including all players
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: Game ID (4-character code)
 *         example: ABCD
 *     responses:
 *       200:
 *         description: Game details with player list
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 game:
 *                   $ref: '#/components/schemas/Game'
 *       404:
 *         description: Game not found
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 *       500:
 *         description: Server error
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 */
router.get('/:id', async (req, res, next) => {
  try {
    const { id } = req.params;
    
    const gameResult = await query(
      'SELECT * FROM games WHERE id = $1',
      [id]
    );
  
    if (gameResult.rows.length === 0) {
      res.status(404).json({ success: false, error: 'Game not found' });
      return;
    }
    
    const game = gameResult.rows[0];
    
    const playersResult = await query(
      'SELECT id, name, role FROM players WHERE game_id = $1',
      [id]
    );
    
    const players = playersResult.rows.map(player => ({
      id: player.id,
      name: player.name,
      role: player.role
    }));
    
    res.json({
      success: true,
      game: {
        id: game.id,
        hostId: game.host_id,
        status: game.status,
        players,
        createdAt: game.created_at
      }
    });
  } catch (error) {
    console.error('Error getting game:', error);
    res.status(500).json({ success: false, error: 'Server error' });
  }
});

/**
 * @swagger
 * /api/game/admin/verify:
 *   post:
 *     summary: Verify admin password
 *     tags: [Admin]
 *     description: Validates whether the provided password matches the admin password
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - password
 *             properties:
 *               password:
 *                 type: string
 *                 description: Admin password to verify
 *                 example: spymaster2025
 *     responses:
 *       200:
 *         description: Password verification result
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 isValid:
 *                   type: boolean
 *                   description: Whether the password is valid
 *       400:
 *         description: Bad request - Password field missing
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 *       500:
 *         description: Server error
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 */
router.post('/admin/verify', async (req, res) => {
  try {
    const { password } = req.body;
    
    if (!password) {
      res.status(400).json({ success: false, error: 'Password is required' });
      return;
    }
    
    const isValid = await verifyAdminPassword(password);
    res.json({ success: true, isValid });
  } catch (error) {
    console.error('Error verifying admin password:', error);
    res.status(500).json({ success: false, error: 'Server error' });
  }
});

/**
 * @swagger
 * /api/game/admin/settings:
 *   get:
 *     summary: Get current game settings
 *     tags: [Admin]
 *     description: Retrieves current game configuration settings (excludes admin password)
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Current game settings
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 settings:
 *                   $ref: '#/components/schemas/GameSettings'
 *       401:
 *         description: Unauthorized - Invalid admin password
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 *       500:
 *         description: Server error
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 */
router.get('/admin/settings', checkAdminPassword, async (req, res) => {
  try {
    const settings = await getGameSettings();
    
    // Don't send the admin password in the response
    const { adminPassword, ...safeSettings } = settings;
    
    res.json({ success: true, settings: safeSettings });
  } catch (error) {
    console.error('Error getting game settings:', error);
    res.status(500).json({ success: false, error: 'Server error' });
  }
});

/**
 * @swagger
 * /api/game/admin/settings:
 *   put:
 *     summary: Update game settings
 *     tags: [Admin]
 *     description: Updates one or more game configuration settings. All fields are optional.
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               showHintsToRegularUsers:
 *                 type: boolean
 *                 description: Whether regular (non-spy) players can see hints
 *               adminPassword:
 *                 type: string
 *                 description: New admin password (minimum 1 character)
 *               minPlayersToStart:
 *                 type: integer
 *                 minimum: 2
 *                 description: Minimum players required to start a game (min 2)
 *     responses:
 *       200:
 *         description: Settings updated successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *       400:
 *         description: Bad request - Invalid settings values
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 *       401:
 *         description: Unauthorized - Invalid admin password
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 *       500:
 *         description: Server error
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 */
router.put('/admin/settings', checkAdminPassword, async (req, res) => {
  try {
    const { showHintsToRegularUsers, adminPassword, minPlayersToStart } = req.body;
    
    const settings: any = {};
    
    if (showHintsToRegularUsers !== undefined) {
      settings.showHintsToRegularUsers = !!showHintsToRegularUsers; // Convert to boolean
    }
    
    if (adminPassword !== undefined && adminPassword.trim() !== '') {
      settings.adminPassword = adminPassword.trim();
    }
    
    if (minPlayersToStart !== undefined) {
      settings.minPlayersToStart = Math.max(2, Number.parseInt(minPlayersToStart, 10) || 3);
    }
    
    const updated = await updateGameSettings(settings);
    
    if (!updated) {
      res.status(500).json({ success: false, error: 'Failed to update settings' });
      return;
    }
    
    res.json({ success: true });
  } catch (error) {
    console.error('Error updating game settings:', error);
    res.status(500).json({ success: false, error: 'Server error' });
  }
});

/**
 * @swagger
 * /api/game/admin/wordlist/upload:
 *   post:
 *     summary: Upload a new wordlist in JSON format
 *     tags: [Admin]
 *     description: |
 *       Uploads a new wordlist file in JSON format. The file must contain a "words" array where each word object has:
 *       - id: unique integer
 *       - word: the word string
 *       - category: word category
 *       - hints: array of hint strings (must not be empty)
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         multipart/form-data:
 *           schema:
 *             type: object
 *             required:
 *               - file
 *             properties:
 *               file:
 *                 type: string
 *                 format: binary
 *                 description: JSON file containing wordlist data
 *     responses:
 *       200:
 *         description: Wordlist uploaded and activated successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 message:
 *                   type: string
 *                   example: Wordlist updated with 150 words
 *       400:
 *         description: Bad request - No file, invalid JSON, or invalid wordlist structure
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 *       401:
 *         description: Unauthorized - Invalid admin password
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 *       500:
 *         description: Server error or file permission issue
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 */
router.post('/admin/wordlist/upload', checkAdminPassword, upload.single('file'), (req, res) => {
  try {
    if (!req.file) {
      res.status(400).json({ success: false, error: 'No file uploaded' });
      return;
    }
    
    // Read the uploaded file
    const fileContent = fs.readFileSync(req.file.path, 'utf8');
    let wordlist;
    
    try {
      // Parse JSON content
      wordlist = JSON.parse(fileContent);
      
      // Validate wordlist structure
      if (!Array.isArray(wordlist.words)) {
        res.status(400).json({ 
          success: false, 
          error: 'Invalid wordlist format: words field should be an array'
        });
        return;
      }
      
      // Basic validation of words using optional chaining
      const sampleWord = wordlist.words[0];
      if (!sampleWord?.word || !Array.isArray(sampleWord?.hints) || sampleWord?.hints.length === 0) {
        res.status(400).json({ 
          success: false, 
          error: 'Invalid wordlist format: each word must have a word field and a non-empty hints array'
        });
        return;
      }
      
      // Write the file to the wordlist location using absolute path
      const wordlistPath = path.resolve(__dirname, '..', 'data', 'wordlist.json');
      console.log(`Writing wordlist to: ${wordlistPath}`);
      
      try {
        fs.writeFileSync(wordlistPath, JSON.stringify(wordlist, null, 2));
        console.log('Wordlist file written successfully');
      } catch (writeError) {
        console.error('Error writing wordlist file:', writeError);
        res.status(500).json({ success: false, error: 'Could not write to wordlist file. Check server permissions.' });
        return;
      }
      
      // Clean up the uploaded file
      fs.unlinkSync(req.file.path);
      
      // Invalidate the wordlist cache so the next request gets the new data
      invalidateWordlistCache();
      
      res.json({ 
        success: true, 
        message: `Wordlist updated with ${wordlist.words.length} words`
      });
    } catch (parseError) {
      console.error('Error parsing wordlist JSON:', parseError);
      res.status(400).json({ success: false, error: 'Invalid JSON format' });
    }
  } catch (error) {
    console.error('Error uploading wordlist:', error);
    res.status(500).json({ success: false, error: 'Server error' });
  }
});

export default router;
