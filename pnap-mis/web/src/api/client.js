import axios from 'axios';

const API_BASE = import.meta.env.VITE_API_BASE_URL || '/api';

export const api = axios.create({
  baseURL: API_BASE,
});

api.interceptors.request.use((config) => {
  const token = localStorage.getItem('pnap_token');
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

api.interceptors.response.use(
  (res) => res,
  (err) => {
    if (err.response?.status === 401) {
      localStorage.removeItem('pnap_token');
      localStorage.removeItem('pnap_user');
      if (!location.pathname.startsWith('/login')) {
        location.href = '/login';
      }
    }
    return Promise.reject(err);
  }
);

export function unwrap(promise) {
  return promise.then((res) => res.data?.data);
}

export function errorMessage(err) {
  const errObj = err?.response?.data?.error;
  if (!errObj) return err?.message || 'Unknown error';
  if (errObj.details?.fieldErrors) {
    const fields = Object.entries(errObj.details.fieldErrors)
      .map(([k, v]) => `${k}: ${Array.isArray(v) ? v.join(', ') : v}`)
      .join('; ');
    if (fields) return `${errObj.message || 'Validation error'}: ${fields}`;
  }
  return errObj.message || err?.message || 'Unknown error';
}
