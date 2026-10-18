import React, { useCallback, useEffect, useState } from 'react';
import { View, Text, StyleSheet, FlatList, RefreshControl } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { getTheme } from '../../src/lib/theme';
import { api } from '../../src/lib/api';

export default function DriverHistory() {
  const theme = getTheme('driver');
  const [items, setItems] = useState<any[]>([]);
  const [refreshing, setRefreshing] = useState(false);

  const refresh = useCallback(async () => {
    setRefreshing(true);
    try { setItems(await api('/rides/history/list')); } catch {}
    setRefreshing(false);
  }, []);

  useEffect(() => { refresh(); }, [refresh]);

  return (
    <SafeAreaView style={[styles.root, { backgroundColor: theme.bg }]} edges={['top']} testID="driver-history">
      <View style={{ padding: 20 }}>
        <Text style={[styles.title, { color: theme.text }]}>Your Trips</Text>
        <Text style={{ color: theme.textDim, fontSize: 14 }}>Every ride you&apos;ve completed</Text>
      </View>

      <FlatList
        data={items}
        keyExtractor={(r) => r.id}
        refreshControl={<RefreshControl tintColor="#FAFAFA" refreshing={refreshing} onRefresh={refresh} />}
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
              <Text style={{ color: theme.text, fontSize: 14, fontWeight: '600' }}>
                {item.passenger_name || 'Passenger'}
              </Text>
              <Text style={{ color: theme.accent, fontSize: 18, fontWeight: '700' }}>
                £{item.fare?.toFixed?.(2)}
              </Text>
            </View>
            <View style={{ marginTop: 10, gap: 6 }}>
              <Row theme={theme} icon="location" color={theme.success} text={item.pickup?.address} />
              <Row theme={theme} icon="flag" color={theme.danger} text={item.destination?.address} />
            </View>
            <View style={{ marginTop: 10, flexDirection: 'row', justifyContent: 'space-between' }}>
              <Text style={{ color: theme.textDim, fontSize: 12 }}>
                {item.distance_km?.toFixed?.(1)} km · {item.status}
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
  title: { fontSize: 30, fontWeight: '700', letterSpacing: -0.8 },
  card: { padding: 16, borderRadius: 20, borderWidth: 1 },
});
