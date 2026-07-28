import { api } from './client';

// Branding API surface. The provider always fetches the PUBLIC
// endpoint for global theming because it works pre-auth (login
// page) AND post-auth (everywhere else). Admin settings pages hit
// the authenticated /settings endpoints directly when they need
// the full dashboard / reportBranding payload that the public
// projection deliberately redacts.

export function fetchPublicBranding() {
  return api.get('/public/branding').then((r) => r.data?.data || null);
}

export function fetchSettings() {
  return api.get('/settings').then((r) => r.data?.data || null);
}

export function patchSettings(patch) {
  return api.patch('/settings', patch).then((r) => r.data?.data);
}

export function listPresets() {
  return api.get('/settings/theme/presets').then((r) => r.data?.data || []);
}

export function applyPreset(name) {
  return api.post(`/settings/theme/apply-preset/${name}`).then((r) => r.data?.data);
}

export function listVersions(params) {
  return api.get('/settings/versions', { params }).then((r) => r.data?.data || []);
}

export function restoreVersion(n, body) {
  return api.post(`/settings/versions/${n}/restore`, body || {}).then((r) => r.data?.data);
}

export function exportSettings() {
  return api.get('/settings/export').then((r) => r.data?.data);
}

export function resetSettings() {
  return api.post('/settings/reset').then((r) => r.data?.data);
}

// Multipart upload for one logo slot. The `file` arg is a File from
// an <input type="file">. axios picks up FormData and sets the
// Content-Type boundary automatically — don't override headers.
export function uploadLogo(slot, file) {
  const fd = new FormData();
  fd.append('logo', file);
  return api.post(`/settings/logos/${slot}`, fd).then((r) => r.data?.data);
}

export function resetLogo(slot) {
  return api.post(`/settings/logos/${slot}/reset`).then((r) => r.data?.data);
}
