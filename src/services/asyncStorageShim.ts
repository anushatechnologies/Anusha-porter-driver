/**
 * Cross-platform AsyncStorage shim.
 *
 * • Web  → window.localStorage  (persistent across page refreshes, no extra server needed)
 * • Native → @react-native-async-storage/async-storage  (device-local, persistent)
 *
 * This shim provides a unified interface across platforms so the rest of the
 * codebase can import a single module without worrying about platform specifics.
 */

import { Platform } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';

// In-memory fallback (used only if both localStorage and native storage fail)
const memoryStore: Record<string, string> = {};

const webStorage = {
  getItem: async (key: string): Promise<string | null> => {
    try {
      return window.localStorage.getItem(key);
    } catch {
      return memoryStore[key] ?? null;
    }
  },
  setItem: async (key: string, value: string): Promise<void> => {
    try {
      window.localStorage.setItem(key, value);
    } catch {
      memoryStore[key] = value;
    }
  },
  removeItem: async (key: string): Promise<void> => {
    try {
      window.localStorage.removeItem(key);
    } catch {
      delete memoryStore[key];
    }
  },
  clear: async (): Promise<void> => {
    try {
      window.localStorage.clear();
    } catch {
      Object.keys(memoryStore).forEach(k => delete memoryStore[k]);
    }
  },
  getAllKeys: async (): Promise<string[]> => {
    try {
      return Object.keys(window.localStorage);
    } catch {
      return Object.keys(memoryStore);
    }
  },
  multiRemove: async (keys: string[]): Promise<void> => {
    for (const key of keys) {
      try {
        window.localStorage.removeItem(key);
      } catch {
        delete memoryStore[key];
      }
    }
  },
};

const nativeStorage = {
  getItem: async (key: string): Promise<string | null> => {
    try {
      return await AsyncStorage.getItem(key);
    } catch {
      return memoryStore[key] ?? null;
    }
  },
  setItem: async (key: string, value: string): Promise<void> => {
    try {
      await AsyncStorage.setItem(key, value);
    } catch {
      memoryStore[key] = value;
    }
  },
  removeItem: async (key: string): Promise<void> => {
    try {
      await AsyncStorage.removeItem(key);
    } catch {
      delete memoryStore[key];
    }
  },
  clear: async (): Promise<void> => {
    try {
      await AsyncStorage.clear();
    } catch {
      Object.keys(memoryStore).forEach(k => delete memoryStore[k]);
    }
  },
  getAllKeys: async (): Promise<string[]> => {
    try {
      const keys = await AsyncStorage.getAllKeys();
      return keys ? [...keys] : [];
    } catch {
      return Object.keys(memoryStore);
    }
  },
  multiRemove: async (keys: string[]): Promise<void> => {
    try {
      await AsyncStorage.multiRemove(keys);
    } catch {
      for (const key of keys) {
        delete memoryStore[key];
      }
    }
  },
};

export const clearSessionKeepNotifications = async (): Promise<void> => {
  try {
    const allKeys = await (Platform.OS === 'web' ? webStorage.getAllKeys() : nativeStorage.getAllKeys());
    const keysToRemove = allKeys.filter(key =>
      !key.startsWith('@driver_read_notifs_') &&
      !key.startsWith('@driver_notifs_read_all_time_')
    );
    for (const key of keysToRemove) {
      if (Platform.OS === 'web') {
        await webStorage.removeItem(key);
      } else {
        await nativeStorage.removeItem(key);
      }
    }
  } catch {
    await (Platform.OS === 'web' ? webStorage.clear() : nativeStorage.clear());
  }
};

export default Platform.OS === 'web' ? webStorage : nativeStorage;
