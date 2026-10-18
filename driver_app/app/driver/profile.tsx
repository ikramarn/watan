import React, { useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Alert, ScrollView, Switch, Modal } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { getTheme } from '../../src/lib/theme';
import { useAuth } from '../../src/lib/auth';
import { api } from '../../src/lib/api';

export default function DriverProfile() {
  const theme = getTheme('driver');
  const { user, logout } = useAuth();
  const router = useRouter();

  const [operatingMode, setOperatingMode] = useState<'adda_pari' | 'roaming'>('adda_pari');
  const [isAddaEnrolled, setIsAddaEnrolled] = useState(true);
  const [showQrModal, setShowQrModal] = useState(false);

  const toggleOperatingMode = () => {
    if (operatingMode === 'adda_pari') {
      setOperatingMode('roaming');
      Alert.alert(
        'Switched to Independent Roaming',
        'You are now operating as an independent driver (like Uber / InDrive). You can accept private doorstep hails across the city with 10% platform fee.'
      );
    } else {
      if (!isAddaEnrolled) {
        Alert.alert(
          'Adda Enrollment Required',
          'To enter the Adda Pari queue, an Adda Munshi must first register your vehicle at the terminal counter.'
        );
        return;
      }
      setOperatingMode('adda_pari');
      Alert.alert(
        'Switched to Adda Pari Queue',
        'You are now in Pirwadhai Adda Bay #3 queue. 0% platform fee on all 14-seater departures.'
      );
    }
  };

  return (
    <SafeAreaView style={[styles.root, { backgroundColor: theme.bg }]} edges={['top']} testID="driver-profile">
      <ScrollView contentContainerStyle={{ paddingBottom: 40 }} showsVerticalScrollIndicator={false}>
        <View style={{ padding: 20, paddingBottom: 12 }}>
          <Text style={{ color: theme.text, fontSize: 28, fontWeight: '800', letterSpacing: -0.8 }}>Driver Profile</Text>
          <Text style={{ color: theme.textDim, fontSize: 13, marginTop: 2 }}>ڈرائیور پروفائل · Watan Verified Operator</Text>
        </View>

        {/* User Card */}
        <View style={[styles.userCard, { backgroundColor: theme.surface, borderColor: theme.border }]}>
          <View style={[styles.avatar, { backgroundColor: '#00683725', borderColor: '#59DF89', borderWidth: 1 }]}>
            <Ionicons name="person" size={28} color="#59DF89" />
          </View>
          <View style={{ flex: 1 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
              <Text style={{ color: theme.text, fontSize: 19, fontWeight: '800' }}>{user?.name || 'Tariq Mahmood'}</Text>
              <View style={styles.verifiedBadge}>
                <Ionicons name="checkmark-circle" size={14} color="#59DF89" />
                <Text style={styles.verifiedText}>Verified</Text>
              </View>
            </View>
            <Text style={{ color: theme.textDim, fontSize: 12, marginTop: 2 }}>
              ★ {(user?.rating ?? 4.9).toFixed?.(1)} (342 trips) · CNIC: 37405-*******-1
            </Text>
            <View style={{ flexDirection: 'row', gap: 6, marginTop: 8 }}>
              <View style={{ backgroundColor: '#00683725', paddingHorizontal: 8, paddingVertical: 2, borderRadius: 6, borderWidth: 1, borderColor: '#59DF8940' }}>
                <Text style={{ color: '#59DF89', fontSize: 10, fontWeight: '700' }}>
                  {isAddaEnrolled ? 'Pirwadhai Stand Member' : 'Independent Driver'}
                </Text>
              </View>
            </View>
          </View>
        </View>

        {/* Dual Mode Controller Card */}
        <View style={[styles.modeCard, { backgroundColor: theme.surface, borderColor: theme.border }]}>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
            <View style={{ flex: 1 }}>
              <Text style={{ color: theme.textDim, fontSize: 11, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.6 }}>
                Active Driver Mode
              </Text>
              <Text style={{ color: operatingMode === 'adda_pari' ? '#59DF89' : '#FACC15', fontSize: 16, fontWeight: '800', marginTop: 2 }}>
                {operatingMode === 'adda_pari' ? 'Adda Pari Queue (0% Platform Fee)' : 'Independent Roaming (10% Platform Fee)'}
              </Text>
            </View>
            <Switch
              value={operatingMode === 'adda_pari'}
              onValueChange={toggleOperatingMode}
              trackColor={{ false: '#374151', true: '#006837' }}
              thumbColor={operatingMode === 'adda_pari' ? '#59DF89' : '#FACC15'}
            />
          </View>
          <Text style={{ color: theme.textDim, fontSize: 12, marginTop: 8, lineHeight: 17 }}>
            {operatingMode === 'adda_pari'
              ? 'Serving Pirwadhai Bay #3 roster. 100% of seat fares retained (0% Watan commission).'
              : 'Operating as independent city driver (Uber / InDrive mode). Accept private doorstep hails anywhere.'}
          </Text>
        </View>

        {/* Registered Vehicle Card */}
        <View style={[styles.vehicleCard, { backgroundColor: theme.surface, borderColor: theme.border }]}>
          <Text style={{ color: theme.textDim, fontSize: 11, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.6 }}>
            Registered Fleet Vehicle
          </Text>
          <Text style={{ color: theme.text, fontSize: 18, fontWeight: '800', marginTop: 4 }}>
            {user?.vehicle_make || 'Toyota HiAce Grand Cabin (14-Seater)'}
          </Text>
          <Text style={{ color: theme.textDim, fontSize: 12, marginTop: 2 }}>
            Plate: {user?.vehicle_plate || 'LES-19-4821'} · Commercial Route Permit Verified
          </Text>
          <View style={{ flexDirection: 'row', gap: 6, marginTop: 8 }}>
            <View style={[styles.tag, { backgroundColor: '#1E2925' }]}>
              <Text style={{ color: '#869487', fontSize: 10, fontWeight: '600' }}>Engine: 3.0L Diesel</Text>
            </View>
            <View style={[styles.tag, { backgroundColor: '#1E2925' }]}>
              <Text style={{ color: '#869487', fontSize: 10, fontWeight: '600' }}>Fitness: Valid 2027</Text>
            </View>
          </View>
        </View>

        {/* Stand Fleet QR Button */}
        <TouchableOpacity
          onPress={() => setShowQrModal(true)}
          style={[styles.qrButtonCard, { backgroundColor: '#00683720', borderColor: '#59DF89' }]}
        >
          <View style={styles.qrIconBox}>
            <Ionicons name="qr-code" size={24} color="#59DF89" />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={{ color: '#59DF89', fontSize: 14, fontWeight: '800' }}>
              Adda Fleet Enrollment Pass (اڈہ رجسٹریشن پاس)
            </Text>
            <Text style={{ color: '#869487', fontSize: 11, marginTop: 2 }}>
              Tap to show Driver Pass QR & CNIC to Stand Munshi
            </Text>
          </View>
          <Ionicons name="chevron-forward" size={18} color="#59DF89" />
        </TouchableOpacity>

        {/* Verified Documents Checklist */}
        <View style={{ paddingHorizontal: 20, marginTop: 14 }}>
          <Text style={{ color: theme.textDim, fontSize: 12, fontWeight: '700', textTransform: 'uppercase', marginBottom: 8 }}>
            Verified Documents (دستاویزات کی تصدیق)
          </Text>
          <View style={[styles.docCard, { backgroundColor: theme.surface, borderColor: theme.border }]}>
            {[
              { title: 'NADRA CNIC Verification', sub: '37405-*******-1 (Verified)', ok: true },
              { title: 'Commercial Driving License (LTV/HTV)', sub: 'Islamabad Traffic Police (Valid)', ok: true },
              { title: 'Vehicle Fitness & Route Permit', sub: 'Regional Transport Authority (RTA)', ok: true },
              { title: 'Adda Stand Pari Enrollment', sub: 'Al-Makkah Wagon Stand Pirwadhai', ok: isAddaEnrolled },
            ].map((d, i) => (
              <View key={d.title} style={[styles.docRow, i > 0 && { borderTopWidth: 1, borderTopColor: theme.border }]}>
                <Ionicons name="checkmark-circle" size={18} color="#59DF89" />
                <View style={{ flex: 1 }}>
                  <Text style={{ color: theme.text, fontSize: 13, fontWeight: '700' }}>{d.title}</Text>
                  <Text style={{ color: theme.textDim, fontSize: 11 }}>{d.sub}</Text>
                </View>
              </View>
            ))}
          </View>
        </View>

        {/* Quick Links */}
        <View style={{ padding: 20, gap: 8 }}>
          {[
            { icon: 'wallet-outline', label: 'Payout Channels · Raast / JazzCash / Adda Cash' },
            { icon: 'shield-checkmark-outline', label: 'Stand Safety & Queue Guidelines' },
            { icon: 'call-outline', label: 'Emergency: 15 Police & 1122 Rescue' },
            { icon: 'help-circle-outline', label: 'Adda Munshi Desk & 24/7 Helpline' },
          ].map((r) => (
            <View key={r.label} style={[styles.row, { backgroundColor: theme.surface, borderColor: theme.border }]}>
              <Ionicons name={r.icon as any} size={20} color="#59DF89" />
              <Text style={{ color: theme.text, fontSize: 14, flex: 1, fontWeight: '600' }}>{r.label}</Text>
              <Ionicons name="chevron-forward" size={16} color={theme.textFaint} />
            </View>
          ))}

          <TouchableOpacity
            testID="logout-btn"
            onPress={async () => { await logout(); router.replace('/'); }}
            style={[styles.logoutBtn, { backgroundColor: theme.surfaceAlt, marginTop: 8 }]}
          >
            <Text style={{ color: theme.danger, fontWeight: '700', fontSize: 15 }}>Sign out (لاگ آؤٹ)</Text>
          </TouchableOpacity>
        </View>
      </ScrollView>

      {/* Driver Pass QR Modal for Munshi Stand Enrollment */}
      <Modal visible={showQrModal} animationType="slide" transparent>
        <View style={styles.modalOverlay}>
          <View style={[styles.passModal, { backgroundColor: theme.surface, borderColor: '#59DF89' }]}>
            <View style={styles.passHeader}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                <Text style={{ fontSize: 18 }}>🇵🇰</Text>
                <View>
                  <Text style={{ color: '#59DF89', fontSize: 15, fontWeight: '900' }}>WATAN CAPTAIN PASS</Text>
                  <Text style={{ color: '#869487', fontSize: 11 }}>وطـن ڈرائیور رجسٹریشن پاس</Text>
                </View>
              </View>
              <TouchableOpacity onPress={() => setShowQrModal(false)} style={styles.closeBtn}>
                <Ionicons name="close" size={20} color={theme.text} />
              </TouchableOpacity>
            </View>

            <View style={{ padding: 20, alignItems: 'center', gap: 12 }}>
              <View style={styles.qrContainer}>
                <Ionicons name="qr-code" size={130} color="#004D27" />
                <Text style={styles.qrHint}>Scan at Adda Stand POS Terminal</Text>
              </View>

              <View style={[styles.infoBox, { backgroundColor: theme.surfaceAlt }]}>
                <View style={styles.infoRow}>
                  <Text style={{ color: theme.textDim, fontSize: 12 }}>Driver Name:</Text>
                  <Text style={{ color: theme.text, fontSize: 13, fontWeight: '700' }}>{user?.name || 'Tariq Mahmood'}</Text>
                </View>
                <View style={styles.infoRow}>
                  <Text style={{ color: theme.textDim, fontSize: 12 }}>NADRA CNIC:</Text>
                  <Text style={{ color: theme.text, fontSize: 13, fontWeight: '700' }}>37405-1829101-1</Text>
                </View>
                <View style={styles.infoRow}>
                  <Text style={{ color: theme.textDim, fontSize: 12 }}>Vehicle Plate:</Text>
                  <Text style={{ color: '#59DF89', fontSize: 14, fontWeight: '800' }}>{user?.vehicle_plate || 'LES-19-4821'}</Text>
                </View>
                <View style={styles.infoRow}>
                  <Text style={{ color: theme.textDim, fontSize: 12 }}>Vehicle Type:</Text>
                  <Text style={{ color: theme.text, fontSize: 12, fontWeight: '600' }}>Toyota HiAce Grand Cabin (14-S)</Text>
                </View>
              </View>

              <Text style={styles.explainerText}>
                Show this code or CNIC to the Adda Munshi at the Stand POS Counter. Once enrolled, you receive Stand departures with 0% Watan platform commission.
              </Text>

              <TouchableOpacity
                onPress={() => setShowQrModal(false)}
                style={[styles.dismissBtn, { backgroundColor: '#006837' }]}
              >
                <Text style={{ color: '#FFFFFF', fontWeight: '800', fontSize: 14 }}>Close Pass (بند کریں)</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  userCard: { marginHorizontal: 20, padding: 18, borderRadius: 22, borderWidth: 1, flexDirection: 'row', alignItems: 'center', gap: 14 },
  avatar: { width: 54, height: 54, borderRadius: 27, alignItems: 'center', justifyContent: 'center' },
  verifiedBadge: { flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: '#00683725', paddingHorizontal: 6, paddingVertical: 2, borderRadius: 8 },
  verifiedText: { color: '#59DF89', fontSize: 11, fontWeight: '700' },
  modeCard: { marginHorizontal: 20, marginTop: 12, padding: 18, borderRadius: 22, borderWidth: 1 },
  vehicleCard: { marginHorizontal: 20, marginTop: 12, padding: 18, borderRadius: 22, borderWidth: 1 },
  tag: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 6 },
  qrButtonCard: {
    marginHorizontal: 20,
    marginTop: 12,
    padding: 14,
    borderRadius: 18,
    borderWidth: 1.5,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  qrIconBox: {
    width: 44,
    height: 44,
    borderRadius: 12,
    backgroundColor: '#00683740',
    alignItems: 'center',
    justifyContent: 'center',
  },
  docCard: { borderRadius: 18, borderWidth: 1, paddingHorizontal: 14 },
  docRow: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 10 },
  row: { padding: 16, borderRadius: 16, borderWidth: 1, flexDirection: 'row', alignItems: 'center', gap: 12 },
  logoutBtn: { height: 50, borderRadius: 16, alignItems: 'center', justifyContent: 'center' },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.75)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  passModal: {
    width: '100%',
    maxWidth: 400,
    borderRadius: 24,
    borderWidth: 1.5,
    overflow: 'hidden',
  },
  passHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 16,
    backgroundColor: '#151D1B',
    borderBottomWidth: 1,
    borderBottomColor: '#27332F',
  },
  closeBtn: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: '#27332F',
    alignItems: 'center',
    justifyContent: 'center',
  },
  qrContainer: {
    backgroundColor: '#F8FAF5',
    padding: 16,
    borderRadius: 20,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#E1E3DE',
  },
  qrHint: { color: '#004D27', fontSize: 11, fontWeight: '700', marginTop: 6 },
  infoBox: {
    width: '100%',
    padding: 14,
    borderRadius: 16,
    gap: 8,
  },
  infoRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  explainerText: {
    color: '#869487',
    fontSize: 11,
    textAlign: 'center',
    lineHeight: 16,
    paddingHorizontal: 10,
  },
  dismissBtn: {
    width: '100%',
    height: 48,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 4,
  },
});

