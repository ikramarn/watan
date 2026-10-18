import React, { useState } from 'react';
import {
  View, Text, TextInput, StyleSheet, TouchableOpacity, ScrollView,
  KeyboardAvoidingView, Platform, Keyboard, TouchableWithoutFeedback,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter, Link } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useAuth } from '../../src/lib/auth';
import { getTheme } from '../../src/lib/theme';
import Button from '../../src/components/Button';

export default function Register() {
  const router = useRouter();
  const { register, role } = useAuth();
  const theme = getTheme(role);
  const isDriver = role === 'driver';

  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [password, setPassword] = useState('');
  const [vehicleMake, setVehicleMake] = useState('');
  const [vehiclePlate, setVehiclePlate] = useState('');
  const [vehicleType, setVehicleType] = useState<'economy' | 'premium' | 'xl'>('economy');
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const submit = async () => {
    if (!role) return;
    setErr(null);
    setLoading(true);
    try {
      const payload: any = { name, email: email.trim(), phone, password, role };
      if (isDriver) {
        payload.vehicle_make = vehicleMake || 'Toyota Camry';
        payload.vehicle_plate = vehiclePlate || 'XYZ-000';
        payload.vehicle_type = vehicleType;
      }
      const u = await register(payload);
      router.replace('/driver/home');
    } catch (e: any) {
      setErr(e.message || 'Registration failed');
    } finally {
      setLoading(false);
    }
  };

  return (
    <SafeAreaView style={[styles.root, { backgroundColor: theme.bg }]} edges={['top', 'bottom']} testID="register-screen">
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <TouchableWithoutFeedback onPress={Keyboard.dismiss}>
          <ScrollView contentContainerStyle={{ padding: 24, paddingBottom: 60 }} keyboardShouldPersistTaps="handled">
            <TouchableOpacity onPress={() => router.back()} testID="back-btn">
              <Ionicons name="chevron-back" size={28} color={theme.text} />
            </TouchableOpacity>

            <Text style={[styles.title, { color: theme.text }]}>
              Create {isDriver ? 'Driver' : 'Passenger'} account
            </Text>
            <Text style={[styles.subtitle, { color: theme.textDim }]}>
              {isDriver ? 'Start earning on your own schedule.' : 'Get going in minutes.'}
            </Text>

            <Field label="Full name" theme={theme}>
              <TextInput
                testID="reg-name-input"
                style={[styles.input, { backgroundColor: theme.surfaceAlt, color: theme.text }]}
                placeholderTextColor={theme.textFaint}
                placeholder="Alex Rivera"
                value={name}
                onChangeText={setName}
              />
            </Field>

            <Field label="Email" theme={theme}>
              <TextInput
                testID="reg-email-input"
                style={[styles.input, { backgroundColor: theme.surfaceAlt, color: theme.text }]}
                placeholderTextColor={theme.textFaint}
                placeholder="you@example.com"
                value={email}
                onChangeText={setEmail}
                autoCapitalize="none"
                keyboardType="email-address"
              />
            </Field>

            <Field label="Phone" theme={theme}>
              <TextInput
                testID="reg-phone-input"
                style={[styles.input, { backgroundColor: theme.surfaceAlt, color: theme.text }]}
                placeholderTextColor={theme.textFaint}
                placeholder="+1 555 010 0101"
                value={phone}
                onChangeText={setPhone}
                keyboardType="phone-pad"
              />
            </Field>

            <Field label="Password" theme={theme}>
              <TextInput
                testID="reg-password-input"
                style={[styles.input, { backgroundColor: theme.surfaceAlt, color: theme.text }]}
                placeholderTextColor={theme.textFaint}
                placeholder="At least 6 characters"
                value={password}
                onChangeText={setPassword}
                secureTextEntry
              />
            </Field>

            {isDriver && (
              <>
                <Field label="Vehicle make & model" theme={theme}>
                  <TextInput
                    testID="reg-vehicle-make-input"
                    style={[styles.input, { backgroundColor: theme.surfaceAlt, color: theme.text }]}
                    placeholderTextColor={theme.textFaint}
                    placeholder="Toyota Camry · Black"
                    value={vehicleMake}
                    onChangeText={setVehicleMake}
                  />
                </Field>
                <Field label="License plate" theme={theme}>
                  <TextInput
                    testID="reg-vehicle-plate-input"
                    style={[styles.input, { backgroundColor: theme.surfaceAlt, color: theme.text }]}
                    placeholderTextColor={theme.textFaint}
                    placeholder="ABC-1234"
                    value={vehiclePlate}
                    onChangeText={setVehiclePlate}
                  />
                </Field>
                <Text style={[styles.label, { color: theme.textDim }]}>Vehicle class</Text>
                <View style={{ flexDirection: 'row', gap: 10, marginBottom: 16 }}>
                  {(['economy', 'premium', 'xl'] as const).map((t) => (
                    <TouchableOpacity
                      key={t}
                      testID={`vehicle-type-${t}`}
                      onPress={() => setVehicleType(t)}
                      style={{
                        flex: 1,
                        height: 48,
                        borderRadius: 14,
                        backgroundColor: vehicleType === t ? theme.accent : theme.surfaceAlt,
                        alignItems: 'center',
                        justifyContent: 'center',
                      }}
                    >
                      <Text
                        style={{
                          color: vehicleType === t ? theme.ctaText : theme.text,
                          fontWeight: '600',
                          textTransform: 'capitalize',
                        }}
                      >
                        {t}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </View>
              </>
            )}

            {err && <Text testID="reg-error" style={{ color: theme.danger, marginBottom: 8 }}>{err}</Text>}

            <Button
              testID="reg-submit-btn"
              title="Create account"
              onPress={submit}
              loading={loading}
              theme={theme}
              disabled={!email || !password || !name}
            />

            <View style={{ flexDirection: 'row', justifyContent: 'center', marginTop: 20, gap: 6 }}>
              <Text style={{ color: theme.textDim }}>Already have an account?</Text>
              <Link href="/(auth)/login" asChild>
                <TouchableOpacity testID="go-login-btn">
                  <Text style={{ color: theme.accent, fontWeight: '700' }}>Sign in</Text>
                </TouchableOpacity>
              </Link>
            </View>
          </ScrollView>
        </TouchableWithoutFeedback>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

function Field({ label, theme, children }: any) {
  return (
    <View style={{ marginBottom: 16 }}>
      <Text style={[styles.label, { color: theme.textDim }]}>{label}</Text>
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  title: { fontSize: 32, fontWeight: '700', letterSpacing: -1, marginTop: 20 },
  subtitle: { fontSize: 15, marginTop: 8, marginBottom: 28 },
  label: { fontSize: 13, fontWeight: '500', marginBottom: 8 },
  input: { height: 54, borderRadius: 16, paddingHorizontal: 16, fontSize: 15 },
});
