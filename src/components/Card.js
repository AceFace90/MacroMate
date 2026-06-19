import React from 'react';
import { View, StyleSheet } from 'react-native';
import { useTheme } from '../hooks/useTheme';
import { radius, spacing } from '../theme';

// Ported from GymMate src/components/Card.js (shared design kit).
export default function Card({ children, style, noPad, accent }) {
  const { theme } = useTheme();
  return (
    <View
      style={[
        styles.card,
        {
          backgroundColor: theme.card,
          borderColor: accent ? theme.accentBorder : theme.border,
        },
        !noPad && styles.pad,
        style,
      ]}
    >
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    borderRadius: radius.lg,
    borderWidth: 1,
  },
  pad: {
    padding: spacing[4],
  },
});
