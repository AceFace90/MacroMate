import React from 'react';
import { TouchableOpacity, Text, StyleSheet, ActivityIndicator } from 'react-native';
import { useTheme } from '../hooks/useTheme';
import { radius, spacing, typography } from '../theme';

// Ported from GymMate src/components/Button.js (shared design kit).
// variant: 'primary' | 'secondary' | 'ghost' | 'danger'
export default function Button({ onPress, title, children, variant = 'primary', size = 'md', loading, disabled, style }) {
  const { theme } = useTheme();

  const bgColor = {
    primary: theme.accent,
    secondary: theme.card,
    ghost: 'transparent',
    danger: '#ef4444',
  }[variant];

  const textColor = {
    primary: theme.isDark ? '#000' : '#fff',
    secondary: theme.text,
    ghost: theme.accent,
    danger: '#fff',
  }[variant];

  const borderColor = {
    primary: 'transparent',
    secondary: theme.border,
    ghost: 'transparent',
    danger: 'transparent',
  }[variant];

  const pad = size === 'sm' ? { paddingVertical: spacing[2], paddingHorizontal: spacing[3] } :
              size === 'lg' ? { paddingVertical: spacing[4], paddingHorizontal: spacing[6] } :
                              { paddingVertical: spacing[3], paddingHorizontal: spacing[5] };

  const fontSize = size === 'sm' ? typography.sizes.sm : size === 'lg' ? typography.sizes.lg : typography.sizes.base;

  return (
    <TouchableOpacity
      onPress={onPress}
      disabled={disabled || loading}
      activeOpacity={0.75}
      style={[
        styles.btn,
        pad,
        { backgroundColor: bgColor, borderColor, opacity: disabled ? 0.5 : 1 },
        style,
      ]}
    >
      {loading ? (
        <ActivityIndicator color={textColor} size="small" />
      ) : (
        <Text style={[styles.text, { color: textColor, fontSize, fontWeight: typography.weights.semibold }]}>
          {title ?? children}
        </Text>
      )}
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  btn: {
    borderRadius: radius.md,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
  },
  text: {
    textAlign: 'center',
  },
});
