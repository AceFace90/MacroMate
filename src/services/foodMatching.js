// 5-Tier Food Matching System
// Cost-optimized: AFCD → OpenNutrition → Saved Foods → Open Food Facts API → AI Fallback
// Matches original server/routes/api.js /api/analyze logic
// Now includes country-based prioritization and API fallback
//
// THREE-TIER DATABASE STRATEGY:
// 1. AFCD (Australian Food Composition Database) - Official Australian data (Australia only)
// 2. OpenNutrition (10,000 foods) - Comprehensive branded products, global coverage
// 3. OpenFoodFacts Curated (3,523 foods) - Australian-focused curated database with 538 Australian products
//    - Prioritizes: Coles (280), Woolworths (163), Arnott's (51), Sanitarium (28), etc.
//    - All products have barcodes, 42% have serving sizes, high quality
// 4. OpenFoodFacts API - Real-time fallback for missing products
// 5. Gemini AI - Final fallback for unknown foods

import quantityExtraction from './quantityExtraction';
import { hasAFCDDatabase, getCountryBrands } from './countryConfig';
import { isGenericQuery, deduplicateResults, deduplicateAcrossTiers, scoreGenericRelevance, createDedupKey } from './searchHelpers';
import logger from './logger';

// Import tier modules
import { tryAFCDMatch, searchAFCDTier } from './foodMatching/tiers/afcdTier';
import { tryOpenNutritionMatch, searchOpenNutritionTier } from './foodMatching/tiers/openNutritionTier';
import { trySavedFoodsMatch, searchSavedTier } from './foodMatching/tiers/savedFoodsTier';
import { tryOpenFoodFactsDBMatch, tryOpenFoodFactsAPIMatch, searchOpenFoodFactsTier } from './foodMatching/tiers/openFoodFactsTier';
import { tryAIMatch } from './foodMatching/tiers/aiTier';
import { searchHistoryTier } from './foodMatching/tiers/historyTier';

// Import utilities
import { detectBrandedQuery } from './foodMatching/utils/brandDetection';
import { checkAndReplaceAIFood, cacheVerifiedFood } from './foodMatching/utils/foodCache';

class FoodMatchingService {
  /**
   * Main food matching function - tries 5 tiers in order
   * @param {string} userInput - User's food description
   * @param {string} imageBase64 - Optional image for AI analysis
   * @param {string} countryCode - User's country code (e.g., 'AU', 'US', 'UK')
   * @returns {Object} Matched food with nutrition data
   */
  async matchFood(userInput, imageBase64 = null, countryCode = 'AU') {
    logger.debug('🔍 Starting 5-tier food matching for:', userInput, `[Country: ${countryCode}]`);
    
    // If image is provided but no meaningful text input, skip database searches and go straight to AI
    // Database searches require text queries and would match incorrectly with empty/minimal text
    const hasImageOnly = imageBase64 && (!userInput || userInput.trim().length < 2);
    
    if (hasImageOnly) {
      logger.debug('📸 Image-only input detected - skipping database searches, going straight to AI');
      const aiResult = await tryAIMatch(userInput || '', imageBase64, 100, null);
      return aiResult;
    }
    
    // Step 1: Extract quantity and food name
    const extracted = quantityExtraction.extractQuantityAndFood(userInput);
    logger.debug('📊 Extracted:', extracted);
    
    // Detect if this looks like a branded product query (country-aware)
    const isBrandedQuery = detectBrandedQuery(extracted.foodName, countryCode);
    
    // Step 2: Try TIER 1 - AFCD Database (only for Australia)
    if (hasAFCDDatabase(countryCode) && !isBrandedQuery) {
      // For generic foods in Australia, try AFCD first
      const afcdResult = await tryAFCDMatch(extracted.foodName, extracted.quantityGrams);
      if (afcdResult) {
        logger.debug('✅ TIER 1 HIT: AFCD match found');
        return afcdResult;
      }
    }
    
    // Step 3: Try TIER 2 - OpenNutrition (branded products)
    const openNutritionResult = await tryOpenNutritionMatch(extracted.foodName, extracted.quantityGrams);
    if (openNutritionResult) {
      logger.debug('✅ TIER 2 HIT: OpenNutrition match found');
      return openNutritionResult;
    }
    
    // Step 4: Try TIER 3 - Saved Foods Cache (free, user's frequent items)
    const savedResult = await trySavedFoodsMatch(extracted.foodName, extracted.quantityGrams);
    if (savedResult) {
      logger.debug('✅ TIER 3 HIT: Saved food match found');
      return savedResult;
    }
    
    // Step 5: Try TIER 4 - Open Food Facts (local DB if downloaded, then API fallback)
    logger.debug('🌐 TIER 4: Trying Open Food Facts (DB then API)...');
    const offDbResult = await tryOpenFoodFactsDBMatch(extracted.foodName, extracted.quantityGrams, extracted);
    if (offDbResult) {
      logger.debug('✅ TIER 4 HIT: Open Food Facts DB match found');
      return offDbResult;
    }
    const apiResult = await tryOpenFoodFactsAPIMatch(extracted.foodName, extracted.quantityGrams, extracted);
    if (apiResult) {
      logger.debug('✅ TIER 4 HIT: Open Food Facts API match found');
      // Cache API results since they're verified
      if (apiResult.is_verified && apiResult.confidence_score >= 80) {
        await cacheVerifiedFood(apiResult);
      }
      return apiResult;
    }
    
    // Step 6: TIER 5 - AI Fallback (costs money, last resort) with Open Food Facts context
    logger.debug('⚡ TIER 5: Calling AI with Open Food Facts context (no cache hit)');
    const aiResult = await tryAIMatch(userInput, imageBase64, extracted.quantityGrams, extracted.foodName);
    
    // Before caching AI result, check if there's an existing AI-generated saved food
    // and try to replace it with better source (Open Food Facts API)
    if (aiResult && aiResult.confidence_score >= 80 && aiResult.is_verified) {
      await checkAndReplaceAIFood(aiResult, extracted.foodName);
    }
    
    return aiResult;
  }

  /**
   * Search across all 5 tiers for dropdown results
   * Returns prioritized results based on country: AFCD (if AU) → OpenNutrition → Saved → History
   * @param {string} query - Search query
   * @param {string} countryCode - User's country code (defaults to 'AU')
   * @returns {Array} Sorted and limited results
   */
  async searchAllTiers(query, countryCode = 'AU') {
    const extracted = quantityExtraction.extractQuantityAndFood(query);
    const searchTerm = extracted.foodName;
    const quantityGrams = extracted.quantityGrams;
    
    logger.debug('🔍 Multi-tier search:', query, '→ extracted:', searchTerm, `(${quantityGrams}g)`, `[Country: ${countryCode}]`);
    
    try {
      // Get country-specific brands for prioritization
      const countryBrands = getCountryBrands(countryCode);
      const hasAFCD = hasAFCDDatabase(countryCode);
      
      // Search all tiers in parallel for speed
      const searchPromises = [
        hasAFCD ? searchAFCDTier(searchTerm, quantityGrams, 5) : Promise.resolve([]),
        searchOpenNutritionTier(searchTerm, quantityGrams, 5, countryCode, countryBrands),
        searchOpenFoodFactsTier(searchTerm, quantityGrams, 5, countryCode, countryBrands),
        searchSavedTier(searchTerm, quantityGrams, 3),
        searchHistoryTier(searchTerm, quantityGrams, 2)
      ];
      
      const [afcdResults, openNutritionResults, openFoodFactsResults, savedResults, historyResults] = await Promise.all(searchPromises);
      
      // Detect if this is a generic query (no brand mentioned)
      const isGeneric = isGenericQuery(searchTerm, [...countryBrands, 'tyson', 'foster farms', 'nutella', 'hershey']);
      
      // Deduplicate results
      const deduplicatedOpenNutrition = deduplicateResults(openNutritionResults);
      const deduplicatedOpenFoodFacts = deduplicateResults(openFoodFactsResults);
      const deduplicatedSaved = deduplicateResults(savedResults);
      
      // Remove saved foods that duplicate core database results (core database takes priority)
      // This ensures products in the core database show as "openfoodfacts" not "saved"
      const coreDatabaseKeys = new Set([
        ...deduplicatedOpenFoodFacts.map(r => createDedupKey(r)),
        ...deduplicatedOpenNutrition.map(r => createDedupKey(r)),
        ...afcdResults.map(r => createDedupKey(r))
      ]);
      
      const filteredSaved = deduplicatedSaved.filter(result => {
        const key = createDedupKey(result);
        // Keep saved foods that don't exist in core databases
        return !coreDatabaseKeys.has(key);
      });
      
      // Score saved foods for relevance and separate close matches
      const scoredSaved = filteredSaved.map(r => ({
        ...r,
        _relevanceScore: scoreGenericRelevance(r, searchTerm)
      })).sort((a, b) => b._relevanceScore - a._relevanceScore);
      
      // Close match threshold: saved foods with high relevance scores (exact/starts with/contains query)
      // Threshold of 100 means it contains the query or starts with it
      const closeMatchThreshold = 100;
      const closeMatchSaved = scoredSaved.filter(r => r._relevanceScore >= closeMatchThreshold);
      const otherSaved = scoredSaved.filter(r => r._relevanceScore < closeMatchThreshold);
      
      // Remove history results that duplicate saved foods (saved foods take priority)
      const deduplicatedHistory = deduplicateAcrossTiers(filteredSaved, historyResults);
      
      // Score and sort for generic queries
      let combined = [];
      
      if (isGeneric && hasAFCD && afcdResults.length > 0) {
        // Generic query + AFCD available: Prioritize AFCD heavily
        // Score all results for relevance
        const scoredAFCD = afcdResults.map(r => ({
          ...r,
          _relevanceScore: scoreGenericRelevance(r, searchTerm)
        })).sort((a, b) => b._relevanceScore - a._relevanceScore);
        
        const scoredOpenNutrition = deduplicatedOpenNutrition.map(r => ({
          ...r,
          _relevanceScore: scoreGenericRelevance(r, searchTerm)
        })).sort((a, b) => b._relevanceScore - a._relevanceScore);
        
        // Filter out low-scoring OpenNutrition results (candy for generic food queries)
        const filteredOpenNutrition = scoredOpenNutrition.filter(r => r._relevanceScore > -300);
        
        // For generic queries in Australia: AFCD first (official), then OpenFoodFacts curated (Australian products),
        // then OpenNutrition (broader coverage)
        const openFoodFactsFirst = countryCode === 'AU' && deduplicatedOpenFoodFacts.length > 0;
        combined = [
          ...closeMatchSaved, // Prioritize saved foods with close matches
          ...scoredAFCD,
          ...(openFoodFactsFirst ? deduplicatedOpenFoodFacts : []),
          ...filteredOpenNutrition,
          ...(openFoodFactsFirst ? [] : deduplicatedOpenFoodFacts),
          ...otherSaved,
          ...deduplicatedHistory
        ];
      } else if (hasAFCD && afcdResults.length > 0 && (deduplicatedOpenNutrition.length > 0 || deduplicatedOpenFoodFacts.length > 0)) {
        // Branded query or no generic detection: Close match saved foods first, then AFCD, then branded databases
        // For Australia: Prioritize OpenFoodFacts curated (Australian-focused) over OpenNutrition
        const openFoodFactsFirst = countryCode === 'AU' && deduplicatedOpenFoodFacts.length > 0;
        combined = [
          ...closeMatchSaved, // Prioritize saved foods with close matches
          ...afcdResults,
          ...(openFoodFactsFirst ? deduplicatedOpenFoodFacts : []),
          ...deduplicatedOpenNutrition,
          ...(openFoodFactsFirst ? [] : deduplicatedOpenFoodFacts),
          ...otherSaved,
          ...deduplicatedHistory
        ];
      } else if (hasAFCD && afcdResults.length > 0) {
        // Only AFCD results
        combined = [
          ...closeMatchSaved, // Prioritize saved foods with close matches
          ...afcdResults,
          ...deduplicatedOpenNutrition,
          ...deduplicatedOpenFoodFacts,
          ...otherSaved,
          ...deduplicatedHistory
        ];
      } else if (deduplicatedOpenNutrition.length > 0 || deduplicatedOpenFoodFacts.length > 0) {
        // Other countries: Close match saved foods first, then branded databases (prioritize country brands)
        // For Australia: OpenFoodFacts curated (3,523 foods, Australian-focused) comes before OpenNutrition
        // OpenFoodFacts has 538 Australian products and is prioritized for Australian users
        const openFoodFactsFirst = countryCode === 'AU' && deduplicatedOpenFoodFacts.length > 0;
        combined = [
          ...closeMatchSaved, // Prioritize saved foods with close matches
          ...(openFoodFactsFirst ? deduplicatedOpenFoodFacts : []),
          ...deduplicatedOpenNutrition,
          ...(openFoodFactsFirst ? [] : deduplicatedOpenFoodFacts),
          ...afcdResults,
          ...otherSaved,
          ...deduplicatedHistory
        ];
      } else {
        // No branded results: show close match saved foods first, then AFCD (if available), then other saved, history
        combined = [
          ...closeMatchSaved, // Prioritize saved foods with close matches
          ...afcdResults,
          ...otherSaved,
          ...deduplicatedHistory
        ];
      }
      
      logger.debug(`✅ Found ${combined.length} results (${afcdResults.length} AFCD, ${openNutritionResults.length} OpenNutrition, ${openFoodFactsResults.length} OpenFoodFacts, ${savedResults.length} saved [${closeMatchSaved.length} close matches], ${deduplicatedHistory.length} history [${historyResults.length - deduplicatedHistory.length} duplicates removed])`);
      
      return combined;
    } catch (error) {
      console.error('Error in multi-tier search:', error);
      return [];
    }
  }
}

const foodMatching = new FoodMatchingService();
export default foodMatching;
