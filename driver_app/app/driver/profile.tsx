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
        <Text style={{ color: theme.text, fontSize: 30, fontWeight: '700', letterSpacing: -0.8 }}>Profile</Text>
      </View>

      <View style={[styles.userCard, { backgroundColor: theme.surface, borderColor: theme.border }]}>
        <View style={[styles.avatar, { backgroundColor: theme.accentSoft }]}>
          <Ionicons name="car-sport" size={28} color={theme.accent} />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={{ color: theme.text, fontSize: 20, fontWeight: '700' }}>{user?.name}</Text>
          <Text style={{ color: theme.textDim, fontSize: 13 }}>
            ★ {(user?.rating ?? 5).toFixed?.(1)} · Pro driver
          </Text>
        </View>
      </View>

      <View style={[styles.vehicleCard, { backgroundColor: theme.surface, borderColor: theme.border }]}>
        <Text style={{ color: theme.textDim, fontSize: 11, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.6 }}>
          Your vehicle
        </Text>
        <Text style={{ color: theme.text, fontSize: 20, fontWeight: '700', marginTop: 6 }}>{user?.vehicle_make}</Text>
        <Text style={{ color: theme.textDim, fontSize: 13 }}>
          Plate · {user?.vehicle_plate} · Class {user?.vehicle_type}
        </Text>
      </View>

      <View style={{ padding: 20, gap: 8 }}>
        {[
          { icon: 'wallet-outline', label: 'Payout method · Chase Bank' },
          { icon: 'document-text-outline', label: 'Tax documents' },
          { icon: 'shield-checkmark-outline', label: 'Safety center' },
          { icon: 'help-circle-outline', label: 'Driver support' },
        ].map((r) => (
          <View key={r.label} style={[styles.row, { backgroundColor: theme.surface, borderColor: theme.border }]}>
            <Ionicons name={r.icon as any} size={20} color={theme.text} />
            <Text style={{ color: theme.text, fontSize: 15, flex: 1 }}>{r.label}</Text>
            <Ionicons name="chevron-forward" size={16} color={theme.textFaint} />
          </View>
        ))}

        <TouchableOpacity
          testID="logout-btn"
          onPress={async () => { await logout(); router.replace('/'); }}
          style={[styles.logoutBtn, { backgroundColor: theme.surfaceAlt }]}
        >
          <Text style={{ color: theme.danger, fontWeight: '700', fontSize: 15 }}>Sign out</Text>
        </TouchableOpacity>

        <TouchableOpacity
          testID="delete-account-btn"
          onPress={() =>
            Alert.alert(
              'Delete Account',
              'This will permanently delete your driver account and all data. This cannot be undone.',
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
                      Alert.alert('Error', e.message);
                    }
                  },
                },
              ],
            )
          }
          style={[styles.logoutBtn, { backgroundColor: theme.surfaceAlt, marginTop: 8 }]}
        >
          <Text style={{ color: theme.danger, fontWeight: '400', fontSize: 14 }}>Delete Account</Text>
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  userCard: { marginHorizontal: 20, padding: 20, borderRadius: 24, borderWidth: 1, flexDirection: 'row', alignItems: 'center', gap: 14 },
  avatar: { width: 56, height: 56, borderRadius: 28, alignItems: 'center', justifyContent: 'center' },
  vehicleCard: { marginHorizontal: 20, marginTop: 12, padding: 20, borderRadius: 24, borderWidth: 1 },
  row: { padding: 16, borderRadius: 16, borderWidth: 1, flexDirection: 'row', alignItems: 'center', gap: 12 },
  logoutBtn: { height: 52, borderRadius: 16, alignItems: 'center', justifyContent: 'center', marginTop: 8 },
});
