import React, { useState, useCallback, useRef, useMemo } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  ActivityIndicator, Alert, TextInput, Platform, useWindowDimensions,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useTheme } from '../hooks/useTheme';
import { spacing, colors, fontFamily, breakpoints } from '../theme';
import Card from '../components/Card';
import Button from '../components/Button';
import Icon from '../components/Icon';
import { useLog, todayStr, sumEntries, getPreviousDays } from '../store/logStore';
import { useGeminiKey } from '../hooks/useGeminiKey';
import foodMatching from '../services/foodMatching';
import gemini from '../services/gemini';
import BarcodeScannerModal from '../components/BarcodeScannerModal';
import LabelScannerModal from '../components/LabelScannerModal';
import { addDays, formatDateLabel } from '../utils/dateUtils';
import { scaleFood } from '../utils/foodMath';
import FoodResultRow from '../components/home/FoodResultRow';
import QuantityPickerRow from '../components/home/QuantityPickerRow';
import DayNavigator from '../components/home/DayNavigator';
import MacroSummary from '../components/home/MacroSummary';
import MealSection from '../components/home/MealSection';
import AIMealPanel from '../components/home/AIMealPanel';

// ── Constants ─────────────────────────────────────────────────────────────────

const MEALS = [
  { key: 'BREAKFAST', label: 'Breakfast', emoji: '' },
  { key: 'LUNCH',     label: 'Lunch', emoji: '' },
  { key: 'DINNER',    label: 'Dinner', emoji: '' },
  { key: 'SNACK',     label: 'Snack', emoji: '' },
];

const HIT = { top: 10, bottom: 10, left: 10, right: 10 };

// ── Main screen ───────────────────────────────────────────────────────────────

export default function HomeScreen() {
  const { theme } = useTheme();
  const { width } = useWindowDimensions();
  const { logs, addEntry, removeEntry, updateEntry, getEntries, targets } = useLog();
  const { key: geminiKey, hasKey } = useGeminiKey();

  // Day navigation
  const [viewDate, setViewDate] = useState(todayStr);
  const isToday = viewDate === todayStr();

  // Meal type selection
  const [selectedMeal, setSelectedMeal] = useState('BREAKFAST');

  // Search
  const [query, setQuery] = useState('');
  const [results, setResults] = useState([]);
  const [searching, setSearching] = useState(false);
  const [focused, setFocused] = useState(false);
  const debounceRef = useRef(null);

  // Quantity picker
  const [selectedFood, setSelectedFood] = useState(null);
  const [selectedQty, setSelectedQty] = useState('');

  // AI
  const [aiItems, setAiItems] = useState([]);
  const [aiLoading, setAiLoading] = useState(false);
  const photoInputRef = useRef(null);
  // Staged photo (web: { base64, mimeType } | null)
  const [stagedPhoto, setStagedPhoto] = useState(null);

  // Entry editing (full macro editor)
  const [editingId, setEditingId] = useState(null);
  const [editFields, setEditFields] = useState({ qty: '', cal: '', protein: '', carbs: '', fat: '', meal_type: 'BREAKFAST' });

  const [scannerVisible, setScannerVisible] = useState(false);
  const [labelScannerVisible, setLabelScannerVisible] = useState(false);

  // ── Derived state ────────────────────────────────────────────────────────────

  const entries = getEntries(viewDate);
  const totals = sumEntries(entries);

  const rings = [
    { label: 'Protein', value: Math.round(totals.protein), goal: targets.protein, color: colors.protein },
    { label: 'Carbs',   value: Math.round(totals.carbs),   goal: targets.carbs,   color: colors.carbs },
    { label: 'Fat',     value: Math.round(totals.fat),     goal: targets.fat,     color: colors.fat },
  ];

  const calRemaining = targets.calories - Math.round(totals.calories);

  const grouped = useMemo(() => {
    const g = {};
    for (const m of MEALS) g[m.key] = [];
    for (const e of entries) {
      const key = e.meal_type || 'BREAKFAST';
      if (g[key]) g[key].push(e);
    }
    return g;
  }, [viewDate, logs]); // eslint-disable-line react-hooks/exhaustive-deps

  const recentFoods = useMemo(() => {
    const seen = new Set();
    const recent = [];
    for (const day of getPreviousDays(7)) {
      for (const entry of (logs[day] || [])) {
        if (!seen.has(entry.name)) {
          seen.add(entry.name);
          recent.push(entry);
          if (recent.length >= 8) return recent;
        }
      }
    }
    return recent;
  }, [logs]);

  // ── Search ───────────────────────────────────────────────────────────────────

  const search = useCallback((text) => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    if (!text.trim()) { setResults([]); return; }
    debounceRef.current = setTimeout(async () => {
      setSearching(true);
      try {
        const found = await foodMatching.searchAllTiers(text);
        setResults(found.slice(0, 20));
      } catch (e) {
        console.warn('Search error:', e);
      } finally {
        setSearching(false);
      }
    }, 350);
  }, []);

  const handleChangeText = (text) => {
    setQuery(text);
    setSelectedFood(null);
    setAiItems([]);
    if (text.trim()) setStagedPhoto(null);
    search(text);
  };

  // ── Food selection + logging ─────────────────────────────────────────────────

  const handleSelectFood = (item) => {
    setSelectedFood(item);
    setSelectedQty(String(item.quantity_g || 100));
    setResults([]);
    setQuery('');
    setFocused(false);
  };

  const confirmLog = async () => {
    if (!selectedFood) return;
    const qty = parseFloat(selectedQty) || selectedFood.quantity_g || 100;
    const item = scaleFood(selectedFood, qty);
    try {
      await addEntry(viewDate, { ...item, meal_type: selectedMeal });
      setSelectedFood(null);
      setSelectedQty('');
    } catch (e) {
      Alert.alert('Error', e.message);
    }
  };

  const logDirect = async (item) => {
    try {
      await addEntry(viewDate, { ...item, meal_type: selectedMeal });
    } catch (e) {
      Alert.alert('Error', e.message);
    }
  };

  // ── Entry editing ────────────────────────────────────────────────────────────

  const startEdit = (entry) => {
    setEditingId(entry.id);
    setEditFields({
      qty: String(entry.quantity_g || 100),
      cal: String(entry.calories ?? ''),
      protein: String(entry.protein_g ?? ''),
      carbs: String(entry.carbs_g ?? ''),
      fat: String(entry.fat_g ?? ''),
      meal_type: entry.meal_type || 'BREAKFAST',
    });
  };

  const setEditField = (key) => (val) => setEditFields(prev => ({ ...prev, [key]: val }));

  const applyQtyScale = (entry) => {
    const newQty = parseFloat(editFields.qty) || entry.quantity_g || 100;
    const scaled = scaleFood(entry, newQty);
    setEditFields(prev => ({
      ...prev,
      qty: String(newQty),
      cal: String(scaled.calories),
      protein: String(scaled.protein_g),
      carbs: String(scaled.carbs_g),
      fat: String(scaled.fat_g),
    }));
  };

  const saveEdit = async (entry) => {
    await updateEntry(viewDate, entry.id, {
      calories: Math.round(parseFloat(editFields.cal) || 0),
      protein_g: Math.round((parseFloat(editFields.protein) || 0) * 10) / 10,
      carbs_g: Math.round((parseFloat(editFields.carbs) || 0) * 10) / 10,
      fat_g: Math.round((parseFloat(editFields.fat) || 0) * 10) / 10,
      quantity_g: parseFloat(editFields.qty) || entry.quantity_g || 100,
      meal_type: editFields.meal_type || entry.meal_type || 'BREAKFAST',
    });
    setEditingId(null);
  };

  // ── AI ───────────────────────────────────────────────────────────────────────

  const handleAIAnalyze = async (text) => {
    const input = (text || query).trim();
    if (!input) return;
    if (!hasKey) {
      Alert.alert('Gemini key needed', 'Add your API key in Profile → Settings → AI Features.');
      return;
    }
    setAiLoading(true);
    setAiItems([{ name: input, quantity: 1, unit: 'serving', loading: true, resolved: null, selected: true }]);
    setResults([]);
    setQuery('');
    try {
      const result = await gemini.analyzeFood(input, null, '', geminiKey);
      const resolved = result ? { ...result, name: result.name || input, source: 'ai' } : null;
      setAiItems([{ name: input, quantity: 1, unit: 'serving', loading: false, resolved, selected: true }]);
    } catch (e) {
      setAiItems([{ name: input, quantity: 1, unit: 'serving', loading: false, resolved: null, selected: true }]);
      Alert.alert('AI error', e.message);
    } finally {
      setAiLoading(false);
    }
  };

  const toggleAIItem = (idx) => {
    setAiItems(prev => prev.map((item, i) => i === idx ? { ...item, selected: !item.selected } : item));
  };

  const logAllAI = async () => {
    const toLog = aiItems.filter(i => i.resolved && i.selected);
    for (const item of toLog) {
      await addEntry(viewDate, { ...item.resolved, meal_type: selectedMeal });
    }
    setAiItems([]);
  };

  const handlePhotoMeal = async () => {
    if (Platform.OS === 'web') {
      photoInputRef.current?.click();
      return;
    }
    try {
      const ImagePicker = await import('expo-image-picker');
      const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!perm.granted) { Alert.alert('Permission needed', 'Photo library permission required.'); return; }
      const result = await ImagePicker.launchImageLibraryAsync({
        base64: true, quality: 0.7, mediaTypes: ImagePicker.MediaTypeOptions.Images,
      });
      if (result.canceled || !result.assets?.[0]) return;
      const { base64, mimeType = 'image/jpeg' } = result.assets[0];
      setStagedPhoto({ base64, mimeType });
    } catch (e) {
      Alert.alert('Error', e.message);
    }
  };

  const handlePhotoFileChange = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const base64 = await new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result.split(',')[1]);
        reader.onerror = reject;
        reader.readAsDataURL(file);
      });
      setStagedPhoto({ base64, mimeType: file.type || 'image/jpeg', name: file.name });
    } catch (e) {
      Alert.alert('Error reading file', e.message);
    }
    e.target.value = '';
  };

  // Analyse a staged meal photo into MULTIPLE food items, then resolve each item's
  // nutrition via the same estimator the text flow uses (analyzeMealPhoto only
  // returns name + portion, not macros). Items that fail to resolve show as
  // "not found" and stay unselected so they aren't logged.
  const handlePhotoAnalyze = async () => {
    if (!stagedPhoto) return;
    if (!hasKey) {
      Alert.alert('Gemini key needed', 'Add your API key in Profile → Settings → AI Features.');
      return;
    }
    const photo = stagedPhoto;
    setAiLoading(true);
    setQuery('');
    setStagedPhoto(null);
    setAiItems([{ name: 'Photo meal', quantity: 1, unit: 'serving', loading: true, resolved: null, selected: true }]);
    try {
      const { items } = await gemini.analyzeMealPhoto(photo.base64, photo.mimeType || 'image/jpeg', geminiKey);
      // Seed a row per detected item, each still resolving its nutrition.
      setAiItems(items.map(it => ({
        name: it.name, quantity: it.quantity, unit: it.unit, loading: true, resolved: null, selected: true,
      })));
      const resolved = await Promise.all(items.map(async (it) => {
        try {
          const r = await gemini.analyzeFood(`${it.quantity}${it.unit} ${it.name}`, null, '', geminiKey);
          return {
            name: it.name, quantity: it.quantity, unit: it.unit, loading: false, selected: true,
            resolved: { ...r, name: r.name || it.name, source: 'ai' },
          };
        } catch {
          return { name: it.name, quantity: it.quantity, unit: it.unit, loading: false, selected: false, resolved: null };
        }
      }));
      setAiItems(resolved);
    } catch (e) {
      setAiItems([]);
      Alert.alert('AI error', e.message);
    } finally {
      setAiLoading(false);
    }
  };

  // ── Render helpers ────────────────────────────────────────────────────────────

  const showRecent = focused && !query && !selectedFood && !aiItems.length && recentFoods.length > 0;
  const showResults = !selectedFood && results.length > 0;
  const selectedCount = aiItems.filter(i => i.resolved && i.selected).length;

  const wide = width >= breakpoints.desktop;
  const titleText = isToday ? 'Today' : new Date(viewDate + 'T12:00:00').toLocaleDateString('en-US', { weekday: 'long' });
  const narrative = calRemaining >= 0
    ? `${calRemaining.toLocaleString('en-US')} kcal left`
    : `${Math.abs(calRemaining).toLocaleString('en-US')} kcal over`;
  const canAnalyze = !aiLoading && (query.trim().length > 0 || !!stagedPhoto);

  const ringsBlock = (
    <>
      <MacroSummary rings={rings} totals={totals} targets={targets} calRemaining={calRemaining} theme={theme} />
    </>
  );

  const loggingBlock = (
    <Card style={styles.logCard}>
      {/* Meal type — iOS segmented control */}
      <View style={[styles.segment, { backgroundColor: theme.fill }]}>
        {MEALS.map(m => {
          const active = selectedMeal === m.key;
          return (
            <TouchableOpacity
              key={m.key}
              style={[styles.segItem, active && { backgroundColor: theme.isDark ? '#636366' : '#ffffff' }, active && styles.segActive]}
              onPress={() => setSelectedMeal(m.key)}
              accessibilityRole="button"
              accessibilityState={{ selected: active }}
            >
              <Text style={[styles.segText, { color: theme.text, fontFamily, fontWeight: active ? '600' : '400' }]} numberOfLines={1}>
                {m.label}
              </Text>
            </TouchableOpacity>
          );
        })}
      </View>

      {/* Search field */}
      <View style={[styles.searchBar, { backgroundColor: theme.input }]}>
        <Icon name="search" size={18} color={theme.textSecondary} />
        <TextInput
          value={query}
          onChangeText={handleChangeText}
          onFocus={() => setFocused(true)}
          onBlur={() => setTimeout(() => setFocused(false), 150)}
          placeholder="Type food name, or describe your meal…"
          placeholderTextColor={theme.textSecondary}
          style={[styles.searchInput, { color: theme.text, fontFamily, outlineStyle: 'none' }]}
          autoCorrect={false}
          multiline
        />
        {searching && <ActivityIndicator size="small" color={theme.accent} />}
      </View>

      {/* Utility buttons */}
      <View style={styles.utilBtnRow}>
        <Button
          variant="secondary" size="sm" style={styles.utilBtn}
          onPress={handlePhotoMeal} disabled={aiLoading}
          icon={<Icon name="camera" size={18} color={theme.accent} />}
          title="Upload Image"
        />
        <Button
          variant="secondary" size="sm" style={styles.utilBtn}
          onPress={() => setScannerVisible(true)}
          icon={<Icon name="barcode" size={18} color={theme.accent} />}
          title="Scan Barcode"
        />
        <Button
          variant="secondary" size="sm" style={styles.utilBtn}
          onPress={() => {
            if (!hasKey) {
              Alert.alert('Gemini key needed', 'Add your API key in Profile → Settings → AI Features to scan labels.');
              return;
            }
            setLabelScannerVisible(true);
          }}
          icon={<Icon name="label" size={18} color={theme.accent} />}
          title="Scan Label"
        />
      </View>

      {/* Staged photo indicator */}
      {stagedPhoto && (
        <View style={[styles.stagedPhotoRow, { backgroundColor: theme.accentBg }]}>
          <Icon name="camera" size={16} color={theme.accent} />
          <Text style={[styles.stagedPhotoText, { color: theme.accent, fontFamily }]} numberOfLines={1}>
            {stagedPhoto.name || 'Photo ready'}
          </Text>
          <TouchableOpacity onPress={() => setStagedPhoto(null)} hitSlop={HIT} accessibilityLabel="Remove photo">
            <Icon name="close" size={16} color={theme.textSecondary} />
          </TouchableOpacity>
        </View>
      )}

      {/* Analyse & Log Food */}
      <Button
        variant="primary"
        disabled={!canAnalyze}
        loading={aiLoading}
        icon={<Icon name="sparkles" size={18} color={theme.accentContrast} />}
        title="Analyse & Log Food"
        onPress={async () => {
          if (!canAnalyze) return;
          if (!hasKey) {
            Alert.alert('Gemini key needed', 'Add your API key in Profile → Settings → AI Features.');
            return;
          }
          if (stagedPhoto) handlePhotoAnalyze();
          else handleAIAnalyze(query);
        }}
      />

      {/* Quantity picker — shown after selecting a food */}
      {selectedFood && (
        <QuantityPickerRow
          food={selectedFood}
          qty={selectedQty}
          onQtyChange={setSelectedQty}
          onLog={confirmLog}
          onCancel={() => setSelectedFood(null)}
          theme={theme}
        />
      )}

      {/* Recent foods */}
      {showRecent && (
        <View style={[styles.resultsList, { backgroundColor: theme.input }]}>
          <Text style={[styles.listHeader, { color: theme.textSecondary, fontFamily }]}>Recent</Text>
          {recentFoods.map((item, i) => (
            <React.Fragment key={`${item.name}-${i}`}>
              {i > 0 && <View style={[styles.sep, { backgroundColor: theme.separator }]} />}
              <FoodResultRow item={item} onSelect={handleSelectFood} theme={theme} />
            </React.Fragment>
          ))}
        </View>
      )}

      {/* Search results */}
      {showResults && (
        <View style={[styles.resultsList, { backgroundColor: theme.input }]}>
          {results.map((item, i) => (
            <React.Fragment key={`${item.name}-${i}`}>
              {i > 0 && <View style={[styles.sep, { backgroundColor: theme.separator }]} />}
              <FoodResultRow item={item} onSelect={handleSelectFood} theme={theme} />
            </React.Fragment>
          ))}
        </View>
      )}

      {/* AI loading */}
      {aiLoading && (
        <View style={styles.aiLoadingRow}>
          <ActivityIndicator color={theme.accent} />
          <Text style={[styles.aiLoadingText, { color: theme.textSecondary, fontFamily }]}>Analysing meal…</Text>
        </View>
      )}

      {/* AI items */}
      <AIMealPanel
        items={aiItems}
        selectedCount={selectedCount}
        onToggle={toggleAIItem}
        onLogAll={logAllAI}
        theme={theme}
      />

      {Platform.OS === 'web' && (
        <input
          ref={photoInputRef}
          type="file"
          accept="image/*"
          style={{ display: 'none' }}
          onChange={handlePhotoFileChange}
        />
      )}
    </Card>
  );

  const mealsBlock = MEALS.map(meal => (
    <MealSection
      key={meal.key}
      meal={meal}
      entries={grouped[meal.key] || []}
      viewDate={viewDate}
      editingId={editingId}
      editFields={editFields}
      meals={MEALS}
      onStartEdit={startEdit}
      onCancelEdit={() => setEditingId(null)}
      onRemove={removeEntry}
      onApplyQtyScale={applyQtyScale}
      onSaveEdit={saveEdit}
      onSetEditField={setEditField}
      theme={theme}
    />
  ));

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: theme.bg }}>
      <ScrollView
        contentContainerStyle={[styles.container, { paddingBottom: wide ? 40 : 96 }, wide && styles.containerWide]}
        keyboardShouldPersistTaps="handled"
      >
        {/* Large title header */}
        <View style={styles.header}>
          <Text style={[styles.title, { color: theme.text, fontFamily }]}>{titleText}</Text>
          <Text style={[styles.narrative, { color: theme.textSecondary, fontFamily }]}>{narrative}</Text>
        </View>

        <DayNavigator
          viewDate={viewDate}
          isToday={isToday}
          onPrev={() => setViewDate(d => addDays(d, -1))}
          onNext={() => setViewDate(d => addDays(d, 1))}
          theme={theme}
        />

        {wide ? (
          <View style={styles.cols}>
            <View style={styles.col}>
              {ringsBlock}
              <View style={{ height: 12 }} />
              {loggingBlock}
            </View>
            <View style={styles.col}>{mealsBlock}</View>
          </View>
        ) : (
          <>
            {ringsBlock}
            <View style={{ height: 12 }} />
            {loggingBlock}
            <View style={{ height: 12 }} />
            {mealsBlock}
          </>
        )}
      </ScrollView>

      <BarcodeScannerModal
        visible={scannerVisible}
        onClose={() => setScannerVisible(false)}
        onFound={(item) => logDirect(item)}
      />

      <LabelScannerModal
        visible={labelScannerVisible}
        onClose={() => setLabelScannerVisible(false)}
        onFound={(item) => logDirect(item)}
        geminiKey={geminiKey}
      />
    </SafeAreaView>
  );
}

// ── Styles ────────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  container: { padding: 20, width: '100%', maxWidth: 720, alignSelf: 'center' },
  containerWide: { maxWidth: 1080 },
  cols: { flexDirection: 'row', gap: 20, alignItems: 'flex-start' },
  col: { flex: 1, minWidth: 0 },

  header: { marginTop: 8, marginBottom: 16 },
  title: { fontSize: 34, fontWeight: '700' },
  narrative: { fontSize: 20, marginTop: 2 },

  logCard: { gap: 12 },
  segment: { flexDirection: 'row', borderRadius: 9, padding: 2 },
  segItem: { flex: 1, minWidth: 0, alignItems: 'center', justifyContent: 'center', paddingVertical: 7, borderRadius: 7 },
  segActive: { boxShadow: '0 1px 3px rgba(0,0,0,0.2)' },
  segText: { fontSize: 13 },

  searchBar: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    borderRadius: 10, paddingHorizontal: 12, minHeight: 44,
  },
  searchInput: { flex: 1, minWidth: 0, fontSize: 17, paddingVertical: 10 },

  utilBtnRow: { flexDirection: 'row', gap: 8 },
  utilBtn: { flex: 1, minWidth: 0, paddingHorizontal: 6 },

  stagedPhotoRow: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    borderRadius: 10, paddingHorizontal: 12, paddingVertical: 8,
  },
  stagedPhotoText: { fontSize: 15, fontWeight: '600', flex: 1 },

  resultsList: { borderRadius: 14, overflow: 'hidden' },
  listHeader: { fontSize: 13, paddingHorizontal: spacing[4], paddingTop: spacing[3], paddingBottom: spacing[1] },
  sep: { height: StyleSheet.hairlineWidth, marginHorizontal: spacing[4] },

  aiLoadingRow: { flexDirection: 'row', alignItems: 'center', gap: spacing[3], padding: spacing[2], justifyContent: 'center' },
  aiLoadingText: { fontSize: 15 },
});
