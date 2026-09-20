import { navigationRef } from '../navigation/navigationRef';
import { startAlarm, stopAlarm } from './alarmSound';

/**
 * soundManager.ts
 * Centralized sound and order offer modal management.
 * Guarantees immediate ringtone silence on accept, reject, conflict, or silent push.
 */

/**
 * Immediately stop the order ringtone and release audio resources.
 */
export const stopRingtone = async (): Promise<void> => {
  try {
    await stopAlarm();
  } catch (err) {
    console.warn('[soundManager] Error stopping ringtone:', err);
  }
};

/**
 * Start playing the order ringtone.
 */
export const playRingtone = async (): Promise<void> => {
  try {
    await startAlarm();
  } catch (err) {
    console.warn('[soundManager] Error playing ringtone:', err);
  }
};

/**
 * Dismisses the IncomingOrder screen/modal if it is currently visible.
 * Optionally verifies bookingId matches before dismissing.
 */
export const dismissIncomingOrderModal = (bookingId?: string | number): void => {
  try {
    if (!navigationRef.isReady()) return;
    const currentRoute = navigationRef.getCurrentRoute();
    if (currentRoute?.name === 'IncomingOrder') {
      if (bookingId) {
        const params = currentRoute.params as { order?: { bookingId?: string; id?: string | number } } | undefined;
        if (params?.order) {
          const currentId = String(params.order.bookingId || params.order.id || '').replace(/^#+/, '');
          const targetId = String(bookingId).replace(/^#+/, '');
          if (currentId && targetId && currentId !== targetId) {
            // Dismiss only if matches the target bookingId
            return;
          }
        }
      }
      console.log('[soundManager] Dismissing IncomingOrder screen');
      if (navigationRef.canGoBack()) {
        navigationRef.goBack();
      } else {
        navigationRef.navigate('DriverTabs');
      }
    }
  } catch (e) {
    console.warn('[soundManager] Failed to dismiss incoming order modal:', e);
  }
};

// Aliases for compatibility
export const stopOrderRingtone = stopRingtone;
export const playOrderRingtone = playRingtone;
