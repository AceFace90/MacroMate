import React from 'react';
import { StyleSheet } from 'react-native';
import Card from '../Card';
import ActivityRings from '../ActivityRings';

export default function MacroSummary({ rings, totals, targets, calRemaining }) {
  return (
    <Card style={styles.ringsCard}>
      <ActivityRings
        rings={rings}
        size={190}
        centerLabel={`${Math.round(totals.calories)}`}
        centerSub={`/ ${targets.calories} kcal`}
      />
    </Card>
  );
}

const styles = StyleSheet.create({
  ringsCard: { alignItems: 'center' },
});
