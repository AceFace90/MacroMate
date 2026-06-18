/**
 * Database Platform Adapter
 *
 * Phase 1: In-memory adapter that loads AFCD JSON directly.
 * Phase 2: Will be replaced by Expo SQLite (native) + web store, mirroring GymMate.
 */

let afcdFoods = null;
let savedFoods = [];
let foodLogs = [];

async function loadAFCD() {
  if (afcdFoods) return afcdFoods;
  try {
    const data = require('../data/afcd_foods.json');
    afcdFoods = Array.isArray(data) ? data : [];
    console.log(`[DB] Loaded ${afcdFoods.length} AFCD foods`);
  } catch (e) {
    console.warn('[DB] AFCD data not available:', e.message);
    afcdFoods = [];
  }
  return afcdFoods;
}

function normalizeForSearch(text) {
  return (text || '').toLowerCase().replace(/[^a-z0-9\s]/g, '').trim();
}

const database = {
  async searchAFCDFoods(query) {
    const foods = await loadAFCD();
    const normalized = normalizeForSearch(query);
    const terms = normalized.split(/\s+/).filter(t => t.length >= 2);
    if (!terms.length) return [];

    const scored = foods.map(food => {
      const name = normalizeForSearch(food.food_name);
      let score = 0;
      if (name === normalized) score += 1000;
      else if (name.startsWith(normalized)) score += 500;
      else if (name.includes(normalized)) score += 200;
      const allPresent = terms.every(t => name.includes(t));
      if (allPresent) score += 100;
      else {
        const matching = terms.filter(t => name.includes(t));
        score += matching.length * 30;
      }
      return { ...food, _score: score };
    });

    return scored
      .filter(f => f._score > 0)
      .sort((a, b) => b._score - a._score)
      .slice(0, 20)
      .map(({ _score, ...f }) => f);
  },

  async searchSavedFoods(query) {
    const normalized = normalizeForSearch(query);
    return savedFoods.filter(f =>
      normalizeForSearch(f.food_name).includes(normalized)
    );
  },

  async getSavedFoodByName(name) {
    return savedFoods.find(f =>
      normalizeForSearch(f.food_name) === normalizeForSearch(name)
    ) || null;
  },

  async saveFoodToCache(food) {
    savedFoods.push(food);
  },

  async getRecentFoodLogs(limit = 50) {
    return foodLogs.slice(-limit);
  },

  async searchFoodLogHistory(query) {
    const normalized = normalizeForSearch(query);
    return foodLogs.filter(f =>
      normalizeForSearch(f.food_name).includes(normalized)
    );
  },

  async getFoodLogs() {
    return foodLogs;
  }
};

export default database;
