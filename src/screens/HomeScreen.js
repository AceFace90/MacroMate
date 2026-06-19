import React, { useState, useCallback, useRef, useMemo } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  ActivityIndicator, Alert, TextInput, Platform,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useTheme } from '../hooks/useTheme';
import { spacing, typography, colors, radius } from '../theme';
import Card from '../components/Card';
import ActivityRings from '../components/ActivityRings';
import { useLog, todayStr, sumEntries, getPreviousDays } from '../store/logStore';
import { useGeminiKey } from '../hooks/useGeminiKey';
import foodMatching from '../services/foodMatching';
import gemini from '../services/gemini';
import BarcodeScannerModal from '../components/BarcodeScannerModal';

// ── Constants ─────────────────────────────────────────────────────────────────

const MEALS = [
  { key: 'BREAKFAST', label: 'B-FAST',  emoji: '🥚' },
  { key: 'LUNCH',     label: 'LUNCH',   emoji: '🥗' },
  { key: 'DINNER',    label: 'DINNER',  emoji: '🍽️' },
  { key: 'SNACK',     label: 'SNACK',   emoji: '🍎' },
];

const HIT = { top: 10, bottom: 10, left: 10, right: 10 };

// ── Helpers ───────────────────────────────────────────────────────────────────

function addDays(dateStr, n) {
  const d = new Date(dateStr + 'T00:00:00');
  d.setDate(d.getDate() + n);
  // Use local date components — toISOString() converts to UTC and breaks timezone-east users
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function formatDateLabel(dateStr) {
  const today = todayStr();
  if (dateStr === today) return 'Today';
  if (dateStr === addDays(today, -1)) return 'Yesterday';
  return new Date(dateStr + 'T00:00:00').toLocaleDateString('en-AU', {
    weekday: 'short', day: 'numeric', month: 'short',
  });
}

function scaleFood(food, newQty) {
  const base = food.quantity_g || 100;
  const scale = newQty / base;
  return {
    ...food,
    calories: Math.round((food.calories || 0) * scale),
    protein_g: Math.round((food.protein_g || 0) * scale * 10) / 10,
    carbs_g: Math.round((food.carbs_g || 0) * scale * 10) / 10,
    fat_g: Math.round((food.fat_g || 0) * scale * 10) / 10,
    quantity_g: newQty,
  };
}

// ── Sub-components ─────────────────────────────────────────────────────────────

function FoodResultRow({ item, onSelect, theme }) {
  const isAI = item.source === 'ai';
  return (
    <TouchableOpacity style={styles.resultRow} onPress={() => onSelect(item)} activeOpacity={0.7}>
      <View style={{ flex: 1 }}>
        <Text style={[styles.resultName, { color: theme.text }]} numberOfLines={1}>{item.name}</Text>
        <Text style={[styles.resultMacros, { color: theme.textMuted }]}>
          P {item.protein_g ?? 0}g · C {item.carbs_g ?? 0}g · F {item.fat_g ?? 0}g
          {isAI ? <Text style={{ color: colors.fat }}> · AI estimate</Text> : null}
        </Text>
      </View>
      <Text style={[styles.resultCal, { color: theme.text }]}>{item.calories ?? 0} kcal</Text>
    </TouchableOpacity>
  );
}

function QuantityPickerRow({ food, qty, onQtyChange, onLog, onCancel, theme }) {
  const numQty = parseFloat(qty) || food.quantity_g || 100;
  const scaled = scaleFood(food, numQty);
  return (
    <View style={[styles.qtyPicker, { backgroundColor: theme.accentBg, borderColor: theme.accentBorder }]}>
      <Text style={[styles.qtyFoodName, { color: theme.text }]} numberOfLines={1}>{food.name}</Text>
      <Text style={[styles.qtyMacros, { color: theme.textMuted }]}>
        {scaled.calories} kcal · P {scaled.protein_g}g · C {scaled.carbs_g}g · F {scaled.fat_g}g
      </Text>
      <View style={styles.qtyControls}>
        <TextInput
          value={qty}
          onChangeText={onQtyChange}
          keyboardType="numeric"
          selectTextOnFocus
          style={[styles.qtyInput, { color: theme.text, borderColor: theme.accentBorder, backgroundColor: theme.input }]}
        />
        <Text style={[styles.qtyUnit, { color: theme.textMuted }]}>g</Text>
        <TouchableOpacity onPress={onLog} style={[styles.qtyLogBtn, { backgroundColor: theme.accent }]}>
          <Text style={styles.qtyLogBtnText}>Log</Text>
        </TouchableOpacity>
        <TouchableOpacity onPress={onCancel} hitSlop={HIT}>
          <Text style={[styles.qtyCancel, { color: theme.textMuted }]}>✕</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

function AIItemRow({ item, onToggle, theme }) {
  if (item.loading) {
    return (
      <View style={styles.aiItemRow}>
        <ActivityIndicator size="small" color={theme.accent} />
        <Text style={[styles.aiItemName, { color: theme.textMuted }]}>Looking up {item.name}…</Text>
      </View>
    );
  }
  if (!item.resolved) {
    return (
      <View style={styles.aiItemRow}>
        <Text style={[styles.aiItemName, { color: theme.textMuted }]}>⚠ {item.name} — not found</Text>
      </View>
    );
  }
  return (
    <TouchableOpacity style={styles.aiItemRow} onPress={onToggle} activeOpacity={0.7}>
      <Text style={[styles.aiCheckbox, { color: item.selected ? theme.accent : theme.textMuted }]}>
        {item.selected ? '☑' : '☐'}
      </Text>
      <View style={{ flex: 1 }}>
        <Text style={[styles.aiItemName, { color: theme.text }]} numberOfLines={1}>{item.resolved.name}</Text>
        <Text style={[styles.resultMacros, { color: theme.textMuted }]}>
          {item.quantity}{item.unit} · P {item.resolved.protein_g ?? 0}g · C {item.resolved.carbs_g ?? 0}g · F {item.resolved.fat_g ?? 0}g
        </Text>
      </View>
      <Text style={[styles.resultCal, { color: theme.text }]}>{item.resolved.calories ?? 0} kcal</Text>
    </TouchableOpacity>
  );
}

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

  // Entry editing (full macro editor)
  const [editingId, setEditingId] = useState(null);
  const [editFields, setEditFields] = useState({ qty: '', cal: '', protein: '', carbs: '', fat: '' });

  const [scannerVisible, setScannerVisible] = useState(false);

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
    });
  };

  const setEditField = (key) => (val) => setEditFields(prev => ({ ...prev, [key]: val }));

  const applyQtyScale = (entry) => {
    const newQty = parseFloat(editFields.qty) || entry.quantity_g || 100;
    const scaled = scaleFood(entry, newQty);
    setEditFields({
      qty: String(newQty),
      cal: String(scaled.calories),
      protein: String(scaled.protein_g),
      carbs: String(scaled.carbs_g),
      fat: String(scaled.fat_g),
    });
  };

  const saveEdit = async (entry) => {
    await updateEntry(viewDate, entry.id, {
      calories: Math.round(parseFloat(editFields.cal) || 0),
      protein_g: Math.round((parseFloat(editFields.protein) || 0) * 10) / 10,
      carbs_g: Math.round((parseFloat(editFields.carbs) || 0) * 10) / 10,
      fat_g: Math.round((parseFloat(editFields.fat) || 0) * 10) / 10,
      quantity_g: parseFloat(editFields.qty) || entry.quantity_g || 100,
    });
    setEditingId(null);
  };

  // ── AI ───────────────────────────────────────────────────────────────────────

  const resolveItems = async (items) => {
    const seeded = items.map(i => ({ ...i, loading: true, resolved: null, selected: true }));
    setAiItems(seeded);
    await Promise.all(
      items.map(async (item, idx) => {
        const q = `${item.quantity}${item.unit} ${item.name}`;
        try {
          // AI estimates nutrition directly — no DB matching needed
          const result = await gemini.analyzeFood(q, null, '', geminiKey);
          const resolved = result ? {
            ...result,
            name: result.name || item.name,
            quantity_g: result.quantity_g || item.quantity,
            source: 'ai',
          } : null;
          setAiItems(prev => prev.map((p, i) => i === idx ? { ...p, loading: false, resolved } : p));
        } catch {
          setAiItems(prev => prev.map((p, i) => i === idx ? { ...p, loading: false, resolved: null } : p));
        }
      })
    );
    setAiLoading(false);
  };

  const handleAIAnalyze = async (text) => {
    const input = (text || query).trim();
    if (!input) return;
    if (!hasKey) {
      Alert.alert('Gemini key needed', 'Add your API key in Profile → AI Settings.');
      return;
    }
    setAiLoading(true);
    setAiItems([]);
    setResults([]);
    setQuery('');
    try {
      const { items } = await gemini.decomposeMeal(input, geminiKey);
      await resolveItems(items);
    } catch (e) {
      setAiLoading(false);
      Alert.alert('AI error', e.message);
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
    if (!hasKey) {
      Alert.alert('Gemini key needed', 'Add your API key in Profile → AI Settings.');
      return;
    }
    if (Platform.OS === 'web') {
      photoInputRef.current?.click();
      return;
    }
    try {
      const ImagePicker = await import('expo-image-picker');
      const perm = await ImagePicker.requestCameraPermissionsAsync();
      if (!perm.granted) { Alert.alert('Permission needed', 'Camera permission required.'); return; }
      const result = await ImagePicker.launchCameraAsync({
        base64: true, quality: 0.7, mediaTypes: ImagePicker.MediaTypeOptions.Images,
      });
      if (result.canceled || !result.assets?.[0]) return;
      const { base64, mimeType = 'image/jpeg' } = result.assets[0];
      setAiLoading(true);
      setAiItems([]);
      const { items } = await gemini.analyzeMealPhoto(base64, mimeType, geminiKey);
      await resolveItems(items);
    } catch (e) {
      setAiLoading(false);
      Alert.alert('AI error', e.message);
    }
  };

  const handlePhotoFileChange = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setAiLoading(true);
    setAiItems([]);
    try {
      const base64 = await new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result.split(',')[1]);
        reader.onerror = reject;
        reader.readAsDataURL(file);
      });
      const { items } = await gemini.analyzeMealPhoto(base64, file.type || 'image/jpeg', geminiKey);
      await resolveItems(items);
    } catch (e) {
      setAiLoading(false);
      Alert.alert('AI error', e.message);
    }
    e.target.value = '';
  };

  // ── Render helpers ────────────────────────────────────────────────────────────

  const showRecent = focused && !query && !selectedFood && !aiItems.length && recentFoods.length > 0;
  const showResults = !selectedFood && results.length > 0;
  const showAISuggest = query.length >= 3 && !searching && results.length === 0 && !selectedFood && !aiLoading && !aiItems.length;
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
        <View style={[styles.dayNav, { backgroundColor: theme.card, borderColor: theme.border }]}>
          <TouchableOpacity onPress={() => setViewDate(d => addDays(d, -1))} style={styles.dayNavBtn}>
            <Text style={[styles.dayNavArrow, { color: theme.text }]}>← Prev</Text>
          </TouchableOpacity>
          <Text style={[styles.dayNavLabel, { color: theme.text }]}>{formatDateLabel(viewDate)}</Text>
          <TouchableOpacity
            onPress={() => setViewDate(d => addDays(d, 1))}
            style={[styles.dayNavBtn, styles.dayNavRight]}
            disabled={isToday}
          >
            <Text style={[styles.dayNavArrow, { color: isToday ? theme.textMuted : theme.text }]}>Next →</Text>
          </TouchableOpacity>
        </View>

        {/* Macro rings */}
        <Card accent style={styles.ringsCard}>
          <ActivityRings
            rings={rings}
            size={180}
            centerLabel={`${Math.round(totals.calories)}`}
            centerSub={`/ ${targets.calories} kcal`}
          />
          <Text style={[styles.calLabel, { color: theme.textMuted }]}>
            {calRemaining >= 0 ? `${calRemaining} kcal remaining` : `${Math.abs(calRemaining)} kcal over`}
          </Text>
        </Card>

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
          </View>

          {/* Analyze & Log Food — big green button, always visible */}
          <TouchableOpacity
            style={[styles.analyzeBtn, { backgroundColor: query.trim() ? theme.accent : theme.border }]}
            onPress={() => {
              if (!query.trim()) return;
              if (hasKey) {
                handleAIAnalyze(query);
              } else {
                Alert.alert('Gemini key needed', 'Add your API key in Profile → Settings → AI Settings to use AI analysis.');
              }
            }}
            disabled={aiLoading || !query.trim()}
            activeOpacity={0.85}
          >
            {aiLoading
              ? <ActivityIndicator color="#000" />
              : <Text style={[styles.analyzeBtnText, { color: query.trim() ? '#000' : theme.textMuted }]}>
                  {hasKey ? '✨ Analyse & Log Food' : 'Analyse & Log Food'}
                </Text>
            }
          </TouchableOpacity>

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

          {/* No results — AI suggestion */}
          {showAISuggest && (
            <TouchableOpacity
              style={[styles.aiSuggest, { backgroundColor: theme.accentBg, borderColor: theme.accentBorder }]}
              onPress={() => handleAIAnalyze(query)}
            >
              <Text style={[styles.aiSuggestText, { color: theme.accent }]}>
                ✨ No results — Analyze "{query}" with AI
              </Text>
            </TouchableOpacity>
          )}

          {/* AI loading */}
          {aiLoading && (
            <View style={styles.aiLoadingRow}>
              <ActivityIndicator color={theme.accent} />
              <Text style={[styles.aiLoadingText, { color: theme.textMuted }]}>Analysing meal…</Text>
            </View>
          )}

          {/* AI items */}
          {aiItems.length > 0 && (
            <View style={[styles.resultsList, { backgroundColor: theme.card, borderColor: theme.border }]}>
              <Text style={[styles.listHeader, { color: theme.textMuted }]}>AI Meal Analysis</Text>
              {aiItems.map((item, i) => (
                <React.Fragment key={i}>
                  {i > 0 && <View style={[styles.sep, { backgroundColor: theme.border }]} />}
                  <AIItemRow item={item} onToggle={() => toggleAIItem(i)} theme={theme} />
                </React.Fragment>
              ))}
              {selectedCount > 0 && (
                <TouchableOpacity
                  style={[styles.logAllBtn, { backgroundColor: theme.accent }]}
                  onPress={logAllAI}
                >
                  <Text style={styles.logAllBtnText}>Log {selectedCount} item{selectedCount !== 1 ? 's' : ''}</Text>
                </TouchableOpacity>
              )}
            </View>
          )}

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
        {MEALS.map(meal => {
          const mealEntries = grouped[meal.key] || [];
          const mealCals = Math.round(sumEntries(mealEntries).calories);
          return (
            <Card accent key={meal.key} style={styles.mealSection}>
              <View style={styles.mealSectionHeader}>
                <Text style={[styles.mealSectionTitle, { color: theme.text }]}>
                  {meal.emoji} {meal.key}
                </Text>
                <Text style={[styles.mealSectionCals, { color: mealCals > 0 ? theme.accent : theme.textMuted }]}>
                  {mealCals} cal
                </Text>
              </View>

              {mealEntries.length === 0 ? (
                <Text style={[styles.mealEmpty, { color: theme.textMuted }]}>Nothing logged</Text>
              ) : (
                mealEntries.map(entry => (
                  <View key={entry.id}>
                    <View style={[styles.entryRow, { borderTopColor: theme.border }]}>
                      <View style={{ flex: 1, minWidth: 0 }}>
                        <Text style={[styles.entryName, { color: theme.text }]} numberOfLines={1}>{entry.name}</Text>
                        <Text style={[styles.entrySub, { color: theme.textMuted }]}>
                          {new Date(entry.logged_at).toLocaleTimeString('en-AU', { hour: 'numeric', minute: '2-digit' })}
                          {entry.quantity_g ? ` · ${entry.quantity_g}g` : ''}
                        </Text>
                      </View>
                      <View style={styles.entryMacros}>
                        <Text style={[styles.entryCal, { color: theme.text }]}>{entry.calories}</Text>
                        <Text style={[styles.entryMacroSub, { color: theme.textMuted }]}>
                          {entry.protein_g}g P  {entry.carbs_g}g C  {entry.fat_g}g F
                        </Text>
                      </View>
                      <View style={styles.entryActions}>
                        <TouchableOpacity
                          onPress={() => editingId === entry.id ? setEditingId(null) : startEdit(entry)}
                          style={[styles.actionBtn, { borderColor: theme.accent }]}
                        >
                          <Text style={[styles.actionBtnText, { color: theme.accent }]}>Edit</Text>
                        </TouchableOpacity>
                        <TouchableOpacity
                          onPress={() => removeEntry(viewDate, entry.id)}
                          style={[styles.actionBtn, { borderColor: colors.red }]}
                        >
                          <Text style={[styles.actionBtnText, { color: colors.red }]}>✕</Text>
                        </TouchableOpacity>
                      </View>
                    </View>

                    {/* Inline full-macro editor */}
                    {editingId === entry.id && (
                      <View style={[styles.editPanel, { borderTopColor: theme.border, backgroundColor: theme.input }]}>
                        {/* Qty row with scale button */}
                        <View style={styles.editRow}>
                          <Text style={[styles.editLabel, { color: theme.textMuted }]}>Qty (g)</Text>
                          <TextInput
                            value={editFields.qty}
                            onChangeText={setEditField('qty')}
                            keyboardType="numeric"
                            selectTextOnFocus
                            style={[styles.editInput, { color: theme.text, borderColor: theme.border, backgroundColor: theme.card }]}
                          />
                          <TouchableOpacity
                            onPress={() => applyQtyScale(entry)}
                            style={[styles.scaleBtn, { borderColor: theme.accent }]}
                          >
                            <Text style={[styles.scaleBtnText, { color: theme.accent }]}>Scale</Text>
                          </TouchableOpacity>
                        </View>
                        {/* Macro fields */}
                        <View style={styles.editMacroRow}>
                          {[
                            { key: 'cal', label: 'Cal' },
                            { key: 'protein', label: 'P (g)', color: colors.protein },
                            { key: 'carbs', label: 'C (g)', color: colors.carbs },
                            { key: 'fat', label: 'F (g)', color: colors.fat },
                          ].map(f => (
                            <View key={f.key} style={styles.editMacroField}>
                              <Text style={[styles.editMacroLabel, { color: f.color || theme.textMuted }]}>{f.label}</Text>
                              <TextInput
                                value={editFields[f.key]}
                                onChangeText={setEditField(f.key)}
                                keyboardType="numeric"
                                selectTextOnFocus
                                style={[styles.editMacroInput, { color: theme.text, borderColor: f.color || theme.border, backgroundColor: theme.card }]}
                              />
                            </View>
                          ))}
                        </View>
                        <View style={styles.editActions}>
                          <TouchableOpacity
                            onPress={() => saveEdit(entry)}
                            style={[styles.editSaveBtn, { backgroundColor: theme.accent }]}
                          >
                            <Text style={styles.editSaveBtnText}>Save</Text>
                          </TouchableOpacity>
                          <TouchableOpacity onPress={() => setEditingId(null)} hitSlop={HIT}>
                            <Text style={[styles.editCancelText, { color: theme.textMuted }]}>Cancel</Text>
                          </TouchableOpacity>
                        </View>
                      </View>
                    )}
                  </View>
                ))
              )}
            </Card>
          );
        })}

      </ScrollView>

      <BarcodeScannerModal
        visible={scannerVisible}
        onClose={() => setScannerVisible(false)}
        onFound={(item) => logDirect(item)}
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

  dayNav: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    borderRadius: radius.lg, borderWidth: 1,
    paddingHorizontal: spacing[4], paddingVertical: spacing[3],
    marginBottom: spacing[4],
  },
  dayNavBtn: { minWidth: 70 },
  dayNavRight: { alignItems: 'flex-end' },
  dayNavArrow: { fontSize: typography.sizes.sm, fontWeight: typography.weights.semibold },
  dayNavLabel: { fontSize: typography.sizes.base, fontWeight: typography.weights.bold },

  ringsCard: { alignItems: 'center', gap: spacing[3], marginBottom: spacing[4] },
  calLabel: { fontSize: typography.sizes.sm, textAlign: 'center' },

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
  resultRow: {
    flexDirection: 'row', alignItems: 'center',
    paddingVertical: spacing[3], paddingHorizontal: spacing[4],
  },
  resultName: { fontSize: typography.sizes.base, fontWeight: typography.weights.medium },
  resultMacros: { fontSize: typography.sizes.xs, marginTop: 2 },
  resultCal: { fontSize: typography.sizes.base, fontWeight: typography.weights.semibold, marginLeft: spacing[3] },
  sep: { height: 1, marginHorizontal: spacing[4] },

  qtyPicker: {
    borderRadius: radius.lg, borderWidth: 1.5,
    padding: spacing[3], marginBottom: spacing[2], gap: spacing[2],
  },
  qtyFoodName: { fontSize: typography.sizes.base, fontWeight: typography.weights.semibold },
  qtyMacros: { fontSize: typography.sizes.xs },
  qtyControls: { flexDirection: 'row', alignItems: 'center', gap: spacing[2] },
  qtyInput: {
    width: 64, borderWidth: 1, borderRadius: radius.sm,
    paddingHorizontal: spacing[2], paddingVertical: spacing[1],
    fontSize: typography.sizes.base, textAlign: 'center',
  },
  qtyUnit: { fontSize: typography.sizes.sm },
  qtyLogBtn: { paddingHorizontal: spacing[4], paddingVertical: spacing[2], borderRadius: radius.md },
  qtyLogBtnText: { fontSize: typography.sizes.base, fontWeight: typography.weights.bold, color: '#000' },
  qtyCancel: { fontSize: typography.sizes.lg, fontWeight: '600', paddingHorizontal: spacing[1] },

  aiSuggest: {
    borderRadius: radius.lg, borderWidth: 1.5, borderStyle: 'dashed',
    padding: spacing[4], alignItems: 'center', marginBottom: spacing[2],
  },
  aiSuggestText: { fontSize: typography.sizes.sm, fontWeight: typography.weights.semibold },

  aiLoadingRow: {
    flexDirection: 'row', alignItems: 'center', gap: spacing[3],
    padding: spacing[4], justifyContent: 'center',
  },
  aiLoadingText: { fontSize: typography.sizes.sm },

  aiItemRow: {
    flexDirection: 'row', alignItems: 'center',
    paddingVertical: spacing[3], paddingHorizontal: spacing[4], gap: spacing[3],
  },
  aiCheckbox: { fontSize: 20 },
  aiItemName: { fontSize: typography.sizes.base, fontWeight: typography.weights.medium },

  logAllBtn: {
    margin: spacing[3], borderRadius: radius.md,
    paddingVertical: spacing[3], alignItems: 'center',
  },
  logAllBtnText: { fontSize: typography.sizes.base, fontWeight: typography.weights.bold, color: '#000' },

  mealSection: { marginBottom: spacing[3] },
  mealSectionHeader: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    marginBottom: spacing[2],
  },
  mealSectionTitle: { fontSize: typography.sizes.base, fontWeight: typography.weights.bold },
  mealSectionCals: { fontSize: typography.sizes.base, fontWeight: typography.weights.semibold },
  mealEmpty: { fontSize: typography.sizes.sm, fontStyle: 'italic' },

  entryRow: {
    flexDirection: 'row', alignItems: 'center',
    paddingTop: spacing[3], borderTopWidth: 1, gap: spacing[2],
  },
  entryName: { fontSize: typography.sizes.sm, fontWeight: typography.weights.medium },
  entrySub: { fontSize: typography.sizes.xs, marginTop: 2 },
  entryMacros: { alignItems: 'flex-end', minWidth: 72 },
  entryCal: { fontSize: typography.sizes.sm, fontWeight: typography.weights.bold },
  entryMacroSub: { fontSize: 10, marginTop: 1 },
  entryActions: { flexDirection: 'row', gap: spacing[1] },
  actionBtn: { borderWidth: 1, borderRadius: radius.sm, paddingHorizontal: spacing[2], paddingVertical: 3 },
  actionBtnText: { fontSize: typography.sizes.xs, fontWeight: typography.weights.semibold },

  editPanel: {
    borderTopWidth: 1, marginTop: spacing[2],
    padding: spacing[3], borderRadius: radius.md, gap: spacing[3],
  },
  editRow: { flexDirection: 'row', alignItems: 'center', gap: spacing[2] },
  editLabel: { fontSize: typography.sizes.sm, width: 48 },
  editInput: {
    width: 72, borderWidth: 1, borderRadius: radius.sm,
    paddingHorizontal: spacing[2], paddingVertical: spacing[1],
    fontSize: typography.sizes.sm, textAlign: 'center',
  },
  scaleBtn: { borderWidth: 1, borderRadius: radius.sm, paddingHorizontal: spacing[3], paddingVertical: spacing[1] },
  scaleBtnText: { fontSize: typography.sizes.xs, fontWeight: typography.weights.semibold },
  editMacroRow: { flexDirection: 'row', gap: spacing[2] },
  editMacroField: { flex: 1, alignItems: 'center', gap: 3 },
  editMacroLabel: { fontSize: 10, fontWeight: typography.weights.semibold },
  editMacroInput: {
    width: '100%', borderWidth: 1, borderRadius: radius.sm,
    paddingHorizontal: spacing[1], paddingVertical: spacing[1],
    fontSize: typography.sizes.sm, textAlign: 'center',
  },
  editActions: { flexDirection: 'row', alignItems: 'center', gap: spacing[3] },
  editSaveBtn: { paddingHorizontal: spacing[4], paddingVertical: spacing[2], borderRadius: radius.sm },
  editSaveBtnText: { fontSize: typography.sizes.sm, fontWeight: typography.weights.bold, color: '#000' },
  editCancelText: { fontSize: typography.sizes.sm },
});
