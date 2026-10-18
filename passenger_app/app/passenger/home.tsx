import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  View, Text, StyleSheet, TextInput, TouchableOpacity, ScrollView, ActivityIndicator,
  Modal, useWindowDimensions, Platform, KeyboardAvoidingView
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import * as Location from 'expo-location';
import MapView from '../../src/components/MapView';
import Button from '../../src/components/Button';
import { getTheme } from '../../src/lib/theme';
import { useAuth } from '../../src/lib/auth';
import { api } from '../../src/lib/api';

const DEFAULT_CENTER = { lat: 56.1165, lng: -3.1746 }; // UK Fife default (Kirkcaldy)

// Popular Fife & Edinburgh travel destinations & hubs
const PLACES = [
  { name: 'Kirkcaldy Central Station', address: 'Station Road, Kirkcaldy, KY1 2HA', lat: 56.1158, lng: -3.1678 },
  { name: 'Victoria Hospital Kirkcaldy', address: 'Hayfield Road, Kirkcaldy, KY2 5AH', lat: 56.1265, lng: -3.1645 },
  { name: 'Dunfermline City Centre', address: 'High Street, Dunfermline, KY12 7DL', lat: 56.0718, lng: -3.4616 },
  { name: 'Edinburgh Airport (EDI)', address: 'Airport Way, Edinburgh, EH12 9DN', lat: 55.9508, lng: -3.3615 },
  { name: 'Fife Retail & Leisure Park', address: 'Whimbrel Place, Dunfermline, KY11 8EX', lat: 56.0820, lng: -3.3980 },
  { name: 'St Andrews Old Course / Town', address: 'Market Street, St Andrews, KY16 9NS', lat: 56.3398, lng: -2.7967 },
  { name: 'Glenrothes Kingdom Centre', address: 'Lyon Square, Glenrothes, KY7 5NW', lat: 56.1969, lng: -3.1770 },
  { name: 'Edinburgh Waverley Station', address: 'Princes Street, Edinburgh, EH1 1BB', lat: 55.9520, lng: -3.1895 },
  { name: 'Cowdenbeath High Street', address: 'High Street, Cowdenbeath, KY4 9QW', lat: 56.1084, lng: -3.3440 },
  { name: 'Leven Bus Station & Beach', address: 'Shorehead, Leven, KY8 4NR', lat: 56.1950, lng: -3.0030 },
  { name: 'Inverkeithing Rail Station', address: 'Boreland Road, Inverkeithing, KY11 1NJ', lat: 56.0315, lng: -3.3986 },
  { name: 'Rosyth Ferry Toll / Dockyard', address: 'Castle Road, Rosyth, KY11 2ED', lat: 56.0260, lng: -3.4320 },
];

type LocationItem = {
  name: string;
  address: string;
  lat: number;
  lng: number;
  isGps?: boolean;
};

type Option = { type: string; label: string; fare: number; distance_km: number; duration_min: number };
type Ride = any;

export default function PassengerHome() {
  const router = useRouter();
  const { width } = useWindowDimensions();
  const isDesktop = width > 850;
  const theme = getTheme('passenger');
  const { user, login, register, logout } = useAuth();

  // Location Selection State: "From" (Pickup) and "To" (Destination)
  const [gpsCenter, setGpsCenter] = useState(DEFAULT_CENTER);
  const [customPickup, setCustomPickup] = useState<LocationItem | null>(null);
  const [dest, setDest] = useState<LocationItem | null>(null);
  const [activeInput, setActiveInput] = useState<'destination' | 'pickup'>('destination');
  const [query, setQuery] = useState('');

  const [options, setOptions] = useState<Option[]>([]);
  const [selectedType, setSelectedType] = useState<string>('economy');
  const [loading, setLoading] = useState(false);
  const [ride, setRide] = useState<Ride | null>(null);
  const pollRef = useRef<any>(null);

  // Lazy Auth Modal State
  const [authModalVisible, setAuthModalVisible] = useState(false);
  const [authMode, setAuthMode] = useState<'signin' | 'register'>('signin');
  const [authEmail, setAuthEmail] = useState('');
  const [authPassword, setAuthPassword] = useState('');
  const [authName, setAuthName] = useState('');
  const [authPhone, setAuthPhone] = useState('');
  const [authLoading, setAuthLoading] = useState(false);
  const [authError, setAuthError] = useState<string | null>(null);

  // Request GPS permission + watch position
  useEffect(() => {
    let sub: Location.LocationSubscription | null = null;
    (async () => {
      try {
        const { status } = await Location.requestForegroundPermissionsAsync();
        if (status === 'granted') {
          const loc = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
          if (loc?.coords) {
            setGpsCenter({ lat: loc.coords.latitude, lng: loc.coords.longitude });
          }
          sub = await Location.watchPositionAsync(
            { accuracy: Location.Accuracy.Balanced, distanceInterval: 25 },
            (newLoc) => setGpsCenter({ lat: newLoc.coords.latitude, lng: newLoc.coords.longitude }),
          );
        }
      } catch (err) {
        console.warn('GPS location request skipped or denied:', err);
      }
    })();
    return () => { sub?.remove(); };
  }, []);

  // Compute active pickup location (either GPS or custom chosen location)
  const pickup: LocationItem = useMemo(() => {
    if (customPickup) return customPickup;
    return {
      name: 'Your Current Location',
      address: 'Current Location (GPS)',
      lat: gpsCenter.lat,
      lng: gpsCenter.lng,
      isGps: true,
    };
  }, [customPickup, gpsCenter]);

  // Check current active ride
  const refresh = useCallback(async () => {
    if (user) {
      try {
        const r = await api<Ride | null>('/rides/current');
        if (r && ['pending', 'accepted', 'arrived', 'in_progress'].includes(r.status)) {
          setRide(r);
          router.replace(`/passenger/ride/${r.id}`);
          return;
        } else {
          setRide(null);
        }
      } catch (e) {
        console.warn('passenger current ride refresh failed', e);
        setRide(null);
      }
    } else {
      setRide(null);
    }
  }, [user, router]);

  useEffect(() => {
    refresh();
    pollRef.current = setInterval(refresh, 3500);
    return () => clearInterval(pollRef.current);
  }, [refresh]);

  useEffect(() => {
    if (ride && ['pending', 'accepted', 'arrived', 'in_progress'].includes(ride.status)) {
      router.replace(`/passenger/ride/${ride.id}`);
    }
  }, [ride?.status, ride?.id, router]);

  // Fetch ride fare options when pickup or destination changes
  useEffect(() => {
    if (!dest) { setOptions([]); return; }
    (async () => {
      try {
        const data = await api<{ options: Option[] }>('/rides/estimate', {
          body: {
            pickup_lat: pickup.lat, pickup_lng: pickup.lng,
            dest_lat: dest.lat, dest_lng: dest.lng,
          },
        });
        setOptions(data.options || []);
      } catch (e) {
        console.warn('ride estimate failed', e);
      }
    })();
  }, [dest, pickup]);

  // Execute actual ride dispatch
  const doDispatchRide = async (targetDest = dest, targetType = selectedType) => {
    if (!targetDest) return;
    setLoading(true);
    try {
      const r = await api<Ride>('/rides/request', {
        body: {
          pickup_lat: pickup.lat, pickup_lng: pickup.lng, pickup_address: pickup.address || pickup.name,
          dest_lat: targetDest.lat, dest_lng: targetDest.lng, dest_address: targetDest.address || targetDest.name,
          ride_type: targetType,
        },
      });
      setRide(r);
      router.replace(`/passenger/ride/${r.id}`);
    } catch (e: any) {
      if (
        e.message?.includes('already have an active ride') ||
        (e.detail && typeof e.detail === 'string' && e.detail.includes('already have an active ride'))
      ) {
        try {
          const current = await api<Ride>('/rides/current');
          if (current && current.id) {
            router.replace(`/passenger/ride/${current.id}`);
            return;
          }
        } catch {}
      }
      alert(e.message || 'Failed to dispatch ride');
    } finally {
      setLoading(false);
    }
  };

  // Main Booking Button Click (Triggers Guest Auth Modal if not logged in)
  const handleRequestRideClick = async () => {
    if (!dest) return;
    if (!user) {
      setAuthError(null);
      setAuthModalVisible(true);
      return;
    }
    await doDispatchRide(dest, selectedType);
  };

  // Quick 1-Tap Demo Passenger Sign In
  const handleQuickDemoAuth = async () => {
    setAuthLoading(true);
    setAuthError(null);
    try {
      await login('passenger@demo.com', 'Passenger123!', 'passenger');
      setAuthModalVisible(false);
      await doDispatchRide(dest, selectedType);
    } catch (err: any) {
      setAuthError(err.message || 'Demo login failed');
    } finally {
      setAuthLoading(false);
    }
  };

  // Submit custom Email/Password auth
  const handleCustomAuthSubmit = async () => {
    if (!authEmail || !authPassword) {
      setAuthError('Please enter both email and password');
      return;
    }
    setAuthLoading(true);
    setAuthError(null);
    try {
      if (authMode === 'signin') {
        await login(authEmail.trim(), authPassword, 'passenger');
      } else {
        await register({
          name: authName.trim() || 'GetChum Rider',
          email: authEmail.trim(),
          phone: authPhone.trim() || '+447000000000',
          password: authPassword,
          role: 'passenger',
        });
      }
      setAuthModalVisible(false);
      await doDispatchRide(dest, selectedType);
    } catch (err: any) {
      setAuthError(err.message || 'Authentication failed');
    } finally {
      setAuthLoading(false);
    }
  };

  // Swap pickup and destination
  const handleSwapLocations = () => {
    if (!dest) return;
    const oldPickup = pickup;
    setCustomPickup(dest);
    setDest(oldPickup.isGps ? null : oldPickup);
  };

  const filteredPlaces = useMemo(() => {
    if (!query) return PLACES;
    const q = query.toLowerCase();
    return PLACES.filter(
      (p) => p.name.toLowerCase().includes(q) || p.address.toLowerCase().includes(q)
    );
  }, [query]);

  // Clean map markers: only show pickup & destination (do not expose driver count or empty fleet)
  const markers = [
    { lat: pickup.lat, lng: pickup.lng, kind: 'self' as const, label: pickup.name },
    ...(dest ? [{ lat: dest.lat, lng: dest.lng, kind: 'destination' as const, label: dest.name }] : []),
  ];

  const isRideActive = ride && ['pending', 'accepted', 'arrived', 'in_progress'].includes(ride?.status);

  const BookingPanel = (
    <View style={[styles.sheet, isDesktop && styles.desktopSheet]}>
      {isRideActive ? (
        <View style={{ gap: 14 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
              <View style={{ width: 10, height: 10, borderRadius: 5, backgroundColor: '#FACC15' }} />
              <Text style={{ color: '#FACC15', fontSize: 13, fontWeight: '800', textTransform: 'uppercase' }}>
                {ride.status.replace('_', ' ')}
              </Text>
            </View>
            <Text style={{ color: '#94A3B8', fontSize: 12 }}>Trip in Progress</Text>
          </View>

          <View style={{ backgroundColor: '#1E293B', borderRadius: 16, padding: 16, borderWidth: 1, borderColor: '#334155' }}>
            <Text style={{ color: '#FACC15', fontSize: 11, fontWeight: '700', letterSpacing: 0.5 }}>ACTIVE DESTINATION</Text>
            <Text style={{ color: '#FFFFFF', fontSize: 16, fontWeight: '700', marginTop: 3 }}>
              {ride.destination?.address || 'Trip Destination'}
            </Text>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 10 }}>
              <Text style={{ color: '#94A3B8', fontSize: 12 }}>
                Vehicle: {ride.ride_type?.toUpperCase() || 'STANDARD'}
              </Text>
              <Text style={{ color: '#FFFFFF', fontSize: 16, fontWeight: '800' }}>
                £{(ride.fare || 0).toFixed(2)}
              </Text>
            </View>
          </View>

          <TouchableOpacity
            style={styles.requestBtn}
            onPress={() => router.replace(`/passenger/ride/${ride.id}`)}
            activeOpacity={0.85}
          >
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
              <Ionicons name="navigate" size={18} color="#0F172A" />
              <Text style={styles.requestBtnText}>Open Live Trip Tracking Screen</Text>
            </View>
          </TouchableOpacity>
        </View>
      ) : !dest ? (
        <>
          <View style={styles.sheetHeaderRow}>
            <Text style={styles.sheetTitle}>Book a Chum in Fife & Edinburgh</Text>
            <Text style={styles.sheetSubtitle}>Instant private hire quotes · 92% to local Scottish drivers</Text>
          </View>

          {/* Interactive Route Box: Pickup (From) & Destination (To) */}
          <View style={styles.routeBox}>
            {/* FROM ROW */}
            <TouchableOpacity
              style={[styles.routeRow, activeInput === 'pickup' && styles.routeRowActive]}
              onPress={() => {
                setActiveInput('pickup');
                setQuery(customPickup ? customPickup.name : '');
              }}
              activeOpacity={0.8}
            >
              <View style={[styles.routeDot, { backgroundColor: '#22C55E' }]} />
              <View style={{ flex: 1 }}>
                <Text style={styles.routeLabel}>PICKUP LOCATION (FROM)</Text>
                <Text style={styles.routeName} numberOfLines={1}>
                  {customPickup ? customPickup.name : 'Your Current Location (GPS)'}
                </Text>
                <Text style={styles.routeSub} numberOfLines={1}>
                  {customPickup ? customPickup.address : 'Auto-detected device GPS'}
                </Text>
              </View>
              {customPickup ? (
                <TouchableOpacity
                  onPress={(e) => {
                    e.stopPropagation();
                    setCustomPickup(null);
                    setQuery('');
                  }}
                  style={styles.resetGpsBtn}
                >
                  <Text style={styles.resetGpsText}>Use GPS</Text>
                </TouchableOpacity>
              ) : (
                <Text style={{ color: '#FACC15', fontSize: 11, fontWeight: '600' }}>Change</Text>
              )}
            </TouchableOpacity>

            {/* Middle Divider & Swap Button */}
            <View style={styles.routeConnector}>
              <View style={styles.routeConnectorLine} />
              <TouchableOpacity
                onPress={handleSwapLocations}
                style={styles.swapBtn}
                title="Swap Pickup and Destination"
              >
                <Ionicons name="swap-vertical" size={16} color="#94A3B8" />
              </TouchableOpacity>
            </View>

            {/* TO ROW */}
            <TouchableOpacity
              style={[styles.routeRow, activeInput === 'destination' && styles.routeRowActive]}
              onPress={() => {
                setActiveInput('destination');
                setQuery(dest ? dest.name : '');
              }}
              activeOpacity={0.8}
            >
              <View style={[styles.routeDot, { backgroundColor: '#EF4444' }]} />
              <View style={{ flex: 1 }}>
                <Text style={styles.routeLabel}>DESTINATION (TO)</Text>
                <Text
                  style={[styles.routeName, !dest && { color: '#94A3B8', fontWeight: '500' }]}
                  numberOfLines={1}
                >
                  {dest ? dest.name : 'Where are you heading?'}
                </Text>
                {dest && (
                  <Text style={styles.routeSub} numberOfLines={1}>{dest.address}</Text>
                )}
              </View>
              {!dest && (
                <Ionicons name="search" size={16} color="#64748B" />
              )}
            </TouchableOpacity>
          </View>

          {/* Search Box for the active field */}
          <View style={styles.searchBox}>
            <Ionicons name="search" size={20} color="#94A3B8" />
            <TextInput
              testID="location-search"
              style={styles.searchInput}
              placeholder={
                activeInput === 'pickup'
                  ? 'Search pickup address, station, hospital...'
                  : 'Search destination station, hospital, airport...'
              }
              placeholderTextColor="#64748B"
              value={query}
              onChangeText={setQuery}
            />
            {query.length > 0 && (
              <TouchableOpacity onPress={() => setQuery('')}>
                <Ionicons name="close-circle" size={18} color="#94A3B8" />
              </TouchableOpacity>
            )}
          </View>

          {/* Option to reset to GPS if picking pickup */}
          {activeInput === 'pickup' && (
            <TouchableOpacity
              style={styles.gpsOptionRow}
              onPress={() => {
                setCustomPickup(null);
                setQuery('');
                setActiveInput('destination');
              }}
              activeOpacity={0.75}
            >
              <View style={[styles.placeIcon, { backgroundColor: 'rgba(34, 197, 94, 0.15)', borderColor: 'rgba(34, 197, 94, 0.3)' }]}>
                <Ionicons name="locate" size={18} color="#22C55E" />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={[styles.placeName, { color: '#22C55E' }]}>Use My Current Location (GPS)</Text>
                <Text style={styles.placeAddress}>Device coordinates in Kirkcaldy / Fife</Text>
              </View>
              <Ionicons name="checkmark-circle" size={18} color="#22C55E" />
            </TouchableOpacity>
          )}

          {/* Location Hubs & Matches */}
          <ScrollView
            style={{ maxHeight: isDesktop ? 400 : 250 }}
            showsVerticalScrollIndicator={false}
            contentContainerStyle={{ paddingBottom: 10 }}
          >
            {filteredPlaces.map((p) => (
              <TouchableOpacity
                key={p.name}
                testID={`place-${p.name}`}
                style={styles.placeRow}
                onPress={() => {
                  if (activeInput === 'pickup') {
                    setCustomPickup(p);
                    setQuery('');
                    setActiveInput('destination');
                  } else {
                    setDest(p);
                    setQuery('');
                  }
                }}
                activeOpacity={0.7}
              >
                <View style={styles.placeIcon}>
                  <Ionicons
                    name={activeInput === 'pickup' ? 'pin' : 'location'}
                    size={18}
                    color={activeInput === 'pickup' ? '#22C55E' : '#FACC15'}
                  />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.placeName}>{p.name}</Text>
                  <Text style={styles.placeAddress} numberOfLines={1}>{p.address}</Text>
                </View>
                <Ionicons name="chevron-forward" size={18} color="#64748B" />
              </TouchableOpacity>
            ))}

            {/* Custom address write-in fallback */}
            {query.trim().length > 3 && !filteredPlaces.some(p => p.name.toLowerCase() === query.trim().toLowerCase()) && (
              <TouchableOpacity
                style={[styles.placeRow, { borderBottomWidth: 0, backgroundColor: 'rgba(250, 204, 21, 0.05)', borderRadius: 12, paddingHorizontal: 10 }]}
                onPress={() => {
                  const customItem: LocationItem = {
                    name: query.trim(),
                    address: query.trim() + ', Fife & Edinburgh',
                    lat: activeInput === 'pickup' ? gpsCenter.lat : 55.9520,
                    lng: activeInput === 'pickup' ? gpsCenter.lng : -3.1895,
                  };
                  if (activeInput === 'pickup') {
                    setCustomPickup(customItem);
                    setQuery('');
                    setActiveInput('destination');
                  } else {
                    setDest(customItem);
                    setQuery('');
                  }
                }}
                activeOpacity={0.75}
              >
                <View style={[styles.placeIcon, { backgroundColor: '#FACC15' }]}>
                  <Ionicons name="arrow-forward" size={18} color="#0F172A" />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={[styles.placeName, { color: '#FACC15' }]}>Use custom location "{query.trim()}"</Text>
                  <Text style={styles.placeAddress}>Confirm and calculate fixed fare</Text>
                </View>
              </TouchableOpacity>
            )}
          </ScrollView>
        </>
      ) : (
        <>
          {/* Selected Route Summary (From & To) */}
          <View style={styles.destSelectedHeader}>
            <View style={{ flex: 1, gap: 10 }}>
              {/* FROM Summary */}
              <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, flex: 1 }}>
                  <View style={[styles.routeDot, { backgroundColor: '#22C55E' }]} />
                  <View style={{ flex: 1 }}>
                    <Text style={styles.destLabel}>PICKUP (FROM)</Text>
                    <Text style={styles.destNameText} numberOfLines={1}>{pickup.name}</Text>
                    <Text style={styles.destAddressText} numberOfLines={1}>{pickup.address}</Text>
                  </View>
                </View>
                <TouchableOpacity
                  onPress={() => {
                    setDest(null);
                    setActiveInput('pickup');
                  }}
                  style={styles.changeLinkBtn}
                >
                  <Text style={styles.changeLinkText}>Change</Text>
                </TouchableOpacity>
              </View>

              <View style={{ height: 1, backgroundColor: '#334155' }} />

              {/* TO Summary */}
              <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, flex: 1 }}>
                  <View style={[styles.routeDot, { backgroundColor: '#EF4444' }]} />
                  <View style={{ flex: 1 }}>
                    <Text style={[styles.destLabel, { color: '#EF4444' }]}>DESTINATION (TO)</Text>
                    <Text style={styles.destNameText} numberOfLines={1}>{dest.name}</Text>
                    <Text style={styles.destAddressText} numberOfLines={1}>{dest.address}</Text>
                  </View>
                </View>
                <TouchableOpacity
                  onPress={() => {
                    setDest(null);
                    setActiveInput('destination');
                  }}
                  style={styles.changeLinkBtn}
                >
                  <Text style={styles.changeLinkText}>Change</Text>
                </TouchableOpacity>
              </View>
            </View>
          </View>

          {/* Ride Options */}
          <Text style={styles.optionsSectionTitle}>Choose Vehicle Tier</Text>
          {options.length === 0 ? (
            <View style={{ padding: 24, alignItems: 'center' }}>
              <ActivityIndicator color="#FACC15" size="large" />
              <Text style={{ color: '#94A3B8', marginTop: 10, fontSize: 13 }}>Calculating shortest route & fair fare...</Text>
            </View>
          ) : (
            <ScrollView
              horizontal={!isDesktop}
              showsHorizontalScrollIndicator={false}
              style={{ marginBottom: 14 }}
              contentContainerStyle={{ gap: 10, paddingVertical: 4 }}
            >
              {options.map((o) => {
                const sel = selectedType === o.type;
                return (
                  <TouchableOpacity
                    key={o.type}
                    testID={`ride-option-${o.type}`}
                    onPress={() => setSelectedType(o.type)}
                    activeOpacity={0.8}
                    style={[
                      styles.optionCard,
                      isDesktop && styles.desktopOptionCard,
                      sel && styles.optionCardSelected,
                    ]}
                  >
                    <View style={styles.optionHeaderRow}>
                      <View style={[styles.carIconBox, sel && { backgroundColor: '#0F172A' }]}>
                        <Ionicons name="car-sport" size={20} color={sel ? '#FACC15' : '#FFFFFF'} />
                      </View>
                      <View style={{ flex: 1, marginLeft: 8 }}>
                        <Text style={[styles.optionTitle, sel && { color: '#0F172A' }]}>{o.label}</Text>
                        <Text style={[styles.optionMeta, sel && { color: '#334155' }]}>
                          {o.duration_min.toFixed(0)} min · {o.distance_km.toFixed(1)} km
                        </Text>
                      </View>
                      <Text style={[styles.optionPrice, sel && { color: '#0F172A' }]}>
                        £{o.fare.toFixed(2)}
                      </Text>
                    </View>
                  </TouchableOpacity>
                );
              })}
            </ScrollView>
          )}

          {/* Payment & Fair Pricing Badge */}
          <View style={styles.fairPriceBadge}>
            <Ionicons name="shield-checkmark" size={16} color="#22C55E" />
            <Text style={styles.fairPriceText}>
              Transparent 8% fee · Guaranteed 92% Scottish Driver Payout
            </Text>
          </View>

          {/* Request Button */}
          <TouchableOpacity
            testID="request-ride-btn"
            style={[styles.requestBtn, (options.length === 0 || loading) && { opacity: 0.6 }]}
            onPress={handleRequestRideClick}
            disabled={options.length === 0 || loading}
            activeOpacity={0.85}
          >
            {loading ? (
              <ActivityIndicator color="#0F172A" />
            ) : (
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                <Text style={styles.requestBtnText}>
                  {user ? `Request Chum · £${options.find((o) => o.type === selectedType)?.fare.toFixed(2) || ''}` : 'Request Chum (Instant Booking)'}
                </Text>
                <Ionicons name="arrow-forward" size={18} color="#0F172A" />
              </View>
            )}
          </TouchableOpacity>
        </>
      )}
    </View>
  );

  return (
    <SafeAreaView style={styles.root} edges={['top', 'bottom']} testID="passenger-home">
      {/* Top Navigation Bar: Clean, professional header with no driver count badge */}
      <View style={styles.navBar}>
        <View style={styles.brandRow}>
          <View style={styles.brandLogo}>
            <Ionicons name="car" size={18} color="#0F172A" />
          </View>
          <View>
            <Text style={styles.brandTitle}>GetChum</Text>
            <Text style={styles.brandSubtitle}>Scotland Private Hire</Text>
          </View>
        </View>

        <View style={styles.navRightRow}>
          {/* User Profile or Sign In Button */}
          {user ? (
            <View style={styles.userPill}>
              <Ionicons name="person-circle" size={20} color="#FACC15" />
              <Text style={styles.userName}>{user.name?.split(' ')[0] || 'Rider'}</Text>
              <TouchableOpacity onPress={logout} style={{ marginLeft: 6 }}>
                <Ionicons name="log-out-outline" size={16} color="#94A3B8" />
              </TouchableOpacity>
            </View>
          ) : (
            <TouchableOpacity
              style={styles.signInPill}
              onPress={() => {
                setAuthError(null);
                setAuthModalVisible(true);
              }}
            >
              <Ionicons name="person" size={14} color="#0F172A" />
              <Text style={styles.signInPillText}>Sign In</Text>
            </TouchableOpacity>
          )}
        </View>
      </View>

      {/* Main Content: Desktop Split or Mobile Stack */}
      {isDesktop ? (
        <View style={styles.desktopContainer}>
          <View style={styles.desktopLeftCol}>{BookingPanel}</View>
          <View style={styles.desktopRightCol}>
            <MapView
              center={pickup}
              markers={markers}
              theme={theme}
              showRoute={dest ? { from: pickup, to: dest } : undefined}
            />
          </View>
        </View>
      ) : (
        <View style={styles.mobileContainer}>
          <View style={styles.mapContainer}>
            <MapView
              center={pickup}
              markers={markers}
              theme={theme}
              showRoute={dest ? { from: pickup, to: dest } : undefined}
            />
          </View>
          {BookingPanel}
        </View>
      )}

      {/* Frictionless Lazy Auth Modal */}
      <Modal
        visible={authModalVisible}
        transparent
        animationType="fade"
        onRequestClose={() => setAuthModalVisible(false)}
      >
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
          style={styles.modalOverlay}
        >
          <View style={styles.modalCard}>
            <View style={styles.modalHeader}>
              <View>
                <Text style={styles.modalTitle}>
                  {authMode === 'signin' ? 'Sign In to Confirm Ride' : 'Create GetChum Account'}
                </Text>
                <Text style={styles.modalSubtitle}>
                  Your destination and quote are saved. Let’s dispatch your driver!
                </Text>
              </View>
              <TouchableOpacity onPress={() => setAuthModalVisible(false)} style={styles.modalCloseBtn}>
                <Ionicons name="close" size={20} color="#94A3B8" />
              </TouchableOpacity>
            </View>

            {authError && (
              <View style={styles.modalErrorBox}>
                <Ionicons name="alert-circle" size={16} color="#EF4444" />
                <Text style={styles.modalErrorText}>{authError}</Text>
              </View>
            )}

            <TouchableOpacity
              style={styles.demoQuickBtn}
              onPress={handleQuickDemoAuth}
              disabled={authLoading}
            >
              <Ionicons name="flash" size={18} color="#0F172A" />
              <Text style={styles.demoQuickBtnText}>1-Tap Demo Passenger Login</Text>
            </TouchableOpacity>

            <View style={styles.dividerRow}>
              <View style={styles.dividerLine} />
              <Text style={styles.dividerText}>or email & password</Text>
              <View style={styles.dividerLine} />
            </View>

            {authMode === 'register' && (
              <>
                <TextInput
                  style={styles.modalInput}
                  placeholder="Full Name"
                  placeholderTextColor="#64748B"
                  value={authName}
                  onChangeText={setAuthName}
                />
                <TextInput
                  style={styles.modalInput}
                  placeholder="Mobile Phone (e.g. +44 7123 456789)"
                  placeholderTextColor="#64748B"
                  value={authPhone}
                  onChangeText={setAuthPhone}
                  keyboardType="phone-pad"
                />
              </>
            )}

            <TextInput
              style={styles.modalInput}
              placeholder="Email address"
              placeholderTextColor="#64748B"
              value={authEmail}
              onChangeText={setAuthEmail}
              autoCapitalize="none"
              keyboardType="email-address"
            />
            <TextInput
              style={styles.modalInput}
              placeholder="Password"
              placeholderTextColor="#64748B"
              value={authPassword}
              onChangeText={setAuthPassword}
              secureTextEntry
            />

            <TouchableOpacity
              style={styles.modalSubmitBtn}
              onPress={handleCustomAuthSubmit}
              disabled={authLoading}
            >
              {authLoading ? (
                <ActivityIndicator color="#0F172A" />
              ) : (
                <Text style={styles.modalSubmitBtnText}>
                  {authMode === 'signin' ? 'Sign In & Book Taxi' : 'Register & Book Taxi'}
                </Text>
              )}
            </TouchableOpacity>

            <TouchableOpacity
              onPress={() => setAuthMode(authMode === 'signin' ? 'register' : 'signin')}
              style={{ marginTop: 16, alignItems: 'center' }}
            >
              <Text style={{ color: '#FACC15', fontSize: 13, fontWeight: '600' }}>
                {authMode === 'signin' ? "Don't have an account? Create one" : 'Already registered? Sign In'}
              </Text>
            </TouchableOpacity>
          </View>
        </KeyboardAvoidingView>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#090D16' },
  navBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingVertical: 12,
    backgroundColor: '#0F172A',
    borderBottomWidth: 1,
    borderBottomColor: '#1E293B',
    zIndex: 10,
  },
  brandRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  brandLogo: {
    width: 34, height: 34, borderRadius: 10,
    backgroundColor: '#FACC15', alignItems: 'center', justifyContent: 'center',
  },
  brandTitle: { color: '#FFFFFF', fontSize: 17, fontWeight: '800', letterSpacing: -0.4 },
  brandSubtitle: { color: '#94A3B8', fontSize: 10, fontWeight: '500' },
  navRightRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  userPill: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    backgroundColor: '#1E293B', paddingHorizontal: 12, paddingVertical: 6,
    borderRadius: 20, borderWidth: 1, borderColor: '#334155',
  },
  userName: { color: '#FFFFFF', fontSize: 12, fontWeight: '600' },
  signInPill: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    backgroundColor: '#FACC15', paddingHorizontal: 14, paddingVertical: 7,
    borderRadius: 20,
  },
  signInPillText: { color: '#0F172A', fontSize: 12, fontWeight: '700' },

  // Layouts
  desktopContainer: { flex: 1, flexDirection: 'row', backgroundColor: '#090D16' },
  desktopLeftCol: { width: 440, backgroundColor: '#0F172A', borderRightWidth: 1, borderRightColor: '#1E293B' },
  desktopRightCol: { flex: 1 },
  mobileContainer: { flex: 1 },
  mapContainer: { flex: 1 },

  // Booking Card / Bottom Sheet
  sheet: {
    backgroundColor: '#0F172A',
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    padding: 20,
    paddingBottom: 28,
    shadowColor: '#000',
    shadowOpacity: 0.35,
    shadowRadius: 20,
    elevation: 12,
    borderTopWidth: 1,
    borderTopColor: '#1E293B',
  },
  desktopSheet: {
    borderTopLeftRadius: 0,
    borderTopRightRadius: 0,
    borderTopWidth: 0,
    height: '100%',
    padding: 24,
  },
  sheetHeaderRow: { marginBottom: 14 },
  sheetTitle: { color: '#FFFFFF', fontSize: 19, fontWeight: '800', letterSpacing: -0.4 },
  sheetSubtitle: { color: '#94A3B8', fontSize: 12, marginTop: 4 },

  // Interactive Route Box (From & To)
  routeBox: {
    backgroundColor: '#1E293B',
    borderRadius: 18,
    padding: 12,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: '#334155',
  },
  routeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 8,
    paddingHorizontal: 8,
    borderRadius: 12,
  },
  routeRowActive: {
    backgroundColor: 'rgba(250, 204, 21, 0.08)',
    borderWidth: 1,
    borderColor: 'rgba(250, 204, 21, 0.35)',
  },
  routeDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
  },
  routeLabel: {
    fontSize: 9.5,
    fontWeight: '800',
    color: '#94A3B8',
    letterSpacing: 0.6,
  },
  routeName: {
    fontSize: 14,
    fontWeight: '700',
    color: '#F8FAFC',
    marginTop: 2,
  },
  routeSub: {
    fontSize: 11,
    color: '#94A3B8',
    marginTop: 1,
  },
  routeConnector: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingLeft: 12,
    height: 22,
  },
  routeConnectorLine: {
    width: 2,
    height: 22,
    backgroundColor: '#334155',
  },
  swapBtn: {
    marginLeft: 14,
    width: 26,
    height: 26,
    borderRadius: 13,
    backgroundColor: '#0F172A',
    borderWidth: 1,
    borderColor: '#334155',
    alignItems: 'center',
    justifyContent: 'center',
  },
  resetGpsBtn: {
    backgroundColor: 'rgba(34, 197, 94, 0.15)',
    borderWidth: 1,
    borderColor: 'rgba(34, 197, 94, 0.35)',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 8,
  },
  resetGpsText: {
    color: '#22C55E',
    fontSize: 11,
    fontWeight: '700',
  },
  gpsOptionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 10,
    paddingHorizontal: 12,
    backgroundColor: 'rgba(34, 197, 94, 0.08)',
    borderRadius: 14,
    borderWidth: 1,
    borderColor: 'rgba(34, 197, 94, 0.25)',
    marginBottom: 10,
    gap: 12,
  },

  searchBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    backgroundColor: '#1E293B',
    borderRadius: 16,
    paddingHorizontal: 14,
    height: 48,
    borderWidth: 1,
    borderColor: '#334155',
    marginBottom: 12,
  },
  searchInput: { flex: 1, color: '#FFFFFF', fontSize: 13.5, outlineStyle: 'none' as any },
  placeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#1E293B',
    gap: 12,
  },
  placeIcon: {
    width: 36, height: 36, borderRadius: 10,
    backgroundColor: '#1E293B', alignItems: 'center', justifyContent: 'center',
    borderWidth: 1, borderColor: '#334155',
  },
  placeName: { color: '#FFFFFF', fontSize: 14, fontWeight: '600' },
  placeAddress: { color: '#94A3B8', fontSize: 11, marginTop: 2 },

  destSelectedHeader: {
    backgroundColor: '#1E293B',
    borderRadius: 16,
    padding: 14,
    marginBottom: 14,
    borderWidth: 1,
    borderColor: '#334155',
  },
  changeLinkBtn: {
    paddingHorizontal: 10,
    paddingVertical: 5,
    backgroundColor: '#0F172A',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#334155',
  },
  changeLinkText: {
    color: '#FACC15',
    fontSize: 11,
    fontWeight: '700',
  },
  destLabel: { color: '#FACC15', fontSize: 10, fontWeight: '700', letterSpacing: 0.5 },
  destNameText: { color: '#FFFFFF', fontSize: 14, fontWeight: '700', marginTop: 2 },
  destAddressText: { color: '#94A3B8', fontSize: 11, marginTop: 2 },
  optionsSectionTitle: { color: '#94A3B8', fontSize: 12, fontWeight: '700', textTransform: 'uppercase', marginBottom: 10 },

  optionCard: {
    backgroundColor: '#1E293B',
    borderRadius: 16,
    padding: 14,
    borderWidth: 1,
    borderColor: '#334155',
    minWidth: 180,
  },
  desktopOptionCard: { minWidth: '100%', marginBottom: 8 },
  optionCardSelected: {
    backgroundColor: '#FACC15',
    borderColor: '#FACC15',
  },
  optionHeaderRow: { flexDirection: 'row', alignItems: 'center' },
  carIconBox: {
    width: 38, height: 38, borderRadius: 12,
    backgroundColor: '#334155', alignItems: 'center', justifyContent: 'center',
  },
  optionTitle: { color: '#FFFFFF', fontSize: 14, fontWeight: '700' },
  optionMeta: { color: '#94A3B8', fontSize: 11, marginTop: 2 },
  optionPrice: { color: '#FFFFFF', fontSize: 17, fontWeight: '800', marginLeft: 8 },

  fairPriceBadge: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    backgroundColor: 'rgba(34, 197, 94, 0.1)', padding: 10, borderRadius: 12,
    borderWidth: 1, borderColor: 'rgba(34, 197, 94, 0.25)', marginBottom: 14,
  },
  fairPriceText: { color: '#86EFAC', fontSize: 11, fontWeight: '600' },

  requestBtn: {
    backgroundColor: '#FACC15',
    height: 52,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#FACC15',
    shadowOpacity: 0.35,
    shadowRadius: 10,
    elevation: 6,
  },
  requestBtnText: { color: '#0F172A', fontSize: 15, fontWeight: '800' },

  // Lazy Auth Modal
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.75)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  modalCard: {
    width: '100%',
    maxWidth: 420,
    backgroundColor: '#0F172A',
    borderRadius: 24,
    padding: 24,
    borderWidth: 1,
    borderColor: '#334155',
    shadowColor: '#000',
    shadowOpacity: 0.5,
    shadowRadius: 25,
    elevation: 20,
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 16,
  },
  modalTitle: { color: '#FFFFFF', fontSize: 18, fontWeight: '800' },
  modalSubtitle: { color: '#94A3B8', fontSize: 12, marginTop: 4, lineHeight: 16 },
  modalCloseBtn: { padding: 4 },
  modalErrorBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: 'rgba(239, 68, 68, 0.15)',
    borderWidth: 1,
    borderColor: 'rgba(239, 68, 68, 0.3)',
    borderRadius: 12,
    padding: 10,
    marginBottom: 14,
  },
  modalErrorText: { color: '#FCA5A5', fontSize: 12, flex: 1 },
  demoQuickBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: '#FACC15',
    borderRadius: 14,
    height: 48,
    marginBottom: 14,
  },
  demoQuickBtnText: { color: '#0F172A', fontSize: 14, fontWeight: '700' },
  dividerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginVertical: 12,
    gap: 10,
  },
  dividerLine: { flex: 1, height: 1, backgroundColor: '#334155' },
  dividerText: { color: '#64748B', fontSize: 11, textTransform: 'uppercase', letterSpacing: 0.5 },
  modalInput: {
    backgroundColor: '#1E293B',
    borderRadius: 14,
    height: 46,
    paddingHorizontal: 14,
    color: '#FFFFFF',
    fontSize: 13,
    borderWidth: 1,
    borderColor: '#334155',
    marginBottom: 10,
    outlineStyle: 'none' as any,
  },
  modalSubmitBtn: {
    backgroundColor: '#38BDF8',
    borderRadius: 14,
    height: 48,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 6,
  },
  modalSubmitBtnText: { color: '#0F172A', fontSize: 14, fontWeight: '700' },
});
