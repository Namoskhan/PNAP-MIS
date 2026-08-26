import { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Modal,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { useAuth } from '../../../src/context/AuthContext';
import { useUnit } from '../../../src/context/UnitContext';
import { api, errorMessage } from '../../../src/api/client';
import { canManageFinance, canApproveExpense } from '../../../src/utils/permissions';
import { useToast } from '../../../src/components/Toast';
import Card from '../../../src/components/Card';
import Badge from '../../../src/components/Badge';
import KpiCard from '../../../src/components/KpiCard';
import EmptyState from '../../../src/components/EmptyState';
import { Colors, FontSize, Spacing } from '../../../src/constants/colors';
import { shortDate, PKR } from '../../../src/utils/formatters';

const FINANCE_TABS = [
  { label: 'Donations', value: 'DONATIONS' },
  { label: 'Expenses', value: 'EXPENSES' },
];

const EXPENSE_CATEGORIES = ['OFFICE', 'TRANSPORT', 'PRINTING', 'REFRESHMENTS', 'STAGE_EQUIPMENT', 'COMMUNICATION', 'MISC'];
const DONOR_TYPES = ['MEMBER', 'NON_MEMBER', 'CORPORATE', 'ANONYMOUS'];

export default function FinanceScreen() {
  const { user } = useAuth();
  const { ctx } = useUnit();
  const toast = useToast();
  const canRecord = canManageFinance(user);
  const canApprove = canApproveExpense(user);

  const [tab, setTab] = useState('DONATIONS');
  const [donations, setDonations] = useState([]);
  const [expenses, setExpenses] = useState([]);
  const [summary, setSummary] = useState(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [showDonation, setShowDonation] = useState(false);
  const [showExpense, setShowExpense] = useState(false);
  const [donationForm, setDonationForm] = useState({ amount: '', donorType: 'MEMBER', notes: '' });
  const [expenseForm, setExpenseForm] = useState({ amount: '', category: 'OFFICE', description: '' });
  const [saving, setSaving] = useState(false);

  async function load(silent = false) {
    if (!ctx?.unitId) { setLoading(false); return; }
    if (!silent) setLoading(true);
    const params = { unitLevel: ctx.unitLevel, unitId: ctx.unitId };
    try {
      const [dRes, eRes, sRes] = await Promise.all([
        api.get('/finance/donations', { params }),
        api.get('/finance/expenses', { params }),
        api.get('/finance/summary', { params }).catch(() => ({ data: { data: null } })),
      ]);
      setDonations(dRes.data.data || []);
      setExpenses(eRes.data.data || []);
      setSummary(sRes.data?.data);
    } catch { /* ignore */ } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }

  useEffect(() => { load(); }, [ctx?.unitId]);
  function onRefresh() { setRefreshing(true); load(true); }

  async function saveDonation() {
    if (!donationForm.amount) { toast.error('Amount is required.'); return; }
    setSaving(true);
    try {
      await api.post('/finance/donations', { ...donationForm, amount: Number(donationForm.amount), unitLevel: ctx.unitLevel, unitId: ctx.unitId });
      toast.success('Donation recorded.');
      setShowDonation(false);
      setDonationForm({ amount: '', donorType: 'MEMBER', notes: '' });
      load(true);
    } catch (e) { toast.error(errorMessage(e)); } finally { setSaving(false); }
  }

  async function saveExpense() {
    if (!expenseForm.amount || !expenseForm.description) { toast.error('Amount and description are required.'); return; }
    setSaving(true);
    try {
      await api.post('/finance/expenses', { ...expenseForm, amount: Number(expenseForm.amount), unitLevel: ctx.unitLevel, unitId: ctx.unitId });
      toast.success('Expense recorded.');
      setShowExpense(false);
      setExpenseForm({ amount: '', category: 'OFFICE', description: '' });
      load(true);
    } catch (e) { toast.error(errorMessage(e)); } finally { setSaving(false); }
  }

  const totalDonations = donations.reduce((s, d) => s + (d.amount || 0), 0);
  const totalExpenses = expenses.reduce((s, e) => s + (e.amount || 0), 0);
  const balance = totalDonations - totalExpenses;

  const items = tab === 'DONATIONS' ? donations : expenses;

  function renderItem({ item }) {
    if (tab === 'DONATIONS') {
      return (
        <Card style={styles.card}>
          <View style={styles.row}>
            <View style={styles.amountBox}>
              <Text style={[styles.amount, { color: Colors.success }]}>+{PKR(item.amount)}</Text>
            </View>
            <View style={styles.info}>
              <Text style={styles.itemTitle} numberOfLines={1}>{item.donorType?.replace('_', ' ')} · {item.donorName || '—'}</Text>
              <Text style={styles.itemMeta}>{shortDate(item.createdAt)}</Text>
            </View>
            <Badge label={item.donorType || '—'} color={Colors.success} bg={Colors.successBg} />
          </View>
        </Card>
      );
    }
    return (
      <Card style={styles.card}>
        <View style={styles.row}>
          <View style={styles.amountBox}>
            <Text style={[styles.amount, { color: Colors.error }]}>-{PKR(item.amount)}</Text>
          </View>
          <View style={styles.info}>
            <Text style={styles.itemTitle} numberOfLines={1}>{item.description || item.category}</Text>
            <Text style={styles.itemMeta}>{shortDate(item.createdAt)} · {item.status || 'PENDING'}</Text>
          </View>
          <Badge
            label={item.status || 'Pending'}
            status={item.status === 'APPROVED' ? 'APPROVED' : item.status === 'REJECTED' ? 'REJECTED' : 'PENDING_APPROVAL'}
          />
        </View>
      </Card>
    );
  }

  return (
    <SafeAreaView style={styles.safe}>
      {/* Summary KPIs */}
      <View style={styles.kpiRow}>
        <KpiCard label="Donations" value={PKR(totalDonations)} icon="💰" color={Colors.success} />
        <KpiCard label="Expenses" value={PKR(totalExpenses)} icon="💸" color={Colors.error} />
        <KpiCard label="Balance" value={PKR(balance)} icon="🏦" color={balance >= 0 ? Colors.success : Colors.error} />
      </View>

      {/* Tab */}
      <View style={styles.tabRow}>
        {FINANCE_TABS.map((t) => (
          <TouchableOpacity key={t.value} style={[styles.tab, tab === t.value && styles.tabActive]} onPress={() => setTab(t.value)}>
            <Text style={[styles.tabText, tab === t.value && styles.tabTextActive]}>{t.label}</Text>
          </TouchableOpacity>
        ))}
      </View>

      <FlatList
        data={items}
        renderItem={renderItem}
        keyExtractor={(x) => x._id}
        contentContainerStyle={styles.list}
        onRefresh={onRefresh}
        refreshing={refreshing}
        ListEmptyComponent={!loading && <EmptyState icon={tab === 'DONATIONS' ? '💰' : '💸'} title={`No ${tab.toLowerCase()}`} />}
        ListFooterComponent={loading && !refreshing ? <ActivityIndicator style={{ padding: 16 }} color={Colors.primary} /> : null}
      />

      {/* FABs */}
      {canRecord && ctx?.unitId && (
        <View style={styles.fabGroup}>
          <TouchableOpacity style={[styles.fab, { backgroundColor: Colors.error }]} onPress={() => setShowExpense(true)}>
            <Text style={styles.fabText}>-</Text>
          </TouchableOpacity>
          <TouchableOpacity style={[styles.fab, { backgroundColor: Colors.success }]} onPress={() => setShowDonation(true)}>
            <Text style={styles.fabText}>+</Text>
          </TouchableOpacity>
        </View>
      )}

      {/* Donation Modal */}
      <Modal visible={showDonation} animationType="slide" presentationStyle="pageSheet" onRequestClose={() => setShowDonation(false)}>
        <SafeAreaView style={{ flex: 1, backgroundColor: Colors.background }}>
          <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1 }}>
            <View style={styles.modalHeader}>
              <TouchableOpacity onPress={() => setShowDonation(false)}><Text style={styles.modalCancel}>Cancel</Text></TouchableOpacity>
              <Text style={styles.modalTitle}>Record Donation</Text>
              <TouchableOpacity onPress={saveDonation} disabled={saving}>
                {saving ? <ActivityIndicator color={Colors.primary} /> : <Text style={styles.modalSave}>Save</Text>}
              </TouchableOpacity>
            </View>
            <ScrollView contentContainerStyle={styles.formContent} keyboardShouldPersistTaps="handled">
              <FormField label="Amount (PKR) *" value={donationForm.amount} onChangeText={(v) => setDonationForm((f) => ({ ...f, amount: v }))} keyboardType="numeric" />
              <Text style={styles.fieldLabel}>Donor Type</Text>
              <View style={styles.chipRow}>
                {DONOR_TYPES.map((t) => (
                  <TouchableOpacity key={t} style={[styles.typeChip, donationForm.donorType === t && styles.typeChipActive]} onPress={() => setDonationForm((f) => ({ ...f, donorType: t }))}>
                    <Text style={[styles.typeChipText, donationForm.donorType === t && styles.typeChipTextActive]}>{t.replace('_', ' ')}</Text>
                  </TouchableOpacity>
                ))}
              </View>
              <FormField label="Notes" value={donationForm.notes} onChangeText={(v) => setDonationForm((f) => ({ ...f, notes: v }))} multiline />
            </ScrollView>
          </KeyboardAvoidingView>
        </SafeAreaView>
      </Modal>

      {/* Expense Modal */}
      <Modal visible={showExpense} animationType="slide" presentationStyle="pageSheet" onRequestClose={() => setShowExpense(false)}>
        <SafeAreaView style={{ flex: 1, backgroundColor: Colors.background }}>
          <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1 }}>
            <View style={styles.modalHeader}>
              <TouchableOpacity onPress={() => setShowExpense(false)}><Text style={styles.modalCancel}>Cancel</Text></TouchableOpacity>
              <Text style={styles.modalTitle}>Record Expense</Text>
              <TouchableOpacity onPress={saveExpense} disabled={saving}>
                {saving ? <ActivityIndicator color={Colors.primary} /> : <Text style={styles.modalSave}>Save</Text>}
              </TouchableOpacity>
            </View>
            <ScrollView contentContainerStyle={styles.formContent} keyboardShouldPersistTaps="handled">
              <FormField label="Amount (PKR) *" value={expenseForm.amount} onChangeText={(v) => setExpenseForm((f) => ({ ...f, amount: v }))} keyboardType="numeric" />
              <Text style={styles.fieldLabel}>Category</Text>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: Spacing.lg }}>
                {EXPENSE_CATEGORIES.map((c) => (
                  <TouchableOpacity key={c} style={[styles.typeChip, expenseForm.category === c && styles.typeChipActive]} onPress={() => setExpenseForm((f) => ({ ...f, category: c }))}>
                    <Text style={[styles.typeChipText, expenseForm.category === c && styles.typeChipTextActive]}>{c.replace('_', ' ')}</Text>
                  </TouchableOpacity>
                ))}
              </ScrollView>
              <FormField label="Description *" value={expenseForm.description} onChangeText={(v) => setExpenseForm((f) => ({ ...f, description: v }))} multiline />
            </ScrollView>
          </KeyboardAvoidingView>
        </SafeAreaView>
      </Modal>
    </SafeAreaView>
  );
}

function FormField({ label, value, onChangeText, keyboardType, multiline }) {
  return (
    <View style={styles.field}>
      <Text style={styles.fieldLabel}>{label}</Text>
      <TextInput
        style={[styles.fieldInput, multiline && styles.fieldMultiline]}
        value={value} onChangeText={onChangeText}
        keyboardType={keyboardType || 'default'}
        multiline={multiline}
        placeholderTextColor={Colors.textLight}
        placeholder={label}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: Colors.background },
  kpiRow: { flexDirection: 'row', gap: 8, padding: Spacing.md, backgroundColor: Colors.surface, borderBottomWidth: 1, borderBottomColor: Colors.border },
  tabRow: { flexDirection: 'row', backgroundColor: Colors.surface, borderBottomWidth: 1, borderBottomColor: Colors.border },
  tab: { flex: 1, paddingVertical: 12, alignItems: 'center' },
  tabActive: { borderBottomWidth: 2, borderBottomColor: Colors.primary },
  tabText: { fontSize: FontSize.sm, fontWeight: '600', color: Colors.textMuted },
  tabTextActive: { color: Colors.primary },
  list: { padding: Spacing.lg },
  card: { marginBottom: Spacing.sm },
  row: { flexDirection: 'row', alignItems: 'center', gap: Spacing.md },
  amountBox: { minWidth: 80 },
  amount: { fontSize: FontSize.base, fontWeight: '700' },
  info: { flex: 1 },
  itemTitle: { fontSize: FontSize.sm, fontWeight: '600', color: Colors.text },
  itemMeta: { fontSize: FontSize.xs, color: Colors.textMuted },
  fabGroup: { position: 'absolute', bottom: 24, right: 24, gap: 12 },
  fab: { width: 52, height: 52, borderRadius: 26, alignItems: 'center', justifyContent: 'center', shadowColor: '#000', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.3, shadowRadius: 8, elevation: 6 },
  fabText: { color: '#fff', fontSize: 26, fontWeight: '300', lineHeight: 32 },
  modalHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', padding: Spacing.lg, backgroundColor: Colors.surface, borderBottomWidth: 1, borderBottomColor: Colors.border },
  modalCancel: { fontSize: FontSize.base, color: Colors.textMuted },
  modalTitle: { fontSize: FontSize.lg, fontWeight: '700', color: Colors.text },
  modalSave: { fontSize: FontSize.base, color: Colors.primary, fontWeight: '700' },
  formContent: { padding: Spacing.lg },
  field: { marginBottom: Spacing.lg },
  fieldLabel: { fontSize: FontSize.sm, fontWeight: '600', color: Colors.text, marginBottom: 6 },
  fieldInput: { borderWidth: 1.5, borderColor: Colors.border, borderRadius: 10, paddingHorizontal: Spacing.md, paddingVertical: 11, fontSize: FontSize.base, color: Colors.text, backgroundColor: Colors.surfaceAlt },
  fieldMultiline: { minHeight: 80, textAlignVertical: 'top' },
  chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginBottom: Spacing.lg },
  typeChip: { paddingHorizontal: 12, paddingVertical: 6, borderRadius: 99, borderWidth: 1.5, borderColor: Colors.border, backgroundColor: Colors.surface },
  typeChipActive: { backgroundColor: Colors.primary, borderColor: Colors.primary },
  typeChipText: { fontSize: FontSize.xs, fontWeight: '600', color: Colors.textMuted },
  typeChipTextActive: { color: '#fff' },
});
