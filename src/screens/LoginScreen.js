import React, { useState } from 'react';
import { View, Text, StyleSheet, Alert } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useTheme } from '../hooks/useTheme';
import { spacing, typography } from '../theme';
import Card from '../components/Card';
import Button from '../components/Button';
import { signInWithGoogle } from '../services/auth';

// Phase 0 login. Mirrors GymMate's LoginScreen layout (sister-app feel):
// app title in accent green, a feature card, a Google sign-in button.
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
        <Text style={[styles.title, { color: theme.accent }]}>MacroMate</Text>
        <Text style={[styles.tagline, { color: theme.textSecondary }]}>
          Track food. Hit your macros. Powered by AI.
        </Text>

        <Card style={styles.featureCard}>
          <Text style={[styles.feature, { color: theme.text }]}>🍳  Log meals by photo, barcode, or text</Text>
          <Text style={[styles.feature, { color: theme.text }]}>🎯  Daily protein / carbs / fat rings</Text>
          <Text style={[styles.feature, { color: theme.text }]}>☁️  Sync across devices, secure cloud backup</Text>
        </Card>

        <Button
          title="Sign in with Google"
          variant="secondary"
          size="lg"
          loading={loading}
          onPress={handleGoogle}
          style={{ marginTop: spacing[6], alignSelf: 'stretch' }}
        />

        <Text style={[styles.footer, { color: theme.textMuted }]}>
          Sync across devices · Secure cloud backup
        </Text>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: 'center',
    paddingHorizontal: spacing[6],
  },
  title: {
    fontSize: typography.sizes['3xl'],
    fontWeight: typography.weights.bold,
    textAlign: 'center',
  },
  tagline: {
    fontSize: typography.sizes.base,
    textAlign: 'center',
    marginTop: spacing[2],
    marginBottom: spacing[8],
  },
  featureCard: {
    gap: spacing[3],
  },
  feature: {
    fontSize: typography.sizes.base,
  },
  footer: {
    fontSize: typography.sizes.sm,
    textAlign: 'center',
    marginTop: spacing[5],
  },
});
