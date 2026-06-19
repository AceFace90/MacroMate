import React, { useState, useEffect, useRef } from 'react';
import {
  View, Text, Modal, TouchableOpacity, StyleSheet, ActivityIndicator, Platform, TextInput,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useTheme } from '../hooks/useTheme';
import { spacing, typography } from '../theme';
import { getProductByBarcode } from '../services/openFoodFactsAPI';

// Web fallback: use BarcodeDetector API where available, else show unsupported message.
// Native: uses expo-camera CameraView with barcode scanning.

let CameraView, useCameraPermissions;
if (Platform.OS !== 'web') {
  const Camera = require('expo-camera');
  CameraView = Camera.CameraView;
  useCameraPermissions = Camera.useCameraPermissions;
}

function ManualBarcodeForm({ onDetected, theme }) {
  const [barcodeInput, setBarcodeInput] = useState('');
  return (
    <View style={styles.manualForm}>
      <Text style={[styles.manualHeading, { color: theme.text }]}>Enter Barcode Manually</Text>
      <TextInput
        style={[styles.manualInput, { backgroundColor: theme.input, color: theme.text, borderColor: theme.border }]}
        value={barcodeInput}
        onChangeText={setBarcodeInput}
        keyboardType="numeric"
        maxLength={14}
        placeholder="0 12345 67890 5"
        placeholderTextColor={theme.textMuted}
        returnKeyType="done"
        onSubmitEditing={() => { if (barcodeInput.trim()) onDetected(barcodeInput.trim()); }}
      />
      <TouchableOpacity
        style={[styles.lookupBtn, { backgroundColor: theme.accent, opacity: barcodeInput.trim() ? 1 : 0.4 }]}
        onPress={() => { if (barcodeInput.trim()) onDetected(barcodeInput.trim()); }}
        disabled={!barcodeInput.trim()}
      >
        <Text style={styles.lookupBtnText}>Look Up</Text>
      </TouchableOpacity>
      <Text style={[styles.manualNote, { color: theme.textMuted }]}>
        You can also try Chrome on Android for live scanning
      </Text>
    </View>
  );
}

function WebBarcodeScanner({ onDetected, onError }) {
  const { theme } = useTheme();
  const videoRef = useRef(null);
  const streamRef = useRef(null);
  const rafRef = useRef(null);
  const [status, setStatus] = useState('starting'); // starting | scanning | unsupported | cameraError
  const [cameraError, setCameraError] = useState('');
  const [showManual, setShowManual] = useState(false);

  useEffect(() => {
    if (typeof BarcodeDetector === 'undefined') {
      setStatus('unsupported');
      return;
    }
    let active = true;
    const detector = new BarcodeDetector({ formats: ['ean_13', 'ean_8', 'upc_a', 'upc_e', 'code_128', 'code_39', 'qr_code'] });

    navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' } })
      .then(stream => {
        if (!active) { stream.getTracks().forEach(t => t.stop()); return; }
        streamRef.current = stream;
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          videoRef.current.play();
          setStatus('scanning');
          const tick = async () => {
            if (!active || !videoRef.current) return;
            try {
              const barcodes = await detector.detect(videoRef.current);
              if (barcodes.length > 0) {
                active = false;
                onDetected(barcodes[0].rawValue);
                return;
              }
            } catch (_) {}
            rafRef.current = requestAnimationFrame(tick);
          };
          rafRef.current = requestAnimationFrame(tick);
        }
      })
      .catch(err => {
        if (active) {
          setCameraError(err.message || 'Camera access denied');
          setStatus('cameraError');
        }
      });

    return () => {
      active = false;
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
      if (streamRef.current) streamRef.current.getTracks().forEach(t => t.stop());
    };
  }, []);

  if (status === 'unsupported') {
    return <ManualBarcodeForm onDetected={onDetected} theme={theme} />;
  }

  if (status === 'cameraError' || showManual) {
    return (
      <View style={styles.centered}>
        {status === 'cameraError' && !showManual && (
          <>
            <Text style={[styles.errorText, { color: theme.text }]}>{cameraError}</Text>
            <TouchableOpacity onPress={() => setShowManual(true)}>
              <Text style={[styles.manualLink, { color: theme.accent }]}>Enter barcode manually</Text>
            </TouchableOpacity>
          </>
        )}
        {showManual && <ManualBarcodeForm onDetected={onDetected} theme={theme} />}
      </View>
    );
  }

  return (
    <View style={styles.webCameraContainer}>
      {status === 'starting' && <ActivityIndicator style={StyleSheet.absoluteFill} size="large" />}
      {/* eslint-disable-next-line jsx-a11y/media-has-caption */}
      <video
        ref={videoRef}
        style={{ width: '100%', height: '100%', objectFit: 'cover', borderRadius: 12 }}
        playsInline
        muted
      />
      <View style={styles.scanOverlay} pointerEvents="none">
        <View style={styles.scanFrame} />
      </View>
    </View>
  );
}

function NativeBarcodeScanner({ onDetected }) {
  const [permission, requestPermission] = useCameraPermissions();
  const { theme } = useTheme();

  useEffect(() => {
    if (!permission?.granted) requestPermission();
  }, []);

  if (!permission?.granted) {
    return (
      <TouchableOpacity onPress={requestPermission} style={[styles.permBtn, { backgroundColor: theme.accent }]}>
        <Text style={[styles.permBtnText, { color: '#000' }]}>Allow Camera Access</Text>
      </TouchableOpacity>
    );
  }

  return (
    <View style={styles.nativeCameraContainer}>
      <CameraView
        style={StyleSheet.absoluteFill}
        facing="back"
        barcodeScannerSettings={{ barcodeTypes: ['ean13', 'ean8', 'upc_a', 'upc_e', 'code128', 'code39', 'qr'] }}
        onBarcodeScanned={({ data }) => onDetected(data)}
      />
      <View style={styles.scanOverlay} pointerEvents="none">
        <View style={styles.scanFrame} />
      </View>
    </View>
  );
}

export default function BarcodeScannerModal({ visible, onClose, onFound }) {
  const { theme } = useTheme();
  const [stage, setStage] = useState('scan'); // scan | loading | error
  const [errorMsg, setErrorMsg] = useState('');
  const scanningRef = useRef(false);

  const reset = () => {
    scanningRef.current = false;
    setStage('scan');
    setErrorMsg('');
  };

  const handleClose = () => { reset(); onClose?.(); };

  const handleDetected = async (barcode) => {
    if (scanningRef.current) return;
    scanningRef.current = true;
    setStage('loading');
    try {
      const product = await getProductByBarcode(barcode);
      if (!product) {
        setErrorMsg(`No product found for barcode ${barcode}`);
        setStage('error');
        return;
      }
      // Normalize to the shape FoodSearchScreen's logFood expects
      const item = {
        name: product.food_name || product.product_name || 'Unknown',
        calories: product.calories ?? 0,
        protein_g: product.protein_g ?? 0,
        carbs_g: product.carbs_g ?? 0,
        fat_g: product.fat_g ?? 0,
        fiber_g: product.fiber_g ?? 0,
        sodium_mg: product.sodium_mg ?? 0,
        sugar_g: product.sugar_g ?? 0,
        serving_size_g: product.serving_size_g ?? 100,
        serving_size_display: product.serving_size_display,
        source: 'barcode',
        barcode,
      };
      onFound?.(item);
      handleClose();
    } catch (e) {
      setErrorMsg(e.message || 'Lookup failed');
      setStage('error');
    }
  };

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={handleClose}>
      <SafeAreaView style={[styles.modal, { backgroundColor: theme.bg }]}>
        {/* Header */}
        <View style={styles.header}>
          <Text style={[styles.title, { color: theme.text }]}>Scan Barcode</Text>
          <TouchableOpacity onPress={handleClose} hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}>
            <Text style={[styles.closeBtn, { color: theme.accent }]}>Close</Text>
          </TouchableOpacity>
        </View>

        <View style={styles.body}>
          {stage === 'scan' && (
            <>
              <Text style={[styles.hint, { color: theme.textMuted }]}>
                Point at a food barcode — it'll look up the product automatically.
              </Text>
              {Platform.OS === 'web'
                ? <WebBarcodeScanner onDetected={handleDetected} onError={(msg) => { setErrorMsg(msg); setStage('error'); }} />
                : <NativeBarcodeScanner onDetected={handleDetected} />
              }
            </>
          )}

          {stage === 'loading' && (
            <View style={styles.centered}>
              <ActivityIndicator size="large" color={theme.accent} />
              <Text style={[styles.hint, { color: theme.textMuted, marginTop: spacing[3] }]}>Looking up product…</Text>
            </View>
          )}

          {stage === 'error' && (
            <View style={styles.centered}>
              <Text style={[styles.errorText, { color: theme.text }]}>{errorMsg}</Text>
              <TouchableOpacity style={[styles.retryBtn, { backgroundColor: theme.accent }]} onPress={reset}>
                <Text style={[styles.retryBtnText, { color: '#000' }]}>Try Again</Text>
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
  webCameraContainer: { width: '100%', aspectRatio: 1, borderRadius: 12, overflow: 'hidden', position: 'relative' },
  nativeCameraContainer: { width: '100%', aspectRatio: 1, borderRadius: 12, overflow: 'hidden', position: 'relative' },
  scanOverlay: { ...StyleSheet.absoluteFillObject, alignItems: 'center', justifyContent: 'center' },
  scanFrame: {
    width: '60%', aspectRatio: 1,
    borderWidth: 2, borderColor: 'rgba(255,255,255,0.8)',
    borderRadius: 8,
    shadowColor: '#000', shadowOpacity: 0.4, shadowRadius: 8,
  },
  centered: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: spacing[4] },
  errorText: { fontSize: typography.sizes.base, textAlign: 'center' },
  retryBtn: { borderRadius: 10, paddingVertical: spacing[3], paddingHorizontal: spacing[6] },
  retryBtnText: { fontSize: typography.sizes.base, fontWeight: '700' },
  permBtn: { borderRadius: 10, paddingVertical: spacing[3], alignItems: 'center' },
  permBtnText: { fontSize: typography.sizes.base, fontWeight: '700' },
  manualForm: { width: '100%', alignItems: 'center', gap: spacing[4] },
  manualHeading: { fontSize: typography.sizes.lg, fontWeight: '700', textAlign: 'center' },
  manualInput: {
    width: '100%', borderWidth: 1, borderRadius: 10,
    paddingHorizontal: spacing[4], paddingVertical: spacing[3],
    fontSize: typography.sizes.base, textAlign: 'center', letterSpacing: 2,
  },
  lookupBtn: { borderRadius: 10, paddingVertical: spacing[3], paddingHorizontal: spacing[8], alignItems: 'center' },
  lookupBtnText: { fontSize: typography.sizes.base, fontWeight: '700', color: '#000' },
  manualNote: { fontSize: typography.sizes.xs, textAlign: 'center' },
  manualLink: { fontSize: typography.sizes.sm, fontWeight: '600', textDecorationLine: 'underline' },
});
