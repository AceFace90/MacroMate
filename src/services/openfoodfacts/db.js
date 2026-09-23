/**
 * Open Food Facts IndexedDB access.
 * Extracted from openFoodFactsSearch.js.
 */

/**
 * Get count of foods in OFF IndexedDB store (for status and auto-load decision).
 * @param {IDBDatabase} db
 * @returns {Promise<number>}
 */
export function getOFFStoreCount(db) {
  return new Promise((resolve, reject) => {
    const tx = db.transaction(['openfoodfacts_foods'], 'readonly');
    const store = tx.objectStore('openfoodfacts_foods');
    const req = store.count();
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

/**
 * Get IndexedDB instance (reuse existing database connection)
 */
export async function getIndexedDB() {
  // Try to use existing database instance from database-web.js
  try {
    const dbModule = await import('../database-web.js');
    const dbService = dbModule.default;

    // Ensure database is initialized
    if (!dbService.isInitialized) {
      await dbService.initialize();
    }

    if (dbService.db) {
      return dbService.db;
    }
  } catch (e) {
    console.warn('Could not use database-web instance:', e);
  }

  // Fallback: open IndexedDB directly using the same name as database-web.js
  return new Promise((resolve, reject) => {
    const request = indexedDB.open('macromate-web', 2); // Use same DB name as database-web.js
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
    request.onupgradeneeded = (event) => {
      const db = event.target.result;
      console.log('📦 Creating openfoodfacts_foods store in fallback database...');

      // Create all stores if they don't exist (matching database-web.js structure)
      if (!db.objectStoreNames.contains('users')) {
        const usersStore = db.createObjectStore('users', { keyPath: 'id', autoIncrement: true });
        usersStore.createIndex('email', 'email', { unique: true });
      }

      if (!db.objectStoreNames.contains('food_logs')) {
        const logsStore = db.createObjectStore('food_logs', { keyPath: 'id', autoIncrement: true });
        logsStore.createIndex('logged_at', 'logged_at', { unique: false });
      }

      if (!db.objectStoreNames.contains('afcd_foods')) {
        const afcdStore = db.createObjectStore('afcd_foods', { keyPath: 'id', autoIncrement: true });
        afcdStore.createIndex('food_name_normalized', 'food_name_normalized', { unique: false });
      }

      if (!db.objectStoreNames.contains('saved_foods')) {
        const savedStore = db.createObjectStore('saved_foods', { keyPath: 'id', autoIncrement: true });
        savedStore.createIndex('food_name', 'food_name', { unique: false });
        savedStore.createIndex('usage_count', 'usage_count', { unique: false });
      }

      if (!db.objectStoreNames.contains('openfoodfacts_foods')) {
        const store = db.createObjectStore('openfoodfacts_foods', { keyPath: 'id', autoIncrement: true });
        store.createIndex('food_name_lower', 'food_name_lower', { unique: false });
        store.createIndex('brand_lower', 'brand_lower', { unique: false });
        store.createIndex('barcode', 'barcode', { unique: false });
      }

      console.log('✅ Fallback database stores created');
    };
  });
}
