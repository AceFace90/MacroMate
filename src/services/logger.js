/**
 * Logger Utility
 * Provides structured logging with levels (debug, info, warn, error)
 * Debug logs only appear in development mode
 */

const isDev = process.env.NODE_ENV === 'development' || 
              (typeof window !== 'undefined' && window.location.hostname === 'localhost');

const logger = {
  /**
   * Debug logs - only in development
   */
  debug: (...args) => {
    if (isDev) {
      console.log('[DEBUG]', ...args);
    }
  },

  /**
   * Info logs - always shown
   */
  info: (...args) => {
    console.log('[INFO]', ...args);
  },

  /**
   * Warning logs - always shown
   */
  warn: (...args) => {
    console.warn('[WARN]', ...args);
  },

  /**
   * Error logs - always shown
   */
  error: (...args) => {
    console.error('[ERROR]', ...args);
  },

  /**
   * Group logs for better organization
   */
  group: (label, fn) => {
    if (isDev) {
      console.group(label);
      try {
        fn();
      } finally {
        console.groupEnd();
      }
    } else {
      fn();
    }
  },

  /**
   * Time operations
   */
  time: (label) => {
    if (isDev) {
      console.time(label);
    }
  },

  timeEnd: (label) => {
    if (isDev) {
      console.timeEnd(label);
    }
  }
};

export default logger;
