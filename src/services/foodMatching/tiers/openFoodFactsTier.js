/**
 * TIER 4: Open Food Facts — local DB (if downloaded) then API fallback
 * Try IndexedDB first when user has downloaded the OFF database; otherwise or on miss, use the API.
 */

import { searchOpenFoodFactsAPI } from '../../openFoodFactsAPI';
import { searchOpenFoodFacts } from '../../openFoodFactsSearch';

/**
 * Try Open Food Facts local database match (IndexedDB, when user has downloaded the OFF database).
 * Returns null if DB is empty or no match. Used before API in matchFood so API is fallback.
 * @param {string} foodName - Food name to search
 * @param {number} quantityGrams - Quantity in grams
 * @param {Object} extractionInfo - Info about quantity extraction (for scaling)
 * @returns {Object|null} Matched food or null
 */
export async function tryOpenFoodFactsDBMatch(foodName, quantityGrams, extractionInfo = null) {
  try {
    const results = await searchOpenFoodFacts(foodName, 3);
    if (!results || results.length === 0) return null;
    const best = results[0];
    // Result is already formatted (formatFoodResult). Ensure match shape for downstream.
    return {
      ...best,
      source: best.source || 'openfoodfacts',
      tier: best.tier || 'openfoodfacts',
      verification_source: best.verification_source || 'openfoodfacts',
      is_verified: true,
      confidence_score: 95
    };
  } catch (error) {
    console.error('Error in Open Food Facts DB match:', error);
    return null;
  }
}

/**
 * Try Open Food Facts API Match (live HTTP; used when DB is not downloaded or has no match)
 * @param {string} foodName - Food name to search
 * @param {number} quantityGrams - Quantity in grams
 * @param {Object} extractionInfo - Info about quantity extraction (to detect if quantity was specified)
 * @returns {Object|null} Matched food or null
 */
export async function tryOpenFoodFactsAPIMatch(foodName, quantityGrams, extractionInfo = null) {
  try {
    const results = await searchOpenFoodFactsAPI(foodName, 3);
    
    if (!results || results.length === 0) {
      return null;
    }
    
    // Get best match
    const bestMatch = results[0];
    
    // For branded products with serving size: ALWAYS use serving size unless user explicitly specified a different quantity
    // This ensures we default to full serving (e.g., 375ml can) not 100ml
    const hasServingSize = bestMatch.has_serving_size && bestMatch.serving_size_g;
    const servingSizeGrams = bestMatch.serving_size_g || 100;
    const hasPerServingData = hasServingSize && (
      bestMatch.calories_per_serving !== undefined ||
      (bestMatch.calories && bestMatch.calories > 0 && servingSizeGrams !== 100)
    );
    
    // Check if user explicitly specified a quantity (not just defaulted to 100g)
    // If extractionInfo is null or quantity is exactly 100g with unit 'g', it's likely the default
    const userSpecifiedQuantity = extractionInfo && 
      !(extractionInfo.quantity === 100 && extractionInfo.unit === 'g' && quantityGrams === 100);
    
    // Check if quantity matches serving size (within 10% tolerance)
    const quantityMatchesServing = hasServingSize && 
      Math.abs(quantityGrams - servingSizeGrams) / servingSizeGrams < 0.1;
    
    let finalCalories, finalProtein, finalCarbs, finalFat, finalFiber, finalSodium, finalSugar, finalQuantity;
    
    // Always use per-serving values if available, UNLESS user explicitly specified a different quantity
    if (hasServingSize && (!userSpecifiedQuantity || quantityMatchesServing)) {
      // Use serving size nutrition (default for branded products)
      console.log(`   Using serving size (${servingSizeGrams}g/ml) nutrition for branded product`);
      finalCalories = Math.round(bestMatch.calories || 0);
      finalProtein = Math.round((bestMatch.protein_g || 0) * 10) / 10;
      finalCarbs = Math.round((bestMatch.carbs_g || 0) * 10) / 10;
      finalFat = Math.round((bestMatch.fat_g || 0) * 10) / 10;
      finalFiber = Math.round((bestMatch.fiber_g || 0) * 10) / 10;
      finalSodium = Math.round(bestMatch.sodium_mg || 0);
      finalSugar = Math.round((bestMatch.sugar_g || 0) * 10) / 10;
      finalQuantity = servingSizeGrams;
    } else if (userSpecifiedQuantity && !quantityMatchesServing) {
      // User explicitly specified a different quantity → scale from per 100g or per-serving
      // If we have per-serving values, scale from those; otherwise scale from per-100g
      const baseQuantity = hasServingSize ? servingSizeGrams : 100;
      const scaleFactor = quantityGrams / baseQuantity;
      const sourceDesc = hasServingSize ? `per-serving (${servingSizeGrams}g/ml)` : 'per-100g';
      console.log(`   Scaling from ${sourceDesc} (${quantityGrams}g/ml requested, scale factor: ${scaleFactor.toFixed(2)})`);
      
      if (hasServingSize) {
        // Scale from per-serving values
        finalCalories = Math.round((bestMatch.calories || 0) * scaleFactor);
        finalProtein = Math.round((bestMatch.protein_g || 0) * scaleFactor * 10) / 10;
        finalCarbs = Math.round((bestMatch.carbs_g || 0) * scaleFactor * 10) / 10;
        finalFat = Math.round((bestMatch.fat_g || 0) * scaleFactor * 10) / 10;
        finalFiber = Math.round((bestMatch.fiber_g || 0) * scaleFactor * 10) / 10;
        finalSodium = Math.round((bestMatch.sodium_mg || 0) * scaleFactor);
        finalSugar = Math.round((bestMatch.sugar_g || 0) * scaleFactor * 10) / 10;
      } else {
        // Scale from per-100g values
        finalCalories = Math.round((bestMatch.calories_per_100g || bestMatch.calories || 0) * scaleFactor);
        finalProtein = Math.round((bestMatch.protein_per_100g || bestMatch.protein_g || 0) * scaleFactor * 10) / 10;
        finalCarbs = Math.round((bestMatch.carbs_per_100g || bestMatch.carbs_g || 0) * scaleFactor * 10) / 10;
        finalFat = Math.round((bestMatch.fat_per_100g || bestMatch.fat_g || 0) * scaleFactor * 10) / 10;
        finalFiber = Math.round((bestMatch.fiber_per_100g || bestMatch.fiber_g || 0) * scaleFactor * 10) / 10;
        finalSodium = Math.round((bestMatch.sodium_per_100g || bestMatch.sodium_mg || 0) * scaleFactor);
        finalSugar = Math.round((bestMatch.sugar_per_100g || bestMatch.sugar_g || 0) * scaleFactor * 10) / 10;
      }
      finalQuantity = quantityGrams;
    } else {
      // No serving size or fallback: use per-100g scaled to requested quantity
      const scaleFactor = quantityGrams / 100;
      console.log(`   Using per-100g values (no serving size available, ${quantityGrams}g requested)`);
      finalCalories = Math.round((bestMatch.calories_per_100g || bestMatch.calories || 0) * scaleFactor);
      finalProtein = Math.round((bestMatch.protein_per_100g || bestMatch.protein_g || 0) * scaleFactor * 10) / 10;
      finalCarbs = Math.round((bestMatch.carbs_per_100g || bestMatch.carbs_g || 0) * scaleFactor * 10) / 10;
      finalFat = Math.round((bestMatch.fat_per_100g || bestMatch.fat_g || 0) * scaleFactor * 10) / 10;
      finalFiber = Math.round((bestMatch.fiber_per_100g || bestMatch.fiber_g || 0) * scaleFactor * 10) / 10;
      finalSodium = Math.round((bestMatch.sodium_per_100g || bestMatch.sodium_mg || 0) * scaleFactor);
      finalSugar = Math.round((bestMatch.sugar_per_100g || bestMatch.sugar_g || 0) * scaleFactor * 10) / 10;
      finalQuantity = quantityGrams;
    }
    
    // Ensure calories_per_100g is always available for serving size calculations
    // Calculate from per-serving data if per-100g is missing or zero
    let caloriesPer100g = bestMatch.calories_per_100g;
    if (!caloriesPer100g || caloriesPer100g === 0) {
      if (bestMatch.calories && servingSizeGrams && servingSizeGrams > 0 && servingSizeGrams !== 100) {
        // Calculate from per-serving values
        caloriesPer100g = (bestMatch.calories / servingSizeGrams) * 100;
      } else if (bestMatch.calories && (!servingSizeGrams || servingSizeGrams === 100)) {
        // If serving size is 100g or missing, assume calories is already per-100g
        caloriesPer100g = bestMatch.calories;
      } else {
        // Last resort: calculate from macros (4 cal/g protein, 4 cal/g carbs, 9 cal/g fat)
        const protein = bestMatch.protein_per_100g || bestMatch.protein_g || 0;
        const carbs = bestMatch.carbs_per_100g || bestMatch.carbs_g || 0;
        const fat = bestMatch.fat_per_100g || bestMatch.fat_g || 0;
        caloriesPer100g = Math.round((protein * 4) + (carbs * 4) + (fat * 9));
      }
    }
    
    // Ensure other per-100g values are calculated if missing
    let proteinPer100g = bestMatch.protein_per_100g;
    if (!proteinPer100g && bestMatch.protein_g && servingSizeGrams && servingSizeGrams > 0 && servingSizeGrams !== 100) {
      proteinPer100g = (bestMatch.protein_g / servingSizeGrams) * 100;
    } else if (!proteinPer100g) {
      proteinPer100g = bestMatch.protein_g || 0;
    }
    
    let carbsPer100g = bestMatch.carbs_per_100g;
    if (!carbsPer100g && bestMatch.carbs_g && servingSizeGrams && servingSizeGrams > 0 && servingSizeGrams !== 100) {
      carbsPer100g = (bestMatch.carbs_g / servingSizeGrams) * 100;
    } else if (!carbsPer100g) {
      carbsPer100g = bestMatch.carbs_g || 0;
    }
    
    let fatPer100g = bestMatch.fat_per_100g;
    if (!fatPer100g && bestMatch.fat_g && servingSizeGrams && servingSizeGrams > 0 && servingSizeGrams !== 100) {
      fatPer100g = (bestMatch.fat_g / servingSizeGrams) * 100;
    } else if (!fatPer100g) {
      fatPer100g = bestMatch.fat_g || 0;
    }
    
    let fiberPer100g = bestMatch.fiber_per_100g;
    if (!fiberPer100g && bestMatch.fiber_g && servingSizeGrams && servingSizeGrams > 0 && servingSizeGrams !== 100) {
      fiberPer100g = (bestMatch.fiber_g / servingSizeGrams) * 100;
    } else if (!fiberPer100g) {
      fiberPer100g = bestMatch.fiber_g || 0;
    }
    
    let sodiumPer100g = bestMatch.sodium_per_100g;
    if (!sodiumPer100g && bestMatch.sodium_mg && servingSizeGrams && servingSizeGrams > 0 && servingSizeGrams !== 100) {
      sodiumPer100g = (bestMatch.sodium_mg / servingSizeGrams) * 100;
    } else if (!sodiumPer100g) {
      sodiumPer100g = bestMatch.sodium_mg || 0;
    }
    
    let sugarPer100g = bestMatch.sugar_per_100g;
    if (!sugarPer100g && bestMatch.sugar_g && servingSizeGrams && servingSizeGrams > 0 && servingSizeGrams !== 100) {
      sugarPer100g = (bestMatch.sugar_g / servingSizeGrams) * 100;
    } else if (!sugarPer100g) {
      sugarPer100g = bestMatch.sugar_g || 0;
    }
    
    return {
      name: bestMatch.food_name,
      food_name: bestMatch.food_name,
      calories: finalCalories,
      protein_g: finalProtein,
      carbs_g: finalCarbs,
      fat_g: finalFat,
      fiber_g: finalFiber,
      sodium_mg: finalSodium,
      sugar_g: finalSugar,
      quantity_g: finalQuantity,
      // Per-100g values (for recalculation) - ensure they're always calculated
      calories_per_100g: caloriesPer100g,
      protein_per_100g: proteinPer100g,
      carbs_per_100g: carbsPer100g,
      fat_per_100g: fatPer100g,
      fiber_per_100g: fiberPer100g,
      sodium_per_100g: sodiumPer100g,
      sugar_per_100g: sugarPer100g,
      // Per-serving values (original serving size from product)
      base_serving_size_g: servingSizeGrams,
      calories_per_serving: hasServingSize && hasPerServingData ? (bestMatch.calories || 0) : undefined,
      protein_per_serving: hasServingSize && hasPerServingData ? (bestMatch.protein_g || 0) : undefined,
      carbs_per_serving: hasServingSize && hasPerServingData ? (bestMatch.carbs_g || 0) : undefined,
      fat_per_serving: hasServingSize && hasPerServingData ? (bestMatch.fat_g || 0) : undefined,
      fiber_per_serving: hasServingSize && hasPerServingData ? (bestMatch.fiber_g || 0) : undefined,
      sodium_per_serving: hasServingSize && hasPerServingData ? (bestMatch.sodium_mg || 0) : undefined,
      sugar_per_serving: hasServingSize && hasPerServingData ? (bestMatch.sugar_g || 0) : undefined,
      serving_size_g: servingSizeGrams,
      serving_size_display: bestMatch.serving_size_display,
      serving_size_unit: bestMatch.serving_size_unit,
      is_verified: true,
      verification_source: 'openfoodfacts-api',
      confidence_score: 90,
      source: 'openfoodfacts-api',
      tier: 'api',
      barcode: bestMatch.barcode
    };
  } catch (error) {
    console.error('Error in Open Food Facts API match:', error);
    return null;
  }
}

/**
 * Search Open Food Facts tier for dropdown results
 * @param {string} searchTerm - Search term
 * @param {number} quantityGrams - Quantity in grams
 * @param {number} limit - Max results
 * @param {string} countryCode - User's country code
 * @param {Array} countryBrands - Country-specific brands
 * @returns {Array} Formatted results
 */
export async function searchOpenFoodFactsTier(searchTerm, quantityGrams, limit, countryCode = 'AU', countryBrands = []) {
  try {
    console.log(`🔍 OpenFoodFacts tier searching for: "${searchTerm}"`);
    const results = await searchOpenFoodFacts(searchTerm, limit * 2);
    console.log(`   OpenFoodFacts tier found: ${results.length} results`);
    
    if (!results || results.length === 0) {
      return [];
    }
    
    // Scale nutrition values ONLY if user explicitly specified a quantity different from serving size
    // Otherwise, use the serving size from the database (already set by formatFoodResult)
    const scaledResults = results.map(food => {
      // Check if food has a serving size
      const servingSizeGrams = food.serving_size_g || food.base_serving_size_g || food.quantity_g;
      const hasServingSize = servingSizeGrams && servingSizeGrams > 0 && servingSizeGrams !== 100;
      
      // Only scale if user specified a quantity AND it's different from the serving size
      const userSpecifiedQuantity = quantityGrams && quantityGrams !== 100;
      const shouldScale = userSpecifiedQuantity && (!hasServingSize || Math.abs(quantityGrams - servingSizeGrams) / servingSizeGrams > 0.1);
      
      if (shouldScale) {
        // User wants a different quantity - scale from serving size or per-100g
        const baseQuantity = hasServingSize ? servingSizeGrams : 100;
        const scaleFactor = quantityGrams / baseQuantity;
        
        return {
          ...food,
          calories: Math.round((food.calories || 0) * scaleFactor),
          protein_g: Math.round((food.protein_g || 0) * scaleFactor * 10) / 10,
          carbs_g: Math.round((food.carbs_g || 0) * scaleFactor * 10) / 10,
          fat_g: Math.round((food.fat_g || 0) * scaleFactor * 10) / 10,
          fiber_g: Math.round((food.fiber_g || 0) * scaleFactor * 10) / 10,
          sodium_mg: Math.round((food.sodium_mg || 0) * scaleFactor),
          sugar_g: Math.round((food.sugar_g || 0) * scaleFactor * 10) / 10,
          quantity_g: quantityGrams, // Use user-specified quantity
          source: 'openfoodfacts',
          tier: 'openfoodfacts',
          verification_source: 'openfoodfacts',
          is_verified: true,
          confidence_score: 95
        };
      } else {
        // Use serving size from database (already formatted correctly by formatFoodResult)
        // Don't override quantity_g - keep what formatFoodResult set (serving size)
        return {
          ...food,
          // quantity_g is already set correctly by formatFoodResult (serving size or 100)
          source: 'openfoodfacts',
          tier: 'openfoodfacts',
          verification_source: 'openfoodfacts',
          is_verified: true,
          confidence_score: 95
        };
      }
    });
    
    // Boost country-specific brands (especially Australian brands in curated OpenFoodFacts)
    // This curated database (3,523 foods) is Australian-focused with 538 Australian products
    const countryBrandLower = countryBrands.map(b => b.toLowerCase());
    const boostedResults = scaledResults.map(food => {
      const brand = (food.brand || '').toLowerCase();
      const name = (food.name || food.food_name || '').toLowerCase();
      
      let boost = 0;
      // Higher boost for Australian brands (Coles, Woolworths, Arnott's, Sanitarium, etc.)
      if (countryCode === 'AU' && countryBrandLower.some(cb => brand.includes(cb) || name.includes(cb))) {
        boost = 150; // Significant boost for Australian brands
      } else if (countryBrandLower.some(cb => brand.includes(cb) || name.includes(cb))) {
        boost = 50; // Standard boost for other country brands
      }
      
      return {
        ...food,
        _countryBoost: boost,
        _score: (food._score || 0) + boost
      };
    });
    
    return boostedResults.slice(0, limit);
  } catch (error) {
    console.error('OpenFoodFacts tier search error:', error);
    return [];
  }
}
