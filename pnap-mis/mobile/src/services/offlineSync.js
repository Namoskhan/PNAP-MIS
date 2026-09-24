import { Platform } from 'react-native';
import { api, isNetworkError, errorMessage } from '../api/client';
import {
  getOfflineQueue,
  updateOfflineAction,
  removeOfflineAction,
} from './offlineStorage';

let isSyncInProgress = false;
const syncListeners = new Set();

function notifySyncListeners(state) {
  syncListeners.forEach((listener) => {
    try {
      listener(state);
    } catch (e) {
      console.warn('[OfflineSync] listener error:', e);
    }
  });
}

/**
 * Reconstructs FormData with attached offline files
 */
/**
 * Reconstructs FormData with attached offline files
 */
async function buildFormData(payload, files) {
  const fd = new FormData();

  // Append text payload fields
  Object.entries(payload || {}).forEach(([key, val]) => {
    if (val !== undefined && val !== null) {
      if (typeof val === 'object' && !(val instanceof Blob) && (typeof File === 'undefined' || !(val instanceof File))) {
        fd.append(key, JSON.stringify(val));
      } else {
        fd.append(key, String(val));
      }
    }
  });

  // Append persisted files
  if (Array.isArray(files)) {
    for (const f of files) {
      const fieldName = f.fieldName || 'file';
      const fileName = f.name || 'upload.jpg';
      const fileType = f.type || 'image/jpeg';

      if (Platform.OS === 'web') {
        if (f.dataUrl) {
          try {
            const res = await fetch(f.dataUrl);
            const blob = await res.blob();
            fd.append(fieldName, blob, fileName);
          } catch {
            if (f.file) fd.append(fieldName, f.file, fileName);
          }
        } else if (f.file) {
          fd.append(fieldName, f.file, fileName);
        } else if (f.uri) {
          try {
            const res = await fetch(f.uri);
            const blob = await res.blob();
            fd.append(fieldName, blob, fileName);
          } catch {}
        }
      } else {
        fd.append(fieldName, {
          uri: f.uri,
          name: fileName,
          type: fileType,
        });
      }
    }
  }

  return fd;
}

/**
 * Main synchronizer: Processes pending offline items and dispatches them to server.
 * Only processes PENDING items by default. FAILED items require explicit retry.
 */
export async function syncOfflineQueue(options = {}) {
  const { onProgress, retryFailed = false } =
    typeof options === 'function' ? { onProgress: options } : options;

  if (isSyncInProgress) {
    return { skipped: true, reason: 'Sync already in progress' };
  }

  isSyncInProgress = true;
  notifySyncListeners({ isSyncing: true });

  const queue = await getOfflineQueue();
  // IMPORTANT: Auto-sync ONLY processes PENDING items to avoid infinite error loops
  const targetItems = queue.filter(
    (item) => item.status === 'PENDING' || (retryFailed && item.status === 'FAILED')
  );

  let syncedCount = 0;
  let failedCount = 0;
  let networkStopped = false;

  try {
    for (const item of targetItems) {
      if (onProgress) {
        onProgress({ currentItem: item, syncedCount, total: targetItems.length });
      }

      await updateOfflineAction(item.id, { status: 'SYNCING' });

      try {
        let requestData;
        const headers = {};

        if (Array.isArray(item.files) && item.files.length > 0) {
          requestData = await buildFormData(item.payload, item.files);
          // On native React Native, explicitly set multipart/form-data.
          // On Web, omit Content-Type so browser sets boundary automatically.
          if (Platform.OS !== 'web') {
            headers['Content-Type'] = 'multipart/form-data';
          }
        } else {
          requestData = item.payload;
        }

        await api.request({
          url: item.endpoint,
          method: item.method || 'POST',
          data: requestData,
          headers,
          timeout: 25000,
        });

        // Success: Remove from offline queue
        await removeOfflineAction(item.id);
        syncedCount += 1;
      } catch (err) {
        const httpStatus = err.response?.status;

        // If rate-limited (HTTP 429), back off immediately and keep as PENDING
        if (httpStatus === 429) {
          await updateOfflineAction(item.id, {
            status: 'PENDING',
            error: 'Server rate limit exceeded (429). Pausing sync.',
          });
          networkStopped = true;
          break;
        }

        if (isNetworkError(err)) {
          // Network connection dropped midway: revert item to PENDING and stop
          await updateOfflineAction(item.id, { status: 'PENDING' });
          networkStopped = true;
          break;
        }

        // Semantic / Validation errors (400, 422, 403, 404):
        // These will never succeed on automated retry without fixing data.
        // Mark as FAILED immediately to halt looping.
        const isClientError = httpStatus >= 400 && httpStatus < 500;
        const errorMsg = errorMessage(err);
        const retryCount = (item.retryCount || 0) + 1;
        const nextStatus = isClientError || retryCount >= 2 ? 'FAILED' : 'PENDING';

        await updateOfflineAction(item.id, {
          status: nextStatus,
          retryCount,
          error: errorMsg,
        });
        failedCount += 1;
      }
    }
  } finally {
    isSyncInProgress = false;
    const finalQueue = await getOfflineQueue();
    const remaining = finalQueue.filter((i) => i.status === 'PENDING').length;

    notifySyncListeners({
      isSyncing: false,
      syncedCount,
      failedCount,
      remaining,
      networkStopped,
      lastSyncTime: new Date().toISOString(),
    });
  }

  return {
    syncedCount,
    failedCount,
    networkStopped,
    remaining: (await getOfflineQueue()).length,
  };
}

export function subscribeSyncStatus(listener) {
  syncListeners.add(listener);
  return () => {
    syncListeners.delete(listener);
  };
}

export function getIsSyncing() {
  return isSyncInProgress;
}
