import React, { useState, useMemo } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLog, sumEntries } from '../store/logStore';
import { useTheme } from '../hooks/useTheme';
import { colors, spacing, typography, radius } from '../theme';
import Card from '../components/Card';

const RANGES = [7, 30, 90];

// ─── Helpers ────────────────────────────────────────────────────────────────

// Ordered list of the last n days (oldest → today) with dd/mm labels.
function getDays(n) {
  const days = [];
  const today = new Date();
  for (let i = n - 1; i >= 0; i--) {
    const d = new Date(today);
    d.setDate(today.getDate() - i);
    const yyyy = d.getFullYear();
    const mm = String(d.getMonth() + 1).padStart(2, '0');
    const dd = String(d.getDate()).padStart(2, '0');
    days.push({ dateStr: `${yyyy}-${mm}-${dd}`, label: `${dd}/${mm}` });
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

function RangeSelector({ range, onChange, theme }) {
  return (
    <View style={[styles.rangeSelector, { backgroundColor: theme.bg, borderColor: theme.border }]}>
      {RANGES.map((n) => {
        const active = n === range;
        return (
          <TouchableOpacity
            key={n}
            style={[styles.rangeBtn, active && { backgroundColor: theme.accent }]}
            onPress={() => onChange(n)}
            activeOpacity={0.8}
          >
            <Text style={[styles.rangeBtnText, { color: active ? '#000' : theme.textMuted }]}>
              {n}d
            </Text>
          </TouchableOpacity>
        );
      })}
    </View>
  );
}

// Vertical daily-calorie trend: one thin bar per day, height ∝ calories. Scales
// to long ranges where per-day rows wouldn't. Bars over the goal are tinted.
function CalorieTrend({ perDay, goal, theme }) {
  const maxCal = Math.max(goal, ...perDay.map((d) => d.totals.calories), 1);
  const first = perDay[0]?.label;
  const last = perDay[perDay.length - 1]?.label;
  return (
    <View>
      <View style={styles.trendChart}>
        {perDay.map((d) => {
          const cal = d.totals.calories;
          const pct = cal > 0 ? Math.max(cal / maxCal, 0.02) : 0;
          const over = goal > 0 && cal > goal;
          return (
            <View key={d.dateStr} style={styles.trendCol}>
              <View
                style={{
                  width: '100%',
                  height: `${pct * 100}%`,
                  borderRadius: radius.sm,
                  backgroundColor: over ? colors.fat : theme.accent,
                }}
              />
            </View>
          );
        })}
      </View>
      <View style={styles.trendAxis}>
        <Text style={[styles.trendAxisLabel, { color: theme.textMuted }]}>{first}</Text>
        <Text style={[styles.trendAxisLabel, { color: theme.textMuted }]}>{last}</Text>
      </View>
    </View>
  );
}

// ─── Main Screen ─────────────────────────────────────────────────────────────

export default function ProgressScreen() {
  const { theme } = useTheme();
  const { logs, targets } = useLog();
  const [range, setRange] = useState(7);

  const { perDay, avg, loggedCount } = useMemo(() => {
    const days = getDays(range);
    const perDay = days.map((d) => ({ ...d, totals: sumEntries(logs[d.dateStr] || []) }));
    const logged = perDay.filter((d) => d.totals.calories > 0);
    const div = logged.length || 1;
    const sum = perDay.reduce(
      (a, d) => ({
        calories: a.calories + d.totals.calories,
        protein: a.protein + d.totals.protein,
        carbs: a.carbs + d.totals.carbs,
        fat: a.fat + d.totals.fat,
      }),
      { calories: 0, protein: 0, carbs: 0, fat: 0 }
    );
    return {
      perDay,
      loggedCount: logged.length,
      avg: {
        calories: Math.round(sum.calories / div),
        protein: Math.round(sum.protein / div),
        carbs: Math.round(sum.carbs / div),
        fat: Math.round(sum.fat / div),
      },
    };
  }, [logs, range]);

  const pct = (val, goal) => (goal > 0 ? Math.round((val / goal) * 100) : 0);

  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: theme.bg }]} edges={['top']}>
      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={[styles.container, { backgroundColor: theme.bg }]}
        showsVerticalScrollIndicator={false}
      >
        {/* Header */}
        <View style={styles.headerRow}>
          <Text style={[styles.header, { color: theme.accent }]}>Progress 📈</Text>
          <RangeSelector range={range} onChange={setRange} theme={theme} />
        </View>

        {/* Daily Targets card */}
        <Card style={styles.cardSpacing}>
          <Text style={[styles.cardTitle, { color: theme.text }]}>Daily Targets</Text>
          <View style={styles.tilesRow}>
            <TargetTile label="Calories" value={targets.calories} unit="kcal" color={colors.calories} />
            <TargetTile label="Protein" value={targets.protein} unit="g" color={colors.protein} />
            <TargetTile label="Carbs" value={targets.carbs} unit="g" color={colors.carbs} />
            <TargetTile label="Fat" value={targets.fat} unit="g" color={colors.fat} />
          </View>
        </Card>

        {/* Daily calorie trend */}
        <Card style={styles.cardSpacing}>
          <Text style={[styles.cardTitle, { color: theme.text }]}>Daily Calories · Last {range} Days</Text>
          {loggedCount === 0 ? (
            <Text style={[styles.emptyText, { color: theme.textMuted }]}>No meals logged in this range yet.</Text>
          ) : (
            <CalorieTrend perDay={perDay} goal={targets.calories} theme={theme} />
          )}
        </Card>

        {/* Averages vs target over the range */}
        <Card style={[styles.cardSpacing, styles.lastCard]}>
          <Text style={[styles.cardTitle, { color: theme.text }]}>Daily Average · Last {range} Days</Text>
          <Text style={[styles.avgSub, { color: theme.textMuted }]}>
            {loggedCount > 0
              ? `Averaged over ${loggedCount} logged day${loggedCount !== 1 ? 's' : ''}`
              : 'No logged days in this range'}
          </Text>

          <View style={styles.avgRow}>
            <Text style={[styles.dayLabel, { color: theme.textMuted }]}>Calories</Text>
            <View style={styles.barWrapper}>
              <ProgressBar value={avg.calories} goal={targets.calories} color={theme.accent} height={20} />
            </View>
            <Text style={[styles.calValue, { color: theme.text }]}>
              {avg.calories.toLocaleString()}
              <Text style={{ color: theme.textMuted, fontSize: typography.sizes.xs }}>
                {` (${pct(avg.calories, targets.calories)}%)`}
              </Text>
            </Text>
          </View>

          <View style={styles.macroDayBlock}>
            <MacroBar value={avg.protein} goal={targets.protein} color={colors.protein} />
            <MacroBar value={avg.carbs} goal={targets.carbs} color={colors.carbs} />
            <MacroBar value={avg.fat} goal={targets.fat} color={colors.fat} />
            <Text style={[styles.macroSummary, { color: theme.textMuted }]}>
              {`Protein: ${avg.protein}g (${pct(avg.protein, targets.protein)}%)  •  Carbs: ${avg.carbs}g (${pct(avg.carbs, targets.carbs)}%)  •  Fat: ${avg.fat}g (${pct(avg.fat, targets.fat)}%)`}
            </Text>
          </View>
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
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: spacing[4],
  },
  header: {
    fontSize: typography.sizes['3xl'],
    fontWeight: typography.weights.bold,
  },

  // Range selector
  rangeSelector: {
    flexDirection: 'row',
    borderWidth: 1,
    borderRadius: radius.md,
    padding: 2,
    gap: 2,
  },
  rangeBtn: {
    paddingHorizontal: spacing[3],
    paddingVertical: spacing[1],
    borderRadius: radius.sm,
  },
  rangeBtnText: {
    fontSize: typography.sizes.sm,
    fontWeight: typography.weights.semibold,
  },

  // Calorie trend chart
  trendChart: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    height: 120,
    gap: 2,
  },
  trendCol: {
    flex: 1,
    height: '100%',
    justifyContent: 'flex-end',
  },
  trendAxis: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: spacing[2],
  },
  trendAxisLabel: {
    fontSize: typography.sizes.xs,
  },
  emptyText: {
    fontSize: typography.sizes.sm,
    paddingVertical: spacing[3],
  },
  avgSub: {
    fontSize: typography.sizes.xs,
    marginTop: -spacing[2],
    marginBottom: spacing[3],
  },
  avgRow: {
    flexDirection: 'row',
    alignItems: 'center',
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
