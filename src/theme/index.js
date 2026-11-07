import { Platform } from 'react-native';

// MacroMate Theme — iOS / Apple Health design language (see MacroMate App Design/MacroTheme.swift)

// iOS system palette, matching the native SwiftUI app (Design/MacroTheme.swift) and
// LabMate's web restyle: grouped-grey canvas, borderless white cards, system green accent.
export const colors = {
  // Accent — iOS system green (calories)
  accent: '#30d158',           // dark mode
  accentLight: '#34c759',      // light mode
  accentMuted: '#28b84c',

  // Backgrounds (iOS grouped)
  darkBg: '#000000',
  darkCard: '#1c1c1e',
  darkBorder: 'rgba(84,84,88,0.45)',
  darkInput: 'rgba(118,118,128,0.24)',

  lightBg: '#f2f2f7',
  lightCard: '#ffffff',
  lightBorder: 'rgba(60,60,67,0.12)',
  lightInput: 'rgba(118,118,128,0.12)',

  // Text (iOS label colours)
  darkText: '#ffffff',
  darkTextSecondary: 'rgba(235,235,245,0.6)',
  darkTextMuted: 'rgba(235,235,245,0.3)',

  lightText: '#000000',
  lightTextSecondary: 'rgba(60,60,67,0.6)',
  lightTextMuted: 'rgba(60,60,67,0.3)',

  // Status (iOS system)
  red: '#ff3b30',
  orange: '#ff9500',
  yellow: '#ffcc00',
  blue: '#007aff',

  // Macro colours — same as the iOS app
  protein: '#3b82f6',  // blue
  carbs: '#f97316',    // orange
  fat: '#eab308',      // yellow
  calories: '#34c759', // green
};

// Returns theme object based on dark/light mode
export function getTheme(isDark) {
  return {
    bg: isDark ? colors.darkBg : colors.lightBg,
    card: isDark ? colors.darkCard : colors.lightCard,
    elevated: isDark ? '#2c2c2e' : '#ffffff',
    border: isDark ? colors.darkBorder : colors.lightBorder,
    separator: isDark ? 'rgba(84,84,88,0.6)' : 'rgba(60,60,67,0.29)',
    input: isDark ? colors.darkInput : colors.lightInput,
    fill: isDark ? 'rgba(120,120,128,0.36)' : 'rgba(120,120,128,0.2)',
    glass: isDark ? 'rgba(28,28,30,0.72)' : 'rgba(249,249,249,0.72)',
    text: isDark ? colors.darkText : colors.lightText,
    textSecondary: isDark ? colors.darkTextSecondary : colors.lightTextSecondary,
    textMuted: isDark ? colors.darkTextMuted : colors.lightTextMuted,
    accent: isDark ? colors.accent : colors.accentLight,
    accentContrast: '#ffffff',
    accentBg: isDark ? 'rgba(48,209,88,0.14)' : 'rgba(52,199,89,0.1)',
    accentBorder: isDark ? 'rgba(48,209,88,0.35)' : 'rgba(52,199,89,0.3)',
    danger: isDark ? '#ff453a' : '#ff3b30',
    link: isDark ? '#0a84ff' : '#007aff',
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
  sm: 8,
  md: 12,
  lg: 26,   // card (matches iOS MacroMetrics.cardRadius)
  xl: 26,
  chip: 18,
  full: 999,
};

// Font stack — SF Pro on Apple devices, system UI elsewhere.
export const fontFamily = Platform.OS === 'web'
  ? "-apple-system, BlinkMacSystemFont, 'SF Pro Text', system-ui, sans-serif"
  : undefined;

// Breakpoints shared with LabMate: phone < 700 <= tablet < 1100 <= desktop.
export const breakpoints = { tablet: 700, desktop: 1100 };
