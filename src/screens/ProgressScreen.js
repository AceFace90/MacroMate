import React from 'react';
import { View, Text, StyleSheet, ScrollView } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLog, sumEntries } from '../store/logStore';
import { useTheme } from '../hooks/useTheme';
import { colors, spacing, typography, radius } from '../theme';
import Card from '../components/Card';

// ─── Helpers ────────────────────────────────────────────────────────────────

function getLast7Days() {
  const days = [];
  const today = new Date();
  for (let i = 6; i >= 0; i--) {
    const d = new Date(today);
    d.setDate(today.getDate() - i);
    const yyyy = d.getFullYear();
    const mm = String(d.getMonth() + 1).padStart(2, '0');
    const dd = String(d.getDate()).padStart(2, '0');
    const dateStr = `${yyyy}-${mm}-${dd}`;
    let label;
    if (i === 0) {
      label = 'Today';
    } else if (i === 1) {
      label = 'Yesterday';
    } else {
      label = `${dd}/${mm}`;
    }
    days.push({ dateStr, label });
  }
  return days;
}

// ─── Sub-components ─────────────────────────────────────────────────────────

function ProgressBar({ value, goal, color, height = 20 }) {
  const { theme } = useTheme();
  const pct = goal > 0 ? Math.min(value / goal, 1) : 0;
  return (
    <View
      style={[
        styles.barTrack,
        { height, borderRadius: radius.sm, backgroundColor: theme.border },
      ]}
    >
      <View
        style={{
          width: `${pct * 100}%`,
          height,
          borderRadius: radius.sm,
          backgroundColor: color,
        }}
      />
    </View>
  );
}

function MacroBar({ value, goal, color }) {
  const { theme } = useTheme();
  const pct = goal > 0 ? Math.min(value / goal, 1) : 0;
  return (
    <View
      style={[
        styles.barTrack,
        { height: 8, borderRadius: radius.sm, backgroundColor: theme.border, marginBottom: 3 },
      ]}
    >
      <View
        style={{
          width: `${pct * 100}%`,
          height: 8,
          borderRadius: radius.sm,
          backgroundColor: color,
        }}
      />
    </View>
  );
}

function TargetTile({ label, value, unit, color }) {
  const { theme } = useTheme();
  return (
    <View style={[styles.targetTile, { backgroundColor: theme.bg, borderColor: theme.border }]}>
      <Text style={[styles.targetValue, { color }]}>{value}</Text>
      <Text style={[styles.targetUnit, { color: theme.textMuted }]}>{unit}</Text>
      <Text style={[styles.targetLabel, { color: theme.textMuted }]}>{label}</Text>
    </View>
  );
}

// ─── Main Screen ─────────────────────────────────────────────────────────────

export default function ProgressScreen() {
  const { theme } = useTheme();
  const { logs, targets } = useLog();
  const days = getLast7Days();

  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: theme.bg }]} edges={['top']}>
      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={[styles.container, { backgroundColor: theme.bg }]}
        showsVerticalScrollIndicator={false}
      >
        {/* Header */}
        <Text style={[styles.header, { color: theme.accent }]}>Progress 📈</Text>

        {/* Daily Targets card */}
        <Card style={styles.cardSpacing}>
          <Text style={[styles.cardTitle, { color: theme.text }]}>Daily Targets</Text>
          <View style={styles.tilesRow}>
            <TargetTile
              label="Calories"
              value={targets.calories}
              unit="kcal"
              color={colors.calories}
            />
            <TargetTile
              label="Protein"
              value={targets.protein}
              unit="g"
              color={colors.protein}
            />
            <TargetTile
              label="Carbs"
              value={targets.carbs}
              unit="g"
              color={colors.carbs}
            />
            <TargetTile
              label="Fat"
              value={targets.fat}
              unit="g"
              color={colors.fat}
            />
          </View>
        </Card>

        {/* Total Calories (Last 7 Days) card */}
        <Card style={styles.cardSpacing}>
          <Text style={[styles.cardTitle, { color: theme.text }]}>Total Calories (Last 7 Days)</Text>
          {days.map(({ dateStr, label }) => {
            const totals = sumEntries(logs[dateStr] || []);
            const diff = totals.calories - targets.calories;
            const diffStr =
              diff === 0
                ? ''
                : diff < 0
                ? ` (−${Math.abs(diff).toLocaleString()})`
                : ` (+${diff.toLocaleString()})`;
            return (
              <View key={dateStr} style={styles.dayRow}>
                <Text style={[styles.dayLabel, { color: theme.textMuted }]}>{label}</Text>
                <View style={styles.barWrapper}>
                  <ProgressBar
                    value={totals.calories}
                    goal={targets.calories}
                    color={theme.accent}
                    height={20}
                  />
                </View>
                <Text style={[styles.calValue, { color: theme.text }]}>
                  {totals.calories.toLocaleString()}
                  <Text style={{ color: theme.textMuted, fontSize: typography.sizes.xs }}>
                    {diffStr}
                  </Text>
                </Text>
              </View>
            );
          })}
        </Card>

        {/* Macro Breakdown (Last 7 Days) card */}
        <Card style={[styles.cardSpacing, styles.lastCard]}>
          <Text style={[styles.cardTitle, { color: theme.text }]}>Macro Breakdown (Last 7 Days)</Text>
          {days.map(({ dateStr, label }) => {
            const t = sumEntries(logs[dateStr] || []);
            const proteinPct =
              targets.protein > 0 ? Math.round((t.protein / targets.protein) * 100) : 0;
            const carbsPct =
              targets.carbs > 0 ? Math.round((t.carbs / targets.carbs) * 100) : 0;
            const fatPct =
              targets.fat > 0 ? Math.round((t.fat / targets.fat) * 100) : 0;
            return (
              <View key={dateStr} style={styles.macroDayBlock}>
                <Text style={[styles.dayLabel, { color: theme.textMuted, marginBottom: spacing[1] }]}>
                  {label}
                </Text>
                <MacroBar value={t.protein} goal={targets.protein} color={colors.protein} />
                <MacroBar value={t.carbs} goal={targets.carbs} color={colors.carbs} />
                <MacroBar value={t.fat} goal={targets.fat} color={colors.fat} />
                <Text style={[styles.macroSummary, { color: theme.textMuted }]}>
                  {`Protein: ${Math.round(t.protein)}g (${proteinPct}%)  •  Carbs: ${Math.round(t.carbs)}g (${carbsPct}%)  •  Fat: ${Math.round(t.fat)}g (${fatPct}%)`}
                </Text>
              </View>
            );
          })}
        </Card>
      </ScrollView>
    </SafeAreaView>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  safe: {
    flex: 1,
  },
  container: {
    padding: spacing[4],
    paddingBottom: spacing[8],
  },
  header: {
    fontSize: typography.sizes['3xl'],
    fontWeight: typography.weights.bold,
    marginBottom: spacing[4],
  },
  cardSpacing: {
    marginBottom: spacing[4],
  },
  lastCard: {
    marginBottom: 0,
  },
  cardTitle: {
    fontSize: typography.sizes.base,
    fontWeight: typography.weights.semibold,
    marginBottom: spacing[3],
  },

  // Target tiles
  tilesRow: {
    flexDirection: 'row',
    gap: spacing[2],
  },
  targetTile: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: spacing[3],
    borderRadius: radius.md,
    borderWidth: 1,
  },
  targetValue: {
    fontSize: typography.sizes.lg,
    fontWeight: typography.weights.bold,
  },
  targetUnit: {
    fontSize: typography.sizes.xs,
    marginTop: 1,
  },
  targetLabel: {
    fontSize: typography.sizes.xs,
    marginTop: 2,
  },

  // Day rows (calorie chart)
  dayRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: spacing[2],
  },
  dayLabel: {
    width: 70,
    fontSize: typography.sizes.sm,
  },
  barWrapper: {
    flex: 1,
    marginHorizontal: spacing[2],
  },
  barTrack: {
    overflow: 'hidden',
  },
  calValue: {
    width: 80,
    textAlign: 'right',
    fontSize: typography.sizes.sm,
    fontWeight: typography.weights.medium,
  },

  // Macro breakdown
  macroDayBlock: {
    marginBottom: spacing[4],
  },
  macroSummary: {
    fontSize: typography.sizes.xs,
    marginTop: spacing[1],
  },
});
