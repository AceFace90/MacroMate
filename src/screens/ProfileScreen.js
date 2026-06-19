import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, Alert } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useTheme } from '../hooks/useTheme';
import { spacing, typography, radius, colors } from '../theme';
import Card from '../components/Card';
import Button from '../components/Button';
import Input from '../components/Input';
import { supabase } from '../services/supabase';
import { signOut } from '../services/auth';
import { calculateBMR, calculateTDEE, calculateAge, calculateMacros, calculateMacrosFromProtein } from '../services/calculations';
import { useGeminiKey } from '../hooks/useGeminiKey';
import { getCountryOptions } from '../services/countryConfig';

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

const GOAL_TYPES = [
  { key: 'WEIGHT_LOSS',  label: 'Weight Loss' },
  { key: 'MAINTENANCE',  label: 'Maintenance' },
  { key: 'MUSCLE_GAIN',  label: 'Muscle Gain' },
];

const WEIGHT_LOSS_DEFICITS = [
  { key: '300', label: 'Mild (-300 cal)' },
  { key: '500', label: 'Moderate (-500 cal)' },
  { key: '750', label: 'Aggressive (-750 cal)' },
];

const MUSCLE_GAIN_SURPLUSES = [
  { key: '200', label: 'Lean (+200 cal)' },
  { key: '350', label: 'Moderate (+350 cal)' },
];

const CARBS_FAT_SPLITS = [
  { key: '60/40', label: '60% Carbs / 40% Fat' },
  { key: '50/50', label: '50% Carbs / 50% Fat (Balanced)' },
  { key: '40/60', label: '40% Carbs / 60% Fat (Keto-ish)' },
];

const COUNTRY_OPTIONS = getCountryOptions();

function PillRow({ options, value, onSelect }) {
  const { theme } = useTheme();
  return (
    <View style={styles.pillRow}>
      {options.map((o) => {
        const active = value === (o.key ?? o.value);
        const key = o.key ?? o.value;
        return (
          <TouchableOpacity
            key={key}
            onPress={() => onSelect(key)}
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

function MetricTile({ value, label, sub, color }) {
  const { theme } = useTheme();
  const tileColor = color || theme.accent;
  const tileBg = color
    ? `${color}1a`
    : theme.accentBg;
  const tileBorder = color
    ? `${color}4d`
    : theme.accentBorder;
  return (
    <View style={[styles.tile, { backgroundColor: tileBg, borderColor: tileBorder }]}>
      <Text style={[styles.tileValue, { color: tileColor }]}>{value}</Text>
      <Text style={[styles.tileLabel, { color: theme.textSecondary }]}>{label}</Text>
      {sub ? <Text style={[styles.tileSub, { color: theme.textMuted }]}>{sub}</Text> : null}
    </View>
  );
}

export default function ProfileScreen({ session, onTargetsChange, navigation }) {
  const { theme } = useTheme();
  const { key: geminiKey, hasKey, saveKey } = useGeminiKey();
  const [keyInput, setKeyInput] = useState('');
  const [form, setForm] = useState({
    name: '',
    weight_kg: '',
    height_cm: '',
    dob: '',
    gender: 'MALE',
    activity_level: 'MODERATE',
    country: 'AU',
    goal_type: 'WEIGHT_LOSS',
    calorie_deficit: '500',
    protein_per_kg: '2.0',
    carbs_fat_split: '50/50',
  });
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    if (!session?.user?.id) return;
    supabase.from('profiles').select('*').eq('id', session.user.id).single()
      .then(({ data }) => {
        if (data) {
          setForm(f => ({
            ...f,
            ...data,
            // Ensure new fields fall back to defaults if not yet persisted
            country: data.country || 'AU',
            goal_type: data.goal_type || 'WEIGHT_LOSS',
            calorie_deficit: data.calorie_deficit ? String(data.calorie_deficit) : '500',
            protein_per_kg: data.protein_per_kg ? String(data.protein_per_kg) : '2.0',
            carbs_fat_split: data.carbs_fat_split || '50/50',
          }));
        }
      });
  }, [session?.user?.id]);

  const set = (key) => (val) => { setSaved(false); setForm(f => ({ ...f, [key]: val })); };

  // Computed baseline metrics (BMI, TDEE)
  const baseComputed = (() => {
    const age = calculateAge(form.dob);
    const bmr = calculateBMR(parseFloat(form.weight_kg), parseFloat(form.height_cm), age, form.gender);
    const tdee = calculateTDEE(bmr, form.activity_level);
    if (!tdee) return null;
    const bmi = form.weight_kg && form.height_cm
      ? (parseFloat(form.weight_kg) / Math.pow(parseFloat(form.height_cm) / 100, 2)).toFixed(1)
      : null;
    return { tdee, bmi };
  })();

  // Computed goal targets (adjusted calories + protein-first macros)
  const goalComputed = (() => {
    if (!baseComputed) return null;
    const { tdee } = baseComputed;
    const weight = parseFloat(form.weight_kg);
    const proteinPerKg = parseFloat(form.protein_per_kg || '2.0');
    if (!weight || !proteinPerKg) return null;

    let adjustment = 0;
    if (form.goal_type === 'WEIGHT_LOSS') {
      adjustment = -parseInt(form.calorie_deficit || '500', 10);
    } else if (form.goal_type === 'MUSCLE_GAIN') {
      adjustment = parseInt(form.calorie_deficit || '200', 10);
    }
    const adjustedCalories = tdee + adjustment;
    const macros = calculateMacrosFromProtein(
      proteinPerKg,
      weight,
      adjustedCalories,
      form.carbs_fat_split || '50/50'
    );
    return { adjustedCalories, macros };
  })();

  // Label for goal type header (e.g. "Weight Loss (Calorie Deficit)")
  const goalLabel = (() => {
    if (form.goal_type === 'WEIGHT_LOSS') return 'Weight Loss (Calorie Deficit)';
    if (form.goal_type === 'MUSCLE_GAIN') return 'Muscle Gain (Calorie Surplus)';
    return 'Maintenance';
  })();

  // Selected country description
  const selectedCountry = COUNTRY_OPTIONS.find(c => (c.value ?? c.key) === form.country);

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
        country: form.country,
        goal_type: form.goal_type,
        calorie_deficit: parseInt(form.calorie_deficit, 10) || null,
        protein_per_kg: parseFloat(form.protein_per_kg) || null,
        carbs_fat_split: form.carbs_fat_split,
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
        <View style={styles.profileHeader}>
          <View>
            <Text style={[styles.title, { color: theme.accent }]}>Profile</Text>
            <Text style={[styles.email, { color: theme.textMuted }]}>{session?.user?.email}</Text>
          </View>
          <TouchableOpacity
            onPress={() => navigation.navigate('Settings')}
            hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
          >
            <Text style={[styles.gearIcon, { color: theme.accent }]}>⚙️</Text>
          </TouchableOpacity>
        </View>

        {/* ── Current Goals card ── */}
        {goalComputed && (
          <Card style={styles.card}>
            <View style={styles.cardHeader}>
              <Text style={[styles.sectionLabel, { color: theme.textMuted }]}>CURRENT GOALS</Text>
              <Text style={[styles.goalTypeLabel, { color: theme.accent }]}>{goalLabel}</Text>
            </View>

            {/* Big calorie number */}
            <View style={styles.calorieRow}>
              <Text style={[styles.calorieValue, { color: theme.accent }]}>
                {goalComputed.adjustedCalories}
              </Text>
              <View style={styles.calorieSubs}>
                <Text style={[styles.calorieUnit, { color: theme.textSecondary }]}>kcal/day</Text>
                <Text style={[styles.proteinSub, { color: colors.protein }]}>
                  {form.protein_per_kg}g/kg body weight protein
                </Text>
              </View>
            </View>

            {/* Three macro tiles */}
            <View style={styles.tiles}>
              <MetricTile
                value={`${goalComputed.macros.protein}g`}
                label="Protein"
                color={colors.protein}
              />
              <MetricTile
                value={`${goalComputed.macros.carbs}g`}
                label="Carbs"
                color={colors.carbs}
              />
              <MetricTile
                value={`${goalComputed.macros.fat}g`}
                label="Fat"
                color={colors.fat}
              />
            </View>

            <Text style={[styles.splitLine, { color: theme.textMuted }]}>
              Carbs/Fat Split: {form.carbs_fat_split}
            </Text>
          </Card>
        )}

        {/* ── Personal Stats card ── */}
        <Card style={styles.card}>
          <Text style={[styles.sectionLabel, { color: theme.textMuted }]}>PERSONAL</Text>
          <Input
            label="Display name"
            placeholder="Your name"
            value={String(form.name ?? '')}
            onChangeText={set('name')}
          />
          <View style={styles.row}>
            <View style={{ flex: 1 }}>
              <Input
                label="Weight (kg)"
                placeholder="75"
                keyboardType="decimal-pad"
                value={String(form.weight_kg ?? '')}
                onChangeText={set('weight_kg')}
              />
            </View>
            <View style={{ flex: 1 }}>
              <Input
                label="Height (cm)"
                placeholder="175"
                keyboardType="decimal-pad"
                value={String(form.height_cm ?? '')}
                onChangeText={set('height_cm')}
              />
            </View>
          </View>
          <Input
            label="Date of birth (YYYY-MM-DD)"
            placeholder="1990-01-15"
            value={String(form.dob ?? '')}
            onChangeText={set('dob')}
          />

          <Text style={[styles.fieldLabel, { color: theme.textSecondary }]}>Biological Sex</Text>
          <PillRow options={SEX} value={form.gender} onSelect={set('gender')} />

          <Text style={[styles.fieldLabel, { color: theme.textSecondary }]}>Activity Level</Text>
          <PillRow options={ACTIVITY} value={form.activity_level} onSelect={set('activity_level')} />

          <Text style={[styles.fieldLabel, { color: theme.textSecondary }]}>Country</Text>
          <PillRow options={COUNTRY_OPTIONS} value={form.country} onSelect={set('country')} />
          {selectedCountry && (
            <Text style={[styles.helperText, { color: theme.textMuted }]}>
              {selectedCountry.description}
            </Text>
          )}
        </Card>

        {/* ── Goal Settings card ── */}
        <Card style={styles.card}>
          <Text style={[styles.sectionLabel, { color: theme.textMuted }]}>GOAL SETTINGS</Text>

          <Text style={[styles.fieldLabel, { color: theme.textSecondary }]}>Goal Type</Text>
          <PillRow options={GOAL_TYPES} value={form.goal_type} onSelect={set('goal_type')} />

          {form.goal_type !== 'MAINTENANCE' && (
            <>
              <Text style={[styles.fieldLabel, { color: theme.textSecondary }]}>
                {form.goal_type === 'WEIGHT_LOSS' ? 'Calorie Deficit' : 'Calorie Surplus'}
              </Text>
              <PillRow
                options={form.goal_type === 'WEIGHT_LOSS' ? WEIGHT_LOSS_DEFICITS : MUSCLE_GAIN_SURPLUSES}
                value={form.calorie_deficit}
                onSelect={set('calorie_deficit')}
              />
              <Text style={[styles.helperText, { color: theme.textMuted }]}>
                {form.goal_type === 'WEIGHT_LOSS'
                  ? 'Recommended: 200–500 cal deficit to preserve muscle while losing fat'
                  : 'Lean bulk minimises fat gain'}
              </Text>
            </>
          )}

          <Text style={[styles.fieldLabel, { color: theme.textSecondary }]}>
            Protein Target (g/kg body weight)
          </Text>
          <Input
            label=""
            placeholder="2.0"
            keyboardType="decimal-pad"
            value={String(form.protein_per_kg ?? '')}
            onChangeText={set('protein_per_kg')}
          />
          <Text style={[styles.helperText, { color: theme.textMuted }]}>
            Recommended: 1.6–2.2 g/kg for muscle building.
            {form.weight_kg && form.protein_per_kg
              ? ` Current target: ${Math.round(parseFloat(form.protein_per_kg) * parseFloat(form.weight_kg))}g protein/day`
              : ''}
          </Text>

          <Text style={[styles.fieldLabel, { color: theme.textSecondary }]}>Carbs / Fat Split</Text>
          <PillRow options={CARBS_FAT_SPLITS} value={form.carbs_fat_split} onSelect={set('carbs_fat_split')} />
          <Text style={[styles.helperText, { color: theme.textMuted }]}>
            This determines how remaining calories (after protein) are split between carbs and fat
          </Text>
        </Card>

        {/* ── Calculated Metrics (BMI / TDEE baseline) ── */}
        {baseComputed && (
          <Card style={styles.card}>
            <Text style={[styles.sectionLabel, { color: theme.textMuted }]}>CALCULATED METRICS</Text>
            <View style={styles.tiles}>
              {baseComputed.bmi && (
                <MetricTile value={baseComputed.bmi} label="BMI" />
              )}
              <MetricTile value={`${baseComputed.tdee} kcal`} label="Est. daily need (TDEE)" />
            </View>
          </Card>
        )}

        <Button
          title={saved ? 'Saved ✓' : 'Save Profile'}
          loading={saving}
          onPress={save}
          style={{ marginTop: spacing[2] }}
        />

        {/* ── AI Settings card ── */}
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

        {/* ── Data Sources card ── */}
        <Card style={[styles.card, { marginTop: spacing[5] }]}>
          <Text style={[styles.sectionLabel, { color: theme.textMuted }]}>DATA SOURCES</Text>
          <Text style={[styles.aiNote, { color: theme.textMuted }]}>
            Food data sourced from the{' '}
            <Text style={{ fontWeight: '600' }}>USDA FoodData Central</Text> (public domain),{' '}
            <Text style={{ fontWeight: '600' }}>Open Food Facts</Text> (CC BY-SA 4.0),
            and the <Text style={{ fontWeight: '600' }}>Australian AFCD</Text>.
            Nutritional values are estimates and may not be accurate for all products.
          </Text>
        </Card>

        <Button
          title="Sign out"
          variant="ghost"
          onPress={() => signOut().catch(e => Alert.alert('Error', e.message))}
          style={{ marginTop: spacing[3] }}
        />
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { padding: spacing[5], paddingBottom: spacing[12] },
  profileHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: spacing[5] },
  title: { fontSize: typography.sizes['2xl'], fontWeight: typography.weights.bold },
  email: { fontSize: typography.sizes.sm, marginTop: spacing[1] },
  gearIcon: { fontSize: 26, marginTop: 4 },
  card: { gap: spacing[3], marginBottom: spacing[4] },
  sectionLabel: { fontSize: typography.sizes.xs, fontWeight: typography.weights.semibold, letterSpacing: 0.8 },
  cardHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  goalTypeLabel: { fontSize: typography.sizes.xs, fontWeight: typography.weights.semibold },
  calorieRow: { flexDirection: 'row', alignItems: 'center', gap: spacing[3] },
  calorieValue: { fontSize: 48, fontWeight: typography.weights.bold, lineHeight: 52 },
  calorieSubs: { flex: 1, gap: spacing[1] },
  calorieUnit: { fontSize: typography.sizes.base, fontWeight: typography.weights.medium },
  proteinSub: { fontSize: typography.sizes.sm },
  splitLine: { fontSize: typography.sizes.xs, textAlign: 'center', marginTop: spacing[1] },
  row: { flexDirection: 'row', gap: spacing[3] },
  fieldLabel: { fontSize: typography.sizes.sm, fontWeight: typography.weights.medium, marginTop: spacing[1] },
  helperText: { fontSize: typography.sizes.xs, lineHeight: 16, marginTop: -spacing[1] },
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
