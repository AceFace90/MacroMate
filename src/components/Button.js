import React from 'react';
import { TouchableOpacity, Text, StyleSheet, ActivityIndicator } from 'react-native';
import { useTheme } from '../hooks/useTheme';
import { spacing, typography, fontFamily } from '../theme';

// iOS-style button. variant: 'primary' (filled) | 'secondary' (tinted fill) | 'ghost' | 'danger'.
// Optional `icon` (element) renders before the title.
export default function Button({ onPress, title, children, variant = 'primary', size = 'md', loading, disabled, style, icon }) {
  const { theme } = useTheme();

  const bgColor = {
    primary: theme.accent,
    secondary: theme.fill,
    ghost: 'transparent',
    danger: theme.danger,
  }[variant];

  const textColor = {
    primary: theme.accentContrast,
    secondary: theme.accent,
    ghost: theme.accent,
    danger: '#fff',
  }[variant];

  const dims = size === 'sm' ? { minHeight: 36, paddingHorizontal: spacing[3], borderRadius: 10 }
    : size === 'lg' ? { minHeight: 54, paddingHorizontal: spacing[6], borderRadius: 14 }
    : { minHeight: 50, paddingHorizontal: spacing[5], borderRadius: 12 };

  const fontSize = size === 'sm' ? typography.sizes.sm : 17;

  return (
    <TouchableOpacity
      onPress={onPress}
      disabled={disabled || loading}
      activeOpacity={0.7}
      style={[styles.btn, dims, { backgroundColor: bgColor, opacity: disabled ? 0.45 : 1 }, style]}
    >
      {loading ? (
        <ActivityIndicator color={textColor} size="small" />
      ) : (
        <>
          {icon}
          <Text style={[styles.text, { color: textColor, fontSize, fontFamily, fontWeight: '600' }]}>
            {title ?? children}
          </Text>
        </>
      )}
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  btn: { alignItems: 'center', justifyContent: 'center', flexDirection: 'row', gap: 8 },
  text: { textAlign: 'center' },
});
