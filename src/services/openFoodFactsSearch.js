/**
 * Open Food Facts Search Service
 *
 * Optional offline database: user can download the full 1M curated OFF set.
 * No bundled OFF by default; fallback is OFF API.
 * Data source: https://world.openfoodfacts.org/data
 * License: Open Database License (ODbL)
 */

let lastUpdateCheck = null;
/** Guard: only one auto-load of OFF from /data/ at a time */
let offAutoLoadInProgress = false;

// Single OFF database .gz only (loaded when user clicks Download in Profile).
const OFF_FULL_GZ = '/data/openfoodfacts_foods.compressed.json.gz';

/**
 * Get count of foods in OFF IndexedDB store (for status and auto-load decision).
 * @param {IDBDatabase} db
 * @returns {Promise<number>}
 */
function getOFFStoreCount(db) {
  return new Promise((resolve, reject) => {
    const tx = db.transaction(['openfoodfacts_foods'], 'readonly');
    const store = tx.objectStore('openfoodfacts_foods');
    const req = store.count();
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

/**
 * Ensure IndexedDB is available. Does NOT auto-load any OFF data (no bundled core/extended).
 * OFF data is only loaded when the user explicitly downloads the database, or when
 * auto-load runs (store empty + /data/ file available).
 */
async function loadOpenFoodFactsFoods() {
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
async function fetchAndDecompressGz(url) {
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
    const { decompressDatabase } = await import('../utils/decompressOpenFoodFacts');
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
async function loadDatabaseFile(db) {
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

/**
 * Get IndexedDB instance (reuse existing database connection)
 */
async function getIndexedDB() {
  // Try to use existing database instance from database-web.js
  try {
    const dbModule = await import('./database-web.js');
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
 * Search Open Food Facts foods (IndexedDB only; no auto-download).
 * Returns [] if the user has not downloaded the OFF database.
 * @param {string} query - Search query
 * @param {number} limit - Max results to return
 * @returns {Array} - Matching foods
 */
export async function searchOpenFoodFacts(query, limit = 10) {
  if (!query || query.trim().length < 2) return [];

  await loadOpenFoodFactsFoods(); // Ensure IndexedDB is available
  const db = await getIndexedDB();
  if (!db) return [];

  // If OFF store is empty, try to auto-load from /data/ once (so Musashi etc. appear without manual Download)
  const count = await getOFFStoreCount(db);
  if (count === 0 && !offAutoLoadInProgress) {
    offAutoLoadInProgress = true;
    loadDatabaseFile(db)
      .then(() => {
        console.log('✅ Open Food Facts database auto-loaded; search again for products.');
      })
      .catch((err) => {
        console.warn('⚠️ Open Food Facts auto-load failed:', err?.message || err);
      })
      .finally(() => {
        offAutoLoadInProgress = false;
      });
    return []; // This search returns empty; user can search again after load finishes
  }

  const searchTerm = query.toLowerCase().trim();
  
  // Normalize brand names (including common typos)
  const brandNormalizations = {
    'arnotts': 'arnott',
    'mcdonalds': 'mcdonald',
    'mcdonald\'s': 'mcdonald',
    'arnott\'s': 'arnott',
    'hungry jacks': 'hungry jack',
    'mushashi': 'musashi'
  };
  
  let normalizedQuery = searchTerm;
  for (const [variant, normalized] of Object.entries(brandNormalizations)) {
    if (normalizedQuery.includes(variant)) {
      normalizedQuery = normalizedQuery.replace(variant, normalized);
    }
  }
  
  // Filter out stop words
  const stopWords = new Set(['with', 'and', 'or', 'the', 'a', 'an', 'in', 'on', 'at', 'to', 'for', 'of', 'from']);
  const searchWords = normalizedQuery.split(/\s+/).filter(word => !stopWords.has(word) && word.length >= 2);
  
  // Pre-compile per-word regexps once (reused for every food item scored)
  const wordRegexps = searchWords
    .filter(word => word.length >= 3)
    .map(word => ({ word, re: new RegExp(word, 'g') }));

  // Helper function to score a food item
  function scoreFood(food, normalizedQuery, searchWords, isBrandSearch) {
    const foodName = food.food_name_lower || '';
    const brand = food.brand_lower || '';
    const alternateNames = (food.alternate_names || []).map(n => (n || '').toLowerCase());
    const allSearchableText = [foodName, brand, ...alternateNames].join(' ');
    
    let score = 0;
    
    // Brand search gets higher priority for brand matches
    if (isBrandSearch) {
      // Exact brand match
      if (brand === normalizedQuery) {
        score += 2000; // Much higher than name exact match
      }
      // Brand starts with query (e.g., "musashi" query matches "musashi high protein")
      else if (brand.startsWith(normalizedQuery)) {
        score += 1500;
      }
      // Brand contains query (e.g., "mus" query matches "musashi")
      else if (brand.includes(normalizedQuery)) {
        score += 1000;
      }
      // Query contains brand (e.g., "musashi protein" query matches "musashi" brand)
      else if (normalizedQuery.includes(brand) && brand.length >= 3) {
        score += 800;
      }
      // Word-level brand match
      else if (searchWords.some(word => brand.includes(word) && word.length >= 3)) {
        score += 600;
      }
    }
    
    // Exact match (name or alternate name)
    if (foodName === normalizedQuery || alternateNames.includes(normalizedQuery)) {
      score += 1000;
    }
    
    // Brand match (when searching by name) - also check if query contains brand word
    if (!isBrandSearch && brand) {
      if (normalizedQuery.includes(brand)) {
        score += 400;
      } else if (searchWords.some(word => brand.includes(word) && word.length >= 3)) {
        // Brand contains one of the search words (e.g., "musashi" in query matches "musashi" brand)
        score += 350;
      }
    }
    
    // Name starts with query
    if (foodName.startsWith(normalizedQuery)) {
      score += 500;
    }
    
    // Name contains query
    if (foodName.includes(normalizedQuery)) {
      score += 100;
    }
    
    // Check alternate names
    for (const altName of alternateNames) {
      if (altName === normalizedQuery) {
        score += 800;
      } else if (altName.startsWith(normalizedQuery)) {
        score += 400;
      } else if (altName.includes(normalizedQuery)) {
        score += 80;
      }
    }
    
    // Multi-word search - be more lenient for brand + product type searches
    if (searchWords.length > 1) {
      const allWordsPresent = searchWords.every(word => allSearchableText.includes(word));
      if (allWordsPresent) {
        score += 50;
        
        // Bonus for products where brand matches one word and name matches another
        // e.g., "musashi recovery" matches "muscle recovery by musashi"
        const brandWordMatch = searchWords.some(word => brand && brand.includes(word));
        const nameWordMatches = searchWords.filter(word => foodName.includes(word));
        
        if (brandWordMatch && nameWordMatches.length > 0) {
          // This is a brand + product type match - boost score significantly
          score += 400; // Increased from 300 to prioritize these matches
          
          // Extra bonus if the product type word (not brand) is prominent in the name
          const productTypeWords = searchWords.filter(word => !brand.includes(word));
          const productTypeInName = productTypeWords.some(word => {
            const nameLower = foodName.toLowerCase();
            // Check if product type appears early in name or as a key word
            return nameLower.includes(word) && (
              nameLower.startsWith(word) || 
              nameLower.includes(` ${word} `) ||
              nameLower.includes(` ${word}`)
            );
          });
          if (productTypeInName) {
            score += 200; // Extra boost for prominent product type match
          }
        }
      } else {
        // For multi-word queries, allow partial matches only when there's meaningful overlap:
        // brand must match AND enough of the query words must appear in the text.
        // Requiring > half avoids weak single-word coincidences like "white" matching "white rose"
        // when searching "white claw vodka mango".
        const matchingWords = searchWords.filter(word => allSearchableText.includes(word));
        const matchRatio = matchingWords.length / searchWords.length;
        const brandMatches = brand && searchWords.some(word => brand.includes(word) && word.length >= 4);

        if (brandMatches && matchRatio >= 0.5) {
          // Partial match with brand - give lower score but still include
          score += 20;
        } else {
          return 0; // Don't match if overlap is too weak
        }
      }
    }
    
    // Individual word matches using pre-compiled regexps
    for (const { re } of wordRegexps) {
      re.lastIndex = 0;
      const matches = (allSearchableText.match(re) || []).length;
      score += matches * 10;
    }

    return score;
  }
  
  // Search IndexedDB with cursor (memory-efficient - only loads matching records)
  // Search BOTH food_name_lower AND brand_lower indexes to find products by name or brand
  // Use separate transactions for name and brand searches to avoid transaction timeout issues
  
  return new Promise(async (resolve) => {
    const scored = new Map(); // Use Map to deduplicate by food ID
    let nameSearchComplete = false;
    let brandSearchComplete = false;
    let searchFinished = false; // Guard to prevent multiple finishSearch calls
    const startTime = performance.now();
    // Keep timeout short for good UX - Safari needs a bit more but still fast
    const isSafari = /^((?!chrome|android).)*safari/i.test(navigator.userAgent);
    const maxSearchTime = isSafari ? 2000 : 1500; // 2s for Safari, 1.5s for others - fast UX is critical
    
    // Detect if this looks like a brand search (short query, no spaces, capitalized-like)
    // Also check if multi-word query starts with what looks like a brand
    const looksLikeBrand = (searchWords.length === 1 && searchWords[0].length >= 3 && 
                            !searchWords[0].includes(' ') && normalizedQuery.length < 20) ||
                           (searchWords.length > 1 && searchWords[0].length >= 3 && 
                            searchWords[0].length < 20 && !searchWords[0].includes(' '));
    
    // Aggressive early termination: stop searching once we have enough high-quality results
    const minGoodResults = 10; // Stop if we have this many high-scoring results (increased to find more matches)
    const goodScoreThreshold = 350; // Consider scores above this as "good" (lowered to catch more matches)
    
    // Extract brand word for IDBKeyRange (first word if multi-word, full query if single)
    // For "musashi recovery", we want "musashi" not "musashi recovery"
    let brandWordForRange = '';
    if (searchWords.length === 0) {
      brandWordForRange = '';
    } else if (searchWords.length === 1) {
      // Single word query - use it as brand word
      brandWordForRange = searchWords[0];
    } else {
      // Multi-word query - use first word as brand word
      brandWordForRange = searchWords[0];
    }
    
    console.log(`🔍 Starting OpenFoodFacts search for "${query}"`);
    console.log(`   looksLikeBrand: ${looksLikeBrand}, searchWords: [${searchWords.join(', ')}], brandWordForRange: "${brandWordForRange}"`);
    
    // Search by food name - use separate transaction
    function searchByName() {
      const nameTransaction = db.transaction(['openfoodfacts_foods'], 'readonly');
      const nameStore = nameTransaction.objectStore('openfoodfacts_foods');
      const nameIndex = nameStore.index('food_name_lower');
      const nameRequest = nameIndex.openCursor();
      let nameCount = 0;
      nameRequest.onsuccess = (event) => {
      // Check timeout (synchronous - Safari compatible)
      if (performance.now() - startTime > maxSearchTime) {
        console.log(`⏱️ Name search timeout after ${maxSearchTime}ms`);
        nameSearchComplete = true;
        // If we have results, finish immediately - don't wait
        if (brandSearchComplete || scored.size > 0) {
          setTimeout(() => finishSearch(), 0); // Defer to avoid Safari transaction issues
        } else {
          searchByBrand();
        }
        return;
      }
      
      const cursor = event.target.result;
      if (!cursor) {
        nameSearchComplete = true;
        if (brandSearchComplete) {
          setTimeout(() => finishSearch(), 0); // Defer to avoid Safari transaction issues
        } else if (!looksLikeBrand) {
          // Only start brand search if not already started
          searchByBrand();
        }
        return;
      }
      
      nameCount++;
      
      // Aggressive early termination: stop as soon as we have good results
      const currentGoodResults = Array.from(scored.values()).filter(r => r._score >= goodScoreThreshold).length;
      if (currentGoodResults >= minGoodResults && nameCount > 50) {
        // We have enough good results and checked at least 50 items
        console.log(`   ✅ Early termination: Found ${currentGoodResults} good results after ${nameCount} checks`);
        nameSearchComplete = true;
        if (brandSearchComplete) {
          setTimeout(() => finishSearch(), 0);
        } else if (!looksLikeBrand) {
          searchByBrand();
        }
        return;
      }
      
      // Very aggressive limits - prioritize speed over completeness
      const nameLimit = isSafari
        ? (looksLikeBrand ? 2000 : 5000)    // Safari: 2K/5K - very aggressive
        : (looksLikeBrand ? 5000 : 10000);  // Others: 5K/10K
      if (nameCount > nameLimit) {
        nameSearchComplete = true;
        if (brandSearchComplete) {
          setTimeout(() => finishSearch(), 0); // Defer to avoid Safari transaction issues
        } else if (!looksLikeBrand) {
          searchByBrand();
        }
        return;
      }
      
      const food = cursor.value;
      const score = scoreFood(food, normalizedQuery, searchWords, false);
      if (score > 0) {
        const existing = scored.get(food.id);
        if (!existing || score > existing._score) {
          scored.set(food.id, { ...food, _score: score });
          
          // Debug logging for "Muscle recovery" product
          const foodName = (food.food_name || food.name || '').toLowerCase();
          if (foodName.includes('muscle recovery') && foodName.includes('musashi')) {
            console.log(`   🎯 Found "Muscle recovery by Musashi": score=${score}, name="${food.food_name || food.name}", brand="${food.brand}"`);
          }
        }
      }
      
      cursor.continue();
      };
      
      nameRequest.onerror = () => {
        nameSearchComplete = true;
        if (brandSearchComplete) {
          setTimeout(() => finishSearch(), 0); // Defer to avoid Safari transaction issues
        } else if (!looksLikeBrand) {
          searchByBrand();
        }
      };
    }
    
    // Search by brand - use separate transaction  
    function searchByBrand() {
      const brandTransaction = db.transaction(['openfoodfacts_foods'], 'readonly');
      const brandStore = brandTransaction.objectStore('openfoodfacts_foods');
      const brandIndex = brandStore.index('brand_lower');
      
      // For brand searches, try to use IDBKeyRange for prefix matching (much faster)
      // This only iterates brands that start with the brand word
      let brandRequest;
      const useKeyRange = brandWordForRange.length >= 3 && brandWordForRange.length < 20;
      
      if (useKeyRange) {
        try {
          // Use key range to only search brands starting with brand word (e.g., "musashi" in "musashi recovery")
          const range = IDBKeyRange.bound(brandWordForRange, brandWordForRange + '\uffff', false, false);
          brandRequest = brandIndex.openCursor(range);
          console.log(`   Using IDBKeyRange for brand prefix match: "${brandWordForRange}"`);
        } catch (e) {
          // Fallback to full cursor if key range fails
          console.log(`   IDBKeyRange failed, using full cursor:`, e);
          brandRequest = brandIndex.openCursor();
        }
      } else {
        brandRequest = brandIndex.openCursor();
      }
      
      let brandCount = 0;
      let checkedCount = 0;
      let goodResultsCount = 0;
      brandRequest.onsuccess = (event) => {
        // Check timeout (synchronous check - Safari compatible)
        if (performance.now() - startTime > maxSearchTime) {
          console.log(`⏱️ Brand search timeout after ${maxSearchTime}ms`);
          brandSearchComplete = true;
          // If we have results, finish immediately - don't wait
          if (nameSearchComplete || scored.size > 0) {
            setTimeout(() => finishSearch(), 0); // Defer to avoid Safari transaction issues
          }
          return;
        }
        
        const cursor = event.target.result;
        if (!cursor) {
          brandSearchComplete = true;
          if (nameSearchComplete) {
            setTimeout(() => finishSearch(), 0); // Defer to avoid Safari transaction issues
          }
          return;
        }
        
        brandCount++;
        const food = cursor.value;
        const brand = (food.brand_lower || '').toLowerCase();
        
        // Skip products without brands (faster)
        if (!brand || brand.length === 0) {
          cursor.continue();
          return;
        }
        
        checkedCount++;
        
        // Aggressive early termination: stop as soon as we have good results
        const currentGoodResults = Array.from(scored.values()).filter(r => r._score >= goodScoreThreshold).length;
        if (currentGoodResults >= minGoodResults && checkedCount > 50) {
          // We have enough good results and checked at least 50 items
          console.log(`   ✅ Early termination: Found ${currentGoodResults} good results after ${checkedCount} checks`);
          brandSearchComplete = true;
          if (nameSearchComplete) {
            setTimeout(() => finishSearch(), 0);
          }
          return;
        }
        
        // Very aggressive limits - prioritize speed over completeness
        const brandLimit = isSafari 
          ? (looksLikeBrand ? 10000 : 5000)   // Safari: 10K/5K - very aggressive
          : (looksLikeBrand ? 20000 : 10000); // Others: 20K/10K
        if (checkedCount > brandLimit) {
          brandSearchComplete = true;
          if (nameSearchComplete) {
            setTimeout(() => finishSearch(), 0); // Defer to avoid Safari transaction issues
          }
          return;
        }
        
        // Only include products where brand actually matches the query
        const brandMatches = brand.includes(normalizedQuery) || normalizedQuery.includes(brand) || 
                            searchWords.some(word => brand.includes(word) || word.includes(brand));
        
        if (brandMatches) {
          const score = scoreFood(food, normalizedQuery, searchWords, true);
          if (score > 0) {
            const existing = scored.get(food.id);
            if (!existing || score > existing._score) {
              scored.set(food.id, { ...food, _score: score });
              
              // Debug logging for "Muscle recovery" product
              const foodName = (food.food_name || food.name || '').toLowerCase();
              if (foodName.includes('muscle recovery') && foodName.includes('musashi')) {
                console.log(`   🎯 Found "Muscle recovery by Musashi" (brand search): score=${score}, name="${food.food_name || food.name}", brand="${food.brand}"`);
              }
              
              if (score >= goodScoreThreshold) {
                goodResultsCount++;
              }
            }
          }
        }
        
        cursor.continue();
      };
      
      brandRequest.onerror = () => {
        brandSearchComplete = true;
        if (nameSearchComplete) {
          setTimeout(() => finishSearch(), 0); // Defer to avoid Safari transaction issues
        }
      };
    }
    
    // Start searches based on query type
    if (looksLikeBrand) {
      // For brand queries, search brand first (more relevant)
      searchByBrand();
      // Also search names (in case brand is in product name)
      searchByName();
    } else {
      // Normal search: name first, then brand
      // But if query contains a brand word, also search by brand in parallel
      const hasBrandWord = searchWords.some(word => word.length >= 3 && word.length < 20);
      searchByName();
      if (hasBrandWord) {
        // Also search by brand for multi-word queries like "musashi recovery"
        searchByBrand();
      }
    }
    
    const finishSearch = async () => {
      // Prevent multiple calls (Safari can trigger this multiple times)
      if (searchFinished) {
        console.log(`⚠️ finishSearch() called again, ignoring (already finished)`);
        return;
      }
      searchFinished = true;
      
      // Wait a tiny bit to ensure all cursor callbacks have finished (Safari needs this)
      await new Promise(resolve => setTimeout(resolve, 50));
      
      // Sort by score and return top results
      const resultsArray = Array.from(scored.values());
      resultsArray.sort((a, b) => b._score - a._score);
      console.log(`🔍 OpenFoodFacts search for "${query}": Found ${resultsArray.length} matches (top ${limit} returned)`);
      if (resultsArray.length > 0) {
        console.log(`   Top 3 matches:`, resultsArray.slice(0, 3).map(r => ({
          name: r.food_name || r.name,
          brand: r.brand,
          score: r._score
        })));
        
        // Check if "Muscle recovery" is in results
        const muscleRecovery = resultsArray.find(r => {
          const name = (r.food_name || r.name || '').toLowerCase();
          return name.includes('muscle recovery') && name.includes('musashi');
        });
        if (muscleRecovery) {
          const index = resultsArray.indexOf(muscleRecovery);
          console.log(`   ✅ "Muscle recovery by Musashi" found at position ${index + 1} with score ${muscleRecovery._score}`);
        } else {
          console.log(`   ❌ "Muscle recovery by Musashi" NOT found in results`);
        }
      }
      const results = resultsArray.slice(0, limit).map(({ _score, ...food }) => formatFoodResult(food));
      resolve(results);
    };
  });
}

/**
 * Format food result (extracted from original search function)
 */
function formatFoodResult(food) {
  // Check for serving size - prioritize serving_size_g field
  const servingSizeGrams = food.serving_size_g || food.base_serving_size_g;
  const hasServingSize = servingSizeGrams && servingSizeGrams > 0 && servingSizeGrams !== 100;
  const hasPerServingValues = food.calories_per_serving !== undefined || 
                               food.protein_per_serving !== undefined ||
                               food.carbs_per_serving !== undefined;
  
  let calories, protein_g, carbs_g, fat_g, fiber_g, sodium_mg, sugar_g, quantity_g;
  
  // ALWAYS use serving size if available (don't default to 100ml/g)
  if (hasServingSize && hasPerServingValues) {
    // Use per-serving values directly (most accurate)
    calories = food.calories_per_serving || food.calories_per_100g || 0;
    protein_g = food.protein_per_serving !== undefined ? food.protein_per_serving : (food.protein_g || 0);
    carbs_g = food.carbs_per_serving !== undefined ? food.carbs_per_serving : (food.carbs_g || 0);
    fat_g = food.fat_per_serving !== undefined ? food.fat_per_serving : (food.fat_g || 0);
    fiber_g = food.fiber_per_serving !== undefined ? food.fiber_per_serving : (food.fiber_g || 0);
    sodium_mg = food.sodium_per_serving !== undefined ? food.sodium_per_serving : (food.sodium_mg || 0);
    sugar_g = food.sugar_per_serving !== undefined ? food.sugar_per_serving : (food.sugar_g || 0);
    quantity_g = servingSizeGrams;
  } else if (hasServingSize) {
    // Scale from per-100g to serving size
    const scaleFactor = servingSizeGrams / 100;
    calories = Math.round((food.calories_per_100g || 0) * scaleFactor);
    protein_g = Math.round((food.protein_g || 0) * scaleFactor * 10) / 10;
    carbs_g = Math.round((food.carbs_g || 0) * scaleFactor * 10) / 10;
    fat_g = Math.round((food.fat_g || 0) * scaleFactor * 10) / 10;
    fiber_g = Math.round((food.fiber_g || 0) * scaleFactor * 10) / 10;
    sodium_mg = Math.round((food.sodium_mg || 0) * scaleFactor);
    sugar_g = Math.round((food.sugar_g || 0) * scaleFactor * 10) / 10;
    quantity_g = servingSizeGrams;
  } else {
    // No serving size available - default to 100g/ml
    calories = food.calories_per_100g || 0;
    protein_g = food.protein_g || 0;
    carbs_g = food.carbs_g || 0;
    fat_g = food.fat_g || 0;
    fiber_g = food.fiber_g || 0;
    sodium_mg = food.sodium_mg || 0;
    sugar_g = food.sugar_g || 0;
    quantity_g = 100;
  }
  
  // Calculate per-100g values if missing
  // If we have per-serving values and serving size, calculate per-100g
  let caloriesPer100g = food.calories_per_100g;
  let proteinPer100g = food.protein_per_100g || food.protein_g;
  let carbsPer100g = food.carbs_per_100g || food.carbs_g;
  let fatPer100g = food.fat_per_100g || food.fat_g;
  let fiberPer100g = food.fiber_per_100g || food.fiber_g;
  let sodiumPer100g = food.sodium_per_100g || food.sodium_mg;
  let sugarPer100g = food.sugar_per_100g || food.sugar_g;
  
  // If per-100g is missing but we have per-serving, calculate it
  if ((!caloriesPer100g || caloriesPer100g === 0) && hasServingSize && servingSizeGrams > 0) {
    if (food.calories_per_serving) {
      caloriesPer100g = (food.calories_per_serving / servingSizeGrams) * 100;
    } else if (calories && quantity_g) {
      caloriesPer100g = (calories / quantity_g) * 100;
    }
    
    if (food.protein_per_serving !== undefined) {
      proteinPer100g = (food.protein_per_serving / servingSizeGrams) * 100;
    }
    if (food.carbs_per_serving !== undefined) {
      carbsPer100g = (food.carbs_per_serving / servingSizeGrams) * 100;
    }
    if (food.fat_per_serving !== undefined) {
      fatPer100g = (food.fat_per_serving / servingSizeGrams) * 100;
    }
    if (food.fiber_per_serving !== undefined) {
      fiberPer100g = (food.fiber_per_serving / servingSizeGrams) * 100;
    }
    if (food.sodium_per_serving !== undefined) {
      sodiumPer100g = (food.sodium_per_serving / servingSizeGrams) * 100;
    }
    if (food.sugar_per_serving !== undefined) {
      sugarPer100g = (food.sugar_per_serving / servingSizeGrams) * 100;
    }
  }
  
  return {
    ...food,
    name: food.food_name,
    calories,
    protein_g,
    carbs_g,
    fat_g,
    fiber_g,
    sodium_mg,
    sugar_g,
    alcohol_g: food.alcohol_g || 0,
    quantity_g,
    serving_size_g: servingSizeGrams || food.serving_size_g,
    serving_size_display: food.serving_size_display,
    serving_size_unit: food.serving_size_unit,
    base_serving_size_g: servingSizeGrams || food.base_serving_size_g || food.serving_size_g,
    has_serving_size: hasServingSize,
    calories_per_100g: caloriesPer100g || 0,
    protein_per_100g: proteinPer100g || 0,
    carbs_per_100g: carbsPer100g || 0,
    fat_per_100g: fatPer100g || 0,
    fiber_per_100g: fiberPer100g || 0,
    sodium_per_100g: sodiumPer100g || 0,
    sugar_per_100g: sugarPer100g || 0,
    alcohol_per_100g: food.alcohol_per_100g || food.alcohol_g || 0,
    alcohol_per_serving: food.alcohol_per_serving || 0,
    // Include per-serving values if available
    calories_per_serving: food.calories_per_serving,
    protein_per_serving: food.protein_per_serving,
    carbs_per_serving: food.carbs_per_serving,
    fat_per_serving: food.fat_per_serving,
    fiber_per_serving: food.fiber_per_serving,
    sodium_per_serving: food.sodium_per_serving,
    sugar_per_serving: food.sugar_per_serving,
    source: 'openfoodfacts',
    tier: 'openfoodfacts',
    verification_source: 'openfoodfacts',
    is_verified: true
  };
}

/**
 * Get update information
 */
export async function getUpdateInfo() {
  return await checkForUpdates();
}

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

export default {
  searchOpenFoodFacts,
  getUpdateInfo,
  loadOpenFoodFactsFoods,
  lookupByBarcode
};
