import { useEffect, useState } from 'react';
import {
  ActivityIndicator, FlatList, SafeAreaView,
  StyleSheet, Text, TouchableOpacity, View,
} from 'react-native';
import { api, errorMessage } from '../../../src/api/client';
import { useAuth } from '../../../src/context/AuthContext';
import { isSuperAdmin } from '../../../src/utils/permissions';
import Card from '../../../src/components/Card';
import Badge from '../../../src/components/Badge';
import EmptyState from '../../../src/components/EmptyState';
import { Colors, FontSize, Spacing } from '../../../src/constants/colors';
import { relativeTime } from '../../../src/utils/formatters';

const ACTIONS = [
  '', 'USER_UPDATE', 'USER_RESET_PASSWORD', 'USER_DEACTIVATE', 'USER_ACTIVATE',
  'MEMBER_ADMIN_EDIT', 'MEMBER_RESET_PASSWORD', 'MEMBER_REMOVE', 'ROLE_FORCE_END',
];

const ACTION_COLORS = {
  USER_UPDATE: Colors.primary,
  USER_DEACTIVATE: Colors.error,
  USER_ACTIVATE: Colors.success,
  MEMBER_REMOVE: Colors.error,
  ROLE_FORCE_END: '#dc2626',
};

export default function AuditLogScreen() {
  const { user } = useAuth();
  const [items, setItems] = useState([]);
  const [total, setTotal] = useState(0);
  const [actionFilter, setActionFilter] = useState('');
  const [loading, setLoading] = useState(true);

  if (!isSuperAdmin(user)) {
    return (
      <SafeAreaView style={styles.safe}>
        <EmptyState icon="🔒" title="Super Admin access required" subtitle="The audit log is only accessible to SUPER_ADMIN." />
      </SafeAreaView>
    );
  }

  async function load() {
    setLoading(true);
    try {
      const params = { limit: 200 };
      if (actionFilter) params.action = actionFilter;
      const r = await api.get('/admin/audit', { params });
      setItems(r.data.data?.items || []);
      setTotal(r.data.data?.total || 0);
    } catch (e) { /* ignore */ }
    finally { setLoading(false); }
  }

  useEffect(() => { load(); }, [actionFilter]);

  function renderItem({ item: e }) {
    const color = ACTION_COLORS[e.action] || Colors.primary;
    return (
      <Card style={styles.logCard}>
        <View style={styles.logRow}>
          <Badge label={e.action || '—'} color={color} bg={color + '18'} />
          <Text style={styles.logTime}>{relativeTime(e.createdAt)}</Text>
        </View>
        <Text style={styles.actorName}>{e.actorUserId?.fullName || '—'}</Text>
        <Text style={styles.actorId}>{e.actorIdentifier}</Text>
        <View style={styles.targetRow}>
          <Text style={styles.targetType}>{e.targetType}</Text>
          {e.targetLabel ? <Text style={styles.targetLabel}> · {e.targetLabel}</Text> : null}
        </View>
        {e.note ? <Text style={styles.note}>{e.note}</Text> : null}
      </Card>
    );
  }

  return (
    <SafeAreaView style={styles.safe}>
      {/* Action filter strip */}
      <View style={styles.filterWrap}>
        <FlatList
          data={ACTIONS}
          horizontal
          showsHorizontalScrollIndicator={false}
          keyExtractor={(a) => a}
          contentContainerStyle={styles.filterList}
          renderItem={({ item: a }) => (
            <TouchableOpacity
              style={[styles.filterPill, actionFilter === a && styles.filterPillActive]}
              onPress={() => setActionFilter(a)}
            >
              <Text style={[styles.filterText, actionFilter === a && styles.filterTextActive]}>
                {a || 'All'}
              </Text>
            </TouchableOpacity>
          )}
        />
      </View>

      <FlatList
        data={items}
        renderItem={renderItem}
        keyExtractor={(e) => e._id}
        contentContainerStyle={styles.list}
        onRefresh={load}
        refreshing={loading}
        ListHeaderComponent={() => (
          <Text style={styles.totalText}>{total} total entries</Text>
        )}
        ListEmptyComponent={!loading && <EmptyState icon="📋" title="No audit entries yet" />}
        ListFooterComponent={loading && !items.length ? <ActivityIndicator style={{ padding: 16 }} color={Colors.primary} /> : null}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: Colors.background },
  filterWrap: { backgroundColor: Colors.surface, borderBottomWidth: 1, borderBottomColor: Colors.border },
  filterList: { padding: Spacing.sm, gap: 8, flexDirection: 'row' },
  filterPill: { paddingHorizontal: 12, paddingVertical: 6, borderRadius: 20, borderWidth: 1, borderColor: Colors.border, backgroundColor: Colors.background },
  filterPillActive: { borderColor: Colors.primary, backgroundColor: '#eff6ff' },
  filterText: { fontSize: FontSize.xs, color: Colors.textMuted, fontWeight: '600' },
  filterTextActive: { color: Colors.primary },
  list: { padding: Spacing.md },
  totalText: { fontSize: FontSize.xs, color: Colors.textMuted, marginBottom: Spacing.sm },
  logCard: { marginBottom: Spacing.sm },
  logRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 },
  logTime: { fontSize: FontSize.xs, color: Colors.textLight },
  actorName: { fontSize: FontSize.sm, fontWeight: '700', color: Colors.text },
  actorId: { fontSize: FontSize.xs, color: Colors.textMuted, marginBottom: 4 },
  targetRow: { flexDirection: 'row', alignItems: 'center' },
  targetType: { fontSize: FontSize.xs, color: Colors.text, fontWeight: '600' },
  targetLabel: { fontSize: FontSize.xs, color: Colors.textMuted },
  note: { fontSize: FontSize.xs, color: Colors.textLight, marginTop: 4, fontStyle: 'italic' },
});
