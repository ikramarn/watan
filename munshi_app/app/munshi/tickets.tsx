import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  TextInput,
  Alert,
  Modal,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { munshiTheme } from '../../src/lib/theme';

interface RouteOption {
  id: string;
  name: string;
  urdu: string;
  bay: number;
  plate: string;
  fare: number;
  totalSeats: number;
  occupiedSeats: number[];
}

export default function TicketsScreen() {
  const theme = munshiTheme;

  const routes: RouteOption[] = [
    {
      id: 'pesh',
      name: 'Pirwadhai to Peshawar',
      urdu: 'پیرودھائی تا پشاور',
      bay: 2,
      plate: 'LES-19-4821',
      fare: 450,
      totalSeats: 14,
      occupiedSeats: [1, 2, 4, 5, 8, 9, 10, 11, 12, 13, 14],
    },
    {
      id: 'lhr',
      name: 'Rawalpindi to Lahore (M-2)',
      urdu: 'راولپنڈی تا لاہور',
      bay: 1,
      plate: 'RIP-21-9921',
      fare: 850,
      totalSeats: 28,
      occupiedSeats: [1, 2, 3, 4, 7, 8, 9, 10, 12, 14, 15, 16, 20, 21, 22, 23, 24, 25, 26, 27],
    },
    {
      id: 'saddar',
      name: 'Pirwadhai to Saddar Shuttle',
      urdu: 'پیرودھائی تا صدر شٹل',
      bay: 3,
      plate: 'RWP-18-3011',
      fare: 40,
      totalSeats: 9,
      occupiedSeats: [1, 2, 3, 5, 6, 7],
    },
  ];

  const [selectedRoute, setSelectedRoute] = useState<RouteOption>(routes[0]);
  const [selectedSeats, setSelectedSeats] = useState<number[]>([]);
  const [passengerName, setPassengerName] = useState<string>('');
  const [passengerPhone, setPassengerPhone] = useState<string>('');
  const [showQrScanModal, setShowQrScanModal] = useState<boolean>(false);
  const [issuedTicketModal, setIssuedTicketModal] = useState<any>(null);

  const toggleSeat = (seatNum: number) => {
    if (selectedRoute.occupiedSeats.includes(seatNum)) return;
    if (selectedSeats.includes(seatNum)) {
      setSelectedSeats(selectedSeats.filter((s) => s !== seatNum));
    } else {
      setSelectedSeats([...selectedSeats, seatNum]);
    }
  };

  const handleIssueTicket = () => {
    if (selectedSeats.length === 0) {
      Alert.alert('سیٹ منتخب کریں', 'براہ کرم پرچی جاری کرنے کے لیے کم از کم ایک سیٹ کا انتخاب کریں۔');
      return;
    }

    const totalFare = selectedSeats.length * selectedRoute.fare;
    const code = 'WTN-' + Math.floor(1000 + Math.random() * 9000);

    const ticket = {
      code,
      passenger: passengerName.trim() || 'Walk-in Passenger (واک ان)',
      phone: passengerPhone.trim() || 'Counter Cash',
      route: selectedRoute.name,
      bay: selectedRoute.bay,
      plate: selectedRoute.plate,
      seats: [...selectedSeats],
      totalFare,
      time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
    };

    setIssuedTicketModal(ticket);
    // Mark seats as occupied
    setSelectedRoute({
      ...selectedRoute,
      occupiedSeats: [...selectedRoute.occupiedSeats, ...selectedSeats],
    });
    setSelectedSeats([]);
    setPassengerName('');
    setPassengerPhone('');
  };

  const handleSimulateQrScan = (tokenCode: string) => {
    setShowQrScanModal(false);
    Alert.alert(
      '✓ QR Ticket Verified (آن لائن ٹوکن تصدیق شدہ)',
      `Token: ${tokenCode}\nPassenger: Muhammad Bilal (0300-8812991)\nSeats: 3, 4\nRoute: ${selectedRoute.name}\nStatus: Cash Collected at Bay #2 Counter.`,
      [{ text: 'Board Passenger (سوار کریں)' }]
    );
  };

  return (
    <SafeAreaView style={[styles.root, { backgroundColor: theme.bg }]} edges={['top']}>
      {/* Top Header */}
      <View style={[styles.header, { backgroundColor: theme.surface, borderColor: theme.border }]}>
        <View>
          <Text style={{ color: theme.text, fontSize: 16, fontWeight: '800' }}>
            پرچی و کاؤنٹر ٹکٹنگ (Munshi Ticketing)
          </Text>
          <Text style={{ color: theme.textDim, fontSize: 11, marginTop: 2 }}>
            واک ان مسافر پرچی اور آن لائن QR ٹوکن اسکینر
          </Text>
        </View>

        <TouchableOpacity
          style={[styles.qrScanBtn, { backgroundColor: theme.surfaceAlt, borderColor: theme.accent }]}
          onPress={() => setShowQrScanModal(true)}
        >
          <Ionicons name="qr-code-outline" size={18} color={theme.accent} />
          <Text style={{ color: theme.accent, fontSize: 11, fontWeight: '800' }}>Scan QR</Text>
        </TouchableOpacity>
      </View>

      <ScrollView contentContainerStyle={{ padding: 14, paddingBottom: 40 }}>
        {/* Route Selector Chips */}
        <Text style={{ color: theme.textDim, fontSize: 11, fontWeight: '700', textTransform: 'uppercase', marginBottom: 8 }}>
          روٹ کا انتخاب (Select Route)
        </Text>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8, marginBottom: 14 }}>
          {routes.map((r) => {
            const isSelected = selectedRoute.id === r.id;
            return (
              <TouchableOpacity
                key={r.id}
                style={[
                  styles.routeChip,
                  {
                    backgroundColor: isSelected ? theme.accent : theme.surface,
                    borderColor: isSelected ? theme.accent : theme.border,
                  },
                ]}
                onPress={() => {
                  setSelectedRoute(r);
                  setSelectedSeats([]);
                }}
              >
                <Text style={{ color: isSelected ? '#090D16' : theme.text, fontSize: 12, fontWeight: '800' }}>
                  {r.name}
                </Text>
                <Text style={{ color: isSelected ? '#090D16' : theme.textDim, fontSize: 10, marginTop: 1 }}>
                  Bay #{r.bay} • Rs. {r.fare}
                </Text>
              </TouchableOpacity>
            );
          })}
        </ScrollView>

        {/* Assigned Vehicle Pill */}
        <View style={[styles.activeVehicleBanner, { backgroundColor: theme.surface, borderColor: theme.border }]}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
            <Ionicons name="bus" size={20} color={theme.accent} />
            <View>
              <Text style={{ color: theme.text, fontSize: 13, fontWeight: '800' }}>
                {selectedRoute.plate} (Bay #{selectedRoute.bay})
              </Text>
              <Text style={{ color: theme.textDim, fontSize: 11 }}>
                کرایہ: Rs. {selectedRoute.fare} فی سواری • دستیاب: {selectedRoute.totalSeats - selectedRoute.occupiedSeats.length} سیٹیں
              </Text>
            </View>
          </View>
        </View>

        {/* Interactive Seat Layout Grid */}
        <View style={[styles.seatBox, { backgroundColor: theme.surface, borderColor: theme.border }]}>
          <View style={styles.seatBoxHeader}>
            <Text style={{ color: theme.text, fontSize: 13, fontWeight: '800' }}>
              سیٹ سلیکٹر (Seat Selection)
            </Text>
            <View style={{ flexDirection: 'row', gap: 10 }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                <View style={[styles.legendBox, { backgroundColor: theme.surfaceAlt }]} />
                <Text style={{ color: theme.textDim, fontSize: 10 }}>خالی</Text>
              </View>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                <View style={[styles.legendBox, { backgroundColor: theme.accent }]} />
                <Text style={{ color: theme.textDim, fontSize: 10 }}>منتخب</Text>
              </View>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                <View style={[styles.legendBox, { backgroundColor: '#334155' }]} />
                <Text style={{ color: theme.textDim, fontSize: 10 }}>بکڈ</Text>
              </View>
            </View>
          </View>

          {/* Seat Grid */}
          <View style={styles.seatGrid}>
            {Array.from({ length: selectedRoute.totalSeats }, (_, i) => i + 1).map((seatNum) => {
              const isOccupied = selectedRoute.occupiedSeats.includes(seatNum);
              const isSelected = selectedSeats.includes(seatNum);

              return (
                <TouchableOpacity
                  key={seatNum}
                  disabled={isOccupied}
                  onPress={() => toggleSeat(seatNum)}
                  style={[
                    styles.seatBtn,
                    {
                      backgroundColor: isOccupied
                        ? '#1E293B'
                        : isSelected
                        ? theme.accent
                        : theme.surfaceAlt,
                      borderColor: isSelected ? theme.accent : theme.border,
                      opacity: isOccupied ? 0.45 : 1,
                    },
                  ]}
                >
                  <Ionicons
                    name="person"
                    size={14}
                    color={isSelected ? '#090D16' : isOccupied ? '#64748B' : theme.text}
                  />
                  <Text
                    style={{
                      color: isSelected ? '#090D16' : isOccupied ? '#64748B' : theme.text,
                      fontSize: 11,
                      fontWeight: '800',
                      marginTop: 2,
                    }}
                  >
                    {seatNum}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>
        </View>

        {/* Passenger Info (Optional) */}
        <View style={[styles.inputsContainer, { backgroundColor: theme.surface, borderColor: theme.border }]}>
          <Text style={{ color: theme.textDim, fontSize: 11, fontWeight: '700', textTransform: 'uppercase' }}>
            مسافر تفصیلات (اختیاری)
          </Text>
          <View style={{ flexDirection: 'row', gap: 8, marginTop: 8 }}>
            <TextInput
              placeholder="نام (e.g. احمد خان)"
              placeholderTextColor={theme.textDim}
              value={passengerName}
              onChangeText={setPassengerName}
              style={[styles.inputField, { backgroundColor: theme.surfaceAlt, borderColor: theme.border, color: theme.text }]}
            />
            <TextInput
              placeholder="موبائل (e.g. 0300-1234567)"
              placeholderTextColor={theme.textDim}
              keyboardType="phone-pad"
              value={passengerPhone}
              onChangeText={setPassengerPhone}
              style={[styles.inputField, { backgroundColor: theme.surfaceAlt, borderColor: theme.border, color: theme.text }]}
            />
          </View>
        </View>

        {/* Fare Summary & Print Button */}
        <View style={[styles.summaryCard, { backgroundColor: theme.surfaceAlt, borderColor: theme.border }]}>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
            <View>
              <Text style={{ color: theme.textDim, fontSize: 11 }}>منتخب سیٹیں: {selectedSeats.length > 0 ? selectedSeats.join(', ') : 'کوئی نہیں'}</Text>
              <Text style={{ color: theme.accent, fontSize: 24, fontWeight: '900', marginTop: 2 }}>
                Rs. {(selectedSeats.length * selectedRoute.fare).toLocaleString()}
              </Text>
            </View>
            <View style={{ alignItems: 'flex-end' }}>
              <Text style={{ color: theme.gold, fontSize: 11, fontWeight: '700' }}>نقدی وصولی (Cash Counter)</Text>
              <Text style={{ color: theme.textDim, fontSize: 10, marginTop: 2 }}>58mm بلوٹوتھ تھرمل پرنٹر</Text>
            </View>
          </View>

          <TouchableOpacity
            style={[
              styles.issueParchiBtn,
              {
                backgroundColor: selectedSeats.length > 0 ? theme.accent : theme.border,
              },
            ]}
            disabled={selectedSeats.length === 0}
            onPress={handleIssueTicket}
          >
            <Ionicons name="print" size={18} color={selectedSeats.length > 0 ? '#090D16' : '#64748B'} />
            <Text
              style={{
                color: selectedSeats.length > 0 ? '#090D16' : '#64748B',
                fontSize: 14,
                fontWeight: '900',
                letterSpacing: 0.5,
              }}
            >
              پرچی جاری کریں (Print Thermal Parchi)
            </Text>
          </TouchableOpacity>
        </View>
      </ScrollView>

      {/* Issued Ticket Parchi Modal */}
      {issuedTicketModal && (
        <Modal transparent animationType="slide">
          <View style={styles.modalBackdrop}>
            <View style={[styles.parchiReceipt, { backgroundColor: '#FFFFFF' }]}>
              <View style={{ alignItems: 'center', borderBottomWidth: 1, borderBottomColor: '#CBD5E1', paddingBottom: 10 }}>
                <Text style={{ color: '#0F172A', fontSize: 16, fontWeight: '900' }}>وطن اڈہ ٹرانسپورٹ سروس</Text>
                <Text style={{ color: '#475569', fontSize: 11, fontWeight: '700' }}>AL-MAKKAH STAND PIRWADHAI (#ISB-001)</Text>
                <Text style={{ color: '#64748B', fontSize: 10, marginTop: 2 }}>58mm Official Platform Ticket</Text>
              </View>

              <View style={{ marginVertical: 12, gap: 4 }}>
                <View style={styles.parchiRow}>
                  <Text style={styles.parchiLabel}>TICKET #:</Text>
                  <Text style={styles.parchiVal}>{issuedTicketModal.code}</Text>
                </View>
                <View style={styles.parchiRow}>
                  <Text style={styles.parchiLabel}>ROUTE:</Text>
                  <Text style={styles.parchiVal}>{issuedTicketModal.route}</Text>
                </View>
                <View style={styles.parchiRow}>
                  <Text style={styles.parchiLabel}>BAY / VAN:</Text>
                  <Text style={styles.parchiVal}>Bay #{issuedTicketModal.bay} ({issuedTicketModal.plate})</Text>
                </View>
                <View style={styles.parchiRow}>
                  <Text style={styles.parchiLabel}>SEATS:</Text>
                  <Text style={[styles.parchiVal, { color: '#059669', fontSize: 14 }]}>
                    {issuedTicketModal.seats.join(', ')}
                  </Text>
                </View>
                <View style={styles.parchiRow}>
                  <Text style={styles.parchiLabel}>TOTAL CASH:</Text>
                  <Text style={[styles.parchiVal, { fontSize: 16, fontWeight: '900' }]}>
                    Rs. {issuedTicketModal.totalFare}
                  </Text>
                </View>
                <View style={styles.parchiRow}>
                  <Text style={styles.parchiLabel}>TIME:</Text>
                  <Text style={styles.parchiVal}>{issuedTicketModal.time}</Text>
                </View>
              </View>

              <View style={{ borderTopWidth: 1, borderTopColor: '#CBD5E1', paddingTop: 8, alignItems: 'center' }}>
                <Text style={{ color: '#64748B', fontSize: 9 }}>Helpline: 051-111-WATAN (92826)</Text>
                <Text style={{ color: '#059669', fontSize: 10, fontWeight: '700', marginTop: 2 }}>✓ Bluetooth Thermal Printed</Text>
              </View>

              <TouchableOpacity
                style={styles.closeReceiptBtn}
                onPress={() => setIssuedTicketModal(null)}
              >
                <Text style={{ color: '#FFFFFF', fontSize: 13, fontWeight: '800' }}>Done & Next Passenger</Text>
              </TouchableOpacity>
            </View>
          </View>
        </Modal>
      )}

      {/* QR Scanner Modal Simulator */}
      {showQrScanModal && (
        <Modal transparent animationType="fade">
          <View style={styles.modalBackdrop}>
            <View style={[styles.qrModalBox, { backgroundColor: theme.surface, borderColor: theme.border }]}>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                  <Ionicons name="camera" size={20} color={theme.accent} />
                  <Text style={{ color: theme.text, fontSize: 15, fontWeight: '800' }}>اسکین مسافر ٹوکن QR</Text>
                </View>
                <TouchableOpacity onPress={() => setShowQrScanModal(false)}>
                  <Ionicons name="close" size={22} color={theme.textDim} />
                </TouchableOpacity>
              </View>

              <View style={[styles.cameraViewfinder, { borderColor: theme.accent }]}>
                <Ionicons name="scan-outline" size={72} color={theme.accent} />
                <Text style={{ color: theme.textDim, fontSize: 11, marginTop: 8 }}>
                  مسافر کا ڈیجیٹل ٹوکن کیمرے کے سامنے لائیں
                </Text>
              </View>

              <Text style={{ color: theme.textDim, fontSize: 11, textAlign: 'center', marginVertical: 6 }}>
                Simulate Camera Scans:
              </Text>
              <TouchableOpacity
                style={[styles.simScanPill, { backgroundColor: theme.surfaceAlt, borderColor: theme.border }]}
                onPress={() => handleSimulateQrScan('WTN-7741-PESH')}
              >
                <Ionicons name="checkmark-circle" size={16} color={theme.accent} />
                <Text style={{ color: theme.text, fontSize: 12, fontWeight: '700' }}>
                  Scan: WTN-7741 (Seats: 3, 4 - Peshawar)
                </Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={[styles.simScanPill, { backgroundColor: theme.surfaceAlt, borderColor: theme.border, marginTop: 6 }]}
                onPress={() => handleSimulateQrScan('WTN-8912-LHR')}
              >
                <Ionicons name="checkmark-circle" size={16} color={theme.gold} />
                <Text style={{ color: theme.text, fontSize: 12, fontWeight: '700' }}>
                  Scan: WTN-8912 (Seats: 12 - Lahore Coaster)
                </Text>
              </TouchableOpacity>
            </View>
          </View>
        </Modal>
      )}
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
  qrScanBtn: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 10,
    borderWidth: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  routeChip: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 12,
    borderWidth: 1,
  },
  activeVehicleBanner: {
    padding: 12,
    borderRadius: 12,
    borderWidth: 1,
    marginBottom: 12,
  },
  seatBox: {
    padding: 14,
    borderRadius: 16,
    borderWidth: 1,
    marginBottom: 12,
  },
  seatBoxHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  legendBox: {
    width: 10,
    height: 10,
    borderRadius: 3,
  },
  seatGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    justifyContent: 'center',
  },
  seatBtn: {
    width: 52,
    height: 52,
    borderRadius: 10,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  inputsContainer: {
    padding: 14,
    borderRadius: 14,
    borderWidth: 1,
    marginBottom: 12,
  },
  inputField: {
    flex: 1,
    paddingHorizontal: 12,
    paddingVertical: 9,
    borderRadius: 8,
    borderWidth: 1,
    fontSize: 12,
  },
  summaryCard: {
    padding: 16,
    borderRadius: 16,
    borderWidth: 1,
    gap: 12,
  },
  issueParchiBtn: {
    paddingVertical: 14,
    borderRadius: 12,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  modalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.85)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 16,
  },
  parchiReceipt: {
    width: '100%',
    maxWidth: 340,
    borderRadius: 16,
    padding: 18,
  },
  parchiRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  parchiLabel: {
    color: '#64748B',
    fontSize: 11,
    fontWeight: '700',
  },
  parchiVal: {
    color: '#0F172A',
    fontSize: 12,
    fontWeight: '800',
  },
  closeReceiptBtn: {
    marginTop: 14,
    backgroundColor: '#0F172A',
    paddingVertical: 12,
    borderRadius: 10,
    alignItems: 'center',
  },
  qrModalBox: {
    width: '100%',
    maxWidth: 360,
    borderRadius: 20,
    padding: 18,
    borderWidth: 1,
  },
  cameraViewfinder: {
    height: 180,
    borderRadius: 14,
    borderWidth: 2,
    borderStyle: 'dashed',
    alignItems: 'center',
    justifyContent: 'center',
    marginVertical: 14,
  },
  simScanPill: {
    padding: 10,
    borderRadius: 10,
    borderWidth: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
});
