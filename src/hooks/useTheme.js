import { useState, useEffect, useContext, createContext } from 'react';
import { useColorScheme } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { getTheme } from '../theme';

// Ported from GymMate src/hooks/useTheme.js. Theme preference is device-local
// and NEVER synced to the cloud (see DATA-SYNC.md §3).
const THEME_KEY = 'macromate_theme_preference';

const ThemeContext = createContext(null);

export function ThemeProvider({ children }) {
  const systemScheme = useColorScheme();
  const [preference, setPreference] = useState('system');
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    AsyncStorage.getItem(THEME_KEY)
      .then((val) => {
        if (val) setPreference(val);
      })
      .catch(() => {
        // ignore storage errors — fall back to system theme
      })
      .finally(() => {
        setLoaded(true);
      });
  }, []);

  const resolvedDark =
    preference === 'system'
      ? systemScheme === 'dark'
      : preference === 'dark';

  const theme = getTheme(resolvedDark);

  const setTheme = async (pref) => {
    setPreference(pref);
    await AsyncStorage.setItem(THEME_KEY, pref).catch(() => {});
  };

  // Don't block render — show with default theme while preference loads
  return (
    <ThemeContext.Provider value={{ theme, preference, setTheme, isDark: resolvedDark, loaded }}>
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme() {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error('useTheme must be used within ThemeProvider');
  return ctx;
}
