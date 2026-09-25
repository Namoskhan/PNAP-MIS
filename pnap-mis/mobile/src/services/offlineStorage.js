import AsyncStorage from '@react-native-async-storage/async-storage';
import { Platform } from 'react-native';
import * as FileSystem from 'expo-file-system';

const QUEUE_STORAGE_KEY = 'pnap_offline_queue';
const CACHE_PREFIX = 'pnap_cache_';
const OFFLINE_MEDIA_DIR = `${FileSystem.documentDirectory || ''}pnap_offline_media/`;

// Listeners for queue changes
const queueListeners = new Set();
let notifyTimer = null;

function notifyListeners(queue) {
  if (notifyTimer) clearTimeout(notifyTimer);
  notifyTimer = setTimeout(() => {
    queueListeners.forEach((listener) => {
      try {
        listener(queue);
      } catch (e) {
        console.warn('[OfflineStorage] listener error:', e);
      }
    });
  }, 400);
}

/**
 * Universal Key-Value Storage wrapper using AsyncStorage
 */
export const AppStorage = {
  async getItem(key) {
    try {
      return await AsyncStorage.getItem(key);
    } catch {
      if (Platform.OS === 'web' && typeof window !== 'undefined' && window.localStorage) {
        return window.localStorage.getItem(key);
      }
      return null;
    }
  },

  async setItem(key, value) {
    try {
      await AsyncStorage.setItem(key, value);
    } catch {
      if (Platform.OS === 'web' && typeof window !== 'undefined' && window.localStorage) {
        window.localStorage.setItem(key, value);
      }
    }
  },

  async removeItem(key) {
    try {
      await AsyncStorage.removeItem(key);
    } catch {
      if (Platform.OS === 'web' && typeof window !== 'undefined' && window.localStorage) {
        window.localStorage.removeItem(key);
      }
    }
  },
};

/**
 * Persists an attached file (image/document/receipt) so it survives
 * app restarts and offline durations.
 */
export async function persistOfflineFile(fileObj) {
  if (!fileObj) return null;

  try {
    const rawFile = (typeof File !== 'undefined' && fileObj instanceof File)
      ? fileObj
      : ((typeof Blob !== 'undefined' && fileObj instanceof Blob)
        ? fileObj
        : (fileObj.file || null));

    // Web: Convert File/Blob to base64 Data URL for persistent storage
    if (Platform.OS === 'web') {
      if (rawFile && typeof FileReader !== 'undefined') {
        const dataUrl = await new Promise((resolve, reject) => {
          const reader = new FileReader();
          reader.onload = () => resolve(reader.result);
          reader.onerror = reject;
          reader.readAsDataURL(rawFile);
        });
        return {
          fieldName: fileObj.fieldName || 'file',
          name: fileObj.name || rawFile.name || 'upload.jpg',
          type: fileObj.type || rawFile.type || 'image/jpeg',
          dataUrl,
        };
      }
      if (fileObj.uri && (fileObj.uri.startsWith('blob:') || fileObj.uri.startsWith('data:')) && typeof fetch !== 'undefined') {
        if (fileObj.uri.startsWith('data:')) {
          return {
            fieldName: fileObj.fieldName || 'file',
            name: fileObj.name || 'upload.jpg',
            type: fileObj.type || 'image/jpeg',
            dataUrl: fileObj.uri,
          };
        }
        const res = await fetch(fileObj.uri);
        const blob = await res.blob();
        const dataUrl = await new Promise((resolve, reject) => {
          const reader = new FileReader();
          reader.onload = () => resolve(reader.result);
          reader.onerror = reject;
          reader.readAsDataURL(blob);
        });
        return {
          fieldName: fileObj.fieldName || 'file',
          name: fileObj.name || 'upload.jpg',
          type: fileObj.type || blob.type || 'image/jpeg',
          dataUrl,
        };
      }
      return {
        fieldName: fileObj.fieldName || 'file',
        name: fileObj.name || 'upload.jpg',
        type: fileObj.type || 'image/jpeg',
        dataUrl: fileObj.uri || fileObj.dataUrl,
      };
    }

    // Native (Android / iOS): Copy file to permanent document directory
    if (FileSystem.documentDirectory && fileObj.uri) {
      const dirInfo = await FileSystem.getInfoAsync(OFFLINE_MEDIA_DIR);
      if (!dirInfo.exists) {
        await FileSystem.makeDirectoryAsync(OFFLINE_MEDIA_DIR, { intermediates: true });
      }
      const fileName = `${Date.now()}_${fileObj.name || 'upload.jpg'}`.replace(/[^a-zA-Z0-9._-]/g, '_');
      const targetUri = `${OFFLINE_MEDIA_DIR}${fileName}`;
      await FileSystem.copyAsync({ from: fileObj.uri, to: targetUri });

      return {
        fieldName: fileObj.fieldName || 'file',
        name: fileObj.name || fileName,
        type: fileObj.type || 'image/jpeg',
        uri: targetUri,
      };
    }
  } catch (err) {
    console.warn('[OfflineStorage] Error persisting offline file:', err);
  }

  return fileObj;
}

/**
 * Cache Management for GET queries
 */
export async function setCache(key, data) {
  try {
    const payload = JSON.stringify({
      timestamp: Date.now(),
      data,
    });
    await AppStorage.setItem(`${CACHE_PREFIX}${key}`, payload);
  } catch (err) {
    console.warn('[OfflineStorage] Failed to set cache for', key, err);
  }
}

export async function getCache(key, maxAgeMs = 0) {
  try {
    const raw = await AppStorage.getItem(`${CACHE_PREFIX}${key}`);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (maxAgeMs > 0 && Date.now() - parsed.timestamp > maxAgeMs) {
      return null;
    }
    return parsed.data;
  } catch {
    return null;
  }
}

export async function removeCache(key) {
  try {
    await AppStorage.removeItem(`${CACHE_PREFIX}${key}`);
  } catch {}
}

/**
 * Offline Sync Queue Management
 */
export async function getOfflineQueue() {
  try {
    const raw = await AppStorage.getItem(QUEUE_STORAGE_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

export async function getPendingQueue() {
  const queue = await getOfflineQueue();
  return queue.filter((item) => item.status === 'PENDING' || item.status === 'FAILED');
}

export async function enqueueOfflineAction({
  entityType,
  action = 'CREATE',
  endpoint,
  method = 'POST',
  payload = {},
  files = [],
  displayTitle = '',
  localRecord = null,
}) {
  const queue = await getOfflineQueue();

  // If this action targets a locally generated offline ID (e.g. /responsibilities/offline_...):
  const endpointOfflineIdMatch = endpoint && endpoint.match(/\/([a-zA-Z0-9_-]+)?(offline_[a-zA-Z0-9_.-]+)/);
  const targetOfflineId = endpointOfflineIdMatch ? endpointOfflineIdMatch[2] : null;

  if (targetOfflineId) {
    // Look for an existing pending CREATE item for this entity
    const existingIndex = queue.findIndex(
      (item) =>
        item.status === 'PENDING' &&
        (item.id === targetOfflineId ||
          item.localRecord?._id === targetOfflineId ||
          item.payload?._id === targetOfflineId)
    );

    if (existingIndex !== -1) {
      if (method === 'DELETE' || action === 'DELETE') {
        // Entity was created offline and deleted offline before ever syncing to backend:
        // Simply remove the pending CREATE action from queue!
        const removed = queue.splice(existingIndex, 1)[0];
        await AppStorage.setItem(QUEUE_STORAGE_KEY, JSON.stringify(queue));
        notifyListeners(queue);
        return { cancelled: true, removed };
      }

      if (method === 'PATCH' || method === 'PUT' || action === 'UPDATE') {
        // Merge updates directly into the pending CREATE item's payload and localRecord:
        const existing = queue[existingIndex];
        const updatedPayload = { ...existing.payload, ...payload };
        const updatedLocal = existing.localRecord ? { ...existing.localRecord, ...payload } : null;
        queue[existingIndex] = {
          ...existing,
          payload: updatedPayload,
          localRecord: updatedLocal,
          displayTitle: displayTitle || existing.displayTitle,
        };
        await AppStorage.setItem(QUEUE_STORAGE_KEY, JSON.stringify(queue));
        notifyListeners(queue);
        return queue[existingIndex];
      }
    }
  }

  // Persist any attached files
  const persistedFiles = [];
  if (Array.isArray(files) && files.length > 0) {
    for (const f of files) {
      const saved = await persistOfflineFile(f);
      if (saved) persistedFiles.push(saved);
    }
  }

  const id = localRecord?._id || `offline_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`;
  const item = {
    id,
    entityType, // 'MEETING' | 'ACTIVITY' | 'DONATION' | 'EXPENSE' | 'TRANSFER' | 'RESPONSIBILITY' | 'MEMBER'
    action,
    endpoint,
    method,
    payload,
    files: persistedFiles,
    displayTitle: displayTitle || `${entityType} (${action})`,
    localRecord: localRecord ? { ...localRecord, _id: id, _isOffline: true } : null,
    status: 'PENDING', // 'PENDING' | 'SYNCING' | 'FAILED'
    retryCount: 0,
    error: null,
    createdAt: new Date().toISOString(),
  };

  queue.push(item);
  await AppStorage.setItem(QUEUE_STORAGE_KEY, JSON.stringify(queue));
  notifyListeners(queue);
  return item;
}

export async function updateOfflineAction(id, updates) {
  const queue = await getOfflineQueue();
  const index = queue.findIndex((item) => item.id === id);
  if (index === -1) return null;

  queue[index] = { ...queue[index], ...updates };
  await AppStorage.setItem(QUEUE_STORAGE_KEY, JSON.stringify(queue));
  notifyListeners(queue);
  return queue[index];
}

export async function removeOfflineAction(id) {
  const queue = await getOfflineQueue();
  const itemToRemove = queue.find((i) => i.id === id);

  // Clean up any copied files on native
  if (itemToRemove && Array.isArray(itemToRemove.files)) {
    for (const file of itemToRemove.files) {
      if (file.uri && file.uri.includes(OFFLINE_MEDIA_DIR)) {
        try {
          await FileSystem.deleteAsync(file.uri, { idempotent: true });
        } catch {}
      }
    }
  }

  const updatedQueue = queue.filter((item) => item.id !== id);
  await AppStorage.setItem(QUEUE_STORAGE_KEY, JSON.stringify(updatedQueue));
  notifyListeners(updatedQueue);
  return updatedQueue;
}

export async function clearOfflineQueue() {
  await AppStorage.removeItem(QUEUE_STORAGE_KEY);
  notifyListeners([]);
}

export async function clearFailedOfflineActions() {
  const queue = await getOfflineQueue();
  const kept = queue.filter((i) => i.status !== 'FAILED');
  await AppStorage.setItem(QUEUE_STORAGE_KEY, JSON.stringify(kept));
  notifyListeners(kept);
  return kept;
}

export async function resetFailedToPending() {
  const queue = await getOfflineQueue();
  const updated = queue.map((i) =>
    i.status === 'FAILED' ? { ...i, status: 'PENDING', retryCount: 0, error: null } : i
  );
  await AppStorage.setItem(QUEUE_STORAGE_KEY, JSON.stringify(updated));
  notifyListeners(updated);
  return updated;
}

/**
 * Returns optimistic offline items for a specific entity type
 * to be displayed in lists before they sync with the server.
 */
export async function getOfflineEntities(entityType) {
  const queue = await getOfflineQueue();
  return queue
    .filter((i) => i.entityType === entityType && (i.status === 'PENDING' || i.status === 'SYNCING' || i.status === 'FAILED'))
    .map((i) => {
      if (i.localRecord) {
        return {
          ...i.localRecord,
          _id: i.id,
          _isOffline: true,
          _offlineStatus: i.status,
          _offlineCreatedAt: i.createdAt,
        };
      }
      return {
        _id: i.id,
        _isOffline: true,
        _offlineStatus: i.status,
        _offlineCreatedAt: i.createdAt,
        ...i.payload,
      };
    });
}

/**
 * Subscribe to offline queue changes (for real-time badge updates)
 */
export function subscribeQueue(listener) {
  queueListeners.add(listener);
  return () => {
    queueListeners.delete(listener);
  };
}
