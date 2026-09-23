/**
 * OpenNutrition Foods Search Service (primary branded database)
 *
 * Loads from .gz only (no uncompressed/bundled JSON). Same pattern as Open Food Facts.
 * Data source: https://www.opennutrition.app (USDA, CNF, FRIDA, AUSNUT).
 * Distribution: https://github.com/deadletterq/mcp-opennutrition (300k+ foods, actively maintained).
 * License: Open Database License (ODbL).
 *
 * Add opennutrition_foods.compressed.json.gz to client/public/data/ (e.g. via scripts/export-full-opennutrition.js).
 */

const OPENNUTRITION_GZ = '/data/opennutrition_foods.compressed.json.gz';

// Cache Storage layer (option 1: persist the DECOMPRESSED JSON text so repeat
// loads skip the 28MB fetch + ~150MB gzip decompress). Bump CACHE_VERSION
// whenever the served dataset changes — old versioned entries are pruned on the
// next load, so a stale decompressed copy can't be served forever.
const CACHE_NAME = 'macromate-opennutrition';
const CACHE_VERSION = 1;
// Synthetic request key stored in Cache Storage. The version is in the URL so a
// bump misses the old entry (which then gets pruned) and re-decompresses fresh.
const CACHE_KEY = `${OPENNUTRITION_GZ}?decompressed=v${CACHE_VERSION}`;

let openNutritionFoods = null;
// In-flight guard: if two callers load before the first resolves, they share one
// fetch/decompress instead of each doing the expensive work in parallel.
let loadPromise = null;

const cacheStorageAvailable = () =>
  typeof caches !== 'undefined' && caches && typeof caches.open === 'function';

// Read the decompressed JSON text from Cache Storage. Returns null on any miss,
// unavailability, or read error — the caller then falls back to the network.
async function readCachedText() {
  if (!cacheStorageAvailable()) return null;
  try {
    const cache = await caches.open(CACHE_NAME);
    const hit = await cache.match(CACHE_KEY);
    if (!hit) return null;
    return await hit.text();
  } catch {
    return null;
  }
}

// Persist decompressed text for next time and prune any older-version entries.
// Best-effort: quota errors / unavailability are swallowed so a failed write
// never breaks the load (this session already has the parsed foods in memory).
async function writeCachedText(text) {
  if (!cacheStorageAvailable()) return;
  try {
    const cache = await caches.open(CACHE_NAME);
    // Prune stale versions so old decompressed copies don't waste quota.
    const keys = await cache.keys();
    await Promise.all(
      keys
        .filter(req => req.url && !req.url.endsWith(CACHE_KEY))
        .map(req => cache.delete(req))
    );
    await cache.put(CACHE_KEY, new Response(text, {
      headers: { 'Content-Type': 'application/json' },
    }));
  } catch {
    /* QuotaExceededError / unavailable — parsed foods still serve this session */
  }
}

/**
 * Load OpenNutrition foods. In Node (testing), loads JSON directly.
 * In browser, serves decompressed JSON from Cache Storage when present,
 * otherwise fetches + decompresses the .gz and caches the result.
 */
function loadOpenNutritionFoods() {
  if (openNutritionFoods !== null) return Promise.resolve(openNutritionFoods);
  if (loadPromise) return loadPromise;
  loadPromise = doLoadOpenNutritionFoods()
    .then(foods => {
      openNutritionFoods = foods;
      return foods;
    })
    .finally(() => {
      loadPromise = null;
    });
  return loadPromise;
}

async function doLoadOpenNutritionFoods() {
  // Node environment: load uncompressed JSON directly
  if (typeof window === 'undefined') {
    try {
      const foods = require('../data/opennutrition_foods.json');
      console.log(`✅ Loaded ${foods.length.toLocaleString()} OpenNutrition foods (JSON)`);
      return foods;
    } catch (e) {
      console.warn('OpenNutrition JSON not available:', e.message);
      return [];
    }
  }

  // Browser: try the decompressed-text cache first (fast path, no fetch/decompress).
  const cachedText = await readCachedText();
  if (cachedText) {
    try {
      const foods = JSON.parse(cachedText);
      console.log(`✅ Loaded ${foods.length.toLocaleString()} OpenNutrition foods (Cache Storage)`);
      return foods;
    } catch {
      // Corrupt cached entry — drop it and fall through to the network.
      if (cacheStorageAvailable()) {
        try { (await caches.open(CACHE_NAME)).delete(CACHE_KEY); } catch { /* ignore */ }
      }
      console.log('   OpenNutrition cache entry was invalid; re-fetching .gz.');
    }
  }

  // Slow path: fetch and decompress .gz, then cache the decompressed text.
  try {
    const response = await fetch(OPENNUTRITION_GZ);
    if (response.ok) {
      const contentType = (response.headers.get('Content-Type') || '').toLowerCase();
      if (contentType.includes('text/html')) {
        console.log('   OpenNutrition .gz not deployed on this server; add to client/public/data/ or client/src/data/ for branded search.');
        return [];
      }
      const decompressionStream = new DecompressionStream('gzip');
      const decompressedStream = response.body.pipeThrough(decompressionStream);
      const blob = await new Response(decompressedStream).blob();
      const text = await blob.text();
      const foods = JSON.parse(text);
      console.log(`✅ Loaded ${foods.length.toLocaleString()} OpenNutrition foods (.gz)`);
      // Cache for next load (best-effort, non-blocking).
      writeCachedText(text);
      return foods;
    }
    console.log('   OpenNutrition .gz not available; add to client/public/data/ for branded search.');
    return [];
  } catch (err) {
    const msg = err && err.message ? err.message : String(err);
    if (msg.includes('decode') || msg.includes('Decode') || msg.includes('JSON')) {
      console.log('   OpenNutrition .gz not deployed on this server; branded search will use other sources.');
    }
    console.log('   OpenNutrition .gz not available; add to client/public/data/ for branded search.');
    return [];
  }
}

/**
 * Search OpenNutrition foods
 * @param {string} query - Search query
 * @param {number} limit - Max results to return
 * @returns {Array} - Matching foods
 */
export async function searchOpenNutrition(query, limit = 10) {
  if (!query || query.trim().length < 2) {
    return [];
  }

  const foods = await loadOpenNutritionFoods();
  let searchTerm = query.toLowerCase().trim();
  
  // Normalize brand names (handle common variations)
  const brandNormalizations = {
    'arnotts': 'arnott',
    'mcdonalds': 'mcdonald',
    'mcdonald\'s': 'mcdonald',
    'arnott\'s': 'arnott',
    'hungry jacks': 'hungry jack',
    'burger king': 'burger king'
  };
  
  // Apply brand normalizations
  for (const [variant, normalized] of Object.entries(brandNormalizations)) {
    if (searchTerm.includes(variant)) {
      searchTerm = searchTerm.replace(variant, normalized);
    }
  }
  
  // Filter out stop words (common words that don't add meaning to food searches)
  const stopWords = new Set(['with', 'and', 'or', 'the', 'a', 'an', 'in', 'on', 'at', 'to', 'for', 'of', 'from']);
  const searchWords = searchTerm.split(/\s+/).filter(word => !stopWords.has(word));

  // Pre-compile RegExps once outside the map loop (avoid creating them for every food item)
  const wordRegexps = searchWords
    .filter(word => word.length >= 3)
    .map(word => ({ word, re: new RegExp(word, 'g') }));

  // Score each food based on match quality
  const scored = foods.map(food => {
    let score = 0;
    const foodName = food.food_name.toLowerCase();
    const alternateNames = (food.alternate_names || []).map(n => n.toLowerCase());
    const allSearchableText = [foodName, ...alternateNames].join(' ');

    // Exact match (highest priority)
    if (foodName === searchTerm || alternateNames.includes(searchTerm)) {
      score += 1000;
    }

    // Starts with query
    if (foodName.startsWith(searchTerm)) {
      score += 500;
    }

    // Contains full query
    if (foodName.includes(searchTerm)) {
      score += 100;
    }

    // Check alternate names
    for (const altName of alternateNames) {
      if (altName === searchTerm) {
        score += 800;
      } else if (altName.startsWith(searchTerm)) {
        score += 400;
      } else if (altName.includes(searchTerm)) {
        score += 80;
      }
    }

    // For multi-word queries, require ALL words to be present
    if (searchWords.length > 1) {
      const allWordsPresent = searchWords.every(word =>
        allSearchableText.includes(word)
      );
      if (allWordsPresent) {
        // All words present - give bonus score
        score += 50;
      } else {
        // Not all words present - don't match this food
        return { ...food, _score: 0 };
      }
    }

    // Individual word matches using pre-compiled RegExps
    for (const { re } of wordRegexps) {
      re.lastIndex = 0; // Reset stateful regex before reuse
      const wordMatches = (allSearchableText.match(re) || []).length;
      score += wordMatches * 10;
    }

    return { ...food, _score: score };
  });

  // Filter to matches only and sort by score
  const matches = scored
    .filter(food => food._score > 0)
    .sort((a, b) => b._score - a._score)
    .slice(0, limit)
    .map(({ _score, ...food }) => ({
      ...food,
      source: 'opennutrition',
      tier: 'opennutrition'
    }));

  return matches;
}

/**
 * Get food by barcode (EAN-13)
 * @param {string} barcode - EAN-13 barcode
 * @returns {Object|null} - Matching food or null
 */
export async function searchByBarcode(barcode) {
  if (!barcode) return null;

  const foods = await loadOpenNutritionFoods();
  const food = foods.find(f => f.ean_13 === barcode);

  if (food) {
    return {
      ...food,
      source: 'opennutrition',
      tier: 'opennutrition'
    };
  }

  return null;
}

/**
 * Get random popular foods (for suggestions)
 * @param {number} count - Number of suggestions
 * @returns {Array} - Random popular foods
 */
export async function getPopularFoods(count = 10) {
  const foods = await loadOpenNutritionFoods();
  
  // Get random foods from top 500 (most popular)
  const popular = foods.slice(0, 500);
  const shuffled = popular.sort(() => 0.5 - Math.random());
  
  return shuffled.slice(0, count).map(food => ({
    ...food,
    source: 'opennutrition',
    tier: 'opennutrition'
  }));
}

const openNutritionService = {
  searchOpenNutrition,
  searchByBarcode,
  getPopularFoods
};

export default openNutritionService;
