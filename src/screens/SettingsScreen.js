import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useTheme } from '../hooks/useTheme';
import { useGeminiKey } from '../hooks/useGeminiKey';
import { signOut } from '../services/auth';
import { spacing, typography, radius } from '../theme';
import Card from '../components/Card';
import Button from '../components/Button';
import Input from '../components/Input';

const UNITS_KEY = 'macromate_units';

function PillRow({ options, value, onSelect }) {
  const { theme } = useTheme();
  return (
    <View style={styles.pillRow}>
      {options.map((o) => {
        const active = value === o.key;
        return (
          <TouchableOpacity
            key={o.key}
            onPress={() => onSelect(o.key)}
            style={[
              styles.pill,
              { borderColor: theme.border },
              active && { borderColor: theme.accent, backgroundColor: theme.accentBg },
            ]}
            activeOpacity={0.7}
          >
            <Text style={[styles.pillText, { color: active ? theme.accent : theme.textSecondary }]}>
              {o.label}
            </Text>
          </TouchableOpacity>
        );
      })}
    </View>
  );
}

const THEME_OPTIONS = [
  { key: 'system', label: 'System' },
  { key: 'light',  label: 'Light' },
  { key: 'dark',   label: 'Dark' },
];

const UNITS_OPTIONS = [
  { key: 'metric',   label: 'Metric (kg, cm)' },
  { key: 'imperial', label: 'Imperial (lbs, ft/in)' },
];

export default function SettingsScreen() {
  const { theme, preference, setTheme } = useTheme();
  const { hasKey, saveKey } = useGeminiKey();
  const [keyInput, setKeyInput] = useState('');
  const [units, setUnitsState] = useState('metric');

  // Load saved units preference on mount
  useEffect(() => {
    AsyncStorage.getItem(UNITS_KEY).then((val) => {
      if (val) setUnitsState(val);
    });
  }, []);

  const handleUnitsSelect = async (val) => {
    setUnitsState(val);
    await AsyncStorage.setItem(UNITS_KEY, val);
  };

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: theme.bg }}>
      <ScrollView contentContainerStyle={styles.container}>
        {/* APPEARANCE */}
        <Card style={styles.card}>
          <Text style={[styles.sectionLabel, { color: theme.textMuted }]}>APPEARANCE</Text>
          <Text style={[styles.rowLabel, { color: theme.text }]}>Theme</Text>
          <PillRow options={THEME_OPTIONS} value={preference} onSelect={setTheme} />
        </Card>

        {/* UNITS */}
        <Card style={styles.card}>
          <Text style={[styles.sectionLabel, { color: theme.textMuted }]}>UNITS</Text>
          <PillRow options={UNITS_OPTIONS} value={units} onSelect={handleUnitsSelect} />
        </Card>

        {/* AI FEATURES */}
        <Card style={styles.card}>
          <Text style={[styles.sectionLabel, { color: theme.textMuted }]}>AI FEATURES</Text>
          <Text style={[styles.rowLabel, { color: theme.text }]}>🤖 Gemini API Key</Text>
          <Text style={[styles.aiNote, { color: theme.textSecondary }]}>
            Paste your own Gemini API key to enable AI meal logging and label scanning. Stored only on this device — never synced.
          </Text>
          {hasKey ? (
            <View style={styles.row}>
              <View style={[styles.keySet, { backgroundColor: theme.accentBg, borderColor: theme.accentBorder }]}>
                <Text style={[styles.keySetText, { color: theme.accent }]}>✓ Gemini key saved</Text>
              </View>
              <Button title="Remove" variant="ghost" size="sm" onPress={() => saveKey('')} />
            </View>
          ) : (
            <>
              <Input
                label=""
                placeholder="AIza…"
                value={keyInput}
                onChangeText={setKeyInput}
                autoCorrect={false}
                autoCapitalize="none"
              />
              <Button
                title="Save Key"
                onPress={() => { saveKey(keyInput); setKeyInput(''); }}
              />
            </>
          )}
        </Card>

        {/* ABOUT */}
        <Card style={styles.card}>
          <Text style={[styles.sectionLabel, { color: theme.textMuted }]}>ABOUT</Text>
          <View style={styles.aboutRow}>
            <Text style={[styles.aboutLabel, { color: theme.text }]}>Version</Text>
            <Text style={[styles.aboutValue, { color: theme.textMuted }]}>2.0.0</Text>
          </View>
          <View style={styles.aboutRow}>
            <Text style={[styles.aboutLabel, { color: theme.text }]}>Food Database</Text>
            <Text style={[styles.aboutValue, { color: theme.textMuted }]}>AFCD + OpenNutrition + Open Food Facts</Text>
          </View>
          <View style={styles.aboutRow}>
            <Text style={[styles.aboutLabel, { color: theme.text }]}>Companion App</Text>
            <Text style={[styles.aboutValue, { color: theme.textMuted }]}>GymMate</Text>
          </View>
        </Card>

        {/* DATA SOURCES */}
        <Card style={styles.card}>
          <Text style={[styles.sectionLabel, { color: theme.textMuted }]}>DATA SOURCES</Text>
          <Text style={[styles.aiNote, { color: theme.textMuted }]}>
            Food data sourced from the{' '}
            <Text style={{ fontWeight: '600' }}>USDA FoodData Central</Text> (public domain),{' '}
            <Text style={{ fontWeight: '600' }}>Open Food Facts</Text> (CC BY-SA 4.0),
            and the <Text style={{ fontWeight: '600' }}>Australian AFCD</Text>.
            Nutritional values are estimates.
          </Text>
        </Card>

        {/* SIGN OUT */}
        <Button
          title="Sign out"
          variant="ghost"
          onPress={() => signOut()}
          style={{ marginTop: spacing[3] }}
        />
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container:    { padding: spacing[5], paddingBottom: spacing[12] },
  card:         { gap: spacing[3], marginBottom: spacing[4] },
  sectionLabel: { fontSize: typography.sizes.xs, fontWeight: '600', letterSpacing: 0.8 },
  rowLabel:     { fontSize: typography.sizes.base, fontWeight: typography.weights.medium },
  pillRow:      { flexDirection: 'row', flexWrap: 'wrap', gap: spacing[2] },
  pill:         { paddingHorizontal: spacing[3], paddingVertical: spacing[2], borderRadius: radius.full, borderWidth: 1 },
  pillText:     { fontSize: typography.sizes.sm, fontWeight: typography.weights.medium },
  row:          { flexDirection: 'row', gap: spacing[3] },
  aiNote:       { fontSize: typography.sizes.sm, lineHeight: 18 },
  keySet:       { flex: 1, borderRadius: radius.md, borderWidth: 1, padding: spacing[3], justifyContent: 'center' },
  keySetText:   { fontSize: typography.sizes.sm, fontWeight: typography.weights.semibold },
  aboutRow:     { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', gap: spacing[3] },
  aboutLabel:   { fontSize: typography.sizes.sm, fontWeight: typography.weights.medium },
  aboutValue:   { fontSize: typography.sizes.sm, textAlign: 'right', flex: 1 },
});
