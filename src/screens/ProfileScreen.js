import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, Alert } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useTheme } from '../hooks/useTheme';
import { spacing, typography, radius } from '../theme';
import Card from '../components/Card';
import Button from '../components/Button';
import Input from '../components/Input';
import { supabase } from '../services/supabase';
import { signOut } from '../services/auth';
import { calculateBMR, calculateTDEE, calculateAge, calculateMacros } from '../services/calculations';
import { useGeminiKey } from '../hooks/useGeminiKey';

const ACTIVITY = [
  { key: 'SEDENTARY', label: 'Sedentary (desk job, little exercise)' },
  { key: 'LIGHT',     label: 'Light (1–2 days/week)' },
  { key: 'MODERATE',  label: 'Moderate (3–5 days/week)' },
  { key: 'VERY',      label: 'Active (6–7 days/week)' },
  { key: 'EXTRA',     label: 'Very Active (2x daily or physical job)' },
];

const SEX = [
  { key: 'MALE',   label: 'Male' },
  { key: 'FEMALE', label: 'Female' },
];

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

function MetricTile({ value, label, sub }) {
  const { theme } = useTheme();
  return (
    <View style={[styles.tile, { backgroundColor: theme.accentBg, borderColor: theme.accentBorder }]}>
      <Text style={[styles.tileValue, { color: theme.accent }]}>{value}</Text>
      <Text style={[styles.tileLabel, { color: theme.textSecondary }]}>{label}</Text>
      {sub ? <Text style={[styles.tileSub, { color: theme.textMuted }]}>{sub}</Text> : null}
    </View>
  );
}

export default function ProfileScreen({ session, onTargetsChange }) {
  const { theme } = useTheme();
  const { key: geminiKey, hasKey, saveKey } = useGeminiKey();
  const [keyInput, setKeyInput] = useState('');
  const [form, setForm] = useState({
    name: '', weight_kg: '', height_cm: '', dob: '',
    gender: 'MALE', activity_level: 'MODERATE',
  });
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    if (!session?.user?.id) return;
    supabase.from('profiles').select('*').eq('id', session.user.id).single()
      .then(({ data }) => { if (data) setForm(f => ({ ...f, ...data })); });
  }, [session?.user?.id]);

  const set = (key) => (val) => { setSaved(false); setForm(f => ({ ...f, [key]: val })); };

  const computed = (() => {
    const age = calculateAge(form.dob);
    const bmr = calculateBMR(parseFloat(form.weight_kg), parseFloat(form.height_cm), age, form.gender);
    const tdee = calculateTDEE(bmr, form.activity_level);
    if (!tdee) return null;
    const bmi = form.weight_kg && form.height_cm
      ? (parseFloat(form.weight_kg) / Math.pow(parseFloat(form.height_cm) / 100, 2)).toFixed(1)
      : null;
    return { tdee, macros: calculateMacros(tdee), bmi };
  })();

  const save = async () => {
    setSaving(true);
    try {
      const { error } = await supabase.from('profiles').upsert({
        id: session.user.id,
        name: form.name,
        weight_kg: parseFloat(form.weight_kg) || null,
        height_cm: parseFloat(form.height_cm) || null,
        dob: form.dob || null,
        gender: form.gender,
        activity_level: form.activity_level,
        updated_at: new Date().toISOString(),
      });
      if (error) throw error;
      setSaved(true);
      onTargetsChange?.();
    } catch (e) {
      Alert.alert('Save failed', e.message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: theme.bg }}>
      <ScrollView contentContainerStyle={styles.container}>
        <Text style={[styles.title, { color: theme.accent }]}>Profile</Text>
        <Text style={[styles.email, { color: theme.textMuted }]}>{session?.user?.email}</Text>

        <Card style={styles.card}>
          <Text style={[styles.sectionLabel, { color: theme.textMuted }]}>PERSONAL</Text>
          <Input label="Display name" placeholder="Your name" value={String(form.name ?? '')} onChangeText={set('name')} />
          <View style={styles.row}>
            <View style={{ flex: 1 }}>
              <Input label="Weight (kg)" placeholder="75" keyboardType="decimal-pad" value={String(form.weight_kg ?? '')} onChangeText={set('weight_kg')} />
            </View>
            <View style={{ flex: 1 }}>
              <Input label="Height (cm)" placeholder="175" keyboardType="decimal-pad" value={String(form.height_cm ?? '')} onChangeText={set('height_cm')} />
            </View>
          </View>
          <Input label="Date of birth (YYYY-MM-DD)" placeholder="1990-01-15" value={String(form.dob ?? '')} onChangeText={set('dob')} />
        </Card>

        <Card style={styles.card}>
          <Text style={[styles.sectionLabel, { color: theme.textMuted }]}>BIOLOGICAL SEX</Text>
          <PillRow options={SEX} value={form.gender} onSelect={set('gender')} />
        </Card>

        <Card style={styles.card}>
          <Text style={[styles.sectionLabel, { color: theme.textMuted }]}>ACTIVITY LEVEL</Text>
          <PillRow options={ACTIVITY} value={form.activity_level} onSelect={set('activity_level')} />
        </Card>

        {computed && (
          <Card style={styles.card}>
            <Text style={[styles.sectionLabel, { color: theme.textMuted }]}>CALCULATED METRICS</Text>
            <View style={styles.tiles}>
              {computed.bmi && <MetricTile value={computed.bmi} label="BMI" />}
              <MetricTile value={`${computed.tdee} kcal`} label="Est. daily need" />
            </View>
            <Text style={[styles.macroLine, { color: theme.textSecondary }]}>
              Protein {computed.macros.protein}g · Carbs {computed.macros.carbs}g · Fat {computed.macros.fat}g
            </Text>
          </Card>
        )}

        <Button
          title={saved ? 'Saved ✓' : 'Save Profile'}
          loading={saving}
          onPress={save}
          style={{ marginTop: spacing[2] }}
        />

        <Card style={[styles.card, { marginTop: spacing[4] }]}>
          <Text style={[styles.sectionLabel, { color: theme.textMuted }]}>AI SETTINGS</Text>
          <Text style={[styles.aiNote, { color: theme.textSecondary }]}>
            Paste your Gemini API key to enable AI meal logging. The key is stored only on this device — never synced to the cloud.
          </Text>
          {hasKey ? (
            <View style={styles.row}>
              <View style={[styles.keySet, { backgroundColor: theme.accentBg, borderColor: theme.accentBorder }]}>
                <Text style={[styles.keySetText, { color: theme.accent }]}>✓ Gemini key saved</Text>
              </View>
              <Button title="Remove" variant="ghost" size="sm" onPress={() => saveKey('')} />
            </View>
          ) : (
            <View style={styles.row}>
              <View style={{ flex: 1 }}>
                <Input
                  label=""
                  placeholder="AIza…"
                  value={keyInput}
                  onChangeText={setKeyInput}
                  autoCorrect={false}
                  autoCapitalize="none"
                />
              </View>
              <Button
                title="Save"
                size="sm"
                onPress={() => { saveKey(keyInput); setKeyInput(''); }}
                style={{ marginTop: spacing[1] }}
              />
            </View>
          )}
        </Card>

        <Button
          title="Sign out"
          variant="ghost"
          onPress={() => signOut().catch(e => Alert.alert('Error', e.message))}
          style={{ marginTop: spacing[5] }}
        />
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { padding: spacing[5], paddingBottom: spacing[12] },
  title: { fontSize: typography.sizes['2xl'], fontWeight: typography.weights.bold },
  email: { fontSize: typography.sizes.sm, marginTop: spacing[1], marginBottom: spacing[5] },
  card: { gap: spacing[3], marginBottom: spacing[4] },
  sectionLabel: { fontSize: typography.sizes.xs, fontWeight: typography.weights.semibold, letterSpacing: 0.8 },
  row: { flexDirection: 'row', gap: spacing[3] },
  pillRow: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing[2] },
  pill: { paddingHorizontal: spacing[3], paddingVertical: spacing[2], borderRadius: radius.full, borderWidth: 1 },
  pillText: { fontSize: typography.sizes.sm, fontWeight: typography.weights.medium },
  tiles: { flexDirection: 'row', gap: spacing[3] },
  tile: { flex: 1, borderRadius: radius.md, borderWidth: 1, padding: spacing[4], alignItems: 'center' },
  tileValue: { fontSize: typography.sizes.xl, fontWeight: typography.weights.bold },
  tileLabel: { fontSize: typography.sizes.xs, marginTop: 2, textAlign: 'center' },
  tileSub: { fontSize: 10, marginTop: 2, textAlign: 'center' },
  macroLine: { fontSize: typography.sizes.sm, textAlign: 'center' },
  aiNote: { fontSize: typography.sizes.sm, lineHeight: 18 },
  keySet: { flex: 1, borderRadius: radius.md, borderWidth: 1, padding: spacing[3], justifyContent: 'center' },
  keySetText: { fontSize: typography.sizes.sm, fontWeight: typography.weights.semibold },
});
