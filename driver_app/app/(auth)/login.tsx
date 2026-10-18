import React, { useState } from 'react';
import {
  View, Text, TextInput, StyleSheet, TouchableOpacity,
  KeyboardAvoidingView, Platform, ScrollView, Keyboard, TouchableWithoutFeedback,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter, Link } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useAuth } from '../../src/lib/auth';
import { getTheme } from '../../src/lib/theme';
import Button from '../../src/components/Button';

export default function Login() {
  const router = useRouter();
  const { login, role } = useAuth();
  const theme = getTheme(role);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const isDriver = role === 'driver';

  const submit = async () => {
    if (!role) return;
    setErr(null);
    setLoading(true);
    try {
      const u = await login(email.trim(), password, role);
      router.replace('/driver/home');
    } catch (e: any) {
      setErr(e.message || 'Failed to login');
    } finally {
      setLoading(false);
    }
  };

  const fillDemo = () => {
    if (isDriver) {
      setEmail('driver@demo.com');
      setPassword('Driver123!');
    } else {
      setEmail('passenger@demo.com');
      setPassword('Passenger123!');
    }
  };

  return (
    <SafeAreaView style={[styles.root, { backgroundColor: theme.bg }]} edges={['top', 'bottom']} testID="login-screen">
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <TouchableWithoutFeedback onPress={Keyboard.dismiss}>
          <ScrollView contentContainerStyle={{ flexGrow: 1 }} keyboardShouldPersistTaps="handled">
            <View style={{ padding: 24 }}>
              <TouchableOpacity onPress={() => router.back()} testID="back-btn">
                <Ionicons name="chevron-back" size={28} color={theme.text} />
              </TouchableOpacity>

              <View style={{ marginTop: 32, marginBottom: 32 }}>
                <View style={[styles.badge, { backgroundColor: isDriver ? theme.accentSoft : '#DBEAFE' }]}>
                  <Ionicons
                    name={isDriver ? 'car' : 'person'}
                    size={14}
                    color={isDriver ? theme.accent : '#2563EB'}
                  />
                  <Text style={{ color: isDriver ? theme.accent : '#2563EB', fontSize: 12, fontWeight: '600' }}>
                    {isDriver ? 'Driver sign-in' : 'Passenger sign-in'}
                  </Text>
                </View>
                <Text style={[styles.title, { color: theme.text }]}>Welcome back.</Text>
                <Text style={[styles.subtitle, { color: theme.textDim }]}>
                  Sign in to continue to your {isDriver ? 'driver cockpit' : 'rides'}.
                </Text>
              </View>

              <Text style={[styles.label, { color: theme.textDim }]}>Email</Text>
              <TextInput
                testID="login-email-input"
                style={[styles.input, { backgroundColor: theme.surfaceAlt, color: theme.text }]}
                placeholder="you@example.com"
                placeholderTextColor={theme.textFaint}
                value={email}
                onChangeText={setEmail}
                autoCapitalize="none"
                keyboardType="email-address"
              />

              <Text style={[styles.label, { color: theme.textDim, marginTop: 16 }]}>Password</Text>
              <TextInput
                testID="login-password-input"
                style={[styles.input, { backgroundColor: theme.surfaceAlt, color: theme.text }]}
                placeholder="••••••••"
                placeholderTextColor={theme.textFaint}
                value={password}
                onChangeText={setPassword}
                secureTextEntry
              />

              {err && (
                <Text testID="login-error" style={{ color: theme.danger, marginTop: 12, fontSize: 13 }}>
                  {err}
                </Text>
              )}

              <TouchableOpacity onPress={fillDemo} style={{ marginTop: 14 }} testID="fill-demo-btn">
                <Text style={{ color: theme.accent, fontSize: 13, fontWeight: '600' }}>
                  Use demo {isDriver ? 'driver' : 'passenger'} credentials →
                </Text>
              </TouchableOpacity>

              <View style={{ marginTop: 28 }}>
                <Button
                  testID="login-submit-btn"
                  title="Sign in"
                  onPress={submit}
                  loading={loading}
                  theme={theme}
                  disabled={!email || !password}
                />
              </View>

              <View style={{ flexDirection: 'row', justifyContent: 'center', marginTop: 20, gap: 6 }}>
                <Text style={{ color: theme.textDim, fontSize: 14 }}>New here?</Text>
                <Link href="/(auth)/register" asChild>
                  <TouchableOpacity testID="go-register-btn">
                    <Text style={{ color: theme.accent, fontWeight: '700', fontSize: 14 }}>Create an account</Text>
                  </TouchableOpacity>
                </Link>
              </View>
            </View>
          </ScrollView>
        </TouchableWithoutFeedback>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  title: { fontSize: 34, fontWeight: '700', letterSpacing: -1.1, marginTop: 20 },
  subtitle: { fontSize: 15, marginTop: 8, lineHeight: 22 },
  badge: { flexDirection: 'row', gap: 6, alignSelf: 'flex-start', paddingHorizontal: 10, paddingVertical: 6, borderRadius: 20, alignItems: 'center' },
  label: { fontSize: 13, fontWeight: '500', marginBottom: 8 },
  input: { height: 56, borderRadius: 18, paddingHorizontal: 18, fontSize: 16 },
});
