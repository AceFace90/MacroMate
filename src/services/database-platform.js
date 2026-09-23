/**
 * Database Platform Adapter
 *
 * Backed by AsyncStorage so the matching engine's history + saved-foods tiers
 * read PERSISTED data (they previously used in-memory arrays that were empty on
 * every fresh load, so those tiers never returned anything in production).
 *
 * - Food-log HISTORY is sourced from the logs logStore already persists under
 *   `macromate_food_logs_v2` ({ 'YYYY-MM-DD': [entry] }). This module is the
 *   read side; logStore remains the single writer of that key.
 * - The verified-food CACHE (saved foods) is persisted here under
 *   `macromate_saved_foods_v1`, so AI/API-verified foods survive reloads and
 *   aren't re-fetched every session.
 *
 * AFCD static data is still bundled JSON.
 */

const LOGS_KEY = 'macromate_food_logs_v2';    // written by logStore (history source)
const SAVED_KEY = 'macromate_saved_foods_v1'; // verified-food cache, persisted here

// Lazily resolve AsyncStorage so this module also loads in plain Node (tests),
// where the native/web storage backend isn't present.
let _storageResolved = false;
let _storage = null;
function getStorage() {
  if (_storageResolved) return _storage;
  _storageResolved = true;
  try {
    _storage = require('@react-native-async-storage/async-storage').default;
  } catch {
    _storage = null;
  }
  return _storage;
}

let afcdFoods = null;
let savedFoods = null; // in-memory mirror, hydrated once from AsyncStorage

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

// ── Saved-foods cache (persisted) ───────────────────────────────────────────

async function loadSavedFoods() {
  if (savedFoods) return savedFoods;
  const storage = getStorage();
  try {
    const raw = storage ? await storage.getItem(SAVED_KEY) : null;
    savedFoods = raw ? JSON.parse(raw) : [];
  } catch {
    savedFoods = [];
  }
  return savedFoods;
}

async function persistSavedFoods() {
  const storage = getStorage();
  if (!storage) return;
  try {
    await storage.setItem(SAVED_KEY, JSON.stringify(savedFoods || []));
  } catch { /* quota/unavailable — mirror still serves this session */ }
}

// ── Food-log history (read from logStore's persisted logs) ──────────────────

// logStore persists { 'YYYY-MM-DD': [entry] }; entries use `name`, while the
// tiers expect `food_name`. Flatten + normalize the shape here.
async function loadPersistedLogs() {
  const storage = getStorage();
  if (!storage) return [];
  try {
    const raw = await storage.getItem(LOGS_KEY);
    if (!raw) return [];
    const byDate = JSON.parse(raw);
    const out = [];
    for (const [date, entries] of Object.entries(byDate)) {
      if (!Array.isArray(entries)) continue;
      for (const e of entries) {
        out.push({
          food_name: e.name || e.food_name || '',
          calories: e.calories || 0,
          protein_g: e.protein_g || 0,
          carbs_g: e.carbs_g || 0,
          fat_g: e.fat_g || 0,
          fiber_g: e.fiber_g || 0,
          sodium_mg: e.sodium_mg || 0,
          sugar_g: e.sugar_g || 0,
          quantity_g: e.quantity_g || 100,
          logged_at: e.logged_at || `${date}T12:00:00.000Z`,
        });
      }
    }
    return out;
  } catch {
    return [];
  }
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
    const foods = await loadSavedFoods();
    const normalized = normalizeForSearch(query);
    return foods
      .filter(f => normalizeForSearch(f.food_name).includes(normalized))
      .sort((a, b) => (b.usage_count || 0) - (a.usage_count || 0));
  },

  async getSavedFoodByName(name) {
    const foods = await loadSavedFoods();
    return foods.find(f =>
      normalizeForSearch(f.food_name) === normalizeForSearch(name)
    ) || null;
  },

  // Insert or update a verified food in the persisted cache. Deduped by
  // normalized name; re-caching the same food bumps its usage_count so the
  // most-used verified foods rank first.
  async addSavedFood(food) {
    const foods = await loadSavedFoods();
    const key = food.food_name_normalized || normalizeForSearch(food.food_name);
    const idx = foods.findIndex(
      f => (f.food_name_normalized || normalizeForSearch(f.food_name)) === key
    );
    if (idx >= 0) {
      foods[idx] = { ...foods[idx], ...food, usage_count: (foods[idx].usage_count || 0) + 1 };
    } else {
      foods.push({ ...food, usage_count: 1 });
    }
    await persistSavedFoods();
  },

  // Back-compat alias — some callers used the older name.
  async saveFoodToCache(food) {
    return this.addSavedFood(food);
  },

  async getRecentFoodLogs(limit = 50) {
    const logs = await loadPersistedLogs();
    return logs
      .sort((a, b) => new Date(b.logged_at) - new Date(a.logged_at))
      .slice(0, limit);
  },

  async searchFoodLogHistory(query) {
    const logs = await loadPersistedLogs();
    const normalized = normalizeForSearch(query);
    return logs.filter(f => normalizeForSearch(f.food_name).includes(normalized));
  },

  async getFoodLogs() {
    return loadPersistedLogs();
  },
};

export default database;
