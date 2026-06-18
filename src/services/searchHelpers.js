/**
 * Search Helper Utilities
 * 
 * Provides utilities for improving search quality:
 * - Pluralization handling
 * - Generic query detection
 * - Result deduplication
 */

/**
 * Convert plural to singular and vice versa for common food terms
 * @param {string} term - Search term
 * @returns {Array} Array of search terms including singular/plural variants
 */
export function expandSearchTerms(term) {
  const terms = [term.toLowerCase()];
  const lower = term.toLowerCase();
  
  // Common pluralizations
  const pluralizations = {
    // Singular → Plural
    'egg': 'eggs',
    'chicken': 'chickens',
    'apple': 'apples',
    'banana': 'bananas',
    'tomato': 'tomatoes',
    'potato': 'potatoes',
    
    // Plural → Singular
    'eggs': 'egg',
    'chickens': 'chicken',
    'apples': 'apple',
    'bananas': 'banana',
    'tomatoes': 'tomato',
    'potatoes': 'potato',
  };
  
  // Add plural/singular variant if exists
  if (pluralizations[lower]) {
    terms.push(pluralizations[lower]);
  }
  
  // Also try removing 's' for plurals
  if (lower.endsWith('s') && lower.length > 3) {
    const singular = lower.slice(0, -1);
    if (!terms.includes(singular)) {
      terms.push(singular);
    }
  }
  
  // Try adding 's' for singulars
  if (!lower.endsWith('s') && lower.length > 2) {
    const plural = lower + 's';
    if (!terms.includes(plural)) {
      terms.push(plural);
    }
  }
  
  return [...new Set(terms)];
}

/**
 * Detect if query is generic (no brand mentioned)
 * @param {string} query - Search query
 * @param {Array} brandKeywords - List of brand keywords
 * @returns {boolean} True if generic query
 */
export function isGenericQuery(query, brandKeywords = []) {
  const lowerQuery = query.toLowerCase();
  
  // Check if any brand is mentioned
  const hasBrand = brandKeywords.some(brand => 
    lowerQuery.includes(brand.toLowerCase())
  );
  
  // Check for brand indicators
  const brandIndicators = ['by ', 'brand', 'from '];
  const hasBrandIndicator = brandIndicators.some(indicator => 
    lowerQuery.includes(indicator)
  );
  
  return !hasBrand && !hasBrandIndicator;
}

/**
 * Create a deduplication key for a food result
 * @param {Object} result - Search result
 * @returns {string} Deduplication key
 */
export function createDedupKey(result) {
  const name = (result.name || result.food_name || '').toLowerCase();
  
  // Extract brand (everything after "by ")
  const brandMatch = name.match(/by\s+([^,]+)/);
  const brand = brandMatch ? brandMatch[1].trim() : '';
  
  // Extract base product name (before "by" or first part)
  const baseName = brandMatch 
    ? name.substring(0, brandMatch.index).trim()
    : name.split(',')[0].trim();
  
  // Create a key: brand + normalized base name
  const normalizedBase = baseName
    .replace(/\s+/g, ' ')
    .replace(/[^a-z0-9\s]/g, '')
    .substring(0, 50); // Limit length
  
  return `${brand}_${normalizedBase}`;
}

/**
 * Group similar results to reduce duplicates
 * @param {Array} results - Search results
 * @returns {Array} Deduplicated results
 */
export function deduplicateResults(results) {
  const seen = new Map();
  const deduplicated = [];
  
  for (const result of results) {
    const key = createDedupKey(result);
    
    if (!seen.has(key)) {
      seen.set(key, result);
      deduplicated.push(result);
    } else {
      // Keep the one with better match (shorter name usually = better)
      const existing = seen.get(key);
      const existingName = (existing.name || existing.food_name || '').length;
      const currentName = (result.name || result.food_name || '').length;
      
      // Prefer shorter, more specific names
      if (currentName < existingName) {
        seen.set(key, result);
        // Replace in deduplicated array
        const index = deduplicated.findIndex(r => r === existing);
        if (index !== -1) {
          deduplicated[index] = result;
        }
      }
    }
  }
  
  return deduplicated;
}

/**
 * Deduplicate across multiple result arrays, prioritizing saved foods over history
 * @param {Array} savedResults - Saved foods results
 * @param {Array} historyResults - History results
 * @returns {Array} Deduplicated history results (saved foods take priority)
 */
export function deduplicateAcrossTiers(savedResults, historyResults) {
  if (!historyResults || historyResults.length === 0) {
    return historyResults || [];
  }
  
  // Create a set of keys from saved foods
  const savedKeys = new Set(savedResults.map(r => createDedupKey(r)));
  
  // Filter out history results that match saved foods
  const filteredHistory = historyResults.filter(result => {
    const key = createDedupKey(result);
    return !savedKeys.has(key);
  });
  
  return filteredHistory;
}

/**
 * Score result relevance for generic queries
 * @param {Object} result - Search result
 * @param {string} query - Original query
 * @returns {number} Relevance score
 */
export function scoreGenericRelevance(result, query) {
  const name = (result.name || result.food_name || '').toLowerCase();
  const lowerQuery = query.toLowerCase();
  
  let score = 0;
  
  // Exact match
  if (name === lowerQuery) {
    score += 1000;
  }
  
  // Starts with query
  if (name.startsWith(lowerQuery)) {
    score += 500;
  }
  
  // Contains full query
  if (name.includes(lowerQuery)) {
    score += 100;
  }
  
  // For multi-word queries, check if all important words are present
  const stopWords = new Set(['the', 'a', 'an', 'and', 'or', 'with', 'by', 'of', 'in', 'on', 'at', 'to', 'for']);
  const queryWords = lowerQuery.split(/\s+/).filter(w => w.length > 0 && !stopWords.has(w));
  if (queryWords.length > 1) {
    const allWordsPresent = queryWords.every(word => name.includes(word));
    if (allWordsPresent) {
      score += 150; // Bonus for having all important words
    }
  }
  
  // Penalize branded products for generic queries
  if (name.includes(' by ')) {
    score -= 200;
  }
  
  // Boost AFCD results (official data)
  if (result.source === 'afcd' || result.verification_source === 'afcd') {
    score += 300;
  }
  
  // Boost saved foods (user-verified, frequently used)
  if (result.source === 'saved' || result.tier === 2) {
    score += 200; // Additional boost for saved foods
  }
  
  // Penalize candy/chocolate for generic food queries
  const candyTerms = ['chocolate', 'candy', 'marshmallow', 'easter'];
  const isCandy = candyTerms.some(term => name.includes(term));
  const isGenericFood = ['egg', 'chicken', 'bread', 'milk'].some(term => 
    lowerQuery.includes(term)
  );
  
  if (isCandy && isGenericFood && !lowerQuery.includes('chocolate') && !lowerQuery.includes('candy')) {
    score -= 500; // Heavy penalty for candy when searching for real food
  }
  
  return score;
}

/**
 * Check if search results contain good/relevant matches
 * @param {Array} results - Search results
 * @param {string} query - Original query
 * @returns {boolean} True if results contain good matches
 */
export function hasGoodMatches(results, query) {
  if (!results || results.length === 0) {
    return false;
  }
  
  const lowerQuery = query.toLowerCase().trim();
  
  // Filter out stop words (same as search logic)
  const stopWords = new Set(['with', 'and', 'or', 'the', 'a', 'an', 'in', 'on', 'at', 'to', 'for', 'of', 'from']);
  const queryTerms = lowerQuery.split(' ')
    .filter(t => t.length > 0 && !stopWords.has(t));
  
  if (queryTerms.length === 0) {
    return false;
  }
  
  // Expand terms for pluralization (e.g., "eggs" -> ["eggs", "egg"])
  const expandedTerms = [];
  queryTerms.forEach(term => {
    expandedTerms.push(term);
    if (term === 'eggs') expandedTerms.push('egg');
    if (term === 'egg') expandedTerms.push('eggs');
    if (term.endsWith('s') && term.length > 3) {
      expandedTerms.push(term.slice(0, -1));
    } else if (!term.endsWith('s') && term.length > 2) {
      expandedTerms.push(term + 's');
    }
  });
  const uniqueTerms = [...new Set(expandedTerms)];
  
  // Check if at least one result is a good match
  for (const result of results) {
    const name = (result.name || result.food_name || '').toLowerCase();
    const brand = (result.brand || '').toLowerCase();
    
    // Exact match is always good
    if (name === lowerQuery) {
      return true;
    }
    
    // Check if brand matches query (important for brand searches like "musashi")
    if (brand && brand.includes(lowerQuery)) {
      return true;
    }
    
    // Check if result starts with query (good match)
    if (name.startsWith(lowerQuery)) {
      return true;
    }
    
    // For multi-word queries, check if all terms are present (using expanded forms)
    if (queryTerms.length > 1) {
      const allTermsMatch = queryTerms.every(term => {
        // Check if this term or its expanded forms are in the food name or brand
        const termVariations = uniqueTerms.filter(t => 
          t === term || 
          (term === 'eggs' && t === 'egg') || 
          (term === 'egg' && t === 'eggs') ||
          (term.endsWith('s') && t === term.slice(0, -1)) ||
          (!term.endsWith('s') && t === term + 's')
        );
        return termVariations.some(variation => 
          name.includes(variation) || (brand && brand.includes(variation))
        );
      });
      
      if (allTermsMatch) {
        return true;
      }
    } else {
      // Single word query - require primary match (starts with term) or high relevance
      const queryWord = queryTerms[0];
      const wordVariations = uniqueTerms.filter(t => 
        t === queryWord || 
        (queryWord === 'eggs' && t === 'egg') || 
        (queryWord === 'egg' && t === 'eggs')
      );
      
      // Check if food name starts with any variation (primary subject match)
      const startsWithPrimary = wordVariations.some(variation => 
        name.startsWith(variation + ',') || name.startsWith(variation + ' ')
      );
      
      if (startsWithPrimary) {
        return true;
      }
      
      // Check if brand matches (important for brand-only searches)
      const brandMatches = brand && wordVariations.some(variation => 
        brand.includes(variation) || brand === variation
      );
      
      if (brandMatches) {
        return true;
      }
      
      // Or if it contains the term and has reasonable relevance score
      // Lower threshold to allow more matches (e.g., "chicken" in compound dishes)
      if (wordVariations.some(variation => name.includes(variation.toLowerCase()))) {
        const relevanceScore = scoreGenericRelevance(result, query);
        // Lower threshold to 100 - allows "chicken" in "chicken & vegetable" but filters out very weak matches
        // This is more lenient than before (was 300) to catch more valid matches
        if (relevanceScore >= 100) {
          return true;
        }
      }
    }
  }
  
  return false;
}

export default {
  expandSearchTerms,
  isGenericQuery,
  deduplicateResults,
  scoreGenericRelevance,
  hasGoodMatches,
  createDedupKey
};
