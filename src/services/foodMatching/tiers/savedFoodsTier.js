/**
 * TIER 3: Saved Foods Cache
 * Branded products, previously verified items, frequently used foods
 */

import database from '../../database-platform';
import quantityExtraction from '../../quantityExtraction';

/**
 * Try Saved Foods Cache Match
 * @param {string} foodName - Food name to search
 * @param {number} quantityGrams - Quantity in grams  
 * @returns {Object|null} Matched food or null
 */
export async function trySavedFoodsMatch(foodName, quantityGrams) {
  try {
    const normalized = quantityExtraction.normalizeFoodName(foodName);
    console.log('⭐ Searching saved foods for:', normalized);
    
    const results = await database.searchSavedFoods(normalized);
    
    if (!results || results.length === 0) {
      console.log('❌ No saved food match');
      return null;
    }
    
    // Get best match (sorted by usage_count)
    const bestMatch = results[0];
    console.log('✅ Found saved food match:', bestMatch.food_name);
    
    // Check if saved food has serving size, scale if needed
    const basedOn = bestMatch.serving_size_g || 100;
    const scaleFactor = quantityGrams / basedOn;
    
    // Calculate per-100g values from saved food
    const per100gScale = 100 / basedOn;
    const hasPerServingData = bestMatch.serving_size_g && bestMatch.serving_size_g !== 100;
    
    return {
      food_name: bestMatch.food_name,
      quantity_g: quantityGrams,
      calories: Math.round((bestMatch.calories || 0) * scaleFactor),
      protein_g: Math.round((bestMatch.protein_g || 0) * scaleFactor * 10) / 10,
      carbs_g: Math.round((bestMatch.carbs_g || 0) * scaleFactor * 10) / 10,
      fat_g: Math.round((bestMatch.fat_g || 0) * scaleFactor * 10) / 10,
      fiber_g: Math.round((bestMatch.fiber_g || 0) * scaleFactor * 10) / 10,
      sodium_mg: Math.round((bestMatch.sodium_mg || 0) * scaleFactor),
      sugar_g: Math.round((bestMatch.sugar_g || 0) * scaleFactor * 10) / 10,
      // Per-100g values (calculated from saved food)
      calories_per_100g: Math.round((bestMatch.calories || 0) * per100gScale),
      protein_per_100g: Math.round((bestMatch.protein_g || 0) * per100gScale * 10) / 10,
      carbs_per_100g: Math.round((bestMatch.carbs_g || 0) * per100gScale * 10) / 10,
      fat_per_100g: Math.round((bestMatch.fat_g || 0) * per100gScale * 10) / 10,
      fiber_per_100g: Math.round((bestMatch.fiber_g || 0) * per100gScale * 10) / 10,
      sodium_per_100g: Math.round((bestMatch.sodium_mg || 0) * per100gScale),
      sugar_per_100g: Math.round((bestMatch.sugar_g || 0) * per100gScale * 10) / 10,
      // Per-serving values (if serving size exists)
      base_serving_size_g: basedOn,
      calories_per_serving: hasPerServingData ? (bestMatch.calories || 0) : undefined,
      protein_per_serving: hasPerServingData ? (bestMatch.protein_g || 0) : undefined,
      carbs_per_serving: hasPerServingData ? (bestMatch.carbs_g || 0) : undefined,
      fat_per_serving: hasPerServingData ? (bestMatch.fat_g || 0) : undefined,
      fiber_per_serving: hasPerServingData ? (bestMatch.fiber_g || 0) : undefined,
      sodium_per_serving: hasPerServingData ? (bestMatch.sodium_mg || 0) : undefined,
      sugar_per_serving: hasPerServingData ? (bestMatch.sugar_g || 0) : undefined,
      is_verified: bestMatch.is_verified !== false,
      verification_source: bestMatch.verification_source || 'saved',
      confidence_score: 95,
      from_cache: true
    };
  } catch (error) {
    console.error('Error in saved foods match:', error);
    return null;
  }
}

/**
 * Search saved foods tier for dropdown results
 * @param {string} searchTerm - Search term
 * @param {number} quantityGrams - Quantity in grams
 * @param {number} limit - Max results
 * @returns {Array} Formatted results
 */
export async function searchSavedTier(searchTerm, quantityGrams, limit) {
  try {
    const results = await database.searchSavedFoods(searchTerm);
    return results.slice(0, limit).map(food => {
      const basedOn = food.serving_size_g || 100;
      const scaleFactor = quantityGrams / basedOn;
      
      // Determine source from verification_source
      let source = 'saved';
      if (food.verification_source === 'gemini' || 
          food.verification_source === 'llm_confident' || 
          food.verification_source === 'llm_estimate') {
        source = 'gemini';
      } else if (food.verification_source === 'openfoodfacts-api') {
        source = 'openfoodfacts-api';
      } else if (food.verification_source === 'opennutrition') {
        source = 'opennutrition';
      } else if (food.verification_source === 'openfoodfacts') {
        source = 'openfoodfacts';
      } else if (food.verification_source === 'afcd') {
        source = 'afcd';
      }
      
      // Calculate per-100g values from saved food data
      // Saved foods store calories for serving_size_g, so calculate per-100g
      const per100gFactor = 100 / basedOn;
      
      return {
        name: food.food_name,
        calories: Math.round((food.calories || 0) * scaleFactor),
        protein_g: Math.round((food.protein_g || 0) * scaleFactor * 10) / 10,
        carbs_g: Math.round((food.carbs_g || 0) * scaleFactor * 10) / 10,
        fat_g: Math.round((food.fat_g || 0) * scaleFactor * 10) / 10,
        fiber_g: Math.round((food.fiber_g || 0) * scaleFactor * 10) / 10,
        sodium_mg: Math.round((food.sodium_mg || 0) * scaleFactor),
        sugar_g: Math.round((food.sugar_g || 0) * scaleFactor * 10) / 10,
        quantity_g: quantityGrams,
        // Per-100g values (calculated from saved food serving size)
        calories_per_100g: Math.round((food.calories || 0) * per100gFactor),
        protein_per_100g: Math.round((food.protein_g || 0) * per100gFactor * 10) / 10,
        carbs_per_100g: Math.round((food.carbs_g || 0) * per100gFactor * 10) / 10,
        fat_per_100g: Math.round((food.fat_g || 0) * per100gFactor * 10) / 10,
        fiber_per_100g: Math.round((food.fiber_g || 0) * per100gFactor * 10) / 10,
        sodium_per_100g: Math.round((food.sodium_mg || 0) * per100gFactor),
        sugar_per_100g: Math.round((food.sugar_g || 0) * per100gFactor * 10) / 10,
        is_verified: food.is_verified !== false,
        verification_source: food.verification_source || 'saved',
        confidence_score: 95,
        source: source,
        tier: 2,
        usage_count: food.usage_count || 0
      };
    });
  } catch (error) {
    console.error('Saved tier search error:', error);
    return [];
  }
}
