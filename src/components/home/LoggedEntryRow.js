import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity, TextInput } from 'react-native';
import { spacing, typography, colors, radius } from '../../theme';

const HIT = { top: 10, bottom: 10, left: 10, right: 10 };

export default function LoggedEntryRow({
  entry, viewDate, editingId, editFields, meals,
  onStartEdit, onCancelEdit, onRemove, onApplyQtyScale, onSaveEdit, onSetEditField,
  theme,
}) {
  const isEditing = editingId === entry.id;

  return (
    <View>
      <View style={[styles.entryRow, { borderTopColor: theme.border }]}>
        <View style={{ flex: 1, minWidth: 0 }}>
          <Text style={[styles.entryName, { color: theme.text }]} numberOfLines={1}>{entry.name}</Text>
          <Text style={[styles.entrySub, { color: theme.textMuted }]}>
            {`${new Date(entry.logged_at).toLocaleTimeString('en-AU', { hour: 'numeric', minute: '2-digit' })}${entry.quantity_g ? ` · ${entry.quantity_g}g` : ''}`}
          </Text>
        </View>
        <View style={styles.entryMacros}>
          <Text style={[styles.entryCal, { color: theme.text }]}>{entry.calories}</Text>
          <Text style={[styles.entryMacroSub, { color: theme.textMuted }]}>
            {`${entry.protein_g}g P  ${entry.carbs_g}g C  ${entry.fat_g}g F`}
          </Text>
        </View>
        <View style={styles.entryActions}>
          <TouchableOpacity
            onPress={() => isEditing ? onCancelEdit() : onStartEdit(entry)}
            style={[styles.actionBtn, { borderColor: theme.accent }]}
          >
            <Text style={[styles.actionBtnText, { color: theme.accent }]}>Edit</Text>
          </TouchableOpacity>
          <TouchableOpacity
            onPress={() => onRemove(viewDate, entry.id)}
            style={[styles.actionBtn, { borderColor: colors.red }]}
          >
            <Text style={[styles.actionBtnText, { color: colors.red }]}>✕</Text>
          </TouchableOpacity>
        </View>
      </View>

      {/* Inline full-macro editor */}
      {isEditing && (
        <View style={[styles.editPanel, { borderTopColor: theme.border, backgroundColor: theme.input }]}>
          {/* Qty row with scale button */}
          <View style={styles.editRow}>
            <Text style={[styles.editLabel, { color: theme.textMuted }]}>Qty (g)</Text>
            <TextInput
              value={editFields.qty}
              onChangeText={onSetEditField('qty')}
              keyboardType="numeric"
              selectTextOnFocus
              style={[styles.editInput, { color: theme.text, borderColor: theme.border, backgroundColor: theme.card }]}
            />
            <TouchableOpacity
              onPress={() => onApplyQtyScale(entry)}
              style={[styles.scaleBtn, { borderColor: theme.accent }]}
            >
              <Text style={[styles.scaleBtnText, { color: theme.accent }]}>Scale</Text>
            </TouchableOpacity>
          </View>
          {/* Meal type picker */}
          <View style={styles.editMealRow}>
            {meals.map(m => {
              const active = editFields.meal_type === m.key;
              return (
                <TouchableOpacity
                  key={m.key}
                  onPress={() => onSetEditField('meal_type')(m.key)}
                  style={[
                    styles.editMealPill,
                    { borderColor: active ? theme.accent : theme.border },
                    active && { backgroundColor: theme.accentBg },
                  ]}
                >
                  <Text style={[styles.editMealPillText, { color: active ? theme.accent : theme.textMuted }]}>
                    {m.label}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>
          {/* Macro fields */}
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
                  value={editFields[f.key]}
                  onChangeText={onSetEditField(f.key)}
                  keyboardType="numeric"
                  selectTextOnFocus
                  style={[styles.editMacroInput, { color: theme.text, borderColor: f.color || theme.border, backgroundColor: theme.card }]}
                />
              </View>
            ))}
          </View>
          <View style={styles.editActions}>
            <TouchableOpacity
              onPress={() => onSaveEdit(entry)}
              style={[styles.editSaveBtn, { backgroundColor: theme.accent }]}
            >
              <Text style={styles.editSaveBtnText}>Save</Text>
            </TouchableOpacity>
            <TouchableOpacity onPress={onCancelEdit} hitSlop={HIT}>
              <Text style={[styles.editCancelText, { color: theme.textMuted }]}>Cancel</Text>
            </TouchableOpacity>
          </View>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  entryRow: {
    flexDirection: 'row', alignItems: 'center',
    paddingTop: spacing[3], borderTopWidth: 1, gap: spacing[2],
  },
  entryName: { fontSize: typography.sizes.sm, fontWeight: typography.weights.medium },
  entrySub: { fontSize: typography.sizes.xs, marginTop: 2 },
  entryMacros: { alignItems: 'flex-end', minWidth: 72 },
  entryCal: { fontSize: typography.sizes.sm, fontWeight: typography.weights.bold },
  entryMacroSub: { fontSize: 10, marginTop: 1 },
  entryActions: { flexDirection: 'row', gap: spacing[1] },
  actionBtn: { borderWidth: 1, borderRadius: radius.sm, paddingHorizontal: spacing[2], paddingVertical: 3 },
  actionBtnText: { fontSize: typography.sizes.xs, fontWeight: typography.weights.semibold },

  editPanel: {
    borderTopWidth: 1, marginTop: spacing[2],
    padding: spacing[3], borderRadius: radius.md, gap: spacing[3],
  },
  editRow: { flexDirection: 'row', alignItems: 'center', gap: spacing[2] },
  editMealRow: { flexDirection: 'row', gap: spacing[2] },
  editMealPill: { flex: 1, alignItems: 'center', paddingVertical: spacing[1], borderRadius: radius.md, borderWidth: 1 },
  editMealPillText: { fontSize: typography.sizes.xs, fontWeight: typography.weights.bold },
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
  editSaveBtn: { paddingHorizontal: spacing[4], paddingVertical: spacing[2], borderRadius: radius.sm },
  editSaveBtnText: { fontSize: typography.sizes.sm, fontWeight: typography.weights.bold, color: '#000' },
  editCancelText: { fontSize: typography.sizes.sm },
});
