import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, Switch, Alert, ScrollView, Modal,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import * as Location from 'expo-location';
import * as TaskManager from 'expo-task-manager';
import MapView from '../../src/components/MapView';
import Button from '../../src/components/Button';
import { getTheme } from '../../src/lib/theme';
import { useAuth } from '../../src/lib/auth';
import { api, getToken, getWsBaseUrl } from '../../src/lib/api';

import { Platform } from 'react-native';

const DEFAULT_POS = { lat: 56.1165, lng: -3.1746 }; // UK Fife default
const BG_LOCATION_TASK = 'driver-bg-location';

// Background task: update server with driver position when online (native only)
if (Platform.OS !== 'web') {
  try {
    TaskManager.defineTask(BG_LOCATION_TASK, async ({ data, error }: any) => {
      if (error || !data?.locations?.length) return;
      const { latitude, longitude, heading } = data.locations[0].coords;
      try {
        const AsyncStorage = require('@react-native-async-storage/async-storage').default;
        const token = await AsyncStorage.getItem('rs_token');
        const base = (await AsyncStorage.getItem('rs_backend_url')) || process.env.EXPO_PUBLIC_BACKEND_URL || '';
        if (!token) return;
        await fetch(`${base}/api/driver/status`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
          body: JSON.stringify({ online: true, lat: latitude, lng: longitude, bearing: heading || 0 }),
        });
      } catch {}
    });
  } catch {}
}

export default function DriverHome() {
  const theme = getTheme('driver');
  const { user } = useAuth();
  const router = useRouter();
  const [online, setOnline] = useState(false);
  const [pos, setPos] = useState(DEFAULT_POS);
  const [bearing, setBearing] = useState(0);
  const [incoming, setIncoming] = useState<any>(null);
  const [countdown, setCountdown] = useState(15);
  const [ride, setRide] = useState<any>(null);
  const [earnings, setEarnings] = useState<any>({ total: 0, today: 0, week: 0, today_trips: 0, available_balance: 0 });
  const [realtime, setRealtime] = useState<'connecting' | 'connected' | 'offline'>('connecting');
  const [sosTriggered, setSosTriggered] = useState(false);
  const countdownTimerRef = useRef<any>(null);

  // Foreground GPS tracking with heading/bearing
  useEffect(() => {
    let sub: Location.LocationSubscription | null = null;
    (async () => {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== 'granted') return;
      sub = await Location.watchPositionAsync(
        { accuracy: Location.Accuracy.High, distanceInterval: 8 },
        (loc) => {
          setPos({ lat: loc.coords.latitude, lng: loc.coords.longitude });
          if (loc.coords.heading !== null && loc.coords.heading >= 0) {
            setBearing(loc.coords.heading);
          }
        },
      );
    })();
    return () => { sub?.remove(); };
  }, []);

  // Background GPS
  useEffect(() => {
    (async () => {
      if (online) {
        const { status } = await Location.requestBackgroundPermissionsAsync();
        if (status === 'granted') {
          const isRunning = await Location.hasStartedLocationUpdatesAsync(BG_LOCATION_TASK).catch(() => false);
          if (!isRunning) {
            await Location.startLocationUpdatesAsync(BG_LOCATION_TASK, {
              accuracy: Location.Accuracy.Balanced,
              distanceInterval: 25,
              foregroundService: {
                notificationTitle: 'GetChum Driver Active',
                notificationBody: 'Broadcasting location to riders while online.',
              },
            });
          }
        }
      } else {
        const isRunning = await Location.hasStartedLocationUpdatesAsync(BG_LOCATION_TASK).catch(() => false);
        if (isRunning) {
          await Location.stopLocationUpdatesAsync(BG_LOCATION_TASK);
        }
      }
    })();
  }, [online]);

  const refresh = useCallback(async () => {
    try {
      const r = await api<any>('/rides/current');
      setRide(r);
      if (online && !r) {
        const inc = await api<{ request: any }>('/driver/incoming');
        if (inc.request && !incoming) {
          setIncoming(inc.request);
          setCountdown(15);
        } else if (!inc.request) {
          setIncoming(null);
        }
      } else if (r) {
        setIncoming(null);
      }
    } catch {}
    try {
      const e = await api<any>('/driver/earnings');
      setEarnings(e);
    } catch {}
  }, [online, incoming]);

  // Waterfall 15-second countdown timer for incoming request
  useEffect(() => {
    if (incoming) {
      clearInterval(countdownTimerRef.current);
      countdownTimerRef.current = setInterval(() => {
        setCountdown((prev) => {
          if (prev <= 1) {
            clearInterval(countdownTimerRef.current);
            // Auto decline and cascade
            api(`/rides/${incoming.id}/decline`, { body: {} }).catch(() => {});
            setIncoming(null);
            return 0;
          }
          return prev - 1;
        });
      }, 1000);
    } else {
      clearInterval(countdownTimerRef.current);
    }
    return () => clearInterval(countdownTimerRef.current);
  }, [incoming?.id]);

  useEffect(() => {
    let driverWs: WebSocket | null = null;
    let rideWs: WebSocket | null = null;
    let cancelled = false;

    const connect = async () => {
      await refresh();
      try {
        const token = await getToken();
        const wsBase = await getWsBaseUrl();
        if (!token || !user?.id) throw new Error('Missing driver token/user');
        driverWs = new WebSocket(`${wsBase}/ws/driver/${user.id}?token=${encodeURIComponent(token)}`);
        driverWs.onopen = () => !cancelled && setRealtime('connected');
        driverWs.onclose = () => !cancelled && setRealtime('offline');
        driverWs.onerror = () => !cancelled && setRealtime('offline');
        driverWs.onmessage = (evt) => {
          try {
            const data = JSON.parse(evt.data);
            if (data.event === 'ride.offer' && data.ride) {
              setIncoming(data.ride);
              setCountdown(data.offer_timeout_sec || 15);
            } else if (data.event === 'ride.cancelled') {
              setIncoming((prev: any) => (prev?.id === data.ride_id ? null : prev));
              refresh();
            } else {
              refresh();
            }
          } catch {
            refresh();
          }
        };

        if (ride?.id) {
          rideWs = new WebSocket(`${wsBase}/ws/rides/${ride.id}?token=${encodeURIComponent(token)}`);
          rideWs.onmessage = () => refresh();
        }
      } catch (e) {
        console.warn('driver ws connect failed', e);
        if (!cancelled) setRealtime('offline');
      }
    };

    connect();
    return () => {
      cancelled = true;
      driverWs?.close();
      rideWs?.close();
    };
  }, [refresh, user?.id, ride?.id]);

  const toggleOnline = async (v: boolean) => {
    setOnline(v);
    try {
      await api('/driver/status', { body: { online: v, lat: pos.lat, lng: pos.lng, bearing } });
    } catch (e: any) {
      Alert.alert('Status Error', e.message);
      setOnline(!v);
    }
  };

  const accept = async () => {
    if (!incoming) return;
    try {
      const r = await api<any>(`/rides/${incoming.id}/accept`, { body: {} });
      setIncoming(null);
      setRide(r);
    } catch (e: any) {
      Alert.alert('Offer Expired', e.message);
      setIncoming(null);
    }
  };

  const decline = async () => {
    if (!incoming) return;
    try {
      await api(`/rides/${incoming.id}/decline`, { body: {} });
    } catch {}
    setIncoming(null);
  };

  const markArrived = async () => {
    if (!ride) return;
    try { await api(`/rides/${ride.id}/arrive`, { body: {} }); refresh(); } catch (e: any) { Alert.alert('Error', e.message); }
  };
  const startTrip = async () => {
    if (!ride) return;
    try { await api(`/rides/${ride.id}/start`, { body: {} }); refresh(); } catch (e: any) { Alert.alert('Error', e.message); }
  };
  const complete = async () => {
    if (!ride) return;
    try { await api(`/rides/${ride.id}/complete`, { body: {} }); refresh(); } catch (e: any) { Alert.alert('Error', e.message); }
  };

  const handleNoShow = async () => {
    if (!ride) return;
    Alert.alert(
      'Passenger No-Show',
      'Declare passenger no-show? A standard £5.00 cancellation fee will be charged to the passenger and £4.00 will be credited to your driver wallet.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Declare No-Show (£5 Fee)',
          style: 'destructive',
          onPress: async () => {
            try {
              await api(`/rides/${ride.id}/no-show`, { body: {} });
              Alert.alert('No-Show Recorded', '£4.00 has been credited to your driver wallet.');
              setRide(null);
              refresh();
            } catch (e: any) {
              Alert.alert('Cannot Declare No-Show', e.message);
            }
          },
        },
      ]
    );
  };

  const triggerSos = async () => {
    if (!ride) return;
    Alert.alert(
      '🚨 EMERGENCY SOS ALERT',
      'This will immediately alert Police & Central Dispatch with your live GPS location.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'BROADCAST SOS',
          style: 'destructive',
          onPress: async () => {
            try {
              await api(`/rides/${ride.id}/sos`, {
                body: { ride_id: ride.id, lat: pos.lat, lng: pos.lng, reason: 'Driver triggered SOS' },
              });
              setSosTriggered(true);
              Alert.alert('SOS Broadcasted', 'Dispatch control room and emergency responders have been alerted.');
            } catch (err: any) {
              Alert.alert('SOS Error', err.message);
            }
          },
        },
      ]
    );
  };

  const mapMarkers = [
    { lat: pos.lat, lng: pos.lng, kind: 'car' as const, label: 'You' },
    ...(ride
      ? [
          { lat: ride.pickup.lat, lng: ride.pickup.lng, kind: 'pickup' as const, label: 'Pickup' },
          { lat: ride.destination.lat, lng: ride.destination.lng, kind: 'destination' as const, label: 'Dropoff' },
        ]
      : []),
  ];

  const currentNavStep = ride?.navigation_steps?.[0] || {
    instruction: ride?.status === 'accepted' ? 'Navigate to passenger pickup point' : 'Drive along designated route to dropoff',
    distance_m: 350,
  };

  return (
    <SafeAreaView style={[styles.root, { backgroundColor: theme.bg }]} edges={['top']} testID="driver-home">
      <View style={styles.mapBox}>
        <MapView
          center={ride ? ride.pickup : pos}
          markers={mapMarkers}
          theme={theme}
          showRoute={ride ? { from: ride.pickup, to: ride.destination } : undefined}
        />

        {/* Top: online toggle & realtime status */}
        <View style={[styles.onlineCard, { backgroundColor: theme.surface, borderColor: theme.border }]}>
          <View style={{ flex: 1 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
              <View style={[styles.dot, { backgroundColor: online ? theme.success : '#71717A' }]} />
              <Text style={{ color: theme.text, fontSize: 16, fontWeight: '700' }}>
                {online ? 'You are online' : 'You are offline'}
              </Text>
            </View>
            <Text style={{ color: theme.textDim, fontSize: 12, marginTop: 2 }}>
              {online ? 'Listening for ride dispatches…' : 'Flip the switch to start receiving orders'}
            </Text>
          </View>
          <Switch
            testID="online-toggle"
            value={online}
            onValueChange={toggleOnline}
            thumbColor={online ? theme.accent : '#71717A'}
            trackColor={{ true: theme.accentSoft, false: '#3F3F46' }}
          />
        </View>

        {/* Turn-by-Turn Navigation HUD during active trip */}
        {ride && ['accepted', 'arrived', 'in_progress'].includes(ride.status) && (
          <View style={[styles.navHud, { backgroundColor: '#18181B', borderColor: '#27272A' }]}>
            <View style={styles.navIconWrap}>
              <Ionicons name="navigate-circle" size={28} color={theme.accent} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={{ color: '#fff', fontSize: 14, fontWeight: '700' }}>
                {currentNavStep.instruction}
              </Text>
              <Text style={{ color: '#A1A1AA', fontSize: 12, marginTop: 2 }}>
                In {currentNavStep.distance_m}m · Follow route guidance
              </Text>
            </View>
          </View>
        )}
      </View>

      {/* Bottom sheet */}
      <ScrollView style={[styles.sheet, { backgroundColor: theme.surface }]} contentContainerStyle={{ padding: 20, paddingBottom: 24 }}>
        <View style={[styles.handle, { backgroundColor: theme.border }]} />

        {!ride && (
          <>
            <View style={{ flexDirection: 'row', gap: 12, marginBottom: 16 }}>
              <Widget theme={theme} label="Today's Net" value={`£${(earnings.today || 0).toFixed(2)}`} sub={`${earnings.today_trips || 0} trips`} accent />
              <Widget theme={theme} label="Available" value={`£${(earnings.available_balance ?? earnings.today ?? 0).toFixed(2)}`} sub="Instant Faster Payments" />
            </View>

            <View style={[styles.vehicleInfo, { backgroundColor: theme.surfaceAlt, borderColor: theme.border }]}>
              <Ionicons name="car-outline" size={20} color={theme.accent} />
              <View style={{ flex: 1, marginLeft: 10 }}>
                <Text style={{ color: theme.text, fontSize: 14, fontWeight: '700' }}>
                  {user?.vehicle_make || 'Standard Sedan'} · {user?.vehicle_plate || 'CAB-001'}
                </Text>
                <Text style={{ color: theme.textDim, fontSize: 12 }}>
                  Tier: {user?.vehicle_type?.toUpperCase() || 'ECONOMY'} · Rating ★ {(user?.rating || 5.0).toFixed(1)}
                </Text>
              </View>
            </View>
          </>
        )}

        {ride && (
          <ActiveRide
            ride={ride}
            theme={theme}
            sosTriggered={sosTriggered}
            onTriggerSos={triggerSos}
            onArrived={markArrived}
            onStart={startTrip}
            onComplete={complete}
            onNoShow={handleNoShow}
            onOpenChat={() => router.push(`/driver/chat/${ride.id}` as any)}
          />
        )}
      </ScrollView>

      {/* Incoming Waterfall Request Modal with 15s Circular Countdown */}
      <Modal visible={!!incoming} transparent animationType="slide">
        <View style={{ flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(0,0,0,0.65)' }}>
          <View style={[styles.modalCard, { backgroundColor: theme.surface }]}>
            <View style={[styles.handle, { backgroundColor: theme.border, marginTop: 4 }]} />

            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
              <View>
                <Text style={{ color: theme.accent, fontSize: 12, fontWeight: '800', textTransform: 'uppercase', letterSpacing: 0.8 }}>
                  ⚡ NEW RIDE DISPATCH
                </Text>
                <Text style={{ color: theme.text, fontSize: 32, fontWeight: '800', letterSpacing: -1, marginTop: 2 }}>
                  £{incoming?.fare?.toFixed?.(2)}
                </Text>
              </View>

              {/* Countdown circle */}
              <View style={[styles.timerBadge, { backgroundColor: theme.accent }]}>
                <Text style={styles.timerText}>{countdown}s</Text>
              </View>
            </View>

            <Text style={{ color: theme.textDim, fontSize: 13, marginTop: 4 }}>
              {incoming?.distance_km?.toFixed?.(1)} km · ~{incoming?.duration_min?.toFixed?.(0)} min trip · Tier: {incoming?.ride_type}
            </Text>

            <View style={{ marginTop: 16, gap: 10, backgroundColor: theme.surfaceAlt, padding: 14, borderRadius: 16 }}>
              <View style={{ flexDirection: 'row', gap: 10, alignItems: 'center' }}>
                <Ionicons name="location" size={16} color={theme.success} />
                <Text style={{ color: theme.text, flex: 1, fontSize: 13, fontWeight: '600' }} numberOfLines={1}>
                  Pickup: {incoming?.pickup?.address}
                </Text>
              </View>
              <View style={{ flexDirection: 'row', gap: 10, alignItems: 'center' }}>
                <Ionicons name="flag" size={16} color={theme.danger} />
                <Text style={{ color: theme.text, flex: 1, fontSize: 13, fontWeight: '600' }} numberOfLines={1}>
                  Dropoff: {incoming?.destination?.address}
                </Text>
              </View>
            </View>

            <View style={{ flexDirection: 'row', gap: 12, marginTop: 20 }}>
              <Button
                testID="decline-ride-btn"
                title="Decline"
                onPress={decline}
                variant="secondary"
                theme={theme}
                style={{ flex: 1 }}
              />
              <Button
                testID="accept-ride-btn"
                title={`Accept (${countdown}s)`}
                onPress={accept}
                theme={theme}
                style={{ flex: 2 }}
              />
            </View>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

function Widget({ theme, label, value, sub, accent }: any) {
  return (
    <View
      style={[
        styles.widget,
        {
          backgroundColor: accent ? theme.accent : theme.surfaceAlt,
          borderColor: accent ? theme.accent : theme.border,
        },
      ]}
    >
      <Text style={{ color: accent ? theme.ctaText : theme.textDim, fontSize: 11, fontWeight: '700', textTransform: 'uppercase' }}>{label}</Text>
      <Text style={{ color: accent ? theme.ctaText : theme.text, fontSize: 24, fontWeight: '800', marginTop: 4, letterSpacing: -0.6 }}>
        {value}
      </Text>
      <Text style={{ color: accent ? theme.ctaText : theme.textDim, fontSize: 11, marginTop: 2, opacity: 0.85 }}>{sub}</Text>
    </View>
  );
}

function ActiveRide({
  ride,
  theme,
  sosTriggered,
  onTriggerSos,
  onArrived,
  onStart,
  onComplete,
  onNoShow,
  onOpenChat,
}: any) {
  const isCash = ride.payment_method === 'cash';

  const [waitElapsed, setWaitElapsed] = useState(0);

  useEffect(() => {
    if (ride.status !== 'arrived' || !ride.arrived_at) {
      setWaitElapsed(0);
      return;
    }
    const update = () => {
      const arrivedTime = new Date(ride.arrived_at).getTime();
      const elapsed = Math.max(0, Math.floor((Date.now() - arrivedTime) / 1000));
      setWaitElapsed(elapsed);
    };
    update();
    const timer = setInterval(update, 1000);
    return () => clearInterval(timer);
  }, [ride.status, ride.arrived_at]);

  const graceRemaining = Math.max(0, 120 - waitElapsed);
  const paidMinutes = waitElapsed > 120 ? Math.ceil((waitElapsed - 120) / 60) : 0;
  const currentWaitingFee = (paidMinutes * 0.25).toFixed(2);

  const next: { label: string; fn: () => void; testID: string } =
    ride.status === 'accepted'
      ? { label: 'Arrived at Pickup', fn: onArrived, testID: 'driver-arrive-btn' }
      : ride.status === 'arrived'
      ? { label: 'Start Passenger Trip', fn: onStart, testID: 'driver-start-btn' }
      : {
          label: isCash ? `Collect £${(ride.fare || 0).toFixed(2)} Cash & Complete` : 'Complete & Collect Fare',
          fn: onComplete,
          testID: 'driver-complete-btn',
        };

  return (
    <View>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
        <View style={[styles.statusBadge, { backgroundColor: theme.accentSoft }]}>
          <Text style={{ color: theme.accent, fontSize: 11, fontWeight: '800', textTransform: 'uppercase', letterSpacing: 0.5 }}>
            {ride.status === 'accepted' ? 'Heading to pickup' : ride.status === 'arrived' ? 'At pickup' : 'Trip in progress'}
          </Text>
        </View>

        <TouchableOpacity onPress={onTriggerSos} style={styles.sosBtn}>
          <Ionicons name="shield-checkmark" size={14} color="#EF4444" />
          <Text style={styles.sosText}>{sosTriggered ? 'SOS ACTIVE' : 'SOS'}</Text>
        </TouchableOpacity>
      </View>

      <Text style={{ color: theme.text, fontSize: 22, fontWeight: '700', marginTop: 10, letterSpacing: -0.4 }}>
        {ride.passenger_name}
      </Text>
      <Text style={{ color: theme.textDim, fontSize: 13, marginTop: 2 }}>
        ★ {(ride.passenger_rating ?? 5).toFixed(1)} · Net earnings: £{(ride.driver_earnings || ride.fare * 0.8).toFixed(2)}
      </Text>

      {/* Cash Trip Alert Banner */}
      {isCash && (
        <View
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            backgroundColor: '#DCFCE7',
            borderColor: '#86EFAC',
            borderWidth: 1,
            padding: 12,
            borderRadius: 14,
            marginTop: 12,
            gap: 8,
          }}
        >
          <Ionicons name="cash-outline" size={22} color="#16A34A" />
          <View style={{ flex: 1 }}>
            <Text style={{ color: '#15803D', fontWeight: '700', fontSize: 14 }}>
              Cash Payment: £{(ride.fare || 0).toFixed(2)}
            </Text>
            <Text style={{ color: '#166534', fontSize: 12 }}>
              Collect cash directly from passenger at drop-off.
            </Text>
          </View>
        </View>
      )}

      {/* Arrival Waiting Timer Card (Uber UK Standard) */}
      {ride.status === 'arrived' && (
        <View
          style={{
            backgroundColor: graceRemaining > 0 ? '#ECFDF5' : '#FFFBEB',
            borderColor: graceRemaining > 0 ? '#6EE7B7' : '#FDE68A',
            borderWidth: 1.5,
            padding: 14,
            borderRadius: 16,
            marginTop: 12,
          }}
        >
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
              <Ionicons
                name={graceRemaining > 0 ? 'time-outline' : 'cash-outline'}
                size={18}
                color={graceRemaining > 0 ? '#059669' : '#D97706'}
              />
              <Text style={{ color: graceRemaining > 0 ? '#065F46' : '#92400E', fontWeight: '700', fontSize: 14 }}>
                {graceRemaining > 0
                  ? `Grace Period: ${Math.floor(graceRemaining / 60)}:${String(graceRemaining % 60).padStart(2, '0')}`
                  : `Waiting Fee: +£${currentWaitingFee}`}
              </Text>
            </View>
            <Text style={{ color: theme.textDim, fontSize: 12 }}>
              Total wait: {Math.floor(waitElapsed / 60)}m {waitElapsed % 60}s
            </Text>
          </View>
          <Text style={{ color: graceRemaining > 0 ? '#047857' : '#B45309', fontSize: 12, marginTop: 4 }}>
            {graceRemaining > 0
              ? 'Complimentary 2-min waiting period. Fee starts after 2:00.'
              : 'Paid wait time active: £0.25/min will be automatically added to the fare.'}
          </Text>

          {/* Passenger No-Show Button */}
          <TouchableOpacity
            onPress={onNoShow}
            style={{
              backgroundColor: '#FEF2F2',
              borderColor: '#FCA5A5',
              borderWidth: 1,
              borderRadius: 12,
              paddingVertical: 10,
              paddingHorizontal: 12,
              flexDirection: 'row',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 8,
              marginTop: 12,
            }}
          >
            <Ionicons name="close-circle-outline" size={18} color="#DC2626" />
            <Text style={{ color: '#DC2626', fontWeight: '700', fontSize: 13 }}>
              Passenger No-Show (£5.00 Fee)
            </Text>
          </TouchableOpacity>
        </View>
      )}

      <View style={{ gap: 10, marginTop: 14 }}>
        <View style={{ flexDirection: 'row', gap: 10 }}>
          <Ionicons name="location" size={16} color={theme.success} />
          <Text style={{ color: theme.text, flex: 1 }} numberOfLines={2}>{ride.pickup.address}</Text>
        </View>
        <View style={{ flexDirection: 'row', gap: 10 }}>
          <Ionicons name="flag" size={16} color={theme.danger} />
          <Text style={{ color: theme.text, flex: 1 }} numberOfLines={2}>{ride.destination.address}</Text>
        </View>
      </View>

      <View style={{ flexDirection: 'row', gap: 10, marginTop: 18 }}>
        <Button
          testID="driver-chat-btn"
          title="Chat"
          onPress={onOpenChat}
          variant="secondary"
          theme={theme}
          icon={<Ionicons name="chatbubble-ellipses" size={18} color={theme.text} />}
          style={{ flex: 1 }}
        />
        <Button testID={next.testID} title={next.label} onPress={next.fn} theme={theme} style={{ flex: 2 }} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  mapBox: { flex: 1, position: 'relative' },
  onlineCard: {
    position: 'absolute', top: 12, left: 16, right: 16,
    borderRadius: 20, padding: 16, borderWidth: 1,
    flexDirection: 'row', alignItems: 'center', gap: 14,
    shadowColor: '#000', shadowOpacity: 0.25, shadowRadius: 14, shadowOffset: { width: 0, height: 6 }, elevation: 6,
  },
  dot: { width: 8, height: 8, borderRadius: 4 },
  navHud: {
    position: 'absolute', top: 96, left: 16, right: 16,
    borderRadius: 16, padding: 12, borderWidth: 1,
    flexDirection: 'row', alignItems: 'center', gap: 12,
    shadowColor: '#000', shadowOpacity: 0.35, shadowRadius: 10, elevation: 8,
  },
  navIconWrap: { width: 36, height: 36, borderRadius: 18, backgroundColor: '#27272A', alignItems: 'center', justifyContent: 'center' },
  sheet: {
    maxHeight: '55%',
    borderTopLeftRadius: 32, borderTopRightRadius: 32,
    shadowColor: '#000', shadowOpacity: 0.18, shadowRadius: 20, shadowOffset: { width: 0, height: -8 }, elevation: 10,
  },
  handle: { width: 48, height: 5, borderRadius: 3, alignSelf: 'center', marginBottom: 14 },
  widget: { flex: 1, borderRadius: 20, padding: 16, borderWidth: 1 },
  vehicleInfo: { flexDirection: 'row', alignItems: 'center', padding: 14, borderRadius: 18, borderWidth: 1 },
  statusBadge: { alignSelf: 'flex-start', paddingHorizontal: 10, paddingVertical: 5, borderRadius: 10 },
  sosBtn: { flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: '#EF444420', paddingHorizontal: 10, paddingVertical: 5, borderRadius: 10, borderWidth: 1, borderColor: '#EF4444' },
  sosText: { color: '#EF4444', fontSize: 11, fontWeight: '800' },
  modalCard: {
    borderTopLeftRadius: 32, borderTopRightRadius: 32,
    padding: 22, paddingBottom: 38,
  },
  timerBadge: { width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center' },
  timerText: { color: '#000', fontSize: 16, fontWeight: '800' },
});
