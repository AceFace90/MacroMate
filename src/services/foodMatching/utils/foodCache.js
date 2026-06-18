/**
 * Food Caching Utilities
 * Handles caching verified foods and replacing AI-generated foods with better sources
 */

import database from '../../database-platform';
import quantityExtraction from '../../quantityExtraction';
import { searchOpenFoodFactsAPI } from '../../openFoodFactsAPI';

/**
 * Check if there's an existing AI-generated food and try to replace with better source
 * @param {Object} aiResult - AI-generated food result
 * @param {string} foodName - Food name to search for better source
 */
export async function checkAndReplaceAIFood(aiResult, foodName) {
  try {
    // Check if there's an existing saved food with AI source
    const existingFoods = await database.searchSavedFoods(foodName);
    const aiGeneratedFood = existingFoods.find(f => 
      f.verification_source === 'llm_confident' || 
      f.verification_source === 'llm_estimate' ||
      f.verification_source === 'gemini'
    );
    
    if (aiGeneratedFood) {
      console.log('🔍 Found existing AI-generated food, trying to find better source...');
      
      // Try to find better source from Open Food Facts API
      const apiResults = await searchOpenFoodFactsAPI(foodName, 3);
      if (apiResults && apiResults.length > 0) {
        const bestMatch = apiResults[0];
        console.log('✅ Found better source (Open Food Facts API), replacing AI-generated food');
        
        // Use per serving data if available, otherwise per 100g
        const hasServingSize = bestMatch.has_serving_size && bestMatch.serving_size_g;
        const servingSizeGrams = bestMatch.serving_size_g || 100;
        
        // Replace with API data (use same food name to overwrite)
        await cacheVerifiedFood({
          ...bestMatch,
          food_name: aiGeneratedFood.food_name, // Keep original name to replace existing entry
          calories: hasServingSize ? bestMatch.calories : bestMatch.calories_per_100g,
          protein_g: hasServingSize ? bestMatch.protein_g : bestMatch.protein_per_100g,
          carbs_g: hasServingSize ? bestMatch.carbs_g : bestMatch.carbs_per_100g,
          fat_g: hasServingSize ? bestMatch.fat_g : bestMatch.fat_per_100g,
          fiber_g: hasServingSize ? bestMatch.fiber_g : bestMatch.fiber_per_100g,
          sodium_mg: hasServingSize ? bestMatch.sodium_mg : bestMatch.sodium_per_100g,
          sugar_g: hasServingSize ? bestMatch.sugar_g : bestMatch.sugar_per_100g,
          quantity_g: servingSizeGrams,
          source: 'openfoodfacts-api',
          verification_source: 'openfoodfacts-api',
          is_verified: true
        });
        
        return; // Don't cache AI result since we replaced it
      }
    }
    
    // No better source found, cache AI result
    await cacheVerifiedFood(aiResult);
  } catch (error) {
    console.warn('Error checking/replacing AI food:', error.message);
    // Fallback: cache AI result anyway
    await cacheVerifiedFood(aiResult);
  }
}

/**
 * Cache verified AI results for future lookups
 * @param {Object} foodData - Verified food data from AI
 */
export async function cacheVerifiedFood(foodData) {
  try {
    // IMPORTANT: Only cache API/LLM results, NOT database foods (AFCD, OpenNutrition)
    // Database foods are already searchable and prioritized by history, so they don't need to be in saved_foods
    const source = foodData.verification_source || foodData.source || '';
    const isDatabaseFood = source === 'afcd' || source === 'opennutrition';
    
    if (isDatabaseFood) {
      console.log('📝 Skipping cache for database food:', foodData.food_name, `[Source: ${source}] - database foods are already searchable`);
      return; // Don't cache database foods
    }
    
    console.log('💾 Caching verified food:', foodData.food_name, `[Source: ${foodData.source || foodData.verification_source}]`);
    
    // Determine source for verification_source field
    // Format: "source" or "source-api" for API results
    let verificationSource = foodData.verification_source || foodData.source || null;
    if (!verificationSource && foodData.source) {
      verificationSource = foodData.source;
    }
    
    // Use per serving data if available (for branded products)
    const hasServingSize = foodData.has_serving_size && foodData.serving_size_g;
    const servingSizeGrams = foodData.serving_size_g || foodData.quantity_g || 100;
    
    // For branded products with serving size, use serving size nutrition
    let calories, protein, carbs, fat, fiber, sodium, sugar;
    if (hasServingSize && (foodData.source === 'openfoodfacts-api' || foodData.is_branded)) {
      calories = foodData.calories || foodData.calories_per_100g || 0;
      protein = foodData.protein_g || foodData.protein_per_100g || 0;
      carbs = foodData.carbs_g || foodData.carbs_per_100g || 0;
      fat = foodData.fat_g || foodData.fat_per_100g || 0;
      fiber = foodData.fiber_g || foodData.fiber_per_100g || 0;
      sodium = foodData.sodium_mg || foodData.sodium_per_100g || 0;
      sugar = foodData.sugar_g || foodData.sugar_per_100g || 0;
    } else {
      // Use provided values (already scaled appropriately)
      calories = foodData.calories || 0;
      protein = foodData.protein_g || 0;
      carbs = foodData.carbs_g || 0;
      fat = foodData.fat_g || 0;
      fiber = foodData.fiber_g || 0;
      sodium = foodData.sodium_mg || 0;
      sugar = foodData.sugar_g || 0;
    }
    
    await database.addSavedFood({
      food_name: foodData.food_name,
      food_name_normalized: quantityExtraction.normalizeFoodName(foodData.food_name),
      calories: calories,
      protein_g: protein,
      carbs_g: carbs,
      fat_g: fat,
      fiber_g: fiber,
      sodium_mg: sodium,
      sugar_g: sugar,
      serving_size_g: servingSizeGrams,
      is_verified: foodData.is_verified !== false,
      verification_source: verificationSource,
      // Extract brand name if available
      brand_name: foodData.brand || null,
      is_branded: !!(foodData.brand || foodData.source === 'openfoodfacts-api' || foodData.source === 'opennutrition')
    });
    
    console.log('✅ Cached for future lookups');
  } catch (error) {
    // Non-critical error - food is already logged
    console.warn('Could not cache food:', error.message);
  }
}
