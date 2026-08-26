import { Platform } from 'react-native';
import * as SecureStore from 'expo-secure-store';

// In-memory fallback for environments where neither SecureStore nor localStorage is available
const memoryStore = new Map();

export const Storage = {
  async getItem(key) {
    try {
      if (Platform.OS === 'web') {
        if (typeof window !== 'undefined' && window.localStorage) {
          return window.localStorage.getItem(key);
        }
        return memoryStore.get(key) || null;
      }
      return await SecureStore.getItemAsync(key);
    } catch (e) {
      console.warn(`[Storage] getItem error for key "${key}":`, e);
      return memoryStore.get(key) || null;
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
      await SecureStore.setItemAsync(key, value);
    } catch (e) {
      console.warn(`[Storage] setItem error for key "${key}":`, e);
      memoryStore.set(key, value);
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
      await SecureStore.deleteItemAsync(key);
    } catch (e) {
      console.warn(`[Storage] removeItem error for key "${key}":`, e);
      memoryStore.delete(key);
    }
  },
};
