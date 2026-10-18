import React, { useCallback, useEffect, useState } from 'react';
import { View, Text, StyleSheet, FlatList, RefreshControl, TouchableOpacity, ActivityIndicator } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { getTheme } from '../../src/lib/theme';
import { useAuth } from '../../src/lib/auth';
import { api } from '../../src/lib/api';

export default function PassengerHistory() {
  const theme = getTheme('passenger');
  const router = useRouter();
  const { user } = useAuth();
  const [items, setItems] = useState<any[]>([]);
  const [refreshing, setRefreshing] = useState(false);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async (isManual = false) => {
    if (isManual) setRefreshing(true);
    if (!user) {
      setItems([]);
      setRefreshing(false);
      setLoading(false);
      return;
    }
    try {
      const data = await api<any[]>('/rides/history/list');
      setItems(Array.isArray(data) ? data : []);
    } catch (e) {
      console.warn('history fetch failed', e);
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

      {!user ? (
        <View style={styles.guestBox}>
          <View style={[styles.guestCard, { backgroundColor: theme.surface, borderColor: theme.border }]}>
            <Ionicons name="person-circle-outline" size={56} color="#FACC15" />
            <Text style={[styles.guestTitle, { color: theme.text }]}>Sign In to View Trips</Text>
            <Text style={styles.guestSubtitle}>
              Log in to see your receipts, past private hire rides, and live dispatch tracking.
            </Text>
            <TouchableOpacity
              style={styles.signInBtn}
              onPress={() => router.push('/(auth)/login' as any)}
            >
              <Text style={styles.signInBtnText}>Sign In / Register</Text>
            </TouchableOpacity>
          </View>
        </View>
      ) : loading && items.length === 0 ? (
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
          <ActivityIndicator size="large" color="#FACC15" />
          <Text style={{ color: theme.textDim, marginTop: 12, fontSize: 13 }}>Loading trip history...</Text>
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
                Your private hire bookings and receipts will appear here automatically.
              </Text>
            </View>
          }
          renderItem={({ item }) => {
            const badge = getStatusBadge(item.status);
            const isActive = ['pending', 'accepted', 'arrived', 'in_progress'].includes(item.status);

            return (
              <TouchableOpacity
                activeOpacity={isActive ? 0.7 : 1}
                onPress={() => {
                  if (isActive) {
                    router.replace(`/passenger/ride/${item.id}`);
                  }
                }}
                style={[
                  styles.card,
                  { backgroundColor: theme.surface, borderColor: isActive ? '#FACC15' : theme.border },
                  isActive && styles.activeCardGlow,
                ]}
              >
                <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
                  <View style={[styles.pill, { backgroundColor: badge.bg }]}>
                    <Text style={{ color: badge.color, fontSize: 11, fontWeight: '800', textTransform: 'uppercase', letterSpacing: 0.4 }}>
                      {badge.label}
                    </Text>
                  </View>
                  <Text style={{ color: theme.text, fontSize: 18, fontWeight: '800' }}>
                    £{item.fare?.toFixed?.(2) ?? item.fare}
                  </Text>
                </View>

                <View style={{ marginTop: 14, gap: 8 }}>
                  <Row theme={theme} icon="location" color="#22C55E" text={item.pickup?.address || 'Current Location'} />
                  <Row theme={theme} icon="flag" color="#EF4444" text={item.destination?.address || 'Destination'} />
                </View>

                <View style={{ marginTop: 12, paddingTop: 10, borderTopWidth: 1, borderTopColor: theme.border, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                  <Text style={{ color: theme.textDim, fontSize: 12 }}>
                    {item.driver_name ? `${item.driver_name} · ` : ''}
                    {item.distance_km ? `${item.distance_km?.toFixed?.(1)} km · ` : ''}
                    Tier: {item.ride_type?.toUpperCase() || 'STANDARD'}
                  </Text>
                  <Text style={{ color: theme.textFaint, fontSize: 12, fontWeight: '500' }}>
                    {formatDateTime(item.created_at)}
                  </Text>
                </View>

                {isActive && (
                  <View style={styles.activeBanner}>
                    <Ionicons name="radio" size={14} color="#FACC15" />
                    <Text style={styles.activeBannerText}>Trip active · Tap to open live tracking</Text>
                    <Ionicons name="chevron-forward" size={14} color="#FACC15" />
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
  card: { padding: 16, borderRadius: 20, borderWidth: 1, shadowColor: '#000', shadowOpacity: 0.1, shadowRadius: 8, elevation: 2 },
  activeCardGlow: { borderWidth: 1.5, borderColor: '#FACC15' },
  pill: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 8 },
  activeBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: 'rgba(250, 204, 21, 0.1)',
    marginTop: 10,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 8,
  },
  activeBannerText: { color: '#FACC15', fontSize: 12, fontWeight: '700' },
  cancelledNote: { marginTop: 8, paddingHorizontal: 4 },
  guestBox: { flex: 1, padding: 24, justifyContent: 'center', alignItems: 'center' },
  guestCard: { width: '100%', maxWidth: 400, padding: 24, borderRadius: 24, borderWidth: 1, alignItems: 'center', textAlign: 'center' },
  guestTitle: { fontSize: 20, fontWeight: '800', marginTop: 12 },
  guestSubtitle: { color: '#94A3B8', fontSize: 13, textAlign: 'center', marginTop: 8, lineHeight: 18 },
  signInBtn: { marginTop: 20, backgroundColor: '#FACC15', paddingHorizontal: 24, paddingVertical: 12, borderRadius: 14 },
  signInBtnText: { color: '#0F172A', fontSize: 14, fontWeight: '700' },
});
