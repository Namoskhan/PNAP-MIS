import axios from 'axios';
import Constants from 'expo-constants';
import { Platform } from 'react-native';
import { Storage } from '../utils/storage';

export function resolveApiBaseUrl() {
  if (process.env.EXPO_PUBLIC_API_BASE_URL) {
    return process.env.EXPO_PUBLIC_API_BASE_URL;
  }

  // When running in Expo Go or dev on a physical device or emulator:
  // hostUri provides the development machine's IP (e.g. "192.168.18.129:8081")
  const hostUri =
    Constants.expoConfig?.hostUri ||
    Constants.manifest2?.extra?.expoClient?.hostUri ||
    Constants.manifest?.debuggerHost;

  if (hostUri) {
    const ip = hostUri.split(':')[0];
    if (ip) {
      return `http://${ip}:5000/api`;
    }
  }

  if (Platform.OS === 'android') {
    // Android emulator fallback
    return 'http://10.0.2.2:5000/api';
  }

  return 'http://localhost:5000/api';
}

export function resolveServerBaseUrl() {
  const apiBase = resolveApiBaseUrl();
  return apiBase.replace(/\/api\/?$/, '');
}

export const API_BASE = resolveApiBaseUrl();
export const SERVER_BASE = resolveServerBaseUrl();

export const api = axios.create({
  baseURL: API_BASE,
  timeout: 15000,
});

api.getToken = () => Storage.getItem('pnap_token');

// Attach JWT token from Storage on every request.
api.interceptors.request.use(async (config) => {
  try {
    const token = await Storage.getItem('pnap_token');
    if (token) config.headers.Authorization = `Bearer ${token}`;
  } catch {
    // Silently skip if storage fails
  }
  return config;
});

// Global 401 handler — clear stored credentials and let the AuthContext
// detect the missing token and redirect to login.
api.interceptors.response.use(
  (res) => res,
  async (err) => {
    if (err.response?.status === 401) {
      try {
        await Storage.removeItem('pnap_token');
        await Storage.removeItem('pnap_user');
        await Storage.removeItem('pnap_active_role');
        await Storage.removeItem('pnap_unit_ctx');
      } catch {
        // ignore
      }
    }
    return Promise.reject(err);
  }
);

// Convenience wrapper: unwraps the standard { success, data } envelope.
export function unwrap(promise) {
  return promise.then((res) => res.data?.data);
}

// Extracts a user-facing error message from an axios error.
export function errorMessage(err) {
  return err?.response?.data?.error?.message || err?.message || 'Something went wrong.';
}
