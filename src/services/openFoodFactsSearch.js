/**
 * Open Food Facts Search Service
 *
 * Optional offline database: user can download the full 1M curated OFF set.
 * No bundled OFF by default; fallback is OFF API.
 * Data source: https://world.openfoodfacts.org/data
 * License: Open Database License (ODbL)
 */

import { getIndexedDB, getOFFStoreCount } from './openfoodfacts/db';
import { loadOpenFoodFactsFoods, loadDatabaseFile, isExtendedDatabaseLoaded, downloadExtendedDatabase, removeExtendedDatabase } from './openfoodfacts/loader';
import { getUpdateInfo } from './openfoodfacts/updates';
import { formatFoodResult } from './openfoodfacts/formatter';
import { lookupByBarcode } from './openfoodfacts/barcode';

/** Guard: only one auto-load of OFF from /data/ at a time */
let offAutoLoadInProgress = false;

export {
  isExtendedDatabaseLoaded,
  downloadExtendedDatabase,
  removeExtendedDatabase,
  getUpdateInfo,
  lookupByBarcode
};

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

export default {
  searchOpenFoodFacts,
  getUpdateInfo,
  loadOpenFoodFactsFoods,
  lookupByBarcode
};
