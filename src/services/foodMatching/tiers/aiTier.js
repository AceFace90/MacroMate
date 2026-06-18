/**
 * TIER 5: AI Fallback (Gemini) with Open Food Facts context
 * Use AI when no database match found, enhanced with Open Food Facts data
 */

import gemini from '../../gemini';
import quantityExtraction from '../../quantityExtraction';
import { searchOpenFoodFactsAPI } from '../../openFoodFactsAPI';

/**
 * Try AI Match (Gemini)
 * @param {string} userInput - Original user input
 * @param {string} imageBase64 - Optional image
 * @param {number} estimatedGrams - Estimated quantity
 * @param {string} foodName - Extracted food name (for API context)
 * @returns {Object} AI analysis result
 */
export async function tryAIMatch(userInput, imageBase64, estimatedGrams, foodName = null) {
  try {
    console.log('🤖 Analyzing with Gemini AI...');
    
    // For image-based queries, skip Open Food Facts API to speed up processing
    // The image provides enough context for AI analysis
    // Only fetch context for text-only queries to improve accuracy
    let openFoodFactsContext = '';
    
    if (foodName && !imageBase64) {
      // For text-only queries, try to get context (but don't block if slow)
      // Use Promise.race to timeout after 2 seconds
      try {
        const contextPromise = searchOpenFoodFactsAPI(foodName, 2).then(apiResults => {
          if (apiResults && apiResults.length > 0) {
            let context = `\n\nCONTEXT FROM OPEN FOOD FACTS DATABASE:\n`;
            apiResults.forEach((product, idx) => {
              context += `${idx + 1}. ${product.food_name}: ${product.calories_per_100g} cal/100g, P:${product.protein_g}g C:${product.carbs_g}g F:${product.fat_g}g\n`;
            });
            context += `\nUse this as reference but provide your best estimate based on the user's description.`;
            return context;
          }
          return '';
        });
        
        const timeoutPromise = new Promise((resolve) => 
          setTimeout(() => resolve(''), 2000)
        );
        
        openFoodFactsContext = await Promise.race([contextPromise, timeoutPromise]);
        
        if (!openFoodFactsContext) {
          console.log('   ⚡ Skipping Open Food Facts context (timeout or no results)');
        }
      } catch (error) {
        // Ignore API errors - proceed without context
        console.log('   ⚡ Skipping Open Food Facts context (error)');
      }
    } else if (imageBase64) {
      console.log('   📸 Image provided - skipping Open Food Facts API for faster processing');
    }
    
    const aiResult = await gemini.analyzeFood(userInput, imageBase64, openFoodFactsContext);
    
    // Parse quantity from AI response if available
    if (aiResult.quantity_detected) {
      const parsedGrams = quantityExtraction.parseAIQuantity(aiResult.quantity_detected);
      aiResult.quantity_g = parsedGrams;
    } else {
      aiResult.quantity_g = estimatedGrams;
    }
    
    // Calculate per-100g values from AI result (AI returns values for quantity_g)
    const quantityGrams = aiResult.quantity_g || estimatedGrams || 100;
    const scaleFactor = 100 / quantityGrams;
    
    return {
      ...aiResult,
      // Per-100g values (calculated from AI result)
      calories_per_100g: Math.round((aiResult.calories || 0) * scaleFactor),
      protein_per_100g: Math.round((aiResult.protein_g || 0) * scaleFactor * 10) / 10,
      carbs_per_100g: Math.round((aiResult.carbs_g || 0) * scaleFactor * 10) / 10,
      fat_per_100g: Math.round((aiResult.fat_g || 0) * scaleFactor * 10) / 10,
      fiber_per_100g: Math.round((aiResult.fiber_g || 0) * scaleFactor * 10) / 10,
      sodium_per_100g: Math.round((aiResult.sodium_mg || 0) * scaleFactor),
      sugar_per_100g: Math.round((aiResult.sugar_g || 0) * scaleFactor * 10) / 10
    };
  } catch (error) {
    console.error('Error in AI match:', error);
    throw new Error('AI analysis failed: ' + error.message);
  }
}
