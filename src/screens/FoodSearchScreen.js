import React, { useState, useCallback, useRef } from 'react';
import {
  View, Text, StyleSheet, FlatList, TouchableOpacity,
  ActivityIndicator, Alert, TextInput, Platform,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useTheme } from '../hooks/useTheme';
import { spacing, typography, colors } from '../theme';
import foodMatching from '../services/foodMatching';
import gemini from '../services/gemini';
import { useLog, todayStr } from '../store/logStore';
import { useGeminiKey } from '../hooks/useGeminiKey';
import BarcodeScannerModal from '../components/BarcodeScannerModal';
import LabelScannerModal from '../components/LabelScannerModal';

// ── Search result item ────────────────────────────────────────────────────────

function FoodRow({ item, onPress }) {
  const { theme } = useTheme();
  const sourceColor = item.source === 'afcd' ? colors.protein
    : item.source === 'opennutrition' ? colors.carbs
    : item.source === 'ai' ? colors.fat
    : theme.textMuted;
  return (
    <TouchableOpacity style={styles.result} onPress={onPress} activeOpacity={0.7}>
      <View style={{ flex: 1 }}>
        <Text style={[styles.foodName, { color: theme.text }]} numberOfLines={1}>{item.name}</Text>
        <Text style={[styles.macros, { color: theme.textMuted }]}>
          P {item.protein_g ?? 0}g · C {item.carbs_g ?? 0}g · F {item.fat_g ?? 0}g
        </Text>
      </View>
      <View style={{ alignItems: 'flex-end' }}>
        <Text style={[styles.calories, { color: theme.text }]}>{item.calories ?? 0} kcal</Text>
        <Text style={[styles.source, { color: sourceColor }]}>{item.source}</Text>
      </View>
    </TouchableOpacity>
  );
}

// ── AI meal decompose result ──────────────────────────────────────────────────

function AIMealRow({ item, onPress, loading }) {
  const { theme } = useTheme();
  if (loading) {
    return (
      <View style={styles.aiItem}>
        <ActivityIndicator size="small" color={theme.accent} />
        <Text style={[styles.aiName, { color: theme.textMuted }]}>Looking up {item.name}…</Text>
      </View>
    );
  }
  if (!item.resolved) {
    return (
      <View style={styles.aiItem}>
        <Text style={[styles.aiName, { color: theme.textMuted }]}>⚠ {item.name} — not found</Text>
      </View>
    );
  }
  return (
    <TouchableOpacity style={styles.aiItem} onPress={onPress} activeOpacity={0.7}>
      <View style={{ flex: 1 }}>
        <Text style={[styles.aiName, { color: theme.text }]}>{item.resolved.name}</Text>
        <Text style={[styles.macros, { color: theme.textMuted }]}>
          {item.quantity}{item.unit} · P {item.resolved.protein_g ?? 0}g · C {item.resolved.carbs_g ?? 0}g · F {item.resolved.fat_g ?? 0}g
        </Text>
      </View>
      <Text style={[styles.calories, { color: theme.text }]}>{item.resolved.calories ?? 0} kcal</Text>
    </TouchableOpacity>
  );
}

// ── Main screen ───────────────────────────────────────────────────────────────

export default function FoodSearchScreen({ navigation }) {
  const { theme } = useTheme();
  const { addEntry } = useLog();
  const { key: geminiKey, hasKey } = useGeminiKey();

  // DB search mode
  const [query, setQuery] = useState('');
  const [results, setResults] = useState([]);
  const [searching, setSearching] = useState(false);
  const [debounceTimer, setDebounceTimer] = useState(null);

  // Barcode scanner
  const [scannerVisible, setScannerVisible] = useState(false);

  // Label scanner
  const [labelVisible, setLabelVisible] = useState(false);

  // AI meal mode
  const [mode, setMode] = useState('search'); // 'search' | 'ai'
  const [mealText, setMealText] = useState('');
  const [aiItems, setAiItems] = useState([]); // [{ name, quantity, unit, resolved?, loading? }]
  const [aiLoading, setAiLoading] = useState(false);

  // Photo meal (web hidden file input ref)
  const photoInputRef = useRef(null);

  // ── DB search ───────────────────────────────────────────────────────────────

  const search = useCallback((text) => {
    if (debounceTimer) clearTimeout(debounceTimer);
    if (!text.trim()) { setResults([]); return; }
    const timer = setTimeout(async () => {
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
    setDebounceTimer(timer);
  }, [debounceTimer]);

  const handleChangeText = (text) => { setQuery(text); search(text); };

  const logFood = async (item) => {
    try {
      await addEntry(todayStr(), item);
      navigation.goBack();
    } catch (e) {
      Alert.alert('Error', e.message);
    }
  };

  // ── AI meal decompose ───────────────────────────────────────────────────────

  const handleAIAnalyze = async () => {
    if (!mealText.trim()) return;
    if (!hasKey) {
      Alert.alert('Gemini key needed', 'Add your API key in Profile → AI Settings.');
      return;
    }
    setAiLoading(true);
    setAiItems([]);
    try {
      const { items } = await gemini.decomposeMeal(mealText, geminiKey);
      // Seed list with loading state
      const seeded = items.map(i => ({ ...i, loading: true, resolved: null }));
      setAiItems(seeded);
      setAiLoading(false);

      // Resolve each item via the DB tiers in parallel
      const resolved = await Promise.all(
        items.map(async (item, idx) => {
          const query = `${item.quantity}${item.unit} ${item.name}`;
          try {
            const match = await foodMatching.matchFood(query);
            const r = match ? { ...match } : null;
            setAiItems(prev => prev.map((p, i) => i === idx ? { ...p, loading: false, resolved: r } : p));
            return { ...item, resolved: r };
          } catch {
            setAiItems(prev => prev.map((p, i) => i === idx ? { ...p, loading: false, resolved: null } : p));
            return { ...item, resolved: null };
          }
        })
      );
      setAiItems(resolved);
    } catch (e) {
      setAiLoading(false);
      Alert.alert('AI error', e.message);
    }
  };

  const logAllAI = async () => {
    const toLog = aiItems.filter(i => i.resolved);
    for (const item of toLog) {
      await addEntry(todayStr(), item.resolved);
    }
    navigation.goBack();
  };

  // ── AI photo meal ───────────────────────────────────────────────────────────

  const resolveAIItems = async (items) => {
    const seeded = items.map(i => ({ ...i, loading: true, resolved: null }));
    setAiItems(seeded);
    setAiLoading(false);

    const resolved = await Promise.all(
      items.map(async (item, idx) => {
        const q = `${item.quantity}${item.unit} ${item.name}`;
        try {
          const match = await foodMatching.matchFood(q);
          const r = match ? { ...match } : null;
          setAiItems(prev => prev.map((p, i) => i === idx ? { ...p, loading: false, resolved: r } : p));
          return { ...item, resolved: r };
        } catch {
          setAiItems(prev => prev.map((p, i) => i === idx ? { ...p, loading: false, resolved: null } : p));
          return { ...item, resolved: null };
        }
      })
    );
    setAiItems(resolved);
  };

  const handlePhotoMeal = async () => {
    if (!hasKey) {
      Alert.alert('Gemini key needed', 'Add your API key in Profile → AI Settings.');
      return;
    }

    if (Platform.OS === 'web') {
      // Trigger the hidden file input
      photoInputRef.current?.click();
      return;
    }

    // Native: use expo-image-picker
    try {
      const ImagePicker = await import('expo-image-picker');
      const perm = await ImagePicker.requestCameraPermissionsAsync();
      if (!perm.granted) {
        Alert.alert('Permission needed', 'Camera permission is required to take a photo.');
        return;
      }
      const result = await ImagePicker.launchCameraAsync({
        base64: true,
        quality: 0.7,
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
      });
      if (result.canceled || !result.assets?.[0]) return;
      const asset = result.assets[0];
      const base64 = asset.base64;
      const mimeType = asset.mimeType || 'image/jpeg';
      setAiLoading(true);
      setAiItems([]);
      const { items } = await gemini.analyzeMealPhoto(base64, mimeType, geminiKey);
      await resolveAIItems(items);
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
        reader.onload = () => {
          // Strip the data-URI prefix (e.g. "data:image/jpeg;base64,")
          const dataUrl = reader.result;
          const b64 = dataUrl.split(',')[1];
          resolve(b64);
        };
        reader.onerror = reject;
        reader.readAsDataURL(file);
      });
      const mimeType = file.type || 'image/jpeg';
      const { items } = await gemini.analyzeMealPhoto(base64, mimeType, geminiKey);
      await resolveAIItems(items);
    } catch (e) {
      setAiLoading(false);
      Alert.alert('AI error', e.message);
    }
    // Reset input so the same file can be re-selected if needed
    e.target.value = '';
  };

  // ── Render ──────────────────────────────────────────────────────────────────

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: theme.bg }}>
      <View style={styles.container}>
        {/* Header */}
        <View style={styles.header}>
          <TouchableOpacity onPress={() => navigation.goBack()} hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}>
            <Text style={[styles.back, { color: theme.accent }]}>← Back</Text>
          </TouchableOpacity>
          <Text style={[styles.title, { color: theme.text }]}>Log Food</Text>
          <View style={{ width: 60 }} />
        </View>

        {/* Mode toggle */}
        <View style={[styles.modeRow, { backgroundColor: theme.card, borderColor: theme.border }]}>
          {['search', 'ai'].map(m => (
            <TouchableOpacity
              key={m}
              style={[styles.modeBtn, mode === m && { backgroundColor: theme.accentBg, borderColor: theme.accentBorder }]}
              onPress={() => setMode(m)}
            >
              <Text style={[styles.modeBtnText, { color: mode === m ? theme.accent : theme.textMuted }]}>
                {m === 'search' ? '🔍 Search' : `✨ AI Meal${!hasKey ? ' 🔒' : ''}`}
              </Text>
            </TouchableOpacity>
          ))}
        </View>

        {/* Search mode */}
        {mode === 'search' && (
          <>
            <View style={[styles.searchBar, { backgroundColor: theme.input, borderColor: theme.border }]}>
              <TextInput
                style={[styles.searchInput, { color: theme.text }]}
                placeholder="200g chicken breast, banana…"
                placeholderTextColor={theme.textMuted}
                value={query}
                onChangeText={handleChangeText}
                autoFocus
                autoCorrect={false}
              />
              {searching
                ? <ActivityIndicator size="small" color={theme.accent} />
                : (
                  <View style={styles.iconRow}>
                    <TouchableOpacity onPress={() => setScannerVisible(true)} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                      <Text style={[styles.scanIcon, { color: theme.accent }]}>▦</Text>
                    </TouchableOpacity>
                    {hasKey && (
                      <TouchableOpacity onPress={() => setLabelVisible(true)} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                        <Text style={[styles.scanIcon, { color: theme.accent }]}>📷</Text>
                      </TouchableOpacity>
                    )}
                  </View>
                )
              }
            </View>
            {results.length > 0 ? (
              <FlatList
                data={results}
                keyExtractor={(item, i) => `${item.name}-${i}`}
                renderItem={({ item }) => <FoodRow item={item} onPress={() => logFood(item)} />}
                ItemSeparatorComponent={() => <View style={[styles.sep, { backgroundColor: theme.border }]} />}
                keyboardShouldPersistTaps="handled"
                style={{ marginTop: spacing[3] }}
              />
            ) : query.length > 0 && !searching ? (
              <Text style={[styles.hint, { color: theme.textMuted }]}>No results for "{query}"</Text>
            ) : !query ? (
              <Text style={[styles.hint, { color: theme.textMuted }]}>Type a food name, quantity, or brand</Text>
            ) : null}
          </>
        )}

        {/* AI meal mode */}
        {mode === 'ai' && (
          <>
            {!hasKey && (
              <View style={[styles.keyBanner, { backgroundColor: theme.accentBg, borderColor: theme.accentBorder }]}>
                <Text style={[styles.keyBannerText, { color: theme.accent }]}>
                  Add a Gemini API key in Profile → AI Settings to use this feature.
                </Text>
              </View>
            )}
            <View style={[styles.searchBar, { backgroundColor: theme.input, borderColor: theme.border }]}>
              <TextInput
                style={[styles.searchInput, { color: theme.text }]}
                placeholder="e.g. chicken schnitzel, chips, salad, beer"
                placeholderTextColor={theme.textMuted}
                value={mealText}
                onChangeText={setMealText}
                autoFocus
                multiline
              />
            </View>
            <TouchableOpacity
              style={[styles.aiBtn, { backgroundColor: hasKey ? theme.accent : theme.border }]}
              onPress={handleAIAnalyze}
              disabled={aiLoading || !hasKey}
            >
              {aiLoading
                ? <ActivityIndicator size="small" color="#000" />
                : <Text style={[styles.aiBtnText, { color: hasKey ? '#000' : theme.textMuted }]}>Analyse meal</Text>
              }
            </TouchableOpacity>
            {hasKey && (
              <TouchableOpacity
                style={[styles.aiBtn, styles.aiBtnOutlined, { backgroundColor: theme.card, borderColor: theme.accent }]}
                onPress={handlePhotoMeal}
                disabled={aiLoading}
              >
                <Text style={[styles.aiBtnText, { color: aiLoading ? theme.textMuted : theme.accent }]}>📷 Photo Meal</Text>
              </TouchableOpacity>
            )}
            {Platform.OS === 'web' && (
              <input
                ref={photoInputRef}
                type="file"
                accept="image/*"
                capture="environment"
                style={{ display: 'none' }}
                onChange={handlePhotoFileChange}
              />
            )}

            {aiItems.length > 0 && (
              <>
                <View style={[styles.sep, { backgroundColor: theme.border, marginVertical: spacing[3] }]} />
                {aiItems.map((item, i) => (
                  <AIMealRow
                    key={i}
                    item={item}
                    loading={item.loading}
                    onPress={() => item.resolved && logFood(item.resolved)}
                  />
                ))}
                {aiItems.some(i => !i.loading && i.resolved) && (
                  <TouchableOpacity
                    style={[styles.aiBtn, { backgroundColor: theme.accent, marginTop: spacing[4] }]}
                    onPress={logAllAI}
                  >
                    <Text style={[styles.aiBtnText, { color: '#000' }]}>
                      Log all ({aiItems.filter(i => i.resolved).length} items)
                    </Text>
                  </TouchableOpacity>
                )}
              </>
            )}
          </>
        )}
      </View>

      <BarcodeScannerModal
        visible={scannerVisible}
        onClose={() => setScannerVisible(false)}
        onFound={(item) => logFood(item)}
      />
      <LabelScannerModal
        visible={labelVisible}
        onClose={() => setLabelVisible(false)}
        onFound={(item) => logFood(item)}
        geminiKey={geminiKey}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: spacing[4] },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: spacing[3] },
  back: { fontSize: typography.sizes.base, fontWeight: typography.weights.semibold, width: 60 },
  title: { fontSize: typography.sizes.lg, fontWeight: typography.weights.bold },
  modeRow: { flexDirection: 'row', borderRadius: 10, borderWidth: 1, overflow: 'hidden', marginBottom: spacing[3] },
  modeBtn: { flex: 1, paddingVertical: spacing[3], alignItems: 'center', borderWidth: 1, borderColor: 'transparent' },
  modeBtnText: { fontSize: typography.sizes.sm, fontWeight: typography.weights.semibold },
  searchBar: {
    flexDirection: 'row', alignItems: 'center',
    borderRadius: 10, borderWidth: 1,
    paddingHorizontal: spacing[3], paddingVertical: spacing[3],
    marginBottom: spacing[2],
  },
  searchInput: { flex: 1, fontSize: typography.sizes.base },
  iconRow: { flexDirection: 'row', alignItems: 'center', gap: spacing[3] },
  scanIcon: { fontSize: 22, fontWeight: '700' },
  result: { flexDirection: 'row', alignItems: 'center', paddingVertical: spacing[3], paddingHorizontal: spacing[1] },
  foodName: { fontSize: typography.sizes.base, fontWeight: typography.weights.medium },
  macros: { fontSize: typography.sizes.xs, marginTop: 2 },
  calories: { fontSize: typography.sizes.base, fontWeight: typography.weights.semibold },
  source: { fontSize: 10, marginTop: 2, textTransform: 'uppercase' },
  sep: { height: 1, marginHorizontal: spacing[1] },
  hint: { textAlign: 'center', marginTop: spacing[8], fontSize: typography.sizes.sm },
  aiBtn: { borderRadius: 10, paddingVertical: spacing[3], alignItems: 'center' },
  aiBtnOutlined: { borderWidth: 1.5, marginTop: spacing[2] },
  aiBtnText: { fontSize: typography.sizes.base, fontWeight: typography.weights.bold },
  aiItem: { flexDirection: 'row', alignItems: 'center', paddingVertical: spacing[3], gap: spacing[3] },
  aiName: { fontSize: typography.sizes.base, fontWeight: typography.weights.medium },
  keyBanner: { borderRadius: 8, borderWidth: 1, padding: spacing[3], marginBottom: spacing[3] },
  keyBannerText: { fontSize: typography.sizes.sm },
});
