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

let openNutritionFoods = null;

/**
 * Load OpenNutrition foods. In Node (testing), loads JSON directly.
 * In browser, fetches and decompresses .gz on the fly.
 */
async function loadOpenNutritionFoods() {
  if (openNutritionFoods !== null) return openNutritionFoods;

  // Node environment: load uncompressed JSON directly
  if (typeof window === 'undefined') {
    try {
      openNutritionFoods = require('../data/opennutrition_foods.json');
      console.log(`✅ Loaded ${openNutritionFoods.length.toLocaleString()} OpenNutrition foods (JSON)`);
    } catch (e) {
      console.warn('OpenNutrition JSON not available:', e.message);
      openNutritionFoods = [];
    }
    return openNutritionFoods;
  }

  // Browser environment: fetch and decompress .gz
  try {
    const response = await fetch(OPENNUTRITION_GZ);
    if (response.ok) {
      const contentType = (response.headers.get('Content-Type') || '').toLowerCase();
      if (contentType.includes('text/html')) {
        openNutritionFoods = [];
        console.log('   OpenNutrition .gz not deployed on this server; add to client/public/data/ or client/src/data/ for branded search.');
      } else {
        const decompressionStream = new DecompressionStream('gzip');
        const decompressedStream = response.body.pipeThrough(decompressionStream);
        const blob = await new Response(decompressedStream).blob();
        const text = await blob.text();
        openNutritionFoods = JSON.parse(text);
        console.log(`✅ Loaded ${openNutritionFoods.length.toLocaleString()} OpenNutrition foods (.gz)`);
      }
    } else {
      openNutritionFoods = [];
      console.log('   OpenNutrition .gz not available; add to client/public/data/ for branded search.');
    }
  } catch (err) {
    const msg = err && err.message ? err.message : String(err);
    if (msg.includes('decode') || msg.includes('Decode') || msg.includes('JSON')) {
      console.log('   OpenNutrition .gz not deployed on this server; branded search will use other sources.');
    }
    openNutritionFoods = [];
    console.log('   OpenNutrition .gz not available; add to client/public/data/ for branded search.');
  }
  return openNutritionFoods;
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
