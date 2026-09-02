import { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  SafeAreaView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { api } from '../../src/api/client';
import Card from '../../src/components/Card';
import EmptyState from '../../src/components/EmptyState';
import { Colors, FontSize, Spacing } from '../../src/constants/colors';
import { relativeTime } from '../../src/utils/formatters';

export default function NotificationsScreen() {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  async function load(silent = false) {
    if (!silent) setLoading(true);
    try {
      const res = await api.get('/notifications');
      setItems(res.data.data || []);
    } catch { /* ignore */ } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }

  useEffect(() => { load(); }, []);

  async function markRead(id) {
    await api.patch(`/notifications/${id}/read`).catch(() => {});
    setItems((prev) => prev.map((n) => n._id === id ? { ...n, read: true } : n));
  }

  async function markAllRead() {
    await api.patch('/notifications/read-all').catch(() => {});
    setItems((prev) => prev.map((n) => ({ ...n, read: true })));
  }

  function renderItem({ item: n }) {
    return (
      <TouchableOpacity onPress={() => !n.read && markRead(n._id)}>
        <Card style={[styles.card, !n.read && styles.cardUnread]}>
          <View style={styles.row}>
            {!n.read && <View style={styles.dot} />}
            <View style={styles.info}>
              <Text style={[styles.nTitle, !n.read && styles.bold]}>{n.title || 'Notification'}</Text>
              {n.body ? <Text style={styles.nBody} numberOfLines={2}>{n.body}</Text> : null}
              <Text style={styles.nTime}>{relativeTime(n.createdAt)}</Text>
            </View>
          </View>
        </Card>
      </TouchableOpacity>
    );
  }

  const unreadCount = items.filter((n) => !n.read).length;

  return (
    <SafeAreaView style={styles.safe}>
      {unreadCount > 0 && (
        <View style={styles.markAllBar}>
          <Text style={styles.unreadCount}>{unreadCount} unread</Text>
          <TouchableOpacity onPress={markAllRead}>
            <Text style={styles.markAll}>Mark all read</Text>
          </TouchableOpacity>
        </View>
      )}
      <FlatList
        data={items}
        renderItem={renderItem}
        keyExtractor={(n) => n._id}
        contentContainerStyle={styles.list}
        onRefresh={() => { setRefreshing(true); load(true); }}
        refreshing={refreshing}
        ListEmptyComponent={!loading && <EmptyState icon="🔔" title="No notifications" />}
        ListFooterComponent={loading && !refreshing ? <ActivityIndicator style={{ padding: 16 }} color={Colors.primary} /> : null}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: Colors.background },
  markAllBar: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: Spacing.md, backgroundColor: Colors.surface, borderBottomWidth: 1, borderBottomColor: Colors.border },
  unreadCount: { fontSize: FontSize.sm, color: Colors.textMuted },
  markAll: { fontSize: FontSize.sm, color: Colors.primary, fontWeight: '600' },
  list: { padding: Spacing.lg },
  card: { marginBottom: Spacing.sm },
  cardUnread: { borderLeftWidth: 3, borderLeftColor: Colors.primary },
  row: { flexDirection: 'row', alignItems: 'flex-start', gap: Spacing.sm },
  dot: { width: 8, height: 8, borderRadius: 4, backgroundColor: Colors.primary, marginTop: 5 },
  info: { flex: 1 },
  nTitle: { fontSize: FontSize.base, color: Colors.text, marginBottom: 2 },
  bold: { fontWeight: '700' },
  nBody: { fontSize: FontSize.sm, color: Colors.textMuted, lineHeight: 18, marginBottom: 4 },
  nTime: { fontSize: FontSize.xs, color: Colors.textLight },
});
