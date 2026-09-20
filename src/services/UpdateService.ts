// =============================================================
// src/services/UpdateService.ts
// Official Google Play In-App Updates Integration Service
// Uses Google Play Core (com.google.android.play:app-update)
// =============================================================

import { Platform, Linking } from 'react-native';
import { checkForUpdate, startUpdate, addUpdateListener } from 'expo-in-app-updates';

// ------------------------------------------------------------------
// CONFIGURATION - change these to control update behaviour globally.
// Never hardcode version numbers here.
// ------------------------------------------------------------------
export const UPDATE_CONFIG = {
  /** Master on/off switch for in-app updates. */
  enabled: true,

  /**
   * TEST FLAG: Set to false for standard production Google Play behavior.
   */
  simulateUpdateForTesting: false,

  /**
   * 'flexible'  - background download, restart prompt on completion.
   * 'immediate' - full-screen blocking Play Store UI (mandatory).
   * Change to 'immediate' for critical/security releases.
   */
  updateType: 'flexible' as 'flexible' | 'immediate',

  /** When true the user can tap 'Later' and continue using the app. */
  allowLater: true,

  /** Package identifier on Google Play */
  packageName: 'com.anushaporter.driver',
};

// ------------------------------------------------------------------
// TYPES
// ------------------------------------------------------------------
export interface UpdateInfo {
  updateAvailable: boolean;
  flexibleAllowed?: boolean;
  immediateAllowed?: boolean;
  storeVersion?: string;
  updateInProgress?: boolean;
  serverPriority?: number;
}

export type UpdateEventName =
  | 'updateStart'
  | 'updateDownloaded'
  | 'updateCancelled'
  | 'updateCompleted';

// ------------------------------------------------------------------
// GUARDS
// ------------------------------------------------------------------
export function isUpdateSupported(): boolean {
  if (!UPDATE_CONFIG.enabled) return false;
  if (UPDATE_CONFIG.simulateUpdateForTesting) return true;
  return Platform.OS === 'android';
}

/**
 * Open the official Google Play Store listing directly.
 * Uses native market:// deep-link first, with web fallback.
 */
export function openPlayStoreListing(): void {
  const packageName = UPDATE_CONFIG.packageName;
  const marketUrl = `market://details?id=${packageName}`;
  const webUrl = `https://play.google.com/store/apps/details?id=${packageName}`;

  Linking.canOpenURL(marketUrl)
    .then((supported) => {
      if (supported) {
        return Linking.openURL(marketUrl);
      }
      return Linking.openURL(webUrl);
    })
    .catch(() => {
      Linking.openURL(webUrl).catch((err) => {
        console.warn('[UpdateService] Could not open Play Store URL:', err);
      });
    });
}

// ------------------------------------------------------------------
// CORE SERVICE FUNCTIONS
// ------------------------------------------------------------------

/**
 * Ask Google Play whether a newer version is available.
 * Returns null on ANY failure - never throws, never interrupts app.
 */
export async function fetchUpdateInfo(): Promise<UpdateInfo | null> {
  if (!UPDATE_CONFIG.enabled || !isUpdateSupported()) return null;

  if (UPDATE_CONFIG.simulateUpdateForTesting) {
    console.log('[UpdateService] Simulation mode: reporting update available');
    return {
      updateAvailable: true,
      flexibleAllowed: true,
      immediateAllowed: true,
      storeVersion: '2.28.1',
    };
  }

  try {
    const info = await checkForUpdate();
    return info as UpdateInfo;
  } catch (e) {
    // Normal when running locally, in emulator, or if device is offline
    console.log('[UpdateService] checkForUpdate notice:', e);
    return null;
  }
}

/**
 * Launch the update flow via Google Play Core native update, with fallback to Play Store listing.
 */
export async function launchUpdate(
  type: 'flexible' | 'immediate' = UPDATE_CONFIG.updateType,
): Promise<boolean> {
  if (UPDATE_CONFIG.simulateUpdateForTesting) {
    console.log('[UpdateService] Simulation mode: opening Play Store listing');
    openPlayStoreListing();
    return true;
  }

  try {
    const isImmediate = type === 'immediate';
    const started = await startUpdate(isImmediate);
    if (started) {
      return true;
    }
  } catch (err) {
    console.log('[UpdateService] Native startUpdate failed, opening Play Store listing:', err);
  }

  openPlayStoreListing();
  return true;
}

/**
 * Subscribe to a Play Core update lifecycle event.
 * Returns an unsubscribe function - always call on unmount.
 */
export function subscribeUpdateEvent(
  event: UpdateEventName,
  handler: (data?: any) => void,
): () => void {
  if (!isUpdateSupported()) return () => {};
  try {
    return addUpdateListener(event, handler);
  } catch (e) {
    console.warn('[UpdateService] addUpdateListener failed:', e);
    return () => {};
  }
}
