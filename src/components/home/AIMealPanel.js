import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { spacing, typography, radius } from '../../theme';
import AIItemRow from './AIItemRow';

export default function AIMealPanel({ items, selectedCount, onToggle, onLogAll, theme }) {
  if (!items.length) return null;

  return (
    <View style={[styles.resultsList, { backgroundColor: theme.card, borderColor: theme.border }]}>
      <Text style={[styles.listHeader, { color: theme.textMuted }]}>AI Meal Analysis</Text>
      {items.map((item, i) => (
        <React.Fragment key={i}>
          {i > 0 && <View style={[styles.sep, { backgroundColor: theme.border }]} />}
          <AIItemRow item={item} onToggle={() => onToggle(i)} theme={theme} />
        </React.Fragment>
      ))}
      {selectedCount > 0 && (
        <TouchableOpacity
          style={[styles.logAllBtn, { backgroundColor: theme.accent }]}
          onPress={onLogAll}
        >
          <Text style={styles.logAllBtnText}>Log {selectedCount} item{selectedCount !== 1 ? 's' : ''}</Text>
        </TouchableOpacity>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  resultsList: {
    borderRadius: radius.lg, borderWidth: 1,
    marginBottom: spacing[2], overflow: 'hidden',
  },
  listHeader: {
    fontSize: typography.sizes.xs, fontWeight: typography.weights.bold,
    paddingHorizontal: spacing[4], paddingTop: spacing[3], paddingBottom: spacing[1],
    textTransform: 'uppercase', letterSpacing: 0.5,
  },
  sep: { height: 1, marginHorizontal: spacing[4] },
  logAllBtn: {
    margin: spacing[3], borderRadius: radius.md,
    paddingVertical: spacing[3], alignItems: 'center',
  },
  logAllBtnText: { fontSize: typography.sizes.base, fontWeight: typography.weights.bold, color: '#000' },
});
