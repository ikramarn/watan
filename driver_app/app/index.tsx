import { useEffect } from 'react';
import { ActivityIndicator, View } from 'react-native';
import { useRouter } from 'expo-router';

import { useAuth } from '../src/lib/auth';

export default function DriverEntry() {
  const router = useRouter();
  const { ready, user, setRole, logout } = useAuth();

  useEffect(() => {
    if (!ready) return;
    const run = async () => {
      await setRole('driver');
      if (!user) {
        router.replace('/(auth)/login');
        return;
      }
      if (user.role !== 'driver') {
        await logout();
        router.replace('/(auth)/login');
        return;
      }
      router.replace('/driver/home');
    };
    run();
  }, [ready, user?.id]);

  return (
    <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: '#09090B' }}>
      <ActivityIndicator color="#FACC15" />
    </View>
  );
}
