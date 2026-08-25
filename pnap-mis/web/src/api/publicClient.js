import axios from 'axios';

const PUBLIC_BASE =
  import.meta.env.VITE_PUBLIC_API_BASE_URL ||
  (import.meta.env.VITE_API_BASE_URL
    ? `${import.meta.env.VITE_API_BASE_URL.replace(/\/+$/, '')}/public`
    : '/api/public');

export const publicApi = axios.create({ baseURL: PUBLIC_BASE });

export function publicErrorMessage(err) {
  return (
    err?.response?.data?.error?.message ||
    err.message ||
    'Something went wrong. Please try again.'
  );
}
