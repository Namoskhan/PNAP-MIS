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
async function buildFormData(payload, files) {
  const fd = new FormData();

  // Append text payload fields
  Object.entries(payload || {}).forEach(([key, val]) => {
    if (val !== undefined && val !== null) {
      if (typeof val === 'object' && !(val instanceof Blob) && !(val instanceof File)) {
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
          const res = await fetch(f.dataUrl);
          const blob = await res.blob();
          fd.append(fieldName, blob, fileName);
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
 * Main synchronizer: Processes pending offline items and dispatches them to server
 */
export async function syncOfflineQueue(onProgress) {
  if (isSyncInProgress) {
    return { skipped: true, reason: 'Sync already in progress' };
  }

  isSyncInProgress = true;
  notifySyncListeners({ isSyncing: true });

  const queue = await getOfflineQueue();
  const pendingItems = queue.filter(
    (item) => item.status === 'PENDING' || item.status === 'FAILED'
  );

  let syncedCount = 0;
  let failedCount = 0;
  let networkStopped = false;

  try {
    for (const item of pendingItems) {
      // Notify current progress
      if (onProgress) {
        onProgress({ currentItem: item, syncedCount, total: pendingItems.length });
      }

      await updateOfflineAction(item.id, { status: 'SYNCING' });

      try {
        let requestData;
        const headers = {};

        if (Array.isArray(item.files) && item.files.length > 0) {
          requestData = await buildFormData(item.payload, item.files);
          headers['Content-Type'] = 'multipart/form-data';
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
        if (isNetworkError(err)) {
          // Network connection dropped midway: revert item to PENDING and stop
          await updateOfflineAction(item.id, { status: 'PENDING' });
          networkStopped = true;
          break;
        } else {
          // Client or server logic error (e.g. 400 Bad Request, validation fail)
          const errorMsg = errorMessage(err);
          const retryCount = (item.retryCount || 0) + 1;
          await updateOfflineAction(item.id, {
            status: retryCount >= 3 ? 'FAILED' : 'PENDING',
            retryCount,
            error: errorMsg,
          });
          failedCount += 1;
        }
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
