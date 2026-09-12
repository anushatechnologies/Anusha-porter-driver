// =============================================================
// src/services/updateSafety.ts
// Centralized navigation safety tracker to prevent update dialogs
// from interrupting critical flows (Splash, OTP entry, Active orders).
// =============================================================

let isOtpActive = false;
let isCriticalActionActive = false;
let hasDismissedThisSession = false;

export const setOtpActive = (active: boolean) => {
  isOtpActive = active;
};

export const getOtpActive = () => isOtpActive;

export const setCriticalActionActive = (active: boolean) => {
  isCriticalActionActive = active;
};

export const getCriticalActionActive = () => isCriticalActionActive;

export const setUpdateDismissedThisSession = (dismissed: boolean) => {
  hasDismissedThisSession = dismissed;
};

export const getUpdateDismissedThisSession = () => hasDismissedThisSession;

let currentRouteGetter: (() => string | undefined) | null = null;

export const setRouteGetter = (getter: () => string | undefined) => {
  currentRouteGetter = getter;
};

/**
 * Returns true if the app is currently in a safe state to display the update popup.
 */
export const canShowUpdateDialog = (currentRouteName?: string): boolean => {
  if (hasDismissedThisSession) return false;
  if (isOtpActive) return false;
  if (isCriticalActionActive) return false;

  const route = currentRouteName ?? (currentRouteGetter ? currentRouteGetter() : undefined);

  // Unsafe screens to interrupt
  if (
    route === 'Splash' ||
    route === 'IncomingOrder' ||
    route === 'ActiveOrder'
  ) {
    return false;
  }

  return true;
};
