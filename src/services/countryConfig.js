/**
 * Country Configuration for Food Database Prioritization
 * 
 * Defines which countries are supported based on available databases:
 * - AFCD: Australian Food Composition Database (Australia only)
 * - OpenNutrition: Global database with country-specific brands
 */

export const SUPPORTED_COUNTRIES = {
  AU: {
    code: 'AU',
    name: 'Australia',
    flag: '🇦🇺',
    databases: ['afcd', 'opennutrition'],
    priorityBrands: [
      'aldi', 'iga', 'coles', 'woolworths', 'woolies',
      'arnott', 'arnotts', 'sanitarium', 'vegemite',
      'weet-bix', 'weetbix', 'tim tam', 'timtam',
      'shapes', 'vita-weat', 'up & go', 'so good',
      'red rooster', 'hungry jacks'
    ],
    description: 'Full support with AFCD (official Australian database) + Australian brands'
  },
  US: {
    code: 'US',
    name: 'United States',
    flag: '🇺🇸',
    databases: ['opennutrition'],
    priorityBrands: [
      'kraft', 'heinz', 'campbell', 'progresso',
      'tyson', 'perdue', 'foster farms',
      'starbucks', 'mcdonald', 'mcdonalds', 'subway',
      'burger king', 'kfc', 'pizza hut', 'dominos',
      'chipotle', 'panera', 'olive garden'
    ],
    description: 'US brands from OpenNutrition database'
  },
  UK: {
    code: 'UK',
    name: 'United Kingdom',
    flag: '🇬🇧',
    databases: ['opennutrition'],
    priorityBrands: [
      'tesco', 'sainsbury', 'asda', 'morrisons',
      'm&s', 'marks & spencer', 'waitrose',
      'mcdonald', 'mcdonalds', 'kfc', 'subway'
    ],
    description: 'UK brands from OpenNutrition database'
  },
  CA: {
    code: 'CA',
    name: 'Canada',
    flag: '🇨🇦',
    databases: ['opennutrition'],
    priorityBrands: [
      'loblaws', 'sobeys', 'metro', 'walmart',
      'mcdonald', 'mcdonalds', 'tim hortons',
      'subway', 'kfc'
    ],
    description: 'Canadian brands from OpenNutrition database'
  },
  GLOBAL: {
    code: 'GLOBAL',
    name: 'Other / Global',
    flag: '🌍',
    databases: ['opennutrition'],
    priorityBrands: [
      'coca-cola', 'pepsi', 'nutella', 'kellogg',
      'nestle', 'doritos', 'oreo', 'starbucks'
    ],
    description: 'Global brands from OpenNutrition database'
  }
};

/**
 * Get country configuration by code
 */
export function getCountryConfig(countryCode) {
  return SUPPORTED_COUNTRIES[countryCode] || SUPPORTED_COUNTRIES.GLOBAL;
}

/**
 * Check if country has AFCD database
 */
export function hasAFCDDatabase(countryCode) {
  const config = getCountryConfig(countryCode);
  return config.databases.includes('afcd');
}

/**
 * Get priority brands for a country
 */
export function getCountryBrands(countryCode) {
  const config = getCountryConfig(countryCode);
  return config.priorityBrands || [];
}

/**
 * Get list of country options for dropdown
 */
export function getCountryOptions() {
  return Object.values(SUPPORTED_COUNTRIES).map(country => ({
    value: country.code,
    label: `${country.flag} ${country.name}`,
    description: country.description
  }));
}

export default {
  SUPPORTED_COUNTRIES,
  getCountryConfig,
  hasAFCDDatabase,
  getCountryBrands,
  getCountryOptions
};
