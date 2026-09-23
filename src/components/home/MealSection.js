import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { spacing, typography } from '../../theme';
import Card from '../Card';
import { sumEntries } from '../../store/logStore';
import LoggedEntryRow from './LoggedEntryRow';

export default function MealSection({
  meal, entries, viewDate, editingId, editFields, meals,
  onStartEdit, onCancelEdit, onRemove, onApplyQtyScale, onSaveEdit, onSetEditField,
  theme,
}) {
  const mealCals = Math.round(sumEntries(entries).calories);

  return (
    <Card accent style={styles.mealSection}>
      <View style={styles.mealSectionHeader}>
        <Text style={[styles.mealSectionTitle, { color: theme.text }]}>
          {meal.emoji} {meal.key}
        </Text>
        <Text style={[styles.mealSectionCals, { color: mealCals > 0 ? theme.accent : theme.textMuted }]}>
          {mealCals} cal
        </Text>
      </View>

      {entries.length === 0 ? (
        <Text style={[styles.mealEmpty, { color: theme.textMuted }]}>Nothing logged</Text>
      ) : (
        entries.map(entry => (
          <LoggedEntryRow
            key={entry.id}
            entry={entry}
            viewDate={viewDate}
            editingId={editingId}
            editFields={editFields}
            meals={meals}
            onStartEdit={onStartEdit}
            onCancelEdit={onCancelEdit}
            onRemove={onRemove}
            onApplyQtyScale={onApplyQtyScale}
            onSaveEdit={onSaveEdit}
            onSetEditField={onSetEditField}
            theme={theme}
          />
        ))
      )}
    </Card>
  );
}

const styles = StyleSheet.create({
  mealSection: { marginBottom: spacing[3] },
  mealSectionHeader: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    marginBottom: spacing[2],
  },
  mealSectionTitle: { fontSize: typography.sizes.base, fontWeight: typography.weights.bold },
  mealSectionCals: { fontSize: typography.sizes.base, fontWeight: typography.weights.semibold },
  mealEmpty: { fontSize: typography.sizes.sm, fontStyle: 'italic' },
});
