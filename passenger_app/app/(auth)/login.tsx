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
  const { login, loginWithGoogle, role } = useAuth();
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
      router.replace('/passenger/home');
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

  const handleSocialSignIn = async (provider: 'google' | 'apple') => {
    if (!role) return;
    setErr(null);
    setLoading(true);
    try {
      // In development/test mode, use simulated token
      const testToken = `test_${provider}_token_passenger`;
      await loginWithGoogle(testToken, role);
      router.replace('/passenger/home');
    } catch (e: any) {
      setErr(e.message || `${provider} sign-in failed`);
    } finally {
      setLoading(false);
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

              <View style={{ marginTop: 24, marginBottom: 24 }}>
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

              {!isDriver && (
                <View style={{ marginBottom: 24, gap: 12 }}>
                  <TouchableOpacity
                    style={[styles.socialBtn, { backgroundColor: theme.surfaceAlt, borderColor: theme.border }]}
                    onPress={() => handleSocialSignIn('google')}
                    disabled={loading}
                  >
                    <Ionicons name="logo-google" size={20} color="#EA4335" />
                    <Text style={[styles.socialBtnText, { color: theme.text }]}>Continue with Google</Text>
                  </TouchableOpacity>

                  <TouchableOpacity
                    style={[styles.socialBtn, { backgroundColor: theme.surfaceAlt, borderColor: theme.border }]}
                    onPress={() => handleSocialSignIn('apple')}
                    disabled={loading}
                  >
                    <Ionicons name="logo-apple" size={22} color={theme.text} />
                    <Text style={[styles.socialBtnText, { color: theme.text }]}>Continue with Apple</Text>
                  </TouchableOpacity>

                  <View style={styles.dividerRow}>
                    <View style={[styles.dividerLine, { backgroundColor: theme.border }]} />
                    <Text style={[styles.dividerText, { color: theme.textFaint }]}>or sign in with email</Text>
                    <View style={[styles.dividerLine, { backgroundColor: theme.border }]} />
                  </View>
                </View>
              )}

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
  socialBtn: {
    height: 54,
    borderRadius: 16,
    borderWidth: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 12,
  },
  socialBtnText: {
    fontSize: 15,
    fontWeight: '600',
  },
  dividerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginVertical: 12,
    gap: 12,
  },
  dividerLine: {
    flex: 1,
    height: 1,
  },
  dividerText: {
    fontSize: 12,
    fontWeight: '500',
  },
});
