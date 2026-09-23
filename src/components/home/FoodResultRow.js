import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { spacing, typography, colors } from '../../theme';

export default function FoodResultRow({ item, onSelect, theme }) {
  const isAI = item.source === 'ai';
  return (
    <TouchableOpacity style={styles.resultRow} onPress={() => onSelect(item)} activeOpacity={0.7}>
      <View style={{ flex: 1 }}>
        <Text style={[styles.resultName, { color: theme.text }]} numberOfLines={1}>{item.name}</Text>
        <Text style={[styles.resultMacros, { color: theme.textMuted }]}>
          P {item.protein_g ?? 0}g · C {item.carbs_g ?? 0}g · F {item.fat_g ?? 0}g
          {isAI ? <Text style={{ color: colors.fat }}> · AI estimate</Text> : null}
        </Text>
      </View>
      <Text style={[styles.resultCal, { color: theme.text }]}>{item.calories ?? 0} kcal</Text>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  resultRow: {
    flexDirection: 'row', alignItems: 'center',
    paddingVertical: spacing[3], paddingHorizontal: spacing[4],
  },
  resultName: { fontSize: typography.sizes.base, fontWeight: typography.weights.medium },
  resultMacros: { fontSize: typography.sizes.xs, marginTop: 2 },
  resultCal: { fontSize: typography.sizes.base, fontWeight: typography.weights.semibold, marginLeft: spacing[3] },
});
