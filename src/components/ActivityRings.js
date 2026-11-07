import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import Svg, { Circle, G } from 'react-native-svg';
import { useTheme } from '../hooks/useTheme';
import { typography, fontFamily } from '../theme';

// Concentric progress rings. rings = [{ label, value, goal, color, unit }] outer → inner.
// Tracks use theme.fill; macro chips (SummaryChip style) sit beneath.
export default function ActivityRings({ rings, size = 180, stroke = 16, gap = 5, centerLabel, centerSub }) {
  const { theme } = useTheme();
  const center = size / 2;
  const outerR = center - stroke / 2;

  return (
    <View style={styles.wrap}>
      <View>
        <Svg width={size} height={size}>
          <G rotation="-90" origin={`${center}, ${center}`}>
            {rings.map((r, i) => {
              const radius = outerR - i * (stroke + gap);
              if (radius <= 0) return null;
              const circ = 2 * Math.PI * radius;
              const pct = Math.min(1, (r.value || 0) / (r.goal || 1));
              return (
                <G key={r.label}>
                  <Circle cx={center} cy={center} r={radius} stroke={theme.fill} strokeWidth={stroke} fill="none" />
                  {pct > 0 && (
                    <Circle
                      cx={center} cy={center} r={radius}
                      stroke={r.color} strokeWidth={stroke} fill="none"
                      strokeLinecap="round"
                      strokeDasharray={circ}
                      strokeDashoffset={circ * (1 - pct)}
                    />
                  )}
                </G>
              );
            })}
          </G>
        </Svg>
        {centerLabel != null && (
          <View style={[styles.center, { width: size, height: size }]} pointerEvents="none">
            <Text style={[styles.centerLabel, { color: theme.text, fontFamily }]}>{centerLabel}</Text>
            {centerSub != null && (
              <Text style={[styles.centerSub, { color: theme.textSecondary, fontFamily }]}>{centerSub}</Text>
            )}
          </View>
        )}
      </View>

      <View style={styles.chips}>
        {rings.map((r) => (
          <View key={r.label} style={[styles.chip, { backgroundColor: theme.fill }]}>
            <View style={[styles.dot, { backgroundColor: r.color }]} />
            <View style={{ flexShrink: 1 }}>
              <Text style={[styles.label, { color: theme.textSecondary, fontFamily }]} numberOfLines={1}>{r.label}</Text>
              <Text style={[styles.value, { color: theme.text, fontFamily }]} numberOfLines={1}>
                {`${r.value}${r.unit ?? 'g'}`}
                <Text style={[styles.sub, { color: theme.textSecondary }]}>{` / ${r.goal}${r.unit ?? 'g'}`}</Text>
              </Text>
            </View>
          </View>
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { alignItems: 'center', alignSelf: 'stretch', gap: 16 },
  center: { position: 'absolute', top: 0, left: 0, justifyContent: 'center', alignItems: 'center' },
  centerLabel: { fontSize: 34, fontWeight: typography.weights.bold },
  centerSub: { fontSize: 13, marginTop: 0 },
  chips: { flexDirection: 'row', gap: 8, alignSelf: 'stretch' },
  chip: { flex: 1, minWidth: 0, flexDirection: 'row', alignItems: 'center', gap: 6, paddingVertical: 8, paddingHorizontal: 10, borderRadius: 12 },
  dot: { width: 8, height: 8, borderRadius: 99 },
  label: { fontSize: 11 },
  value: { fontSize: 14, fontWeight: '600' },
  sub: { fontSize: 11, fontWeight: '400' },
});
