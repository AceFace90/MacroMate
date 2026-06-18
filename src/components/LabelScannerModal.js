import React, { useState, useRef } from 'react';
import {
  View, Text, Modal, TouchableOpacity, StyleSheet, ActivityIndicator,
  Platform, Image,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useTheme } from '../hooks/useTheme';
import { spacing, typography } from '../theme';
import gemini from '../services/gemini';

// Converts a uri to base64. Web: fetch + FileReader. Native: expo-file-system.
async function uriToBase64(uri) {
  if (Platform.OS === 'web') {
    const res = await fetch(uri);
    const blob = await res.blob();
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result.split(',')[1]);
      reader.onerror = reject;
      reader.readAsDataURL(blob);
    });
  }
  const FileSystem = require('expo-file-system');
  return FileSystem.readAsStringAsync(uri, { encoding: FileSystem.EncodingType.Base64 });
}

function WebImagePicker({ onImage, onError }) {
  const inputRef = useRef(null);

  const handleChange = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const url = URL.createObjectURL(file);
    try {
      const base64 = await uriToBase64(url);
      onImage({ uri: url, base64, mimeType: file.type || 'image/jpeg' });
    } catch (err) {
      onError(err.message || 'Failed to read image');
    }
  };

  return (
    <View style={styles.centered}>
      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        capture="environment"
        style={{ display: 'none' }}
        onChange={handleChange}
      />
      <TouchableOpacity
        style={styles.pickBtn}
        onPress={() => inputRef.current?.click()}
      >
        <Text style={styles.pickIcon}>📷</Text>
        <Text style={styles.pickLabel}>Take photo or choose image</Text>
      </TouchableOpacity>
    </View>
  );
}

function NativeImagePicker({ onImage, onError }) {
  const handlePress = async () => {
    try {
      let CameraView, useCameraPermissions;
      // Use ImagePicker if available, else fall back to camera
      try {
        const IP = require('expo-image-picker');
        const perm = await IP.requestMediaLibraryPermissionsAsync();
        if (!perm.granted) {
          const camPerm = await IP.requestCameraPermissionsAsync();
          if (!camPerm.granted) { onError('Camera permission denied'); return; }
          const result = await IP.launchCameraAsync({ base64: true, quality: 0.7 });
          if (!result.canceled) {
            const asset = result.assets[0];
            onImage({ uri: asset.uri, base64: asset.base64, mimeType: 'image/jpeg' });
          }
          return;
        }
        const result = await IP.launchImageLibraryAsync({ base64: true, quality: 0.7 });
        if (!result.canceled) {
          const asset = result.assets[0];
          onImage({ uri: asset.uri, base64: asset.base64, mimeType: 'image/jpeg' });
        }
      } catch {
        // expo-image-picker not installed — use expo-camera capture
        const { Camera } = require('expo-camera');
        const { status } = await Camera.requestCameraPermissionsAsync();
        if (status !== 'granted') { onError('Camera permission denied'); return; }
        onError('Install expo-image-picker for label scanning on native');
      }
    } catch (err) {
      onError(err.message || 'Failed to open camera');
    }
  };

  return (
    <View style={styles.centered}>
      <TouchableOpacity style={styles.pickBtn} onPress={handlePress}>
        <Text style={styles.pickIcon}>📷</Text>
        <Text style={styles.pickLabel}>Take photo or choose image</Text>
      </TouchableOpacity>
    </View>
  );
}

export default function LabelScannerModal({ visible, onClose, onFound, geminiKey }) {
  const { theme } = useTheme();
  const [stage, setStage] = useState('pick'); // pick | preview | analyzing | result | error
  const [imageUri, setImageUri] = useState(null);
  const [imageBase64, setImageBase64] = useState(null);
  const [imageMime, setImageMime] = useState('image/jpeg');
  const [result, setResult] = useState(null);
  const [errorMsg, setErrorMsg] = useState('');

  const reset = () => {
    setStage('pick');
    setImageUri(null);
    setImageBase64(null);
    setResult(null);
    setErrorMsg('');
  };

  const handleClose = () => { reset(); onClose?.(); };

  const handleImage = ({ uri, base64, mimeType }) => {
    setImageUri(uri);
    setImageBase64(base64);
    setImageMime(mimeType || 'image/jpeg');
    setStage('preview');
  };

  const analyze = async () => {
    setStage('analyzing');
    try {
      const data = await gemini.analyzeLabel(imageBase64, imageMime, geminiKey);
      setResult(data);
      setStage('result');
    } catch (e) {
      setErrorMsg(e.message || 'Analysis failed');
      setStage('error');
    }
  };

  const handleLog = () => {
    if (!result) return;
    const item = {
      name: result.name || 'Label scan',
      calories: result.calories ?? 0,
      protein_g: result.protein_g ?? 0,
      carbs_g: result.carbs_g ?? 0,
      fat_g: result.fat_g ?? 0,
      fiber_g: result.fiber_g ?? 0,
      sodium_mg: result.sodium_mg ?? 0,
      sugar_g: result.sugar_g ?? 0,
      serving_size_g: result.serving_size_g ?? 100,
      serving_size_display: result.serving_size_display,
      source: 'label',
      confidence_score: result.confidence_score,
    };
    onFound?.(item);
    handleClose();
  };

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={handleClose}>
      <SafeAreaView style={[styles.modal, { backgroundColor: theme.bg }]}>
        {/* Header */}
        <View style={styles.header}>
          <Text style={[styles.title, { color: theme.text }]}>Scan Label</Text>
          <TouchableOpacity onPress={handleClose} hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}>
            <Text style={[styles.closeBtn, { color: theme.accent }]}>Close</Text>
          </TouchableOpacity>
        </View>

        <View style={styles.body}>
          {stage === 'pick' && (
            <>
              <Text style={[styles.hint, { color: theme.textMuted }]}>
                Photo a nutrition label — Gemini will extract the numbers.
              </Text>
              {Platform.OS === 'web'
                ? <WebImagePicker onImage={handleImage} onError={(m) => { setErrorMsg(m); setStage('error'); }} />
                : <NativeImagePicker onImage={handleImage} onError={(m) => { setErrorMsg(m); setStage('error'); }} />
              }
            </>
          )}

          {stage === 'preview' && imageUri && (
            <View style={styles.centered}>
              <Image source={{ uri: imageUri }} style={styles.preview} resizeMode="contain" />
              <Text style={[styles.hint, { color: theme.textMuted, marginTop: spacing[3] }]}>
                Looks good? Gemini will read the nutrition panel.
              </Text>
              <View style={styles.btnRow}>
                <TouchableOpacity style={[styles.secondaryBtn, { borderColor: theme.border }]} onPress={reset}>
                  <Text style={[styles.secondaryBtnText, { color: theme.textMuted }]}>Retake</Text>
                </TouchableOpacity>
                <TouchableOpacity style={[styles.primaryBtn, { backgroundColor: theme.accent }]} onPress={analyze}>
                  <Text style={styles.primaryBtnText}>Analyse</Text>
                </TouchableOpacity>
              </View>
            </View>
          )}

          {stage === 'analyzing' && (
            <View style={styles.centered}>
              <ActivityIndicator size="large" color={theme.accent} />
              <Text style={[styles.hint, { color: theme.textMuted, marginTop: spacing[3] }]}>
                Reading label…
              </Text>
            </View>
          )}

          {stage === 'result' && result && (
            <View style={styles.resultContainer}>
              <Text style={[styles.resultName, { color: theme.text }]}>{result.name}</Text>
              {result.serving_size_display && (
                <Text style={[styles.serving, { color: theme.textMuted }]}>
                  Per serving: {result.serving_size_display}
                </Text>
              )}
              <View style={[styles.macroGrid, { borderColor: theme.border }]}>
                {[
                  ['Calories', result.calories, 'kcal'],
                  ['Protein', result.protein_g, 'g'],
                  ['Carbs', result.carbs_g, 'g'],
                  ['Fat', result.fat_g, 'g'],
                  ['Fiber', result.fiber_g, 'g'],
                  ['Sodium', result.sodium_mg, 'mg'],
                ].map(([label, val, unit]) => (
                  <View key={label} style={[styles.macroCell, { borderColor: theme.border }]}>
                    <Text style={[styles.macroVal, { color: theme.text }]}>{val ?? 0}{unit}</Text>
                    <Text style={[styles.macroLabel, { color: theme.textMuted }]}>{label}</Text>
                  </View>
                ))}
              </View>
              {result.confidence_score < 70 && (
                <Text style={[styles.confidence, { color: theme.textMuted }]}>
                  ⚠ Low confidence ({result.confidence_score}%) — check values before logging.
                </Text>
              )}
              <View style={styles.btnRow}>
                <TouchableOpacity style={[styles.secondaryBtn, { borderColor: theme.border }]} onPress={reset}>
                  <Text style={[styles.secondaryBtnText, { color: theme.textMuted }]}>Rescan</Text>
                </TouchableOpacity>
                <TouchableOpacity style={[styles.primaryBtn, { backgroundColor: theme.accent }]} onPress={handleLog}>
                  <Text style={styles.primaryBtnText}>Log this</Text>
                </TouchableOpacity>
              </View>
            </View>
          )}

          {stage === 'error' && (
            <View style={styles.centered}>
              <Text style={[styles.errorText, { color: theme.text }]}>{errorMsg}</Text>
              <TouchableOpacity style={[styles.primaryBtn, { backgroundColor: theme.accent }]} onPress={reset}>
                <Text style={styles.primaryBtnText}>Try Again</Text>
              </TouchableOpacity>
            </View>
          )}
        </View>
      </SafeAreaView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  modal: { flex: 1 },
  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: spacing[5], paddingVertical: spacing[4],
  },
  title: { fontSize: typography.sizes.xl, fontWeight: '700' },
  closeBtn: { fontSize: typography.sizes.base, fontWeight: '600' },
  body: { flex: 1, padding: spacing[5] },
  hint: { fontSize: typography.sizes.sm, textAlign: 'center', marginBottom: spacing[4] },
  centered: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: spacing[4] },
  pickBtn: { alignItems: 'center', gap: spacing[2] },
  pickIcon: { fontSize: 48 },
  pickLabel: { fontSize: typography.sizes.base, fontWeight: '600', color: '#888' },
  preview: { width: '100%', height: 260, borderRadius: 12 },
  btnRow: { flexDirection: 'row', gap: spacing[3], width: '100%' },
  primaryBtn: { flex: 1, borderRadius: 10, paddingVertical: spacing[3], alignItems: 'center' },
  primaryBtnText: { fontSize: typography.sizes.base, fontWeight: '700', color: '#000' },
  secondaryBtn: { flex: 1, borderRadius: 10, paddingVertical: spacing[3], alignItems: 'center', borderWidth: 1 },
  secondaryBtnText: { fontSize: typography.sizes.base, fontWeight: '600' },
  resultContainer: { gap: spacing[3] },
  resultName: { fontSize: typography.sizes.lg, fontWeight: '700', textAlign: 'center' },
  serving: { fontSize: typography.sizes.sm, textAlign: 'center' },
  macroGrid: {
    flexDirection: 'row', flexWrap: 'wrap',
    borderWidth: 1, borderRadius: 10, overflow: 'hidden',
  },
  macroCell: {
    width: '33.33%', padding: spacing[3], alignItems: 'center',
    borderRightWidth: 1, borderBottomWidth: 1,
  },
  macroVal: { fontSize: typography.sizes.base, fontWeight: '700' },
  macroLabel: { fontSize: typography.sizes.xs, marginTop: 2 },
  confidence: { fontSize: typography.sizes.xs, textAlign: 'center' },
  errorText: { fontSize: typography.sizes.base, textAlign: 'center' },
});
