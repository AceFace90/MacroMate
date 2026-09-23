import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity, TextInput } from 'react-native';
import { spacing, typography, radius } from '../../theme';
import { scaleFood } from '../../utils/foodMath';

const HIT = { top: 10, bottom: 10, left: 10, right: 10 };

export default function QuantityPickerRow({ food, qty, onQtyChange, onLog, onCancel, theme }) {
  const numQty = parseFloat(qty) || food.quantity_g || 100;
  const scaled = scaleFood(food, numQty);
  return (
    <View style={[styles.qtyPicker, { backgroundColor: theme.accentBg, borderColor: theme.accentBorder }]}>
      <Text style={[styles.qtyFoodName, { color: theme.text }]} numberOfLines={1}>{food.name}</Text>
      <Text style={[styles.qtyMacros, { color: theme.textMuted }]}>
        {scaled.calories} kcal · P {scaled.protein_g}g · C {scaled.carbs_g}g · F {scaled.fat_g}g
      </Text>
      <View style={styles.qtyControls}>
        <TextInput
          value={qty}
          onChangeText={onQtyChange}
          keyboardType="numeric"
          selectTextOnFocus
          style={[styles.qtyInput, { color: theme.text, borderColor: theme.accentBorder, backgroundColor: theme.input }]}
        />
        <Text style={[styles.qtyUnit, { color: theme.textMuted }]}>g</Text>
        <TouchableOpacity onPress={onLog} style={[styles.qtyLogBtn, { backgroundColor: theme.accent }]}>
          <Text style={styles.qtyLogBtnText}>Log</Text>
        </TouchableOpacity>
        <TouchableOpacity onPress={onCancel} hitSlop={HIT}>
          <Text style={[styles.qtyCancel, { color: theme.textMuted }]}>✕</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  qtyPicker: {
    borderRadius: radius.lg, borderWidth: 1.5,
    padding: spacing[3], marginBottom: spacing[2], gap: spacing[2],
  },
  qtyFoodName: { fontSize: typography.sizes.base, fontWeight: typography.weights.semibold },
  qtyMacros: { fontSize: typography.sizes.xs },
  qtyControls: { flexDirection: 'row', alignItems: 'center', gap: spacing[2] },
  qtyInput: {
    width: 64, borderWidth: 1, borderRadius: radius.sm,
    paddingHorizontal: spacing[2], paddingVertical: spacing[1],
    fontSize: typography.sizes.base, textAlign: 'center',
  },
  qtyUnit: { fontSize: typography.sizes.sm },
  qtyLogBtn: { paddingHorizontal: spacing[4], paddingVertical: spacing[2], borderRadius: radius.md },
  qtyLogBtnText: { fontSize: typography.sizes.base, fontWeight: typography.weights.bold, color: '#000' },
  qtyCancel: { fontSize: typography.sizes.lg, fontWeight: '600', paddingHorizontal: spacing[1] },
});
