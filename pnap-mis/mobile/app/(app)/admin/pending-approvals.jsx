import { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  FlatList,
  SafeAreaView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { api, errorMessage } from '../../../src/api/client';
import { useAuth } from '../../../src/context/AuthContext';
import { isSuperAdmin } from '../../../src/utils/permissions';
import { useToast } from '../../../src/components/Toast';
import Card from '../../../src/components/Card';
import Badge from '../../../src/components/Badge';
import EmptyState from '../../../src/components/EmptyState';
import { Colors, FontSize, Radius, Spacing } from '../../../src/constants/colors';

const ROLE_LABEL = {
  SECRETARY: 'Secretary',
  SENIOR_MAWIN: 'Senior Mawin Sec.',
  FINANCE_SECRETARY: 'Finance Secretary',
  PRESS_SECRETARY: 'Press Secretary',
  CULTURE_SECRETARY: 'Culture Secretary',
  SPORTS_SECRETARY: 'Sports Secretary',
  GENERAL_SECRETARY: 'General Secretary',
  FIRST_SECRETARY: 'First Secretary',
  PRESIDENT: 'President / Saddar',
  VICE_PRESIDENT: 'Vice President',
  SR_VICE_PRESIDENT: 'Senior Vice President',
  CHAIRMAN: 'Chairman',
  CO_CHAIRMAN: 'Co-Chairman',
  VICE_CHAIRMAN: 'Vice Chairman',
  SR_VICE_CHAIRMAN: 'Senior Vice Chairman',
  OTHER: 'Other',
};

export default function PendingApprovalsScreen() {
  const { user } = useAuth();
  const toast = useToast();
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [levelFilter, setLevelFilter] = useState('');

  // Quick level filters for mobile
  const filters = [
    { label: 'All', value: '' },
    { label: 'Basic', value: 'BASIC_UNIT' },
    { label: 'Area', value: 'AREA' },
    { label: 'District', value: 'DISTRICT' },
    { label: 'Prov', value: 'PROVINCE' },
    { label: 'Central', value: 'CENTRAL' },
  ];

  async function loadItems() {
    setLoading(true);
    try {
      const params = { state: 'PROPOSED' };
      if (levelFilter) params.unitLevel = levelFilter;
      const r = await api.get('/roles', { params });
      setItems(r.data.data || []);
    } catch (e) {
      toast.error(errorMessage(e));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadItems();
  }, [levelFilter]);

  const decide = (id, decision) => {
    Alert.alert(
      `${decision === 'APPROVED' ? 'Approve' : 'Reject'} Role`,
      `Are you sure you want to ${decision.toLowerCase()} this role assignment?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: decision === 'APPROVED' ? 'Approve' : 'Reject',
          style: decision === 'APPROVED' ? 'default' : 'destructive',
          onPress: async () => {
            setBusy(true);
            try {
              await api.post(`/roles/${id}/decide`, { decision });
              await loadItems();
              toast.success(`Role ${decision.toLowerCase()}.`);
            } catch (e) {
              toast.error(errorMessage(e), { title: 'Action Failed' });
            } finally {
              setBusy(false);
            }
          }
        }
      ]
    );
  };

  const renderItem = ({ item: p }) => (
    <Card style={styles.card}>
      <View style={styles.cardHeader}>
        <Badge label={p.unitLevel.replace('_', ' ')} color="#fff" bg={Colors.primary} />
        <Text style={styles.dateText}>{new Date(p.createdAt).toLocaleDateString()}</Text>
      </View>
      
      <View style={styles.infoRow}>
        <Text style={styles.label}>Role</Text>
        <Text style={styles.value}>
          {ROLE_LABEL[p.roleCode] || p.roleCode}
          {p.customRoleName ? ` (${p.customRoleName})` : ''}
        </Text>
      </View>
      
      <View style={styles.infoRow}>
        <Text style={styles.label}>Member</Text>
        <Text style={styles.value}>
          {p.memberId?.fullName} <Text style={styles.mutedText}>({p.memberId?.memberId || p.memberId?.cnic})</Text>
        </Text>
      </View>
      
      <View style={styles.infoRow}>
        <Text style={styles.label}>Initiated By</Text>
        <Text style={styles.value}>{p.initiatedBy?.fullName || '—'}</Text>
      </View>

      <View style={styles.actions}>
        <TouchableOpacity 
          style={[styles.btn, styles.btnReject, busy && styles.btnDisabled]} 
          disabled={busy} 
          onPress={() => decide(p._id, 'REJECTED')}
        >
          <Text style={styles.btnRejectText}>Reject</Text>
        </TouchableOpacity>
        
        <TouchableOpacity 
          style={[styles.btn, styles.btnApprove, busy && styles.btnDisabled]} 
          disabled={busy} 
          onPress={() => decide(p._id, 'APPROVED')}
        >
          <Text style={styles.btnApproveText}>Approve</Text>
        </TouchableOpacity>
      </View>
    </Card>
  );

  if (!isSuperAdmin(user)) {
    return (
      <View style={styles.center}>
        <Text style={styles.errorText}>Only Super Admins can access this override screen.</Text>
      </View>
    );
  }

  return (
    <SafeAreaView style={styles.safe}>
      <View style={styles.header}>
        <Text style={styles.title}>Pending Approvals</Text>
        <Text style={styles.subtitle}>System-wide admin overrides</Text>
      </View>

      <View style={styles.filters}>
        <FlatList
          horizontal
          showsHorizontalScrollIndicator={false}
          data={filters}
          keyExtractor={(item) => item.value}
          renderItem={({ item }) => (
            <TouchableOpacity
              style={[styles.filterChip, levelFilter === item.value && styles.filterChipActive]}
              onPress={() => setLevelFilter(item.value)}
            >
              <Text style={[styles.filterChipText, levelFilter === item.value && styles.filterChipTextActive]}>
                {item.label}
              </Text>
            </TouchableOpacity>
          )}
        />
      </View>

      {loading ? (
        <ActivityIndicator size="large" color={Colors.primary} style={{ marginTop: Spacing.xl }} />
      ) : (
        <FlatList
          data={items}
          keyExtractor={(item) => item._id}
          renderItem={renderItem}
          contentContainerStyle={styles.listContent}
          ListEmptyComponent={<EmptyState icon="⏳" title="No pending roles" message="There are no role assignments waiting for a decision." />}
        />
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: Colors.background },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: Spacing.xl },
  errorText: { color: Colors.danger, fontSize: FontSize.base, textAlign: 'center' },
  header: { padding: Spacing.lg, paddingBottom: Spacing.sm },
  title: { fontSize: FontSize.xl, fontWeight: '800', color: Colors.text },
  subtitle: { fontSize: FontSize.sm, color: Colors.textMuted, marginTop: 4 },
  filters: { paddingHorizontal: Spacing.lg, paddingBottom: Spacing.md },
  filterChip: {
    paddingHorizontal: Spacing.md,
    paddingVertical: 6,
    borderRadius: Radius.full,
    backgroundColor: Colors.surface,
    borderWidth: 1,
    borderColor: Colors.border,
    marginRight: Spacing.sm,
  },
  filterChipActive: { backgroundColor: Colors.primary, borderColor: Colors.primary },
  filterChipText: { fontSize: FontSize.sm, color: Colors.textMuted, fontWeight: '600' },
  filterChipTextActive: { color: '#fff' },
  listContent: { padding: Spacing.lg, paddingBottom: 80 },
  card: { padding: Spacing.md, marginBottom: Spacing.md },
  cardHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: Spacing.md },
  dateText: { fontSize: FontSize.xs, color: Colors.textMuted },
  infoRow: { flexDirection: 'row', marginBottom: Spacing.sm },
  label: { width: 90, fontSize: FontSize.sm, color: Colors.textMuted, fontWeight: '500' },
  value: { flex: 1, fontSize: FontSize.sm, color: Colors.text, fontWeight: '600' },
  mutedText: { color: Colors.textMuted, fontWeight: '400' },
  actions: { flexDirection: 'row', justifyContent: 'flex-end', marginTop: Spacing.md, gap: Spacing.md },
  btn: { paddingHorizontal: Spacing.lg, paddingVertical: 10, borderRadius: Radius.base, minWidth: 90, alignItems: 'center' },
  btnApprove: { backgroundColor: Colors.primary },
  btnApproveText: { color: '#fff', fontWeight: '700', fontSize: FontSize.sm },
  btnReject: { backgroundColor: 'transparent', borderWidth: 1, borderColor: Colors.danger },
  btnRejectText: { color: Colors.danger, fontWeight: '700', fontSize: FontSize.sm },
  btnDisabled: { opacity: 0.5 },
});
