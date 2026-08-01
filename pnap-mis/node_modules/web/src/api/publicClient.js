import axios from 'axios';

// Separate axios instance for the public registration form so the
// auth interceptor cannot kick a guest user to /login on a 401.
export const publicApi = axios.create({ baseURL: '/api/public' });

export function publicErrorMessage(err) {
  return (
    err?.response?.data?.error?.message ||
    err.message ||
    'Something went wrong. Please try again.'
  );
}
