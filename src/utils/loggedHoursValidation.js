// src/utils/loggedHoursValidation.js
// Utility functions for logged hours validation

/**
 * Validate that total hours per calendar day doesn't exceed 24 hours
 * @param {Array} blocks - Array of hour blocks with days, dates, and times
 * @returns {{valid: boolean, violations: Array, dayTotals: Object}} - Validation result
 */
export function validate24HourLimit(blocks) {
  const dayTotals = {}; // { 'YYYY-MM-DD': minutes }
  
  const DAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
  
  for (const block of blocks) {
    if (!block.start_date || !block.end_date || !block.start_time || !block.end_time) {
      continue; // Skip incomplete blocks
    }

    // Calculate minutes per occurrence
    const minutesPerOccurrence = minutesBetweenTimes(block.start_time, block.end_time);
    if (minutesPerOccurrence <= 0) continue;

    // Iterate through date range
    const startDate = new Date(block.start_date);
    const endDate = new Date(block.end_date);
    
    for (let d = new Date(startDate); d <= endDate; d.setDate(d.getDate() + 1)) {
      const dayOfWeek = DAY_NAMES[d.getDay()];
      
      // Check if this day is selected in the block
      if (block.days && block.days.includes(dayOfWeek)) {
        const dateKey = d.toISOString().split('T')[0];
        dayTotals[dateKey] = (dayTotals[dateKey] || 0) + minutesPerOccurrence;
      }
    }
  }
  
  // Check for any day exceeding 1440 minutes (24 hours)
  const violations = Object.entries(dayTotals)
    .filter(([date, mins]) => mins > 1440)
    .map(([date, mins]) => ({
      date,
      hours: (mins / 60).toFixed(1),
      minutes: mins
    }));
  
  return { 
    valid: violations.length === 0, 
    violations,
    dayTotals 
  };
}

/**
 * Calculate minutes between two time strings
 * @param {string} startTime - Format "HH:MM"
 * @param {string} endTime - Format "HH:MM"
 * @returns {number} - Minutes (can be negative if end < start)
 */
function minutesBetweenTimes(startTime, endTime) {
  if (!startTime || !endTime) return 0;
  
  const [startHour, startMin] = startTime.split(':').map(Number);
  const [endHour, endMin] = endTime.split(':').map(Number);
  
  const startMinutes = startHour * 60 + startMin;
  const endMinutes = endHour * 60 + endMin;
  
  return endMinutes - startMinutes;
}

/**
 * Validate word count for notes field
 * @param {string} text - The notes text
 * @param {number} maxWords - Maximum allowed words (default 100)
 * @returns {{valid: boolean, count: number, maxWords: number}} - Validation result
 */
export function validateWordCount(text, maxWords = 100) {
  if (!text || text.trim().length === 0) {
    return { valid: true, count: 0, maxWords };
  }
  
  // Split by whitespace and filter out empty strings
  const words = text.trim().split(/\s+/).filter(w => w.length > 0);
  const count = words.length;
  
  return {
    valid: count <= maxWords,
    count,
    maxWords
  };
}

/**
 * Rate limit submissions using localStorage
 * @param {string} key - Storage key (e.g., 'logHoursSubmissions')
 * @param {number} maxSubmissions - Max submissions allowed (default 5)
 * @param {number} windowMs - Time window in milliseconds (default 1 hour)
 * @returns {{allowed: boolean, remaining: number, nextAllowedTime: Date|null}} - Rate limit status
 */
export function checkRateLimit(key, maxSubmissions = 5, windowMs = 60 * 60 * 1000) {
  try {
    const stored = localStorage.getItem(key);
    let timestamps = stored ? JSON.parse(stored) : [];
    
    // Filter to only recent submissions within the time window
    const now = Date.now();
    timestamps = timestamps.filter(ts => now - ts < windowMs);
    
    const allowed = timestamps.length < maxSubmissions;
    const remaining = Math.max(0, maxSubmissions - timestamps.length);
    
    let nextAllowedTime = null;
    if (!allowed && timestamps.length > 0) {
      // When the oldest timestamp expires
      const oldestTimestamp = Math.min(...timestamps);
      nextAllowedTime = new Date(oldestTimestamp + windowMs);
    }
    
    return {
      allowed,
      remaining,
      nextAllowedTime,
      current: timestamps.length
    };
  } catch (error) {
    console.error('Rate limit check failed:', error);
    // On error, allow the action (fail open)
    return { allowed: true, remaining: maxSubmissions, nextAllowedTime: null };
  }
}

/**
 * Record a submission for rate limiting
 * @param {string} key - Storage key
 * @param {number} windowMs - Time window in milliseconds
 */
export function recordSubmission(key, windowMs = 60 * 60 * 1000) {
  try {
    const stored = localStorage.getItem(key);
    let timestamps = stored ? JSON.parse(stored) : [];
    
    // Add current timestamp
    const now = Date.now();
    timestamps.push(now);
    
    // Clean old timestamps
    timestamps = timestamps.filter(ts => now - ts < windowMs);
    
    localStorage.setItem(key, JSON.stringify(timestamps));
  } catch (error) {
    console.error('Failed to record submission:', error);
  }
}

/**
 * Format time remaining until rate limit resets
 * @param {Date} resetTime - When the limit resets
 * @returns {string} - Human-readable format
 */
export function formatRateLimitReset(resetTime) {
  if (!resetTime) return '';
  
  const now = new Date();
  const diffMs = resetTime - now;
  
  if (diffMs <= 0) return 'now';
  
  const minutes = Math.ceil(diffMs / (60 * 1000));
  
  if (minutes < 60) {
    return `${minutes} minute${minutes === 1 ? '' : 's'}`;
  }
  
  const hours = Math.floor(minutes / 60);
  const remainingMinutes = minutes % 60;
  
  if (remainingMinutes === 0) {
    return `${hours} hour${hours === 1 ? '' : 's'}`;
  }
  
  return `${hours}h ${remainingMinutes}m`;
}

/**
 * Calculate total hours from hour blocks
 * @param {Array} blocks - Array of hour blocks
 * @returns {number} - Total hours (rounded to 1 decimal)
 */
export function calculateTotalHours(blocks) {
  const DAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
  let totalMinutes = 0;
  
  for (const block of blocks) {
    if (!block.start_date || !block.end_date || !block.start_time || !block.end_time) {
      continue;
    }

    const minutesPerOccurrence = minutesBetweenTimes(block.start_time, block.end_time);
    if (minutesPerOccurrence <= 0) continue;

    const startDate = new Date(block.start_date);
    const endDate = new Date(block.end_date);
    let occurrences = 0;
    
    for (let d = new Date(startDate); d <= endDate; d.setDate(d.getDate() + 1)) {
      const dayOfWeek = DAY_NAMES[d.getDay()];
      if (block.days && block.days.includes(dayOfWeek)) {
        occurrences++;
      }
    }
    
    totalMinutes += minutesPerOccurrence * occurrences;
  }
  
  return Math.round((totalMinutes / 60) * 10) / 10; // Round to 1 decimal
}
