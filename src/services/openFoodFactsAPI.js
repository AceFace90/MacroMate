/**
 * Open Food Facts API Service
 * 
 * Uses Open Food Facts API as a fallback for product searches
 * API Docs: https://openfoodfacts.github.io/api-documentation/
 * Rate Limit: 10 requests per minute
 * 
 * Note: This is for fallback use only, not for search-as-you-type
 */

const API_BASE_URL = 'https://world.openfoodfacts.org';
const RATE_LIMIT_DELAY = 6000; // 6 seconds between requests (10/min = 6s)

let lastRequestTime = 0;
let requestQueue = [];

/**
 * Parse serving size from OFF product. Prefers serving_quantity + serving_quantity_unit
 * to avoid wrong values from parsing "1 portion (375 ml)" as 1375.
 * @param {Object} product - OFF product with serving_size, serving_quantity, serving_quantity_unit
 * @returns {{ serving_size_g: number, serving_size_display?: string, serving_size_unit?: string }}
 */
function parseServingSizeFromOFF(product) {
  const rawSize = product.serving_size != null ? String(product.serving_size).trim() : '';
  const quantity = product.serving_quantity;
  const unit = (product.serving_quantity_unit || '').toString().trim().toLowerCase();

  // 1. Prefer serving_quantity + serving_quantity_unit (OFF's canonical numeric value)
  if (quantity != null && quantity !== '' && unit) {
    let num = parseFloat(quantity);
    if (Number.isFinite(num) && num > 0) {
      // Normalize to grams or ml (we store both as "quantity_g" for scaling)
      if (unit === 'l' || unit === 'litre' || unit === 'liter') {
        num = num * 1000; // L → ml
      } else if (unit === 'cl') {
        num = num * 10; // cl → ml
      } else if (unit === 'kg') {
        num = num * 1000; // kg → g
      }
      const unitLabel = (unit === 'l' || unit === 'litre' || unit === 'liter' || unit === 'cl' || unit === 'ml') ? 'ml' : 'g';
      return {
        serving_size_g: num,
        serving_size_display: rawSize || `${num} ${unitLabel}`,
        serving_size_unit: unitLabel
      };
    }
  }

  // 2. Fallback: parse parenthesized (X g) or (X ml) from serving_size only
  const parenMatch = rawSize.match(/\(\s*([\d.]+)\s*(g|ml|mL|l|cl)\s*\)/i);
  if (parenMatch) {
    let num = parseFloat(parenMatch[1]);
    const u = (parenMatch[2] || 'g').toLowerCase();
    if (Number.isFinite(num) && num > 0) {
      if (u === 'l') num *= 1000;
      else if (u === 'cl') num *= 10;
      const unitLabel = (u === 'ml' || u === 'l' || u === 'cl') ? 'ml' : 'g';
      return {
        serving_size_g: num,
        serving_size_display: rawSize,
        serving_size_unit: unitLabel
      };
    }
  }

  // 3. Plain "X g" or "X ml" without parentheses
  const plainMatch = rawSize.match(/^([\d.]+)\s*(g|ml|mL|l|cl)\s*$/i);
  if (plainMatch) {
    let num = parseFloat(plainMatch[1]);
    const u = (plainMatch[2] || 'g').toLowerCase();
    if (Number.isFinite(num) && num > 0) {
      if (u === 'l') num *= 1000;
      else if (u === 'cl') num *= 10;
      const unitLabel = (u === 'ml' || u === 'l' || u === 'cl') ? 'ml' : 'g';
      return {
        serving_size_g: num,
        serving_size_display: rawSize,
        serving_size_unit: unitLabel
      };
    }
  }

  return { serving_size_g: 100, serving_size_unit: 'g' };
}

/**
 * Search Open Food Facts via API
 * @param {string} query - Search query (product name)
 * @param {number} limit - Max results to return
 * @returns {Promise<Array>} Matching products
 */
export async function searchOpenFoodFactsAPI(query, limit = 5) {
  if (!query || query.trim().length < 2) {
    return [];
  }

  try {
    // Rate limiting: ensure at least 6 seconds between requests
    const now = Date.now();
    const timeSinceLastRequest = now - lastRequestTime;
    if (timeSinceLastRequest < RATE_LIMIT_DELAY) {
      await new Promise(resolve => setTimeout(resolve, RATE_LIMIT_DELAY - timeSinceLastRequest));
    }

    // Normalize query for API
    const searchTerm = encodeURIComponent(query.trim());
    
    // Use API v2 search endpoint - include serving_quantity and serving_quantity_unit for correct parsing
    const url = `${API_BASE_URL}/cgi/search.pl?action=process&search_terms=${searchTerm}&search_simple=1&json=1&page_size=${limit}&fields=product_name,brands,categories_tags,code,nutriments,serving_size,serving_quantity,serving_quantity_unit,images`;
    
    console.log(`🌐 Searching Open Food Facts API for: "${query}"`);
    
    const response = await fetch(url, {
      method: 'GET',
      headers: {
        'User-Agent': 'MacroMate/1.0 - Food tracking app'
      }
    });

    if (!response.ok) {
      throw new Error(`API returned ${response.status}`);
    }

    const data = await response.json();
    lastRequestTime = Date.now();

    if (!data.products || data.products.length === 0) {
      console.log('   No results from Open Food Facts API');
      return [];
    }

    // Convert to MacroMate format
    const results = data.products
      .filter(product => {
        // Only include products with nutrition data
        const nutriments = product.nutriments || {};
        return nutriments['energy-kcal_100g'] || 
               nutriments['proteins_100g'] || 
               nutriments['carbohydrates_100g'] || 
               nutriments['fat_100g'];
      })
      .map(product => {
        const nutriments = product.nutriments || {};
        const productName = product.product_name || product.product_name_en || 'Unknown';
        const brand = product.brands ? product.brands.split(',')[0].trim() : null;
        
        // Create food name with brand
        let foodName = productName;
        if (brand && !productName.toLowerCase().includes(brand.toLowerCase())) {
          foodName = `${productName} by ${brand}`;
        }

        // Extract serving size using quantity+unit first (avoids "1 portion (375 ml)" → 1375 bug)
        const parsed = parseServingSizeFromOFF(product);
        const servingSizeGrams = parsed.serving_size_g;
        
        // Extract nutrition data - prefer per serving if available, otherwise per 100g
        const hasServingData = servingSizeGrams && servingSizeGrams !== 100 && (
          nutriments['energy-kcal_serving'] || 
          nutriments['proteins_serving'] || 
          nutriments['carbohydrates_serving']
        );
        
        let energyKcal, protein, carbs, fat, fiber, sodium, sugars;
        
        if (hasServingData) {
          // Use per serving data
          energyKcal = nutriments['energy-kcal_serving'] || 
                      (nutriments['energy_serving'] ? nutriments['energy_serving'] / 4.184 : 0);
          protein = nutriments['proteins_serving'] || 0;
          carbs = nutriments['carbohydrates_serving'] || 0;
          fat = nutriments['fat_serving'] || 0;
          fiber = nutriments['fiber_serving'] || 0;
          sodium = nutriments['sodium_serving'] ? nutriments['sodium_serving'] * 1000 : 0;
          sugars = nutriments['sugars_serving'] || 0;
        } else {
          // Fall back to per 100g data
          energyKcal = nutriments['energy-kcal_100g'] || 
                      (nutriments['energy-kcal'] ? nutriments['energy-kcal'] / 10 : 0);
          protein = nutriments['proteins_100g'] || nutriments['proteins'] || 0;
          carbs = nutriments['carbohydrates_100g'] || nutriments['carbohydrates'] || 0;
          fat = nutriments['fat_100g'] || nutriments['fat'] || 0;
          fiber = nutriments['fiber_100g'] || nutriments['fiber'] || 0;
          sodium = nutriments['sodium_100g'] ? nutriments['sodium_100g'] * 1000 : 
                  (nutriments['sodium'] ? nutriments['sodium'] * 100 : 0);
          sugars = nutriments['sugars_100g'] || nutriments['sugars'] || 0;
        }
        
        // Also store per 100g values for scaling when user specifies quantity
        const energyKcal100g = nutriments['energy-kcal_100g'] || 
                               (nutriments['energy-kcal'] ? nutriments['energy-kcal'] / 10 : 0);
        const protein100g = nutriments['proteins_100g'] || nutriments['proteins'] || 0;
        const carbs100g = nutriments['carbohydrates_100g'] || nutriments['carbohydrates'] || 0;
        const fat100g = nutriments['fat_100g'] || nutriments['fat'] || 0;
        const fiber100g = nutriments['fiber_100g'] || nutriments['fiber'] || 0;
        const sodium100g = nutriments['sodium_100g'] ? nutriments['sodium_100g'] * 1000 : 
                          (nutriments['sodium'] ? nutriments['sodium'] * 100 : 0);
        const sugars100g = nutriments['sugars_100g'] || nutriments['sugars'] || 0;

        return {
          food_name: foodName,
          product_name: productName,
          brand: brand,
          barcode: product.code || null,
          // Per serving values (default for branded products)
          calories: energyKcal || 0,
          protein_g: protein || 0,
          carbs_g: carbs || 0,
          fat_g: fat || 0,
          fiber_g: fiber || 0,
          sodium_mg: sodium || 0,
          sugar_g: sugars || 0,
          serving_size_g: servingSizeGrams,
          serving_size_display: parsed.serving_size_display,
          serving_size_unit: parsed.serving_size_unit,
          // Per 100g values (for scaling when user specifies quantity)
          calories_per_100g: energyKcal100g || 0,
          protein_per_100g: protein100g || 0,
          carbs_per_100g: carbs100g || 0,
          fat_per_100g: fat100g || 0,
          fiber_per_100g: fiber100g || 0,
          sodium_per_100g: sodium100g || 0,
          sugar_per_100g: sugars100g || 0,
          has_serving_size: !!hasServingData,
          categories: product.categories_tags || [],
          source: 'openfoodfacts-api',
          verification_source: 'openfoodfacts',
          is_verified: true,
          confidence_score: 90,
          _apiMatch: true
        };
      })
      .slice(0, limit);

    console.log(`   Found ${results.length} results from Open Food Facts API`);
    return results;

  } catch (error) {
    console.error('Open Food Facts API error:', error);
    // Don't throw - this is a fallback, so failures are acceptable
    return [];
  }
}

/**
 * Get product by barcode
 * @param {string} barcode - Product barcode
 * @returns {Promise<Object|null>} Product data or null
 */
export async function getProductByBarcode(barcode) {
  if (!barcode || barcode.length < 8) {
    return null;
  }

  try {
    const url = `${API_BASE_URL}/api/v2/product/${barcode}.json`;
    
    const response = await fetch(url, {
      method: 'GET',
      headers: {
        'User-Agent': 'MacroMate/1.0 - Food tracking app'
      }
    });

    if (!response.ok || response.status === 404) {
      return null;
    }

    const data = await response.json();
    
    if (!data.product || data.status === 0) {
      return null;
    }

    const product = data.product;
    const nutriments = product.nutriments || {};
    
    // Extract serving size using quantity+unit first (v2 product returns all fields)
    const parsed = parseServingSizeFromOFF(product);
    const servingSizeGrams = parsed.serving_size_g;
    
    // Convert to MacroMate format
    const productName = product.product_name || product.product_name_en || 'Unknown';
    const brand = product.brands ? product.brands.split(',')[0].trim() : null;
    
    let foodName = productName;
    if (brand && !productName.toLowerCase().includes(brand.toLowerCase())) {
      foodName = `${productName} by ${brand}`;
    }

    // Some AU products store data under _prepared/_prepared_100g/_prepared_serving keys
    const kcal100g = nutriments['energy-kcal_100g'] || nutriments['energy-kcal_prepared_100g'] || 0;
    const kcalServing = nutriments['energy-kcal_serving'] || nutriments['energy-kcal_prepared_serving'] ||
                        (nutriments['energy_serving'] ? nutriments['energy_serving'] / 4.184 : 0) ||
                        (nutriments['energy_prepared_serving'] ? nutriments['energy_prepared_serving'] / 4.184 : 0);
    const prot100g  = nutriments['proteins_100g']       || nutriments['proteins_prepared_100g']       || 0;
    const carb100g  = nutriments['carbohydrates_100g']  || nutriments['carbohydrates_prepared_100g']  || 0;
    const fat100g_  = nutriments['fat_100g']            || nutriments['fat_prepared_100g']            || 0;
    const fiber100g_= nutriments['fiber_100g']          || nutriments['fiber_prepared_100g']          || 0;
    const sod100g   = nutriments['sodium_100g']         || nutriments['sodium_prepared_100g']         || 0;
    const sug100g   = nutriments['sugars_100g']         || nutriments['sugars_prepared_100g']         || 0;

    const protServ  = nutriments['proteins_serving']      || nutriments['proteins_prepared_serving']      || 0;
    const carbServ  = nutriments['carbohydrates_serving'] || nutriments['carbohydrates_prepared_serving'] || 0;
    const fatServ   = nutriments['fat_serving']           || nutriments['fat_prepared_serving']           || 0;
    const fiberServ = nutriments['fiber_serving']         || nutriments['fiber_prepared_serving']         || 0;
    const sodServ   = nutriments['sodium_serving']        || nutriments['sodium_prepared_serving']        || 0;
    const sugServ   = nutriments['sugars_serving']        || nutriments['sugars_prepared_serving']        || 0;

    const hasServingData = servingSizeGrams && servingSizeGrams !== 100 && (kcalServing || protServ || carbServ);

    let energyKcal, protein, carbs, fat, fiber, sodium, sugars;
    if (hasServingData) {
      energyKcal = kcalServing;
      protein = protServ;
      carbs = carbServ;
      fat = fatServ;
      fiber = fiberServ;
      sodium = sodServ * 1000;
      sugars = sugServ;
    } else {
      energyKcal = kcal100g;
      protein = prot100g;
      carbs = carb100g;
      fat = fat100g_;
      fiber = fiber100g_;
      sodium = sod100g * 1000;
      sugars = sug100g;
    }

    const energyKcal100g = kcal100g;
    const protein100g = prot100g;
    const carbs100g = carb100g;
    const fat100g = fat100g_;
    const fiber100g = fiber100g_;
    const sodium100g = sod100g * 1000;
    const sugars100g = sug100g;

    return {
      food_name: foodName,
      product_name: productName,
      brand: brand,
      barcode: product.code || barcode,
      calories: energyKcal || 0,
      protein_g: protein || 0,
      carbs_g: carbs || 0,
      fat_g: fat || 0,
      fiber_g: fiber || 0,
      sodium_mg: sodium || 0,
      sugar_g: sugars || 0,
      serving_size_g: servingSizeGrams,
      serving_size_display: parsed.serving_size_display,
      serving_size_unit: parsed.serving_size_unit,
      calories_per_100g: energyKcal100g || 0,
      protein_per_100g: protein100g || 0,
      carbs_per_100g: carbs100g || 0,
      fat_per_100g: fat100g || 0,
      fiber_per_100g: fiber100g || 0,
      sodium_per_100g: sodium100g || 0,
      sugar_per_100g: sugars100g || 0,
      has_serving_size: !!hasServingData,
      source: 'openfoodfacts-api',
      verification_source: 'openfoodfacts',
      is_verified: true,
      confidence_score: 95
    };

  } catch (error) {
    console.error('Open Food Facts API barcode lookup error:', error);
    return null;
  }
}

export default {
  searchOpenFoodFactsAPI,
  getProductByBarcode
};
