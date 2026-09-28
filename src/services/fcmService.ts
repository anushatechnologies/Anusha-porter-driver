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

export function isDriverNotification(message: RemoteMessage): boolean {
  try {
    if (!message) return false;
    const data = message.data || {};
    const notification = message.notification || {};

    // 1. Role / Audience Checks
    const role = String(
      data.role ||
      data.userRole ||
      data.targetRole ||
      data.target ||
      data.recipientType ||
      data.userType ||
      data.recipient ||
      data.audience ||
      data.targetUser ||
      data.receiverType ||
      data.toRole ||
      ''
    ).toLowerCase().trim();

    // If explicitly targeted for customer/user/passenger/client, filter out
    if (
      role === 'customer' ||
      role === 'user' ||
      role === 'passenger_user' ||
      role === 'passenger' ||
      role === 'client' ||
      role === 'rider' ||
      role === 'buyer' ||
      role === 'consumer'
    ) {
      console.log('[FCM] Ignored customer targeted notification by role:', role, message);
      return false;
    }

    // 2. Action / Type Checks
    const action = String(
      data.action ||
      data.type ||
      data.notificationType ||
      data.event ||
      data.status ||
      ''
    ).toLowerCase().trim();

    const customerActions = [
      'customer_',
      'user_',
      'order_placed',
      'booking_created',
      'booking_confirmed',
      'order_confirmed',
      'ride_confirmed',
      'driver_assigned',
      'driver_arrived',
      'driver_reached',
      'driver_on_the_way',
      'searching_driver',
      'looking_for_driver',
      'rate_driver',
      'rate_ride',
      'share_otp',
      'customer_alert',
      'passenger_alert',
    ];

    if (customerActions.some(act => action.includes(act))) {
      console.log('[FCM] Ignored customer notification by action/type:', action);
      return false;
    }

    // 3. Title & Body Phrase Checks
    const title = String(notification.title || data.title || '').toLowerCase();
    const body = String(notification.body || data.body || data.message || data.customMessage || '').toLowerCase();
    const fullText = `${title} ${body}`;

    const customerPhrases = [
      'your order',
      'your ride',
      'your trip',
      'your booking',
      'your delivery',
      'your cab',
      'your taxi',
      'searching for driver',
      'looking for driver',
      'finding your driver',
      'driver assigned',
      'driver is assigned',
      'driver has been assigned',
      'driver has accepted',
      'driver is on',
      'driver on the way',
      'driver is arriving',
      'driver has arrived',
      'driver reached',
      'driver is reaching',
      'order booked successfully',
      'order booked',
      'booking confirmed',
      'order confirmed',
      'ride confirmed',
      'thank you for riding',
      'thank you for choosing',
      'thank you for using',
      'rate your driver',
      'rate your ride',
      'rate your trip',
      'how was your trip',
      'how was your ride',
      'share otp',
      'share this otp',
      'otp for your booking',
      'otp for your ride',
      'otp to start',
      'track your driver',
      'track your ride',
      'track your order',
      'goods picked up',
      'driver picked up your',
      'payment confirmed',
      'payment successful for order',
    ];

    if (customerPhrases.some(phrase => fullText.includes(phrase))) {
      console.log('[FCM] Ignored customer notification content:', fullText);
      return false;
    }

    return true;
  } catch (err) {
    console.warn('[FCM] isDriverNotification safety check fallback:', err);
    return true;
  }
}

export function safeSetBackgroundMessageHandler(handler: (message: RemoteMessage) => Promise<any>) {
  try {
    const messaging = getSafeMessaging();
    if (messaging) {
      modularSetBackgroundMessageHandler(messaging, async (message) => {
        if (!isDriverNotification(message)) return;
        return handler(message);
      });
    }
  } catch (err) {
    console.warn('[FCM] setBackgroundMessageHandler failed:', err);
  }
}

export function safeOnMessage(listener: (message: RemoteMessage) => any): () => void {
  try {
    const messaging = getSafeMessaging();
    if (messaging) {
      return modularOnMessage(messaging, (message) => {
        if (!isDriverNotification(message)) return;
        return listener(message);
      });
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
      return modularOnNotificationOpenedApp(messaging, (message) => {
        if (!isDriverNotification(message)) return;
        return listener(message);
      });
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
      const msg = await modularGetInitialNotification(messaging);
      if (msg && !isDriverNotification(msg)) {
        console.log('[FCM] Ignored customer targeted initial notification:', msg);
        return null;
      }
      return msg;
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
