import axios from 'axios';

// Unauthenticated client for the account-recovery endpoints.
//
// Separate from api/client for the same reason publicClient is: that
// instance carries an interceptor that redirects to /login on a 401, and
// the whole point of these pages is that the visitor CANNOT log in. A
// bounce to /login would silently discard a valid reset link.
export const authApi = axios.create({ baseURL: '/api/auth' });

export function authErrorMessage(err) {
  return (
    err?.response?.data?.error?.message ||
    err.message ||
    'Something went wrong. Please try again.'
  );
}

export function authErrorCode(err) {
  return err?.response?.data?.error?.code || null;
}

export function forgotPassword(identifier) {
  return authApi.post('/forgot-password', { identifier }).then((r) => r.data.data);
}

export function resendVerification(identifier) {
  return authApi.post('/resend-verification', { identifier }).then((r) => r.data.data);
}

export function checkResetToken(token) {
  return authApi.get(`/reset-password/${encodeURIComponent(token)}`).then((r) => r.data.data);
}

export function resetPassword(token, password, confirmPassword) {
  return authApi
    .post('/reset-password', { token, password, confirmPassword })
    .then((r) => r.data.data);
}

export function verifyEmail(token) {
  return authApi.get(`/verify-email/${encodeURIComponent(token)}`).then((r) => r.data.data);
}
