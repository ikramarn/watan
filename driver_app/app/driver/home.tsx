import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, Switch, Alert, ScrollView, Modal, ActivityIndicator,
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
import { api, getToken } from '../../src/lib/api';

import { Platform } from 'react-native';

const DEFAULT_POS = { lat: 33.6007, lng: 73.0679 }; // Rawalpindi / Islamabad Saddar
const BG_LOCATION_TASK = 'driver-bg-location';

// Background task
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

  // Mode: 'adda' (Pari Queue Mode) vs 'roaming' (Freelance Doorstep Hail)
  const [activeMode, setActiveMode] = useState<'adda' | 'roaming'>('adda');
  const [online, setOnline] = useState(true);
  const [pos, setPos] = useState(DEFAULT_POS);
  const [bearing, setBearing] = useState(0);

  // Adda Pari State
  const [pariTurn, setPariTurn] = useState<number>(2);
  const [bayNumber, setBayNumber] = useState<number>(3);
  const [filledSeats, setFilledSeats] = useState<number>(11);
  const totalSeats = 14;
  const [countdownMinutes, setCountdownMinutes] = useState<number>(12);
  const [countdownSeconds, setCountdownSeconds] = useState<number>(45);

  // Manifest
  const [manifest, setManifest] = useState([
    { id: '1', name: 'Muhammad Usman', phone: '0300-1234567', seats: [3, 4], status: 'QR Verified (نقد اڈہ کاؤنٹر)' },
    { id: '2', name: 'Zainab Bibi', phone: '0321-7654321', seats: [6], status: 'Paid Online via JazzCash' },
    { id: '3', name: 'Walk-in Commuter', phone: 'Cash Passenger', seats: [8], status: 'Counter Ticket #402' },
  ]);

  // QR Boarding Scanner Modal
  const [scanModalVisible, setScanModalVisible] = useState(false);
  const [scanInput, setScanInput] = useState('');

  // Geofence Modal
  const [geofencePrompt, setGeofencePrompt] = useState<boolean>(false);

  // Roaming Mode State
  const [incoming, setIncoming] = useState<any>(null);
  const [countdown, setCountdown] = useState(15);
  const [ride, setRide] = useState<any>(null);
  const [earnings, setEarnings] = useState<any>({ total: 4200, today: 1850, week: 14200, today_trips: 5, available_balance: 420 });

  // Countdown timer for Adda departure
  useEffect(() => {
    const timer = setInterval(() => {
      setCountdownSeconds((sec) => {
        if (sec > 0) return sec - 1;
        setCountdownMinutes((min) => (min > 0 ? min - 1 : 0));
        return 59;
      });
    }, 1000);
    return () => clearInterval(timer);
  }, []);

  // GPS tracking
  useEffect(() => {
    let sub: Location.LocationSubscription | null = null;
    (async () => {
      try {
        const { status } = await Location.requestForegroundPermissionsAsync();
        if (status === 'granted') {
          const loc = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
          if (loc?.coords) {
            setPos({ lat: loc.coords.latitude, lng: loc.coords.longitude });
          }
          sub = await Location.watchPositionAsync(
            { accuracy: Location.Accuracy.High, distanceInterval: 10 },
            (newLoc) => {
              setPos({ lat: newLoc.coords.latitude, lng: newLoc.coords.longitude });
              if (newLoc.coords.heading) setBearing(newLoc.coords.heading);
            }
          );
        }
      } catch (err) {
        console.warn('Driver GPS error:', err);
      }
    })();
    return () => { sub?.remove(); };
  }, []);

  const handleModeSwitch = (mode: 'adda' | 'roaming') => {
    setActiveMode(mode);
    if (mode === 'adda') {
      Alert.alert(
        'Adda Pari Mode Activated',
        'You are now in the Stand Pari rotation queue. Doorstep hails are paused. 0% Platform Commission applies.'
      );
    } else {
      Alert.alert(
        'Independent Roaming Mode Activated',
        'You are now free-floating for doorstep customer hail requests. Standard platform commission applies.'
      );
    }
  };

  const handleValidateBoardingQr = () => {
    if (!scanInput.trim()) return;
    const newPassenger = {
      id: String(Date.now()),
      name: 'Verified Commuter',
      phone: scanInput.toUpperCase(),
      seats: [filledSeats + 1],
      status: 'Boarded ✓',
    };
    setManifest([...manifest, newPassenger]);
    setFilledSeats((prev) => Math.min(totalSeats, prev + 1));
    setScanModalVisible(false);
    setScanInput('');
    Alert.alert('Boarding Confirmed', `Ticket verified for seat #${filledSeats + 1}. Cleared to board.`);
  };

  const handleDepartStand = () => {
    Alert.alert(
      'Depart Stand (روانگی اڈہ)',
      'Confirm vehicle departure? Stand gate exit parchi will be registered.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Confirm Departure',
          onPress: () => {
            Alert.alert('Safe Journey! (سفر بخیر)', 'Trip started on Rawalpindi - Peshawar Highway.');
          },
        },
      ]
    );
  };

  const capacityPercent = Math.round((filledSeats / totalSeats) * 100);

  return (
    <SafeAreaView style={styles.root} edges={['top', 'bottom']}>
      {/* Top Header */}
      <View style={styles.navBar}>
        <View style={styles.brandRow}>
          <View style={styles.brandIconBox}>
            <Ionicons name="car-sport" size={20} color="#59DF89" />
          </View>
          <View>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
              <Text style={styles.brandTitle}>WATAN DRIVER</Text>
              <View style={styles.onlineDot} />
            </View>
            <Text style={styles.brandSubtitle}>
              {activeMode === 'adda' ? 'Pari Turn Mode (اڈہ پاری)' : 'Roaming Mode (روامنگ)'}
            </Text>
          </View>
        </View>

        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
          <View style={styles.dutyBadge}>
            <Text style={styles.dutyBadgeText}>آن ڈیوٹی</Text>
          </View>
          <TouchableOpacity style={styles.profileBtn} onPress={() => router.push('/driver/profile')}>
            <Ionicons name="person" size={16} color="#DCE4E1" />
          </TouchableOpacity>
        </View>
      </View>

      <ScrollView style={{ flex: 1 }} contentContainerStyle={{ paddingBottom: 30 }} showsVerticalScrollIndicator={false}>
        {/* Driver Identity Card */}
        <View style={styles.driverCard}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
            <View style={styles.avatarBox}>
              <Ionicons name="person" size={24} color="#0D1513" />
              <View style={styles.verifiedCheck}>
                <Ionicons name="checkmark" size={10} color="#FFFFFF" />
              </View>
            </View>
            <View style={{ flex: 1 }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                <Text style={styles.driverName}>طارق محمود</Text>
                <Text style={styles.driverNameEn}>Tariq M.</Text>
              </View>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 2 }}>
                <View style={styles.ratingChip}>
                  <Ionicons name="star" size={12} color="#FFB95F" />
                  <Text style={styles.ratingText}>4.85</Text>
                </View>
                <Text style={styles.vehicleText}>Toyota HiAce • LES-19-4821</Text>
              </View>
            </View>
          </View>

          {/* Mode Switcher Toggle Pill */}
          <View style={styles.modeSwitchRow}>
            <TouchableOpacity
              style={[styles.modeTab, activeMode === 'roaming' && styles.modeTabActive]}
              onPress={() => handleModeSwitch('roaming')}
            >
              <Ionicons name="navigate" size={15} color={activeMode === 'roaming' ? '#00391A' : '#BCCABC'} />
              <Text style={[styles.modeTabText, activeMode === 'roaming' && styles.modeTabTextActive]}>
                Roaming (روامنگ)
              </Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.modeTab, activeMode === 'adda' && styles.modeTabActive]}
              onPress={() => handleModeSwitch('adda')}
            >
              <Ionicons name="bus" size={15} color={activeMode === 'adda' ? '#00391A' : '#BCCABC'} />
              <Text style={[styles.modeTabText, activeMode === 'adda' && styles.modeTabTextActive]}>
                Adda Pari (اڈہ پاری)
              </Text>
            </TouchableOpacity>
          </View>
        </View>

        {activeMode === 'adda' ? (
          // =========================================================================
          // ADDA PARI MODE COCKPIT (THE MUNSHI & STAND ROTATION VIEW)
          // =========================================================================
          <View style={{ paddingHorizontal: 16, gap: 14 }}>
            {/* Hero Pari Queue Status Card */}
            <View style={styles.pariCard}>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                <View style={styles.bayBadge}>
                  <Ionicons name="format-list-bulleted" size={14} color="#00391A" />
                  <Text style={styles.bayBadgeText}>BAY 3 • بے ۳</Text>
                </View>
                <View style={styles.munshiSyncBadge}>
                  <Ionicons name="shield-checkmark" size={12} color="#59DF89" />
                  <Text style={styles.munshiSyncText}>منشی کنیکٹڈ ✓</Text>
                </View>
              </View>

              {/* Big Circular Turn Badge */}
              <View style={styles.pariTurnCenter}>
                <View style={styles.pariCircle}>
                  <Text style={styles.pariTurnNumber}>#{pariTurn}</Text>
                  <Text style={styles.pariTurnLabel}>پاری نمبر</Text>
                </View>
                <View style={{ flex: 1, marginLeft: 16 }}>
                  <Text style={styles.standTitle}>Al-Makkah Wagon Stand</Text>
                  <Text style={styles.routeTitle}>Rawalpindi to Peshawar Line</Text>
                  <Text style={styles.departureCountdown}>
                    Estimated Departure in {countdownMinutes}:{countdownSeconds < 10 ? `0${countdownSeconds}` : countdownSeconds}
                  </Text>
                </View>
              </View>

              {/* Progress Bar (Seats Filled) */}
              <View style={styles.capacityProgressSection}>
                <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 6 }}>
                  <Text style={styles.capacityLabel}>{filledSeats} of {totalSeats} Seats Filled</Text>
                  <Text style={styles.capacityPercent}>{capacityPercent}%</Text>
                </View>
                <View style={styles.progressTrack}>
                  <View style={[styles.progressFill, { width: `${capacityPercent}%` }]} />
                </View>
              </View>
            </View>

            {/* Passenger Manifest */}
            <View style={styles.manifestCard}>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
                <View>
                  <Text style={styles.manifestTitle}>Passenger Manifest (مسافر لسٹ)</Text>
                  <Text style={styles.manifestSub}>Confirmed reservations for this trip</Text>
                </View>
                <TouchableOpacity
                  style={styles.scanQrBtn}
                  onPress={() => setScanModalVisible(true)}
                >
                  <Ionicons name="qr-code" size={14} color="#00391A" />
                  <Text style={styles.scanQrBtnText}>Verify QR</Text>
                </TouchableOpacity>
              </View>

              <View style={{ gap: 8 }}>
                {manifest.map((p) => (
                  <View key={p.id} style={styles.manifestItem}>
                    <View style={styles.paxAvatar}>
                      <Ionicons name="person" size={16} color="#59DF89" />
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.paxName}>{p.name}</Text>
                      <Text style={styles.paxMeta}>Seats: {p.seats.join(', ')} • {p.phone}</Text>
                    </View>
                    <View style={styles.verifiedTag}>
                      <Text style={styles.verifiedTagText}>{p.status}</Text>
                    </View>
                  </View>
                ))}
              </View>
            </View>

            {/* 0% Commission Float Status Card */}
            <View style={styles.commissionBanner}>
              <Ionicons name="checkmark-circle" size={20} color="#59DF89" />
              <View style={{ flex: 1 }}>
                <Text style={styles.commissionTitle}>0% Platform Commission</Text>
                <Text style={styles.commissionSub}>
                  You are an official Adda fleet member. You keep 100% of all passenger fares!
                </Text>
              </View>
            </View>

            {/* Depart Stand Primary Action */}
            <TouchableOpacity
              style={styles.departBtn}
              onPress={handleDepartStand}
              activeOpacity={0.85}
            >
              <Text style={styles.departBtnText}>Depart Stand (روانہ ہوں)</Text>
              <Ionicons name="arrow-forward" size={18} color="#00391A" />
            </TouchableOpacity>
          </View>
        ) : (
          // =========================================================================
          // ROAMING MODE COCKPIT (DOORSTEP ON-DEMAND UBER STYLE)
          // =========================================================================
          <View style={{ paddingHorizontal: 16, gap: 14 }}>
            <View style={styles.roamingHeroCard}>
              <Text style={styles.roamingStatusTitle}>
                {online ? 'Looking for Nearby Doorstep Rides...' : 'You are currently Offline'}
              </Text>
              <Text style={styles.roamingStatusSub}>
                {online ? 'Roaming in Saddar, Rawalpindi. Keep app open to receive requests.' : 'Toggle switch below to go Online.'}
              </Text>
              <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 12 }}>
                <Text style={{ color: '#DCE4E1', fontWeight: 'bold', fontSize: 14 }}>Driver Online</Text>
                <Switch
                  value={online}
                  onValueChange={setOnline}
                  trackColor={{ false: '#3D4A3F', true: '#00A859' }}
                  thumbColor={online ? '#59DF89' : '#869487'}
                />
              </View>
            </View>

            {/* Sample Doorstep Incoming Offer */}
            {online && (
              <View style={styles.incomingCard}>
                <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                  <Text style={styles.incomingBadge}>NEW RIDE OFFER • 15s</Text>
                  <Text style={styles.incomingFare}>Rs. 380</Text>
                </View>
                <Text style={styles.incomingRoute}>Pickup: Saddar Metro Station, Rawalpindi</Text>
                <Text style={styles.incomingRoute}>Dropoff: Blue Area, Islamabad (9.2 km)</Text>

                <View style={{ flexDirection: 'row', gap: 10, marginTop: 12 }}>
                  <TouchableOpacity
                    style={styles.declineBtn}
                    onPress={() => Alert.alert('Declined', 'Offer passed to next captain.')}
                  >
                    <Text style={styles.declineBtnText}>Decline</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={styles.acceptBtn}
                    onPress={() => Alert.alert('Accepted!', 'Heading to passenger pickup at Saddar Metro.')}
                  >
                    <Text style={styles.acceptBtnText}>Accept Ride (قبول کریں)</Text>
                  </TouchableOpacity>
                </View>
              </View>
            )}

            {/* Floating Wallet Status */}
            <View style={styles.walletBox}>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                <View>
                  <Text style={styles.walletLabel}>PREPAID FLOAT BALANCE</Text>
                  <Text style={styles.walletValue}>Rs. {earnings.available_balance}</Text>
                </View>
                <Button
                  title="Top-Up via Raast"
                  onPress={() => Alert.alert('Raast QR', 'Generating State Bank Raast Dynamic QR Code...')}
                  variant="primary"
                />
              </View>
            </View>
          </View>
        )}
      </ScrollView>

      {/* QR Code Boarding Verification Modal */}
      <Modal visible={scanModalVisible} animationType="fade" transparent>
        <View style={styles.modalBackdrop}>
          <View style={styles.scanModalBox}>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
              <Text style={styles.scanModalTitle}>Verify Passenger Boarding QR</Text>
              <TouchableOpacity onPress={() => setScanModalVisible(false)}>
                <Ionicons name="close" size={22} color="#DCE4E1" />
              </TouchableOpacity>
            </View>

            <View style={styles.cameraBox}>
              <Ionicons name="qr-code-outline" size={80} color="#59DF89" />
              <Text style={styles.cameraInstruction}>Point camera at passenger's Watan App boarding QR</Text>
            </View>

            <TextInput
              style={styles.scanManualInput}
              placeholder="Or enter Booking Code (e.g. WTN-8912)..."
              placeholderTextColor="#869487"
              value={scanInput}
              onChangeText={setScanInput}
            />

            <Button
              title="Validate & Mark Boarded"
              onPress={handleValidateBoardingQr}
              variant="primary"
            />
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#0D1513' },
  navBar: {
    height: 60,
    paddingHorizontal: 16,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#151D1B',
    borderBottomWidth: 1,
    borderBottomColor: '#232C29',
  },
  brandRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  brandIconBox: { width: 34, height: 34, borderRadius: 8, backgroundColor: '#00391A', alignItems: 'center', justifyContent: 'center' },
  brandTitle: { fontSize: 13, fontWeight: '800', color: '#DCE4E1', letterSpacing: 0.5 },
  onlineDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: '#59DF89' },
  brandSubtitle: { fontSize: 11, color: '#59DF89', fontWeight: '600' },
  dutyBadge: { backgroundColor: '#005228', paddingHorizontal: 8, paddingVertical: 4, borderRadius: 12 },
  dutyBadgeText: { fontSize: 10, color: '#59DF89', fontWeight: '700' },
  profileBtn: { width: 34, height: 34, borderRadius: 17, backgroundColor: '#19211F', alignItems: 'center', justifyContent: 'center' },
  driverCard: { margin: 16, backgroundColor: '#151D1B', borderRadius: 14, padding: 14, borderWidth: 1, borderColor: '#232C29', gap: 14 },
  avatarBox: { width: 44, height: 44, borderRadius: 22, backgroundColor: '#59DF89', alignItems: 'center', justifyContent: 'center' },
  verifiedCheck: { position: 'absolute', bottom: -2, right: -2, width: 16, height: 16, borderRadius: 8, backgroundColor: '#006D38', alignItems: 'center', justifyContent: 'center' },
  driverName: { fontSize: 15, fontWeight: '700', color: '#DCE4E1' },
  driverNameEn: { fontSize: 12, color: '#BCCABC', fontWeight: '600' },
  ratingChip: { flexDirection: 'row', alignItems: 'center', gap: 3, backgroundColor: '#232C29', paddingHorizontal: 6, paddingVertical: 2, borderRadius: 8 },
  ratingText: { fontSize: 11, color: '#FFB95F', fontWeight: '700' },
  vehicleText: { fontSize: 11, color: '#869487' },
  modeSwitchRow: { flexDirection: 'row', backgroundColor: '#0D1513', padding: 4, borderRadius: 10, gap: 6 },
  modeTab: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, paddingVertical: 8, borderRadius: 8 },
  modeTabActive: { backgroundColor: '#59DF89' },
  modeTabText: { fontSize: 12, fontWeight: '700', color: '#BCCABC' },
  modeTabTextActive: { color: '#00391A' },
  pariCard: { backgroundColor: '#151D1B', borderRadius: 14, padding: 16, borderWidth: 1, borderColor: '#232C29', gap: 14 },
  bayBadge: { flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: '#59DF89', paddingHorizontal: 8, paddingVertical: 4, borderRadius: 6 },
  bayBadgeText: { fontSize: 11, fontWeight: '800', color: '#00391A' },
  munshiSyncBadge: { flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: '#19211F', paddingHorizontal: 8, paddingVertical: 4, borderRadius: 6 },
  munshiSyncText: { fontSize: 10, color: '#59DF89', fontWeight: '600' },
  pariTurnCenter: { flexDirection: 'row', alignItems: 'center' },
  pariCircle: { width: 72, height: 72, borderRadius: 36, backgroundColor: '#006D38', alignItems: 'center', justifyContent: 'center', borderWidth: 2, borderColor: '#59DF89' },
  pariTurnNumber: { fontSize: 24, fontWeight: '900', color: '#FFFFFF' },
  pariTurnLabel: { fontSize: 10, color: '#59DF89', fontWeight: 'bold', marginTop: -2 },
  standTitle: { fontSize: 14, fontWeight: '700', color: '#DCE4E1' },
  routeTitle: { fontSize: 12, color: '#FFB95F', fontWeight: '600', marginTop: 2 },
  departureCountdown: { fontSize: 11, color: '#869487', marginTop: 4 },
  capacityProgressSection: { paddingTop: 6, borderTopWidth: 1, borderTopColor: '#232C29' },
  capacityLabel: { fontSize: 12, fontWeight: '700', color: '#59DF89' },
  capacityPercent: { fontSize: 12, fontWeight: '700', color: '#DCE4E1' },
  progressTrack: { width: '100%', height: 8, backgroundColor: '#0D1513', borderRadius: 4, overflow: 'hidden' },
  progressFill: { height: '100%', backgroundColor: '#59DF89' },
  manifestCard: { backgroundColor: '#151D1B', borderRadius: 14, padding: 14, borderWidth: 1, borderColor: '#232C29' },
  manifestTitle: { fontSize: 13, fontWeight: '700', color: '#DCE4E1' },
  manifestSub: { fontSize: 11, color: '#869487' },
  scanQrBtn: { flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: '#59DF89', paddingHorizontal: 10, paddingVertical: 6, borderRadius: 6 },
  scanQrBtnText: { fontSize: 11, fontWeight: '800', color: '#00391A' },
  manifestItem: { flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: '#19211F', padding: 10, borderRadius: 8 },
  paxAvatar: { width: 32, height: 32, borderRadius: 16, backgroundColor: '#0D1513', alignItems: 'center', justifyContent: 'center' },
  paxName: { fontSize: 12, fontWeight: '700', color: '#DCE4E1' },
  paxMeta: { fontSize: 11, color: '#869487' },
  verifiedTag: { backgroundColor: '#005228', paddingHorizontal: 6, paddingVertical: 2, borderRadius: 4 },
  verifiedTagText: { fontSize: 9, color: '#59DF89', fontWeight: '700' },
  commissionBanner: { flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: '#151D1B', padding: 12, borderRadius: 10, borderWidth: 1, borderColor: '#59DF89' },
  commissionTitle: { fontSize: 12, fontWeight: '800', color: '#59DF89' },
  commissionSub: { fontSize: 11, color: '#BCCABC', marginTop: 1 },
  departBtn: { backgroundColor: '#59DF89', paddingVertical: 14, borderRadius: 12, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8 },
  departBtnText: { fontSize: 14, fontWeight: '800', color: '#00391A' },
  // Roaming styles
  roamingHeroCard: { backgroundColor: '#151D1B', borderRadius: 14, padding: 16, borderWidth: 1, borderColor: '#232C29' },
  roamingStatusTitle: { fontSize: 14, fontWeight: '700', color: '#59DF89' },
  roamingStatusSub: { fontSize: 12, color: '#869487', marginTop: 4 },
  incomingCard: { backgroundColor: '#151D1B', borderRadius: 14, padding: 16, borderWidth: 2, borderColor: '#FFB95F' },
  incomingBadge: { fontSize: 11, fontWeight: '800', color: '#FFB95F' },
  incomingFare: { fontSize: 18, fontWeight: '900', color: '#59DF89' },
  incomingRoute: { fontSize: 12, color: '#DCE4E1', marginTop: 4 },
  declineBtn: { flex: 1, backgroundColor: '#232C29', paddingVertical: 10, borderRadius: 8, alignItems: 'center' },
  declineBtnText: { color: '#FFB4AB', fontSize: 12, fontWeight: '700' },
  acceptBtn: { flex: 2, backgroundColor: '#59DF89', paddingVertical: 10, borderRadius: 8, alignItems: 'center' },
  acceptBtnText: { color: '#00391A', fontSize: 12, fontWeight: '800' },
  walletBox: { backgroundColor: '#151D1B', borderRadius: 14, padding: 16, borderWidth: 1, borderColor: '#232C29' },
  walletLabel: { fontSize: 10, fontWeight: '700', color: '#869487' },
  walletValue: { fontSize: 18, fontWeight: '900', color: '#59DF89', marginTop: 2 },
  modalBackdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.85)', justifyContent: 'center', padding: 20 },
  scanModalBox: { backgroundColor: '#151D1B', borderRadius: 16, padding: 18, borderWidth: 1, borderColor: '#232C29', gap: 14 },
  scanModalTitle: { fontSize: 14, fontWeight: '700', color: '#DCE4E1' },
  cameraBox: { height: 180, backgroundColor: '#0D1513', borderRadius: 12, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: '#3D4A3F', gap: 10 },
  cameraInstruction: { fontSize: 11, color: '#869487', textAlign: 'center', paddingHorizontal: 20 },
  scanManualInput: { backgroundColor: '#0D1513', borderRadius: 8, paddingHorizontal: 12, paddingVertical: 10, color: '#DCE4E1', fontSize: 13, borderWidth: 1, borderColor: '#3D4A3F', fontCapitalization: 'characters' },
});
