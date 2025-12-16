import fs from 'fs';
import path from 'path';
import { loadWordlist } from './utils/wordUtils';

/**
 * Initialize the server's data directory and wordlist
 */
export const initializeServer = async (): Promise<void> => {
  console.log('Initializing server data...');
  
  // Create data directory if it doesn't exist
  const dataDir = path.join(__dirname, 'data');
  if (!fs.existsSync(dataDir)) {
    console.log('Creating data directory');
    fs.mkdirSync(dataDir, { recursive: true });
  }

  // Check if wordlist.json exists
  const wordlistPath = path.join(dataDir, 'wordlist.json');
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
    if (!sampleWord.hints || !Array.isArray(sampleWord.hints) || sampleWord.hints.length === 0) {
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
