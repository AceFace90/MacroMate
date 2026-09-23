/**
 * Open Food Facts update checking.
 * Extracted from openFoodFactsSearch.js.
 */

import { OFF_FULL_GZ } from './loader';

let lastUpdateCheck = null;

/**
 * Check if database update is available
 * @returns {Promise<Object>} Update info with hasUpdate, lastUpdate, etc.
 */
async function checkForUpdates() {
  try {
    const response = await fetch(OFF_FULL_GZ, { method: 'HEAD' });
    const lastModified = response.ok ? response.headers.get('last-modified') : null;

    // Compare with stored last update time
    const storedLastUpdate = localStorage.getItem('openfoodfacts_last_update');

    return {
      hasUpdate: !storedLastUpdate || (lastModified && lastModified > storedLastUpdate),
      lastUpdate: lastModified || storedLastUpdate,
      storedLastUpdate: storedLastUpdate
    };
  } catch (error) {
    console.error('Error checking for updates:', error);
    return { hasUpdate: false, error: error.message };
  }
}

/**
 * Get update information
 */
export async function getUpdateInfo() {
  return await checkForUpdates();
}
