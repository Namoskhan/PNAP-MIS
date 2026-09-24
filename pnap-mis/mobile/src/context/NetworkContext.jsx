import React, { createContext, useContext, useEffect, useState, useCallback, useRef } from 'react';
import { Platform } from 'react-native';
import NetInfo from '@react-native-community/netinfo';
import {
  getOfflineQueue,
  subscribeQueue,
  enqueueOfflineAction,
  getCache,
  setCache,
} from '../services/offlineStorage';
import {
  syncOfflineQueue,
  subscribeSyncStatus,
  getIsSyncing,
} from '../services/offlineSync';

const NetworkContext = createContext(null);

export function NetworkProvider({ children }) {
  const [isOnline, setIsOnline] = useState(true);
  const [isInternetReachable, setIsInternetReachable] = useState(true);
  const [pendingCount, setPendingCount] = useState(0);
  const [isSyncing, setIsSyncing] = useState(false);
  const [lastSyncResult, setLastSyncResult] = useState(null);
  const wasOffline = useRef(false);

  // Update pending queue count
  const refreshPendingCount = useCallback(async () => {
    try {
      const queue = await getOfflineQueue();
      const count = queue.filter(
        (i) => i.status === 'PENDING' || i.status === 'FAILED'
      ).length;
      setPendingCount(count);
    } catch {
      setPendingCount(0);
    }
  }, []);

  // Trigger synchronization
  const syncNow = useCallback(async (showToast) => {
    if (getIsSyncing()) return;
    setIsSyncing(true);
    try {
      const res = await syncOfflineQueue();
      setLastSyncResult(res);
      await refreshPendingCount();
      return res;
    } catch (err) {
      console.warn('[NetworkContext] syncNow error:', err);
    } finally {
      setIsSyncing(false);
    }
  }, [refreshPendingCount]);

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
    isSyncing,
    lastSyncResult,
    syncNow,
    refreshPendingCount,
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
