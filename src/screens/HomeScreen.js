import React, { useState, useCallback, useRef, useMemo } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  ActivityIndicator, Alert, TextInput, Platform,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useTheme } from '../hooks/useTheme';
import { spacing, typography, colors, radius } from '../theme';
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
  { key: 'BREAKFAST', label: 'B-FAST',  emoji: '🥚' },
  { key: 'LUNCH',     label: 'LUNCH',   emoji: '🥗' },
  { key: 'DINNER',    label: 'DINNER',  emoji: '🍽️' },
  { key: 'SNACK',     label: 'SNACK',   emoji: '🍎' },
];

const HIT = { top: 10, bottom: 10, left: 10, right: 10 };

// ── Main screen ───────────────────────────────────────────────────────────────

export default function HomeScreen() {
  const { theme } = useTheme();
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

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: theme.bg }}>
      <ScrollView contentContainerStyle={styles.container} keyboardShouldPersistTaps="handled">

        {/* Header */}
        <View style={styles.header}>
          <Text style={[styles.title, { color: theme.accent }]}>MacroMate</Text>
          <Text style={[styles.headerDate, { color: theme.textMuted }]}>
            {new Date().toLocaleDateString('en-AU', { weekday: 'short', day: 'numeric', month: 'long' })}
          </Text>
        </View>

        {/* Day navigation */}
        <DayNavigator
          viewDate={viewDate}
          isToday={isToday}
          onPrev={() => setViewDate(d => addDays(d, -1))}
          onNext={() => setViewDate(d => addDays(d, 1))}
          theme={theme}
        />

        {/* Macro rings */}
        <MacroSummary rings={rings} totals={totals} targets={targets} calRemaining={calRemaining} theme={theme} />

        {/* Meal type tabs */}
        <View style={styles.mealTabs}>
          {MEALS.map(m => (
            <TouchableOpacity
              key={m.key}
              style={[
                styles.mealTab,
                { borderColor: theme.border },
                selectedMeal === m.key && { backgroundColor: theme.accent, borderColor: theme.accent },
              ]}
              onPress={() => setSelectedMeal(m.key)}
            >
              <Text style={[styles.mealTabText, { color: selectedMeal === m.key ? '#000' : theme.textMuted }]}>
                {m.label}
              </Text>
            </TouchableOpacity>
          ))}
        </View>

        {/* Search / log panel */}
        <View style={styles.searchSection}>

          {/* Main text input — DB search + AI description, multiline */}
          <View style={[styles.searchBar, { backgroundColor: theme.input, borderColor: focused ? theme.accent : theme.border }]}>
            <TextInput
              value={query}
              onChangeText={handleChangeText}
              onFocus={() => setFocused(true)}
              onBlur={() => setTimeout(() => setFocused(false), 150)}
              placeholder={`Type food name, or describe your meal…`}
              placeholderTextColor={theme.textMuted}
              style={[styles.searchInput, { color: theme.text }]}
              autoCorrect={false}
              multiline
            />
            {searching && <ActivityIndicator size="small" color={theme.accent} style={{ marginLeft: spacing[2], alignSelf: 'flex-start', marginTop: 2 }} />}
          </View>

          {/* Utility buttons — Upload Image + Scan Barcode, left-aligned small */}
          <View style={styles.utilBtnRow}>
            <TouchableOpacity
              style={[styles.utilBtn, { backgroundColor: theme.card, borderColor: theme.border }]}
              onPress={handlePhotoMeal}
              disabled={aiLoading}
              activeOpacity={0.75}
            >
              <Text style={[styles.utilBtnText, { color: theme.text }]}>⬆  Upload Image</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.utilBtn, { backgroundColor: '#1e3a5f', borderColor: '#2563eb' }]}
              onPress={() => setScannerVisible(true)}
              activeOpacity={0.75}
            >
              <Text style={[styles.utilBtnText, { color: '#60a5fa' }]}>▦  Scan Barcode</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.utilBtn, { backgroundColor: '#1e3a5f', borderColor: '#2563eb' }]}
              onPress={() => {
                if (!hasKey) {
                  Alert.alert('Gemini key needed', 'Add your API key in Profile → Settings → AI Features to scan labels.');
                  return;
                }
                setLabelScannerVisible(true);
              }}
              activeOpacity={0.75}
            >
              <Text style={[styles.utilBtnText, { color: '#60a5fa' }]}>🏷  Scan Label</Text>
            </TouchableOpacity>
          </View>

          {/* Staged photo indicator */}
          {stagedPhoto && (
            <View style={[styles.stagedPhotoRow, { backgroundColor: theme.accentBg, borderColor: theme.accentBorder }]}>
              <Text style={[styles.stagedPhotoText, { color: theme.accent }]}>
                📷 {stagedPhoto.name || 'Photo ready'}
              </Text>
              <TouchableOpacity onPress={() => setStagedPhoto(null)} hitSlop={HIT}>
                <Text style={[styles.stagedPhotoRemove, { color: theme.textMuted }]}>✕</Text>
              </TouchableOpacity>
            </View>
          )}

          {/* Analyse & Log Food — big green button, active when text or photo is present */}
          {(() => {
            const canAnalyze = !aiLoading && (query.trim().length > 0 || !!stagedPhoto);
            return (
              <TouchableOpacity
                style={[styles.analyzeBtn, { backgroundColor: canAnalyze ? theme.accent : theme.border }]}
                onPress={async () => {
                  if (!canAnalyze) return;
                  if (!hasKey) {
                    Alert.alert('Gemini key needed', 'Add your API key in Profile → Settings → AI Features.');
                    return;
                  }
                  if (stagedPhoto) {
                    handlePhotoAnalyze();
                  } else {
                    handleAIAnalyze(query);
                  }
                }}
                disabled={!canAnalyze}
                activeOpacity={0.85}
              >
                {aiLoading
                  ? <ActivityIndicator color="#000" />
                  : <Text style={[styles.analyzeBtnText, { color: canAnalyze ? '#000' : theme.textMuted }]}>
                      ✨ Analyse & Log Food
                    </Text>
                }
              </TouchableOpacity>
            );
          })()}

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

          {/* Recent foods — shown on focus with empty query */}
          {showRecent && (
            <View style={[styles.resultsList, { backgroundColor: theme.card, borderColor: theme.border }]}>
              <Text style={[styles.listHeader, { color: theme.textMuted }]}>Recent</Text>
              {recentFoods.map((item, i) => (
                <React.Fragment key={`${item.name}-${i}`}>
                  {i > 0 && <View style={[styles.sep, { backgroundColor: theme.border }]} />}
                  <FoodResultRow item={item} onSelect={handleSelectFood} theme={theme} />
                </React.Fragment>
              ))}
            </View>
          )}

          {/* Search results */}
          {showResults && (
            <View style={[styles.resultsList, { backgroundColor: theme.card, borderColor: theme.border }]}>
              {results.map((item, i) => (
                <React.Fragment key={`${item.name}-${i}`}>
                  {i > 0 && <View style={[styles.sep, { backgroundColor: theme.border }]} />}
                  <FoodResultRow item={item} onSelect={handleSelectFood} theme={theme} />
                </React.Fragment>
              ))}
            </View>
          )}


          {/* AI loading */}
          {aiLoading && (
            <View style={styles.aiLoadingRow}>
              <ActivityIndicator color={theme.accent} />
              <Text style={[styles.aiLoadingText, { color: theme.textMuted }]}>Analysing meal…</Text>
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
        </View>

        {/* Meal sections */}
        {MEALS.map(meal => (
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
        ))}

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
  container: { padding: spacing[4], paddingBottom: spacing[12] },

  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: spacing[3] },
  title: { fontSize: typography.sizes['2xl'], fontWeight: typography.weights.bold },
  headerDate: { fontSize: typography.sizes.sm },

  mealTabs: { flexDirection: 'row', gap: spacing[2], marginBottom: spacing[3] },
  mealTab: {
    flex: 1, paddingVertical: spacing[2], alignItems: 'center',
    borderRadius: radius.md, borderWidth: 1,
  },
  mealTabText: { fontSize: typography.sizes.xs, fontWeight: typography.weights.bold },

  searchSection: { marginBottom: spacing[4] },
  searchBar: {
    flexDirection: 'row', alignItems: 'center',
    borderRadius: radius.lg, borderWidth: 1.5,
    paddingHorizontal: spacing[3], paddingVertical: spacing[3],
    marginBottom: spacing[2],
  },
  searchInput: { flex: 1, fontSize: typography.sizes.base },
  aiSparkleBtn: { marginLeft: spacing[2], padding: spacing[1] },
  utilBtnRow: { flexDirection: 'row', gap: spacing[2], marginBottom: spacing[3] },
  utilBtn: {
    borderWidth: 1, borderRadius: radius.lg,
    paddingVertical: spacing[2], paddingHorizontal: spacing[3],
  },
  utilBtnText: { fontSize: typography.sizes.sm, fontWeight: typography.weights.semibold },
  stagedPhotoRow: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    borderRadius: radius.lg, borderWidth: 1,
    paddingHorizontal: spacing[3], paddingVertical: spacing[2],
    marginBottom: spacing[2],
  },
  stagedPhotoText: { fontSize: typography.sizes.sm, fontWeight: typography.weights.semibold, flex: 1 },
  stagedPhotoRemove: { fontSize: typography.sizes.lg, paddingLeft: spacing[3] },
  analyzeBtn: {
    borderRadius: radius.lg, paddingVertical: spacing[4],
    alignItems: 'center', marginBottom: spacing[2],
  },
  analyzeBtnText: { fontSize: typography.sizes.lg, fontWeight: typography.weights.bold },

  resultsList: {
    borderRadius: radius.lg, borderWidth: 1,
    marginBottom: spacing[2], overflow: 'hidden',
  },
  listHeader: {
    fontSize: typography.sizes.xs, fontWeight: typography.weights.bold,
    paddingHorizontal: spacing[4], paddingTop: spacing[3], paddingBottom: spacing[1],
    textTransform: 'uppercase', letterSpacing: 0.5,
  },
  sep: { height: 1, marginHorizontal: spacing[4] },

  aiLoadingRow: {
    flexDirection: 'row', alignItems: 'center', gap: spacing[3],
    padding: spacing[4], justifyContent: 'center',
  },
  aiLoadingText: { fontSize: typography.sizes.sm },
});
