import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { spacing, typography, radius } from '../../theme';
import { formatDateLabel } from '../../utils/dateUtils';

export default function DayNavigator({ viewDate, isToday, onPrev, onNext, theme }) {
  return (
    <View style={[styles.dayNav, { backgroundColor: theme.card, borderColor: theme.border }]}>
      <TouchableOpacity onPress={onPrev} style={styles.dayNavBtn}>
        <Text style={[styles.dayNavArrow, { color: theme.text }]}>← Prev</Text>
      </TouchableOpacity>
      <Text style={[styles.dayNavLabel, { color: theme.text }]}>{formatDateLabel(viewDate)}</Text>
      <TouchableOpacity
        onPress={onNext}
        style={[styles.dayNavBtn, styles.dayNavRight]}
        disabled={isToday}
      >
        <Text style={[styles.dayNavArrow, { color: isToday ? theme.textMuted : theme.text }]}>Next →</Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  dayNav: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    borderRadius: radius.lg, borderWidth: 1,
    paddingHorizontal: spacing[4], paddingVertical: spacing[3],
    marginBottom: spacing[4],
  },
  dayNavBtn: { minWidth: 70 },
  dayNavRight: { alignItems: 'flex-end' },
  dayNavArrow: { fontSize: typography.sizes.sm, fontWeight: typography.weights.semibold },
  dayNavLabel: { fontSize: typography.sizes.base, fontWeight: typography.weights.bold },
});
