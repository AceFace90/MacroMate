import React, { useState } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, Alert } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useTheme } from '../hooks/useTheme';
import { spacing, typography, colors } from '../theme';
import Card from '../components/Card';
import ActivityRings from '../components/ActivityRings';
import { useLog, todayStr, sumEntries } from '../store/logStore';
import { signOut } from '../services/auth';

export default function DashboardScreen({ navigation }) {
  const { theme } = useTheme();
  const { getEntries, removeEntry, targets } = useLog();
  const today = todayStr();
  const entries = getEntries(today);
  const totals = sumEntries(entries);

  const rings = [
    { label: 'Protein', value: Math.round(totals.protein), goal: targets.protein, color: colors.protein },
    { label: 'Carbs',   value: Math.round(totals.carbs),   goal: targets.carbs,   color: colors.carbs },
    { label: 'Fat',     value: Math.round(totals.fat),     goal: targets.fat,     color: colors.fat },
  ];

  const calRemaining = targets.calories - Math.round(totals.calories);

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: theme.bg }}>
      <ScrollView contentContainerStyle={styles.container}>
        {/* Header */}
        <View style={styles.header}>
          <Text style={[styles.title, { color: theme.accent }]}>MacroMate</Text>
          <Text style={[styles.date, { color: theme.textMuted }]}>
            {new Date().toLocaleDateString('en-AU', { weekday: 'short', month: 'short', day: 'numeric' })}
          </Text>
        </View>

        {/* Macro rings */}
        <Card style={styles.ringsCard}>
          <Text style={[styles.sectionTitle, { color: theme.text }]}>Today</Text>
          <ActivityRings
            rings={rings}
            size={180}
            centerLabel={`${Math.round(totals.calories)}`}
            centerSub={`/ ${targets.calories} kcal`}
          />
          <View style={styles.calRow}>
            <Text style={[styles.calLabel, { color: theme.textMuted }]}>
              {calRemaining >= 0 ? `${calRemaining} kcal remaining` : `${Math.abs(calRemaining)} kcal over`}
            </Text>
          </View>
        </Card>

        {/* Quick log button */}
        <TouchableOpacity
          style={[styles.logBtn, { backgroundColor: theme.accent }]}
          onPress={() => navigation.navigate('FoodSearch')}
          activeOpacity={0.8}
        >
          <Text style={[styles.logBtnText, { color: '#000' }]}>+ Log Food</Text>
        </TouchableOpacity>

        {/* Today's meals */}
        {entries.length > 0 && (
          <Card style={{ marginTop: spacing[4] }}>
            <Text style={[styles.sectionTitle, { color: theme.text }]}>Meals logged</Text>
            {entries.map((entry) => (
              <TouchableOpacity
                key={entry.id}
                style={styles.entryRow}
                onLongPress={() =>
                  Alert.alert('Remove?', entry.name, [
                    { text: 'Cancel', style: 'cancel' },
                    { text: 'Remove', style: 'destructive', onPress: () => removeEntry(today, entry.id) },
                  ])
                }
              >
                <View style={{ flex: 1 }}>
                  <Text style={[styles.entryName, { color: theme.text }]}>{entry.name}</Text>
                  <Text style={[styles.entrySub, { color: theme.textMuted }]}>
                    P {entry.protein_g}g · C {entry.carbs_g}g · F {entry.fat_g}g
                  </Text>
                </View>
                <Text style={[styles.entryCal, { color: theme.textSecondary }]}>{entry.calories} kcal</Text>
              </TouchableOpacity>
            ))}
          </Card>
        )}

        {entries.length === 0 && (
          <Text style={[styles.empty, { color: theme.textMuted }]}>
            No food logged yet — tap + Log Food to start
          </Text>
        )}

        <TouchableOpacity
          onPress={() => signOut().catch((e) => Alert.alert('Error', e.message))}
          style={styles.signOut}
        >
          <Text style={[styles.signOutText, { color: theme.textMuted }]}>Sign out</Text>
        </TouchableOpacity>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { padding: spacing[5], paddingBottom: spacing[12] },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: spacing[4] },
  title: { fontSize: typography.sizes['2xl'], fontWeight: typography.weights.bold },
  date: { fontSize: typography.sizes.sm },
  ringsCard: { gap: spacing[4] },
  sectionTitle: { fontSize: typography.sizes.lg, fontWeight: typography.weights.semibold },
  calRow: { alignItems: 'center' },
  calLabel: { fontSize: typography.sizes.sm },
  logBtn: {
    marginTop: spacing[4], borderRadius: 12, paddingVertical: spacing[4],
    alignItems: 'center',
  },
  logBtnText: { fontSize: typography.sizes.lg, fontWeight: typography.weights.bold },
  entryRow: {
    flexDirection: 'row', alignItems: 'center', paddingVertical: spacing[3],
    borderTopWidth: 1, borderTopColor: 'rgba(128,128,128,0.15)',
  },
  entryName: { fontSize: typography.sizes.base, fontWeight: typography.weights.medium },
  entrySub: { fontSize: typography.sizes.xs, marginTop: 2 },
  entryCal: { fontSize: typography.sizes.base, fontWeight: typography.weights.semibold },
  empty: { textAlign: 'center', marginTop: spacing[8], fontSize: typography.sizes.base },
  signOut: { marginTop: spacing[10], alignItems: 'center' },
  signOutText: { fontSize: typography.sizes.sm },
});
