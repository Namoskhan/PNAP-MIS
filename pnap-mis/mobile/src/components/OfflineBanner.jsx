import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ActivityIndicator,
  Modal,
  ScrollView,
  SafeAreaView,
  Platform,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useNetwork } from '../context/NetworkContext';
import { Colors, FontSize, Spacing, Radius } from '../constants/colors';
import { getOfflineQueue, removeOfflineAction } from '../services/offlineStorage';
import { shortDate } from '../utils/formatters';

export default function OfflineBanner() {
  const insets = useSafeAreaInsets();
  const { isOnline, pendingCount, failedCount, isSyncing, syncNow, clearFailed, retryFailed } = useNetwork();
  const [showQueueModal, setShowQueueModal] = useState(false);
  const [queueItems, setQueueItems] = useState([]);
  const [loadingQueue, setLoadingQueue] = useState(false);

  // If online and nothing is pending/failed and not syncing, show nothing
  const shouldShow = !isOnline || pendingCount > 0 || (failedCount || 0) > 0 || isSyncing;

  async function openQueue() {
    setLoadingQueue(true);
    setShowQueueModal(true);
    try {
      const items = await getOfflineQueue();
      setQueueItems(items);
    } finally {
      setLoadingQueue(false);
    }
  }

  async function handleRemove(id) {
    await removeOfflineAction(id);
    const updated = await getOfflineQueue();
    setQueueItems(updated);
  }

  async function handleClearFailed() {
    if (clearFailed) await clearFailed();
    const updated = await getOfflineQueue();
    setQueueItems(updated);
  }

  async function handleRetryFailed() {
    if (retryFailed) await retryFailed();
    const updated = await getOfflineQueue();
    setQueueItems(updated);
  }

  if (!shouldShow) return null;

  const hasFailed = (failedCount || 0) > 0;

  return (
    <>
      <View
        style={[
          styles.container,
          !isOnline ? styles.offlineBg : (hasFailed && pendingCount === 0 ? styles.failedBg : styles.syncBg),
          Platform.OS !== 'web' && insets.top > 0 ? { paddingTop: insets.top + 4 } : null,
        ]}
      >
        <TouchableOpacity
          style={styles.content}
          onPress={openQueue}
          activeOpacity={0.8}
        >
          <View style={styles.leftRow}>
            {isSyncing ? (
              <ActivityIndicator size="small" color="#fff" style={styles.icon} />
            ) : !isOnline ? (
              <Ionicons
                name="cloud-offline-outline"
                size={16}
                color="#fff"
                style={styles.icon}
              />
            ) : hasFailed && pendingCount === 0 ? (
              <Ionicons
                name="alert-circle-outline"
                size={16}
                color="#fff"
                style={styles.icon}
              />
            ) : (
              <Ionicons
                name="cloud-upload-outline"
                size={16}
                color="#fff"
                style={styles.icon}
              />
            )}

            <Text style={styles.text} numberOfLines={1}>
              {isSyncing
                ? 'Syncing offline records with server...'
                : !isOnline
                ? `Offline Mode ${pendingCount > 0 ? `• ${pendingCount} pending sync` : '• Changes saved locally'}${hasFailed ? ` (${failedCount} failed)` : ''}`
                : pendingCount > 0
                ? `${pendingCount} offline ${pendingCount === 1 ? 'item' : 'items'} ready to sync${hasFailed ? ` (${failedCount} failed)` : ''}`
                : `${failedCount} item${failedCount === 1 ? '' : 's'} failed validation • Tap to view`}
            </Text>
          </View>

          <View style={styles.rightActions}>
            {isOnline && pendingCount > 0 && !isSyncing && (
              <TouchableOpacity
                style={styles.syncBtn}
                onPress={() => syncNow()}
                activeOpacity={0.7}
              >
                <Ionicons name="refresh" size={13} color="#fff" />
                <Text style={styles.syncBtnText}>Sync Now</Text>
              </TouchableOpacity>
            )}

            <Ionicons
              name="chevron-forward"
              size={14}
              color="rgba(255,255,255,0.8)"
              style={{ marginLeft: 4 }}
            />
          </View>
        </TouchableOpacity>
      </View>

      {/* Queue Details Modal */}
      <Modal
        visible={showQueueModal}
        transparent
        animationType="slide"
        onRequestClose={() => setShowQueueModal(false)}
      >
        <SafeAreaView style={styles.modalOverlay}>
          <View style={styles.modalCard}>
            <View style={styles.modalHeader}>
              <View style={{ flex: 1 }}>
                <Text style={styles.modalTitle}>Offline Storage & Sync Queue</Text>
                <Text style={styles.modalSubtitle}>
                  {isOnline ? 'Online • Ready to sync' : 'Offline • Stored on this device'}
                </Text>
              </View>
              <TouchableOpacity
                onPress={() => setShowQueueModal(false)}
                style={styles.closeBtn}
              >
                <Ionicons name="close" size={22} color={Colors.text} />
              </TouchableOpacity>
            </View>

            <ScrollView style={styles.modalBody}>
              {loadingQueue ? (
                <ActivityIndicator size="large" color={Colors.primary} style={{ marginVertical: 30 }} />
              ) : queueItems.length === 0 ? (
                <View style={styles.emptyContainer}>
                  <Ionicons name="checkmark-circle-outline" size={48} color={Colors.success} />
                  <Text style={styles.emptyTitle}>Queue is empty</Text>
                  <Text style={styles.emptySubtitle}>All offline items have been synchronized.</Text>
                </View>
              ) : (
                queueItems.map((item) => (
                  <View key={item.id} style={styles.queueItemCard}>
                    <View style={styles.queueItemHeader}>
                      <View style={styles.entityBadge}>
                        <Text style={styles.entityBadgeText}>{item.entityType}</Text>
                      </View>
                      <View
                        style={[
                          styles.statusBadge,
                          item.status === 'FAILED'
                            ? styles.statusFailed
                            : item.status === 'SYNCING'
                            ? styles.statusSyncing
                            : styles.statusPending,
                        ]}
                      >
                        <Text style={styles.statusBadgeText}>{item.status}</Text>
                      </View>
                    </View>

                    <Text style={styles.queueItemTitle}>{item.displayTitle}</Text>
                    <Text style={styles.queueItemEndpoint}>
                      {item.method} {item.endpoint}
                    </Text>

                    {item.files && item.files.length > 0 && (
                      <View style={styles.fileRow}>
                        <Ionicons name="attach" size={14} color={Colors.textMuted} />
                        <Text style={styles.fileText}>
                          {item.files.length} attached {item.files.length === 1 ? 'file' : 'files'}
                        </Text>
                      </View>
                    )}

                    {item.error ? (
                      <Text style={styles.errorText}>Error: {item.error}</Text>
                    ) : null}

                    <View style={styles.queueItemFooter}>
                      <Text style={styles.timeText}>
                        {new Date(item.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                      </Text>
                      <TouchableOpacity
                        onPress={() => handleRemove(item.id)}
                        style={styles.discardBtn}
                      >
                        <Text style={styles.discardBtnText}>Discard</Text>
                      </TouchableOpacity>
                    </View>
                  </View>
                ))
              )}
            </ScrollView>

            <View style={styles.modalFooter}>
              {hasFailed && (
                <TouchableOpacity
                  style={styles.modalClearFailedBtn}
                  onPress={handleClearFailed}
                >
                  <Ionicons name="trash-outline" size={15} color="#DC2626" style={{ marginRight: 4 }} />
                  <Text style={styles.modalClearFailedText}>Discard Failed</Text>
                </TouchableOpacity>
              )}

              {isOnline && hasFailed && (
                <TouchableOpacity
                  style={styles.modalRetryFailedBtn}
                  disabled={isSyncing}
                  onPress={handleRetryFailed}
                >
                  <Ionicons name="reload" size={15} color="#0284C7" style={{ marginRight: 4 }} />
                  <Text style={styles.modalRetryFailedText}>Retry Failed</Text>
                </TouchableOpacity>
              )}

              {isOnline && pendingCount > 0 ? (
                <TouchableOpacity
                  style={[styles.modalSyncBtn, isSyncing && { opacity: 0.6 }]}
                  disabled={isSyncing}
                  onPress={async () => {
                    await syncNow();
                    const updated = await getOfflineQueue();
                    setQueueItems(updated);
                  }}
                >
                  {isSyncing ? (
                    <ActivityIndicator size="small" color="#fff" />
                  ) : (
                    <>
                      <Ionicons name="cloud-upload" size={18} color="#fff" style={{ marginRight: 6 }} />
                      <Text style={styles.modalSyncBtnText}>Sync All Now</Text>
                    </>
                  )}
                </TouchableOpacity>
              ) : (
                <TouchableOpacity
                  style={styles.modalCloseBtn}
                  onPress={() => setShowQueueModal(false)}
                >
                  <Text style={styles.modalCloseBtnText}>Close</Text>
                </TouchableOpacity>
              )}
            </View>
          </View>
        </SafeAreaView>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  container: {
    width: '100%',
    paddingVertical: 7,
    paddingHorizontal: 14,
    zIndex: 9999,
  },
  offlineBg: {
    backgroundColor: '#D97706', // Warm Amber
  },
  failedBg: {
    backgroundColor: '#DC2626', // Crimson Red for failed items
  },
  syncBg: {
    backgroundColor: '#0284C7', // Sky Blue
  },
  content: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  leftRow: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
    marginRight: 8,
  },
  icon: {
    marginRight: 8,
  },
  text: {
    color: '#fff',
    fontSize: 12,
    fontWeight: '600',
    flexShrink: 1,
  },
  rightActions: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  syncBtn: {
    backgroundColor: 'rgba(255, 255, 255, 0.25)',
    paddingVertical: 3,
    paddingHorizontal: 8,
    borderRadius: Radius.sm,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  syncBtnText: {
    color: '#fff',
    fontSize: 11,
    fontWeight: '700',
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.55)',
    justifyContent: 'flex-end',
  },
  modalCard: {
    backgroundColor: '#fff',
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    maxHeight: '85%',
    paddingBottom: Platform.OS === 'ios' ? 24 : 16,
  },
  modalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
  },
  modalTitle: {
    fontSize: FontSize.lg,
    fontWeight: '700',
    color: Colors.text,
  },
  modalSubtitle: {
    fontSize: FontSize.xs,
    color: Colors.textMuted,
    marginTop: 2,
  },
  closeBtn: {
    padding: 6,
  },
  modalBody: {
    padding: 16,
  },
  emptyContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 40,
  },
  emptyTitle: {
    fontSize: FontSize.md,
    fontWeight: '700',
    color: Colors.text,
    marginTop: 12,
  },
  emptySubtitle: {
    fontSize: FontSize.sm,
    color: Colors.textMuted,
    marginTop: 4,
  },
  queueItemCard: {
    backgroundColor: Colors.surface,
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: Radius.md,
    padding: 12,
    marginBottom: 10,
  },
  queueItemHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 6,
  },
  entityBadge: {
    backgroundColor: Colors.primaryLight || '#e0f2fe',
    paddingHorizontal: 7,
    paddingVertical: 2,
    borderRadius: 4,
  },
  entityBadgeText: {
    fontSize: 10,
    fontWeight: '700',
    color: Colors.primary,
  },
  statusBadge: {
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
  },
  statusPending: {
    backgroundColor: '#FEF3C7',
  },
  statusSyncing: {
    backgroundColor: '#E0F2FE',
  },
  statusFailed: {
    backgroundColor: '#FEE2E2',
  },
  statusBadgeText: {
    fontSize: 10,
    fontWeight: '700',
    color: Colors.text,
  },
  queueItemTitle: {
    fontSize: FontSize.sm,
    fontWeight: '600',
    color: Colors.text,
    marginBottom: 2,
  },
  queueItemEndpoint: {
    fontSize: 11,
    color: Colors.textMuted,
    fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
  },
  fileRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginTop: 4,
  },
  fileText: {
    fontSize: 11,
    color: Colors.textMuted,
  },
  errorText: {
    fontSize: 11,
    color: Colors.error,
    marginTop: 4,
  },
  queueItemFooter: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 8,
    paddingTop: 8,
    borderTopWidth: 1,
    borderTopColor: Colors.border,
  },
  timeText: {
    fontSize: 11,
    color: Colors.textMuted,
  },
  discardBtn: {
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  discardBtnText: {
    fontSize: 11,
    color: Colors.error,
    fontWeight: '600',
  },
  modalFooter: {
    paddingHorizontal: 16,
    paddingTop: 10,
  },
  modalSyncBtn: {
    backgroundColor: Colors.primary,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 12,
    borderRadius: Radius.md,
  },
  modalSyncBtnText: {
    color: '#fff',
    fontSize: FontSize.md,
    fontWeight: '700',
  },
  modalClearFailedBtn: {
    backgroundColor: '#FEE2E2',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 10,
    borderRadius: Radius.md,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: '#FECACA',
  },
  modalClearFailedText: {
    color: '#DC2626',
    fontSize: FontSize.sm,
    fontWeight: '700',
  },
  modalRetryFailedBtn: {
    backgroundColor: '#E0F2FE',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 10,
    borderRadius: Radius.md,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: '#BAE6FD',
  },
  modalRetryFailedText: {
    color: '#0284C7',
    fontSize: FontSize.sm,
    fontWeight: '700',
  },
  modalCloseBtn: {
    backgroundColor: Colors.surface,
    borderWidth: 1,
    borderColor: Colors.border,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 12,
    borderRadius: Radius.md,
  },
  modalCloseBtnText: {
    color: Colors.text,
    fontSize: FontSize.md,
    fontWeight: '600',
  },
});
