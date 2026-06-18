// Auth service — thin wrapper over Supabase Auth.
// Phase 0: Google OAuth. (Email/magic-link can be added later additively —
// see DATA-SYNC.md §4.5b on account linking.)

import { Platform } from 'react-native';
import * as WebBrowser from 'expo-web-browser';
import * as Linking from 'expo-linking';
import { supabase } from './supabase';

WebBrowser.maybeCompleteAuthSession();

// Sign in with Google. On web, Supabase redirects the page; on native we open
// the system browser and capture the redirect back to the app scheme.
export async function signInWithGoogle() {
  if (Platform.OS === 'web') {
    const { data, error } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: { redirectTo: window.location.origin },
    });
    if (error) throw error;
    return data;
  }

  // Native flow
  const redirectTo = Linking.createURL('auth-callback');
  const { data, error } = await supabase.auth.signInWithOAuth({
    provider: 'google',
    options: { redirectTo, skipBrowserRedirect: true },
  });
  if (error) throw error;

  const result = await WebBrowser.openAuthSessionAsync(data.url, redirectTo);
  if (result.type === 'success' && result.url) {
    // Exchange the returned code/tokens for a session.
    const url = new URL(result.url);
    const params = new URLSearchParams(url.hash ? url.hash.slice(1) : url.search);
    const access_token = params.get('access_token');
    const refresh_token = params.get('refresh_token');
    if (access_token && refresh_token) {
      const { error: sessErr } = await supabase.auth.setSession({ access_token, refresh_token });
      if (sessErr) throw sessErr;
    }
  }
  return result;
}

export async function signOut() {
  const { error } = await supabase.auth.signOut();
  if (error) throw error;
}

export async function getSession() {
  const { data } = await supabase.auth.getSession();
  return data.session;
}

// Subscribe to auth state changes; returns an unsubscribe function.
export function onAuthChange(callback) {
  const { data } = supabase.auth.onAuthStateChange((_event, session) => {
    callback(session);
  });
  return () => data.subscription.unsubscribe();
}
