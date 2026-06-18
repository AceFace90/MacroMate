/**
 * TIER 1: AFCD Database Match
 * Official Australian government data, per-100g values
 */

import database from '../../database-platform';
import quantityExtraction from '../../quantityExtraction';

/**
 * Try AFCD Database Match
 * @param {string} foodName - Normalized food name
 * @param {number} quantityGrams - Quantity in grams
 * @returns {Object|null} Matched food or null
 */
export async function tryAFCDMatch(foodName, quantityGrams) {
  try {
    const normalized = quantityExtraction.normalizeFoodName(foodName);
    console.log('🇦🇺 Searching AFCD for:', normalized);
    
    // Search AFCD database
    const results = await database.searchAFCDFoods(normalized);
    
    if (!results || results.length === 0) {
      console.log('❌ No AFCD match');
      return null;
    }
    
    // Get best match (first result is already sorted by relevance)
    const bestMatch = results[0];
    console.log('✅ Found AFCD match:', bestMatch.food_name);
    
    // Scale from per-100g to actual quantity
    const scaled = quantityExtraction.scaleAFCDFood(bestMatch, quantityGrams);
    
    return {
      ...scaled,
      name: bestMatch.food_name,
      source: 'afcd',
      tier: 'afcd',
      calories_per_100g: bestMatch.energy_kcal || 0,
      protein_per_100g: bestMatch.protein_g || 0,
      carbs_per_100g: bestMatch.carbs_g || 0,
      fat_per_100g: bestMatch.fat_g || 0,
      fiber_per_100g: bestMatch.fiber_g || 0,
      sodium_per_100g: bestMatch.sodium_mg || 0,
      sugar_per_100g: bestMatch.sugar_g || 0
    };
  } catch (error) {
    console.error('Error in AFCD match:', error);
    return null;
  }
}

/**
 * Search AFCD tier for dropdown results
 * @param {string} searchTerm - Search term
 * @param {number} quantityGrams - Quantity in grams
 * @param {number} limit - Max results
 * @returns {Array} Formatted results
 */
export async function searchAFCDTier(searchTerm, quantityGrams, limit) {
  try {
    const results = await database.searchAFCDFoods(searchTerm);
    return results.slice(0, limit).map(food => ({
      name: food.food_name,
      calories: Math.round((food.energy_kcal || 0) * quantityGrams / 100),
      protein_g: Math.round((food.protein_g || 0) * quantityGrams / 100 * 10) / 10,
      carbs_g: Math.round((food.carbs_g || 0) * quantityGrams / 100 * 10) / 10,
      fat_g: Math.round((food.fat_g || 0) * quantityGrams / 100 * 10) / 10,
      fiber_g: Math.round((food.fiber_g || 0) * quantityGrams / 100 * 10) / 10,
      sodium_mg: Math.round((food.sodium_mg || 0) * quantityGrams / 100),
      sugar_g: Math.round((food.sugar_g || 0) * quantityGrams / 100 * 10) / 10,
      quantity_g: quantityGrams,
      // Per-100g values (AFCD data is per-100g)
      calories_per_100g: food.energy_kcal || 0,
      protein_per_100g: food.protein_g || 0,
      carbs_per_100g: food.carbs_g || 0,
      fat_per_100g: food.fat_g || 0,
      fiber_per_100g: food.fiber_g || 0,
      sodium_per_100g: food.sodium_mg || 0,
      sugar_per_100g: food.sugar_g || 0,
      is_verified: true,
      verification_source: 'afcd',
      confidence_score: 100,
      source: 'afcd',
      tier: 1
    }));
  } catch (error) {
    console.error('AFCD tier search error:', error);
    return [];
  }
}
