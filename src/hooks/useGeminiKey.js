import React, { useState, useEffect, useCallback, createContext, useContext } from 'react';
import * as SecureStore from 'expo-secure-store';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Platform } from 'react-native';

const KEY_NAME = 'macromate_gemini_key';

// SecureStore unavailable on web — fall back to AsyncStorage.
// Key is NEVER synced to Supabase.
async function readKey() {
  if (Platform.OS === 'web') return AsyncStorage.getItem(KEY_NAME);
  return SecureStore.getItemAsync(KEY_NAME);
}
async function writeKey(v) {
  if (Platform.OS === 'web') return AsyncStorage.setItem(KEY_NAME, v);
  return SecureStore.setItemAsync(KEY_NAME, v);
}
async function clearKey() {
  if (Platform.OS === 'web') return AsyncStorage.removeItem(KEY_NAME);
  return SecureStore.deleteItemAsync(KEY_NAME);
}

export const GeminiKeyContext = createContext(null);

export function GeminiKeyProvider({ children }) {
  const [key, setKey] = useState(null);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    readKey().then(k => { setKey(k || null); setLoaded(true); });
  }, []);

  const saveKey = useCallback(async (value) => {
    const trimmed = value?.trim() || '';
    if (trimmed) { await writeKey(trimmed); setKey(trimmed); }
    else { await clearKey(); setKey(null); }
  }, []);

  return (
    <GeminiKeyContext.Provider value={{ key, loaded, saveKey, hasKey: !!key }}>
      {children}
    </GeminiKeyContext.Provider>
  );
}

export function useGeminiKey() {
  return useContext(GeminiKeyContext);
}
