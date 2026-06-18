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

  useEffect(() => {
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
