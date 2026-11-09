import React, { useState, useEffect } from 'react';
import { View, ActivityIndicator } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { ThemeProvider, useTheme } from './src/hooks/useTheme';
import { LogProvider } from './src/store/logStore';
import { useProfile } from './src/hooks/useProfile';
import { GeminiKeyProvider } from './src/hooks/useGeminiKey';
import { getSession, onAuthChange } from './src/services/auth';
import LoginScreen from './src/screens/LoginScreen';
import AppNavigator from './src/navigation/AppNavigator';

// Dev-only: ?theme=light|dark forces the stored theme preference (for screenshots).
if (__DEV__ && typeof window !== 'undefined') {
  const t = new URLSearchParams(window.location?.search || '').get('theme');
  if (t === 'light' || t === 'dark') window.localStorage?.setItem('macromate_theme_preference', t);
}

function AuthedApp({ session }) {
  const { profile, targets, refresh } = useProfile(session);
  return (
    <LogProvider session={session} targets={targets}>
      <AppNavigator session={session} targets={targets} onTargetsChange={refresh} />
    </LogProvider>
  );
}

function Root() {
  const { theme } = useTheme();
  const [session, setSession] = useState(null);
  const [ready, setReady] = useState(false);

  // Web: visible keyboard focus ring (mouse clicks don't trigger :focus-visible). !important wins over
  // the inline `outlineStyle: 'none'` still set on text inputs.
  useEffect(() => {
    if (typeof document === 'undefined') return;
    let el = document.getElementById('mm-focus-ring');
    if (!el) {
      el = document.createElement('style');
      el.id = 'mm-focus-ring';
      document.head.appendChild(el);
    }
    el.textContent = `:focus-visible { outline: 2px solid ${theme.accent} !important; outline-offset: 2px; }`;
  }, [theme.accent]);

  useEffect(() => {
    // Dev-only: http://localhost:8082/?preview renders the app with a fake local session
    // so screens can be checked (and screenshotted) without Google sign-in. Stripped from prod builds.
    if (__DEV__ && typeof window !== 'undefined' && window.location?.search?.includes('preview')) {
      setSession({ user: { id: '00000000-0000-0000-0000-000000000000', email: 'preview@localhost' }, preview: true });
      setReady(true);
      return;
    }
    getSession().then(s => { setSession(s); setReady(true); });
    const unsub = onAuthChange(s => setSession(s));
    return unsub;
  }, []);

  if (!ready) {
    return (
      <View style={{ flex: 1, backgroundColor: theme.bg, justifyContent: 'center', alignItems: 'center' }}>
        <ActivityIndicator color={theme.accent} />
      </View>
    );
  }

  return session ? <AuthedApp session={session} /> : <LoginScreen />;
}

export default function App() {
  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaProvider>
        <ThemeProvider>
          <GeminiKeyProvider>
            <StatusBar style="auto" />
            <Root />
          </GeminiKeyProvider>
        </ThemeProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}
