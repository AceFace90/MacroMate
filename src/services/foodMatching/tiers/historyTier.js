/**
 * History Tier Search
 * Search recently logged foods from user's history
 */

import database from '../../database-platform';

/**
 * Search history tier for dropdown results
 * @param {string} searchTerm - Search term
 * @param {number} quantityGrams - Quantity in grams
 * @param {number} limit - Max results
 * @returns {Array} Formatted results
 */
export async function searchHistoryTier(searchTerm, quantityGrams, limit) {
  // History search - get recently logged foods
  // This requires grouping food_logs by name
  try {
    // Get all logs matching the search
    const allLogs = await database.getFoodLogs(new Date().toISOString().split('T')[0]);
    
    // Group by food name and get averages
    const foodMap = new Map();
    allLogs.forEach(log => {
      if (!log.food_name.toLowerCase().includes(searchTerm.toLowerCase())) return;
      
      if (!foodMap.has(log.food_name)) {
        foodMap.set(log.food_name, {
          name: log.food_name,
          calories: [],
          protein_g: [],
          carbs_g: [],
          fat_g: [],
          fiber_g: [],
          sodium_mg: [],
          sugar_g: [],
          quantity_g: [],
          last_logged: log.logged_at
        });
      }
      
      const food = foodMap.get(log.food_name);
      food.calories.push(log.calories || 0);
      food.protein_g.push(log.protein_g || 0);
      food.carbs_g.push(log.carbs_g || 0);
      food.fat_g.push(log.fat_g || 0);
      food.fiber_g.push(log.fiber_g || 0);
      food.sodium_mg.push(log.sodium_mg || 0);
      food.sugar_g.push(log.sugar_g || 0);
      food.quantity_g.push(log.quantity_g || 100);
      
      if (new Date(log.logged_at) > new Date(food.last_logged)) {
        food.last_logged = log.logged_at;
      }
    });
    
    // Calculate averages and sort by recency
    const historyResults = Array.from(foodMap.values())
      .map(food => {
        // History logs have quantity_g, calculate per-100g from averages
        const avgCalories = food.calories.reduce((a, b) => a + b, 0) / food.calories.length;
        const avgQuantity = food.quantity_g ? food.quantity_g.reduce((a, b) => a + b, 0) / food.quantity_g.length : 100;
        const per100gFactor = avgQuantity > 0 ? 100 / avgQuantity : 1;
        
        return {
          name: food.name,
          calories: Math.round(avgCalories * quantityGrams / avgQuantity),
          protein_g: Math.round((food.protein_g.reduce((a, b) => a + b, 0) / food.protein_g.length) * quantityGrams / avgQuantity * 10) / 10,
          carbs_g: Math.round((food.carbs_g.reduce((a, b) => a + b, 0) / food.carbs_g.length) * quantityGrams / avgQuantity * 10) / 10,
          fat_g: Math.round((food.fat_g.reduce((a, b) => a + b, 0) / food.fat_g.length) * quantityGrams / avgQuantity * 10) / 10,
          fiber_g: Math.round((food.fiber_g.reduce((a, b) => a + b, 0) / food.fiber_g.length) * quantityGrams / avgQuantity * 10) / 10,
          sodium_mg: Math.round(food.sodium_mg.reduce((a, b) => a + b, 0) / food.sodium_mg.length * quantityGrams / avgQuantity),
          sugar_g: Math.round((food.sugar_g.reduce((a, b) => a + b, 0) / food.sugar_g.length) * quantityGrams / avgQuantity * 10) / 10,
          quantity_g: quantityGrams,
          // Per-100g values (calculated from history averages)
          calories_per_100g: Math.round(avgCalories * per100gFactor),
          protein_per_100g: Math.round((food.protein_g.reduce((a, b) => a + b, 0) / food.protein_g.length) * per100gFactor * 10) / 10,
          carbs_per_100g: Math.round((food.carbs_g.reduce((a, b) => a + b, 0) / food.carbs_g.length) * per100gFactor * 10) / 10,
          fat_per_100g: Math.round((food.fat_g.reduce((a, b) => a + b, 0) / food.fat_g.length) * per100gFactor * 10) / 10,
          fiber_per_100g: Math.round((food.fiber_g.reduce((a, b) => a + b, 0) / food.fiber_g.length) * per100gFactor * 10) / 10,
          sodium_per_100g: Math.round(food.sodium_mg.reduce((a, b) => a + b, 0) / food.sodium_mg.length * per100gFactor),
          sugar_per_100g: Math.round((food.sugar_g.reduce((a, b) => a + b, 0) / food.sugar_g.length) * per100gFactor * 10) / 10,
          is_verified: false,
          verification_source: 'history',
          confidence_score: 70,
          source: 'history',
          tier: 3,
          last_logged: food.last_logged
        };
      })
      .sort((a, b) => new Date(b.last_logged) - new Date(a.last_logged))
      .slice(0, limit);
    
    return historyResults;
  } catch (error) {
    console.error('History tier search error:', error);
    return [];
  }
}
