import React, { useState, useMemo } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, useWindowDimensions } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLog, sumEntries } from '../store/logStore';
import { useTheme } from '../hooks/useTheme';
import { colors, fontFamily, breakpoints } from '../theme';
import Icon from '../components/Icon';

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

function Card({ children, theme, style }) {
  return <View style={[styles.card, { backgroundColor: theme.card }, style]}>{children}</View>;
}

function Segmented({ range, onChange, theme, isDark }) {
  return (
    <View style={[styles.seg, { backgroundColor: theme.fill }]} accessibilityRole="tablist">
      {RANGES.map((n) => {
        const active = n === range;
        return (
          <TouchableOpacity
            key={n}
            accessibilityRole="tab"
            accessibilityState={{ selected: active }}
            accessibilityLabel={`${n} days`}
            style={[styles.segBtn, active && styles.segBtnActive, active && { backgroundColor: isDark ? '#636366' : '#fff' }]}
            onPress={() => onChange(n)}
            activeOpacity={0.8}
          >
            <Text style={[styles.segText, { color: theme.text, fontWeight: active ? '600' : '400' }]}>
              {n} days
            </Text>
          </TouchableOpacity>
        );
      })}
    </View>
  );
}

function Chip({ title, value, icon, iconColor, theme, width }) {
  return (
    <View style={[styles.chip, { backgroundColor: theme.card, width }]}>
      <Icon name={icon} size={22} color={iconColor} />
      <Text style={[styles.chipTitle, { color: theme.textSecondary }]}>{title}</Text>
      <Text style={[styles.chipValue, { color: theme.text }]}>{value}</Text>
    </View>
  );
}

function MacroRow({ label, value, goal, color, theme }) {
  const pct = goal > 0 ? Math.min(value / goal, 1) : 0;
  const pctText = goal > 0 ? Math.round((value / goal) * 100) : 0;
  return (
    <View style={styles.macroRow}>
      <View style={styles.macroHead}>
        <Text style={[styles.macroLabel, { color: theme.text }]}>{label}</Text>
        <Text style={[styles.macroVal, { color: theme.textSecondary }]}>
          <Text style={{ color, fontWeight: '600' }}>{value} g</Text>
          {`  ${pctText}% of ${goal} g`}
        </Text>
      </View>
      <View style={[styles.track, { backgroundColor: theme.fill }]}>
        <View style={{ width: `${pct * 100}%`, height: 8, borderRadius: 4, backgroundColor: color }} />
      </View>
    </View>
  );
}

// Daily-calorie bars with dashed target line and hairline gridlines.
function CalorieTrend({ perDay, goal, theme }) {
  const maxCal = Math.max(goal, ...perDay.map((d) => d.totals.calories), 1);
  const first = perDay[0]?.label;
  const last = perDay[perDay.length - 1]?.label;
  const targetPct = goal > 0 ? (goal / maxCal) * 100 : null;
  return (
    <View>
      <View style={styles.trendChart}>
        {[0, 50, 100].map((p) => (
          <View key={p} pointerEvents="none" style={[styles.grid, { bottom: `${p}%`, backgroundColor: theme.separator }]} />
        ))}
        <View style={styles.trendBars}>
          {perDay.map((d) => {
            const cal = d.totals.calories;
            const pct = cal > 0 ? Math.max(cal / maxCal, 0.02) : 0;
            return (
              <View key={d.dateStr} style={styles.trendCol}>
                <View
                  style={{
                    width: '100%',
                    height: `${pct * 100}%`,
                    borderTopLeftRadius: 3,
                    borderTopRightRadius: 3,
                    backgroundColor: theme.accent,
                  }}
                />
              </View>
            );
          })}
        </View>
        {targetPct != null && (
          <View
            pointerEvents="none"
            style={[styles.targetLine, { bottom: `${targetPct}%`, borderTopColor: theme.textSecondary }]}
          />
        )}
      </View>
      <View style={styles.trendAxis}>
        <Text style={[styles.axisLabel, { color: theme.textSecondary }]}>{first}</Text>
        <Text style={[styles.axisLabel, { color: theme.textSecondary }]}>
          {`Target ${goal.toLocaleString()} kcal`}
        </Text>
        <Text style={[styles.axisLabel, { color: theme.textSecondary }]}>{last}</Text>
      </View>
    </View>
  );
}

// ─── Main Screen ─────────────────────────────────────────────────────────────

export default function ProgressScreen() {
  const { theme, isDark } = useTheme();
  const { logs, targets } = useLog();
  const { width } = useWindowDimensions();
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

  // Display-only: consecutive logged days ending today (or yesterday), within range.
  const streak = useMemo(() => {
    let n = 0;
    for (let i = perDay.length - 1; i >= 0; i--) {
      if (perDay[i].totals.calories > 0) n++;
      else if (i === perDay.length - 1) continue;
      else break;
    }
    return n;
  }, [perDay]);

  const pct = (val, goal) => (goal > 0 ? Math.round((val / goal) * 100) : 0);
  const wide = width >= breakpoints.tablet;
  const bottomPad = width < breakpoints.desktop ? 96 : 32;
  const contentW = Math.min(width, 720) - 40;
  const chipW = wide ? (contentW - 30) / 4 : (contentW - 10) / 2;

  const narrative =
    loggedCount > 0
      ? `Averaging ${avg.calories.toLocaleString()} kcal over ${range} days`
      : `No meals logged in the last ${range} days`;

  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: theme.bg }]} edges={['top']}>
      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={[styles.container, { paddingBottom: bottomPad }]}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.header}>
          <Text style={[styles.title, { color: theme.text }]} accessibilityRole="header">Trends</Text>
          <Text style={[styles.narrative, { color: theme.textSecondary }]}>{narrative}</Text>
        </View>

        <Segmented range={range} onChange={setRange} theme={theme} isDark={isDark} />

        {loggedCount === 0 ? (
          <View style={styles.empty}>
            <Icon name="chart" size={44} color={theme.textSecondary} />
            <Text style={[styles.emptyTitle, { color: theme.text }]}>No data yet</Text>
            <Text style={[styles.emptyText, { color: theme.textSecondary }]}>
              Log some food and your trends will show up here for the last {range} days.
            </Text>
          </View>
        ) : (
          <>
            <View style={styles.chips}>
              <Chip theme={theme} width={chipW} title="Avg calories" value={`${avg.calories.toLocaleString()} kcal`} icon="flame" iconColor={colors.calories} />
              <Chip theme={theme} width={chipW} title="Avg protein" value={`${avg.protein} g`} icon="drumstick" iconColor={colors.protein} />
              <Chip theme={theme} width={chipW} title="Days logged" value={`${loggedCount} of ${range}`} icon="check" iconColor={theme.accent} />
              <Chip theme={theme} width={chipW} title="Streak" value={`${streak} day${streak === 1 ? '' : 's'}`} icon="bolt" iconColor={colors.carbs} />
            </View>

            <Card theme={theme}>
              <Text style={[styles.cardTitle, { color: theme.text }]}>Calories</Text>
              <Text style={[styles.cardSub, { color: theme.textSecondary }]}>
                {`${pct(avg.calories, targets.calories)}% of your ${targets.calories.toLocaleString()} kcal target, across ${loggedCount} logged day${loggedCount !== 1 ? 's' : ''}`}
              </Text>
              <CalorieTrend perDay={perDay} goal={targets.calories} theme={theme} />
            </Card>

            <Card theme={theme}>
              <Text style={[styles.cardTitle, { color: theme.text }]}>Macro averages</Text>
              <Text style={[styles.cardSub, { color: theme.textSecondary }]}>Per logged day versus your targets</Text>
              <MacroRow label="Protein" value={avg.protein} goal={targets.protein} color={colors.protein} theme={theme} />
              <MacroRow label="Carbs" value={avg.carbs} goal={targets.carbs} color={colors.carbs} theme={theme} />
              <MacroRow label="Fat" value={avg.fat} goal={targets.fat} color={colors.fat} theme={theme} />
            </Card>
          </>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  safe: { flex: 1 },
  container: {
    alignSelf: 'center',
    width: '100%',
    maxWidth: 720,
    paddingHorizontal: 20,
    paddingTop: 12,
    gap: 16,
  },
  header: { gap: 4 },
  title: { fontFamily, fontSize: 34, fontWeight: '700' },
  narrative: { fontFamily, fontSize: 17 },

  seg: { flexDirection: 'row', borderRadius: 9, padding: 2 },
  segBtn: { flex: 1, alignItems: 'center', justifyContent: 'center', height: 32, borderRadius: 7 },
  segBtnActive: { shadowColor: '#000', shadowOpacity: 0.12, shadowRadius: 3, shadowOffset: { width: 0, height: 1 } },
  segText: { fontFamily, fontSize: 13 },

  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  chip: { borderRadius: 18, padding: 14, gap: 4 },
  chipTitle: { fontFamily, fontSize: 13, marginTop: 4 },
  chipValue: { fontFamily, fontSize: 20, fontWeight: '700' },

  card: { borderRadius: 26, padding: 18, gap: 12 },
  cardTitle: { fontFamily, fontSize: 20, fontWeight: '700' },
  cardSub: { fontFamily, fontSize: 13, marginTop: -6 },

  trendChart: { height: 140, marginTop: 4 },
  grid: { position: 'absolute', left: 0, right: 0, height: StyleSheet.hairlineWidth },
  trendBars: { flex: 1, flexDirection: 'row', alignItems: 'flex-end', gap: 2 },
  trendCol: { flex: 1, height: '100%', justifyContent: 'flex-end' },
  targetLine: {
    position: 'absolute',
    left: 0,
    right: 0,
    height: 0,
    borderTopWidth: 1.5,
    borderStyle: 'dashed',
  },
  trendAxis: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 8 },
  axisLabel: { fontFamily, fontSize: 12 },

  macroRow: { gap: 6 },
  macroHead: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline' },
  macroLabel: { fontFamily, fontSize: 17, fontWeight: '600' },
  macroVal: { fontFamily, fontSize: 13 },
  track: { height: 8, borderRadius: 4, overflow: 'hidden' },

  empty: { alignItems: 'center', paddingTop: 40, gap: 8 },
  emptyTitle: { fontFamily, fontSize: 20, fontWeight: '700' },
  emptyText: { fontFamily, fontSize: 15, textAlign: 'center' },
});
