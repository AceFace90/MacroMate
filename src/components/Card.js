import React from 'react';
import { View, StyleSheet } from 'react-native';
import { useTheme } from '../hooks/useTheme';
import { radius, spacing } from '../theme';

// iOS "MacroCard": theme.card surface, radius 26, no border. `accent` is kept for API compat.
export default function Card({ children, style, noPad }) {
  const { theme } = useTheme();
  return (
    <View style={[styles.card, { backgroundColor: theme.card }, !noPad && styles.pad, style]}>
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  card: { borderRadius: radius.lg },
  pad: { padding: 18 },
});
