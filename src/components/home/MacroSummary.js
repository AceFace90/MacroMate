import React from 'react';
import { Text, StyleSheet } from 'react-native';
import { spacing, typography } from '../../theme';
import Card from '../Card';
import ActivityRings from '../ActivityRings';

export default function MacroSummary({ rings, totals, targets, calRemaining, theme }) {
  return (
    <Card accent style={styles.ringsCard}>
      <ActivityRings
        rings={rings}
        size={180}
        centerLabel={`${Math.round(totals.calories)}`}
        centerSub={`/ ${targets.calories} kcal`}
      />
      <Text style={[styles.calLabel, { color: theme.textMuted }]}>
        {calRemaining >= 0 ? `${calRemaining} kcal remaining` : `${Math.abs(calRemaining)} kcal over`}
      </Text>
    </Card>
  );
}

const styles = StyleSheet.create({
  ringsCard: { alignItems: 'center', gap: spacing[3], marginBottom: spacing[4] },
  calLabel: { fontSize: typography.sizes.sm, textAlign: 'center' },
});
