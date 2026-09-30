import React, { createContext, useContext, useEffect, useState, useCallback, useRef } from 'react';
import { Platform } from 'react-native';
import NetInfo from '@react-native-community/netinfo';
import {
  getOfflineQueue,
  subscribeQueue,
  enqueueOfflineAction,
  getCache,
  setCache,
  clearFailedOfflineActions,
  resetFailedToPending,
} from '../services/offlineStorage';
import {
  syncOfflineQueue,
  subscribeSyncStatus,
  getIsSyncing,
} from '../services/offlineSync';
import { setNetworkOnlineState } from '../api/client';

const NetworkContext = createContext(null);

export function NetworkProvider({ children }) {
  const initialWebOnline = Platform.OS === 'web' && typeof navigator !== 'undefined' ? navigator.onLine : true;
  const [isOnline, setIsOnline] = useState(initialWebOnline);
  const [isInternetReachable, setIsInternetReachable] = useState(initialWebOnline);

  useEffect(() => {
    setNetworkOnlineState(isOnline);
  }, [isOnline]);
  const [pendingCount, setPendingCount] = useState(0);
  const [failedCount, setFailedCount] = useState(0);
  const [isSyncing, setIsSyncing] = useState(false);
  const [lastSyncResult, setLastSyncResult] = useState(null);
  const wasOffline = useRef(false);
  const lastSyncTimeRef = useRef(0);

  // Update pending queue count (strictly separates PENDING from FAILED)
  const refreshPendingCount = useCallback(async () => {
    try {
      const queue = await getOfflineQueue();
      const pCount = queue.filter((i) => i.status === 'PENDING').length;
      const fCount = queue.filter((i) => i.status === 'FAILED').length;
      setPendingCount(pCount);
      setFailedCount(fCount);
    } catch {
      setPendingCount(0);
      setFailedCount(0);
    }
  }, []);

  // Trigger synchronization
  const syncNow = useCallback(async (options = {}) => {
    if (getIsSyncing()) return;
    const now = Date.now();
    // Throttle automatic sync triggers by 5s unless forced
    if (now - lastSyncTimeRef.current < 5000 && !options.force && !options.retryFailed) {
      return;
    }
    lastSyncTimeRef.current = now;

    setIsSyncing(true);
    try {
      const res = await syncOfflineQueue(options);
      setLastSyncResult(res);
      await refreshPendingCount();
      return res;
    } catch (err) {
      console.warn('[NetworkContext] syncNow error:', err);
    } finally {
      setIsSyncing(false);
    }
  }, [refreshPendingCount]);

  const clearFailed = useCallback(async () => {
    await clearFailedOfflineActions();
    await refreshPendingCount();
  }, [refreshPendingCount]);

  const retryFailed = useCallback(async () => {
    await resetFailedToPending();
    await refreshPendingCount();
    return syncNow({ retryFailed: true, force: true });
  }, [refreshPendingCount, syncNow]);

  // Subscribe to NetInfo network changes
  useEffect(() => {
    // Initial fetch of pending queue
    refreshPendingCount();

    // Listen to queue changes (e.g., when a form is saved offline)
    const unsubQueue = subscribeQueue((queue) => {
      const count = queue.filter(
        (i) => i.status === 'PENDING' || i.status === 'FAILED'
      ).length;
      setPendingCount(count);
    });

    // Listen to sync engine progress
    const unsubSync = subscribeSyncStatus((status) => {
      setIsSyncing(status.isSyncing);
      if (!status.isSyncing) {
        refreshPendingCount();
      }
    });

    // NetInfo event listener
    const unsubNetInfo = NetInfo.addEventListener((state) => {
      const online = Boolean(state.isConnected && (state.isInternetReachable !== false));
      setIsOnline(online);
      setIsInternetReachable(state.isInternetReachable);

      // If we transitioned from offline to online, auto-sync!
      if (online && wasOffline.current) {
        wasOffline.current = false;
        syncNow();
      } else if (!online) {
        wasOffline.current = true;
      }
    });

    // Additional Web browser listeners
    if (Platform.OS === 'web' && typeof window !== 'undefined') {
      const handleOnline = () => {
        setIsOnline(true);
        if (wasOffline.current) {
          wasOffline.current = false;
          syncNow();
        }
      };
      const handleOffline = () => {
        setIsOnline(false);
        wasOffline.current = true;
      };

      window.addEventListener('online', handleOnline);
      window.addEventListener('offline', handleOffline);

      return () => {
        unsubQueue();
        unsubSync();
        unsubNetInfo();
        window.removeEventListener('online', handleOnline);
        window.removeEventListener('offline', handleOffline);
      };
    }

    return () => {
      unsubQueue();
      unsubSync();
      unsubNetInfo();
    };
  }, [refreshPendingCount, syncNow]);

  // Initial sync attempt if already online and has pending items
  useEffect(() => {
    if (isOnline && pendingCount > 0 && !isSyncing) {
      syncNow();
    }
  }, [isOnline, pendingCount]);

  const value = {
    isOnline,
    isInternetReachable,
    pendingCount,
    failedCount,
    isSyncing,
    lastSyncResult,
    syncNow,
    refreshPendingCount,
    clearFailed,
    retryFailed,
    enqueueOfflineAction,
    getCache,
    setCache,
  };

  return (
    <NetworkContext.Provider value={value}>
      {children}
    </NetworkContext.Provider>
  );
}

export function useNetwork() {
  const context = useContext(NetworkContext);
  if (!context) {
    throw new Error('useNetwork must be used within a NetworkProvider');
  }
  return context;
}
