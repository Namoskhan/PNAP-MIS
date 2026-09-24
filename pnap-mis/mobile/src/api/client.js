import axios from 'axios';
import Constants from 'expo-constants';
import { Platform } from 'react-native';
import { Storage } from '../utils/storage';

export function resolveApiBaseUrl() {
  // If explicitly configured via environment (or EAS build profile), use it first
  if (process.env.EXPO_PUBLIC_API_BASE_URL) {
    return process.env.EXPO_PUBLIC_API_BASE_URL;
  }

  if (Platform.OS === 'web') {
    if (typeof window !== 'undefined' && window.location?.hostname) {
      return `http://${window.location.hostname}:5000/api`;
    }
  }

  // When running in Expo Go or dev on a physical device or emulator:
  // hostUri provides the development machine's IP (e.g. "192.168.1.7:8081")
  const hostUri =
    Constants.expoConfig?.hostUri ||
    Constants.manifest2?.extra?.expoClient?.hostUri ||
    Constants.manifest?.debuggerHost;

  if (hostUri) {
    const ip = hostUri.split(':')[0];
    if (ip && ip !== 'localhost' && ip !== '127.0.0.1') {
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

export function resolveMediaUrl(url) {
  if (!url) return null;
  if (url.startsWith('http://') || url.startsWith('https://') || url.startsWith('data:') || url.startsWith('blob:')) {
    return url;
  }
  const cleanBase = SERVER_BASE.replace(/\/+$/, '');
  const cleanPath = url.startsWith('/') ? url : `/${url}`;
  return `${cleanBase}${cleanPath}`;
}

export const api = axios.create({
  baseURL: API_BASE,
  timeout: 15000,
});

api.getToken = () => Storage.getItem('pnap_token');

let unauthorizedHandler = null;

export function setUnauthorizedHandler(fn) {
  unauthorizedHandler = fn;
}

// Attach JWT token and session hints from Storage on every request.
api.interceptors.request.use(async (config) => {
  try {
    const [token, activeRole, rememberMe] = await Promise.all([
      Storage.getItem('pnap_token'),
      config.url?.startsWith('/dashboard/')
        ? Storage.getItem('pnap_active_role')
        : Promise.resolve(null),
      Storage.getItem('pnap_remember_me'),
    ]);
    if (token) config.headers.Authorization = `Bearer ${token}`;
    if (activeRole) config.headers['X-Dashboard-Role'] = activeRole;
    if (rememberMe === 'true') config.headers['X-Keep-Logged-In'] = 'true';
  } catch {
    // Silently skip if storage fails
  }
  return config;
});

// Response interceptor:
// 1. Sliding window renewal: capture renewed JWT if server issued X-Refreshed-Token
// 2. Global 401 handler: clear stored credentials and notify AuthContext
api.interceptors.response.use(
  (res) => {
    try {
      const refreshed = res.headers?.['x-refreshed-token'] || res.headers?.['X-Refreshed-Token'];
      if (refreshed) {
        Storage.setItem('pnap_token', refreshed).catch(() => {});
      }
    } catch {}
    return res;
  },
  async (err) => {
    if (err.response?.status === 401) {
      try {
        await Promise.all([
          Storage.removeItem('pnap_token'),
          Storage.removeItem('pnap_user'),
          Storage.removeItem('pnap_active_role'),
          Storage.removeItem('pnap_unit_ctx'),
          Storage.removeItem('pnap_session_expiry'),
        ]);
      } catch {
        // ignore
      }
      if (typeof unauthorizedHandler === 'function') {
        unauthorizedHandler();
      }
    }
    return Promise.reject(err);
  }
);

// Convenience wrapper: unwraps the standard { success, data } envelope.
export function unwrap(promise) {
  return promise.then((res) => res.data?.data);
}

// Checks if an error is network-related (offline / disconnected / server down)
export function isNetworkError(err) {
  if (!err) return false;
  if (typeof navigator !== 'undefined' && navigator.onLine === false) return true;
  if (!err.response && (err.code === 'ERR_NETWORK' || err.code === 'ECONNABORTED' || err.message === 'Network Error')) return true;
  if (!err.response && (err.isAxiosError || String(err).includes('Network Error'))) return true;
  return false;
}

// Extracts a user-facing error message from an axios error.
export function errorMessage(err) {
  const errObj = err?.response?.data?.error;
  if (!errObj) return err?.message || 'Something went wrong.';
  if (errObj.details?.fieldErrors) {
    const fields = Object.entries(errObj.details.fieldErrors)
      .map(([k, v]) => `${k}: ${Array.isArray(v) ? v.join(', ') : v}`)
      .join('; ');
    if (fields) return `${errObj.message || 'Validation error'}: ${fields}`;
  }
  return errObj.message || err?.message || 'Something went wrong.';
}
