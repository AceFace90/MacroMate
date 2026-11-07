import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { fontFamily } from '../../theme';
import Card from '../Card';
import Icon, { MEAL_ICONS } from '../Icon';
import { sumEntries } from '../../store/logStore';
import LoggedEntryRow from './LoggedEntryRow';

const sentence = (s) => s.charAt(0) + s.slice(1).toLowerCase();

export default function MealSection({
  meal, entries, viewDate, editingId, editFields, meals,
  onStartEdit, onCancelEdit, onRemove, onApplyQtyScale, onSaveEdit, onSetEditField,
  theme,
}) {
  const mealCals = Math.round(sumEntries(entries).calories);

  return (
    <Card style={styles.mealSection}>
      <View style={styles.header}>
        <View style={styles.titleRow}>
          <Icon name={MEAL_ICONS[meal.key] || 'forkKnife'} size={20} color={theme.accent} />
          <Text style={[styles.title, { color: theme.text, fontFamily }]}>{sentence(meal.key)}</Text>
        </View>
        <Text style={[styles.cals, { color: theme.textSecondary, fontFamily }]}>{mealCals} kcal</Text>
      </View>

      {entries.length === 0 ? (
        <Text style={[styles.empty, { color: theme.textSecondary, fontFamily }]}>Nothing logged</Text>
      ) : (
        entries.map((entry, i) => (
          <React.Fragment key={entry.id}>
            <View style={[styles.sep, { backgroundColor: theme.separator }]} />
            <LoggedEntryRow
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
          </React.Fragment>
        ))
      )}
    </Card>
  );
}

const styles = StyleSheet.create({
  mealSection: { marginBottom: 12 },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  titleRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  title: { fontSize: 17, fontWeight: '600' },
  cals: { fontSize: 15, fontWeight: '500' },
  empty: { fontSize: 15, marginTop: 8 },
  sep: { height: StyleSheet.hairlineWidth, marginTop: 12 },
});
