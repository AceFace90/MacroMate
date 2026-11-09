import React, { useState, useEffect } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity, Linking, TextInput,
  useWindowDimensions,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useTheme } from '../hooks/useTheme';
import { useGeminiKey } from '../hooks/useGeminiKey';
import { signOut, getSession } from '../services/auth';
import { fontFamily, breakpoints } from '../theme';
import Icon from '../components/Icon';

const UNITS_KEY = 'macromate_units';

const THEME_OPTIONS = [
  { key: 'system', label: 'System', icon: 'phone' },
  { key: 'light',  label: 'Light', icon: 'sun' },
  { key: 'dark',   label: 'Dark',  icon: 'moon' },
];

const UNITS_OPTIONS = [
  { key: 'metric',   label: 'Metric (kg, cm)' },
  { key: 'imperial', label: 'Imperial (lbs, ft/in)' },
];

function Segmented({ options, value, onSelect }) {
  const { theme } = useTheme();
  const selectedBg = theme.isDark ? '#636366' : '#ffffff';
  return (
    <View style={[styles.segTrack, { backgroundColor: theme.fill }]} accessibilityRole="radiogroup">
      {options.map((o) => {
        const active = value === o.key;
        return (
          <TouchableOpacity
            key={o.key}
            onPress={() => onSelect(o.key)}
            activeOpacity={0.7}
            accessibilityRole="radio"
            accessibilityState={{ selected: active }}
            style={[styles.segItem, active && [styles.segActive, { backgroundColor: selectedBg }]]}
          >
            {o.icon ? <Icon name={o.icon} size={14} color={theme.text} /> : null}
            <Text style={[styles.segText, { color: theme.text, fontWeight: active ? '600' : '400', fontFamily }]}>
              {o.label}
            </Text>
          </TouchableOpacity>
        );
      })}
    </View>
  );
}

function Section({ title, footer, children }) {
  const { theme } = useTheme();
  return (
    <View style={styles.section}>
      {title ? <Text style={[styles.sectionHeader, { color: theme.textSecondary, fontFamily }]}>{title.toUpperCase()}</Text> : null}
      <View style={[styles.group, { backgroundColor: theme.card }]}>{children}</View>
      {footer ? <View style={styles.footerWrap}>{footer}</View> : null}
    </View>
  );
}

// Row with hairline separator inset 16 from the left (omitted for the last row).
function Row({ last, children, style, onPress, accessibilityLabel, accessibilityRole }) {
  const { theme } = useTheme();
  const Wrapper = onPress ? TouchableOpacity : View;
  return (
    <Wrapper
      onPress={onPress}
      activeOpacity={0.6}
      accessibilityLabel={accessibilityLabel}
      accessibilityRole={onPress ? (accessibilityRole || 'button') : undefined}
      style={[styles.row, style]}
    >
      {children}
      {!last && <View style={[styles.sep, { backgroundColor: theme.separator }]} />}
    </Wrapper>
  );
}

function ValueRow({ label, value, last }) {
  const { theme } = useTheme();
  return (
    <Row last={last}>
      <Text style={[styles.rowLabel, { color: theme.text, fontFamily }]}>{label}</Text>
      <Text style={[styles.rowValue, { color: theme.textSecondary, fontFamily }]}>{value}</Text>
    </Row>
  );
}

export default function SettingsScreen() {
  const { theme, preference, setTheme } = useTheme();
  const { hasKey, saveKey } = useGeminiKey();
  const { width } = useWindowDimensions();
  const [keyInput, setKeyInput] = useState('');
  const [units, setUnitsState] = useState('metric');
  const [email, setEmail] = useState('');

  useEffect(() => {
    AsyncStorage.getItem(UNITS_KEY).then((val) => {
      if (val) setUnitsState(val);
    });
    getSession().then((s) => setEmail(s?.user?.email || '')).catch(() => {});
  }, []);

  const handleUnitsSelect = async (val) => {
    setUnitsState(val);
    await AsyncStorage.setItem(UNITS_KEY, val);
  };

  const bottomPad = width < breakpoints.desktop ? 96 : 40;
  const initial = (email || '?').trim().charAt(0).toUpperCase();
  const link = (text, url) => (
    <Text
      style={{ color: theme.accent, fontWeight: '600' }}
      accessibilityRole="link"
      onPress={() => Linking.openURL(url)}
    >{text}</Text>
  );

  return (
    <SafeAreaView edges={['top']} style={{ flex: 1, backgroundColor: theme.bg }}>
      <ScrollView contentContainerStyle={[styles.container, { paddingBottom: bottomPad }]}>
        <View style={styles.inner}>
          <Text style={[styles.title, { color: theme.text, fontFamily }]} accessibilityRole="header">Settings</Text>
          <Text style={[styles.subtitle, { color: theme.textSecondary, fontFamily }]}>Your profile, appearance and account.</Text>

          {/* ACCOUNT */}
          <Section
            title="Account"
            footer={<Text style={[styles.footer, { color: theme.textSecondary, fontFamily }]}>Your data syncs to this account and is available on any device you sign into.</Text>}
          >
            <Row style={styles.accountRow}>
              <View style={[styles.avatar, { backgroundColor: theme.accent }]}>
                <Text style={[styles.avatarText, { color: theme.accentContrast, fontFamily }]}>{initial}</Text>
              </View>
              <View style={{ flex: 1 }}>
                <Text style={[styles.rowLabel, { color: theme.text, fontFamily }]} numberOfLines={1}>
                  {email || 'Signed in'}
                </Text>
                <Text style={[styles.subText, { color: theme.textSecondary, fontFamily }]}>MacroMate account</Text>
              </View>
            </Row>
            <Row last onPress={() => signOut()} accessibilityLabel="Sign out">
              <Icon name="signOut" size={20} color={theme.danger} />
              <Text style={[styles.rowLabel, { color: theme.danger, fontFamily }]}>Sign out</Text>
            </Row>
          </Section>

          {/* APPEARANCE */}
          <Section title="Appearance">
            {THEME_OPTIONS.map((o, i) => (
              <Row key={o.key} last={i === THEME_OPTIONS.length - 1} onPress={() => setTheme(o.key)} accessibilityLabel={o.label}>
                <Icon name={o.icon} size={20} color={theme.accent} />
                <Text style={[styles.rowLabel, { flex: 1, color: theme.text, fontFamily }]}>{o.label}</Text>
                {preference === o.key ? <Icon name="check" size={20} color={theme.accent} /> : null}
              </Row>
            ))}
          </Section>

          {/* UNITS */}
          <Section title="Units">
            <Row last style={styles.segRow}>
              <Segmented options={UNITS_OPTIONS} value={units} onSelect={handleUnitsSelect} />
            </Row>
          </Section>

          {/* AI */}
          <Section
            title="AI features"
            footer={
              <Text style={[styles.footer, { color: theme.textSecondary, fontFamily }]}>
                Paste your own Gemini API key to enable AI meal logging and label scanning. Stored only on this device — never synced.
              </Text>
            }
          >
            <Row last={false}>
              <Icon name="key" size={20} color={theme.textSecondary} />
              <Text style={[styles.rowLabel, { color: theme.text, fontFamily }]}>Gemini API key</Text>
              {hasKey ? (
                <View style={styles.savedWrap}>
                  <Icon name="check" size={16} color={theme.accent} />
                  <Text style={[styles.rowValue, { color: theme.accent, fontFamily, flex: 0 }]}>Saved</Text>
                </View>
              ) : null}
            </Row>
            {hasKey ? null : (
              <Row last style={styles.keyInputRow}>
                <TextInput
                  value={keyInput}
                  onChangeText={setKeyInput}
                  placeholder="AIza…"
                  placeholderTextColor={theme.textMuted}
                  autoCorrect={false}
                  autoCapitalize="none"
                  accessibilityLabel="Gemini API key"
                  style={[styles.input, { backgroundColor: theme.input, color: theme.text, fontFamily }]}
                />
                <TouchableOpacity
                  onPress={() => { saveKey(keyInput); setKeyInput(''); }}
                  disabled={!keyInput.trim()}
                  accessibilityRole="button"
                  accessibilityLabel="Save key"
                  style={[styles.saveBtn, { backgroundColor: theme.accent, opacity: keyInput.trim() ? 1 : 0.4 }]}
                >
                  <Text style={[styles.saveBtnText, { color: theme.accentContrast, fontFamily }]}>Save</Text>
                </TouchableOpacity>
              </Row>
            )}
            {hasKey ? (
              <Row last onPress={() => saveKey('')} accessibilityLabel="Remove Gemini key">
                <Icon name="trash" size={20} color={theme.danger} />
                <Text style={[styles.rowLabel, { color: theme.danger, fontFamily }]}>Remove</Text>
              </Row>
            ) : null}
          </Section>

          {/* ABOUT */}
          <Section title="About">
            <ValueRow label="Version" value="2.0.0" />
            <ValueRow label="Food database" value="AFCD + OpenNutrition + Open Food Facts" />
            <ValueRow label="Companion App" value="GymMate" last />
          </Section>

          {/* DATA SOURCES */}
          <Section title="Data sources">
            <View style={styles.sourcesBody}>
              <Text style={[styles.sources, { color: theme.textSecondary, fontFamily }]}>
                {'Food data sourced from '}
                <Text style={{ fontWeight: '600' }}>USDA FoodData Central</Text>
                {' (public domain), '}
                {link('OpenNutrition', 'https://www.opennutrition.app')}
                {' (ODbL), '}
                {link('© Open Food Facts contributors', 'https://world.openfoodfacts.org')}
                {' (ODbL), and the '}
                <Text style={{ fontWeight: '600' }}>Australian AFCD</Text>
                {'. Nutritional values are estimates only and are not intended for medical use.'}
              </Text>
            </View>
          </Section>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container:     { paddingHorizontal: 20, paddingTop: 8 },
  inner:         { width: '100%', maxWidth: 720, alignSelf: 'center' },
  title:         { fontSize: 34, fontWeight: '700', marginTop: 8 },
  subtitle:      { fontSize: 15, marginTop: 2, marginBottom: 16 },
  section:       { marginBottom: 24 },
  sectionHeader: { fontSize: 13, letterSpacing: 0.3, marginLeft: 16, marginBottom: 6 },
  group:         { borderRadius: 26, overflow: 'hidden' },
  footerWrap:    { marginTop: 6, paddingHorizontal: 16 },
  footer:        { fontSize: 13, lineHeight: 18 },
  row:           { minHeight: 48, flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 16, paddingVertical: 10 },
  sep:           { position: 'absolute', left: 16, right: 0, bottom: 0, height: StyleSheet.hairlineWidth },
  rowLabel:      { fontSize: 17 },
  rowValue:      { fontSize: 17, flex: 1, textAlign: 'right' },
  subText:       { fontSize: 13, marginTop: 1 },
  accountRow:    { paddingVertical: 14 },
  avatar:        { width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center' },
  avatarText:    { fontSize: 20, fontWeight: '600' },
  segRow:        { paddingVertical: 8 },
  segTrack:      { flex: 1, flexDirection: 'row', borderRadius: 9, padding: 2 },
  segItem:       { flex: 1, minHeight: 32, borderRadius: 7, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, paddingHorizontal: 8 },
  segActive:     { shadowColor: '#000', shadowOpacity: 0.12, shadowRadius: 3, shadowOffset: { width: 0, height: 1 } },
  segText:       { fontSize: 14 },
  savedWrap:     { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'flex-end', gap: 4 },
  keyInputRow:   { paddingVertical: 8 },
  input:         { flex: 1, height: 44, borderRadius: 10, paddingHorizontal: 12, fontSize: 17, borderWidth: 0 },
  saveBtn:       { height: 44, paddingHorizontal: 18, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  saveBtnText:   { fontSize: 17, fontWeight: '600' },
  sourcesBody:   { padding: 16 },
  sources:       { fontSize: 13, lineHeight: 19 },
});
