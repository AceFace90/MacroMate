/**
 * Open Food Facts database loading (download, decompress, import into IndexedDB).
 * Extracted from openFoodFactsSearch.js.
 */

import { getIndexedDB } from './db';

// Single OFF database .gz only (loaded when user clicks Download in Profile).
export const OFF_FULL_GZ = '/data/openfoodfacts_foods.compressed.json.gz';

/**
 * Ensure IndexedDB is available. Does NOT auto-load any OFF data (no bundled core/extended).
 * OFF data is only loaded when the user explicitly downloads the database, or when
 * auto-load runs (store empty + /data/ file available).
 */
export async function loadOpenFoodFactsFoods() {
  const db = await getIndexedDB();
  if (!db) {
    console.warn('⚠️  IndexedDB not available');
    return [];
  }
  return []; // OFF data lives in IndexedDB; search/lookup query it directly
}

/**
 * Fetch a .gz URL, decompress, parse JSON, and decompress the short-key format.
 * @param {string} url
 * @returns {Promise<Array|null>} - Array of food objects or null on failure
 */
export async function fetchAndDecompressGz(url) {
  const response = await fetch(url);
  if (!response.ok) return null;
  const contentType = (response.headers.get('Content-Type') || '').toLowerCase();
  if (contentType && !contentType.includes('gzip') && !contentType.includes('octet-stream') && contentType.includes('text/html')) {
    return null;
  }
  try {
    const decompressionStream = new DecompressionStream('gzip');
    const decompressedStream = response.body.pipeThrough(decompressionStream);
    const blob = await new Response(decompressedStream).blob();
    const text = await blob.text();
    const compressedData = JSON.parse(text);
    const { decompressDatabase } = await import('../../utils/decompressOpenFoodFacts');
    return decompressDatabase(compressedData);
  } catch (err) {
    const msg = err && err.message ? err.message : String(err);
    if (msg.includes('decode') || msg.includes('Decode') || msg.includes('JSON')) {
      console.warn('Open Food Facts database file not available or invalid (server may not have it deployed). Using API for search.');
      return null;
    }
    throw err;
  }
}

/**
 * Load the full Open Food Facts database into IndexedDB.
 * Uses a single .gz file only (served at /data/openfoodfacts_foods.compressed.json.gz).
 * Only writes to openfoodfacts_foods store; does not touch saved_foods, food_logs, or users (legacy-safe).
 * @param {IDBDatabase} db - IndexedDB instance
 * @returns {Promise<boolean>} - true if data was loaded and written, false if no file/data available
 */
export async function loadDatabaseFile(db) {
  console.log('📥 Loading Open Food Facts database (single .gz) into IndexedDB...');
  try {
    const startTime = performance.now();
    const foodsData = await fetchAndDecompressGz(OFF_FULL_GZ);

    if (!foodsData || foodsData.length === 0) {
      console.warn('⚠️  No Open Food Facts database found. Add openfoodfacts_foods.compressed.json.gz to client/public/data/ (see docs/DATA-FILES-AND-BUILD.md).');
      return false;
    }

    console.log(`✅ Decompressed ${foodsData.length.toLocaleString()} foods from single .gz (${((performance.now() - startTime) / 1000).toFixed(2)}s)`);

    // Import into IndexedDB in batches (to avoid memory issues and quota errors)
    const batchSize = 10000;

    console.log(`💾 Storing ${foodsData.length.toLocaleString()} foods in IndexedDB...`);
    console.log(`   This may take a few minutes for large databases...`);

    for (let i = 0; i < foodsData.length; i += batchSize) {
      const batch = foodsData.slice(i, i + batchSize);

      // Use a new transaction for each batch to avoid quota errors
      const writeTransaction = db.transaction(['openfoodfacts_foods'], 'readwrite');
      const writeStore = writeTransaction.objectStore('openfoodfacts_foods');

      await new Promise((resolve, reject) => {
        let completed = 0;
        let hasError = false;

        batch.forEach((food) => {
          const request = writeStore.add({
            ...food,
            food_name_lower: (food.food_name || '').toLowerCase(),
            brand_lower: (food.brand || '').toLowerCase(),
            barcode: food.barcode || null
          });

          request.onsuccess = () => {
            completed++;
            if (completed === batch.length && !hasError) {
              resolve();
            }
          };

          request.onerror = () => {
            if (!hasError) {
              hasError = true;
              // Check if it's a quota error
              if (request.error && request.error.name === 'QuotaExceededError') {
                console.error(`❌ Storage quota exceeded at ${(i + batch.length).toLocaleString()} foods`);
                console.error('   Please clear some storage or request more quota');
                reject(new Error('Storage quota exceeded'));
              } else {
                reject(request.error);
              }
            }
          };
        });
      });

      // Progress updates
      if ((i + batchSize) % 50000 === 0 || i + batchSize >= foodsData.length) {
        const progress = ((i + batchSize) / foodsData.length * 100).toFixed(1);
        console.log(`   Imported ${Math.min(i + batchSize, foodsData.length).toLocaleString()} / ${foodsData.length.toLocaleString()} (${progress}%)...`);

        // Check quota periodically
        if ('storage' in navigator && 'estimate' in navigator.storage) {
          try {
            const estimate = await navigator.storage.estimate();
            const usedMB = (estimate.usage / 1024 / 1024).toFixed(2);
            const quotaMB = (estimate.quota / 1024 / 1024).toFixed(2);
            const percentUsed = ((estimate.usage / estimate.quota) * 100).toFixed(1);
            console.log(`   Storage: ${usedMB}MB / ${quotaMB}MB (${percentUsed}% used)`);
          } catch (e) {
            // Ignore quota check errors
          }
        }
      }
    }

    // Create indexes for fast searching
    const indexTransaction = db.transaction(['openfoodfacts_foods'], 'readwrite');
    const indexStore = indexTransaction.objectStore('openfoodfacts_foods');

    if (!indexStore.indexNames.contains('food_name_lower')) {
      indexStore.createIndex('food_name_lower', 'food_name_lower', { unique: false });
    }
    if (!indexStore.indexNames.contains('brand_lower')) {
      indexStore.createIndex('brand_lower', 'brand_lower', { unique: false });
    }
    if (!indexStore.indexNames.contains('barcode')) {
      indexStore.createIndex('barcode', 'barcode', { unique: false });
    }

    console.log(`✅ Imported ${foodsData.length.toLocaleString()} Open Food Facts foods into IndexedDB`);
    return true;
  } catch (error) {
    console.error('❌ Error importing Open Food Facts database:', error);
    throw error;
  }
}

/**
 * Check if the Open Food Facts database has been downloaded (any foods in IndexedDB).
 */
export async function isExtendedDatabaseLoaded() {
  const db = await getIndexedDB();
  if (!db) return false;
  const transaction = db.transaction(['openfoodfacts_foods'], 'readonly');
  const store = transaction.objectStore('openfoodfacts_foods');
  const countRequest = store.count();
  const count = await new Promise((resolve, reject) => {
    countRequest.onsuccess = () => resolve(countRequest.result);
    countRequest.onerror = () => reject(countRequest.error);
  });
  return count > 0;
}

/**
 * Download the full Open Food Facts database (1M foods) into IndexedDB.
 * Single file; no core/extended split.
 * @param {Function} onProgress - Optional progress callback (progress: number 0-100)
 */
export async function downloadExtendedDatabase(onProgress) {
  const db = await getIndexedDB();
  if (!db) throw new Error('Database not initialized');
  if (await isExtendedDatabaseLoaded()) {
    console.log('✅ Open Food Facts database already loaded');
    return { success: true, alreadyLoaded: true };
  }
  try {
    if ('storage' in navigator && 'persist' in navigator.storage) {
      try { await navigator.storage.persist(); } catch (_) {}
    }
    console.log('📥 Downloading Open Food Facts database (1M foods)...');
    if (onProgress) onProgress(0);
    const wrote = await loadDatabaseFile(db);
    if (onProgress) onProgress(100);
    if (!wrote) {
      throw new Error(
        'Database file not available. The Open Food Facts data file is not deployed on this server. ' +
        'Search and barcode lookup will use the online API instead.'
      );
    }
    // Verify store was actually populated (defensive)
    const nowLoaded = await isExtendedDatabaseLoaded();
    if (!nowLoaded) {
      throw new Error('Download completed but database could not be verified. Please try again.');
    }
    console.log('✅ Open Food Facts database downloaded successfully');
    return { success: true, alreadyLoaded: false };
  } catch (error) {
    console.error('❌ Error downloading Open Food Facts database:', error);
    throw error;
  }
}

/**
 * Remove the Open Food Facts database from IndexedDB (clears all OFF foods).
 */
export async function removeExtendedDatabase() {
  const db = await getIndexedDB();
  if (!db) throw new Error('Database not initialized');
  try {
    const transaction = db.transaction(['openfoodfacts_foods'], 'readwrite');
    const store = transaction.objectStore('openfoodfacts_foods');
    const clearRequest = store.clear();
    await new Promise((resolve, reject) => {
      clearRequest.onsuccess = () => resolve();
      clearRequest.onerror = () => reject(clearRequest.error);
    });
    console.log('✅ Open Food Facts database removed');
    return { success: true, removed: true };
  } catch (error) {
    console.error('❌ Error removing Open Food Facts database:', error);
    throw error;
  }
}
