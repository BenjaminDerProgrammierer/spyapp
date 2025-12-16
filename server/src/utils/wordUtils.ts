import fs from 'fs';
import path from 'path';

interface WordWithHints {
  id: number;
  word: string;
  category: string;
  hints: string[];
}

interface WordList {
  words: WordWithHints[];
}

// Cache the wordlist in memory
let wordlistCache: WordList | null = null;

/**
 * Load wordlist from the JSON file
 */
export const loadWordlist = (): WordList => {
  if (wordlistCache) {
    return wordlistCache;
  }

  try {
    const wordlistPath = path.join(__dirname, '..', 'data', 'wordlist.json');
    
    // Check if file exists
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
      
      // Validate the structure of the loaded data
      if (!wordlistCache.words || !Array.isArray(wordlistCache.words)) {
        console.error('Invalid wordlist format: missing or invalid words array');
        return { words: [] };
      }
      
      // Log the loaded wordlist size
      console.log(`Successfully loaded wordlist with ${wordlistCache.words.length} words`);
      
      return wordlistCache;
    } catch (parseError) {
      console.error('Error parsing wordlist JSON:', parseError);
      return { words: [] };
    }
  } catch (error) {
    console.error('Error loading wordlist:', error);
    // Return empty list as fallback
    return { words: [] };
  }
};

/**
 * Invalidate the wordlist cache to force reloading from disk
 */
export const invalidateWordlistCache = (): void => {
  console.log('Invalidating wordlist cache');
  wordlistCache = null;
};

/**
 * Get a random word from the wordlist
 */
export const getRandomWord = (): WordWithHints | null => {
  const wordlist = loadWordlist();
  
  if (!wordlist.words || wordlist.words.length === 0) {
    return null;
  }
  
  const randomIndex = Math.floor(Math.random() * wordlist.words.length);
  return wordlist.words[randomIndex];
};

/**
 * Get a random hint for a specific word
 */
export const getRandomHintForWord = (word: string): string | null => {
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
  const randomIndex = Math.floor(Math.random() * wordData.hints.length);
  return wordData.hints[randomIndex];
};

/**
 * Get all words with their hints for admin purposes
 */
export const getAllWordsWithHints = (): { word: string; hints: string[] }[] => {
  const wordlist = loadWordlist();
  
  if (!wordlist.words || wordlist.words.length === 0) {
    return [];
  }
  
  return wordlist.words.map(w => ({
    word: w.word,
    hints: w.hints || []
  }));
};

/**
 * Get all words with their categories (for backward compatibility)
 */
export const getAllWords = (): { id: number; word: string; category: string }[] => {
  const wordlist = loadWordlist();
  
  if (!wordlist.words || wordlist.words.length === 0) {
    return [];
  }
  
  return wordlist.words.map(w => ({
    id: w.id,
    word: w.word,
    category: w.category
  }));
};
