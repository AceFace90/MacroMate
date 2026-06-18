// Supabase client — the cloud backend (Auth + Postgres + RLS).
// Replaces MacroMate v1's entire Express/Passport/Postgres server.
//
// The publishable key is safe to ship in the client: RLS is what protects data,
// not the secrecy of this key (see Supabase API-keys docs). Never put the
// `sb_secret_*` key here.
//
// Config comes from app.json -> expo.extra so it's not hardcoded in source.

import 'react-native-url-polyfill/auto';
import { createClient } from '@supabase/supabase-js';
import AsyncStorage from '@react-native-async-storage/async-storage';
import Constants from 'expo-constants';

const extra = Constants.expoConfig?.extra ?? {};
const supabaseUrl = extra.supabaseUrl;
const supabaseAnonKey = extra.supabaseAnonKey;

if (!supabaseUrl || !supabaseAnonKey) {
  console.warn(
    '[supabase] Missing supabaseUrl / supabaseAnonKey in app.json -> expo.extra'
  );
}

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    // Persist the session across app restarts using AsyncStorage.
    storage: AsyncStorage,
    autoRefreshToken: true,
    persistSession: true,
    // We handle the OAuth redirect URL ourselves on native; on web Supabase
    // reads the URL hash automatically.
    detectSessionInUrl: true,
  },
});

export default supabase;
