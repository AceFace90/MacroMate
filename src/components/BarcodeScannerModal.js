import React, { useState, useEffect, useRef } from 'react';
import {
  View, Text, Modal, TouchableOpacity, StyleSheet, ActivityIndicator, Platform,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useTheme } from '../hooks/useTheme';
import { spacing, typography } from '../theme';
import { getProductByBarcode } from '../services/openFoodFactsAPI';
import { searchByBarcode as openNutritionByBarcode } from '../services/openNutritionSearch';
import { BrowserMultiFormatReader, DecodeHintType, BarcodeFormat } from '@zxing/library';

// Web: ZXing works on all browsers including iPhone Safari — no BarcodeDetector needed.
// Native: expo-camera CameraView with built-in barcode scanning.

let CameraView, useCameraPermissions;
if (Platform.OS !== 'web') {
  const Camera = require('expo-camera');
  CameraView = Camera.CameraView;
  useCameraPermissions = Camera.useCameraPermissions;
}

function WebBarcodeScanner({ onDetected, onError }) {
  const { theme } = useTheme();
  const videoRef = useRef(null);
  const readerRef = useRef(null);
  const activeRef = useRef(true);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    activeRef.current = true;

    (async () => {
      try {
        const hints = new Map();
        hints.set(DecodeHintType.POSSIBLE_FORMATS, [
          BarcodeFormat.EAN_13, BarcodeFormat.EAN_8,
          BarcodeFormat.UPC_A, BarcodeFormat.UPC_E,
          BarcodeFormat.CODE_128, BarcodeFormat.CODE_39,
        ]);
        hints.set(DecodeHintType.TRY_HARDER, true);

        const reader = new BrowserMultiFormatReader(hints);
        readerRef.current = reader;

        // Wait for video element to mount
        let retries = 0;
        while (!videoRef.current && retries++ < 20) {
          await new Promise(r => setTimeout(r, 100));
        }
        if (!activeRef.current || !videoRef.current) return;

        setReady(true);
        reader.decodeFromConstraints(
          { video: { facingMode: 'environment' } },
          videoRef.current,
          (result, err) => {
            if (!activeRef.current) return;
            if (result) {
              activeRef.current = false;
              onDetected(result.getText());
            }
            // NotFoundException fires continuously when no barcode in frame — ignore
          }
        );
      } catch (err) {
        if (activeRef.current) onError(err.message || 'Camera error');
      }
    })();

    return () => {
      activeRef.current = false;
      if (readerRef.current) {
        try { readerRef.current.reset(); } catch (_) {}
      }
    };
  }, []);

  return (
    <View style={styles.webCameraContainer}>
      {!ready && <ActivityIndicator style={StyleSheet.absoluteFill} size="large" color={theme.accent} />}
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
      // Tier 1: OpenNutrition local DB (best AU data, no network needed)
      let product = await openNutritionByBarcode(barcode);

      // Tier 2: Open Food Facts API
      if (!product) {
        product = await getProductByBarcode(barcode);
      }

      if (!product) {
        setErrorMsg(`No product found for barcode ${barcode}`);
        setStage('error');
        return;
      }

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
});
