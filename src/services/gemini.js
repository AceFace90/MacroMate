const GEMINI_URL = 'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-lite:generateContent';

// ── Response parsing + validation ─────────────────────────────────────────────
// Gemini occasionally returns prose, truncated JSON, or the wrong shape. Parse
// defensively and validate the shape so callers get a friendly message instead
// of a raw JSON.parse SyntaxError leaking to the user's alert.

const PARSE_ERROR = "Couldn't read the AI response. Please try again.";

function parseJson(raw) {
  const clean = String(raw || '').replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
  if (!clean) throw new Error(PARSE_ERROR);
  try {
    return JSON.parse(clean);
  } catch {
    throw new Error(PARSE_ERROR);
  }
}

const isObj = (v) => v && typeof v === 'object' && !Array.isArray(v);
// Coerce to a finite number (accepts numeric strings like "250"); null if not numeric.
const num = (v) => {
  if (typeof v === 'number' && Number.isFinite(v)) return v;
  if (typeof v === 'string' && v.trim() !== '' && Number.isFinite(Number(v))) return Number(v);
  return null;
};
const str = (v) => (typeof v === 'string' && v.trim() ? v.trim() : null);

// analyzeFood: single-item nutrition estimate. Requires a name + numeric calories.
function validateFood(obj) {
  if (!isObj(obj)) throw new Error(PARSE_ERROR);
  const name = str(obj.name);
  const calories = num(obj.calories);
  if (!name || calories === null) throw new Error(PARSE_ERROR);
  return {
    ...obj,
    name,
    calories,
    protein_g: num(obj.protein_g) ?? 0,
    carbs_g: num(obj.carbs_g) ?? 0,
    fat_g: num(obj.fat_g) ?? 0,
    fiber_g: num(obj.fiber_g) ?? 0,
    quantity_g: num(obj.quantity_g) ?? 100,
  };
}

// analyzeLabel: nutrition-label extraction. Requires numeric calories.
function validateLabel(obj) {
  if (!isObj(obj)) throw new Error(PARSE_ERROR);
  const calories = num(obj.calories);
  if (calories === null) throw new Error(PARSE_ERROR);
  return {
    ...obj,
    name: str(obj.name) || 'Scanned item',
    calories,
    protein_g: num(obj.protein_g) ?? 0,
    carbs_g: num(obj.carbs_g) ?? 0,
    fat_g: num(obj.fat_g) ?? 0,
    fiber_g: num(obj.fiber_g) ?? 0,
    sodium_mg: num(obj.sodium_mg) ?? 0,
    sugar_g: num(obj.sugar_g) ?? 0,
    serving_size_g: num(obj.serving_size_g),
  };
}

// analyzeMealPhoto: multi-item plate. Requires a non-empty items[] of {name, quantity}.
const MEAL_UNITS = ['g', 'ml', 'cup', 'tbsp', 'tsp', 'piece', 'slice'];
function validateMealItems(obj) {
  if (!isObj(obj) || !Array.isArray(obj.items)) throw new Error(PARSE_ERROR);
  const items = obj.items
    .filter(isObj)
    .map((it) => {
      const name = str(it.name);
      const quantity = num(it.quantity);
      if (!name || quantity === null) return null;
      const unit = MEAL_UNITS.includes(it.unit) ? it.unit : 'g';
      return { name, quantity, unit };
    })
    .filter(Boolean);
  if (items.length === 0) throw new Error(PARSE_ERROR);
  return { items };
}

// Analyze a food from text (single item, with optional image) and return nutrition estimates.
// Returns nutrition estimates for when DB tiers all miss.
async function analyzeFood(userInput, imageBase64, offContext, key) {
  const parts = [];

  if (imageBase64) {
    parts.push({ inlineData: { mimeType: 'image/jpeg', data: imageBase64 } });
  }

  const prompt = `You are a nutrition database. Estimate the nutritional content of this food.
${offContext || ''}

Food: "${userInput}"

Respond with ONLY valid JSON:
{
  "name": "food name",
  "calories": 250,
  "protein_g": 30,
  "carbs_g": 5,
  "fat_g": 12,
  "fiber_g": 0,
  "quantity_g": 100,
  "quantity_detected": "100g",
  "confidence_score": 85,
  "is_verified": false,
  "source": "ai"
}

Rules:
- Values are for the quantity described (not per 100g)
- confidence_score: 0–100 (lower if uncertain)
- Return ONLY the JSON object`;

  parts.push({ text: prompt });

  const res = await fetch(`${GEMINI_URL}?key=${key}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      contents: [{ parts }],
      generationConfig: { temperature: 0.1, maxOutputTokens: 512 },
    }),
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err?.error?.message || `Gemini API error ${res.status}`);
  }

  const data = await res.json();
  const raw = data?.candidates?.[0]?.content?.parts?.[0]?.text || '';
  return validateFood(parseJson(raw));
}

// Analyze a meal photo and identify all visible food items with estimated portions.
// imageBase64: base64-encoded image string (no data-URI prefix).
// mimeType: e.g. 'image/jpeg' or 'image/png'
// Returns { items: [{ name, quantity, unit }] } — same shape as decomposeMeal.
async function analyzeMealPhoto(imageBase64, mimeType = 'image/jpeg', key) {
  const prompt = `You are a nutrition assistant. The image shows a meal or plate of food. Identify all visible food items and estimate realistic portion sizes.

Respond with ONLY valid JSON in this exact shape:
{
  "items": [
    { "name": "chicken breast grilled", "quantity": 150, "unit": "g" },
    { "name": "rice white cooked", "quantity": 200, "unit": "g" }
  ]
}

Rules:
- Use generic food names (not brand names)
- Estimate realistic portions based on visual size
- unit must be one of: g, ml, cup, tbsp, tsp, piece, slice
- Return ONLY the JSON object, no markdown, no explanation`;

  const res = await fetch(`${GEMINI_URL}?key=${key}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      contents: [{
        parts: [
          { inlineData: { mimeType, data: imageBase64 } },
          { text: prompt },
        ],
      }],
      generationConfig: { temperature: 0.1, maxOutputTokens: 512 },
    }),
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err?.error?.message || `Gemini API error ${res.status}`);
  }

  const data = await res.json();
  const raw = data?.candidates?.[0]?.content?.parts?.[0]?.text || '';
  return validateMealItems(parseJson(raw));
}

// Extract nutrition facts from a label photo.
// imageBase64: base64-encoded JPEG/PNG string (no data-URI prefix).
// Returns { name, calories, protein_g, carbs_g, fat_g, fiber_g, sodium_mg, sugar_g, serving_size_g, serving_size_display, confidence_score }
async function analyzeLabel(imageBase64, mimeType = 'image/jpeg', key) {
  const prompt = `You are a nutrition label reader. The image shows a food nutrition label.
Extract the nutrition information and return ONLY valid JSON:
{
  "name": "product name or description",
  "serving_size_display": "1 cup (240ml)",
  "serving_size_g": 240,
  "calories": 150,
  "protein_g": 5,
  "carbs_g": 20,
  "fat_g": 6,
  "fiber_g": 2,
  "sodium_mg": 300,
  "sugar_g": 8,
  "confidence_score": 90
}

Rules:
- Values must be PER SERVING (the serving size shown on the label)
- serving_size_g: convert to grams/ml if given in other units (1 cup ≈ 240, 1 oz ≈ 28)
- confidence_score: 0–100 based on label clarity
- If a nutrient is not shown, use 0
- Return ONLY the JSON, no markdown`;

  const res = await fetch(`${GEMINI_URL}?key=${key}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      contents: [{
        parts: [
          { inlineData: { mimeType, data: imageBase64 } },
          { text: prompt },
        ],
      }],
      generationConfig: { temperature: 0.1, maxOutputTokens: 512 },
    }),
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err?.error?.message || `Gemini API error ${res.status}`);
  }

  const data = await res.json();
  const raw = data?.candidates?.[0]?.content?.parts?.[0]?.text || '';
  return validateLabel(parseJson(raw));
}

export default {
  analyzeFood,
  analyzeLabel,
  analyzeMealPhoto,
};
