import { v4 as uuidv4 } from 'uuid';

// Key used for localStorage
const USER_ID_KEY = 'spyapp_user_id';

/**
 * Gets the user's unique ID from localStorage or generates a new one if none exists
 * @returns {string} The user ID
 */
export const getUserId = (): string => {
  let userId = localStorage.getItem(USER_ID_KEY);
  
  // If no user ID exists, create one and store it
  if (!userId) {
    userId = uuidv4();
    localStorage.setItem(USER_ID_KEY, userId);
    console.log('Created new user ID:', userId);
  } else {
    console.log('Using existing user ID:', userId);
  }
  
  return userId;
};

/**
 * Resets the user ID (typically used for testing)
 */
export const resetUserId = (): void => {
  localStorage.removeItem(USER_ID_KEY);
};
