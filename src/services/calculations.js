/**
 * Calculate BMR (Basal Metabolic Rate) using Mifflin-St Jeor Equation
 *
 * For men: BMR = 10 × weight(kg) + 6.25 × height(cm) - 5 × age(years) + 5
 * For women: BMR = 10 × weight(kg) + 6.25 × height(cm) - 5 × age(years) - 161
 *
 * @param {number} weight_kg - Weight in kilograms
 * @param {number} height_cm - Height in centimeters
 * @param {number} age - Age in years
 * @param {string} gender - 'MALE' or 'FEMALE'
 * @returns {number} BMR in calories
 */
function calculateBMR(weight_kg, height_cm, age, gender) {
  if (!weight_kg || !height_cm || !age || !gender) {
    return null;
  }

  const baseBMR = (10 * weight_kg) + (6.25 * height_cm) - (5 * age);

  if (gender === 'MALE') {
    return Math.round(baseBMR + 5);
  } else if (gender === 'FEMALE') {
    return Math.round(baseBMR - 161);
  } else {
    // For 'OTHER', use average of male/female
    return Math.round(baseBMR - 78);
  }
}

/**
 * Calculate TDEE (Total Daily Energy Expenditure)
 *
 * Activity multipliers:
 * - SEDENTARY: Little or no exercise (1.2)
 * - LIGHT: Light exercise 1-3 days/week (1.375)
 * - MODERATE: Moderate exercise 3-5 days/week (1.55)
 * - VERY: Hard exercise 6-7 days/week (1.725)
 * - EXTRA: Very hard exercise & physical job (1.9)
 *
 * @param {number} bmr - Basal Metabolic Rate
 * @param {string} activityLevel - Activity level enum
 * @returns {number} TDEE in calories
 */
function calculateTDEE(bmr, activityLevel) {
  if (!bmr || !activityLevel) {
    return null;
  }

  const activityMultipliers = {
    'SEDENTARY': 1.2,
    'LIGHT': 1.375,
    'MODERATE': 1.55,
    'VERY': 1.725,
    'EXTRA': 1.9
  };

  const multiplier = activityMultipliers[activityLevel] || 1.55;
  return Math.round(bmr * multiplier);
}

/**
 * Calculate age from date of birth
 *
 * @param {Date|string} dob - Date of birth
 * @returns {number} Age in years
 */
function calculateAge(dob) {
  if (!dob) return null;

  const birthDate = new Date(dob);
  const today = new Date();
  let age = today.getFullYear() - birthDate.getFullYear();
  const monthDiff = today.getMonth() - birthDate.getMonth();

  if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < birthDate.getDate())) {
    age--;
  }

  return age;
}

/**
 * Calculate recommended macronutrient distribution
 * Based on target calories
 *
 * Default split: 30% protein, 40% carbs, 30% fat
 *
 * @param {number} targetCalories - Daily calorie target
 * @returns {Object} Recommended protein, carbs, and fat in grams
 */
function calculateMacros(targetCalories) {
  if (!targetCalories) {
    return { protein: 0, carbs: 0, fat: 0 };
  }

  // Protein: 30% of calories, 4 cal/g
  const protein = Math.round((targetCalories * 0.30) / 4);

  // Carbs: 40% of calories, 4 cal/g
  const carbs = Math.round((targetCalories * 0.40) / 4);

  // Fat: 30% of calories, 9 cal/g
  const fat = Math.round((targetCalories * 0.30) / 9);

  return { protein, carbs, fat };
}

/**
 * Calculate macronutrient distribution starting with protein target
 * Protein-first approach for body recomp
 *
 * @param {number} proteinTargetPerKg - Protein target in g/kg body weight (e.g., 2.0)
 * @param {number} weightKg - Current body weight in kg
 * @param {number} targetCalories - Daily calorie target
 * @param {string} carbsFatRatio - Ratio for splitting remaining calories (e.g., '60/40')
 * @returns {Object} Calculated protein, carbs, and fat in grams
 */
function calculateMacrosFromProtein(proteinTargetPerKg, weightKg, targetCalories, carbsFatRatio = '60/40') {
  if (!proteinTargetPerKg || !weightKg || !targetCalories) {
    return { protein: 0, carbs: 0, fat: 0 };
  }

  // Calculate protein grams from body weight
  const protein = Math.round(proteinTargetPerKg * weightKg);

  // Calculate calories from protein (4 cal/g)
  const proteinCalories = protein * 4;

  // Calculate remaining calories for carbs and fat
  const remainingCalories = targetCalories - proteinCalories;

  // Parse carbs/fat ratio (e.g., '60/40' -> 60% carbs, 40% fat)
  const [carbsPercent, fatPercent] = carbsFatRatio.split('/').map(Number);

  // Calculate carbs from remaining calories (4 cal/g)
  const carbs = Math.round((remainingCalories * (carbsPercent / 100)) / 4);

  // Calculate fat from remaining calories (9 cal/g)
  const fat = Math.round((remainingCalories * (fatPercent / 100)) / 9);

  return { protein, carbs, fat };
}

module.exports = {
  calculateBMR,
  calculateTDEE,
  calculateAge,
  calculateMacros,
  calculateMacrosFromProtein
};
