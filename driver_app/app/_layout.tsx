import { Stack } from 'expo-router';
import { AuthProvider } from '../src/lib/auth';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import * as SplashScreen from 'expo-splash-screen';
import Constants from 'expo-constants';
import { useEffect } from 'react';
import { api } from '../src/lib/api';

SplashScreen.preventAutoHideAsync().catch(() => {});

async function setupPushNotifications() {
  // Push notifications are removed from Expo Go on SDK 53+
  if (Constants.appOwnership === 'expo') {
    return;
  }
  try {
    const Notifications = await import('expo-notifications');
    Notifications.setNotificationHandler({
      handleNotification: async () => ({
        shouldShowAlert: true,
        shouldPlaySound: true,
        shouldSetBadge: true,
        shouldShowBanner: true,
        shouldShowList: true,
      }),
    });

    const { status: existing } = await Notifications.getPermissionsAsync();
    let finalStatus = existing;
    if (existing !== 'granted') {
      const { status } = await Notifications.requestPermissionsAsync();
      finalStatus = status;
    }
    if (finalStatus !== 'granted') return;
    const token = (await Notifications.getExpoPushTokenAsync()).data;
    await api('/auth/push-token', { body: { push_token: token } });
  } catch (e) {
    console.warn('Push notification setup skipped/failed:', e);
  }
}

export default function RootLayout() {
  useEffect(() => {
    SplashScreen.hideAsync().catch(() => {});
    setupPushNotifications();
  }, []);

  return (
    <SafeAreaProvider>
      <AuthProvider>
        <StatusBar style="auto" />
        <Stack screenOptions={{ headerShown: false, animation: 'fade' }}>
          <Stack.Screen name="index" />
          <Stack.Screen name="(auth)" />
          <Stack.Screen name="driver" />
        </Stack>
      </AuthProvider>
    </SafeAreaProvider>
  );
}
