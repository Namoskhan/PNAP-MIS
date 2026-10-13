import { Platform } from 'react-native';
import * as SecureStore from 'expo-secure-store';
import AsyncStorage from '@react-native-async-storage/async-storage';

// In-memory fallback for environments where neither SecureStore nor localStorage is available
const memoryStore = new Map();

// Android SecureStore hard-limits entries to 2048 bytes (Android Keystore limit).
// Small sensitive items like auth tokens remain in SecureStore.
// Large payload objects (like full user profile with permissions) route to AsyncStorage.
const MAX_SECURE_BYTES = 2000;

export const Storage = {
  async getItem(key) {
    try {
      if (Platform.OS === 'web') {
        if (typeof window !== 'undefined' && window.localStorage) {
          return window.localStorage.getItem(key);
        }
        return memoryStore.get(key) || null;
      }

      // Try SecureStore first
      const secureVal = await SecureStore.getItemAsync(key);
      if (secureVal != null) return secureVal;

      // Fallback to AsyncStorage (for larger items like user profiles)
      return await AsyncStorage.getItem(key);
    } catch (e) {
      console.warn(`[Storage] getItem error for key "${key}":`, e);
      try {
        return await AsyncStorage.getItem(key);
      } catch {
        return memoryStore.get(key) || null;
      }
    }
  },

  async setItem(key, value) {
    try {
      if (Platform.OS === 'web') {
        if (typeof window !== 'undefined' && window.localStorage) {
          window.localStorage.setItem(key, value);
          return;
        }
        memoryStore.set(key, value);
        return;
      }

      const strVal = typeof value === 'string' ? value : String(value);

      // If value is larger than 2000 bytes, route to AsyncStorage to avoid SecureStore 2KB limit on Android
      if (strVal.length > MAX_SECURE_BYTES) {
        await AsyncStorage.setItem(key, strVal);
        try {
          await SecureStore.deleteItemAsync(key);
        } catch {}
        return;
      }

      await SecureStore.setItemAsync(key, strVal);
    } catch (e) {
      console.warn(`[Storage] setItem fallback to AsyncStorage for key "${key}":`, e);
      try {
        await AsyncStorage.setItem(key, String(value));
      } catch {
        memoryStore.set(key, value);
      }
    }
  },

  async removeItem(key) {
    try {
      if (Platform.OS === 'web') {
        if (typeof window !== 'undefined' && window.localStorage) {
          window.localStorage.removeItem(key);
          return;
        }
        memoryStore.delete(key);
        return;
      }
      await Promise.allSettled([
        SecureStore.deleteItemAsync(key),
        AsyncStorage.removeItem(key),
      ]);
    } catch (e) {
      console.warn(`[Storage] removeItem error for key "${key}":`, e);
      memoryStore.delete(key);
    }
  },
};

