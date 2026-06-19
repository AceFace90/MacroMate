import React, { useState, useMemo } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity, TextInput, Alert,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useTheme } from '../hooks/useTheme';
import { spacing, typography, colors, radius } from '../theme';
import Card from '../components/Card';
import { useLog, sumEntries, getPreviousDays } from '../store/logStore';

const HIT = { top: 10, bottom: 10, left: 10, right: 10 };
const DAYS_TO_SHOW = 30;

function scaleFood(entry, newQty) {
  const base = entry.quantity_g || 100;
  const scale = newQty / base;
  return {
    calories: Math.round((entry.calories || 0) * scale),
    protein_g: Math.round((entry.protein_g || 0) * scale * 10) / 10,
    carbs_g: Math.round((entry.carbs_g || 0) * scale * 10) / 10,
    fat_g: Math.round((entry.fat_g || 0) * scale * 10) / 10,
    quantity_g: newQty,
  };
}

function EntryRow({ entry, date, theme, onUpdate, onDelete }) {
  const [editing, setEditing] = useState(false);
  const [fields, setFields] = useState({
    qty: String(entry.quantity_g || 100),
    cal: String(entry.calories ?? ''),
    protein: String(entry.protein_g ?? ''),
    carbs: String(entry.carbs_g ?? ''),
    fat: String(entry.fat_g ?? ''),
  });

  const setField = (key) => (val) => setFields(prev => ({ ...prev, [key]: val }));

  const applyScale = () => {
    const newQty = parseFloat(fields.qty) || entry.quantity_g || 100;
    const scaled = scaleFood(entry, newQty);
    setFields({
      qty: String(newQty),
      cal: String(scaled.calories),
      protein: String(scaled.protein_g),
      carbs: String(scaled.carbs_g),
      fat: String(scaled.fat_g),
    });
  };

  const save = () => {
    onUpdate(date, entry.id, {
      calories: Math.round(parseFloat(fields.cal) || 0),
      protein_g: Math.round((parseFloat(fields.protein) || 0) * 10) / 10,
      carbs_g: Math.round((parseFloat(fields.carbs) || 0) * 10) / 10,
      fat_g: Math.round((parseFloat(fields.fat) || 0) * 10) / 10,
      quantity_g: parseFloat(fields.qty) || entry.quantity_g || 100,
    });
    setEditing(false);
  };

  const time = entry.logged_at
    ? new Date(entry.logged_at).toLocaleTimeString('en-AU', { hour: 'numeric', minute: '2-digit' })
    : '';
  const mealLabel = entry.meal_type ? entry.meal_type.charAt(0) + entry.meal_type.slice(1).toLowerCase() : '';

  return (
    <View>
      <View style={[styles.entryRow, { borderTopColor: theme.border }]}>
        <View style={{ flex: 1, minWidth: 0 }}>
          <Text style={[styles.entryName, { color: theme.text }]} numberOfLines={2}>{entry.name}</Text>
          <Text style={[styles.entrySub, { color: theme.textMuted }]}>
            {time}{mealLabel ? ` · ${mealLabel}` : ''}{entry.quantity_g ? ` · ${entry.quantity_g}g` : ''}
          </Text>
        </View>
        <View style={styles.entryRight}>
          <Text style={[styles.entryCal, { color: entry.calories > 0 ? theme.text : colors.carbs }]}>
            {`${entry.calories} kcal`}
          </Text>
          <Text style={[styles.entryMacros, { color: theme.textMuted }]}>
            P{entry.protein_g}  C{entry.carbs_g}  F{entry.fat_g}
          </Text>
        </View>
        <View style={styles.entryActions}>
          <TouchableOpacity
            onPress={() => setEditing(e => !e)}
            style={[styles.actionBtn, { borderColor: theme.accent }]}
          >
            <Text style={[styles.actionBtnText, { color: theme.accent }]}>Edit</Text>
          </TouchableOpacity>
          <TouchableOpacity
            onPress={() => Alert.alert('Delete?', entry.name, [
              { text: 'Cancel', style: 'cancel' },
              { text: 'Delete', style: 'destructive', onPress: () => onDelete(date, entry.id) },
            ])}
            style={[styles.actionBtn, { borderColor: colors.red }]}
          >
            <Text style={[styles.actionBtnText, { color: colors.red }]}>✕</Text>
          </TouchableOpacity>
        </View>
      </View>

      {editing && (
        <View style={[styles.editPanel, { borderTopColor: theme.border, backgroundColor: theme.input }]}>
          <View style={styles.editRow}>
            <Text style={[styles.editLabel, { color: theme.textMuted }]}>Qty (g)</Text>
            <TextInput
              value={fields.qty}
              onChangeText={setField('qty')}
              keyboardType="numeric"
              selectTextOnFocus
              style={[styles.editInput, { color: theme.text, borderColor: theme.border, backgroundColor: theme.card }]}
            />
            <TouchableOpacity onPress={applyScale} style={[styles.scaleBtn, { borderColor: theme.accent }]}>
              <Text style={[styles.scaleBtnText, { color: theme.accent }]}>Scale</Text>
            </TouchableOpacity>
          </View>
          <View style={styles.editMacroRow}>
            {[
              { key: 'cal', label: 'Cal' },
              { key: 'protein', label: 'P (g)', color: colors.protein },
              { key: 'carbs', label: 'C (g)', color: colors.carbs },
              { key: 'fat', label: 'F (g)', color: colors.fat },
            ].map(f => (
              <View key={f.key} style={styles.editMacroField}>
                <Text style={[styles.editMacroLabel, { color: f.color || theme.textMuted }]}>{f.label}</Text>
                <TextInput
                  value={fields[f.key]}
                  onChangeText={setField(f.key)}
                  keyboardType="numeric"
                  selectTextOnFocus
                  style={[styles.editMacroInput, { color: theme.text, borderColor: f.color || theme.border, backgroundColor: theme.card }]}
                />
              </View>
            ))}
          </View>
          <View style={styles.editActions}>
            <TouchableOpacity onPress={save} style={[styles.saveBtn, { backgroundColor: theme.accent }]}>
              <Text style={styles.saveBtnText}>Save</Text>
            </TouchableOpacity>
            <TouchableOpacity onPress={() => setEditing(false)} hitSlop={HIT}>
              <Text style={[styles.cancelText, { color: theme.textMuted }]}>Cancel</Text>
            </TouchableOpacity>
          </View>
        </View>
      )}
    </View>
  );
}

export default function FoodHistoryScreen() {
  const { theme } = useTheme();
  const { logs, removeEntry, updateEntry } = useLog();

  const days = useMemo(() => getPreviousDays(DAYS_TO_SHOW), []);

  const daysWithData = useMemo(() =>
    days.filter(d => (logs[d] || []).length > 0),
    [days, logs]
  );

  if (daysWithData.length === 0) {
    return (
      <SafeAreaView style={{ flex: 1, backgroundColor: theme.bg }}>
        <View style={styles.empty}>
          <Text style={[styles.emptyText, { color: theme.textMuted }]}>No food logged yet</Text>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: theme.bg }}>
      <ScrollView contentContainerStyle={styles.container} keyboardShouldPersistTaps="handled">
        <Text style={[styles.heading, { color: theme.text }]}>Food History</Text>
        <Text style={[styles.subheading, { color: theme.textMuted }]}>Last {DAYS_TO_SHOW} days · tap Edit to correct any entry</Text>

        {daysWithData.map(date => {
          const entries = logs[date] || [];
          const totals = sumEntries(entries);
          const label = new Date(date + 'T00:00:00').toLocaleDateString('en-AU', {
            weekday: 'short', day: 'numeric', month: 'short',
          });
          return (
            <Card key={date} style={styles.dayCard}>
              <View style={styles.dayHeader}>
                <Text style={[styles.dayLabel, { color: theme.text }]}>{label}</Text>
                <Text style={[styles.dayCals, { color: theme.accent }]}>
                  {`${Math.round(totals.calories)} kcal · P${Math.round(totals.protein)}g C${Math.round(totals.carbs)}g F${Math.round(totals.fat)}g`}
                </Text>
              </View>
              {entries.map(entry => (
                <EntryRow
                  key={entry.id}
                  entry={entry}
                  date={date}
                  theme={theme}
                  onUpdate={updateEntry}
                  onDelete={removeEntry}
                />
              ))}
            </Card>
          );
        })}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { padding: spacing[4], paddingBottom: spacing[12] },
  heading: { fontSize: typography.sizes['2xl'], fontWeight: typography.weights.bold, marginBottom: spacing[1] },
  subheading: { fontSize: typography.sizes.sm, marginBottom: spacing[4] },

  dayCard: { marginBottom: spacing[3] },
  dayHeader: { marginBottom: spacing[2] },
  dayLabel: { fontSize: typography.sizes.base, fontWeight: typography.weights.bold },
  dayCals: { fontSize: typography.sizes.xs, marginTop: 2 },

  entryRow: {
    flexDirection: 'row', alignItems: 'flex-start',
    paddingTop: spacing[3], borderTopWidth: 1, gap: spacing[2],
  },
  entryName: { fontSize: typography.sizes.sm, fontWeight: typography.weights.medium },
  entrySub: { fontSize: typography.sizes.xs, marginTop: 2 },
  entryRight: { alignItems: 'flex-end', minWidth: 80 },
  entryCal: { fontSize: typography.sizes.sm, fontWeight: typography.weights.bold },
  entryMacros: { fontSize: 10, marginTop: 2 },
  entryActions: { flexDirection: 'row', gap: spacing[1] },
  actionBtn: { borderWidth: 1, borderRadius: radius.sm, paddingHorizontal: spacing[2], paddingVertical: 3 },
  actionBtnText: { fontSize: typography.sizes.xs, fontWeight: typography.weights.semibold },

  editPanel: {
    borderTopWidth: 1, marginTop: spacing[2],
    padding: spacing[3], borderRadius: radius.md, gap: spacing[3],
  },
  editRow: { flexDirection: 'row', alignItems: 'center', gap: spacing[2] },
  editLabel: { fontSize: typography.sizes.sm, width: 48 },
  editInput: {
    width: 72, borderWidth: 1, borderRadius: radius.sm,
    paddingHorizontal: spacing[2], paddingVertical: spacing[1],
    fontSize: typography.sizes.sm, textAlign: 'center',
  },
  scaleBtn: { borderWidth: 1, borderRadius: radius.sm, paddingHorizontal: spacing[3], paddingVertical: spacing[1] },
  scaleBtnText: { fontSize: typography.sizes.xs, fontWeight: typography.weights.semibold },
  editMacroRow: { flexDirection: 'row', gap: spacing[2] },
  editMacroField: { flex: 1, alignItems: 'center', gap: 3 },
  editMacroLabel: { fontSize: 10, fontWeight: typography.weights.semibold },
  editMacroInput: {
    width: '100%', borderWidth: 1, borderRadius: radius.sm,
    paddingHorizontal: spacing[1], paddingVertical: spacing[1],
    fontSize: typography.sizes.sm, textAlign: 'center',
  },
  editActions: { flexDirection: 'row', alignItems: 'center', gap: spacing[3] },
  saveBtn: { paddingHorizontal: spacing[4], paddingVertical: spacing[2], borderRadius: radius.sm },
  saveBtnText: { fontSize: typography.sizes.sm, fontWeight: typography.weights.bold, color: '#000' },
  cancelText: { fontSize: typography.sizes.sm },

  empty: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  emptyText: { fontSize: typography.sizes.base },
});
