import React, { useState, useEffect } from 'react';
import { View, ActivityIndicator } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import { ThemeProvider, useTheme } from './src/hooks/useTheme';
import { getSession, onAuthChange } from './src/services/auth';
import LoginScreen from './src/screens/LoginScreen';
import SpikeScreen from './src/screens/SpikeScreen';

// Phase 0 root: auth gate only. Real navigation (tabs) arrives in Phase 2.
function Root() {
  const { theme } = useTheme();
  const [session, setSession] = useState(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    getSession().then((s) => {
      setSession(s);
      setReady(true);
    });
    const unsub = onAuthChange((s) => setSession(s));
    return unsub;
  }, []);

  if (!ready) {
    return (
      <View style={{ flex: 1, backgroundColor: theme.bg, justifyContent: 'center', alignItems: 'center' }}>
        <ActivityIndicator color={theme.accent} />
      </View>
    );
  }

  return session ? <SpikeScreen session={session} /> : <LoginScreen />;
}

export default function App() {
  return (
    <SafeAreaProvider>
      <ThemeProvider>
        <StatusBar style="auto" />
        <Root />
      </ThemeProvider>
    </SafeAreaProvider>
  );
}
