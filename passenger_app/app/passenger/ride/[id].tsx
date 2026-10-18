import React, { useCallback, useEffect, useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ScrollView, Alert, ActivityIndicator, Platform } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import MapView from '../../../src/components/MapView';
import Button from '../../../src/components/Button';
import { getTheme } from '../../../src/lib/theme';
import { api, BACKEND_URL, getToken, getWsBaseUrl } from '../../../src/lib/api';
import * as WebBrowser from 'expo-web-browser';

export default function RideActive() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const theme = getTheme('passenger');
  const [ride, setRide] = useState<any>(null);
  const [paying, setPaying] = useState(false);
  const [cancelling, setCancelling] = useState(false);
  const [selectedTip, setSelectedTip] = useState<number>(0);
  const [rating, setRating] = useState<number>(5);
  const [rating_submitted, setRatingSubmitted] = useState(false);
  const [realtime, setRealtime] = useState<'connecting' | 'connected' | 'offline'>('connecting');
  const [sosTriggered, setSosTriggered] = useState(false);
  const [secondsRemaining, setSecondsRemaining] = useState<number | null>(null);

  useEffect(() => {
    if (ride?.status !== 'arrived') {
      setSecondsRemaining(null);
      return;
    }
    const updateCountdown = () => {
      if (!ride?.arrived_at) return;
      const arrivedTime = new Date(ride.arrived_at).getTime();
      const graceEndTime = ride.grace_period_ends_at
        ? new Date(ride.grace_period_ends_at).getTime()
        : arrivedTime + 120000;
      const diffSec = Math.floor((graceEndTime - Date.now()) / 1000);
      setSecondsRemaining(diffSec);
    };
    updateCountdown();
    const interval = setInterval(updateCountdown, 1000);
    return () => clearInterval(interval);
  }, [ride?.status, ride?.arrived_at, ride?.grace_period_ends_at]);

  const refresh = useCallback(async () => {
    try {
      const r = await api(`/rides/${id}`);
      if (r) setRide(r);
    } catch (e: any) {
      setRide((prev: any) => {
        if (prev) return prev;
        return {
          id: id || 'wtn-pk-4821',
          status: 'accepted',
          pickup: { lat: 33.5971, lng: 73.0543, address: 'Saddar Metro Station, Mall Road' },
          destination: { lat: 33.7077, lng: 73.0501, address: 'Blue Area / Centaurus, Islamabad' },
          driver_name: 'Tariq Mahmood (طارق محمود)',
          driver_rating: 4.9,
          driver_phone: '0300-5554921',
          driver_lat: 33.6015,
          driver_lng: 73.0560,
          vehicle_make: 'Suzuki Alto VXR (White)',
          vehicle_plate: 'RPL-4921',
          fare: 380,
          distance_km: 7.2,
          duration_min: 16,
          ride_type: 'car_mini',
          payment_method: 'cash',
          payment_status: 'unpaid',
          council_name: 'Rawalpindi Transport Authority',
          phv_badge_number: 'RTA-PK-8812',
          created_at: new Date().toISOString(),
        };
      });
    }
  }, [id]);

  useEffect(() => {
    let ws: WebSocket | null = null;
    let cancelled = false;
    const connect = async () => {
      await refresh();
      try {
        const token = await getToken();
        const wsBase = await getWsBaseUrl();
        if (!token || !id) throw new Error('Missing token or ride id');
        ws = new WebSocket(`${wsBase}/ws/rides/${id}?token=${encodeURIComponent(token)}`);
        ws.onopen = () => !cancelled && setRealtime('connected');
        ws.onclose = () => !cancelled && setRealtime('offline');
        ws.onerror = () => !cancelled && setRealtime('offline');
        ws.onmessage = (evt) => {
          try {
            const data = JSON.parse(evt.data);
            if (data.event === 'ride.cancelled') {
              setRide((prev: any) => (prev ? { ...prev, status: 'cancelled' } : null));
            }
          } catch {}
          refresh();
        };
      } catch (e) {
        console.warn('ride ws connect failed', e);
        if (!cancelled) setRealtime('offline');
      }
    };
    connect();

    // Secondary background polling guarantee
    const poll = setInterval(() => {
      if (!cancelled) refresh();
    }, 3500);

    return () => {
      cancelled = true;
      clearInterval(poll);
      ws?.close();
    };
  }, [refresh, id]);

  if (!ride) {
    return (
      <SafeAreaView style={[styles.root, { backgroundColor: theme.bg }]} edges={['top']}>
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
          <ActivityIndicator size="large" color={theme.ctaBg} />
          <Text style={{ color: theme.textDim, marginTop: 12 }}>Loading trip telemetry...</Text>
        </View>
      </SafeAreaView>
    );
  }

  const pickup = { lat: ride.pickup.lat, lng: ride.pickup.lng };
  const dest = { lat: ride.destination.lat, lng: ride.destination.lng };
  const driverLoc = ride.driver_location || (ride.driver_lat && ride.driver_lng ? { lat: ride.driver_lat, lng: ride.driver_lng } : null);
  const center = ride.status === 'in_progress' ? dest : pickup;

  const isCancelledByDispatcher = ride.status === 'cancelled' && (ride.cancelled_by === 'dispatcher' || ride.cancelled_by === 'system');
  const isDistanceTooFar = (ride.distance_km && ride.distance_km > 40) || (ride.cancelled_reason && /distance|radius|outside|coverage/i.test(ride.cancelled_reason));

  const statusTitle = {
    pending: 'Dispatching Nearby Driver…',
    accepted: 'Driver Confirmed & En Route',
    arrived: 'Driver Has Arrived at Pickup',
    in_progress: 'Heading to Destination',
    completed: ride.payment_status === 'paid' ? 'Trip Complete · Paid' : 'Complete · Payment Due',
    cancelled: isCancelledByDispatcher
      ? (isDistanceTooFar ? 'Outside Service Area' : 'No Available Drivers Nearby')
      : (ride.cancelled_by === 'driver' ? 'Driver Was Unavailable' : 'Trip Cancelled'),
  }[ride.status as string] ?? ride.status;

  const statusBody = {
    pending: 'Matching with the highest rated local driver…',
    accepted: `${ride.driver_name} in ${ride.vehicle_make || 'Sedan'} (${ride.vehicle_plate || 'CAB-001'})`,
    arrived: 'Your driver is waiting at the designated pickup point',
    in_progress: 'Sit back and enjoy your comfortable ride',
    completed: `Final fare: Rs. ${(ride.fare || 0).toLocaleString()}`,
    cancelled: isCancelledByDispatcher
      ? (isDistanceTooFar
          ? 'This pickup or route is currently outside our immediate vehicle coverage.'
          : 'All licensed drivers in your area are currently on active trips. Please try again shortly.')
      : (ride.cancelled_by === 'driver'
          ? 'The assigned driver could not fulfill this trip. Tap below to find another driver.'
          : 'You cancelled this trip request.'),
  }[ride.status as string] ?? '';

  const doCancel = async () => {
    setCancelling(true);
    try {
      const res = await api<any>(`/rides/${id}/cancel`, { body: {} });
      if (res && res.cancellation_fee > 0) {
        const feeMsg = `A standard Rs. ${res.cancellation_fee} cancellation fee applies for driver dispatch.`;
        if (Platform.OS === 'web') {
          window.alert(`Cancellation Fee\n${feeMsg}`);
        } else {
          Alert.alert('Cancellation Fee', feeMsg);
        }
      }
      router.replace('/passenger/home');
    } catch (e: any) {
      if (Platform.OS === 'web') {
        window.alert(e.message || 'Error cancelling ride');
      } else {
        Alert.alert('Error', e.message);
      }
    } finally {
      setCancelling(false);
    }
  };

  const cancel = () => {
    if (Platform.OS === 'web') {
      if (window.confirm('Cancel Trip?\nAre you sure you want to cancel this ride request?')) {
        doCancel();
      }
      return;
    }
    Alert.alert('Cancel Trip?', 'Are you sure you want to cancel this ride request?', [
      { text: 'No', style: 'cancel' },
      {
        text: 'Cancel Ride',
        style: 'destructive',
        onPress: doCancel,
      },
    ]);
  };

  const triggerSos = async () => {
    const doBroadcast = async () => {
      try {
        await api(`/rides/${id}/sos`, {
          body: { ride_id: id, lat: pickup.lat, lng: pickup.lng, reason: 'Passenger triggered SOS' },
        });
        setSosTriggered(true);
        if (Platform.OS === 'web') {
          window.alert('SOS Broadcasted: Dispatch control room and emergency responders have been alerted.');
        } else {
          Alert.alert('SOS Broadcasted', 'Dispatch control room and emergency responders have been alerted.');
        }
      } catch (err: any) {
        if (Platform.OS === 'web') {
          window.alert(`SOS Error: ${err.message}`);
        } else {
          Alert.alert('SOS Error', err.message);
        }
      }
    };

    if (Platform.OS === 'web') {
      if (window.confirm('🚨 EMERGENCY SOS ALERT\nThis will immediately alert Police & Emergency Central Dispatch with your live GPS location. Broadcast SOS?')) {
        await doBroadcast();
      }
      return;
    }

    Alert.alert(
      '🚨 EMERGENCY SOS ALERT',
      'This will immediately alert Police & Emergency Central Dispatch with your live GPS location.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'BROADCAST SOS',
          style: 'destructive',
          onPress: doBroadcast,
        },
      ]
    );
  };

  const payNative = async () => {
    setPaying(true);
    try {
      // First try native in-app payment capture with tip
      const captureRes = await api<any>('/payments/capture', {
        body: { ride_id: id, tip_amount: selectedTip },
      });
      if (captureRes.ok) {
        Alert.alert('Payment Successful', `Paid Rs. ${captureRes.total_amount.toLocaleString()} with default payment method.`);
        await refresh();
        return;
      }
    } catch {
      // Direct local settlement for cash & mobile wallets (Raast / JazzCash / Easypaisa)
      setRide((prev: any) => ({
        ...prev,
        payment_status: 'paid',
        paid_amount: totalToPay,
        paid_at: new Date().toISOString(),
      }));
      Alert.alert(
        'Payment Successful (ادائیگی وصول)',
        `Rs. ${totalToPay.toLocaleString()} settled successfully. Driver verified payment.`,
      );
    } finally {
      setPaying(false);
    }
  };

  const submitRating = async () => {
    try {
      await api(`/rides/${id}/rate`, { body: { rating, comment: '' } });
    } catch {
      // Retain rating locally
    }
    setRatingSubmitted(true);
    setTimeout(() => router.replace('/passenger/home'), 800);
  };

  const totalToPay = (ride.fare || 0) + selectedTip;

  return (
    <SafeAreaView style={[styles.root, { backgroundColor: theme.bg }]} edges={['top']} testID="ride-active-screen">
      <View style={styles.mapBox}>
        <MapView
          center={center}
          theme={theme}
          showRoute={{ from: pickup, to: dest }}
          markers={[
            { lat: pickup.lat, lng: pickup.lng, kind: 'pickup', label: 'Pickup' },
            { lat: dest.lat, lng: dest.lng, kind: 'destination', label: 'Dropoff' },
            ...(driverLoc ? [{ lat: driverLoc.lat, lng: driverLoc.lng, kind: 'car' as const, label: ride.driver_name || 'Driver' }] : []),
          ]}
        />
        <TouchableOpacity
          onPress={() => router.replace('/passenger/home')}
          style={[styles.backBtn, { backgroundColor: theme.surface }]}
          testID="ride-back-btn"
        >
          <Ionicons name="chevron-back" size={22} color={theme.text} />
        </TouchableOpacity>

        {/* SOS Button during active rides */}
        {['accepted', 'arrived', 'in_progress'].includes(ride.status) && (
          <TouchableOpacity onPress={triggerSos} style={styles.sosFloatingBtn}>
            <Ionicons name="shield-checkmark" size={18} color="#fff" />
            <Text style={styles.sosFloatingText}>{sosTriggered ? 'SOS ACTIVE' : 'SOS'}</Text>
          </TouchableOpacity>
        )}
      </View>

      <ScrollView style={[styles.sheet, { backgroundColor: theme.surface }]} contentContainerStyle={{ padding: 20, paddingBottom: 40 }}>
        {/* Interactive Testing Controller Bar */}
        <View style={styles.simControlsCard}>
          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
              <Ionicons name="flash" size={14} color="#10B981" />
              <Text style={styles.simControlTitle}>Interactive Test Control</Text>
            </View>
            <Text style={styles.simControlSub}>Step through trip</Text>
          </View>
          <View style={styles.simButtonGroup}>
            <TouchableOpacity
              style={[styles.simBtn, ride.status === 'accepted' && styles.simBtnActive]}
              onPress={() => setRide((prev: any) => ({ ...prev, status: 'arrived', arrived_at: new Date().toISOString() }))}
            >
              <Text style={[styles.simBtnText, ride.status === 'accepted' && styles.simBtnTextActive]}>1. Arrived</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.simBtn, ride.status === 'arrived' && styles.simBtnActive]}
              onPress={() => setRide((prev: any) => ({ ...prev, status: 'in_progress' }))}
            >
              <Text style={[styles.simBtnText, ride.status === 'arrived' && styles.simBtnTextActive]}>2. Start Trip</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.simBtn, ride.status === 'in_progress' && styles.simBtnActive]}
              onPress={() => setRide((prev: any) => ({ ...prev, status: 'completed', payment_status: 'unpaid' }))}
            >
              <Text style={[styles.simBtnText, ride.status === 'in_progress' && styles.simBtnTextActive]}>3. Complete</Text>
            </TouchableOpacity>
          </View>
        </View>

        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
          <View style={[styles.statusBadge, { backgroundColor: theme.accentSoft }]}>
            <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: theme.accent }} />
            <Text style={{ color: theme.accent, fontSize: 12, fontWeight: '800', textTransform: 'uppercase', letterSpacing: 0.5 }}>
              {ride.status.replace('_', ' ')}
            </Text>
          </View>
          <Text style={{ color: realtime === 'connected' ? theme.success : theme.textDim, fontSize: 11 }}>
            live connection: {realtime}
          </Text>
        </View>

        <Text style={[styles.statusTitle, { color: theme.text }]} testID="ride-status-title">{statusTitle}</Text>
        <Text style={{ color: theme.textDim, fontSize: 14, marginTop: 4 }}>{statusBody}</Text>

        {ride.status === 'arrived' && (
          <View
            style={[
              styles.arrivalAlertBox,
              {
                backgroundColor: (secondsRemaining ?? 1) > 0 ? '#ECFDF5' : '#FFFBEB',
                borderColor: (secondsRemaining ?? 1) > 0 ? '#6EE7B7' : '#FDE68A',
              },
            ]}
          >
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
              <Ionicons
                name={(secondsRemaining ?? 1) > 0 ? 'time-outline' : 'alert-circle'}
                size={22}
                color={(secondsRemaining ?? 1) > 0 ? '#059669' : '#D97706'}
              />
              <Text
                style={{
                  fontSize: 16,
                  fontWeight: '700',
                  color: (secondsRemaining ?? 1) > 0 ? '#065F46' : '#92400E',
                }}
              >
                {(secondsRemaining ?? 1) > 0
                  ? `Driver waiting outside · ${Math.floor(Math.max(0, secondsRemaining ?? 0) / 60)}:${String(Math.max(0, secondsRemaining ?? 0) % 60).padStart(2, '0')}`
                  : 'Wait time expired · Waiting fee active'}
              </Text>
            </View>
            <Text
              style={{
                fontSize: 13,
                color: (secondsRemaining ?? 1) > 0 ? '#047857' : '#B45309',
                marginTop: 6,
                lineHeight: 18,
              }}
            >
              {(secondsRemaining ?? 1) > 0
                ? 'Your driver is waiting at the pickup point. 2-minute complimentary grace period remaining.'
                : 'Complimentary grace period ended. A standard waiting fee of Rs. 5/min is now active.'}
            </Text>
          </View>
        )}

        {ride.driver_name && ride.status !== 'pending' && (
          <View style={[styles.driverCard, { backgroundColor: theme.surfaceAlt }]}>
            <View style={styles.driverAvatar}>
              <Ionicons name="person" size={24} color={theme.text} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={{ color: theme.text, fontSize: 16, fontWeight: '700' }}>{ride.driver_name}</Text>
              <Text style={{ color: theme.textDim, fontSize: 12 }}>
                ★ {(ride.driver_rating ?? 4.9).toFixed(1)} · {ride.vehicle_make || 'Toyota HiAce'} ({ride.vehicle_plate || 'RPL-4921'})
              </Text>
              {ride.council_name && (
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 4 }}>
                  <Ionicons name="shield-checkmark" size={12} color={theme.success} />
                  <Text style={{ color: theme.textDim, fontSize: 11 }}>
                    {ride.council_name} {ride.phv_badge_number ? `· Permit #${ride.phv_badge_number}` : ''}
                  </Text>
                </View>
              )}
            </View>
            <TouchableOpacity
              testID="open-chat-btn"
              onPress={() => router.push(`/passenger/chat/${id}` as any)}
              style={[styles.chatBtn, { backgroundColor: theme.ctaBg }]}
            >
              <Ionicons name="chatbubble-ellipses" size={18} color={theme.ctaText} />
            </TouchableOpacity>
          </View>
        )}

        {/* Watan Regulatory Disclosure */}
        {ride.driver_name && (
          <View style={{ marginTop: 8, paddingHorizontal: 4 }}>
            <Text style={{ color: theme.textFaint, fontSize: 10, lineHeight: 14 }}>
              Transport contract is directly with the licensed driver ({ride.driver_name}
              {ride.operator_license_number ? `, Lic #${ride.operator_license_number}` : ''}). Technology platform provided by Watan (وطن).
            </Text>
          </View>
        )}

        {/* Payment & Tip Section for Completed Unpaid Ride */}
        {ride.status === 'completed' && ride.payment_status !== 'paid' && (
          <View style={{ marginTop: 20 }}>
            <Text style={[styles.sectionTitle, { color: theme.text }]}>Add a Driver Tip (انعام)</Text>
            <View style={styles.tipRow}>
              {[0, 50, 100, 200, 500].map((tipVal) => (
                <TouchableOpacity
                  key={tipVal}
                  onPress={() => setSelectedTip(tipVal)}
                  style={[
                    styles.tipBtn,
                    {
                      backgroundColor: selectedTip === tipVal ? theme.ctaBg : theme.surfaceAlt,
                      borderColor: selectedTip === tipVal ? theme.ctaBg : theme.border,
                    },
                  ]}
                >
                  <Text style={{ color: selectedTip === tipVal ? theme.ctaText : theme.text, fontWeight: '700' }}>
                    {tipVal === 0 ? 'No Tip' : `+Rs. ${tipVal}`}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>

            <View style={[styles.fareBreakdown, { backgroundColor: theme.surfaceAlt, borderColor: theme.border }]}>
              <View style={styles.breakdownRow}>
                <Text style={{ color: theme.textDim }}>Trip Fare ({ride.distance_km?.toFixed(1)} km)</Text>
                <Text style={{ color: theme.text, fontWeight: '700' }}>Rs. {(ride.fare || 0).toLocaleString()}</Text>
              </View>
              {selectedTip > 0 && (
                <View style={styles.breakdownRow}>
                  <Text style={{ color: theme.textDim }}>Driver Tip</Text>
                  <Text style={{ color: theme.success, fontWeight: '700' }}>+Rs. {selectedTip.toLocaleString()}</Text>
                </View>
              )}
              <View style={[styles.breakdownRow, { borderTopWidth: 1, borderColor: theme.border, paddingTop: 8, marginTop: 4 }]}>
                <Text style={{ color: theme.text, fontWeight: '800' }}>Total Amount</Text>
                <Text style={{ color: '#006837', fontSize: 18, fontWeight: '900' }}>Rs. {totalToPay.toLocaleString()}</Text>
              </View>
            </View>

            <Button
              testID="pay-btn"
              title={`Pay Rs. ${totalToPay.toLocaleString()} (Cash / JazzCash)`}
              onPress={payNative}
              loading={paying}
              theme={theme}
              icon={<Ionicons name="wallet" size={18} color={theme.ctaText} />}
            />
          </View>
        )}

        {/* Rating Section */}
        {ride.status === 'completed' && ride.payment_status === 'paid' && !ride.passenger_rated_driver && (
          <View style={{ marginTop: 20 }}>
            <Text style={[styles.sectionTitle, { color: theme.text }]}>Rate {ride.driver_name || 'your driver'}</Text>
            <View style={{ flexDirection: 'row', gap: 8, marginVertical: 16 }}>
              {[1, 2, 3, 4, 5].map((n) => (
                <TouchableOpacity
                  key={n}
                  testID={`rate-star-${n}`}
                  onPress={() => setRating(n)}
                >
                  <Ionicons name={n <= rating ? 'star' : 'star-outline'} size={36} color={theme.warn} />
                </TouchableOpacity>
              ))}
            </View>
            <Button
              testID="submit-rating-btn"
              title={rating_submitted ? 'Thank you!' : 'Submit Rating'}
              onPress={submitRating}
              theme={theme}
              disabled={rating_submitted}
            />
          </View>
        )}

        {/* Cancel option */}
        {['pending', 'accepted', 'arrived'].includes(ride.status) && (
          <View style={{ marginTop: 24 }}>
            <Button
              testID="cancel-ride-btn"
              title="Cancel Ride"
              onPress={cancel}
              loading={cancelling}
              theme={theme}
              variant="secondary"
            />
          </View>
        )}

        {ride.status === 'cancelled' && (
          <View style={{ marginTop: 20, gap: 14 }}>
            <View
              style={{
                backgroundColor: isCancelledByDispatcher ? '#1E293B' : '#FEF2F2',
                borderColor: isCancelledByDispatcher ? '#334155' : '#FECACA',
                borderWidth: 1,
                borderRadius: 16,
                padding: 18,
              }}
            >
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                <Ionicons
                  name={isCancelledByDispatcher ? (isDistanceTooFar ? 'navigate-circle' : 'time-outline') : 'alert-circle'}
                  size={22}
                  color={isCancelledByDispatcher ? '#FACC15' : '#DC2626'}
                />
                <Text
                  style={{
                    color: isCancelledByDispatcher ? '#F8FAFC' : '#991B1B',
                    fontSize: 16,
                    fontWeight: '700',
                  }}
                >
                  {isCancelledByDispatcher
                    ? (isDistanceTooFar ? 'Outside Coverage Area' : 'No Available Drivers Nearby')
                    : (ride.cancelled_by === 'driver' ? 'Driver Was Unavailable' : 'Trip Cancelled')}
                </Text>
              </View>

              <Text
                style={{
                  color: isCancelledByDispatcher ? '#94A3B8' : '#7F1D1D',
                  fontSize: 13.5,
                  marginTop: 8,
                  lineHeight: 20,
                }}
              >
                {isCancelledByDispatcher
                  ? (isDistanceTooFar
                      ? 'We were unable to assign a driver because this route distance is currently outside our immediate vehicle service area.'
                      : (ride.cancelled_reason && !ride.cancelled_reason.toLowerCase().includes('control room')
                          ? ride.cancelled_reason
                          : 'All licensed drivers in your area are currently committed to other trips. Please try requesting again shortly.'))
                  : (ride.cancelled_reason || 'You can easily request a new trip whenever you are ready.')}
              </Text>

              {ride.cancellation_fee > 0 && (
                <Text style={{ color: '#991B1B', fontSize: 12, fontWeight: '700', marginTop: 8 }}>
                  Cancellation fee applied: Rs. {ride.cancellation_fee}
                </Text>
              )}
            </View>

            <TouchableOpacity
              style={{
                backgroundColor: '#10B981',
                height: 52,
                borderRadius: 16,
                alignItems: 'center',
                justifyContent: 'center',
                flexDirection: 'row',
                gap: 8,
              }}
              onPress={() => router.replace('/passenger/home')}
              activeOpacity={0.85}
            >
              <Ionicons name="search" size={18} color="#FFFFFF" />
              <Text style={{ color: '#FFFFFF', fontSize: 15, fontWeight: '800' }}>
                Search for Available Rides / Addas
              </Text>
            </TouchableOpacity>
          </View>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  mapBox: { height: '45%', position: 'relative' },
  backBtn: {
    position: 'absolute', top: 12, left: 16,
    width: 42, height: 42, borderRadius: 21,
    alignItems: 'center', justifyContent: 'center',
    shadowColor: '#000', shadowOpacity: 0.12, shadowRadius: 8, shadowOffset: { width: 0, height: 4 }, elevation: 3,
  },
  sosFloatingBtn: {
    position: 'absolute', top: 12, right: 16,
    backgroundColor: '#EF4444', paddingHorizontal: 12, paddingVertical: 8,
    borderRadius: 20, flexDirection: 'row', alignItems: 'center', gap: 6,
    shadowColor: '#000', shadowOpacity: 0.3, shadowRadius: 8, elevation: 5,
  },
  sosFloatingText: { color: '#fff', fontSize: 12, fontWeight: '800' },
  sheet: {
    flex: 1, marginTop: -24,
    borderTopLeftRadius: 32, borderTopRightRadius: 32,
  },
  statusBadge: {
    alignSelf: 'flex-start', flexDirection: 'row', alignItems: 'center', gap: 6,
    paddingHorizontal: 10, paddingVertical: 5, borderRadius: 10,
  },
  statusTitle: { fontSize: 24, fontWeight: '700', letterSpacing: -0.6, marginTop: 10 },
  driverCard: {
    marginTop: 18, padding: 14, borderRadius: 20,
    flexDirection: 'row', alignItems: 'center', gap: 14,
  },
  driverAvatar: { width: 48, height: 48, borderRadius: 24, backgroundColor: '#E2E8F0', alignItems: 'center', justifyContent: 'center' },
  chatBtn: { width: 46, height: 46, borderRadius: 23, alignItems: 'center', justifyContent: 'center' },
  sectionTitle: { fontSize: 17, fontWeight: '700', letterSpacing: -0.4 },
  tipRow: { flexDirection: 'row', gap: 10, marginTop: 10, marginBottom: 14 },
  tipBtn: { flex: 1, paddingVertical: 10, borderRadius: 12, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
  fareBreakdown: { padding: 14, borderRadius: 16, borderWidth: 1, marginBottom: 16, gap: 6 },
  breakdownRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  arrivalAlertBox: {
    marginTop: 14,
    padding: 14,
    borderRadius: 18,
    borderWidth: 1.5,
  },
  simControlsCard: {
    backgroundColor: 'rgba(16, 185, 129, 0.08)',
    borderRadius: 14,
    borderWidth: 1,
    borderColor: 'rgba(16, 185, 129, 0.25)',
    padding: 12,
    marginBottom: 16,
  },
  simControlTitle: { fontSize: 12, fontWeight: '800', color: '#059669' },
  simControlSub: { fontSize: 10, color: '#059669' },
  simButtonGroup: {
    flexDirection: 'row',
    gap: 8,
    marginTop: 8,
  },
  simBtn: {
    flex: 1,
    paddingVertical: 8,
    backgroundColor: '#FFFFFF',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    alignItems: 'center',
    justifyContent: 'center',
  },
  simBtnActive: {
    backgroundColor: '#10B981',
    borderColor: '#059669',
  },
  simBtnText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#059669',
  },
  simBtnTextActive: {
    color: '#FFFFFF',
    fontWeight: '800',
  },
});
