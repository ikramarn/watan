import { useEffect } from 'react';
import { ActivityIndicator, View } from 'react-native';
import { useRouter } from 'expo-router';

import { useAuth } from '../src/lib/auth';

export default function PassengerEntry() {
  const router = useRouter();
  const { ready, user, setRole, logout } = useAuth();

  useEffect(() => {
    if (!ready) return;
    const run = async () => {
      await setRole('passenger');
      if (user && user.role !== 'passenger') {
        await logout();
      }
      // Seamless guest-first entry: allow user to explore map, fare estimates, and booking before requiring sign-in
      router.replace('/passenger/home');
    };
    run();
  }, [ready, user?.id]);

  return (
    <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: '#090D16' }}>
      <ActivityIndicator color="#FACC15" />
    </View>
  );
}
