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

export interface MobileEnrolledDriver {
  id: string;
  name: string;
  phone: string;
  cnic: string;
  vehicleType: string;
  vehiclePlate: string;
  corridor: string;
  dutyStatus: 'online' | 'offline';
  driverReportedMode: 'in_adda_pari' | 'roaming';
  registeredDate: string;
  totalTrips: number;
}

export default function RosterScreen() {
  const theme = munshiTheme;

  const [drivers, setDrivers] = useState<MobileEnrolledDriver[]>([
    {
      id: 'drv_1',
      name: 'Tariq Mahmood (طارق محمود)',
      phone: '0300-5554921',
      cnic: '37405-1829101-1',
      vehicleType: 'Toyota HiAce Grand Cabin (14-S)',
      vehiclePlate: 'LES-19-4821',
      corridor: 'Pirwadhai to Peshawar Line',
      dutyStatus: 'online',
      driverReportedMode: 'in_adda_pari',
      registeredDate: '12 Oct 2026',
      totalTrips: 48,
    },
    {
      id: 'drv_2',
      name: 'Rafiq Ahmad (رفیق احمد)',
      phone: '0321-4455667',
      cnic: '37405-2918234-3',
      vehicleType: 'Toyota Coaster (28-S)',
      vehiclePlate: 'RIP-21-9921',
      corridor: 'Rawalpindi to Lahore Motorway Line',
      dutyStatus: 'online',
      driverReportedMode: 'in_adda_pari',
      registeredDate: '05 Oct 2026',
      totalTrips: 62,
    },
    {
      id: 'drv_3',
      name: 'Bilal Khan (بلال خان)',
      phone: '0345-9988112',
      cnic: '37405-4411990-7',
      vehicleType: 'Sazgar 9-Seater Qingqi',
      vehiclePlate: 'RWP-18-3011',
      corridor: 'Pirwadhai to Saddar Shuttle',
      dutyStatus: 'offline',
      driverReportedMode: 'in_adda_pari',
      registeredDate: '15 Oct 2026',
      totalTrips: 114,
    },
    {
      id: 'drv_4',
      name: 'Arshad Mehmood (ارشد محمود)',
      phone: '0333-8877665',
      cnic: '37405-3928172-5',
      vehicleType: 'Suzuki Bolan (7-Seater)',
      vehiclePlate: 'RWP-14-5541',
      corridor: 'Rawalpindi - Murree Express',
      dutyStatus: 'online',
      driverReportedMode: 'roaming',
      registeredDate: '01 Oct 2026',
      totalTrips: 31,
    },
  ]);

  const [searchQuery, setSearchQuery] = useState<string>('');
  const [showEnrollModal, setShowEnrollModal] = useState<boolean>(false);
  const [deleteConfirmDriver, setDeleteConfirmDriver] = useState<MobileEnrolledDriver | null>(null);

  // New Driver Form
  const [newName, setNewName] = useState<string>('');
  const [newPhone, setNewPhone] = useState<string>('');
  const [newPlate, setNewPlate] = useState<string>('');
  const [newVehicle, setNewVehicle] = useState<string>('Toyota HiAce Grand Cabin');
  const [newRoute, setNewRoute] = useState<string>('Pirwadhai to Peshawar Line');

  const filteredDrivers = drivers.filter(
    (d) =>
      d.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      d.vehiclePlate.toLowerCase().includes(searchQuery.toLowerCase()) ||
      d.phone.includes(searchQuery)
  );

  const handleToggleDuty = (driverId: string) => {
    setDrivers((prev) =>
      prev.map((d) => {
        if (d.id !== driverId) return d;
        const nextDuty = d.dutyStatus === 'online' ? 'offline' : 'online';
        Alert.alert(
          nextDuty === 'offline' ? 'ڈرائیور معطل (Offline)' : 'ڈرائیور فعال (Active)',
          nextDuty === 'offline'
            ? `${d.name} (${d.vehiclePlate}) کو پاری اور اڈہ بیز سے معطل کر دیا گیا ہے۔`
            : `${d.name} (${d.vehiclePlate}) اب اڈہ پاری میں شامل ہے۔`
        );
        return { ...d, dutyStatus: nextDuty };
      })
    );
  };

  const handleDeleteDriver = (driverId: string) => {
    const target = drivers.find((d) => d.id === driverId);
    if (!target) return;
    setDrivers((prev) => prev.filter((d) => d.id !== driverId));
    setDeleteConfirmDriver(null);
    Alert.alert('✓ ڈرائیور خارج کر دیا گیا', `${target.name} (${target.vehiclePlate}) کا اڈہ معاہدہ ختم کر دیا گیا۔`);
  };

  const handleEnrollNewDriver = () => {
    if (!newName.trim() || !newPlate.trim()) {
      Alert.alert('نامکمل معلومات', 'براہ کرم ڈرائیور کا نام اور گاڑی کا نمبر درج کریں۔');
      return;
    }

    const newDriver: MobileEnrolledDriver = {
      id: 'drv_' + Date.now(),
      name: newName.trim(),
      phone: newPhone.trim() || '0300-5551234',
      cnic: '37405-*******-1',
      vehicleType: newVehicle,
      vehiclePlate: newPlate.trim().toUpperCase(),
      corridor: newRoute,
      dutyStatus: 'online',
      driverReportedMode: 'in_adda_pari',
      registeredDate: 'Today',
      totalTrips: 0,
    };

    setDrivers([newDriver, ...drivers]);
    setShowEnrollModal(false);
    setNewName('');
    setNewPhone('');
    setNewPlate('');
    Alert.alert('✓ نئی گاڑی رجسٹرڈ', `${newDriver.name} (${newDriver.vehiclePlate}) کو 0% فیس کے ساتھ اڈہ روسٹر میں شامل کر لیا گیا۔`);
  };

  return (
    <SafeAreaView style={[styles.root, { backgroundColor: theme.bg }]} edges={['top']}>
      {/* Header */}
      <View style={[styles.header, { backgroundColor: theme.surface, borderColor: theme.border }]}>
        <View>
          <Text style={{ color: theme.text, fontSize: 16, fontWeight: '800' }}>
            اڈہ ڈرائیورز و فلیٹ (Stand Fleet Roster)
          </Text>
          <Text style={{ color: theme.textDim, fontSize: 11, marginTop: 2 }}>
            منشی کنٹرول: نئی گاڑی داخل کریں، معطل یا خارج کریں
          </Text>
        </View>

        <TouchableOpacity
          style={[styles.addDriverBtn, { backgroundColor: theme.accent }]}
          onPress={() => setShowEnrollModal(true)}
        >
          <Ionicons name="person-add" size={16} color="#090D16" />
          <Text style={{ color: '#090D16', fontSize: 11, fontWeight: '900' }}>نئی گاڑی</Text>
        </TouchableOpacity>
      </View>

      <ScrollView contentContainerStyle={{ padding: 14, paddingBottom: 40 }}>
        {/* Search Bar */}
        <View style={[styles.searchBox, { backgroundColor: theme.surface, borderColor: theme.border }]}>
          <Ionicons name="search" size={18} color={theme.textDim} />
          <TextInput
            placeholder="تلاش کریں: نام، نمبر پلیٹ، یا موبائل..."
            placeholderTextColor={theme.textDim}
            value={searchQuery}
            onChangeText={setSearchQuery}
            style={[styles.searchInput, { color: theme.text }]}
          />
          {searchQuery.length > 0 && (
            <TouchableOpacity onPress={() => setSearchQuery('')}>
              <Ionicons name="close-circle" size={18} color={theme.textDim} />
            </TouchableOpacity>
          )}
        </View>

        {/* Quick Fleet Counts */}
        <View style={styles.countsGrid}>
          <View style={[styles.countCard, { backgroundColor: theme.surface, borderColor: theme.border }]}>
            <Text style={{ color: theme.textDim, fontSize: 10, fontWeight: '700' }}>کل فلیٹ</Text>
            <Text style={{ color: theme.text, fontSize: 18, fontWeight: '900', marginTop: 2 }}>
              {drivers.length}
            </Text>
          </View>
          <View style={[styles.countCard, { backgroundColor: theme.surface, borderColor: theme.border }]}>
            <Text style={{ color: theme.textDim, fontSize: 10, fontWeight: '700' }}>آن ڈیوٹی اڈہ</Text>
            <Text style={{ color: theme.accent, fontSize: 18, fontWeight: '900', marginTop: 2 }}>
              {drivers.filter((d) => d.dutyStatus === 'online' && d.driverReportedMode === 'in_adda_pari').length}
            </Text>
          </View>
          <View style={[styles.countCard, { backgroundColor: theme.surface, borderColor: theme.border }]}>
            <Text style={{ color: theme.textDim, fontSize: 10, fontWeight: '700' }}>معطل / آف لائن</Text>
            <Text style={{ color: theme.danger, fontSize: 18, fontWeight: '900', marginTop: 2 }}>
              {drivers.filter((d) => d.dutyStatus === 'offline').length}
            </Text>
          </View>
          <View style={[styles.countCard, { backgroundColor: theme.surface, borderColor: theme.border }]}>
            <Text style={{ color: theme.textDim, fontSize: 10, fontWeight: '700' }}>آزاد روامنگ</Text>
            <Text style={{ color: theme.gold, fontSize: 18, fontWeight: '900', marginTop: 2 }}>
              {drivers.filter((d) => d.dutyStatus === 'online' && d.driverReportedMode === 'roaming').length}
            </Text>
          </View>
        </View>

        {/* Drivers List */}
        <Text style={{ color: theme.text, fontSize: 14, fontWeight: '800', marginTop: 14, marginBottom: 10 }}>
          رجسٹرڈ گاڑیاں ({filteredDrivers.length})
        </Text>

        <View style={{ gap: 10 }}>
          {filteredDrivers.map((driver) => {
            const isOffline = driver.dutyStatus === 'offline';
            const isRoaming = !isOffline && driver.driverReportedMode === 'roaming';

            return (
              <View
                key={driver.id}
                style={[
                  styles.driverCard,
                  {
                    backgroundColor: theme.surface,
                    borderColor: isOffline ? 'rgba(239, 68, 68, 0.4)' : theme.border,
                  },
                ]}
              >
                {/* Driver Card Header */}
                <View style={styles.driverCardTop}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                    <View
                      style={[
                        styles.driverAvatar,
                        {
                          backgroundColor: isOffline
                            ? 'rgba(239, 68, 68, 0.15)'
                            : isRoaming
                            ? 'rgba(245, 158, 11, 0.15)'
                            : 'rgba(16, 185, 129, 0.15)',
                          borderColor: isOffline ? theme.danger : isRoaming ? theme.gold : theme.accent,
                        },
                      ]}
                    >
                      <Ionicons
                        name="car"
                        size={18}
                        color={isOffline ? theme.danger : isRoaming ? theme.gold : theme.accent}
                      />
                    </View>
                    <View>
                      <Text style={{ color: theme.text, fontSize: 13, fontWeight: '800' }}>
                        {driver.name}
                      </Text>
                      <Text style={{ color: theme.accent, fontSize: 12, fontWeight: '800', marginTop: 1 }}>
                        {driver.vehiclePlate} • {driver.vehicleType}
                      </Text>
                    </View>
                  </View>

                  {/* Status Badge */}
                  <View
                    style={[
                      styles.statusBadge,
                      {
                        backgroundColor: isOffline
                          ? 'rgba(239, 68, 68, 0.15)'
                          : isRoaming
                          ? 'rgba(245, 158, 11, 0.15)'
                          : 'rgba(16, 185, 129, 0.15)',
                        borderColor: isOffline ? theme.danger : isRoaming ? theme.gold : theme.accent,
                      },
                    ]}
                  >
                    <Text
                      style={{
                        color: isOffline ? theme.danger : isRoaming ? theme.gold : theme.accent,
                        fontSize: 10,
                        fontWeight: '800',
                      }}
                    >
                      {isOffline ? 'معطل / آف لائن' : isRoaming ? 'آزاد روامنگ (Driver App)' : 'اڈہ پاری (0% Fee)'}
                    </Text>
                  </View>
                </View>

                {/* Corridor & Meta */}
                <View style={[styles.metaBox, { backgroundColor: theme.surfaceAlt }]}>
                  <Text style={{ color: theme.textDim, fontSize: 11 }}>روٹ: {driver.corridor}</Text>
                  <Text style={{ color: theme.textDim, fontSize: 11, marginTop: 2 }}>
                    فون: {driver.phone} • کل سفر: {driver.totalTrips} ٹرپس
                  </Text>
                </View>

                {/* Munshi Actions */}
                <View style={styles.driverActionsRow}>
                  <TouchableOpacity
                    style={[
                      styles.dutyToggleBtn,
                      {
                        backgroundColor: isOffline ? 'rgba(16, 185, 129, 0.15)' : 'rgba(245, 158, 11, 0.15)',
                        borderColor: isOffline ? theme.accent : theme.gold,
                      },
                    ]}
                    onPress={() => handleToggleDuty(driver.id)}
                  >
                    <Ionicons
                      name={isOffline ? 'play-circle' : 'pause-circle'}
                      size={16}
                      color={isOffline ? theme.accent : theme.gold}
                    />
                    <Text
                      style={{
                        color: isOffline ? theme.accent : theme.gold,
                        fontSize: 11,
                        fontWeight: '800',
                      }}
                    >
                      {isOffline ? 'آن ڈیوٹی کریں' : 'معطل کریں (Suspend)'}
                    </Text>
                  </TouchableOpacity>

                  <TouchableOpacity
                    style={[styles.deleteBtn, { backgroundColor: 'rgba(239, 68, 68, 0.15)', borderColor: theme.danger }]}
                    onPress={() => setDeleteConfirmDriver(driver)}
                  >
                    <Ionicons name="trash-outline" size={15} color={theme.danger} />
                    <Text style={{ color: theme.danger, fontSize: 11, fontWeight: '800' }}>خارج (Remove)</Text>
                  </TouchableOpacity>
                </View>
              </View>
            );
          })}
        </View>
      </ScrollView>

      {/* Delete Confirmation Modal */}
      {deleteConfirmDriver && (
        <Modal transparent animationType="fade">
          <View style={styles.modalBackdrop}>
            <View style={[styles.confirmModalBox, { backgroundColor: theme.surface, borderColor: theme.danger }]}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 10 }}>
                <Ionicons name="warning" size={24} color={theme.danger} />
                <Text style={{ color: theme.text, fontSize: 15, fontWeight: '900' }}>
                  اڈہ سے اخراج کی تصدیق
                </Text>
              </View>
              <Text style={{ color: theme.textDim, fontSize: 12, lineHeight: 18 }}>
                کیا آپ واقعی <Text style={{ color: '#FFFFFF', fontWeight: '800' }}>{deleteConfirmDriver.name}</Text> (
                {deleteConfirmDriver.vehiclePlate}) کو اڈہ روسٹر سے خارج کرنا چاہتے ہیں؟
                {'\n\n'}اس سے ڈرائیور کا 0% اڈہ معاہدہ منسوخ ہو جائے گا اور وہ عام آزاد روامنگ ڈرائیور بن جائے گا۔
              </Text>
              <View style={{ flexDirection: 'row', gap: 10, marginTop: 16 }}>
                <TouchableOpacity
                  style={[styles.cancelBtn, { borderColor: theme.border }]}
                  onPress={() => setDeleteConfirmDriver(null)}
                >
                  <Text style={{ color: theme.textDim, fontSize: 12, fontWeight: '700' }}>منسوخ کریں</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.confirmDeleteBtn, { backgroundColor: theme.danger }]}
                  onPress={() => handleDeleteDriver(deleteConfirmDriver.id)}
                >
                  <Text style={{ color: '#FFFFFF', fontSize: 12, fontWeight: '900' }}>خارج کریں</Text>
                </TouchableOpacity>
              </View>
            </View>
          </View>
        </Modal>
      )}

      {/* Enroll New Driver Modal */}
      {showEnrollModal && (
        <Modal transparent animationType="slide">
          <View style={styles.modalBackdrop}>
            <View style={[styles.enrollModalBox, { backgroundColor: theme.surface, borderColor: theme.border }]}>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
                <Text style={{ color: theme.text, fontSize: 16, fontWeight: '900' }}>
                  نئی گاڑی و ڈرائیور رجسٹریشن
                </Text>
                <TouchableOpacity onPress={() => setShowEnrollModal(false)}>
                  <Ionicons name="close" size={22} color={theme.textDim} />
                </TouchableOpacity>
              </View>

              <Text style={{ color: theme.textDim, fontSize: 11, marginBottom: 6 }}>ڈرائیور کا نام *</Text>
              <TextInput
                placeholder="e.g. ارشد محمود"
                placeholderTextColor={theme.textDim}
                value={newName}
                onChangeText={setNewName}
                style={[styles.modalInput, { backgroundColor: theme.surfaceAlt, borderColor: theme.border, color: theme.text }]}
              />

              <Text style={{ color: theme.textDim, fontSize: 11, marginTop: 10, marginBottom: 6 }}>گاڑی کا نمبر پلیٹ *</Text>
              <TextInput
                placeholder="e.g. LES-22-4412"
                placeholderTextColor={theme.textDim}
                autoCapitalize="characters"
                value={newPlate}
                onChangeText={setNewPlate}
                style={[styles.modalInput, { backgroundColor: theme.surfaceAlt, borderColor: theme.border, color: theme.text }]}
              />

              <Text style={{ color: theme.textDim, fontSize: 11, marginTop: 10, marginBottom: 6 }}>موبائل نمبر *</Text>
              <TextInput
                placeholder="e.g. 0300-1234567"
                placeholderTextColor={theme.textDim}
                keyboardType="phone-pad"
                value={newPhone}
                onChangeText={setNewPhone}
                style={[styles.modalInput, { backgroundColor: theme.surfaceAlt, borderColor: theme.border, color: theme.text }]}
              />

              <TouchableOpacity
                style={[styles.saveEnrollBtn, { backgroundColor: theme.accent }]}
                onPress={handleEnrollNewDriver}
              >
                <Text style={{ color: '#090D16', fontSize: 14, fontWeight: '900' }}>
                  رجسٹر کریں (Register with 0% Fee)
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
  addDriverBtn: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 10,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  searchBox: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 12,
    borderWidth: 1,
    gap: 8,
  },
  searchInput: {
    flex: 1,
    fontSize: 12,
    padding: 0,
  },
  countsGrid: {
    flexDirection: 'row',
    gap: 8,
    marginTop: 10,
  },
  countCard: {
    flex: 1,
    padding: 10,
    borderRadius: 12,
    borderWidth: 1,
    alignItems: 'center',
  },
  driverCard: {
    borderRadius: 14,
    borderWidth: 1,
    padding: 12,
    gap: 8,
  },
  driverCardTop: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  driverAvatar: {
    width: 38,
    height: 38,
    borderRadius: 10,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  statusBadge: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
    borderWidth: 1,
  },
  metaBox: {
    padding: 8,
    borderRadius: 8,
  },
  driverActionsRow: {
    flexDirection: 'row',
    gap: 8,
    marginTop: 2,
  },
  dutyToggleBtn: {
    flex: 1.5,
    paddingVertical: 8,
    borderRadius: 8,
    borderWidth: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
  },
  deleteBtn: {
    flex: 1,
    paddingVertical: 8,
    borderRadius: 8,
    borderWidth: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
  },
  modalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.85)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 16,
  },
  confirmModalBox: {
    width: '100%',
    maxWidth: 340,
    borderRadius: 18,
    padding: 18,
    borderWidth: 1,
  },
  cancelBtn: {
    flex: 1,
    paddingVertical: 10,
    borderRadius: 10,
    borderWidth: 1,
    alignItems: 'center',
  },
  confirmDeleteBtn: {
    flex: 1.2,
    paddingVertical: 10,
    borderRadius: 10,
    alignItems: 'center',
  },
  enrollModalBox: {
    width: '100%',
    maxWidth: 360,
    borderRadius: 18,
    padding: 18,
    borderWidth: 1,
  },
  modalInput: {
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 8,
    borderWidth: 1,
    fontSize: 13,
  },
  saveEnrollBtn: {
    marginTop: 16,
    paddingVertical: 12,
    borderRadius: 10,
    alignItems: 'center',
  },
});
