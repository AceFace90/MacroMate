/**
 * Open Food Facts barcode lookup.
 * Extracted from openFoodFactsSearch.js.
 */

import { getIndexedDB } from './db';
import { formatFoodResult } from './formatter';
import { loadOpenFoodFactsFoods } from './loader';

/**
 * Look up a product by barcode
 * @param {string} barcode - Product barcode
 * @returns {Object|null} - Product or null if not found
 */
export async function lookupByBarcode(barcode) {
  if (!barcode || barcode.trim().length === 0) {
    return null;
  }

  // Ensure database is loaded
  await loadOpenFoodFactsFoods(false);

  const db = await getIndexedDB();
  if (!db) {
    return null;
  }

  const transaction = db.transaction(['openfoodfacts_foods'], 'readonly');
  const store = transaction.objectStore('openfoodfacts_foods');
  const barcodeIndex = store.index('barcode');

  return new Promise((resolve) => {
    const request = barcodeIndex.get(barcode);
    request.onsuccess = () => {
      const product = request.result;
      if (product) {
        resolve(formatFoodResult(product));
      } else {
        resolve(null);
      }
    };
    request.onerror = () => {
      resolve(null);
    };
  });
}
