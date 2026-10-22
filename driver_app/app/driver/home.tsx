import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, Switch, Alert, ScrollView, Modal, ActivityIndicator,
  TextInput, Platform, Image,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import * as Location from 'expo-location';
import MapView from '../../src/components/MapView';
import Button from '../../src/components/Button';
import { getTheme } from '../../src/lib/theme';
import { useAuth } from '../../src/lib/auth';
import { api, getToken, getWsBaseUrl } from '../../src/lib/api';

const DEFAULT_POS = { lat: 33.6007, lng: 73.0679 }; // Rawalpindi / Islamabad Saddar

export default function DriverHome() {
  const router = useRouter();
  const theme = getTheme('driver');
  const { user } = useAuth();

  // Driver Online State
  const [isOnline, setIsOnline] = useState<boolean>(true);

  // Core Architecture: Is driver enrolled with an Adda?
  // Normal drivers start as Independent (isAddaRegistered: false).
  // Once an Adda Munshi enrolls them, isAddaRegistered becomes true, unlocking Dual-Mode switcher!
  const [isAddaRegistered, setIsAddaRegistered] = useState<boolean>(false);
  const [activeMode, setActiveMode] = useState<'roaming' | 'adda'>('roaming');

  // GPS Position
  const [pos, setPos] = useState(DEFAULT_POS);
  const [bearing, setBearing] = useState(0);

  // Adda Pari Stand State (When enrolled in Adda)
  const [pariTurn, setPariTurn] = useState<number>(2);
  const [bayNumber, setBayNumber] = useState<number>(3);
  const [filledSeats, setFilledSeats] = useState<number>(11);
  const totalSeats = 14;
  const [countdownMinutes, setCountdownMinutes] = useState<number>(8);
  const [countdownSeconds, setCountdownSeconds] = useState<number>(45);

  // Adda Passenger Manifest
  const [manifest, setManifest] = useState([
    { id: '1', name: 'Muhammad Usman', phone: '0300-1234567', seats: [3, 4], status: 'QR Verified (نقد کاؤنٹر)' },
    { id: '2', name: 'Zainab Bibi (Ladies Zone)', phone: '0321-7654321', seats: [6], status: 'Paid Online (JazzCash)' },
    { id: '3', name: 'Walk-in Passenger', phone: 'Cash Passenger', seats: [8], status: 'Counter Ticket #402' },
  ]);

  // QR Boarding Verification Modal
  const [scanModalVisible, setScanModalVisible] = useState(false);
  const [scanInput, setScanInput] = useState('');

  // Top-Up Floating Wallet Modal
  const [topupModalVisible, setTopupModalVisible] = useState(false);

  // Independent Roaming State
  const [incoming, setIncoming] = useState<any>(null);
  const [countdown, setCountdown] = useState(15);
  const [activeTrip, setActiveTrip] = useState<any>(null);
  const [tripStep, setTripStep] = useState<'pickup' | 'dropoff'>('pickup');
  const [earnings, setEarnings] = useState<any>({
    today: 2850,
    total: 18450,
    week: 16200,
    today_trips: 6,
    available_balance: 2450,
  });

  // Countdown timer for Adda departure
  useEffect(() => {
    if (!isAddaRegistered || activeMode !== 'adda') return;
    const timer = setInterval(() => {
      setCountdownSeconds((sec) => {
        if (sec > 0) return sec - 1;
        setCountdownMinutes((min) => (min > 0 ? min - 1 : 0));
        return 59;
      });
    }, 1000);
    return () => clearInterval(timer);
  }, [isAddaRegistered, activeMode]);

  // Connect to real-time Driver Dispatch WebSocket & Listen for Dispatches
  useEffect(() => {
    if (!user?.id || !isOnline) return;
    let ws: WebSocket | null = null;
    let isCancelled = false;

    const connectWs = async () => {
      try {
        const token = await getToken();
        if (!token) return;
        const wsBase = await getWsBaseUrl();
        ws = new WebSocket(`${wsBase}/ws/driver/${user.id}?token=${encodeURIComponent(token)}`);

        ws.onopen = () => {
          api('/driver/status', {
            method: 'POST',
            body: { online: true, lat: pos.lat, lng: pos.lng, bearing, active_mode: activeMode },
          }).catch(() => {});
        };

        ws.onmessage = (event) => {
          if (isCancelled) return;
          try {
            const data = JSON.parse(event.data);
            if (data.event === 'driver.incoming' && data.ride) {
              const r = data.ride;
              setIncoming({
                id: r.id,
                passenger_name: r.passenger_name || 'Passenger',
                passenger_rating: r.passenger_rating || 4.9,
                pickup_address: r.pickup?.address || 'Pickup Point',
                dropoff_address: r.destination?.address || 'Destination',
                distance_km: r.distance_km || 5.0,
                est_minutes: r.duration_min || 15,
                gross_fare: r.fare || 380,
                platform_fee: r.platform_fee || Math.round((r.fare || 380) * 0.10),
                driver_net: r.driver_earnings || Math.round((r.fare || 380) * 0.90),
                vehicle_type: r.ride_type || 'car_mini',
              });
              setCountdown(15);
            } else if (data.event === 'ride.cancelled') {
              if (activeTrip?.id === data.ride_id) {
                setActiveTrip(null);
                Alert.alert('Ride Cancelled (سواری منسوخ)', 'Passenger cancelled this ride request.');
              }
            }
          } catch {}
        };
      } catch (err) {
        console.warn('Driver WS error:', err);
      }
    };

    connectWs();
    return () => {
      isCancelled = true;
      ws?.close();
    };
  }, [user?.id, isOnline, activeMode]);

  // Load driver earnings from backend on mount
  useEffect(() => {
    (async () => {
      try {
        const data = await api('/driver/earnings');
        if (data) {
          setEarnings({
            today: data.today_net || 0,
            total: data.total_net || 0,
            week: data.week_net || 0,
            today_trips: data.today_count || 0,
            available_balance: data.today_net || 0,
          });
        }
      } catch {}
    })();
  }, []);

  // Real or Simulated GPS Position
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
              const newPos = { lat: newLoc.coords.latitude, lng: newLoc.coords.longitude };
              setPos(newPos);
              if (newLoc.coords.heading) setBearing(newLoc.coords.heading);
              if (isOnline) {
                api('/driver/location', {
                  method: 'POST',
                  body: { lat: newPos.lat, lng: newPos.lng, bearing: newLoc.coords.heading || 0 },
                }).catch(() => {});
              }
            }
          );
        }
      } catch (err) {
        // Fallback to Rawalpindi Saddar coordinates
      }
    })();
    return () => { sub?.remove(); };
  }, [isOnline]);

  // Accept incoming independent ride
  const handleAcceptRide = async () => {
    if (!incoming) return;
    const rideToAccept = incoming;
    try {
      await api(`/rides/${rideToAccept.id}/accept`, { method: 'POST' });
    } catch (e: any) {
      console.warn('Backend accept note:', e);
    }
    setActiveTrip(rideToAccept);
    setTripStep('pickup');
    setIncoming(null);
    Alert.alert(
      'Ride Accepted (سواری قبول کر لی گئی)',
      `Navigate to ${rideToAccept.pickup_address}. Pickup passenger: ${rideToAccept.passenger_name}`
    );
  };

  // Decline incoming ride
  const handleDeclineRide = () => {
    setIncoming(null);
  };

  // Advance Trip Lifecycle
  const handleArriveAtPickup = async () => {
    if (activeTrip?.id) {
      try {
        await api(`/rides/${activeTrip.id}/arrived`, { method: 'POST' });
      } catch (e: any) {
        console.warn('Backend arrived note:', e);
      }
    }
    setTripStep('dropoff');
    Alert.alert(
      'Arrived at Pickup (پک اپ پہنچ گئے)',
      'Passenger boarded. Begin navigation to destination: ' + activeTrip.dropoff_address
    );
  };

  const handleCompleteTrip = async () => {
    const earned = activeTrip.driver_net || 342;
    if (activeTrip?.id) {
      try {
        await api(`/rides/${activeTrip.id}/complete`, { method: 'POST' });
      } catch (e: any) {
        console.warn('Backend complete note:', e);
      }
    }
    try {
      const data = await api('/driver/earnings');
      if (data) {
        setEarnings((prev: any) => ({
          ...prev,
          today: data.today_net || (prev.today + earned),
          today_trips: data.today_count || (prev.today_trips + 1),
          total: data.total_net || (prev.total + earned),
        }));
      }
    } catch {
      setEarnings((prev: any) => ({
        ...prev,
        today: prev.today + earned,
        today_trips: prev.today_trips + 1,
        available_balance: prev.available_balance + earned,
      }));
    }
    const fareMsg = `Rs. ${activeTrip.gross_fare || 380} cash collected. Your net profit: Rs. ${earned} (10% Watan fee Rs. ${activeTrip.platform_fee || 38} deducted from float).`;
    setActiveTrip(null);
    Alert.alert('Trip Completed! (سفر مکمل ہو گیا)', fareMsg);
  };

  // Adda Mode Switcher (Unlocked only when enrolled with Adda)
  const handleModeSwitch = (mode: 'adda' | 'roaming') => {
    setActiveMode(mode);
    if (mode === 'adda') {
      Alert.alert(
        '🏢 Adda Pari Mode Active',
        'You are now in Pirwadhai Stand rotation queue (Bay #3, Turn #2). Doorstep hails are paused. You keep 100% of all stand passenger fares (0% platform commission)!'
      );
    } else {
      Alert.alert(
        '🚗 Independent Roaming Active',
        'Stand queue paused. You are now roaming freely like an Uber/InDrive driver picking up doorstep hails in the city (10% Watan fee).'
      );
    }
  };

  // Stand Gate Exit
  const handleDepartStand = () => {
    Alert.alert(
      'Depart Stand (روانگی اڈہ)',
      'Confirm vehicle departure? Stand gate exit parchi will be registered.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Confirm Departure',
          onPress: () => {
            Alert.alert('Safe Journey! (سفر بخیر)', '14 Passengers on board. Trip started on Rawalpindi - Peshawar Highway.');
          },
        },
      ]
    );
  };

  // Validate passenger boarding QR
  const handleValidateBoardingQr = () => {
    if (!scanInput.trim()) return;
    const nextSeat = Math.min(totalSeats, filledSeats + 1);
    const newPassenger = {
      id: String(Date.now()),
      name: 'Verified Commuter',
      phone: scanInput.toUpperCase(),
      seats: [nextSeat],
      status: 'Boarded ✓',
    };
    setManifest([...manifest, newPassenger]);
    setFilledSeats(nextSeat);
    setScanModalVisible(false);
    setScanInput('');
    Alert.alert('Boarding Confirmed ✓', `Ticket ${newPassenger.phone} verified for Seat #${nextSeat}. Cleared to board.`);
  };

  // Simulate Adda Enrollment by Munshi (Allows testing both states!)
  const handleToggleAddaEnrollment = () => {
    if (!isAddaRegistered) {
      setIsAddaRegistered(true);
      setActiveMode('adda');
      Alert.alert(
        '🎉 Enrolled by Adda Munshi!',
        'Pirwadhai Intercity Terminal (پیرودھائی اڈہ) has registered your vehicle into their digital fleet. You now have the option to switch between Adda Pari Mode (0% commission) and Independent Roaming!'
      );
    } else {
      setIsAddaRegistered(false);
      setActiveMode('roaming');
      Alert.alert(
        'Switched to Pure Independent',
        'You are now a standalone independent driver (like Uber/InDrive). You can register with an Adda anytime.'
      );
    }
  };

  return (
    <SafeAreaView style={styles.root} edges={['top', 'bottom']}>
      {/* Top Modern Header */}
      <View style={styles.navBar}>
        <View style={styles.brandRow}>
          <View style={[styles.brandIconBox, { backgroundColor: isAddaRegistered && activeMode === 'adda' ? '#006D38' : '#00391A' }]}>
            <Ionicons name={isAddaRegistered && activeMode === 'adda' ? 'bus' : 'car-sport'} size={20} color="#59DF89" />
          </View>
          <View>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
              <Text style={styles.brandTitle}>
                {isAddaRegistered
                  ? (activeMode === 'adda' ? 'WATAN ADDA PARI' : 'WATAN HYBRID DRIVER')
                  : 'WATAN INDEPENDENT'}
              </Text>
              <View style={[styles.onlineDot, { backgroundColor: isOnline ? '#59DF89' : '#EF4444' }]} />
            </View>
            <Text style={styles.brandSubtitle}>
              {isAddaRegistered
                ? (activeMode === 'adda' ? 'Pirwadhai Stand • Turn #2' : 'Roaming Independently (10% Fee)')
                : (isOnline ? 'Online • Uber/InDrive Style' : 'Offline • آف لائن')}
            </Text>
          </View>
        </View>

        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
          {/* Hyper-Modern Online/Offline Duty Switch */}
          <TouchableOpacity
            style={[styles.dutyPill, { backgroundColor: isOnline ? '#005228' : '#2C3532', borderColor: isOnline ? '#59DF89' : '#5A6763' }]}
            onPress={() => setIsOnline(!isOnline)}
            activeOpacity={0.8}
          >
            <View style={[styles.dutyIndicator, { backgroundColor: isOnline ? '#59DF89' : '#94A3B8' }]} />
            <Text style={[styles.dutyText, { color: isOnline ? '#59DF89' : '#DCE4E1' }]}>
              {isOnline ? 'ONLINE' : 'OFFLINE'}
            </Text>
          </TouchableOpacity>

          <TouchableOpacity style={styles.profileBtn} onPress={() => router.push('/driver/profile')}>
            <Ionicons name="person" size={16} color="#DCE4E1" />
          </TouchableOpacity>
        </View>
      </View>

      <ScrollView style={{ flex: 1 }} contentContainerStyle={{ paddingBottom: 40 }} showsVerticalScrollIndicator={false}>
        {/* Driver Profile Summary Card */}
        <View style={styles.driverCard}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
            <View style={styles.avatarBox}>
              <Ionicons name="person" size={24} color="#0D1513" />
              <View style={styles.verifiedCheck}>
                <Ionicons name="checkmark" size={10} color="#FFFFFF" />
              </View>
            </View>
            <View style={{ flex: 1 }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                  <Text style={styles.driverName}>طارق محمود</Text>
                  <Text style={styles.driverNameEn}>Tariq M.</Text>
                </View>
                <View style={styles.ratingChip}>
                  <Ionicons name="star" size={12} color="#FFB95F" />
                  <Text style={styles.ratingText}>4.9</Text>
                </View>
              </View>
              <Text style={styles.vehicleText}>
                {isAddaRegistered ? 'Toyota HiAce Grand Cabin • LES-19-4821' : 'Suzuki Alto 660cc • White • ICT-GA-392'}
              </Text>
              <Text style={{ color: '#59DF89', fontSize: 11, fontWeight: '700', marginTop: 2 }}>
                {isAddaRegistered ? '🏢 Enrolled in Pirwadhai Terminal' : '🚗 Independent Operator (Uber/InDrive)'}
              </Text>
            </View>
          </View>

          {/* DUAL MODE SWITCHER: ONLY VISIBLE IF ENROLLED WITH ADDA */}
          {isAddaRegistered ? (
            <View style={styles.modeSwitchWrapper}>
              <Text style={styles.modeSwitchLabel}>MODE CONTROLLER (طریقہ کار تبدیل کریں):</Text>
              <View style={styles.modeSwitchRow}>
                <TouchableOpacity
                  style={[styles.modeTab, activeMode === 'adda' && styles.modeTabActiveAdda]}
                  onPress={() => handleModeSwitch('adda')}
                  activeOpacity={0.8}
                >
                  <Ionicons name="bus" size={16} color={activeMode === 'adda' ? '#00391A' : '#BCCABC'} />
                  <View>
                    <Text style={[styles.modeTabText, activeMode === 'adda' && styles.modeTabTextActive]}>
                      Adda Pari (0% Fee)
                    </Text>
                    <Text style={[styles.modeTabSub, activeMode === 'adda' && { color: '#004D27' }]}>اڈہ پاری موڈ</Text>
                  </View>
                </TouchableOpacity>

                <TouchableOpacity
                  style={[styles.modeTab, activeMode === 'roaming' && styles.modeTabActiveRoaming]}
                  onPress={() => handleModeSwitch('roaming')}
                  activeOpacity={0.8}
                >
                  <Ionicons name="navigate" size={16} color={activeMode === 'roaming' ? '#00391A' : '#BCCABC'} />
                  <View>
                    <Text style={[styles.modeTabText, activeMode === 'roaming' && styles.modeTabTextActive]}>
                      Go Independent
                    </Text>
                    <Text style={[styles.modeTabSub, activeMode === 'roaming' && { color: '#004D27' }]}>روامنگ موڈ</Text>
                  </View>
                </TouchableOpacity>
              </View>
            </View>
          ) : (
            // Modern Stand Enrollment Prompt for Independent Drivers
            <View style={styles.independentStatusBox}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                <Ionicons name="sparkles" size={16} color="#59DF89" />
                <Text style={styles.independentStatusTitle}>Independent Driver Mode Active</Text>
              </View>
              <Text style={styles.independentStatusDesc}>
                You are currently free-floating. Pick up doorstep customer hails anywhere in the city. You pay standard 10% platform commission.
              </Text>
            </View>
          )}
        </View>

        {/* =========================================================================
            ACTIVE TRIP NAVIGATION (IF INDEPENDENT RIDE IN PROGRESS)
            ========================================================================= */}
        {activeTrip && (
          <View style={styles.activeTripCard}>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
              <View style={styles.tripBadge}>
                <Ionicons name="radio" size={12} color="#59DF89" />
                <Text style={styles.tripBadgeText}>TRIP IN PROGRESS</Text>
              </View>
              <Text style={styles.tripFareText}>Rs. {activeTrip.gross_fare}</Text>
            </View>

            <View style={{ marginTop: 12, gap: 8 }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                <Ionicons name="person-circle" size={20} color="#59DF89" />
                <Text style={{ color: '#DCE4E1', fontSize: 14, fontWeight: '700' }}>
                  {activeTrip.passenger_name}
                </Text>
              </View>
              <View style={styles.routeBox}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                  <Ionicons name="location" size={16} color="#59DF89" />
                  <Text style={{ color: '#DCE4E1', fontSize: 13, flex: 1 }} numberOfLines={1}>
                    Pickup: {activeTrip.pickup_address}
                  </Text>
                </View>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 4 }}>
                  <Ionicons name="flag" size={16} color="#EF4444" />
                  <Text style={{ color: '#DCE4E1', fontSize: 13, flex: 1 }} numberOfLines={1}>
                    Dropoff: {activeTrip.dropoff_address}
                  </Text>
                </View>
              </View>
            </View>

            <View style={{ marginTop: 14, flexDirection: 'row', gap: 10 }}>
              {tripStep === 'pickup' ? (
                <TouchableOpacity style={styles.actionBtnPrimary} onPress={handleArriveAtPickup}>
                  <Ionicons name="checkmark-circle" size={18} color="#00391A" />
                  <Text style={styles.actionBtnText}>Arrived at Pickup (پک اپ پہنچ گئے)</Text>
                </TouchableOpacity>
              ) : (
                <TouchableOpacity style={styles.actionBtnSuccess} onPress={handleCompleteTrip}>
                  <Ionicons name="cash" size={18} color="#00391A" />
                  <Text style={styles.actionBtnText}>Complete & Collect Rs. {activeTrip.gross_fare}</Text>
                </TouchableOpacity>
              )}
            </View>
          </View>
        )}

        {/* =========================================================================
            INCOMING RIDE REQUEST POPUP (SIMULATED FOR INDEPENDENT ROAMING)
            ========================================================================= */}
        {incoming && !activeTrip && (
          <View style={styles.incomingOverlay}>
            <View style={styles.incomingCard}>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                <View style={styles.incomingRadarBadge}>
                  <Ionicons name="radio" size={12} color="#00391A" />
                  <Text style={styles.incomingRadarText}>NEW RIDE REQUEST • {countdown}s</Text>
                </View>
                <Text style={styles.incomingFare}>Rs. {incoming.gross_fare}</Text>
              </View>

              <Text style={styles.passengerTitle}>{incoming.passenger_name} ★ {incoming.passenger_rating}</Text>
              <View style={styles.incomingRouteBox}>
                <Text style={styles.incomingPointText}>📍 Pickup: {incoming.pickup_address}</Text>
                <Text style={styles.incomingPointText}>🏁 Dropoff: {incoming.dropoff_address}</Text>
                <Text style={styles.incomingMetaText}>Distance: {incoming.distance_km} km • Est: {incoming.est_minutes} mins</Text>
              </View>

              <View style={styles.feeBreakdownBar}>
                <Text style={styles.feeBreakdownText}>
                  Your Take-Home: <Text style={{ color: '#59DF89', fontWeight: 'bold' }}>Rs. {incoming.driver_net}</Text> (10% Watan Fee: Rs. {incoming.platform_fee})
                </Text>
              </View>

              <View style={{ flexDirection: 'row', gap: 10, marginTop: 12 }}>
                <TouchableOpacity style={styles.declineBtn} onPress={handleDeclineRide}>
                  <Text style={styles.declineBtnText}>Decline (رد)</Text>
                </TouchableOpacity>
                <TouchableOpacity style={styles.acceptBtn} onPress={handleAcceptRide}>
                  <Ionicons name="checkmark-done" size={18} color="#00391A" />
                  <Text style={styles.acceptBtnText}>ACCEPT • Rs. {incoming.gross_fare}</Text>
                </TouchableOpacity>
              </View>
            </View>
          </View>
        )}

        {/* =========================================================================
            VIEW 1: ADDA PARI MODE COCKPIT (WHEN ENROLLED AND ADDA MODE ACTIVE)
            ========================================================================= */}
        {isAddaRegistered && activeMode === 'adda' ? (
          <View style={{ paddingHorizontal: 16, gap: 14 }}>
            {/* Stand Pari Status Card */}
            <View style={styles.pariCard}>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                <View style={styles.bayBadge}>
                  <Ionicons name="list" size={14} color="#00391A" />
                  <Text style={styles.bayBadgeText}>BAY #{bayNumber} • بے {bayNumber}</Text>
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
                  <Text style={styles.pariTurnLabel}>YOUR TURN</Text>
                </View>
                <View style={{ marginLeft: 16, flex: 1 }}>
                  <Text style={styles.standTitle}>Pirwadhai Intercity Terminal</Text>
                  <Text style={styles.routeTitle}>Route: Rawalpindi ➔ Murree Stand</Text>
                  <Text style={styles.departureCountdown}>
                    Departs in: <Text style={{ color: '#FFB95F', fontWeight: 'bold' }}>{String(countdownMinutes).padStart(2, '0')}:{String(countdownSeconds).padStart(2, '0')} mins</Text>
                  </Text>
                </View>
              </View>

              {/* Passenger Capacity Progress */}
              <View style={styles.capacityProgressSection}>
                <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 6 }}>
                  <Text style={styles.capacityLabel}>Cabin Manifest Loading</Text>
                  <Text style={styles.capacityPercent}>{filledSeats}/{totalSeats} Seats Reserved</Text>
                </View>
                <View style={styles.progressTrack}>
                  <View style={[styles.progressFill, { width: `${(filledSeats / totalSeats) * 100}%` }]} />
                </View>

                {/* 14-Seat Physical Mini Map Grid (Stitch Spec) */}
                <View style={styles.physicalSeatGrid}>
                  {Array.from({ length: totalSeats }, (_, i) => i + 1).map((seatNum) => {
                    const isFilled = seatNum <= filledSeats;
                    return (
                      <View
                        key={seatNum}
                        style={[
                          styles.miniSeatCell,
                          isFilled ? styles.miniSeatCellFilled : styles.miniSeatCellEmpty,
                        ]}
                      >
                        <Text style={[styles.miniSeatNum, isFilled ? styles.miniSeatNumFilled : styles.miniSeatNumEmpty]}>
                          {seatNum}
                        </Text>
                      </View>
                    );
                  })}
                </View>

                {/* Departure Condition Strip */}
                <View style={styles.departureConditionRow}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, flex: 1 }}>
                    <Ionicons name="time-outline" size={14} color="#F59E0B" />
                    <Text style={styles.departureConditionText}>
                      روانگی فل ہونے پر یا {String(countdownMinutes).padStart(2, '0')}:{String(countdownSeconds).padStart(2, '0')} منٹ
                    </Text>
                  </View>
                  <View style={styles.autoWalkInBadge}>
                    <Text style={styles.autoWalkInText}>Auto Walk-in: ON</Text>
                  </View>
                </View>
              </View>
            </View>

            {/* Zero Commission Banner */}
            <View style={styles.commissionBanner}>
              <Ionicons name="shield-checkmark" size={24} color="#10B981" />
              <View style={{ flex: 1 }}>
                <Text style={styles.commissionTitle}>0% Platform Fee Active (پاری اڈہ بچت)</Text>
                <Text style={styles.commissionSub}>
                  Your Adda pays the weekly SaaS platform subscription. You keep 100% of all passenger fares!
                </Text>
              </View>
            </View>

            {/* Live Passenger Manifest */}
            <View style={styles.manifestCard}>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
                <View>
                  <Text style={styles.manifestTitle}>Manifest Passengers (مسافروں کی فہرست)</Text>
                  <Text style={styles.manifestSub}>{filledSeats} Seats Allocated</Text>
                </View>
                <TouchableOpacity style={styles.scanQrBtn} onPress={() => setScanModalVisible(true)}>
                  <Ionicons name="qr-code" size={14} color="#FFFFFF" />
                  <Text style={styles.scanQrBtnText}>Verify QR</Text>
                </TouchableOpacity>
              </View>

              <View style={{ gap: 8 }}>
                {manifest.map((pax) => (
                  <View key={pax.id} style={styles.manifestItem}>
                    <View style={styles.paxAvatar}>
                      <Ionicons name="person" size={16} color="#10B981" />
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.paxName}>{pax.name}</Text>
                      <Text style={styles.paxMeta}>Seats: {pax.seats.join(', ')} • {pax.phone}</Text>
                    </View>
                    <View style={styles.verifiedTag}>
                      <Text style={styles.verifiedTagText}>{pax.status}</Text>
                    </View>
                  </View>
                ))}
              </View>
            </View>

            {/* Depart Stand Action */}
            <TouchableOpacity style={styles.departBtn} onPress={handleDepartStand}>
              <Ionicons name="arrow-forward-circle" size={22} color="#FFFFFF" />
              <Text style={styles.departBtnText}>Depart Bay & Gate Exit (روانگی اڈہ)</Text>
            </TouchableOpacity>
          </View>
        ) : (
          /* =========================================================================
             VIEW 2: INDEPENDENT ROAMING COCKPIT (FOR ALL INDEPENDENT DRIVERS)
             ========================================================================= */
          <View style={{ paddingHorizontal: 16, gap: 14 }}>
            {/* Live Interactive Map Box */}
            <View style={styles.mapCard}>
              <View style={styles.mapHeader}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                  <Ionicons name="navigate-circle" size={18} color="#59DF89" />
                  <Text style={styles.mapHeaderTitle}>Live Google Map Radar</Text>
                </View>
                <Text style={styles.mapHeaderSub}>Rawalpindi / Islamabad Corridor</Text>
              </View>
              <View style={{ height: 220, borderRadius: 12, overflow: 'hidden' }}>
                <MapView
                  center={pos}
                  markers={[
                    { lat: pos.lat, lng: pos.lng, kind: 'driver', label: 'You (Online)' },
                    { lat: pos.lat + 0.008, lng: pos.lng + 0.006, kind: 'pickup', label: 'Commercial Market' },
                  ]}
                  theme={theme}
                  height={220}
                />
              </View>
            </View>

            {/* Radar Searching Animation */}
            {isOnline && !activeTrip && !incoming && (
              <View style={styles.radarCard}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                  <ActivityIndicator size="small" color="#59DF89" />
                  <View style={{ flex: 1 }}>
                    <Text style={styles.radarTitle}>Scanning for Passenger Hails...</Text>
                    <Text style={styles.radarSub}>Doorstep requests nearby will pop up automatically</Text>
                  </View>
                </View>
                <TouchableOpacity
                  style={styles.simulateTestBtn}
                  onPress={() => {
                    setIncoming({
                      id: `ride-${Date.now()}`,
                      passenger_name: 'Usman Ghani (عثمان غنی)',
                      passenger_rating: 4.95,
                      pickup_address: 'Faizabad Terminal Junction',
                      dropoff_address: 'Centaurus Mall, Blue Area',
                      distance_km: 7.2,
                      est_minutes: 18,
                      gross_fare: 480,
                      platform_fee: 48,
                      driver_net: 432,
                      vehicle_type: 'Watan Mini / Rickshaw',
                    });
                    setCountdown(15);
                  }}
                >
                  <Ionicons name="flash" size={14} color="#00391A" />
                  <Text style={styles.simulateTestBtnText}>Simulate Instant Passenger Request</Text>
                </TouchableOpacity>
              </View>
            )}

            {/* Floating Prepaid Wallet Card */}
            <View style={styles.walletBox}>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                <View>
                  <Text style={styles.walletLabel}>PREPAID FLOAT WALLET</Text>
                  <Text style={styles.walletValue}>Rs. {earnings.available_balance}</Text>
                  <Text style={styles.walletSub}>10% Platform fee deducted on completed rides</Text>
                </View>
                <TouchableOpacity style={styles.topupBtn} onPress={() => setTopupModalVisible(true)}>
                  <Ionicons name="add-circle" size={18} color="#00391A" />
                  <Text style={styles.topupBtnText}>Top-Up Float</Text>
                </TouchableOpacity>
              </View>
            </View>

            {/* Adda Enrollment Bridge Card */}
            <View style={styles.addaEnrollCard}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                <Ionicons name="business" size={20} color="#FFB95F" />
                <Text style={styles.addaEnrollTitle}>
                  {isAddaRegistered ? 'Adda Fleet Affiliation Active' : 'Want 0% Platform Fee on Stand Trips?'}
                </Text>
              </View>
              <Text style={styles.addaEnrollDesc}>
                {isAddaRegistered
                  ? 'You are affiliated with Pirwadhai Stand. You can toggle between Stand Pari Mode (0% fee) and Independent Roaming at will.'
                  : 'Bus and Wagon stands (Addas) in Pakistan use Watan Stand POS. Once an Adda Munshi enrolls your vehicle, you can queue in their fixed-route Pari and pay 0% commission!'}
              </Text>
              <TouchableOpacity
                style={[styles.enrollActionBtn, { backgroundColor: isAddaRegistered ? '#232C29' : '#006D38' }]}
                onPress={handleToggleAddaEnrollment}
              >
                <Ionicons name={isAddaRegistered ? 'close-circle' : 'checkmark-circle'} size={18} color={isAddaRegistered ? '#EF4444' : '#59DF89'} />
                <Text style={[styles.enrollActionText, { color: isAddaRegistered ? '#FFB4AB' : '#FFFFFF' }]}>
                  {isAddaRegistered ? 'Deregister & Return to Pure Independent' : 'Simulate Adda Registration by Munshi'}
                </Text>
              </TouchableOpacity>
            </View>
          </View>
        )}
      </ScrollView>

      {/* =========================================================================
          QR BOARDING VERIFICATION MODAL
          ========================================================================= */}
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
              <Ionicons name="qr-code-outline" size={70} color="#59DF89" />
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
              theme={theme}
            />
          </View>
        </View>
      </Modal>

      {/* =========================================================================
          TOP-UP PREPAID FLOAT MODAL (RAAST / JAZZCASH / EASYPAISA)
          ========================================================================= */}
      <Modal visible={topupModalVisible} animationType="fade" transparent>
        <View style={styles.modalBackdrop}>
          <View style={styles.scanModalBox}>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
              <Text style={styles.scanModalTitle}>Top-Up Prepaid Float Wallet</Text>
              <TouchableOpacity onPress={() => setTopupModalVisible(false)}>
                <Ionicons name="close" size={22} color="#DCE4E1" />
              </TouchableOpacity>
            </View>

            <View style={{ alignItems: 'center', marginVertical: 10 }}>
              <View style={{ width: 100, height: 100, backgroundColor: '#FFFFFF', padding: 10, borderRadius: 12, alignItems: 'center', justifyContent: 'center' }}>
                <Ionicons name="qr-code" size={80} color="#000000" />
              </View>
              <Text style={{ color: '#59DF89', fontSize: 13, fontWeight: '700', marginTop: 8 }}>
                State Bank Raast P2M Dynamic QR
              </Text>
              <Text style={{ color: '#869487', fontSize: 11, textAlign: 'center', marginTop: 2 }}>
                Scan with JazzCash, Easypaisa, Nayapay, or any Pakistani Bank App
              </Text>
            </View>

            <View style={{ flexDirection: 'row', gap: 8 }}>
              {[500, 1000, 2000].map((amt) => (
                <TouchableOpacity
                  key={amt}
                  style={styles.quickAmtBtn}
                  onPress={() => {
                    setEarnings((prev: any) => ({
                      ...prev,
                      available_balance: prev.available_balance + amt,
                    }));
                    setTopupModalVisible(false);
                    Alert.alert('Top-Up Successful', `Rs. ${amt} credited to your prepaid float wallet.`);
                  }}
                >
                  <Text style={styles.quickAmtText}>+Rs. {amt}</Text>
                </TouchableOpacity>
              ))}
            </View>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#0D1513' },
  navBar: {
    height: 64,
    paddingHorizontal: 16,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#111827',
    borderBottomWidth: 1,
    borderBottomColor: '#1E293B',
  },
  brandRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  brandIconBox: { width: 38, height: 38, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  brandTitle: { fontSize: 13, fontWeight: '900', color: '#F8FAFC', letterSpacing: 0.5 },
  onlineDot: { width: 8, height: 8, borderRadius: 4 },
  brandSubtitle: { fontSize: 11, color: '#10B981', fontWeight: '600', marginTop: 1 },
  dutyPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 20,
    borderWidth: 1,
  },
  dutyIndicator: { width: 8, height: 8, borderRadius: 4 },
  dutyText: { fontSize: 11, fontWeight: '800', letterSpacing: 0.5 },
  profileBtn: { width: 36, height: 36, borderRadius: 18, backgroundColor: '#1F2937', alignItems: 'center', justifyContent: 'center' },
  driverCard: { margin: 16, backgroundColor: '#111827', borderRadius: 16, padding: 16, borderWidth: 1, borderColor: '#1E293B', gap: 14 },
  avatarBox: { width: 46, height: 46, borderRadius: 23, backgroundColor: '#10B981', alignItems: 'center', justifyContent: 'center' },
  verifiedCheck: { position: 'absolute', bottom: -2, right: -2, width: 16, height: 16, borderRadius: 8, backgroundColor: '#059669', alignItems: 'center', justifyContent: 'center' },
  driverName: { fontSize: 16, fontWeight: '800', color: '#F8FAFC' },
  driverNameEn: { fontSize: 13, color: '#94A3B8', fontWeight: '600' },
  ratingChip: { flexDirection: 'row', alignItems: 'center', gap: 3, backgroundColor: '#1E293B', paddingHorizontal: 8, paddingVertical: 2, borderRadius: 10 },
  ratingText: { fontSize: 12, color: '#F59E0B', fontWeight: '800' },
  vehicleText: { fontSize: 12, color: '#64748B', marginTop: 2 },
  modeSwitchWrapper: { backgroundColor: '#0B0F19', padding: 8, borderRadius: 12, gap: 6, borderWidth: 1, borderColor: '#1E293B' },
  modeSwitchLabel: { fontSize: 10, fontWeight: '800', color: '#64748B', letterSpacing: 0.5 },
  modeSwitchRow: { flexDirection: 'row', gap: 8 },
  modeTab: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, paddingVertical: 10, borderRadius: 10, backgroundColor: '#1F2937' },
  modeTabActiveAdda: { backgroundColor: '#10B981' },
  modeTabActiveRoaming: { backgroundColor: '#10B981' },
  modeTabText: { fontSize: 12, fontWeight: '800', color: '#94A3B8' },
  modeTabTextActive: { color: '#FFFFFF' },
  modeTabSub: { fontSize: 10, color: '#64748B' },
  independentStatusBox: { backgroundColor: '#0B0F19', padding: 12, borderRadius: 12, borderWidth: 1, borderColor: '#1E293B' },
  independentStatusTitle: { fontSize: 12, fontWeight: '800', color: '#10B981' },
  independentStatusDesc: { fontSize: 11, color: '#64748B', marginTop: 4, lineHeight: 16 },
  activeTripCard: { marginHorizontal: 16, marginBottom: 14, backgroundColor: '#111827', borderRadius: 16, padding: 16, borderWidth: 2, borderColor: '#10B981' },
  tripBadge: { flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: '#064E3B', paddingHorizontal: 8, paddingVertical: 4, borderRadius: 8 },
  tripBadgeText: { fontSize: 11, fontWeight: '800', color: '#10B981' },
  tripFareText: { fontSize: 20, fontWeight: '900', color: '#10B981' },
  routeBox: { backgroundColor: '#0B0F19', padding: 10, borderRadius: 10, marginTop: 4 },
  actionBtnPrimary: { flex: 1, backgroundColor: '#10B981', paddingVertical: 14, borderRadius: 12, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8 },
  actionBtnSuccess: { flex: 1, backgroundColor: '#10B981', paddingVertical: 14, borderRadius: 12, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8 },
  actionBtnText: { fontSize: 14, fontWeight: '900', color: '#FFFFFF' },
  incomingOverlay: { marginHorizontal: 16, marginBottom: 14 },
  incomingCard: { backgroundColor: '#111827', borderRadius: 16, padding: 16, borderWidth: 2, borderColor: '#F59E0B', gap: 8 },
  incomingRadarBadge: { flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: '#F59E0B', paddingHorizontal: 8, paddingVertical: 4, borderRadius: 6 },
  incomingRadarText: { fontSize: 11, fontWeight: '900', color: '#FFFFFF' },
  incomingFare: { fontSize: 22, fontWeight: '900', color: '#10B981' },
  passengerTitle: { fontSize: 15, fontWeight: '800', color: '#F8FAFC' },
  incomingRouteBox: { backgroundColor: '#0B0F19', padding: 10, borderRadius: 10, gap: 4 },
  incomingPointText: { color: '#F8FAFC', fontSize: 12, fontWeight: '600' },
  incomingMetaText: { color: '#F59E0B', fontSize: 11, fontWeight: '700', marginTop: 2 },
  feeBreakdownBar: { backgroundColor: '#1F2937', padding: 8, borderRadius: 8 },
  feeBreakdownText: { color: '#94A3B8', fontSize: 11 },
  declineBtn: { flex: 1, backgroundColor: '#1E293B', paddingVertical: 12, borderRadius: 10, alignItems: 'center' },
  declineBtnText: { color: '#EF4444', fontSize: 13, fontWeight: '800' },
  acceptBtn: { flex: 2, backgroundColor: '#10B981', paddingVertical: 12, borderRadius: 10, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6 },
  acceptBtnText: { color: '#FFFFFF', fontSize: 13, fontWeight: '900' },
  pariCard: { backgroundColor: '#111827', borderRadius: 16, padding: 16, borderWidth: 1, borderColor: '#1E293B', gap: 14 },
  bayBadge: { flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: '#10B981', paddingHorizontal: 8, paddingVertical: 4, borderRadius: 6 },
  bayBadgeText: { fontSize: 11, fontWeight: '800', color: '#FFFFFF' },
  munshiSyncBadge: { flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: '#1F2937', paddingHorizontal: 8, paddingVertical: 4, borderRadius: 6 },
  munshiSyncText: { fontSize: 10, color: '#10B981', fontWeight: '600' },
  pariTurnCenter: { flexDirection: 'row', alignItems: 'center' },
  pariCircle: { width: 72, height: 72, borderRadius: 36, backgroundColor: '#064E3B', alignItems: 'center', justifyContent: 'center', borderWidth: 2, borderColor: '#10B981' },
  pariTurnNumber: { fontSize: 24, fontWeight: '900', color: '#FFFFFF' },
  pariTurnLabel: { fontSize: 10, color: '#10B981', fontWeight: 'bold', marginTop: -2 },
  standTitle: { fontSize: 14, fontWeight: '800', color: '#F8FAFC' },
  routeTitle: { fontSize: 12, color: '#F59E0B', fontWeight: '600', marginTop: 2 },
  departureCountdown: { fontSize: 12, color: '#64748B', marginTop: 4 },
  capacityProgressSection: { paddingTop: 6, borderTopWidth: 1, borderTopColor: '#1E293B' },
  capacityLabel: { fontSize: 12, fontWeight: '700', color: '#10B981' },
  capacityPercent: { fontSize: 12, fontWeight: '700', color: '#F8FAFC' },
  progressTrack: { width: '100%', height: 8, backgroundColor: '#0B0F19', borderRadius: 4, overflow: 'hidden', marginTop: 4 },
  progressFill: { height: '100%', backgroundColor: '#10B981' },
  commissionBanner: { flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: 'rgba(16, 185, 129, 0.1)', padding: 12, borderRadius: 12, borderWidth: 1, borderColor: '#10B981' },
  commissionTitle: { fontSize: 12, fontWeight: '800', color: '#10B981' },
  commissionSub: { fontSize: 11, color: '#94A3B8', marginTop: 2, lineHeight: 16 },
  manifestCard: { backgroundColor: '#111827', borderRadius: 16, padding: 16, borderWidth: 1, borderColor: '#1E293B' },
  manifestTitle: { fontSize: 13, fontWeight: '800', color: '#F8FAFC' },
  manifestSub: { fontSize: 11, color: '#64748B', marginTop: 2 },
  scanQrBtn: { flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: '#10B981', paddingHorizontal: 12, paddingVertical: 6, borderRadius: 8 },
  scanQrBtnText: { fontSize: 11, fontWeight: '800', color: '#FFFFFF' },
  manifestItem: { flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: '#1F2937', padding: 10, borderRadius: 10 },
  paxAvatar: { width: 34, height: 34, borderRadius: 17, backgroundColor: '#0B0F19', alignItems: 'center', justifyContent: 'center' },
  paxName: { fontSize: 12, fontWeight: '800', color: '#F8FAFC' },
  paxMeta: { fontSize: 11, color: '#64748B' },
  verifiedTag: { backgroundColor: '#064E3B', paddingHorizontal: 6, paddingVertical: 3, borderRadius: 4 },
  verifiedTagText: { fontSize: 9, color: '#10B981', fontWeight: '800' },
  departBtn: { backgroundColor: '#10B981', paddingVertical: 14, borderRadius: 14, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8 },
  departBtnText: { fontSize: 14, fontWeight: '900', color: '#FFFFFF' },
  mapCard: { backgroundColor: '#111827', borderRadius: 16, padding: 12, borderWidth: 1, borderColor: '#1E293B' },
  mapHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10, paddingHorizontal: 4 },
  mapHeaderTitle: { fontSize: 13, fontWeight: '800', color: '#F8FAFC' },
  mapHeaderSub: { fontSize: 11, color: '#64748B' },
  radarCard: { backgroundColor: '#111827', borderRadius: 14, padding: 14, borderWidth: 1, borderColor: 'rgba(16, 185, 129, 0.25)', gap: 10 },
  radarTitle: { fontSize: 13, fontWeight: '800', color: '#10B981' },
  radarSub: { fontSize: 11, color: '#64748B', marginTop: 1 },
  simulateTestBtn: { backgroundColor: '#10B981', paddingVertical: 8, borderRadius: 8, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6 },
  simulateTestBtnText: { fontSize: 11, fontWeight: '800', color: '#FFFFFF' },
  walletBox: { backgroundColor: '#111827', borderRadius: 16, padding: 16, borderWidth: 1, borderColor: '#1E293B' },
  walletLabel: { fontSize: 10, fontWeight: '800', color: '#64748B', letterSpacing: 0.5 },
  walletValue: { fontSize: 20, fontWeight: '900', color: '#10B981', marginTop: 2 },
  walletSub: { fontSize: 11, color: '#64748B', marginTop: 2 },
  topupBtn: { backgroundColor: '#10B981', paddingHorizontal: 12, paddingVertical: 8, borderRadius: 10, flexDirection: 'row', alignItems: 'center', gap: 6 },
  topupBtnText: { fontSize: 12, fontWeight: '800', color: '#FFFFFF' },
  addaEnrollCard: { backgroundColor: '#111827', borderRadius: 16, padding: 16, borderWidth: 1, borderColor: 'rgba(245, 158, 11, 0.3)', gap: 8 },
  addaEnrollTitle: { fontSize: 13, fontWeight: '800', color: '#F59E0B' },
  addaEnrollDesc: { fontSize: 11, color: '#64748B', lineHeight: 16 },
  enrollActionBtn: { paddingVertical: 12, borderRadius: 10, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, marginTop: 4 },
  enrollActionText: { fontSize: 12, fontWeight: '800' },
  modalBackdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.85)', justifyContent: 'center', padding: 20 },
  scanModalBox: { backgroundColor: '#111827', borderRadius: 18, padding: 20, borderWidth: 1, borderColor: '#1E293B', gap: 14 },
  scanModalTitle: { fontSize: 15, fontWeight: '800', color: '#F8FAFC' },
  cameraBox: { height: 160, backgroundColor: '#0B0F19', borderRadius: 14, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: '#334155', gap: 8 },
  cameraInstruction: { fontSize: 11, color: '#64748B', textAlign: 'center', paddingHorizontal: 20 },
  scanManualInput: { backgroundColor: '#0B0F19', borderRadius: 10, paddingHorizontal: 14, paddingVertical: 12, color: '#F8FAFC', fontSize: 13, borderWidth: 1, borderColor: '#334155' },
  quickAmtBtn: { flex: 1, backgroundColor: '#064E3B', paddingVertical: 10, borderRadius: 8, alignItems: 'center' },
  quickAmtText: { color: '#FFFFFF', fontWeight: '800', fontSize: 12 },
  physicalSeatGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
    marginTop: 10,
    marginBottom: 6,
    justifyContent: 'space-between',
  },
  miniSeatCell: {
    width: '12%',
    height: 26,
    borderRadius: 6,
    alignItems: 'center',
    justifyContent: 'center',
  },
  miniSeatCellFilled: {
    backgroundColor: '#059669',
    borderWidth: 1,
    borderColor: '#10B981',
  },
  miniSeatCellEmpty: {
    backgroundColor: '#1E293B',
    borderWidth: 1,
    borderColor: '#334155',
    borderStyle: 'dashed',
  },
  miniSeatNum: { fontSize: 10, fontWeight: '700' },
  miniSeatNumFilled: { color: '#FFFFFF' },
  miniSeatNumEmpty: { color: '#64748B' },
  departureConditionRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 8,
    paddingTop: 8,
    borderTopWidth: 1,
    borderTopColor: '#1E293B',
  },
  departureConditionText: { fontSize: 11, color: '#94A3B8', fontWeight: '600' },
  autoWalkInBadge: {
    backgroundColor: '#1F2937',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: '#334155',
  },
  autoWalkInText: { fontSize: 10, color: '#10B981', fontWeight: '800' },
});
