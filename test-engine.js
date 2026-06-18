/**
 * Phase 1 Test Harness — validates the food matching engine works identically to v1.
 * Run: node test-engine.js
 */

require('@babel/register')({
  presets: ['babel-preset-expo'],
  ignore: [/node_modules\/(?!@supabase)/],
});

// Polyfill process.env for logger
process.env.NODE_ENV = 'development';

const { default: quantityExtraction } = require('./src/services/quantityExtraction');
const { default: foodMatching } = require('./src/services/foodMatching');

const TESTS = [
  // Quantity extraction
  { type: 'extract', input: '200g chicken breast', expect: { foodName: /chicken/i, quantityGrams: 200 } },
  { type: 'extract', input: '2 eggs', expect: { foodName: /egg/i } },
  { type: 'extract', input: '1 cup rice', expect: { foodName: /rice/i } },
  { type: 'extract', input: '500ml milk', expect: { foodName: /milk/i, quantityGrams: 500 } },
  { type: 'extract', input: 'banana', expect: { foodName: /banana/i } },

  // Full match (AFCD tier — Australian generic foods)
  { type: 'match', input: '200g chicken breast', expectSource: 'afcd', expectCalories: [150, 400] },
  { type: 'match', input: '100g rice', expectSource: 'afcd', expectCalories: [100, 400] },
  { type: 'match', input: '250ml milk', expectSource: 'afcd', expectCalories: [50, 400] },

  // OpenNutrition tier (branded products)
  { type: 'match', input: 'nutella', expectSource: 'opennutrition' },

  // Search (multi-tier dropdown)
  { type: 'search', input: 'chicken', expectMin: 1 },
  { type: 'search', input: 'eggs', expectMin: 1 },
];

let passed = 0;
let failed = 0;

function check(label, condition, detail) {
  if (condition) {
    passed++;
    console.log(`  ✅ ${label}`);
  } else {
    failed++;
    console.log(`  ❌ ${label} — ${detail || 'FAILED'}`);
  }
}

async function runTests() {
  console.log('\n═══════════════════════════════════════════');
  console.log('  MacroMate v2 — Phase 1 Engine Test');
  console.log('═══════════════════════════════════════════\n');

  // --- Quantity Extraction ---
  console.log('── Quantity Extraction ──');
  for (const t of TESTS.filter(t => t.type === 'extract')) {
    const result = quantityExtraction.extractQuantityAndFood(t.input);
    const nameOk = t.expect.foodName ? t.expect.foodName.test(result.foodName) : true;
    const gramsOk = t.expect.quantityGrams ? result.quantityGrams === t.expect.quantityGrams : true;
    check(
      `"${t.input}" → ${result.foodName} (${result.quantityGrams}g)`,
      nameOk && gramsOk,
      `got: name="${result.foodName}" grams=${result.quantityGrams}`
    );
  }

  // --- Full Match (matchFood) ---
  console.log('\n── Full Match (5-tier) ──');
  for (const t of TESTS.filter(t => t.type === 'match')) {
    try {
      const result = await foodMatching.matchFood(t.input);
      if (!result) {
        check(`"${t.input}" → match found`, false, 'null result');
        continue;
      }
      const sourceOk = !t.expectSource || (result.source || result.tier || '').includes(t.expectSource);
      const calOk = !t.expectCalories || (result.calories >= t.expectCalories[0] && result.calories <= t.expectCalories[1]);
      check(
        `"${t.input}" → ${result.name || result.food_name} (${result.calories} kcal, source: ${result.source || result.tier})`,
        sourceOk && calOk,
        `source=${result.source}, cal=${result.calories}`
      );
    } catch (err) {
      check(`"${t.input}"`, false, err.message);
    }
  }

  // --- Search (searchAllTiers) ---
  console.log('\n── Multi-tier Search ──');
  for (const t of TESTS.filter(t => t.type === 'search')) {
    try {
      const results = await foodMatching.searchAllTiers(t.input);
      check(
        `"${t.input}" → ${results.length} results`,
        results.length >= t.expectMin,
        `expected >= ${t.expectMin}, got ${results.length}`
      );
      if (results.length > 0) {
        console.log(`    top: ${results[0].name} (${results[0].calories} kcal, ${results[0].source})`);
      }
    } catch (err) {
      check(`"${t.input}"`, false, err.message);
    }
  }

  // --- Summary ---
  console.log('\n═══════════════════════════════════════════');
  console.log(`  Results: ${passed} passed, ${failed} failed`);
  console.log('═══════════════════════════════════════════\n');

  if (failed > 0) process.exit(1);
}

runTests().catch(err => {
  console.error('Test harness crashed:', err);
  process.exit(1);
});
