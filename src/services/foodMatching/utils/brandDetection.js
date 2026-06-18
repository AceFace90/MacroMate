/**
 * Brand Detection Utility
 * Detects if a query looks like a branded product (country-aware)
 */

import { getCountryBrands } from '../../countryConfig';

/**
 * Detect if query looks like a branded product (country-aware)
 * @param {string} query - Search query
 * @param {string} countryCode - User's country code
 * @returns {boolean} True if looks branded
 */
export function detectBrandedQuery(query, countryCode = 'AU') {
  // Get country-specific brands
  const countryBrands = getCountryBrands(countryCode);
  
  // Global brands (always check)
  const globalBrands = [
    'coca-cola', 'coke', 'pepsi', 'sprite', 'fanta',
    'gatorade', 'red bull', 'monster', 'powerade',
    'nutella', 'kellogg', 'nestle', 'oreo', 'ritz',
    'doritos', 'lays', 'pringles', 'cheetos',
    'starbucks', 'mcdonald', 'mcdonalds', 'kfc', 'subway',
    'ben & jerry', 'haagen', 'haagen-dazs', 'breyers',
    'quest', 'clif', 'kind', 'nature valley',
    'tyson', 'foster farms'
  ];
  
  // Combine country-specific and global brands
  const allBrands = [...new Set([...countryBrands, ...globalBrands])];
  
  const lowerQuery = query.toLowerCase();
  return allBrands.some(brand => lowerQuery.includes(brand));
}
