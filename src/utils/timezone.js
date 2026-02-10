// Timezone utilities for UK time (Europe/London)
// Handles GMT/BST automatically

const UK_TIMEZONE = 'Europe/London';

/**
 * Convert a date to UK timezone
 * @param {Date|string|number} date - The date to convert
 * @returns {Date} Date in UK timezone
 */
export const toUKTime = (date) => {
  const dateObj = date instanceof Date ? date : new Date(date);
  
  // Get UK time string and parse it back to Date
  const ukString = dateObj.toLocaleString('en-GB', { timeZone: UK_TIMEZONE });
  return new Date(ukString);
};

/**
 * Get current time in UK timezone
 * @returns {Date} Current UK time
 */
export const getCurrentUKTime = () => {
  return toUKTime(new Date());
};

/**
 * Format a date in UK timezone
 * @param {Date|string|number} date - The date to format
 * @param {object} options - Intl.DateTimeFormat options
 * @returns {string} Formatted date string
 */
export const formatUKTime = (date, options = {}) => {
  const dateObj = date instanceof Date ? date : new Date(date);
  
  const defaultOptions = {
    timeZone: UK_TIMEZONE,
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    ...options
  };
  
  return new Intl.DateTimeFormat('en-GB', defaultOptions).format(dateObj);
};

/**
 * Format a date in UK timezone (short format)
 * @param {Date|string|number} date
 * @returns {string} e.g., "09/02/2026"
 */
export const formatUKDate = (date) => {
  const dateObj = date instanceof Date ? date : new Date(date);
  return new Intl.DateTimeFormat('en-GB', { 
    timeZone: UK_TIMEZONE,
    day: '2-digit',
    month: '2-digit',
    year: 'numeric'
  }).format(dateObj);
};

/**
 * Check if a date is in the past (UK time)
 * @param {Date|string|number} date
 * @returns {boolean}
 */
export const isInPastUK = (date) => {
  const dateObj = date instanceof Date ? date : new Date(date);
  const now = getCurrentUKTime();
  return dateObj < now;
};

/**
 * Get hours ago from a date (UK time)
 * @param {Date|string|number} date
 * @returns {number} Hours since the date
 */
export const getHoursAgoUK = (date) => {
  const dateObj = date instanceof Date ? date : new Date(date);
  const now = getCurrentUKTime();
  return Math.floor((now - dateObj) / (1000 * 60 * 60));
};

/**
 * Get a date N hours ago from now (UK time)
 * @param {number} hours
 * @returns {Date}
 */
export const getHoursAgoDateUK = (hours) => {
  const now = getCurrentUKTime();
  return new Date(now - hours * 60 * 60 * 1000);
};
