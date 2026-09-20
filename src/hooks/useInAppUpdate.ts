// =============================================================
// src/hooks/useInAppUpdate.ts
// Production-ready In-App Updates Hook
// Coordinates Google Play Core updates, UI state, and navigation safety
// =============================================================

import { useState, useEffect, useRef, useCallback } from 'react';
import { AppState, AppStateStatus } from 'react-native';
import {
  UPDATE_CONFIG,
  isUpdateSupported,
  fetchUpdateInfo,
  launchUpdate,
  openPlayStoreListing,
  subscribeUpdateEvent,
  UpdateInfo,
} from '../services/UpdateService';
import {
  canShowUpdateDialog,
  setUpdateDismissedThisSession,
  getUpdateDismissedThisSession,
} from '../services/updateSafety';
import { InAppUpdateModalMode } from '../components/InAppUpdateModal';

export interface UseInAppUpdateResult {
  isModalVisible: boolean;
  modalMode: InAppUpdateModalMode;
  allowLater: boolean;
  handleUpdateNow: () => Promise<void>;
  handleLater: () => void;
  runUpdateCheck: (currentRouteName?: string) => Promise<void>;
}

export function useInAppUpdate(): UseInAppUpdateResult {
  const [isModalVisible, setIsModalVisible] = useState<boolean>(false);
  const [modalMode, setModalMode] = useState<InAppUpdateModalMode>('available');

  const isCheckingRef = useRef<boolean>(false);
  const hasShownDialogRef = useRef<boolean>(false);
  const lastCheckTimeRef = useRef<number>(0);
  const isModalVisibleRef = useRef<boolean>(false);
  const appStateRef = useRef<AppStateStatus>(AppState.currentState);

  useEffect(() => {
    isModalVisibleRef.current = isModalVisible;
  }, [isModalVisible]);

  const runUpdateCheck = useCallback(async (currentRouteName?: string) => {
    if (!isUpdateSupported()) return;
    if (isModalVisibleRef.current) return;
    if (hasShownDialogRef.current) return;
    if (isCheckingRef.current) return;
    if (getUpdateDismissedThisSession()) return;
    if (!canShowUpdateDialog(currentRouteName)) return;

    // Throttle: don't check Google Play more than once every 10 minutes if a check has already completed
    const now = Date.now();
    if (lastCheckTimeRef.current > 0 && now - lastCheckTimeRef.current < 10 * 60 * 1000) return;

    isCheckingRef.current = true;
    try {
      const info: UpdateInfo | null = await fetchUpdateInfo();
      if (info) {
        lastCheckTimeRef.current = now;
      }
      if (!info || !info.updateAvailable) return;

      const isImmediate =
        UPDATE_CONFIG.updateType === 'immediate' &&
        (info.immediateAllowed ?? true);

      if (isImmediate) {
        // Immediate update uses Google Play's full-screen modal
        await launchUpdate('immediate');
        return;
      }

      // Flexible update: show custom in-app dialog once
      hasShownDialogRef.current = true;
      setModalMode('available');
      setIsModalVisible(true);
    } catch (err) {
      console.log('[useInAppUpdate] Update check completed with notice:', err);
    } finally {
      isCheckingRef.current = false;
    }
  }, []);

  const handleUpdateNow = useCallback(async () => {
    setIsModalVisible(false);
    await launchUpdate(UPDATE_CONFIG.updateType);
  }, []);

  const handleLater = useCallback(() => {
    setIsModalVisible(false);
    setUpdateDismissedThisSession(true);
  }, []);

  // Check after splash screen entrance transition
  useEffect(() => {
    const timer = setTimeout(() => {
      runUpdateCheck();
    }, 4000); // 4s buffer to allow Splash screen transition to complete
    return () => clearTimeout(timer);
  }, [runUpdateCheck]);

  // Foreground resume check
  useEffect(() => {
    const sub = AppState.addEventListener('change', (nextState: AppStateStatus) => {
      const prev = appStateRef.current;
      appStateRef.current = nextState;

      if (
        (prev === 'background' || prev === 'inactive') &&
        nextState === 'active'
      ) {
        runUpdateCheck();
      }
    });
    return () => sub.remove();
  }, [runUpdateCheck]);

  // Listen for Play Store download completion
  useEffect(() => {
    const unsubDownloaded = subscribeUpdateEvent('updateDownloaded', () => {
      console.log('[useInAppUpdate] Update downloaded and ready to install');
      setModalMode('downloaded');
      setIsModalVisible(true);
    });

    const unsubCancelled = subscribeUpdateEvent('updateCancelled', () => {
      console.log('[useInAppUpdate] Update cancelled by user from system sheet');
      setIsModalVisible(false);
      setUpdateDismissedThisSession(true);
    });

    return () => {
      unsubDownloaded();
      unsubCancelled();
    };
  }, []);

  return {
    isModalVisible,
    modalMode,
    allowLater: UPDATE_CONFIG.allowLater,
    handleUpdateNow,
    handleLater,
    runUpdateCheck,
  };
}
