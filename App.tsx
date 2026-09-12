import React, { useEffect } from 'react';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import AppNavigator from './src/navigation/AppNavigator';
import { ThemeProvider } from './src/theme/ThemeContext';
import { safeOnMessage } from './src/services/fcmService';
import { stopRingtone, dismissIncomingOrderModal } from './src/services/soundManager';

export default function App() {
  // Top-level foreground FCM listener for silent stop pushes
  useEffect(() => {
    const unsubscribe = safeOnMessage(async (remoteMessage: any) => {
      const data = remoteMessage?.data || {};
      const isSilentStop =
        data.stopSound === 'true' ||
        data.stopSound === true ||
        data.action === 'STOP_RINGTONE' ||
        data.action === 'STOP_DRIVER_OFFER' ||
        data.action === 'OFFER_TOO_LATE' ||
        data.action === 'OFFER_DISMISSED' ||
        data.type === 'STOP_RINGTONE' ||
        data.type === 'STOP_DRIVER_OFFER' ||
        data.type === 'driver:offer:stop' ||
        data.type === 'OFFER_TOO_LATE' ||
        data.type === 'OFFER_DISMISSED' ||
        data.status === 'TOO_LATE';

      if (isSilentStop) {
        console.log('[App FCM] Silent stop push received, silencing audio globally');
        stopRingtone().catch(() => {});
        const bookingId = data.bookingId || data.orderId || data.id || '';
        if (bookingId) {
          dismissIncomingOrderModal(bookingId);
        } else {
          dismissIncomingOrderModal();
        }
      }
    });

    return () => {
      if (unsubscribe) unsubscribe();
    };
  }, []);

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <ThemeProvider>
        <AppNavigator />
      </ThemeProvider>
    </GestureHandlerRootView>
  );
}
