import React, { useState } from 'react';
import { View, Text, StyleSheet, ScrollView, Alert } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useTheme } from '../hooks/useTheme';
import { spacing, typography } from '../theme';
import Card from '../components/Card';
import Button from '../components/Button';
import Input from '../components/Input';
import { signOut } from '../services/auth';
import { supabase } from '../services/supabase';

// Phase 0 spike screen — proves the full RLS round-trip:
//   signed in -> write a profiles row -> read it back.
// This is the Phase 0 exit gate, not a real feature. Replaced by the real
// Dashboard in Phase 2.
export default function SpikeScreen({ session }) {
  const { theme } = useTheme();
  const [name, setName] = useState('');
  const [status, setStatus] = useState('');
  const [profile, setProfile] = useState(null);
  const [busy, setBusy] = useState(false);

  const userId = session?.user?.id;
  const email = session?.user?.email;

  // Upsert the current user's profile row (RLS ensures it can only be theirs).
  const saveProfile = async () => {
    setBusy(true);
    setStatus('Saving…');
    try {
      const { error } = await supabase
        .from('profiles')
        .upsert({ id: userId, name, updated_at: new Date().toISOString() });
      if (error) throw error;
      setStatus('✅ Saved (RLS allowed write to own row)');
    } catch (e) {
      setStatus('❌ ' + (e.message ?? String(e)));
    } finally {
      setBusy(false);
    }
  };

  const loadProfile = async () => {
    setBusy(true);
    setStatus('Loading…');
    try {
      const { data, error } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', userId)
        .single();
      if (error) throw error;
      setProfile(data);
      setStatus('✅ Read back own row');
    } catch (e) {
      setStatus('❌ ' + (e.message ?? String(e)));
    } finally {
      setBusy(false);
    }
  };

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: theme.bg }}>
      <ScrollView contentContainerStyle={styles.container}>
        <Text style={[styles.title, { color: theme.accent }]}>Phase 0 — RLS Spike</Text>
        <Text style={[styles.sub, { color: theme.textSecondary }]}>
          Signed in as {email}
        </Text>

        <Card style={{ gap: spacing[3], marginTop: spacing[5] }}>
          <Input label="Display name" value={name} onChangeText={setName} placeholder="e.g. Will" />
          <Button title="Save profile row" loading={busy} onPress={saveProfile} />
          <Button title="Read my profile row" variant="secondary" loading={busy} onPress={loadProfile} />
        </Card>

        {!!status && (
          <Text style={[styles.status, { color: theme.text }]}>{status}</Text>
        )}

        {profile && (
          <Card style={{ marginTop: spacing[4] }}>
            <Text style={[styles.code, { color: theme.textSecondary }]}>
              {JSON.stringify(profile, null, 2)}
            </Text>
          </Card>
        )}

        <Button
          title="Sign out"
          variant="ghost"
          onPress={() => signOut().catch((e) => Alert.alert('Error', e.message))}
          style={{ marginTop: spacing[8] }}
        />
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { padding: spacing[6] },
  title: { fontSize: typography.sizes['2xl'], fontWeight: typography.weights.bold },
  sub: { fontSize: typography.sizes.sm, marginTop: spacing[1] },
  status: { fontSize: typography.sizes.base, marginTop: spacing[4], textAlign: 'center' },
  code: { fontSize: typography.sizes.sm, fontFamily: 'monospace' },
});
