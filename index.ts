import '@react-native-firebase/app';
import '@react-native-firebase/auth';
import { registerRootComponent } from 'expo';
import { safeSetBackgroundMessageHandler } from './src/services/fcmService';
import App from './App';
import { stopRingtone } from './src/services/soundManager';

// Top-level FCM background handler wrapped in safe handler
safeSetBackgroundMessageHandler(async (remoteMessage: any) => {
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
    console.log('[FCM Background] Received silent stop push, silencing audio');
    try {
      await stopRingtone();
    } catch (e) {
      console.warn('[FCM Background] Error stopping ringtone:', e);
    }
  }
});

// registerRootComponent calls AppRegistry.registerComponent('main', () => App);
// It also ensures that whether you load the app in Expo Go or in a native build,
// the environment is set up appropriately
registerRootComponent(App);
