import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Alert,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { munshiTheme } from '../../src/lib/theme';
import { api } from '../../src/lib/api';

interface BayData {
  id: string;
  bayNumber: number;
  corridor: string;
  urduCorridor: string;
  vehiclePlate: string;
  driverName: string;
  driverPhone: string;
  vehicleType: string;
  seatsBooked: number;
  totalSeats: number;
  farePerSeat: number;
  status: 'loading' | 'full' | 'departed';
  departureTime: string;
}

export default function BaysScreen() {
  const theme = munshiTheme;
  const currentAddaId = 'adda_pwd_01';

  const [bays, setBays] = useState<BayData[]>([
    {
      id: 'bay_2',
      bayNumber: 2,
      corridor: 'Pirwadhai to Peshawar Line',
      urduCorridor: 'پیرودھائی تا پشاور (جی ٹی روڈ)',
      vehiclePlate: 'LES-19-4821',
      driverName: 'Tariq Mahmood (طارق محمود)',
      driverPhone: '0300-5554921',
      vehicleType: 'Toyota HiAce Grand Cabin (14-S)',
      seatsBooked: 11,
      totalSeats: 14,
      farePerSeat: 450,
      status: 'loading',
      departureTime: '08:30 PM',
    },
    {
      id: 'bay_1',
      bayNumber: 1,
      corridor: 'Rawalpindi to Lahore Motorway',
      urduCorridor: 'راولپنڈی تا لاہور (موٹروے M-2)',
      vehiclePlate: 'RIP-21-9921',
      driverName: 'Rafiq Ahmad (رفیق احمد)',
      driverPhone: '0321-4455667',
      vehicleType: 'Toyota Coaster Executive (28-S)',
      seatsBooked: 24,
      totalSeats: 28,
      farePerSeat: 850,
      status: 'loading',
      departureTime: '08:45 PM',
    },
    {
      id: 'bay_3',
      bayNumber: 3,
      corridor: 'Pirwadhai to Saddar Shuttle',
      urduCorridor: 'پیرودھائی تا صدر راولپنڈی شٹل',
      vehiclePlate: 'RWP-18-3011',
      driverName: 'Bilal Khan (بلال خان)',
      driverPhone: '0345-9988112',
      vehicleType: 'Sazgar 9-Seater Qingqi',
      seatsBooked: 7,
      totalSeats: 9,
      farePerSeat: 40,
      status: 'loading',
      departureTime: 'Ready',
    },
  ]);

  useEffect(() => {
    async function fetchLiveBays() {
      try {
        const queue = await api<any[]>(`/addas/${currentAddaId}/pari`);
        if (queue && queue.length > 0) {
          const mapped: BayData[] = queue.map((item, idx) => ({
            id: item.id || `pari_${idx}`,
            bayNumber: item.bay_number || idx + 1,
            corridor: item.corridor_name || 'Twin Cities Corridor',
            urduCorridor: item.corridor_urdu || 'جڑواں شہر روٹ',
            vehiclePlate: item.vehicle_plate || 'ICT-22-1001',
            driverName: item.driver_name || 'Watan Driver',
            driverPhone: item.driver_phone || '0300-0000000',
            vehicleType: item.vehicle_type || 'Wagon (14-S)',
            seatsBooked: item.booked_seats_count || 0,
            totalSeats: item.total_seats || 14,
            farePerSeat: item.fare_per_seat || 450,
            status: item.status === 'departed' ? 'departed' : item.booked_seats_count >= item.total_seats ? 'full' : 'loading',
            departureTime: item.scheduled_departure || 'In Bay',
          }));
          setBays(mapped);
        }
      } catch (err) {
        // Safe fallback to defaults if offline or adda not yet seeded
      }
    }
    fetchLiveBays();
  }, []);

  const [departuresCount, setDeparturesCount] = useState<number>(38);
  const [waitingQueue, setWaitingQueue] = useState([
    {
      id: 'q_1',
      turn: 1,
      plate: 'RWP-14-5541',
      driver: 'Arshad Mehmood',
      vehicle: 'Suzuki Bolan (7-S)',
      route: 'Murree Express',
    },
    {
      id: 'q_2',
      turn: 2,
      plate: 'ICT-22-4012',
      driver: 'Sajid Gul',
      vehicle: 'Toyota HiAce (14-S)',
      route: 'Peshawar Line',
    },
  ]);

  const handleDispatch = (bay: BayData) => {
    Alert.alert(
      'گاڑی روانہ کریں (Dispatch Vehicle)',
      `Mark ${bay.vehiclePlate} (${bay.driverName}) as departed from Bay #${bay.bayNumber}?\n\nSeats: ${bay.seatsBooked}/${bay.totalSeats}\nRoute: ${bay.corridor}`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'روانہ کریں (Dispatch)',
          style: 'destructive',
          onPress: async () => {
            try {
              await api(`/addas/${currentAddaId}/pari/${bay.id}/depart`, { method: 'POST' });
            } catch (err) {
              console.log('Depart API fallback to local:', err);
            }
            setDeparturesCount((prev) => prev + 1);
            setBays((prev) =>
              prev.map((b) =>
                b.id === bay.id
                  ? {
                      ...b,
                      seatsBooked: 0,
                      departureTime: 'Loading next in Pari',
                      vehiclePlate: waitingQueue[0]?.plate || 'LES-22-1092',
                      driverName: waitingQueue[0]?.driver || 'Naveed Akhtar',
                    }
                  : b
              )
            );
            if (waitingQueue.length > 0) {
              setWaitingQueue((prev) => prev.slice(1));
            }
            Alert.alert(
              '✓ گاڑی روانہ ہو گئی',
              `Gate exit pass issued for ${bay.vehiclePlate}. Next vehicle summoned to Bay #${bay.bayNumber}.`
            );
          },
        },
      ]
    );
  };

  const handleAddWalkInSeat = (bayId: string) => {
    setBays((prev) =>
      prev.map((b) => {
        if (b.id !== bayId) return b;
        if (b.seatsBooked >= b.totalSeats) {
          Alert.alert('گاڑی فل ہے (Full)', 'All seats in this vehicle are already filled.');
          return b;
        }
        return { ...b, seatsBooked: b.seatsBooked + 1 };
      })
    );
  };

  return (
    <SafeAreaView style={[styles.root, { backgroundColor: theme.bg }]} edges={['top']}>
      {/* Top Munshi Header */}
      <View style={[styles.header, { backgroundColor: theme.surface, borderColor: theme.border }]}>
        <View>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
            <View style={styles.onlineDot} />
            <Text style={{ color: theme.text, fontSize: 16, fontWeight: '800' }}>
              Al-Makkah Adda (المکہ اڈہ)
            </Text>
          </View>
          <Text style={{ color: theme.textDim, fontSize: 11, marginTop: 2 }}>
            منشی اسلم خان • Stand #ISB-001 • Pirwadhai
          </Text>
        </View>

        <View style={[styles.statBadge, { backgroundColor: theme.surfaceAlt, borderColor: theme.border }]}>
          <Text style={{ color: theme.textDim, fontSize: 10, fontWeight: '700' }}>روانہ گاڑیاں</Text>
          <Text style={{ color: theme.accent, fontSize: 15, fontWeight: '800' }}>{departuresCount}</Text>
        </View>
      </View>

      <ScrollView contentContainerStyle={{ padding: 14, paddingBottom: 40 }}>
        {/* Quick Summary Pill */}
        <View style={[styles.pariInfoBanner, { backgroundColor: 'rgba(16, 185, 129, 0.1)', borderColor: theme.accent }]}>
          <Ionicons name="git-branch" size={18} color={theme.accent} />
          <View style={{ flex: 1 }}>
            <Text style={{ color: theme.accent, fontSize: 12, fontWeight: '800' }}>
              پاری سسٹم ایکٹو (FIFO Turn Queue)
            </Text>
            <Text style={{ color: theme.textDim, fontSize: 11, marginTop: 1 }}>
              گاڑی مکمل ہونے پر "روانہ کریں" دبائیں۔ اگلی پاری گاڑی خود بخود کال ہوگی۔
            </Text>
          </View>
        </View>

        {/* Section Title */}
        <Text style={{ color: theme.text, fontSize: 15, fontWeight: '800', marginTop: 16, marginBottom: 10 }}>
          ایکٹو بیز و گاڑیاں (Active Platform Bays)
        </Text>

        {/* Bay Cards */}
        <View style={{ gap: 12 }}>
          {bays.map((bay) => {
            const percent = Math.min(100, Math.round((bay.seatsBooked / bay.totalSeats) * 100));
            const isAlmostFull = bay.seatsBooked >= bay.totalSeats;

            return (
              <View
                key={bay.id}
                style={[
                  styles.bayCard,
                  { backgroundColor: theme.surface, borderColor: isAlmostFull ? theme.accent : theme.border },
                ]}
              >
                {/* Bay Header */}
                <View style={styles.bayCardHeader}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                    <View style={[styles.bayNumberBadge, { backgroundColor: theme.surfaceAlt }]}>
                      <Text style={{ color: theme.accent, fontSize: 12, fontWeight: '900' }}>
                        Bay {bay.bayNumber}
                      </Text>
                    </View>
                    <View>
                      <Text style={{ color: theme.text, fontSize: 14, fontWeight: '800' }}>
                        {bay.vehiclePlate}
                      </Text>
                      <Text style={{ color: theme.textDim, fontSize: 11 }}>
                        {bay.vehicleType}
                      </Text>
                    </View>
                  </View>

                  <View style={{ alignItems: 'flex-end' }}>
                    <Text style={{ color: theme.gold, fontSize: 12, fontWeight: '700' }}>
                      Rs. {bay.farePerSeat} / سیٹ
                    </Text>
                    <Text style={{ color: theme.textDim, fontSize: 10, marginTop: 2 }}>
                      {bay.departureTime}
                    </Text>
                  </View>
                </View>

                {/* Corridor */}
                <View style={styles.corridorRow}>
                  <Ionicons name="navigate-circle" size={16} color={theme.accent} />
                  <Text style={{ color: theme.text, fontSize: 12, fontWeight: '700', flex: 1 }} numberOfLines={1}>
                    {bay.corridor}
                  </Text>
                  <Text style={{ color: theme.textDim, fontSize: 11 }}>{bay.urduCorridor}</Text>
                </View>

                {/* Driver Info */}
                <View style={styles.driverRow}>
                  <Ionicons name="person" size={14} color={theme.textDim} />
                  <Text style={{ color: theme.textDim, fontSize: 11, flex: 1 }}>{bay.driverName}</Text>
                  <Text style={{ color: theme.textDim, fontSize: 11, fontFamily: 'monospace' }}>
                    {bay.driverPhone}
                  </Text>
                </View>

                {/* Seat Occupancy Bar */}
                <View style={styles.occupancyContainer}>
                  <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 4 }}>
                    <Text style={{ color: theme.textDim, fontSize: 11, fontWeight: '700' }}>سیٹیں (Seats)</Text>
                    <Text style={{ color: isAlmostFull ? theme.accent : theme.text, fontSize: 11, fontWeight: '800' }}>
                      {bay.seatsBooked} / {bay.totalSeats} ({percent}%)
                    </Text>
                  </View>
                  <View style={[styles.progressBarBg, { backgroundColor: theme.surfaceAlt }]}>
                    <View
                      style={[
                        styles.progressBarFill,
                        {
                          width: `${percent}%`,
                          backgroundColor: isAlmostFull ? theme.accent : theme.gold,
                        },
                      ]}
                    />
                  </View>
                </View>

                {/* Action Buttons for Munshi */}
                <View style={styles.bayActionsRow}>
                  <TouchableOpacity
                    style={[styles.addSeatBtn, { backgroundColor: theme.surfaceAlt, borderColor: theme.border }]}
                    onPress={() => handleAddWalkInSeat(bay.id)}
                  >
                    <Ionicons name="add-circle" size={16} color={theme.accent} />
                    <Text style={{ color: theme.text, fontSize: 12, fontWeight: '700' }}>+1 واک ان مسافر</Text>
                  </TouchableOpacity>

                  <TouchableOpacity
                    style={[
                      styles.dispatchBtn,
                      { backgroundColor: isAlmostFull ? theme.accent : theme.surfaceAlt, borderColor: theme.accent },
                    ]}
                    onPress={() => handleDispatch(bay)}
                  >
                    <Ionicons
                      name="paper-plane"
                      size={15}
                      color={isAlmostFull ? '#090D16' : theme.accent}
                    />
                    <Text
                      style={{
                        color: isAlmostFull ? '#090D16' : theme.accent,
                        fontSize: 12,
                        fontWeight: '800',
                      }}
                    >
                      گاڑی روانہ کریں
                    </Text>
                  </TouchableOpacity>
                </View>
              </View>
            );
          })}
        </View>

        {/* Next Pari Waiting Queue */}
        <Text style={{ color: theme.text, fontSize: 15, fontWeight: '800', marginTop: 22, marginBottom: 10 }}>
          اگلی پاری قطار (Waiting Stand Queue)
        </Text>
        <View style={{ gap: 8 }}>
          {waitingQueue.map((item) => (
            <View
              key={item.id}
              style={[styles.queueItem, { backgroundColor: theme.surface, borderColor: theme.border }]}
            >
              <View style={[styles.turnCircle, { backgroundColor: theme.surfaceAlt, borderColor: theme.border }]}>
                <Text style={{ color: theme.gold, fontSize: 12, fontWeight: '900' }}>#{item.turn}</Text>
              </View>
              <View style={{ flex: 1, marginLeft: 10 }}>
                <Text style={{ color: theme.text, fontSize: 13, fontWeight: '700' }}>
                  {item.plate} • {item.driver}
                </Text>
                <Text style={{ color: theme.textDim, fontSize: 11 }}>
                  {item.vehicle} • {item.route}
                </Text>
              </View>
              <View style={[styles.pariBadge, { backgroundColor: 'rgba(245, 158, 11, 0.15)', borderColor: theme.gold }]}>
                <Text style={{ color: theme.gold, fontSize: 10, fontWeight: '700' }}>انتظار پاری</Text>
              </View>
            </View>
          ))}
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  header: {
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  onlineDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#10B981',
  },
  statBadge: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 10,
    borderWidth: 1,
    alignItems: 'center',
  },
  pariInfoBanner: {
    padding: 12,
    borderRadius: 12,
    borderWidth: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  bayCard: {
    borderRadius: 16,
    borderWidth: 1,
    padding: 14,
    gap: 10,
  },
  bayCardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  bayNumberBadge: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 8,
  },
  corridorRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingVertical: 2,
  },
  driverRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  occupancyContainer: {
    marginTop: 4,
  },
  progressBarBg: {
    height: 8,
    borderRadius: 4,
    overflow: 'hidden',
  },
  progressBarFill: {
    height: '100%',
    borderRadius: 4,
  },
  bayActionsRow: {
    flexDirection: 'row',
    gap: 8,
    marginTop: 4,
  },
  addSeatBtn: {
    flex: 1,
    paddingVertical: 10,
    borderRadius: 10,
    borderWidth: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
  },
  dispatchBtn: {
    flex: 1.2,
    paddingVertical: 10,
    borderRadius: 10,
    borderWidth: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
  },
  queueItem: {
    padding: 12,
    borderRadius: 12,
    borderWidth: 1,
    flexDirection: 'row',
    alignItems: 'center',
  },
  turnCircle: {
    width: 32,
    height: 32,
    borderRadius: 16,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  pariBadge: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
    borderWidth: 1,
  },
});
