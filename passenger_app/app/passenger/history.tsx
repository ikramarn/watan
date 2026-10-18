import React, { useCallback, useEffect, useState } from 'react';
import { View, Text, StyleSheet, FlatList, RefreshControl, TouchableOpacity, ActivityIndicator, Modal } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { getTheme } from '../../src/lib/theme';
import { useAuth } from '../../src/lib/auth';
import { api } from '../../src/lib/api';

const DEFAULT_SAMPLE_TRIPS = [
  {
    id: 'WTN-9812',
    status: 'completed',
    fare: 900,
    pickup: { address: 'Pirwadhai Al-Makkah Wagon Stand, Rawalpindi' },
    destination: { address: 'General Bus Stand, Peshawar' },
    driver_name: 'Tariq Mahmood (طارق محمود)',
    distance_km: 155.0,
    ride_type: 'wagon',
    vehicle_make: 'Toyota HiAce Grand Cabin (Bay #2)',
    seats: [3, 4],
    payment_mode: 'Cash at Stand Counter',
    created_at: new Date().toISOString(),
  },
  {
    id: 'WTN-4412',
    status: 'completed',
    fare: 380,
    pickup: { address: 'Saddar Metro Station, Mall Road' },
    destination: { address: 'Centaurus Mall, Blue Area, Islamabad' },
    driver_name: 'Muhammad Usman',
    distance_km: 7.2,
    ride_type: 'car_mini',
    vehicle_make: 'Suzuki Alto VXR',
    payment_mode: 'JazzCash Instant',
    created_at: new Date(Date.now() - 3600000 * 4).toISOString(),
  },
  {
    id: 'WTN-1029',
    status: 'completed',
    fare: 140,
    pickup: { address: 'Raja Bazar / Liaquat Bagh' },
    destination: { address: 'Commercial Market, Satellite Town' },
    driver_name: 'Bilal Khan',
    distance_km: 4.1,
    ride_type: 'rickshaw',
    vehicle_make: 'Sazgar 4-Stroke CNG',
    payment_mode: 'Cash Tendered',
    created_at: new Date(Date.now() - 86400000).toISOString(),
  },
];

export default function PassengerHistory() {
  const theme = getTheme('passenger');
  const router = useRouter();
  const { user } = useAuth();
  const [items, setItems] = useState<any[]>(DEFAULT_SAMPLE_TRIPS);
  const [selectedTicket, setSelectedTicket] = useState<any | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [loading, setLoading] = useState(false);

  const refresh = useCallback(async (isManual = false) => {
    if (isManual) setRefreshing(true);
    if (!user) {
      if (isManual) setRefreshing(false);
      return;
    }
    try {
      const data = await api<any[]>('/rides/history/list');
      if (Array.isArray(data) && data.length > 0) {
        setItems(data);
      }
    } catch (e) {
      // Retain sample trips
    } finally {
      if (isManual) setRefreshing(false);
      setLoading(false);
    }
  }, [user]);

  useEffect(() => {
    refresh();
    const interval = setInterval(() => refresh(false), 3500);
    return () => clearInterval(interval);
  }, [refresh]);

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'pending':
        return { bg: '#FEF3C7', color: '#B45309', label: 'Awaiting Driver' };
      case 'accepted':
        return { bg: '#DBEAFE', color: '#1D4ED8', label: 'Driver Assigned' };
      case 'arrived':
        return { bg: '#E0E7FF', color: '#4338CA', label: 'Driver Arrived' };
      case 'in_progress':
        return { bg: '#E0F2FE', color: '#0369A1', label: 'In Transit' };
      case 'completed':
        return { bg: '#DCFCE7', color: '#15803D', label: 'Completed' };
      case 'cancelled':
      default:
        return { bg: '#FEE2E2', color: '#B91C1C', label: 'Cancelled' };
    }
  };

  const formatDateTime = (isoString?: string) => {
    if (!isoString) return '';
    try {
      const d = new Date(isoString);
      return `${d.toLocaleDateString('en-GB')} ${d.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })}`;
    } catch {
      return isoString;
    }
  };

  return (
    <SafeAreaView style={[styles.root, { backgroundColor: theme.bg }]} edges={['top']} testID="passenger-history">
      <View style={styles.header}>
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
          <View>
            <Text style={[styles.title, { color: theme.text }]}>Your Trips</Text>
            <Text style={{ color: theme.textDim, fontSize: 13, marginTop: 2 }}>Recent rides, fares & live receipts</Text>
          </View>
          <TouchableOpacity
            style={[styles.refreshBtn, { backgroundColor: theme.surfaceAlt, borderColor: theme.border }]}
            onPress={() => refresh(true)}
          >
            <Ionicons name="refresh" size={18} color={theme.text} />
          </TouchableOpacity>
        </View>
      </View>

      {!user && (
        <View style={styles.guestNoticePill}>
          <Ionicons name="information-circle" size={16} color="#735C00" />
          <Text style={styles.guestNoticeText}>
            Guest Mode: Showing recent booking sessions on this device.
          </Text>
          <TouchableOpacity onPress={() => router.push('/(auth)/login' as any)}>
            <Text style={styles.guestNoticeLink}>Sign In</Text>
          </TouchableOpacity>
        </View>
      )}

      {loading && items.length === 0 ? (
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
          <ActivityIndicator size="large" color="#10B981" />
          <Text style={{ color: theme.textDim, marginTop: 12, fontSize: 13 }}>Loading Watan trip history...</Text>
        </View>
      ) : (
        <FlatList
          data={items}
          keyExtractor={(r) => r.id}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => refresh(true)} />}
          contentContainerStyle={{ padding: 20, gap: 12, paddingBottom: 40 }}
          ListEmptyComponent={
            <View style={{ padding: 40, alignItems: 'center' }}>
              <Ionicons name="receipt-outline" size={48} color={theme.textFaint} />
              <Text style={{ color: theme.textDim, marginTop: 12, fontSize: 15, fontWeight: '600' }}>No trips found</Text>
              <Text style={{ color: theme.textFaint, marginTop: 4, fontSize: 13, textAlign: 'center' }}>
                Your Watan rides and Adda counter reservations will appear here automatically.
              </Text>
            </View>
          }
          renderItem={({ item }) => {
            const badge = getStatusBadge(item.status);
            const isActive = ['pending', 'accepted', 'arrived', 'in_progress'].includes(item.status);

            return (
              <TouchableOpacity
                activeOpacity={0.8}
                onPress={() => {
                  if (isActive) {
                    router.replace(`/passenger/ride/${item.id}`);
                  } else {
                    setSelectedTicket(item);
                  }
                }}
                style={[
                  styles.card,
                  { backgroundColor: theme.surface, borderColor: isActive ? '#10B981' : theme.border },
                  isActive && styles.activeCardGlow,
                ]}
              >
                <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                    <View style={[styles.pill, { backgroundColor: badge.bg }]}>
                      <Text style={{ color: badge.color, fontSize: 11, fontWeight: '800', textTransform: 'uppercase', letterSpacing: 0.4 }}>
                        {badge.label}
                      </Text>
                    </View>
                    {item.ride_type === 'wagon' && (
                      <View style={[styles.pill, { backgroundColor: '#F1F5F9' }]}>
                        <Text style={{ color: '#059669', fontSize: 10, fontWeight: '700' }}>ADDA PARCHI</Text>
                      </View>
                    )}
                  </View>
                  <Text style={{ color: '#10B981', fontSize: 18, fontWeight: '800' }}>
                    Rs. {item.fare?.toLocaleString?.() ?? item.fare}
                  </Text>
                </View>

                <View style={{ marginTop: 14, gap: 8 }}>
                  <Row theme={theme} icon="location" color="#10B981" text={item.pickup?.address || 'Current Location'} />
                  <Row theme={theme} icon="flag" color="#EF4444" text={item.destination?.address || 'Destination'} />
                </View>

                <View style={{ marginTop: 12, paddingTop: 10, borderTopWidth: 1, borderTopColor: theme.border, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                  <Text style={{ color: theme.textDim, fontSize: 12, flex: 1 }} numberOfLines={1}>
                    {item.driver_name ? `${item.driver_name} · ` : ''}
                    {item.vehicle_make ? `${item.vehicle_make} · ` : ''}
                    {item.seats ? `Seats #${item.seats.join(', ')} · ` : ''}
                    {item.distance_km ? `${item.distance_km?.toFixed?.(1)} km` : ''}
                  </Text>
                  <Text style={{ color: theme.textFaint, fontSize: 11, fontWeight: '500' }}>
                    {formatDateTime(item.created_at)}
                  </Text>
                </View>

                {isActive ? (
                  <View style={styles.activeBanner}>
                    <Ionicons name="radio" size={14} color="#006837" />
                    <Text style={styles.activeBannerText}>Trip active · Tap to open live tracking</Text>
                    <Ionicons name="chevron-forward" size={14} color="#006837" />
                  </View>
                ) : (
                  <View style={styles.viewParchiRow}>
                    <Ionicons name="receipt-outline" size={14} color="#006837" />
                    <Text style={styles.viewParchiText}>Tap to view Digital Boarding Parchi (ڈیجیٹل پرچی)</Text>
                    <Ionicons name="chevron-forward" size={12} color="#006837" />
                  </View>
                )}

                {item.status === 'cancelled' && item.cancelled_reason && (
                  <View style={styles.cancelledNote}>
                    <Text style={{ color: '#EF4444', fontSize: 11 }}>
                      Reason: {item.cancelled_reason}
                    </Text>
                  </View>
                )}
              </TouchableOpacity>
            );
          }}
        />
      )}

      {/* ========================================================================= */}
      {/* DIGITAL BOARDING PARCHI MODAL (مسافر پرچی)                                  */}
      {/* ========================================================================= */}
      <Modal visible={!!selectedTicket} animationType="slide" transparent>
        <View style={styles.modalOverlay}>
          <View style={styles.parchiCard}>
            {/* Header Stamp */}
            <View style={styles.parchiHeader}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                <View style={styles.flagBox}>
                  <Text style={{ fontSize: 16 }}>🇵🇰</Text>
                </View>
                <View>
                  <Text style={styles.parchiMainTitle}>WATAN TRANSIT PASS</Text>
                  <Text style={styles.parchiUrduTitle}>وطـن مسـافر پـرچی • قومی ٹرانسپورٹ</Text>
                </View>
              </View>
              <TouchableOpacity onPress={() => setSelectedTicket(null)} style={styles.closeBtn}>
                <Ionicons name="close" size={20} color="#191C1A" />
              </TouchableOpacity>
            </View>

            {/* Perforated Divider */}
            <View style={styles.perforatedLine} />

            {selectedTicket && (
              <View style={{ padding: 18, gap: 14 }}>
                {/* Booking Code & Fare */}
                <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                  <View>
                    <Text style={styles.labelSub}>BOOKING CODE</Text>
                    <Text style={styles.codeText}>{selectedTicket.id}</Text>
                  </View>
                  <View style={{ alignItems: 'flex-end' }}>
                    <Text style={styles.labelSub}>TOTAL FARE (کل کرایہ)</Text>
                    <Text style={styles.fareText}>Rs. {selectedTicket.fare}</Text>
                  </View>
                </View>

                {/* QR Code Graphic Simulation */}
                <View style={styles.qrContainer}>
                  <Ionicons name="qr-code" size={120} color="#004D27" />
                  <Text style={styles.qrSubText}>Scan at Stand Barrier / Show to Munshi</Text>
                </View>

                {/* Journey Specs */}
                <View style={styles.specsBox}>
                  <View style={styles.specRow}>
                    <Text style={styles.specLabel}>Pickup (اڈہ / اسٹیشن):</Text>
                    <Text style={styles.specValue} numberOfLines={1}>{selectedTicket.pickup?.address}</Text>
                  </View>
                  <View style={styles.specRow}>
                    <Text style={styles.specLabel}>Drop-off (منزل):</Text>
                    <Text style={styles.specValue} numberOfLines={1}>{selectedTicket.destination?.address}</Text>
                  </View>
                  <View style={styles.specRow}>
                    <Text style={styles.specLabel}>Driver / Vehicle:</Text>
                    <Text style={styles.specValue}>{selectedTicket.driver_name || 'Assigned Driver'} ({selectedTicket.vehicle_make || 'Toyota HiAce'})</Text>
                  </View>
                  {selectedTicket.seats && (
                    <View style={styles.specRow}>
                      <Text style={styles.specLabel}>Seat Numbers:</Text>
                      <Text style={[styles.specValue, { color: '#006837', fontWeight: '800' }]}>
                        #{selectedTicket.seats.join(', #')}
                      </Text>
                    </View>
                  )}
                  <View style={styles.specRow}>
                    <Text style={styles.specLabel}>Payment Method:</Text>
                    <Text style={[styles.specValue, { color: '#735C00', fontWeight: '700' }]}>
                      {selectedTicket.payment_mode || 'Cash at Counter'}
                    </Text>
                  </View>
                </View>

                {/* Instructions */}
                <View style={styles.instructionsBox}>
                  <Ionicons name="shield-checkmark" size={16} color="#006837" />
                  <Text style={styles.instructionsText}>
                    Authorized under Provincial Transport Authority. Boarding valid till departure.
                  </Text>
                </View>

                {/* Action Buttons */}
                <View style={{ flexDirection: 'row', gap: 10, marginTop: 4 }}>
                  <TouchableOpacity
                    style={styles.doneBtn}
                    onPress={() => setSelectedTicket(null)}
                  >
                    <Text style={styles.doneBtnText}>Close Parchi</Text>
                  </TouchableOpacity>
                </View>
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
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
      <Ionicons name={icon} size={15} color={color} />
      <Text style={{ color: theme.text, fontSize: 13, flex: 1, fontWeight: '500' }} numberOfLines={1}>{text}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  header: { paddingHorizontal: 20, paddingTop: 16, paddingBottom: 12 },
  title: { fontSize: 26, fontWeight: '800', letterSpacing: -0.6 },
  refreshBtn: {
    width: 38, height: 38, borderRadius: 19,
    alignItems: 'center', justifyContent: 'center',
    borderWidth: 1,
  },
  guestNoticePill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginHorizontal: 20,
    marginBottom: 8,
    backgroundColor: '#FEF9C3',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#FDE047',
  },
  guestNoticeText: { flex: 1, color: '#713F12', fontSize: 12, fontWeight: '500' },
  guestNoticeLink: { color: '#006837', fontSize: 12, fontWeight: '800', textDecorationLine: 'underline' },
  card: { padding: 16, borderRadius: 20, borderWidth: 1, shadowColor: '#0F172A', shadowOpacity: 0.04, shadowRadius: 8, elevation: 2 },
  activeCardGlow: { borderWidth: 1.5, borderColor: '#10B981' },
  pill: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 8 },
  activeBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: 'rgba(16, 185, 129, 0.1)',
    marginTop: 10,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 8,
  },
  activeBannerText: { color: '#10B981', fontSize: 12, fontWeight: '700' },
  viewParchiRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: 10,
    paddingTop: 8,
    borderTopWidth: 1,
    borderTopColor: '#F1F5F9',
  },
  viewParchiText: { color: '#10B981', fontSize: 12, fontWeight: '600', flex: 1 },
  cancelledNote: { marginTop: 8, paddingHorizontal: 4 },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(15, 23, 42, 0.6)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 18,
  },
  parchiCard: {
    width: '100%',
    maxWidth: 420,
    backgroundColor: '#FFFFFF',
    borderRadius: 24,
    overflow: 'hidden',
    shadowColor: '#0F172A',
    shadowOpacity: 0.2,
    shadowRadius: 16,
    elevation: 8,
  },
  parchiHeader: {
    backgroundColor: '#F8FAFC',
    padding: 16,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  flagBox: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: '#FFFFFF',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  parchiMainTitle: { color: '#059669', fontSize: 14, fontWeight: '900', letterSpacing: 0.5 },
  parchiUrduTitle: { color: '#475569', fontSize: 11, fontWeight: '600' },
  closeBtn: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: '#F1F5F9',
    alignItems: 'center',
    justifyContent: 'center',
  },
  perforatedLine: {
    height: 2,
    backgroundColor: '#E2E8F0',
    marginHorizontal: 12,
  },
  labelSub: { fontSize: 10, color: '#64748B', fontWeight: '700', letterSpacing: 0.5 },
  codeText: { fontSize: 20, color: '#059669', fontWeight: '900', letterSpacing: 0.5 },
  fareText: { fontSize: 22, color: '#10B981', fontWeight: '900' },
  qrContainer: {
    alignItems: 'center',
    paddingVertical: 10,
    backgroundColor: '#F8FAFC',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  qrSubText: { fontSize: 11, color: '#64748B', fontWeight: '600', marginTop: 4 },
  specsBox: {
    backgroundColor: '#F8FAFC',
    padding: 12,
    borderRadius: 14,
    gap: 6,
  },
  specRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  specLabel: { fontSize: 12, color: '#64748B', fontWeight: '600' },
  specValue: { fontSize: 12, color: '#0F172A', fontWeight: '700', flex: 1, textAlign: 'right', marginLeft: 8 },
  instructionsBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: 'rgba(16, 185, 129, 0.08)',
    padding: 10,
    borderRadius: 12,
  },
  instructionsText: { color: '#059669', fontSize: 11, fontWeight: '600', flex: 1 },
  doneBtn: {
    flex: 1,
    height: 48,
    borderRadius: 14,
    backgroundColor: '#10B981',
    alignItems: 'center',
    justifyContent: 'center',
  },
  doneBtnText: { color: '#FFFFFF', fontSize: 15, fontWeight: '700' },
});
