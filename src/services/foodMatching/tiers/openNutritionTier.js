/**
 * TIER 2: OpenNutrition Database Match
 * 5,000 curated branded products with barcodes
 */

import quantityExtraction from '../../quantityExtraction';
import { searchOpenNutrition } from '../../openNutritionSearch';

/**
 * Try OpenNutrition Database Match
 * @param {string} foodName - Food name to search
 * @param {number} quantityGrams - Quantity in grams
 * @returns {Object|null} Matched food or null
 */
export async function tryOpenNutritionMatch(foodName, quantityGrams) {
  try {
    const normalized = quantityExtraction.normalizeFoodName(foodName);
    console.log('🏷️  Searching OpenNutrition for:', normalized);
    
    const results = await searchOpenNutrition(normalized, 5);
    
    if (!results || results.length === 0) {
      console.log('❌ No OpenNutrition match');
      return null;
    }
    
    // Get best match
    const bestMatch = results[0];
    console.log('✅ Found OpenNutrition match:', bestMatch.food_name);
    
    // OpenNutrition data is already per-100g, scale it
    const scaled = quantityExtraction.scaleAFCDFood(bestMatch, quantityGrams);
    
    // Extract per-100g values (OpenNutrition stores per-100g)
    const servingSizeGrams = bestMatch.serving_size_g || 100;
    const hasPerServingData = bestMatch.serving_size_g && bestMatch.serving_size_g !== 100;
    
    return {
      ...scaled,
      // Per-100g values
      calories_per_100g: bestMatch.calories || bestMatch.calories_per_100g || 0,
      protein_per_100g: bestMatch.protein_g || 0,
      carbs_per_100g: bestMatch.carbs_g || 0,
      fat_per_100g: bestMatch.fat_g || 0,
      fiber_per_100g: bestMatch.fiber_g || 0,
      sodium_per_100g: bestMatch.sodium_mg || 0,
      sugar_per_100g: bestMatch.sugar_g || 0,
      // Per-serving values (if serving size exists and differs from 100g)
      base_serving_size_g: servingSizeGrams,
      calories_per_serving: hasPerServingData ? (scaled.calories || 0) : undefined,
      protein_per_serving: hasPerServingData ? (scaled.protein_g || 0) : undefined,
      carbs_per_serving: hasPerServingData ? (scaled.carbs_g || 0) : undefined,
      fat_per_serving: hasPerServingData ? (scaled.fat_g || 0) : undefined,
      fiber_per_serving: hasPerServingData ? (scaled.fiber_g || 0) : undefined,
      sodium_per_serving: hasPerServingData ? (scaled.sodium_mg || 0) : undefined,
      sugar_per_serving: hasPerServingData ? (scaled.sugar_g || 0) : undefined,
      source: 'opennutrition',
      tier: 'opennutrition',
      is_verified: true,
      verification_source: 'opennutrition',
      confidence_score: 95
    };
  } catch (error) {
    console.error('Error in OpenNutrition match:', error);
    return null;
  }
}

/**
 * Search OpenNutrition tier for dropdown results
 * @param {string} searchTerm - Search term
 * @param {number} quantityGrams - Quantity in grams
 * @param {number} limit - Max results
 * @param {string} countryCode - User's country code
 * @param {Array} countryBrands - Country-specific brands
 * @returns {Array} Formatted results
 */
export async function searchOpenNutritionTier(searchTerm, quantityGrams, limit, countryCode = 'AU', countryBrands = []) {
  try {
    // Expand search terms for better matching (e.g., "eggs" → "egg")
    const expandedTerms = searchTerm.split(' ').flatMap(term => {
      const terms = [term];
      if (term.endsWith('s') && term.length > 3) {
        terms.push(term.slice(0, -1));
      } else if (!term.endsWith('s') && term.length > 2) {
        terms.push(term + 's');
      }
      if (term === 'egg') terms.push('eggs');
      if (term === 'eggs') terms.push('egg');
      return terms;
    });
    
    // Search with expanded terms
    const allResults = await Promise.all(
      [...new Set(expandedTerms)].map(term => searchOpenNutrition(term, limit * 2))
    );
    
    // Flatten and deduplicate
    const flatResults = Array.from(new Map(
      allResults.flat().map(f => [f.id || f.food_name, f])
    ).values());
    
    // Boost scores for country-specific brands and exact matches
    const scoredResults = flatResults.map(food => {
      const foodName = (food.food_name || '').toLowerCase();
      const altNames = (food.alternate_names || []).join(' ').toLowerCase();
      const searchText = `${foodName} ${altNames}`;
      
      // Check if food matches country-specific brands
      const matchesCountryBrand = countryBrands.some(brand => 
        searchText.includes(brand.toLowerCase())
      );
      
      // Check if query contains brand name
      const queryHasBrand = countryBrands.some(brand => 
        searchTerm.toLowerCase().includes(brand.toLowerCase())
      );
      
      // Boost if brand is in query AND food matches that brand
      const brandMatchBoost = queryHasBrand && matchesCountryBrand ? 200 : 0;
      
      return {
        ...food,
        _countryBoost: matchesCountryBrand ? 100 : 0,
        _brandMatchBoost: brandMatchBoost
      };
    });
    
    // Sort by brand match boost, then country boost, then by original score
    scoredResults.sort((a, b) => {
      if (b._brandMatchBoost !== a._brandMatchBoost) {
        return b._brandMatchBoost - a._brandMatchBoost;
      }
      if (b._countryBoost !== a._countryBoost) {
        return b._countryBoost - a._countryBoost;
      }
      return 0; // Keep original order
    });
    
    return scoredResults.slice(0, limit).map(food => ({
      name: food.food_name,
      calories: Math.round((food.calories || 0) * quantityGrams / 100),
      protein_g: Math.round((food.protein_g || 0) * quantityGrams / 100 * 10) / 10,
      carbs_g: Math.round((food.carbs_g || 0) * quantityGrams / 100 * 10) / 10,
      fat_g: Math.round((food.fat_g || 0) * quantityGrams / 100 * 10) / 10,
      fiber_g: Math.round((food.fiber_g || 0) * quantityGrams / 100 * 10) / 10,
      sodium_mg: Math.round((food.sodium_mg || 0) * quantityGrams / 100),
      sugar_g: Math.round((food.sugar_g || 0) * quantityGrams / 100 * 10) / 10,
      quantity_g: quantityGrams,
      // Per-100g values (OpenNutrition stores per-100g)
      calories_per_100g: food.calories || food.calories_per_100g || 0,
      protein_per_100g: food.protein_g || 0,
      carbs_per_100g: food.carbs_g || 0,
      fat_per_100g: food.fat_g || 0,
      fiber_per_100g: food.fiber_g || 0,
      sodium_per_100g: food.sodium_mg || 0,
      sugar_per_100g: food.sugar_g || 0,
      is_verified: true,
      verification_source: 'opennutrition',
      confidence_score: 95,
      source: 'opennutrition',
      tier: 2,
      ean_13: food.ean_13
    }));
  } catch (error) {
    console.error('OpenNutrition tier search error:', error);
    return [];
  }
}
