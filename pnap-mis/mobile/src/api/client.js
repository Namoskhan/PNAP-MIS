import axios from 'axios';
import { Storage } from '../utils/storage';

// The API base URL is set via EXPO_PUBLIC_API_BASE_URL in your .env file.
// For local development on a physical device, use your machine's LAN IP:
//   EXPO_PUBLIC_API_BASE_URL=http://192.168.1.x:5000/api
// For emulators, Android uses 10.0.2.2, iOS simulator can use localhost.
const API_BASE = process.env.EXPO_PUBLIC_API_BASE_URL || 'http://localhost:5000/api';

export const api = axios.create({
  baseURL: API_BASE,
  timeout: 15000,
});

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
