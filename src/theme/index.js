// MacroMate Theme — shared design system with GymMate (sister apps)
// Primary accent: neon green (#39ff14 dark / #16a34a light)
// Backgrounds: #1a1a1a dark / #ffffff light
// Cards: #2a2a2a dark / #f9fafb light
//
// Ported from GymMate src/theme/index.js. Keep these tokens in sync across both
// apps so they read as a family. Macro colours added for the nutrition domain.

export const colors = {
  // Accent — neon green
  accent: '#39ff14',
  accentLight: '#16a34a',      // Readable green for light mode
  accentMuted: '#2ad910',      // Hover/active in dark

  // Backgrounds
  darkBg: '#1a1a1a',
  darkCard: '#2a2a2a',
  darkBorder: '#3a3a3a',
  darkInput: '#333333',

  lightBg: '#ffffff',
  lightCard: '#f9fafb',
  lightBorder: '#e5e7eb',
  lightInput: '#f3f4f6',

  // Text
  darkText: '#ffffff',
  darkTextSecondary: '#9ca3af',
  darkTextMuted: '#6b7280',

  lightText: '#111827',
  lightTextSecondary: '#4b5563',
  lightTextMuted: '#9ca3af',

  // Status
  red: '#ef4444',
  orange: '#f97316',
  yellow: '#eab308',
  blue: '#3b82f6',

  // Macro colours (MacroMate-specific — for the daily rings & charts)
  // protein / carbs / fat map to the 3-ring dashboard (see REWRITE-PLAN §4b)
  protein: '#3b82f6',  // blue
  carbs: '#f97316',    // orange
  fat: '#eab308',      // yellow
  calories: '#39ff14', // accent green (center number)
};

// Returns theme object based on dark/light mode
export function getTheme(isDark) {
  return {
    bg: isDark ? colors.darkBg : colors.lightBg,
    card: isDark ? colors.darkCard : colors.lightCard,
    border: isDark ? colors.darkBorder : colors.lightBorder,
    input: isDark ? colors.darkInput : colors.lightInput,
    text: isDark ? colors.darkText : colors.lightText,
    textSecondary: isDark ? colors.darkTextSecondary : colors.lightTextSecondary,
    textMuted: isDark ? colors.darkTextMuted : colors.lightTextMuted,
    accent: isDark ? colors.accent : colors.accentLight,
    accentBg: isDark ? 'rgba(57,255,20,0.1)' : 'rgba(22,163,74,0.1)',
    accentBorder: isDark ? 'rgba(57,255,20,0.3)' : 'rgba(22,163,74,0.3)',
    isDark,
  };
}

export const typography = {
  sizes: {
    xs: 11,
    sm: 13,
    base: 15,
    lg: 17,
    xl: 20,
    '2xl': 24,
    '3xl': 30,
  },
  weights: {
    normal: '400',
    medium: '500',
    semibold: '600',
    bold: '700',
  },
};

export const spacing = {
  1: 4,
  2: 8,
  3: 12,
  4: 16,
  5: 20,
  6: 24,
  8: 32,
  10: 40,
  12: 48,
};

export const radius = {
  sm: 6,
  md: 10,
  lg: 14,
  xl: 20,
  full: 999,
};
