import { Tabs } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { getTheme } from '../../src/lib/theme';
import { useAuth } from '../../src/lib/auth';
import { useEffect } from 'react';
import { useRouter } from 'expo-router';

export default function PassengerLayout() {
  const theme = getTheme('passenger');
  const { user, ready } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (ready && user && user.role !== 'passenger') {
      router.replace('/(auth)/login');
    }
  }, [ready, user, router]);

  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: theme.accent,
        tabBarInactiveTintColor: theme.textDim,
        tabBarStyle: {
          backgroundColor: theme.surface,
          borderTopColor: theme.border,
          height: 75,
          paddingTop: 8,
          paddingBottom: 16,
        },
        tabBarLabelStyle: { fontSize: 11, fontWeight: '700' },
      }}
    >
      <Tabs.Screen
        name="home"
        options={{
          title: 'Watan (سواری)',
          tabBarIcon: ({ color, size }) => <Ionicons name="car-sport" size={size} color={color} />,
        }}
      />
      <Tabs.Screen
        name="history"
        options={{
          title: 'Trips (سفر)',
          tabBarIcon: ({ color, size }) => <Ionicons name="receipt-outline" size={size} color={color} />,
        }}
      />
      <Tabs.Screen
        name="profile"
        options={{
          title: 'Wallet (والٹ)',
          tabBarIcon: ({ color, size }) => <Ionicons name="wallet-outline" size={size} color={color} />,
        }}
      />
      <Tabs.Screen name="ride/[id]" options={{ href: null }} />
      <Tabs.Screen name="chat/[id]" options={{ href: null }} />
      <Tabs.Screen name="payment-success" options={{ href: null }} />
    </Tabs>
  );
}
