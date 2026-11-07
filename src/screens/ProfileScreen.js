import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, Alert, Platform, TextInput, useWindowDimensions } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useTheme } from '../hooks/useTheme';
import { colors, fontFamily, breakpoints } from '../theme';
import Icon from '../components/Icon';
import { supabase } from '../services/supabase';
import { signOut } from '../services/auth';
import { calculateBMR, calculateTDEE, calculateAge, computeGoalTargets } from '../services/calculations';
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

function Segmented({ options, value, onSelect }) {
  const { theme } = useTheme();
  return (
    <View style={[styles.segTrack, { backgroundColor: theme.fill }]} accessibilityRole="radiogroup">
      {options.map((o) => {
        const key = o.key ?? o.value;
        const active = value === key;
        return (
          <TouchableOpacity
            key={key}
            onPress={() => onSelect(key)}
            activeOpacity={0.7}
            accessibilityRole="radio"
            accessibilityState={{ selected: active }}
            style={[styles.segItem, active && { backgroundColor: theme.isDark ? '#636366' : '#ffffff' }, active && styles.segActive]}
          >
            <Text style={[styles.segText, { color: theme.text, fontWeight: active ? '600' : '400', fontFamily }]} numberOfLines={1}>
              {o.short ?? o.label}
            </Text>
          </TouchableOpacity>
        );
      })}
    </View>
  );
}

function SectionHeader({ children }) {
  const { theme } = useTheme();
  return <Text style={[styles.sectionHeader, { color: theme.textSecondary, fontFamily }]}>{children}</Text>;
}

function SectionFooter({ children }) {
  const { theme } = useTheme();
  return <Text style={[styles.sectionFooter, { color: theme.textSecondary, fontFamily }]}>{children}</Text>;
}

function Group({ children }) {
  const { theme } = useTheme();
  const items = React.Children.toArray(children).filter(Boolean);
  return (
    <View style={[styles.group, { backgroundColor: theme.card }]}>
      {items.map((c, i) => (
        <View key={i}>
          {i > 0 && <View style={[styles.hairline, { backgroundColor: theme.separator }]} />}
          {c}
        </View>
      ))}
    </View>
  );
}

function Row({ label, children, stacked }) {
  const { theme } = useTheme();
  return (
    <View style={[styles.rowItem, stacked && styles.rowStacked]}>
      <Text style={[styles.rowLabel, { color: theme.text, fontFamily }]}>{label}</Text>
      <View style={stacked ? styles.rowStackedBody : styles.rowValue}>{children}</View>
    </View>
  );
}

function RowInput({ value, onChangeText, placeholder, keyboardType, label, testID }) {
  const { theme } = useTheme();
  return (
    <TextInput
      value={value}
      onChangeText={onChangeText}
      placeholder={placeholder}
      placeholderTextColor={theme.textMuted}
      keyboardType={keyboardType}
      accessibilityLabel={label}
      testID={testID}
      style={[styles.rowInput, { color: theme.text, fontFamily }, Platform.OS === 'web' && { outlineStyle: 'none' }]}
    />
  );
}

// iOS-style picker row: native <select> on web, segmented fallback on native.
function SelectRow({ label, options, value, onSelect }) {
  const { theme } = useTheme();
  if (Platform.OS !== 'web') {
    return (
      <Row label={label} stacked>
        <Segmented options={options} value={value} onSelect={onSelect} />
      </Row>
    );
  }
  return (
    <Row label={label}>
      <View style={styles.selectWrap}>
        <select
          aria-label={label}
          value={value}
          onChange={(e) => onSelect(e.target.value)}
          style={{
            appearance: 'none', WebkitAppearance: 'none', background: 'transparent', border: 'none', outline: 'none',
            color: theme.accent, fontSize: 17, textAlign: 'right', textAlignLast: 'right', cursor: 'pointer',
            maxWidth: 260, paddingRight: 4, fontFamily, colorScheme: theme.isDark ? 'dark' : 'light',
          }}
        >
          {options.map((o) => {
            const k = o.key ?? o.value;
            return <option key={k} value={k}>{o.label}</option>;
          })}
        </select>
        <Icon name="chevronDown" size={14} color={theme.textSecondary} />
      </View>
    </Row>
  );
}

function MacroStat({ value, label, color }) {
  const { theme } = useTheme();
  return (
    <View style={styles.macroStat}>
      <Text style={[styles.macroLabel, { color: theme.textSecondary, fontFamily }]}>{label}</Text>
      <Text style={[styles.macroValue, { color, fontFamily }]}>{value}</Text>
    </View>
  );
}

export default function ProfileScreen({ session, onTargetsChange, navigation }) {
  const { theme } = useTheme();
  const { width } = useWindowDimensions();
  const bottomPad = width < breakpoints.desktop ? 96 : 40;
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
      .then(({ data, error }) => {
        if (error && error.code !== 'PGRST116') {
          // PGRST116 = no rows found (new user), anything else is a real error
          console.warn('[ProfileScreen] load error:', error.message);
        }
        if (data) {
          setForm(f => ({
            ...f,
            // Only override with non-null DB values so defaults survive a partial row
            name: data.name ?? f.name,
            weight_kg: data.weight_kg != null ? String(data.weight_kg) : f.weight_kg,
            height_cm: data.height_cm != null ? String(data.height_cm) : f.height_cm,
            dob: data.dob ?? f.dob,
            gender: data.gender ?? f.gender,
            activity_level: data.activity_level ?? f.activity_level,
            country: data.country || f.country,
            goal_type: data.goal_type || f.goal_type,
            calorie_deficit: data.calorie_deficit ? String(data.calorie_deficit) : f.calorie_deficit,
            protein_per_kg: data.protein_per_kg ? String(data.protein_per_kg) : f.protein_per_kg,
            carbs_fat_split: data.carbs_fat_split || f.carbs_fat_split,
          }));
        }
      });
  }, [session?.user?.id]);

  const set = (key) => (val) => { setSaved(false); setForm(f => ({ ...f, [key]: val })); };

  // Goal type shares one calorie_deficit field between disjoint deficit/surplus
  // value sets, so reset it to the new goal's default whenever the type changes.
  const setGoalType = (val) => {
    setSaved(false);
    setForm(f => ({
      ...f,
      goal_type: val,
      calorie_deficit: val === 'WEIGHT_LOSS' ? '500' : val === 'MUSCLE_GAIN' ? '200' : f.calorie_deficit,
    }));
  };

  // Computed baseline metrics (BMI, TDEE)
  const baseComputed = (() => {
    const age = calculateAge(form.dob);
    const bmr = calculateBMR(parseFloat(form.weight_kg), parseFloat(form.height_cm), age, form.gender);
    const tdee = calculateTDEE(bmr, form.activity_level);
    if (!tdee) return null;
    const bmi = form.weight_kg && form.height_cm
      ? (parseFloat(form.weight_kg) / Math.pow(parseFloat(form.height_cm) / 100, 2)).toFixed(1)
      : null;
    return { tdee, bmi, bmr: Math.round(bmr) };
  })();

  // Computed goal targets (adjusted calories + protein-first macros).
  // Uses the shared computeGoalTargets so this card and the app-wide targets
  // (rings/progress) always match.
  const goalComputed = (() => {
    const t = computeGoalTargets(form);
    if (!t) return null;
    const weight = parseFloat(form.weight_kg);
    const proteinPerKg = parseFloat(form.protein_per_kg || '2.0');
    if (!weight || !proteinPerKg) return null;
    return {
      adjustedCalories: t.calories,
      macros: { protein: t.protein, carbs: t.carbs, fat: t.fat },
    };
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
      }, { onConflict: 'id' });
      if (error) throw error;
      setSaved(true);
      onTargetsChange?.();
    } catch (e) {
      Alert.alert('Save failed', e.message);
    } finally {
      setSaving(false);
    }
  };

  const deficitOptions = form.goal_type === 'WEIGHT_LOSS' ? WEIGHT_LOSS_DEFICITS : MUSCLE_GAIN_SURPLUSES;
  const sexOptions = SEX;
  const goalOptions = GOAL_TYPES.map(g => ({ ...g, short: g.label.replace('Weight Loss', 'Lose').replace('Maintenance', 'Maintain').replace('Muscle Gain', 'Gain') }));
  const splitOptions = CARBS_FAT_SPLITS.map(o => ({ ...o, short: o.key.replace('/', ' / ') }));
  const deficitSegs = deficitOptions.map(o => ({ ...o, short: o.label.split(' ')[0] }));

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: theme.bg }}>
      <ScrollView contentContainerStyle={[styles.container, { paddingBottom: bottomPad }]} keyboardShouldPersistTaps="handled">
        <Text style={[styles.screenTitle, { color: theme.text, fontFamily }]} accessibilityRole="header">Profile</Text>
        {session?.user?.email ? (
          <Text style={[styles.email, { color: theme.textSecondary, fontFamily }]}>{session.user.email}</Text>
        ) : null}

        {/* Current Goals */}
        <View style={[styles.goalsCard, { backgroundColor: theme.card }]}>
          <View style={styles.cardHeader}>
            <Text style={[styles.goalCardTitle, { color: theme.text, fontFamily }]}>Current Goals</Text>
            {goalComputed ? <Text style={[styles.goalTypeLabel, { color: theme.accent, fontFamily }]}>{goalLabel}</Text> : null}
          </View>
          {!goalComputed ? (
            <Text style={[styles.nudgeText, { color: theme.textSecondary, fontFamily }]}>
              Fill in weight, height and date of birth below, then tap Save Profile to see your calculated daily targets here.
            </Text>
          ) : (
            <>
              <View style={styles.calRow}>
                <Text style={[styles.calValue, { color: theme.accent, fontFamily }]}>{goalComputed.adjustedCalories}</Text>
                <Text style={[styles.calUnit, { color: theme.textSecondary, fontFamily }]}>kcal / day</Text>
              </View>
              {baseComputed ? (
                <Text style={[styles.bmrLine, { color: theme.textSecondary, fontFamily }]}>
                  {`BMR ${baseComputed.bmr} kcal  •  TDEE ${baseComputed.tdee} kcal${baseComputed.bmi ? `  •  BMI ${baseComputed.bmi}` : ''}`}
                </Text>
              ) : null}
              <View style={[styles.hairline, { backgroundColor: theme.separator, marginVertical: 14 }]} />
              <View style={styles.macroRow}>
                <MacroStat label="Protein" value={`${goalComputed.macros.protein} g`} color={colors.protein} />
                <MacroStat label="Carbs" value={`${goalComputed.macros.carbs} g`} color={colors.carbs} />
                <MacroStat label="Fat" value={`${goalComputed.macros.fat} g`} color={colors.fat} />
              </View>
            </>
          )}
        </View>

        {/* About you */}
        <SectionHeader>About you</SectionHeader>
        <Group>
          <Row label="Name">
            <RowInput label="Display name" placeholder="Your name" value={String(form.name ?? '')} onChangeText={set('name')} />
          </Row>
          <Row label="Weight (kg)">
            <RowInput label="Weight (kg)" placeholder="75" keyboardType="decimal-pad" value={String(form.weight_kg ?? '')} onChangeText={set('weight_kg')} />
          </Row>
          <Row label="Height (cm)">
            <RowInput label="Height (cm)" placeholder="175" keyboardType="decimal-pad" value={String(form.height_cm ?? '')} onChangeText={set('height_cm')} />
          </Row>
          <Row label="Date of birth">
            {Platform.OS === 'web' ? (
              <input
                type="date"
                aria-label="Date of birth"
                value={form.dob || ''}
                onChange={e => set('dob')(e.target.value)}
                max={new Date().toISOString().slice(0, 10)}
                style={{
                  background: 'transparent', border: 'none', outline: 'none', color: theme.text,
                  fontSize: 17, textAlign: 'right', fontFamily, colorScheme: theme.isDark ? 'dark' : 'light',
                }}
              />
            ) : (
              <RowInput label="Date of birth" placeholder="1990-01-15" value={String(form.dob ?? '')} onChangeText={set('dob')} />
            )}
          </Row>
          <Row label="Gender" stacked>
            <Segmented options={sexOptions} value={form.gender} onSelect={set('gender')} />
          </Row>
        </Group>

        {/* Activity & goal */}
        <View style={{ height: 8 }} />
        <SectionHeader>Activity & goal</SectionHeader>
        <Group>
          <SelectRow label="Activity level" options={ACTIVITY} value={form.activity_level} onSelect={set('activity_level')} />
          <SelectRow label="Country" options={COUNTRY_OPTIONS} value={form.country} onSelect={set('country')} />
          <Row label="Goal" stacked>
            <Segmented options={goalOptions} value={form.goal_type} onSelect={setGoalType} />
          </Row>
          {form.goal_type !== 'MAINTENANCE' && (
            <Row label={form.goal_type === 'WEIGHT_LOSS' ? 'Calorie deficit' : 'Calorie surplus'} stacked>
              <Segmented options={deficitSegs} value={form.calorie_deficit} onSelect={set('calorie_deficit')} />
            </Row>
          )}
          <Row label="Protein (g/kg)">
            <RowInput label="Protein target (g/kg body weight)" placeholder="2.0" keyboardType="decimal-pad" value={String(form.protein_per_kg ?? '')} onChangeText={set('protein_per_kg')} />
          </Row>
          <Row label="Carbs / fat split" stacked>
            <Segmented options={splitOptions} value={form.carbs_fat_split} onSelect={set('carbs_fat_split')} />
          </Row>
        </Group>
        <SectionFooter>
          {[
            selectedCountry?.description,
            form.goal_type === 'WEIGHT_LOSS'
              ? 'Recommended: 200–500 cal deficit to preserve muscle while losing fat.'
              : form.goal_type === 'MUSCLE_GAIN' ? 'A lean bulk minimises fat gain.' : null,
            `Recommended protein: 1.6–2.2 g/kg for muscle building.${form.weight_kg && form.protein_per_kg ? ` Current target: ${Math.round(parseFloat(form.protein_per_kg) * parseFloat(form.weight_kg))} g protein/day.` : ''}`,
            'The remaining calories after protein are split between carbs and fat.',
          ].filter(Boolean).join(' ')}
        </SectionFooter>

        <TouchableOpacity
          onPress={save}
          disabled={saving}
          activeOpacity={0.8}
          accessibilityRole="button"
          style={[styles.primaryBtn, { backgroundColor: theme.accent, opacity: saving ? 0.6 : 1 }]}
        >
          <Text style={[styles.primaryBtnText, { color: theme.accentContrast, fontFamily }]}>
            {saving ? 'Saving…' : saved ? 'Saved' : 'Save Profile'}
          </Text>
        </TouchableOpacity>

        <View style={{ height: 24 }} />
        <Group>
          <TouchableOpacity
            style={styles.linkRow}
            accessibilityRole="button"
            onPress={() => navigation.navigate('Today', { screen: 'FoodHistory' })}
          >
            <Icon name="clock" size={20} color={theme.accent} />
            <Text style={[styles.linkText, { color: theme.text, fontFamily }]}>Food history</Text>
            <Icon name="chevronRight" size={16} color={theme.textMuted} />
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.linkRow}
            accessibilityRole="button"
            onPress={() => signOut().catch(e => Alert.alert('Error', e.message))}
          >
            <Icon name="signOut" size={20} color={theme.danger} />
            <Text style={[styles.linkText, { color: theme.danger, fontFamily }]}>Sign out</Text>
          </TouchableOpacity>
        </Group>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { padding: 20, paddingTop: 12, width: '100%', maxWidth: 720, alignSelf: 'center' },
  screenTitle: { fontSize: 34, fontWeight: '700', letterSpacing: 0.3 },
  email: { fontSize: 17, marginTop: 2, marginBottom: 16 },
  goalsCard: { borderRadius: 26, padding: 18, marginBottom: 20 },
  cardHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 },
  goalCardTitle: { fontSize: 17, fontWeight: '600' },
  goalTypeLabel: { fontSize: 13, fontWeight: '600' },
  nudgeText: { fontSize: 15, lineHeight: 21 },
  calRow: { flexDirection: 'row', alignItems: 'baseline', gap: 8 },
  calValue: { fontSize: 44, fontWeight: '700', letterSpacing: 0.3 },
  calUnit: { fontSize: 17 },
  bmrLine: { fontSize: 13, marginTop: 4 },
  macroRow: { flexDirection: 'row' },
  macroStat: { flex: 1, gap: 2 },
  macroLabel: { fontSize: 13 },
  macroValue: { fontSize: 20, fontWeight: '600' },
  sectionHeader: { fontSize: 13, marginLeft: 16, marginBottom: 6 },
  sectionFooter: { fontSize: 13, lineHeight: 18, marginHorizontal: 16, marginTop: 8, marginBottom: 20 },
  group: { borderRadius: 26, overflow: 'hidden' },
  hairline: { height: StyleSheet.hairlineWidth, marginLeft: 16 },
  rowItem: { minHeight: 48, paddingHorizontal: 16, paddingVertical: 6, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12 },
  rowStacked: { flexDirection: 'column', alignItems: 'stretch', justifyContent: 'center', paddingVertical: 10, gap: 8 },
  rowLabel: { fontSize: 17 },
  rowValue: { flex: 1, alignItems: 'flex-end' },
  rowStackedBody: { alignSelf: 'stretch' },
  rowInput: { fontSize: 17, textAlign: 'right', minWidth: 120, height: 44, padding: 0 },
  selectWrap: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  segTrack: { flexDirection: 'row', borderRadius: 9, padding: 2 },
  segItem: { flex: 1, minHeight: 32, borderRadius: 7, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 6 },
  segActive: { shadowColor: '#000', shadowOpacity: 0.12, shadowRadius: 3, shadowOffset: { width: 0, height: 1 } },
  segText: { fontSize: 13 },
  primaryBtn: { height: 50, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  primaryBtnText: { fontSize: 17, fontWeight: '600' },
  linkRow: { minHeight: 48, paddingHorizontal: 16, flexDirection: 'row', alignItems: 'center', gap: 12 },
  linkText: { flex: 1, fontSize: 17 },
});
