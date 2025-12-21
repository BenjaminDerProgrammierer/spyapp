import fs from 'node:fs';
import url from 'node:url'
import path from 'node:path';

type Word =  {
  id: number;
  word: string;
  category: string;
  hints: string[];
}

interface WordList {
  words: Word[];
}

// Cache the wordlist in memory
let wordlistCache: WordList | null = null;

// Calculate __filename and __dirname
const __filename = url.fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const dataDirPath = path.join(__dirname, '..', '..', 'data');
const wordlistPath = path.join(dataDirPath, 'wordlist.json');

/**
 * Load wordlist from the JSON file
 */
export function loadWordlist(): WordList {
  if (wordlistCache) {
    return wordlistCache;
  }

  try {
    if (!fs.existsSync(wordlistPath)) {
      console.error(`Wordlist file not found at path: ${wordlistPath}`);
      return { words: [] };
    }
    
    const wordlistData = fs.readFileSync(wordlistPath, 'utf8');
    if (!wordlistData || wordlistData.trim() === '') {
      console.error('Wordlist file is empty');
      return { words: [] };
    }
    
    try {
      wordlistCache = JSON.parse(wordlistData) as WordList;
      if (!wordlistCache.words || !Array.isArray(wordlistCache.words)) {
        console.error('Invalid wordlist format: missing or invalid words array');
        return { words: [] };
      }
      
      console.log(`Successfully loaded wordlist with ${wordlistCache.words.length} words`);
      return wordlistCache;
    } catch (e) {
      console.error('Error parsing wordlist JSON:', e);
      return { words: [] };
    }
  } catch (e) {
    console.error('Error loading wordlist:', e);
    return { words: [] };
  }
};

/**
 * Invalidate the wordlist cache to force reloading from disk
 */
export function invalidateWordlistCache(): void {
  console.log('Invalidating wordlist cache');
  wordlistCache = null;
};

/**
 * Get a random word from the wordlist
 */
export function getRandomWord(): Word | null {
  const wordlist = loadWordlist();
  
  if (!wordlist.words || wordlist.words.length === 0) {
    return null;
  }
  
  return wordlist.words.at(Math.floor(Math.random() * wordlist.words.length)) ?? null;
};

/**
 * Get a random hint for a specific word
 */
export function getRandomHintForWord(word: string): string | null {
  const wordlist = loadWordlist();
  
  if (!wordlist.words || wordlist.words.length === 0) {
    return null;
  }
  
  // Find the word in the list
  const wordData = wordlist.words.find(w => w.word.toLowerCase() === word.toLowerCase());
  if (!wordData?.hints?.length) {
    return null;
  }
  
  // Select a random hint
  return wordData.hints.at(Math.floor(Math.random() * wordData.hints.length)) ?? null;
};

/**
 * Get all words with their hints for admin purposes
 */
export function getAllWordsWithHints(): Word[] {
  const wordlist = loadWordlist();
  
  if (!wordlist.words || wordlist.words.length === 0) {
    return [];
  }
  
  return wordlist.words;
};
/**
 * Initialize the server's data directory and wordlist
 */
export async function initializeData(): Promise<void> {
  console.log('Initializing server data...');

  // Create data directory if it doesn't exist
  if (!fs.existsSync(dataDirPath)) {
    console.log('Creating data directory');
    fs.mkdirSync(dataDirPath, { recursive: true });
  }

  // Check if wordlist.json exists
  if (!fs.existsSync(wordlistPath)) {
    console.error('Wordlist file not found at path:', wordlistPath);
    console.error('Please ensure wordlist.json is properly set up in the data directory');
    return;
  }

  // Pre-load wordlist to check it exists and is valid
  try {
    const wordlist = loadWordlist();
    
    if (wordlist.words.length === 0) {
      console.error('WARNING: Wordlist is empty! Games will not function properly.');
      return;
    }
    
    console.log(`Successfully loaded wordlist with ${wordlist.words.length} words`);
    
    // Validate a sample word to ensure hints are present
    const sampleWord = wordlist.words[0];
    if (!sampleWord?.hints || !Array.isArray(sampleWord.hints) || sampleWord.hints.length === 0) {
      console.error('WARNING: Wordlist format is invalid - hints array is missing or empty');
      return;
    }
    
    console.log(`Wordlist format looks good - sample word "${sampleWord.word}" has ${sampleWord.hints.length} hints`);
    console.log('Server initialization complete');
  } catch (error) {
    console.error('Critical error loading wordlist:', error);
    throw error;
  }
};
