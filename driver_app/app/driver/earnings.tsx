import React, { useCallback, useEffect, useState } from 'react';
import { View, Text, StyleSheet, ScrollView, RefreshControl, TouchableOpacity, Alert, ActivityIndicator } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { getTheme } from '../../src/lib/theme';
import { api } from '../../src/lib/api';
import Button from '../../src/components/Button';

export default function Earnings() {
  const theme = getTheme('driver');
  const [data, setData] = useState<any>({
    total: 0,
    total_gross_fares: 0,
    total_tips: 0,
    today: 0,
    week: 0,
    available_balance: 0,
    total_trips: 0,
    today_trips: 0,
  });
  const [refreshing, setRefreshing] = useState(false);
  const [cashingOut, setCashingOut] = useState(false);

  const refresh = useCallback(async () => {
    setRefreshing(true);
    try {
      const res = await api<any>('/driver/earnings');
      setData(res);
    } catch (err) {
      console.warn('Failed to load earnings', err);
    }
    setRefreshing(false);
  }, []);

  useEffect(() => { refresh(); }, [refresh]);

  const handleInstantCashout = async () => {
    const balance = data.available_balance ?? data.today;
    if (balance <= 0) {
      Alert.alert('No Balance', 'You do not have any available balance to cash out right now.');
      return;
    }

    Alert.alert(
      'Instant Cashout',
      `Cash out £${balance.toFixed(2)} to your UK Bank Account via Faster Payments? (Standard instant transfer fee: £0.50)`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Confirm Cashout',
          onPress: async () => {
            setCashingOut(true);
            try {
              const res = await api<{ message: string; remaining_balance: number }>('/driver/payout', {
                body: { amount: balance },
              });
              Alert.alert('Cashout Successful', res.message || `Transferred £${balance.toFixed(2)} instantly via Faster Payments.`);
              refresh();
            } catch (err: any) {
              Alert.alert('Cashout Failed', err.message || 'Unable to process instant cashout');
            } finally {
              setCashingOut(false);
            }
          },
        },
      ]
    );
  };

  return (
    <SafeAreaView style={[styles.root, { backgroundColor: theme.bg }]} edges={['top']} testID="driver-earnings">
      <ScrollView
        refreshControl={<RefreshControl tintColor="#FAFAFA" refreshing={refreshing} onRefresh={refresh} />}
        contentContainerStyle={{ padding: 20, paddingBottom: 60 }}
      >
        <Text style={{ color: theme.text, fontSize: 30, fontWeight: '700', letterSpacing: -0.8 }}>Earnings & Payouts</Text>
        <Text style={{ color: theme.textDim, fontSize: 14, marginTop: 4 }}>Real-time earnings ledger & instant UK Faster Payments</Text>

        <View style={[styles.hero, { backgroundColor: theme.surface, borderColor: theme.border, borderWidth: 1 }]}>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
            <View>
              <Text style={{ color: theme.textDim, fontSize: 12, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.6 }}>Available Balance</Text>
              <Text style={{ color: theme.accent, fontSize: 40, fontWeight: '800', letterSpacing: -1.5, marginTop: 4 }}>
                £{(data.available_balance ?? data.today).toFixed(2)}
              </Text>
            </View>
            <View style={{ backgroundColor: theme.surfaceAlt, padding: 10, borderRadius: 14 }}>
              <Ionicons name="wallet-outline" size={26} color={theme.accent} />
            </View>
          </View>

          <View style={{ marginTop: 16 }}>
            <Button
              title={cashingOut ? 'Processing Payout...' : '⚡ Instant Faster Payments Cash Out'}
              onPress={handleInstantCashout}
              theme={theme}
              variant="primary"
              disabled={cashingOut || (data.available_balance ?? data.today) <= 0}
            />
          </View>
        </View>

        <View style={styles.grid}>
          <Card theme={theme} label="Today's Net" value={`£${(data.today || 0).toFixed(2)}`} icon="today" />
          <Card theme={theme} label="This Week" value={`£${(data.week || 0).toFixed(2)}`} icon="calendar" />
          <Card theme={theme} label="Total Tips" value={`£${(data.total_tips || 0).toFixed(2)}`} icon="heart" />
          <Card theme={theme} label="Completed Trips" value={`${data.total_trips || 0}`} icon="car-sport" />
        </View>

        <Text style={{ color: theme.text, fontSize: 17, fontWeight: '700', marginTop: 24, marginBottom: 10 }}>Settlement Channel</Text>
        <View style={[styles.payout, { backgroundColor: theme.surfaceAlt, borderColor: theme.border }]}>
          <View style={{ flex: 1 }}>
            <Text style={{ color: theme.text, fontWeight: '600' }}>UK Bank Account · Faster Payments</Text>
            <Text style={{ color: theme.textDim, fontSize: 12, marginTop: 2 }}>
              Sort Code: **-**-** · Acc: ********
            </Text>
          </View>
          <View style={styles.badge}>
            <Text style={styles.badgeText}>Active</Text>
          </View>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

function Card({ theme, label, value, icon }: any) {
  return (
    <View style={[styles.card, { backgroundColor: theme.surface, borderColor: theme.border }]}>
      <Ionicons name={icon} size={18} color={theme.accent} />
      <Text style={{ color: theme.textDim, fontSize: 12, fontWeight: '600', marginTop: 10 }}>{label}</Text>
      <Text style={{ color: theme.text, fontSize: 20, fontWeight: '700', marginTop: 4, letterSpacing: -0.6 }}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  hero: { marginTop: 20, borderRadius: 24, padding: 20 },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 12, marginTop: 14 },
  card: { width: '47.5%', padding: 16, borderRadius: 20, borderWidth: 1 },
  payout: { padding: 16, borderRadius: 20, borderWidth: 1, flexDirection: 'row', alignItems: 'center' },
  badge: { backgroundColor: '#10B98120', paddingHorizontal: 10, paddingVertical: 4, borderRadius: 10, borderWidth: 1, borderColor: '#10B981' },
  badgeText: { color: '#10B981', fontSize: 11, fontWeight: '700' },
});
