// Login — issues a token session (POST /api/auth/token) via AuthContext. Credentials
// are the staff's existing username/password; on success the rotating refresh token
// is stored in the secure enclave. No credentials are ever persisted.
import React, { useState } from 'react';
import { KeyboardAvoidingView, Platform, StyleSheet, Text, View } from 'react-native';
import { Screen } from '../components/Screen';
import { Button } from '../components/Button';
import { Field, H1, Muted, Card } from '../components/ui';
import { theme } from '../components/theme';
import { useAuth } from '../auth/AuthContext';
import { API_BASE_URL } from '../config';

export function LoginScreen() {
  const { login, error: authError } = useAuth();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async () => {
    if (!username.trim() || !password) {
      setError('Enter your username and password.');
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await login(username, password);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Sign in failed.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Screen scroll={false}>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={styles.wrap}
      >
        <View style={styles.brand}>
          <H1>TRUMP</H1>
          <Text style={styles.sub}>Staff · Waiter</Text>
        </View>
        <Card>
          <Field label="Username" value={username} onChangeText={setUsername} placeholder="e.g. waiter" />
          <Field label="Password" value={password} onChangeText={setPassword} placeholder="Your password" secureTextEntry />
          {error || authError ? <Text style={styles.error}>{error ?? authError}</Text> : null}
          <Button label="Sign in" onPress={submit} loading={busy} />
        </Card>
        <Muted>Connected to {API_BASE_URL}</Muted>
      </KeyboardAvoidingView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  wrap: { flex: 1, justifyContent: 'center', padding: theme.space.lg, gap: theme.space.lg },
  brand: { alignItems: 'center', gap: theme.space.xs },
  sub: { color: theme.colors.gold, fontSize: theme.font.md, letterSpacing: 2, fontWeight: '700' },
  error: { color: theme.colors.red, fontSize: theme.font.sm }
});
