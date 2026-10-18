import React, { useCallback, useEffect, useState, useMemo } from 'react';
import { View, Text, StyleSheet, FlatList, RefreshControl, TouchableOpacity, Modal } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { getTheme } from '../../src/lib/theme';
import { api } from '../../src/lib/api';

const SAMPLE_DRIVER_HISTORY = [
  {
    id: 'trip-pk-101',
    passenger_name: 'Pari Turn #2 (Full Manifest)',
    fare: 6300,
    pickup: { address: 'Pirwadhai Terminal Bay #3, Rawalpindi' },
    destination: { address: 'General Bus Stand, Peshawar' },
    distance_km: 155.0,
    status: 'completed',
    mode: 'adda_pari',
    seats_filled: 14,
    platform_fee: 0,
    munshi_name: 'Haji Gulzar (Bay 3)',
    vehicle_plate: 'LES-19-4821',
    created_at: new Date(Date.now() - 3600000 * 2).toISOString(),
  },
  {
    id: 'trip-pk-102',
    passenger_name: 'Usman Ali (Private Hail)',
    fare: 350,
    pickup: { address: 'Saddar Metro Station, Mall Road' },
    destination: { address: 'Commercial Market, Satellite Town' },
    distance_km: 5.8,
    status: 'completed',
    mode: 'roaming',
    seats_filled: 1,
    platform_fee: 35, // 10%
    vehicle_plate: 'LES-19-4821',
    created_at: new Date(Date.now() - 3600000 * 5).toISOString(),
  },
  {
    id: 'trip-pk-103',
    passenger_name: 'Pari Turn #1 Morning Run',
    fare: 6300,
    pickup: { address: 'Pirwadhai Terminal Bay #3' },
    destination: { address: 'Peshawar Road Chowk' },
    distance_km: 155.0,
    status: 'completed',
    mode: 'adda_pari',
    seats_filled: 14,
    platform_fee: 0,
    munshi_name: 'Haji Gulzar (Bay 3)',
    vehicle_plate: 'LES-19-4821',
    created_at: new Date(Date.now() - 86400000).toISOString(),
  },
  {
    id: 'trip-pk-104',
    passenger_name: 'Dr. Hamza Qureshi',
    fare: 480,
    pickup: { address: 'Faizabad Interchange' },
    destination: { address: 'Shifa International Hospital' },
    distance_km: 7.2,
    status: 'completed',
    mode: 'roaming',
    seats_filled: 2,
    platform_fee: 48, // 10%
    vehicle_plate: 'LES-19-4821',
    created_at: new Date(Date.now() - 86400000 * 2).toISOString(),
  },
];

export default function DriverHistory() {
  const theme = getTheme('driver');
  const [items, setItems] = useState<any[]>(SAMPLE_DRIVER_HISTORY);
  const [selectedFilter, setSelectedFilter] = useState<'all' | 'adda_pari' | 'roaming'>('all');
  const [selectedTrip, setSelectedTrip] = useState<any | null>(null);
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

  const filteredItems = useMemo(() => {
    if (selectedFilter === 'all') return items;
    return items.filter((item) => item.mode === selectedFilter);
  }, [items, selectedFilter]);

  return (
    <SafeAreaView style={[styles.root, { backgroundColor: theme.bg }]} edges={['top']} testID="driver-history">
      <View style={{ padding: 20, paddingBottom: 12 }}>
        <Text style={[styles.title, { color: theme.text }]}>Trip History</Text>
        <Text style={{ color: theme.textDim, fontSize: 13, marginTop: 2 }}>پچھلے سفر اور کرائے · Adda manifests & Roaming hails</Text>

        {/* Filter Segmented Control */}
        <View style={styles.filterRow}>
          {[
            { id: 'all', label: 'All (تمام)' },
            { id: 'adda_pari', label: 'Adda Pari (0% Fee)' },
            { id: 'roaming', label: 'Roaming (10% Fee)' },
          ].map((tab) => (
            <TouchableOpacity
              key={tab.id}
              onPress={() => setSelectedFilter(tab.id as any)}
              style={[
                styles.filterChip,
                {
                  backgroundColor: selectedFilter === tab.id ? '#006837' : theme.surfaceAlt,
                  borderColor: selectedFilter === tab.id ? '#59DF89' : theme.border,
                },
              ]}
            >
              <Text
                style={[
                  styles.filterChipText,
                  { color: selectedFilter === tab.id ? '#FFFFFF' : theme.textDim },
                ]}
              >
                {tab.label}
              </Text>
            </TouchableOpacity>
          ))}
        </View>
      </View>

      <FlatList
        data={filteredItems}
        keyExtractor={(r) => r.id}
        refreshControl={<RefreshControl tintColor="#59DF89" refreshing={refreshing} onRefresh={refresh} />}
        contentContainerStyle={{ padding: 20, paddingTop: 0, gap: 12, paddingBottom: 40 }}
        ListEmptyComponent={
          <View style={{ padding: 40, alignItems: 'center' }}>
            <Ionicons name="car-outline" size={48} color={theme.textFaint} />
            <Text style={{ color: theme.textDim, marginTop: 12 }}>No trips match this filter.</Text>
          </View>
        }
        renderItem={({ item }) => (
          <TouchableOpacity
            activeOpacity={0.8}
            onPress={() => setSelectedTrip(item)}
            style={[styles.card, { backgroundColor: theme.surface, borderColor: theme.border }]}
          >
            <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, flex: 1 }}>
                <Text style={{ color: theme.text, fontSize: 15, fontWeight: '700' }} numberOfLines={1}>
                  {item.passenger_name || 'Trip'}
                </Text>
                <View
                  style={[
                    styles.badge,
                    {
                      backgroundColor: item.mode === 'adda_pari' ? '#00683720' : '#FACC1520',
                      borderColor: item.mode === 'adda_pari' ? '#59DF89' : '#FACC15',
                    },
                  ]}
                >
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

            <View style={{ marginTop: 12, paddingTop: 8, borderTopWidth: 1, borderTopColor: theme.border, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
              <Text style={{ color: theme.textDim, fontSize: 12 }}>
                {item.distance_km?.toFixed?.(1)} km · {item.seats_filled ? `${item.seats_filled} Seats · ` : ''}
                {item.status?.toUpperCase?.()}
              </Text>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                <Text style={{ color: theme.textDim, fontSize: 11 }}>
                  {new Date(item.created_at).toLocaleDateString()}
                </Text>
                <Ionicons name="chevron-forward" size={12} color="#869487" />
              </View>
            </View>
          </TouchableOpacity>
        )}
      />

      {/* Manifest Detail Modal */}
      <Modal visible={!!selectedTrip} animationType="fade" transparent>
        <View style={styles.modalOverlay}>
          <View style={[styles.modalContent, { backgroundColor: theme.surface, borderColor: theme.border }]}>
            <View style={styles.modalHeader}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                <View style={[styles.modalIcon, { backgroundColor: selectedTrip?.mode === 'adda_pari' ? '#006837' : '#FACC15' }]}>
                  <Ionicons
                    name={selectedTrip?.mode === 'adda_pari' ? 'bus' : 'car'}
                    size={20}
                    color={selectedTrip?.mode === 'adda_pari' ? '#FFFFFF' : '#000000'}
                  />
                </View>
                <View>
                  <Text style={{ color: theme.text, fontSize: 16, fontWeight: '800' }}>
                    {selectedTrip?.mode === 'adda_pari' ? 'Adda Pari Settlement' : 'Roaming Trip Receipt'}
                  </Text>
                  <Text style={{ color: theme.textDim, fontSize: 12 }}>
                    {selectedTrip?.id} · {new Date(selectedTrip?.created_at || Date.now()).toLocaleDateString()}
                  </Text>
                </View>
              </View>
              <TouchableOpacity onPress={() => setSelectedTrip(null)} style={styles.closeBtn}>
                <Ionicons name="close" size={20} color={theme.text} />
              </TouchableOpacity>
            </View>

            {selectedTrip && (
              <View style={{ padding: 18, gap: 12 }}>
                <View style={styles.fareBreakdownBox}>
                  <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                    <Text style={{ color: theme.textDim, fontSize: 13 }}>Gross Passenger Fares:</Text>
                    <Text style={{ color: theme.text, fontSize: 14, fontWeight: '700' }}>
                      Rs. {selectedTrip.fare?.toLocaleString()}
                    </Text>
                  </View>
                  <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                    <Text style={{ color: theme.textDim, fontSize: 13 }}>Watan Platform Commission:</Text>
                    <Text style={{ color: selectedTrip.platform_fee === 0 ? '#59DF89' : '#EF4444', fontSize: 14, fontWeight: '700' }}>
                      {selectedTrip.platform_fee === 0 ? 'Rs. 0 (0% Stand Exemption)' : `-Rs. ${selectedTrip.platform_fee} (10%)`}
                    </Text>
                  </View>
                  <View style={{ height: 1, backgroundColor: theme.border, marginVertical: 4 }} />
                  <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline' }}>
                    <Text style={{ color: theme.text, fontSize: 14, fontWeight: '800' }}>Net Driver Earnings:</Text>
                    <Text style={{ color: '#59DF89', fontSize: 22, fontWeight: '900' }}>
                      Rs. {(selectedTrip.fare - (selectedTrip.platform_fee || 0)).toLocaleString()}
                    </Text>
                  </View>
                </View>

                <View style={styles.detailRow}>
                  <Text style={{ color: theme.textDim, fontSize: 12 }}>Route Origin:</Text>
                  <Text style={{ color: theme.text, fontSize: 12, fontWeight: '600', flex: 1, textAlign: 'right' }}>
                    {selectedTrip.pickup?.address}
                  </Text>
                </View>
                <View style={styles.detailRow}>
                  <Text style={{ color: theme.textDim, fontSize: 12 }}>Route Destination:</Text>
                  <Text style={{ color: theme.text, fontSize: 12, fontWeight: '600', flex: 1, textAlign: 'right' }}>
                    {selectedTrip.destination?.address}
                  </Text>
                </View>
                {selectedTrip.munshi_name && (
                  <View style={styles.detailRow}>
                    <Text style={{ color: theme.textDim, fontSize: 12 }}>Munshi Dispatcher:</Text>
                    <Text style={{ color: theme.text, fontSize: 12, fontWeight: '600' }}>
                      {selectedTrip.munshi_name}
                    </Text>
                  </View>
                )}
                <View style={styles.detailRow}>
                  <Text style={{ color: theme.textDim, fontSize: 12 }}>Vehicle Registered:</Text>
                  <Text style={{ color: theme.text, fontSize: 12, fontWeight: '600' }}>
                    Toyota HiAce ({selectedTrip.vehicle_plate})
                  </Text>
                </View>

                <TouchableOpacity
                  style={[styles.doneBtn, { backgroundColor: '#006837' }]}
                  onPress={() => setSelectedTrip(null)}
                >
                  <Text style={{ color: '#FFFFFF', fontWeight: '800', fontSize: 15 }}>Close Manifest</Text>
                </TouchableOpacity>
              </View>
            )}
          </View>
        </View>
      </Modal>
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
  filterRow: { flexDirection: 'row', gap: 8, marginTop: 14 },
  filterChip: { paddingHorizontal: 12, paddingVertical: 6, borderRadius: 12, borderWidth: 1 },
  filterChipText: { fontSize: 12, fontWeight: '700' },
  card: { padding: 16, borderRadius: 20, borderWidth: 1 },
  badge: { paddingHorizontal: 8, paddingVertical: 2, borderRadius: 8, borderWidth: 1 },
  badgeText: { fontSize: 10, fontWeight: '700' },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.7)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 18,
  },
  modalContent: {
    width: '100%',
    maxWidth: 420,
    borderRadius: 24,
    borderWidth: 1,
    overflow: 'hidden',
  },
  modalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#27332F',
  },
  modalIcon: {
    width: 38,
    height: 38,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  closeBtn: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: '#27332F',
    alignItems: 'center',
    justifyContent: 'center',
  },
  fareBreakdownBox: {
    backgroundColor: '#151D1B',
    padding: 14,
    borderRadius: 16,
    gap: 8,
    borderWidth: 1,
    borderColor: '#27332F',
  },
  detailRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  doneBtn: {
    height: 48,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 8,
  },
});

