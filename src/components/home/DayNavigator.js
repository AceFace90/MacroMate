import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { fontFamily } from '../../theme';
import Icon from '../Icon';

// The screen title already says Today / the weekday, so the stepper shows the calendar date.
const dateText = (d) =>
  new Date(d + 'T12:00:00').toLocaleDateString('en-AU', { weekday: 'short', day: 'numeric', month: 'short' });

// iOS-style day stepper: chevron buttons either side of the date label.
export default function DayNavigator({ viewDate, isToday, onPrev, onNext, theme }) {
  return (
    <View style={styles.dayNav}>
      <TouchableOpacity onPress={onPrev} style={[styles.btn, { backgroundColor: theme.card }]} accessibilityLabel="Previous day" accessibilityRole="button">
        <Icon name="chevronLeft" size={18} color={theme.accent} />
      </TouchableOpacity>
      <Text style={[styles.label, { color: theme.text, fontFamily }]}>{dateText(viewDate)}</Text>
      <TouchableOpacity
        onPress={onNext}
        disabled={isToday}
        style={[styles.btn, { backgroundColor: theme.card, opacity: isToday ? 0.4 : 1 }]}
        accessibilityLabel="Next day"
        accessibilityRole="button"
      >
        <Icon name="chevronRight" size={18} color={isToday ? theme.textMuted : theme.accent} />
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  dayNav: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12, marginBottom: 16 },
  btn: { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center' },
  label: { flex: 1, textAlign: 'center', fontSize: 17, fontWeight: '600' },
});
