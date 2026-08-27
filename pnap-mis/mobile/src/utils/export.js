import { Platform } from 'react-native';
import * as FileSystem from 'expo-file-system/legacy';
import * as Sharing from 'expo-sharing';
import { Storage } from './storage';
import { API_BASE } from '../api/client';

/**
 * Download a file from the backend (with bearer token auth) and save/open it.
 * - On Web: creates an invisible download link and triggers browser file download.
 * - On Native: downloads to cache directory via expo-file-system and opens native share dialog via expo-sharing.
 *
 * @param {string} path - Endpoint path, e.g. '/exports/unit/meetings/pdf'
 * @param {string} filename - Target file name, e.g. 'central-meetings.pdf'
 * @param {object|URLSearchParams} [params] - Query parameters
 */
export async function downloadAndShare(path, filename, params = {}) {
  const token = await Storage.getItem('pnap_token');

  let qs = '';
  if (params instanceof URLSearchParams) {
    qs = params.toString() ? `?${params.toString()}` : '';
  } else if (params && typeof params === 'object') {
    const searchParams = new URLSearchParams();
    Object.entries(params).forEach(([k, v]) => {
      if (v !== undefined && v !== null && v !== '') {
        searchParams.append(k, String(v));
      }
    });
    const str = searchParams.toString();
    qs = str ? `?${str}` : '';
  }

  // Ensure path starts with / and remove duplicate /api if present
  const cleanPath = path.startsWith('/api') ? path : (path.startsWith('/') ? path : `/${path}`);
  const url = `${API_BASE}${cleanPath.replace(/^\/api/, '')}${qs}`;

  if (Platform.OS === 'web') {
    const res = await fetch(url, {
      headers: token ? { Authorization: `Bearer ${token}` } : {},
    });
    if (!res.ok) {
      let msg = `Server returned ${res.status}`;
      try {
        const errJson = await res.json();
        if (errJson?.error?.message) msg = errJson.error.message;
      } catch {
        // fallback to status code
      }
      throw new Error(msg);
    }
    const blob = await res.blob();
    const blobUrl = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = blobUrl;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => window.URL.revokeObjectURL(blobUrl), 1000);
    return;
  }

  // Native (iOS/Android)
  const localUri = `${FileSystem.cacheDirectory}${filename}`;
  try {
    const result = await FileSystem.downloadAsync(url, localUri, {
      headers: token ? { Authorization: `Bearer ${token}` } : {},
    });
    if (result.status !== 200) {
      throw new Error(`Server returned ${result.status}`);
    }
    if (await Sharing.isAvailableAsync()) {
      await Sharing.shareAsync(result.uri, {
        mimeType: filename.endsWith('.pdf')
          ? 'application/pdf'
          : 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        dialogTitle: `Open ${filename}`,
      });
    }
  } catch (e) {
    throw new Error(e.message || 'Download failed');
  }
}
