import React, { useState, useRef, useEffect } from 'react';
import {
  View,
  Text,
  TextInput,
  StyleSheet,
  TouchableOpacity,
  KeyboardAvoidingView,
  Platform,
  TouchableWithoutFeedback,
  Keyboard,
  ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useAuth } from '../../src/lib/auth';
import { getTheme } from '../../src/lib/theme';
import Button from '../../src/components/Button';

export default function VerifyEmailScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ email?: string; dev_code?: string }>();
  const { verifyEmailOtp, sendEmailOtp, role } = useAuth();
  const theme = getTheme(role);

  const email = (params.email || '').toLowerCase().trim();
  const [digits, setDigits] = useState(['', '', '', '', '', '']);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [resendCooldown, setResendCooldown] = useState(60);
  const [resending, setResending] = useState(false);
  const [infoMessage, setInfoMessage] = useState<string | null>(null);

  const inputRefs = useRef<Array<TextInput | null>>([]);

  // Auto-fill dev_code if provided in testing
  useEffect(() => {
    if (params.dev_code && params.dev_code.length === 6) {
      setDigits(params.dev_code.split(''));
    }
  }, [params.dev_code]);

  // Resend cooldown timer
  useEffect(() => {
    if (resendCooldown <= 0) return;
    const timer = setInterval(() => {
      setResendCooldown((prev) => prev - 1);
    }, 1000);
    return () => clearInterval(timer);
  }, [resendCooldown]);

  const handleDigitChange = (index: number, val: string) => {
    const cleaned = val.replace(/[^0-9]/g, '');
    const newDigits = [...digits];

    if (cleaned.length > 1) {
      // Handle paste
      const pasted = cleaned.slice(0, 6).split('');
      for (let i = 0; i < 6; i++) {
        newDigits[i] = pasted[i] || '';
      }
      setDigits(newDigits);
      const nextFocus = Math.min(pasted.length, 5);
      inputRefs.current[nextFocus]?.focus();
      return;
    }

    newDigits[index] = cleaned;
    setDigits(newDigits);

    if (cleaned && index < 5) {
      inputRefs.current[index + 1]?.focus();
    }
  };

  const handleKeyPress = (index: number, e: any) => {
    if (e.nativeEvent.key === 'Backspace' && !digits[index] && index > 0) {
      inputRefs.current[index - 1]?.focus();
    }
  };

  const code = digits.join('');

  const submit = async () => {
    if (code.length !== 6) {
      setErr('Please enter all 6 digits');
      return;
    }
    setErr(null);
    setLoading(true);
    try {
      await verifyEmailOtp(email, code);
      router.replace('/passenger/home');
    } catch (e: any) {
      setErr(e.message || 'Verification failed. Please check the code and try again.');
    } finally {
      setLoading(false);
    }
  };

  const handleResend = async () => {
    if (resendCooldown > 0 || resending) return;
    setResending(true);
    setErr(null);
    setInfoMessage(null);
    try {
      const res = await sendEmailOtp(email);
      setInfoMessage('New code sent to your email.');
      setResendCooldown(60);
      if (res.dev_code) {
        setDigits(res.dev_code.split(''));
      }
    } catch (e: any) {
      setErr(e.message || 'Failed to resend code');
    } finally {
      setResending(false);
    }
  };

  return (
    <SafeAreaView style={[styles.root, { backgroundColor: theme.bg }]} edges={['top', 'bottom']}>
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <TouchableWithoutFeedback onPress={Keyboard.dismiss}>
          <View style={{ flex: 1, padding: 24, justifyContent: 'space-between' }}>
            <View>
              <TouchableOpacity onPress={() => router.back()} style={{ marginBottom: 24 }}>
                <Ionicons name="chevron-back" size={28} color={theme.text} />
              </TouchableOpacity>

              <View style={[styles.iconCircle, { backgroundColor: '#DBEAFE' }]}>
                <Ionicons name="mail-unread-outline" size={32} color="#2563EB" />
              </View>

              <Text style={[styles.title, { color: theme.text }]}>Check your email</Text>
              <Text style={[styles.subtitle, { color: theme.textDim }]}>
                We sent a 6-digit verification code to:
              </Text>
              <Text style={[styles.emailBadge, { color: theme.accent, backgroundColor: theme.surfaceAlt }]}>
                {email || 'your email'}
              </Text>

              {/* 6 Digit Input Boxes */}
              <View style={styles.codeContainer}>
                {digits.map((digit, i) => (
                  <TextInput
                    key={i}
                    ref={(ref) => (inputRefs.current[i] = ref)}
                    style={[
                      styles.digitBox,
                      {
                        backgroundColor: theme.surfaceAlt,
                        color: theme.text,
                        borderColor: digit ? theme.accent : theme.border,
                      },
                    ]}
                    value={digit}
                    onChangeText={(val) => handleDigitChange(i, val)}
                    onKeyPress={(e) => handleKeyPress(i, e)}
                    keyboardType="number-pad"
                    maxLength={1}
                    selectTextOnFocus
                    textAlign="center"
                    autoFocus={i === 0}
                  />
                ))}
              </View>

              {err && (
                <View style={[styles.alertBanner, { backgroundColor: '#FEF2F2', borderColor: '#FCA5A5' }]}>
                  <Ionicons name="alert-circle" size={18} color="#DC2626" />
                  <Text style={{ color: '#DC2626', fontSize: 13, flex: 1, marginLeft: 8 }}>{err}</Text>
                </View>
              )}

              {infoMessage && (
                <View style={[styles.alertBanner, { backgroundColor: '#F0FDF4', borderColor: '#86EFAC' }]}>
                  <Ionicons name="checkmark-circle" size={18} color="#16A34A" />
                  <Text style={{ color: '#16A34A', fontSize: 13, flex: 1, marginLeft: 8 }}>{infoMessage}</Text>
                </View>
              )}

              {/* Resend Action */}
              <View style={styles.resendContainer}>
                <Text style={{ color: theme.textDim, fontSize: 14 }}>Didn't receive the email? </Text>
                <TouchableOpacity onPress={handleResend} disabled={resendCooldown > 0 || resending}>
                  <Text
                    style={{
                      color: resendCooldown > 0 ? theme.textFaint : theme.accent,
                      fontWeight: '700',
                      fontSize: 14,
                    }}
                  >
                    {resending ? 'Sending...' : resendCooldown > 0 ? `Resend in ${resendCooldown}s` : 'Resend code'}
                  </Text>
                </TouchableOpacity>
              </View>
            </View>

            <View style={{ marginBottom: 12 }}>
              <Button
                title="Verify and Continue"
                onPress={submit}
                loading={loading}
                theme={theme}
                disabled={code.length !== 6}
              />
            </View>
          </View>
        </TouchableWithoutFeedback>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  iconCircle: {
    width: 64,
    height: 64,
    borderRadius: 32,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 20,
  },
  title: { fontSize: 30, fontWeight: '700', letterSpacing: -0.8, marginBottom: 8 },
  subtitle: { fontSize: 15, lineHeight: 22 },
  emailBadge: {
    fontSize: 15,
    fontWeight: '600',
    marginTop: 6,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 8,
    alignSelf: 'flex-start',
    marginBottom: 28,
  },
  codeContainer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 20,
    gap: 8,
  },
  digitBox: {
    flex: 1,
    height: 60,
    borderRadius: 14,
    fontSize: 24,
    fontWeight: '700',
    borderWidth: 1.5,
  },
  alertBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 12,
    borderRadius: 12,
    borderWidth: 1,
    marginBottom: 16,
  },
  resendContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 12,
  },
});
