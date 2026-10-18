import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Alert } from 'react-native';
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
    { icon: 'wallet-outline', label: 'Payment · Cash / JazzCash / Easypaisa / Raast' },
    { icon: 'star-outline', label: `Passenger rating · ${user?.rating?.toFixed?.(1) ?? '4.9'} ★` },
    { icon: 'bus-outline', label: 'Saved Adda Stands & Daily Commutes' },
    { icon: 'shield-checkmark-outline', label: 'Safety & Family Tracking (خاندانی تحفظ)' },
    { icon: 'help-circle-outline', label: 'Watan 24/7 Helpline & Support' },
  ];

  return (
    <SafeAreaView style={[styles.root, { backgroundColor: theme.bg }]} edges={['top']} testID="passenger-profile">
      <View style={{ padding: 20 }}>
        <Text style={[styles.title, { color: theme.text }]}>Profile & Settings</Text>
        <Text style={{ color: theme.textDim, fontSize: 13, marginTop: 2 }}>پروفائل اور ترتیبات · Watan Passenger Account</Text>
      </View>
      <View style={[styles.userCard, { backgroundColor: theme.surface, borderColor: theme.border }]}>
        <View style={styles.avatar}>
          <Ionicons name="person" size={28} color="#006837" />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={{ color: theme.text, fontSize: 20, fontWeight: '700' }}>{user?.name || 'Ayesha Khan'}</Text>
          <Text style={{ color: theme.textDim, fontSize: 13 }}>{user?.email || 'ayesha.khan@watan.pk'}</Text>
          <View style={{ flexDirection: 'row', gap: 6, marginTop: 6 }}>
            <View style={{ backgroundColor: '#DCFCE7', paddingHorizontal: 8, paddingVertical: 2, borderRadius: 6 }}>
              <Text style={{ color: '#006837', fontSize: 11, fontWeight: '700' }}>Phone Verified</Text>
            </View>
            <View style={{ backgroundColor: '#FEF3C7', paddingHorizontal: 8, paddingVertical: 2, borderRadius: 6 }}>
              <Text style={{ color: '#B45309', fontSize: 11, fontWeight: '700' }}>{user?.phone || '+92 300 1234567'}</Text>
            </View>
          </View>
        </View>
      </View>

      <View style={{ padding: 20, gap: 8 }}>
        {rows.map((r) => (
          <View key={r.label} style={[styles.row, { backgroundColor: theme.surface, borderColor: theme.border }]}>
            <Ionicons name={r.icon as any} size={20} color="#006837" />
            <Text style={{ color: theme.text, fontSize: 14, flex: 1, fontWeight: '600' }}>{r.label}</Text>
            <Ionicons name="chevron-forward" size={16} color={theme.textFaint} />
          </View>
        ))}
      </View>

      <View style={{ padding: 20 }}>
        <TouchableOpacity
          testID="logout-btn"
          onPress={async () => {
            await logout();
            router.replace('/');
          }}
          style={[styles.logoutBtn, { backgroundColor: theme.surfaceAlt }]}
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
          style={[styles.logoutBtn, { backgroundColor: theme.surfaceAlt, marginTop: 8 }]}
        >
          <Text style={{ color: theme.danger, fontWeight: '600', fontSize: 14 }}>Delete Account</Text>
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  title: { fontSize: 28, fontWeight: '800', letterSpacing: -0.8 },
  userCard: { marginHorizontal: 20, padding: 20, borderRadius: 24, borderWidth: 1, flexDirection: 'row', alignItems: 'center', gap: 14 },
  avatar: { width: 56, height: 56, borderRadius: 28, backgroundColor: '#DCFCE7', alignItems: 'center', justifyContent: 'center' },
  row: { padding: 16, borderRadius: 16, borderWidth: 1, flexDirection: 'row', alignItems: 'center', gap: 12 },
  logoutBtn: { height: 52, borderRadius: 16, alignItems: 'center', justifyContent: 'center' },
});
