import React, { useCallback, useEffect, useState } from 'react';
import { View, Text, StyleSheet, FlatList, RefreshControl } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { getTheme } from '../../src/lib/theme';
import { api } from '../../src/lib/api';

export default function DriverHistory() {
  const theme = getTheme('driver');
  const [items, setItems] = useState<any[]>([
    {
      id: 'trip-pk-101',
      passenger_name: 'Zainab Bibi (3 Seats)',
      fare: 1050,
      pickup: { address: 'Pirwadhai Terminal Bay 3' },
      destination: { address: 'Murree Mall Road Stand' },
      distance_km: 64.2,
      status: 'completed',
      mode: 'adda_pari',
      created_at: new Date().toISOString(),
    },
    {
      id: 'trip-pk-102',
      passenger_name: 'Usman Ali',
      fare: 350,
      pickup: { address: 'Saddar Metro Station' },
      destination: { address: 'Commercial Market, Satellite Town' },
      distance_km: 5.8,
      status: 'completed',
      mode: 'roaming',
      created_at: new Date(Date.now() - 3600000 * 3).toISOString(),
    },
  ]);
  const [refreshing, setRefreshing] = useState(false);

  const refresh = useCallback(async () => {
    setRefreshing(true);
    try {
      const data = await api('/rides/history/list');
      if (Array.isArray(data) && data.length > 0) setItems(data);
    } catch {}
    setRefreshing(false);
  }, []);

  useEffect(() => { refresh(); }, [refresh]);

  return (
    <SafeAreaView style={[styles.root, { backgroundColor: theme.bg }]} edges={['top']} testID="driver-history">
      <View style={{ padding: 20 }}>
        <Text style={[styles.title, { color: theme.text }]}>Trip History</Text>
        <Text style={{ color: theme.textDim, fontSize: 13, marginTop: 2 }}>پچھلے سفر اور کرائے · Adda manifests & Roaming hails</Text>
      </View>

      <FlatList
        data={items}
        keyExtractor={(r) => r.id}
        refreshControl={<RefreshControl tintColor="#59DF89" refreshing={refreshing} onRefresh={refresh} />}
        contentContainerStyle={{ padding: 20, paddingTop: 0, gap: 12 }}
        ListEmptyComponent={
          <View style={{ padding: 40, alignItems: 'center' }}>
            <Ionicons name="car-outline" size={48} color={theme.textFaint} />
            <Text style={{ color: theme.textDim, marginTop: 12 }}>No trips yet. Go online to start earning.</Text>
          </View>
        }
        renderItem={({ item }) => (
          <View style={[styles.card, { backgroundColor: theme.surface, borderColor: theme.border }]}>
            <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                <Text style={{ color: theme.text, fontSize: 15, fontWeight: '700' }}>
                  {item.passenger_name || 'Passenger'}
                </Text>
                <View style={[styles.badge, { backgroundColor: item.mode === 'adda_pari' ? '#00683720' : '#FACC1520', borderColor: item.mode === 'adda_pari' ? '#59DF89' : '#FACC15' }]}>
                  <Text style={[styles.badgeText, { color: item.mode === 'adda_pari' ? '#59DF89' : '#FACC15' }]}>
                    {item.mode === 'adda_pari' ? 'Pari Turn (0% Fee)' : 'Doorstep Roaming'}
                  </Text>
                </View>
              </View>
              <Text style={{ color: '#59DF89', fontSize: 18, fontWeight: '800' }}>
                Rs. {item.fare?.toLocaleString?.() ?? item.fare}
              </Text>
            </View>
            <View style={{ marginTop: 12, gap: 6 }}>
              <Row theme={theme} icon="location" color="#59DF89" text={item.pickup?.address} />
              <Row theme={theme} icon="flag" color="#EF4444" text={item.destination?.address} />
            </View>
            <View style={{ marginTop: 12, paddingTop: 8, borderTopWidth: 1, borderTopColor: theme.border, flexDirection: 'row', justifyContent: 'space-between' }}>
              <Text style={{ color: theme.textDim, fontSize: 12 }}>
                {item.distance_km?.toFixed?.(1)} km · {item.status?.toUpperCase?.()}
              </Text>
              <Text style={{ color: theme.textDim, fontSize: 12 }}>
                {new Date(item.created_at).toLocaleDateString()}
              </Text>
            </View>
          </View>
        )}
      />
    </SafeAreaView>
  );
}

function Row({ theme, icon, color, text }: any) {
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
      <Ionicons name={icon} size={14} color={color} />
      <Text style={{ color: theme.text, fontSize: 13, flex: 1 }} numberOfLines={1}>{text}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  title: { fontSize: 28, fontWeight: '800', letterSpacing: -0.8 },
  card: { padding: 16, borderRadius: 20, borderWidth: 1 },
  badge: { paddingHorizontal: 8, paddingVertical: 2, borderRadius: 8, borderWidth: 1 },
  badgeText: { fontSize: 10, fontWeight: '700' },
});
