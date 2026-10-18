import React, { useEffect } from 'react';
import { View, Text, ActivityIndicator } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { getTheme } from '../../src/lib/theme';

export default function PaymentSuccess() {
  const theme = getTheme('passenger');
  const { ride_id } = useLocalSearchParams<{ ride_id: string }>();
  const router = useRouter();

  useEffect(() => {
    const t = setTimeout(() => {
      router.replace(ride_id ? `/passenger/ride/${ride_id}` : '/passenger/home');
    }, 1200);
    return () => clearTimeout(t);
  }, [ride_id]);

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: theme.bg, alignItems: 'center', justifyContent: 'center' }}>
      <Text style={{ fontSize: 22, fontWeight: '700', color: theme.text, marginBottom: 8 }}>Payment received</Text>
      <ActivityIndicator color={theme.accent} />
      <Text style={{ color: theme.textDim, marginTop: 8 }}>Returning to your trip…</Text>
    </SafeAreaView>
  );
}
