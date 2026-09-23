/**
 * Open Food Facts result formatting.
 * Extracted from openFoodFactsSearch.js — pure function, no external deps.
 */

/**
 * Format food result (extracted from original search function)
 */
export function formatFoodResult(food) {
  // Check for serving size - prioritize serving_size_g field
  const servingSizeGrams = food.serving_size_g || food.base_serving_size_g;
  const hasServingSize = servingSizeGrams && servingSizeGrams > 0 && servingSizeGrams !== 100;
  const hasPerServingValues = food.calories_per_serving !== undefined ||
                               food.protein_per_serving !== undefined ||
                               food.carbs_per_serving !== undefined;

  let calories, protein_g, carbs_g, fat_g, fiber_g, sodium_mg, sugar_g, quantity_g;

  // ALWAYS use serving size if available (don't default to 100ml/g)
  if (hasServingSize && hasPerServingValues) {
    // Use per-serving values directly (most accurate)
    calories = food.calories_per_serving || food.calories_per_100g || 0;
    protein_g = food.protein_per_serving !== undefined ? food.protein_per_serving : (food.protein_g || 0);
    carbs_g = food.carbs_per_serving !== undefined ? food.carbs_per_serving : (food.carbs_g || 0);
    fat_g = food.fat_per_serving !== undefined ? food.fat_per_serving : (food.fat_g || 0);
    fiber_g = food.fiber_per_serving !== undefined ? food.fiber_per_serving : (food.fiber_g || 0);
    sodium_mg = food.sodium_per_serving !== undefined ? food.sodium_per_serving : (food.sodium_mg || 0);
    sugar_g = food.sugar_per_serving !== undefined ? food.sugar_per_serving : (food.sugar_g || 0);
    quantity_g = servingSizeGrams;
  } else if (hasServingSize) {
    // Scale from per-100g to serving size
    const scaleFactor = servingSizeGrams / 100;
    calories = Math.round((food.calories_per_100g || 0) * scaleFactor);
    protein_g = Math.round((food.protein_g || 0) * scaleFactor * 10) / 10;
    carbs_g = Math.round((food.carbs_g || 0) * scaleFactor * 10) / 10;
    fat_g = Math.round((food.fat_g || 0) * scaleFactor * 10) / 10;
    fiber_g = Math.round((food.fiber_g || 0) * scaleFactor * 10) / 10;
    sodium_mg = Math.round((food.sodium_mg || 0) * scaleFactor);
    sugar_g = Math.round((food.sugar_g || 0) * scaleFactor * 10) / 10;
    quantity_g = servingSizeGrams;
  } else {
    // No serving size available - default to 100g/ml
    calories = food.calories_per_100g || 0;
    protein_g = food.protein_g || 0;
    carbs_g = food.carbs_g || 0;
    fat_g = food.fat_g || 0;
    fiber_g = food.fiber_g || 0;
    sodium_mg = food.sodium_mg || 0;
    sugar_g = food.sugar_g || 0;
    quantity_g = 100;
  }

  // Calculate per-100g values if missing
  // If we have per-serving values and serving size, calculate per-100g
  let caloriesPer100g = food.calories_per_100g;
  let proteinPer100g = food.protein_per_100g || food.protein_g;
  let carbsPer100g = food.carbs_per_100g || food.carbs_g;
  let fatPer100g = food.fat_per_100g || food.fat_g;
  let fiberPer100g = food.fiber_per_100g || food.fiber_g;
  let sodiumPer100g = food.sodium_per_100g || food.sodium_mg;
  let sugarPer100g = food.sugar_per_100g || food.sugar_g;

  // If per-100g is missing but we have per-serving, calculate it
  if ((!caloriesPer100g || caloriesPer100g === 0) && hasServingSize && servingSizeGrams > 0) {
    if (food.calories_per_serving) {
      caloriesPer100g = (food.calories_per_serving / servingSizeGrams) * 100;
    } else if (calories && quantity_g) {
      caloriesPer100g = (calories / quantity_g) * 100;
    }

    if (food.protein_per_serving !== undefined) {
      proteinPer100g = (food.protein_per_serving / servingSizeGrams) * 100;
    }
    if (food.carbs_per_serving !== undefined) {
      carbsPer100g = (food.carbs_per_serving / servingSizeGrams) * 100;
    }
    if (food.fat_per_serving !== undefined) {
      fatPer100g = (food.fat_per_serving / servingSizeGrams) * 100;
    }
    if (food.fiber_per_serving !== undefined) {
      fiberPer100g = (food.fiber_per_serving / servingSizeGrams) * 100;
    }
    if (food.sodium_per_serving !== undefined) {
      sodiumPer100g = (food.sodium_per_serving / servingSizeGrams) * 100;
    }
    if (food.sugar_per_serving !== undefined) {
      sugarPer100g = (food.sugar_per_serving / servingSizeGrams) * 100;
    }
  }

  return {
    ...food,
    name: food.food_name,
    calories,
    protein_g,
    carbs_g,
    fat_g,
    fiber_g,
    sodium_mg,
    sugar_g,
    alcohol_g: food.alcohol_g || 0,
    quantity_g,
    serving_size_g: servingSizeGrams || food.serving_size_g,
    serving_size_display: food.serving_size_display,
    serving_size_unit: food.serving_size_unit,
    base_serving_size_g: servingSizeGrams || food.base_serving_size_g || food.serving_size_g,
    has_serving_size: hasServingSize,
    calories_per_100g: caloriesPer100g || 0,
    protein_per_100g: proteinPer100g || 0,
    carbs_per_100g: carbsPer100g || 0,
    fat_per_100g: fatPer100g || 0,
    fiber_per_100g: fiberPer100g || 0,
    sodium_per_100g: sodiumPer100g || 0,
    sugar_per_100g: sugarPer100g || 0,
    alcohol_per_100g: food.alcohol_per_100g || food.alcohol_g || 0,
    alcohol_per_serving: food.alcohol_per_serving || 0,
    // Include per-serving values if available
    calories_per_serving: food.calories_per_serving,
    protein_per_serving: food.protein_per_serving,
    carbs_per_serving: food.carbs_per_serving,
    fat_per_serving: food.fat_per_serving,
    fiber_per_serving: food.fiber_per_serving,
    sodium_per_serving: food.sodium_per_serving,
    sugar_per_serving: food.sugar_per_serving,
    source: 'openfoodfacts',
    tier: 'openfoodfacts',
    verification_source: 'openfoodfacts',
    is_verified: true
  };
}
