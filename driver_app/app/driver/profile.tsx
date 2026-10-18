import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Alert } from 'react-native';
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

  return (
    <SafeAreaView style={[styles.root, { backgroundColor: theme.bg }]} edges={['top']} testID="driver-profile">
      <View style={{ padding: 20 }}>
        <Text style={{ color: theme.text, fontSize: 28, fontWeight: '800', letterSpacing: -0.8 }}>Driver Profile</Text>
        <Text style={{ color: theme.textDim, fontSize: 13, marginTop: 2 }}>ڈرائیور پروفائل · Watan Verified Operator</Text>
      </View>

      <View style={[styles.userCard, { backgroundColor: theme.surface, borderColor: theme.border }]}>
        <View style={[styles.avatar, { backgroundColor: '#00683725', borderColor: '#59DF89', borderWidth: 1 }]}>
          <Ionicons name="person" size={28} color="#59DF89" />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={{ color: theme.text, fontSize: 19, fontWeight: '800' }}>{user?.name || 'Tariq Mahmood'}</Text>
          <Text style={{ color: theme.textDim, fontSize: 12, marginTop: 2 }}>
            ★ {(user?.rating ?? 4.9).toFixed?.(1)} · CNIC: 37405-*******-1
          </Text>
          <View style={{ flexDirection: 'row', gap: 6, marginTop: 6 }}>
            <View style={{ backgroundColor: '#00683725', paddingHorizontal: 8, paddingVertical: 2, borderRadius: 6, borderWidth: 1, borderColor: '#59DF8940' }}>
              <Text style={{ color: '#59DF89', fontSize: 10, fontWeight: '700' }}>Pirwadhai Stand Pari Member</Text>
            </View>
          </View>
        </View>
      </View>

      <View style={[styles.vehicleCard, { backgroundColor: theme.surface, borderColor: theme.border }]}>
        <Text style={{ color: theme.textDim, fontSize: 11, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.6 }}>
          Registered Fleet Vehicle
        </Text>
        <Text style={{ color: theme.text, fontSize: 18, fontWeight: '800', marginTop: 4 }}>
          {user?.vehicle_make || 'Toyota HiAce Grand Cabin (14-Seater)'}
        </Text>
        <Text style={{ color: theme.textDim, fontSize: 12, marginTop: 2 }}>
          Plate: {user?.vehicle_plate || 'RPL-4921'} · Commercial Route Permit Verified
        </Text>
      </View>

      <View style={{ padding: 20, gap: 8 }}>
        {[
          { icon: 'wallet-outline', label: 'Payout Channel · Raast / JazzCash / Cash at Adda' },
          { icon: 'document-text-outline', label: 'Provincial Transport Authority Permit' },
          { icon: 'shield-checkmark-outline', label: 'Pari Stand Safety & Queue Guidelines' },
          { icon: 'help-circle-outline', label: 'Munshi & 24/7 Watan Support' },
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
          style={[styles.logoutBtn, { backgroundColor: theme.surfaceAlt }]}
        >
          <Text style={{ color: theme.danger, fontWeight: '700', fontSize: 15 }}>Sign out (لاگ آؤٹ)</Text>
        </TouchableOpacity>

        <TouchableOpacity
          testID="delete-account-btn"
          onPress={() =>
            Alert.alert(
              'Deactivate Profile',
              'This will deregister your vehicle from the Adda Pari queue and suspend roaming hails.',
              [
                { text: 'Cancel', style: 'cancel' },
                {
                  text: 'Deactivate',
                  style: 'destructive',
                  onPress: async () => {
                    try {
                      await api('/auth/account', { method: 'DELETE' });
                      await logout();
                      router.replace('/');
                    } catch (e: any) {
                      Alert.alert('Notice', 'Profile offline. Contact your Adda Munshi to reinstate queue access.');
                    }
                  },
                },
              ],
            )
          }
          style={[styles.logoutBtn, { backgroundColor: theme.surfaceAlt, marginTop: 8 }]}
        >
          <Text style={{ color: theme.textDim, fontWeight: '500', fontSize: 13 }}>Deactivate Driver Profile</Text>
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  userCard: { marginHorizontal: 20, padding: 18, borderRadius: 22, borderWidth: 1, flexDirection: 'row', alignItems: 'center', gap: 14 },
  avatar: { width: 54, height: 54, borderRadius: 27, alignItems: 'center', justifyContent: 'center' },
  vehicleCard: { marginHorizontal: 20, marginTop: 12, padding: 18, borderRadius: 22, borderWidth: 1 },
  row: { padding: 16, borderRadius: 16, borderWidth: 1, flexDirection: 'row', alignItems: 'center', gap: 12 },
  logoutBtn: { height: 50, borderRadius: 16, alignItems: 'center', justifyContent: 'center', marginTop: 8 },
});
