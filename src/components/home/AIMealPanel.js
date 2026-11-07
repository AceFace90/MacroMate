import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { spacing, typography, radius } from '../../theme';
import AIItemRow from './AIItemRow';

export default function AIMealPanel({ items, selectedCount, onToggle, onLogAll, theme }) {
  if (!items.length) return null;

  return (
    <View style={[styles.resultsList, { backgroundColor: theme.card }]}>
      <Text style={[styles.listHeader, { color: theme.textSecondary }]}>AI Meal Analysis</Text>
      {items.map((item, i) => (
        <React.Fragment key={i}>
          {i > 0 && <View style={[styles.sep, { backgroundColor: theme.separator }]} />}
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
    borderRadius: radius.lg,
    marginBottom: spacing[2], overflow: 'hidden',
  },
  listHeader: {
    fontSize: 13, fontWeight: typography.weights.normal,
    paddingHorizontal: spacing[4], paddingTop: spacing[3], paddingBottom: spacing[1],
    
  },
  sep: { height: StyleSheet.hairlineWidth, marginHorizontal: spacing[4] },
  logAllBtn: {
    margin: spacing[3], borderRadius: 12,
    paddingVertical: spacing[3], alignItems: 'center',
  },
  logAllBtnText: { fontSize: typography.sizes.base, fontWeight: typography.weights.bold, color: '#fff' },
});
