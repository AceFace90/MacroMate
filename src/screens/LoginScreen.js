import React, { useState } from 'react';
import { View, Text, StyleSheet, Alert, Image, TouchableOpacity, ActivityIndicator } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useTheme } from '../hooks/useTheme';
import { fontFamily } from '../theme';
import Icon from '../components/Icon';
import { signInWithGoogle } from '../services/auth';

const FEATURES = [
  { icon: 'sparkles', title: 'Log meals by photo, barcode, or text', color: '#af52de' },
  { icon: 'chart',    title: 'Daily protein / carbs / fat rings',    color: '#3b82f6' },
  { icon: 'cloud',    title: 'Sync across devices, secure cloud backup', color: '#0a84ff' },
];

export default function LoginScreen() {
  const { theme } = useTheme();
  const [loading, setLoading] = useState(false);

  const handleGoogle = async () => {
    setLoading(true);
    try {
      await signInWithGoogle();
    } catch (e) {
      Alert.alert('Sign-in failed', e.message ?? String(e));
    } finally {
      setLoading(false);
    }
  };

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: theme.bg }}>
      <View style={styles.container}>
        <View style={styles.inner}>
          <Image source={require('../../assets/icon.png')} style={styles.logo} accessibilityLabel="MacroMate logo" />
          <Text style={[styles.title, { color: theme.text, fontFamily }]}>MacroMate</Text>
          <Text style={[styles.tagline, { color: theme.textSecondary, fontFamily }]}>
            Track food. Hit your macros. Powered by AI.
          </Text>

          <View style={styles.features}>
            {FEATURES.map((f) => (
              <View key={f.icon} style={styles.featureRow}>
                <View style={[styles.featureIcon, { backgroundColor: theme.card }]}>
                  <Icon name={f.icon} size={22} color={f.color} />
                </View>
                <Text style={[styles.feature, { color: theme.text, fontFamily }]}>{f.title}</Text>
              </View>
            ))}
          </View>

          <TouchableOpacity
            onPress={handleGoogle}
            disabled={loading}
            activeOpacity={0.8}
            accessibilityRole="button"
            accessibilityLabel="Sign in with Google"
            style={[styles.googleBtn, { backgroundColor: theme.elevated, borderColor: theme.separator }]}
          >
            {loading ? (
              <ActivityIndicator color={theme.accent} />
            ) : (
              <Text style={[styles.googleText, { color: theme.text, fontFamily }]}>Sign in with Google</Text>
            )}
          </TouchableOpacity>
        </View>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 24 },
  inner:     { width: '100%', maxWidth: 420, alignItems: 'center' },
  logo:      { width: 96, height: 96, borderRadius: 22 },
  title:     { fontSize: 34, fontWeight: '700', marginTop: 20 },
  tagline:   { fontSize: 17, textAlign: 'center', marginTop: 6, marginBottom: 32 },
  features:  { alignSelf: 'stretch', gap: 16, marginBottom: 36 },
  featureRow:{ flexDirection: 'row', alignItems: 'center', gap: 14 },
  featureIcon:{ width: 44, height: 44, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  feature:   { flex: 1, fontSize: 17 },
  googleBtn: {
    alignSelf: 'stretch', height: 50, borderRadius: 12, borderWidth: 1,
    alignItems: 'center', justifyContent: 'center',
  },
  googleText:{ fontSize: 17, fontWeight: '600' },
});
