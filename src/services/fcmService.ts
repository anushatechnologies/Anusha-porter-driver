import {
  getMessaging,
  onMessage as modularOnMessage,
  onNotificationOpenedApp as modularOnNotificationOpenedApp,
  getInitialNotification as modularGetInitialNotification,
  setBackgroundMessageHandler as modularSetBackgroundMessageHandler,
  requestPermission as modularRequestPermission,
  getToken as modularGetToken,
  onTokenRefresh as modularOnTokenRefresh,
  AuthorizationStatus,
  type RemoteMessage,
} from '@react-native-firebase/messaging';
import { Platform, PermissionsAndroid } from 'react-native';

export { AuthorizationStatus, type RemoteMessage };

export function getSafeMessaging() {
  try {
    return getMessaging();
  } catch (err) {
    console.warn('[FCM] getMessaging failed:', err);
    return null;
  }
}

export function safeSetBackgroundMessageHandler(handler: (message: RemoteMessage) => Promise<any>) {
  try {
    const messaging = getSafeMessaging();
    if (messaging) {
      modularSetBackgroundMessageHandler(messaging, handler);
    }
  } catch (err) {
    console.warn('[FCM] setBackgroundMessageHandler failed:', err);
  }
}

export function safeOnMessage(listener: (message: RemoteMessage) => any): () => void {
  try {
    const messaging = getSafeMessaging();
    if (messaging) {
      return modularOnMessage(messaging, listener);
    }
  } catch (err) {
    console.warn('[FCM] onMessage listener failed:', err);
  }
  return () => {};
}

export function safeOnNotificationOpenedApp(listener: (message: RemoteMessage) => any): () => void {
  try {
    const messaging = getSafeMessaging();
    if (messaging) {
      return modularOnNotificationOpenedApp(messaging, listener);
    }
  } catch (err) {
    console.warn('[FCM] onNotificationOpenedApp listener failed:', err);
  }
  return () => {};
}

export async function safeGetInitialNotification(): Promise<RemoteMessage | null> {
  try {
    const messaging = getSafeMessaging();
    if (messaging) {
      return await modularGetInitialNotification(messaging);
    }
  } catch (err) {
    console.warn('[FCM] getInitialNotification failed:', err);
  }
  return null;
}

export async function safeRequestPermission(): Promise<number> {
  try {
    if (Platform.OS === 'android' && Platform.Version >= 33) {
      try {
        await PermissionsAndroid.request(PermissionsAndroid.PERMISSIONS.POST_NOTIFICATIONS);
      } catch (permErr) {
        console.warn('[FCM] Android POST_NOTIFICATIONS permission notice:', permErr);
      }
    }
    const messaging = getSafeMessaging();
    if (messaging) {
      return await modularRequestPermission(messaging);
    }
  } catch (err) {
    console.warn('[FCM] requestPermission failed:', err);
  }
  return -1;
}

export async function safeGetToken(): Promise<string | null> {
  try {
    const messaging = getSafeMessaging();
    if (messaging) {
      return await modularGetToken(messaging);
    }
  } catch (err) {
    console.warn('[FCM] getToken failed:', err);
  }
  return null;
}

export function safeOnTokenRefresh(listener: (token: string) => any): () => void {
  try {
    const messaging = getSafeMessaging();
    if (messaging) {
      return modularOnTokenRefresh(messaging, listener);
    }
  } catch (err) {
    console.warn('[FCM] onTokenRefresh listener failed:', err);
  }
  return () => {};
}
