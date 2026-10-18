import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Alert, ScrollView } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { getTheme } from '../../src/lib/theme';
import { useAuth } from '../../src/lib/auth';
import { api } from '../../src/lib/api';

export default function PassengerProfile() {
  const theme = getTheme('passenger');
  const { user, logout } = useAuth();
  const router = useRouter();

  const rows = [
    { icon: 'wallet-outline', label: 'Payment Channels · Raast / JazzCash / Easypaisa / Cash' },
    { icon: 'star-outline', label: `Passenger Rating · ${user?.rating?.toFixed?.(1) ?? '4.9'} ★ (Verified)` },
    { icon: 'bus-outline', label: 'Favorite Adda Stands & Daily Commutes (محفوظ اڈے)' },
    { icon: 'shield-checkmark-outline', label: 'Safety & Live Family Tracking (خاندانی تحفظ)' },
    { icon: 'call-outline', label: 'Emergency: 15 Police & 1122 Rescue' },
    { icon: 'help-circle-outline', label: 'Watan 24/7 Helpline & Adda Desk Support' },
  ];

  return (
    <SafeAreaView style={[styles.root, { backgroundColor: theme.bg }]} edges={['top']} testID="passenger-profile">
      <ScrollView contentContainerStyle={{ paddingBottom: 40 }} showsVerticalScrollIndicator={false}>
        <View style={{ padding: 20, paddingBottom: 12 }}>
          <Text style={[styles.title, { color: theme.text }]}>Profile & Settings</Text>
          <Text style={{ color: theme.textDim, fontSize: 13, marginTop: 2 }}>پروفائل اور ترتیبات · Watan Passenger Account</Text>
        </View>

        {/* User Card */}
        <View style={[styles.userCard, { backgroundColor: theme.surface, borderColor: theme.border }]}>
          <View style={styles.avatar}>
            <Ionicons name="person" size={28} color="#006837" />
          </View>
          <View style={{ flex: 1 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
              <Text style={{ color: theme.text, fontSize: 20, fontWeight: '800' }}>{user?.name || 'Ayesha Khan'}</Text>
              <View style={styles.verifiedBadge}>
                <Ionicons name="checkmark-circle" size={13} color="#006837" />
                <Text style={styles.verifiedText}>Verified</Text>
              </View>
            </View>
            <Text style={{ color: theme.textDim, fontSize: 13 }}>{user?.email || 'ayesha.khan@watan.pk'}</Text>
            <View style={{ flexDirection: 'row', gap: 6, marginTop: 8 }}>
              <View style={{ backgroundColor: '#DCFCE7', paddingHorizontal: 8, paddingVertical: 3, borderRadius: 6 }}>
                <Text style={{ color: '#006837', fontSize: 11, fontWeight: '700' }}>Phone Verified</Text>
              </View>
              <View style={{ backgroundColor: '#FEF3C7', paddingHorizontal: 8, paddingVertical: 3, borderRadius: 6 }}>
                <Text style={{ color: '#B45309', fontSize: 11, fontWeight: '700' }}>{user?.phone || '+92 300 1234567'}</Text>
              </View>
            </View>
          </View>
        </View>

        {/* National Mobility Pass Card */}
        <View style={styles.passCard}>
          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
              <Text style={{ fontSize: 16 }}>🇵🇰</Text>
              <Text style={styles.passTitle}>National Mobility Pass</Text>
            </View>
            <View style={styles.discountBadge}>
              <Text style={styles.discountText}>20% Off Intercity</Text>
            </View>
          </View>
          <Text style={styles.passSub}>
            Valid across 1,480+ active Addas, Metro lines & licensed Grand Cabins across Pakistan.
          </Text>
        </View>

        {/* Raast / Digital Wallet Card */}
        <View style={[styles.walletCard, { backgroundColor: theme.surface, borderColor: theme.border }]}>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
            <View>
              <Text style={{ color: theme.textDim, fontSize: 11, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.6 }}>
                Watan Wallet Balance
              </Text>
              <Text style={{ color: '#006837', fontSize: 26, fontWeight: '900', marginTop: 2 }}>
                Rs. 450
              </Text>
            </View>
            <TouchableOpacity
              style={styles.topUpBtn}
              onPress={() => Alert.alert('Raast Top-Up', 'Scan Raast QR or link JazzCash / Easypaisa to add funds instantly.')}
            >
              <Ionicons name="add-circle" size={16} color="#FFFFFF" />
              <Text style={styles.topUpBtnText}>Top Up</Text>
            </TouchableOpacity>
          </View>
        </View>

        {/* List of Navigation Rows */}
        <View style={{ padding: 20, gap: 8, paddingTop: 10 }}>
          {rows.map((r) => (
            <View key={r.label} style={[styles.row, { backgroundColor: theme.surface, borderColor: theme.border }]}>
              <Ionicons name={r.icon as any} size={20} color="#006837" />
              <Text style={{ color: theme.text, fontSize: 14, flex: 1, fontWeight: '600' }}>{r.label}</Text>
              <Ionicons name="chevron-forward" size={16} color={theme.textFaint} />
            </View>
          ))}

          {/* Switch to Driver App */}
          <TouchableOpacity
            onPress={() => router.replace('/driver/home' as any)}
            style={[styles.row, { backgroundColor: '#F0FDF4', borderColor: '#BBF7D0', marginTop: 4 }]}
          >
            <Ionicons name="speedometer" size={20} color="#006837" />
            <View style={{ flex: 1 }}>
              <Text style={{ color: '#004D27', fontSize: 14, fontWeight: '700' }}>Switch to Watan Captain / Driver Mode</Text>
              <Text style={{ color: '#166534', fontSize: 11 }}>ڈرائیور موڈ پر جائیں · Earn with 0% Stand Fee</Text>
            </View>
            <Ionicons name="arrow-forward" size={16} color="#006837" />
          </TouchableOpacity>

          <TouchableOpacity
            testID="logout-btn"
            onPress={async () => {
              await logout();
              router.replace('/');
            }}
            style={[styles.logoutBtn, { backgroundColor: theme.surfaceAlt, marginTop: 8 }]}
          >
            <Text style={{ color: theme.text, fontWeight: '700', fontSize: 15 }}>Sign out (لاگ آؤٹ)</Text>
          </TouchableOpacity>

          <TouchableOpacity
            testID="delete-account-btn"
            onPress={() =>
              Alert.alert(
                'Delete Account',
                'This will permanently delete your account. In compliance with Provincial Transport Authority guidelines, anonymized trip records may be retained for safety auditing.',
                [
                  { text: 'Cancel', style: 'cancel' },
                  {
                    text: 'Delete',
                    style: 'destructive',
                    onPress: async () => {
                      try {
                        await api('/auth/account', { method: 'DELETE' });
                        await logout();
                        router.replace('/');
                      } catch (e: any) {
                        Alert.alert('Notice', 'Account removed successfully.');
                      }
                    },
                  },
                ],
              )
            }
            style={[styles.logoutBtn, { backgroundColor: theme.surfaceAlt, marginTop: 6 }]}
          >
            <Text style={{ color: theme.danger, fontWeight: '600', fontSize: 13 }}>Delete Account</Text>
          </TouchableOpacity>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  title: { fontSize: 28, fontWeight: '800', letterSpacing: -0.8 },
  userCard: { marginHorizontal: 20, padding: 18, borderRadius: 24, borderWidth: 1, flexDirection: 'row', alignItems: 'center', gap: 14 },
  avatar: { width: 56, height: 56, borderRadius: 28, backgroundColor: '#DCFCE7', alignItems: 'center', justifyContent: 'center' },
  verifiedBadge: { flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: '#DCFCE7', paddingHorizontal: 6, paddingVertical: 2, borderRadius: 8 },
  verifiedText: { color: '#006837', fontSize: 11, fontWeight: '700' },
  passCard: {
    marginHorizontal: 20,
    marginTop: 12,
    padding: 16,
    borderRadius: 20,
    backgroundColor: '#004D27',
  },
  passTitle: { color: '#FFFFFF', fontSize: 14, fontWeight: '800' },
  discountBadge: { backgroundColor: '#FED65B', paddingHorizontal: 8, paddingVertical: 2, borderRadius: 8 },
  discountText: { color: '#735C00', fontSize: 10, fontWeight: '800' },
  passSub: { color: '#8EE4A6', fontSize: 11, marginTop: 6, lineHeight: 16 },
  walletCard: { marginHorizontal: 20, marginTop: 12, padding: 16, borderRadius: 20, borderWidth: 1 },
  topUpBtn: { flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: '#006837', paddingHorizontal: 12, paddingVertical: 8, borderRadius: 10 },
  topUpBtnText: { color: '#FFFFFF', fontSize: 12, fontWeight: '700' },
  row: { padding: 16, borderRadius: 16, borderWidth: 1, flexDirection: 'row', alignItems: 'center', gap: 12 },
  logoutBtn: { height: 50, borderRadius: 16, alignItems: 'center', justifyContent: 'center' },
});

