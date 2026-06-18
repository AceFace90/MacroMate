// Gemini AI service — BYOK (user supplies their own key).
// AI NEVER returns nutrition numbers directly — it only decomposes/identifies foods.
// The food matching engine then looks up nutrition from the DB tiers.
//
// Provider seam: analyzeFood(input, { key }) — key comes from secure storage.

const GEMINI_URL = 'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent';

// Decompose a natural-language meal description into individual food items.
// Returns { items: [{ name, quantity, unit }] } so the engine can look each up.
async function decomposeMeal(text, key) {
  const prompt = `You are a nutrition assistant. The user described a meal or food item.
Decompose it into individual food items with quantities.

User input: "${text}"

Respond with ONLY valid JSON in this exact shape:
{
  "items": [
    { "name": "chicken breast", "quantity": 200, "unit": "g" },
    { "name": "rice, white, cooked", "quantity": 150, "unit": "g" }
  ]
}

Rules:
- Split compound meals into individual ingredients (e.g. "burger" → bun, patty, cheese, lettuce)
- Use generic food names (not brand names) so a nutrition database can look them up
- Estimate realistic portion sizes if not specified
- unit must be one of: g, ml, cup, tbsp, tsp, piece, slice
- Return ONLY the JSON object, no markdown, no explanation`;

  const res = await fetch(`${GEMINI_URL}?key=${key}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      contents: [{ parts: [{ text: prompt }] }],
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

// Analyze a food from text (single item, with optional OFF context).
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

export default {
  decomposeMeal,
  analyzeFood,
  isAvailable: () => false, // checked via key presence in context, not here
};
