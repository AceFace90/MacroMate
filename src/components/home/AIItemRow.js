import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ActivityIndicator } from 'react-native';
import { spacing, typography } from '../../theme';

export default function AIItemRow({ item, onToggle, theme }) {
  if (item.loading) {
    return (
      <View style={styles.aiItemRow}>
        <ActivityIndicator size="small" color={theme.accent} />
        <Text style={[styles.aiItemName, { color: theme.textMuted }]}>Looking up {item.name}…</Text>
      </View>
    );
  }
  if (!item.resolved) {
    return (
      <View style={styles.aiItemRow}>
        <Text style={[styles.aiItemName, { color: theme.textMuted }]}>⚠ {item.name} — not found</Text>
      </View>
    );
  }
  return (
    <TouchableOpacity style={styles.aiItemRow} onPress={onToggle} activeOpacity={0.7}>
      <Text style={[styles.aiCheckbox, { color: item.selected ? theme.accent : theme.textMuted }]}>
        {item.selected ? '☑' : '☐'}
      </Text>
      <View style={{ flex: 1 }}>
        <Text style={[styles.aiItemName, { color: theme.text }]} numberOfLines={1}>{item.resolved.name}</Text>
        <Text style={[styles.resultMacros, { color: theme.textMuted }]}>
          {item.quantity}{item.unit} · P {item.resolved.protein_g ?? 0}g · C {item.resolved.carbs_g ?? 0}g · F {item.resolved.fat_g ?? 0}g
        </Text>
      </View>
      <Text style={[styles.resultCal, { color: theme.text }]}>{item.resolved.calories ?? 0} kcal</Text>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  aiItemRow: {
    flexDirection: 'row', alignItems: 'center',
    paddingVertical: spacing[3], paddingHorizontal: spacing[4], gap: spacing[3],
  },
  aiCheckbox: { fontSize: 20 },
  aiItemName: { fontSize: typography.sizes.base, fontWeight: typography.weights.medium },
  resultMacros: { fontSize: typography.sizes.xs, marginTop: 2 },
  resultCal: { fontSize: typography.sizes.base, fontWeight: typography.weights.semibold, marginLeft: spacing[3] },
});
