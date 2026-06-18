// Quantity Extraction & Unit Conversion Service
// Matches original server/utils/quantityExtraction.js logic

const UNIT_CONVERSIONS = {
  // Weight units
  'g': 1,
  'gram': 1,
  'grams': 1,
  'kg': 1000,
  'kilogram': 1000,
  'kilograms': 1000,
  'oz': 28.35,
  'ounce': 28.35,
  'ounces': 28.35,
  'lb': 453.59,
  'lbs': 453.59,
  'pound': 453.59,
  'pounds': 453.59,
  
  // Volume units (assumes water density)
  'ml': 1,
  'milliliter': 1,
  'milliliters': 1,
  'l': 1000,
  'liter': 1000,
  'liters': 1000,
  'tsp': 5,
  'teaspoon': 5,
  'teaspoons': 5,
  'tbsp': 15,
  'tablespoon': 15,
  'tablespoons': 15,
  'cup': 240,
  'cups': 240,
  
  // Pieces (approximate weights)
  'piece': 100,
  'pieces': 100,
  'pcs': 100,
  'pc': 100,
  'slice': 30,
  'slices': 30,
  'serving': 100,
  'servings': 100,
  'egg': 50,
  'eggs': 50,
  'each': 100
};

class QuantityExtractionService {
  /**
   * Extract quantity and food name from user input
   * @param {string} input - User input like "50g chicken breast", "2 eggs", or "chicken breast 50g"
   * @returns {Object} { quantity, unit, foodName, quantityGrams }
   */
  extractQuantityAndFood(input) {
    if (!input || typeof input !== 'string') {
      return {
        quantity: 100,
        unit: 'g',
        foodName: input || '',
        quantityGrams: 100
      };
    }

    const trimmed = input.trim();
    
    // Pattern 1: Quantity with unit at start - "50g chicken breast"
    // Try to match known units first
    const knownUnitPatterns = [
      /^(\d+\.?\d*)\s*(g|gram|grams|kg|kilogram|kilograms)\s+(.+)$/i,
      /^(\d+\.?\d*)\s*(oz|ounce|ounces|lb|lbs|pound|pounds)\s+(.+)$/i,
      /^(\d+\.?\d*)\s*(ml|milliliter|milliliters|l|liter|liters)\s+(.+)$/i,
      /^(\d+\.?\d*)\s*(tsp|teaspoon|teaspoons|tbsp|tablespoon|tablespoons)\s+(.+)$/i,
      /^(\d+\.?\d*)\s*(cup|cups)\s+(.+)$/i,
      /^(\d+\.?\d*)\s*(piece|pieces|pcs|pc|slice|slices|serving|servings)\s+(.+)$/i
    ];
    
    for (const pattern of knownUnitPatterns) {
      const match = trimmed.match(pattern);
      if (match) {
        const quantity = parseFloat(match[1]);
        const unit = match[2].toLowerCase();
        const foodName = match[3].trim();
        
        return {
          quantity,
          unit,
          foodName,
          quantityGrams: this.convertToGrams(quantity, unit)
        };
      }
    }
    
    // Pattern 2: Number followed directly by food name (no unit) - "2 eggs", "3 apples", "2 eggs with rice"
    const numberThenFoodPattern = /^(\d+\.?\d*)\s+(.+)$/;
    const numberThenFoodMatch = trimmed.match(numberThenFoodPattern);
    
    if (numberThenFoodMatch) {
      const quantity = parseFloat(numberThenFoodMatch[1]);
      const foodName = numberThenFoodMatch[2].trim();
      
      // Estimate weight based on common foods
      let gramsPerPiece = 100;
      const foodLower = foodName.toLowerCase();
      
      // For simple single-item queries like "2 eggs", use specific weights
      if (foodLower === 'egg' || foodLower === 'eggs') {
        gramsPerPiece = 50; // Average egg weight
      } else if (foodLower.includes('apple') && foodLower.split(' ').length <= 2) {
        gramsPerPiece = 150;
      } else if (foodLower.includes('banana') && foodLower.split(' ').length <= 2) {
        gramsPerPiece = 120;
      } else if (foodLower.includes('slice')) {
        gramsPerPiece = 30;
      }
      // For compound dishes like "eggs with rice", use default 100g per serving
      // The actual dish weight will vary, but this is a reasonable default
      
      return {
        quantity,
        unit: 'piece',
        foodName,
        quantityGrams: quantity * gramsPerPiece
      };
    }
    
    // Pattern 3: Quantity at end - "chicken breast 50g"
    const endPattern = /^(.+?)\s+(\d+\.?\d*)\s*([a-zA-Z]+)$/;
    const endMatch = trimmed.match(endPattern);
    
    if (endMatch) {
      const foodName = endMatch[1].trim();
      const quantity = parseFloat(endMatch[2]);
      const unit = endMatch[3].toLowerCase();
      
      return {
        quantity,
        unit,
        foodName,
        quantityGrams: this.convertToGrams(quantity, unit)
      };
    }
    
    // Pattern 4: No quantity found - default to 100g
    return {
      quantity: 100,
      unit: 'g',
      foodName: trimmed,
      quantityGrams: 100
    };
  }

  /**
   * Convert any unit to grams
   * @param {number} quantity - The quantity value
   * @param {string} unit - The unit (g, kg, oz, cup, etc.)
   * @returns {number} Weight in grams
   */
  convertToGrams(quantity, unit) {
    const normalizedUnit = unit.toLowerCase();
    const multiplier = UNIT_CONVERSIONS[normalizedUnit];
    
    if (!multiplier) {
      console.warn(`Unknown unit: ${unit}, defaulting to grams`);
      return quantity;
    }
    
    return quantity * multiplier;
  }

  /**
   * Scale AFCD nutrition values from per-100g to actual quantity
   * @param {Object} afcdFood - AFCD food with per-100g values
   * @param {number} quantityGrams - Actual quantity in grams
   * @returns {Object} Scaled nutrition values
   */
  scaleAFCDFood(afcdFood, quantityGrams) {
    const scaleFactor = quantityGrams / 100;
    
    return {
      food_name: afcdFood.food_name,
      quantity_g: quantityGrams,
      calories: Math.round((afcdFood.energy_kcal || 0) * scaleFactor),
      protein_g: Math.round((afcdFood.protein_g || 0) * scaleFactor * 10) / 10,
      carbs_g: Math.round((afcdFood.carbs_g || 0) * scaleFactor * 10) / 10,
      fat_g: Math.round((afcdFood.fat_g || 0) * scaleFactor * 10) / 10,
      fiber_g: Math.round((afcdFood.fiber_g || 0) * scaleFactor * 10) / 10,
      sodium_mg: Math.round((afcdFood.sodium_mg || 0) * scaleFactor),
      sugar_g: Math.round((afcdFood.sugar_g || 0) * scaleFactor * 10) / 10,
      is_verified: true,
      verification_source: 'afcd',
      confidence_score: 100
    };
  }

  /**
   * Parse quantity from Gemini AI response
   * Used when AI returns "50g" or "1 cup" format
   * @param {string} quantityStr - Quantity string from AI
   * @returns {number} Quantity in grams
   */
  parseAIQuantity(quantityStr) {
    if (!quantityStr || typeof quantityStr !== 'string') {
      return 100;
    }

    const match = quantityStr.match(/(\d+\.?\d*)\s*([a-zA-Z]+)/);
    if (!match) {
      return 100;
    }

    const quantity = parseFloat(match[1]);
    const unit = match[2].toLowerCase();
    
    return this.convertToGrams(quantity, unit);
  }

  /**
   * Format quantity display for UI
   * @param {number} grams - Weight in grams
   * @returns {string} Formatted string like "50g" or "1.5kg"
   */
  formatQuantity(grams) {
    if (grams >= 1000) {
      return `${(grams / 1000).toFixed(1)}kg`;
    }
    return `${Math.round(grams)}g`;
  }

  /**
   * Normalize food name for searching
   * @param {string} foodName - Raw food name
   * @returns {string} Normalized name
   */
  normalizeFoodName(foodName) {
    if (!foodName) return '';
    
    let normalized = foodName.toLowerCase().trim();
    
    // Remove leading articles
    normalized = normalized.replace(/^(a|an|the)\s+/i, '');
    
    // Remove special characters except spaces and hyphens
    normalized = normalized.replace(/[^a-z0-9\s-]/g, '');
    
    // Remove extra spaces
    normalized = normalized.replace(/\s+/g, ' ');
    
    return normalized;
  }

  /**
   * Check if input contains a quantity
   * @param {string} input - User input
   * @returns {boolean} True if quantity detected
   */
  hasQuantity(input) {
    if (!input) return false;
    
    const quantityPattern = /\d+\.?\d*\s*[a-zA-Z]+/;
    return quantityPattern.test(input);
  }
}

const quantityExtraction = new QuantityExtractionService();
export default quantityExtraction;
