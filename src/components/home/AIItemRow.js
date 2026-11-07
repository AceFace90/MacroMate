import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ActivityIndicator } from 'react-native';
import { spacing, typography } from '../../theme';
import Icon from '../Icon';

export default function AIItemRow({ item, onToggle, theme }) {
  if (item.loading) {
    return (
      <View style={styles.aiItemRow}>
        <ActivityIndicator size="small" color={theme.accent} />
        <Text style={[styles.aiItemName, { color: theme.textSecondary }]}>Looking up {item.name}…</Text>
      </View>
    );
  }
  if (!item.resolved) {
    return (
      <View style={styles.aiItemRow}>
        <Icon name="warning" size={16} color={theme.textSecondary} />
        <Text style={[styles.aiItemName, { color: theme.textSecondary }]}>{item.name} — not found</Text>
      </View>
    );
  }
  return (
    <TouchableOpacity style={styles.aiItemRow} onPress={onToggle} activeOpacity={0.7}>
      <Icon name={item.selected ? 'check' : 'plus'} size={20} color={item.selected ? theme.accent : theme.textMuted} />
      <View style={{ flex: 1 }}>
        <Text style={[styles.aiItemName, { color: theme.text }]} numberOfLines={1}>{item.resolved.name}</Text>
        <Text style={[styles.resultMacros, { color: theme.textSecondary }]}>
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
  resultMacros: { fontSize: 13, marginTop: 2 },
  resultCal: { fontSize: typography.sizes.base, fontWeight: typography.weights.semibold, marginLeft: spacing[3] },
});
