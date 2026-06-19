const GEMINI_URL = 'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-lite:generateContent';

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
  const clean = raw.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
  return JSON.parse(clean);
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
  const clean = raw.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
  return JSON.parse(clean);
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
  const clean = raw.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
  return JSON.parse(clean);
}

export default {
  analyzeFood,
  analyzeLabel,
  analyzeMealPhoto,
};
