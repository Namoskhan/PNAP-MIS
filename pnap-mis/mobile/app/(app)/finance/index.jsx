import { useEffect, useState, useMemo } from 'react';
import {
  ActivityIndicator,
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
import { Picker } from '@react-native-picker/picker';
import Badge from '../../../src/components/Badge';
import { Colors, FontSize, Spacing, Radius } from '../../../src/constants/colors';
import { shortDate, PKR } from '../../../src/utils/formatters';

const FINANCE_TABS = [
  { label: 'Donations', value: 'DONATIONS' },
  { label: 'Expenses', value: 'EXPENSES' },
  { label: 'Monthly Statements', value: 'MONTHLY' },
];

const EXPENSE_CATEGORIES = ['OFFICE', 'TRANSPORT', 'PRINTING', 'REFRESHMENTS', 'STAGE_EQUIPMENT', 'COMMUNICATION', 'DONATIONS_OUT', 'SALARIES_STIPENDS', 'MISC'];
const DONOR_TYPES = ['MEMBER', 'NON_MEMBER', 'CORPORATE', 'ANONYMOUS'];
const PAYMENT_MODES = ['CASH', 'BANK_TRANSFER', 'MOBILE_WALLET', 'CHEQUE'];

export default function FinanceScreen() {
  const { user } = useAuth();
  const { ctx } = useUnit();
  const toast = useToast();
  const canRecord = canManageFinance(user);
  const canApprove = canApproveExpense(user);

  const [tab, setTab] = useState('DONATIONS');
  const [donations, setDonations] = useState([]);
  const [expenses, setExpenses] = useState([]);
  const [monthly, setMonthly] = useState([]);
  const [summary, setSummary] = useState(null);
  
  const [monthFrom, setMonthFrom] = useState('');
  const [monthTo, setMonthTo] = useState('');

  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  
  const [showDonation, setShowDonation] = useState(false);
  const [showExpense, setShowExpense] = useState(false);
  
  const [donationForm, setDonationForm] = useState({ amount: '', donorType: 'MEMBER', donorName: '', donorCnic: '', paymentMode: 'CASH', receivedAt: '' });
  const [expenseForm, setExpenseForm] = useState({ amount: '', category: 'OFFICE', description: '', vendor: '', paymentMode: 'CASH', incurredAt: '' });
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

  async function loadMonthly() {
    if (!ctx?.unitId) return;
    try {
      const params = {
        unitLevel: ctx.unitLevel,
        unitId: ctx.unitId,
        from: monthFrom || undefined,
        to: monthTo || undefined,
      };
      const r = await api.get('/finance/monthly', { params });
      setMonthly(r.data.data || []);
    } catch { /* ignore */ }
  }

  useEffect(() => { load(); }, [ctx?.unitId]);
  useEffect(() => {
    if (tab === 'MONTHLY') {
      loadMonthly();
    }
  }, [ctx?.unitId, tab, monthFrom, monthTo]);

  async function saveDonation() {
    if (!donationForm.amount) { toast.error('Amount is required.'); return; }
    setSaving(true);
    try {
      await api.post('/finance/donations', { ...donationForm, amount: Number(donationForm.amount), unitLevel: ctx.unitLevel, unitId: ctx.unitId });
      toast.success('Donation recorded.');
      setShowDonation(false);
      setDonationForm({ amount: '', donorType: 'MEMBER', donorName: '', donorCnic: '', paymentMode: 'CASH', receivedAt: '' });
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
      setExpenseForm({ amount: '', category: 'OFFICE', description: '', vendor: '', paymentMode: 'CASH', incurredAt: '' });
      load(true);
    } catch (e) { toast.error(errorMessage(e)); } finally { setSaving(false); }
  }

  async function decideExpense(id, decision) {
    try {
      await api.post(`/finance/expenses/${id}/decide`, { decision });
      toast.success(`Expense ${decision.toLowerCase()}.`);
      load(true);
    } catch (e) {
      toast.error(errorMessage(e));
    }
  }

  function applyQuickRange(kind) {
    const now = new Date();
    const y = now.getFullYear();
    const m = now.getMonth();
    const pad = (n) => String(n).padStart(2, '0');
    const firstOf = (yr, mo) => `${yr}-${pad(mo + 1)}-01`;
    const lastOf = (yr, mo) => {
      const d = new Date(yr, mo + 1, 0);
      return `${yr}-${pad(mo + 1)}-${pad(d.getDate())}`;
    };

    if (kind === 'this') {
      setMonthFrom(firstOf(y, m));
      setMonthTo(lastOf(y, m));
    } else if (kind === 'last') {
      const prevY = m === 0 ? y - 1 : y;
      const prevM = m === 0 ? 11 : m - 1;
      setMonthFrom(firstOf(prevY, prevM));
      setMonthTo(lastOf(prevY, prevM));
    } else if (kind === '3') {
      const start = new Date(y, m - 2, 1);
      setMonthFrom(firstOf(start.getFullYear(), start.getMonth()));
      setMonthTo(lastOf(y, m));
    } else if (kind === 'ytd') {
      setMonthFrom(`${y}-01-01`);
      setMonthTo(lastOf(y, m));
    } else if (kind === 'all') {
      setMonthFrom('');
      setMonthTo('');
    }
  }

  return (
    <SafeAreaView style={styles.safe}>
      <View style={styles.header}>
        <Text style={styles.pageTitle}>Finance · {ctx?.unitName}</Text>
        <Text style={styles.pageSubtitle}>{ctx?.unitLevel?.replace('_', ' ')}</Text>
      </View>

      <ScrollView style={{ flex: 1 }}>
        {/* KPI Grid */}
        {summary && (
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.kpiScroll} contentContainerStyle={styles.kpiContainer}>
            <View style={[styles.kpiBox, { borderLeftColor: Colors.success, borderLeftWidth: 4 }]}>
              <Text style={styles.kpiLabel}>Donations</Text>
              <Text style={styles.kpiValue}>{PKR(summary.donations?.total || 0)}</Text>
              <Text style={styles.kpiHint}>{summary.donations?.count || 0} entries</Text>
            </View>
            <View style={[styles.kpiBox, { borderLeftColor: Colors.error, borderLeftWidth: 4 }]}>
              <Text style={styles.kpiLabel}>Approved Expenses</Text>
              <Text style={styles.kpiValue}>{PKR(summary.expenses?.total || 0)}</Text>
              <Text style={styles.kpiHint}>{summary.expenses?.count || 0} entries</Text>
            </View>
            {summary.transfersIn && (
              <View style={[styles.kpiBox, { borderLeftColor: Colors.primary, borderLeftWidth: 4 }]}>
                <Text style={styles.kpiLabel}>Transfers In</Text>
                <Text style={styles.kpiValue}>{PKR(summary.transfersIn.total)}</Text>
                <Text style={styles.kpiHint}>{summary.transfersIn.count} acknowledged</Text>
              </View>
            )}
            {summary.transfersOut && (
              <View style={[styles.kpiBox, { borderLeftColor: Colors.warning, borderLeftWidth: 4 }]}>
                <Text style={styles.kpiLabel}>Transfers Out</Text>
                <Text style={styles.kpiValue}>{PKR(summary.transfersOut.total)}</Text>
                <Text style={styles.kpiHint}>{summary.transfersOut.count} acknowledged</Text>
              </View>
            )}
            <View style={[styles.kpiBox, { borderLeftColor: summary.balance < 0 ? Colors.error : Colors.success, borderLeftWidth: 4 }]}>
              <Text style={styles.kpiLabel}>Net Balance</Text>
              <Text style={[styles.kpiValue, { color: summary.balance < 0 ? Colors.error : Colors.success }]}>{PKR(summary.balance || 0)}</Text>
            </View>
          </ScrollView>
        )}

        <View style={styles.tabRow}>
          {FINANCE_TABS.map((t) => (
            <TouchableOpacity key={t.value} style={[styles.tab, tab === t.value && styles.tabActive]} onPress={() => setTab(t.value)}>
              <Text style={[styles.tabText, tab === t.value && styles.tabTextActive]}>{t.label}</Text>
            </TouchableOpacity>
          ))}
        </View>

        <View style={styles.actionsRow}>
        </View>

        {tab === 'MONTHLY' && (
          <View style={styles.rangeFilterContainer}>
            <View style={styles.rangeInputs}>
              <View style={styles.field}>
                <Text style={styles.fieldLabel}>From</Text>
                <TextInput style={styles.fieldInput} placeholder="YYYY-MM-DD" value={monthFrom} onChangeText={setMonthFrom} />
              </View>
              <View style={styles.field}>
                <Text style={styles.fieldLabel}>To</Text>
                <TextInput style={styles.fieldInput} placeholder="YYYY-MM-DD" value={monthTo} onChangeText={setMonthTo} />
              </View>
            </View>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.quickRangeScroll}>
              <TouchableOpacity style={styles.btnSecondary} onPress={() => applyQuickRange('this')}><Text style={styles.btnSecondaryText}>This month</Text></TouchableOpacity>
              <TouchableOpacity style={styles.btnSecondary} onPress={() => applyQuickRange('last')}><Text style={styles.btnSecondaryText}>Last month</Text></TouchableOpacity>
              <TouchableOpacity style={styles.btnSecondary} onPress={() => applyQuickRange('3')}><Text style={styles.btnSecondaryText}>Last 3 months</Text></TouchableOpacity>
              <TouchableOpacity style={styles.btnSecondary} onPress={() => applyQuickRange('ytd')}><Text style={styles.btnSecondaryText}>Year-to-date</Text></TouchableOpacity>
              <TouchableOpacity style={styles.btnGhost} onPress={() => applyQuickRange('all')}><Text style={styles.btnGhostText}>All time</Text></TouchableOpacity>
            </ScrollView>
          </View>
        )}

        <ScrollView horizontal style={styles.tableScroll}>
          {tab === 'DONATIONS' && (
            <View style={{ minWidth: 600 }}>
              <View style={styles.thRow}>
                <Text style={[styles.th, { width: 100 }]}>Date</Text>
                <Text style={[styles.th, { width: 150 }]}>Donor</Text>
                <Text style={[styles.th, { width: 100 }]}>Type</Text>
                <Text style={[styles.th, { width: 150 }]}>CNIC</Text>
                <Text style={[styles.th, { width: 100, textAlign: 'right' }]}>Amount</Text>
              </View>
              {donations.length === 0 && <Text style={styles.emptyText}>No donations recorded yet.</Text>}
              {donations.map((d) => (
                <View key={d._id} style={styles.tr}>
                  <Text style={[styles.td, { width: 100 }]}>{shortDate(d.receivedAt || d.createdAt)}</Text>
                  <Text style={[styles.td, { width: 150 }]}>{d.donorName || '—'}</Text>
                  <View style={[styles.td, { width: 100 }]}><Badge label={d.donorType} color={Colors.primary} bg={Colors.primaryBg} /></View>
                  <Text style={[styles.td, { width: 150 }]}>{d.donorCnic || '—'}</Text>
                  <Text style={[styles.td, { width: 100, textAlign: 'right', fontWeight: '700' }]}>{PKR(d.amount)}</Text>
                </View>
              ))}
            </View>
          )}

          {tab === 'EXPENSES' && (
            <View style={{ minWidth: 700 }}>
              <View style={styles.thRow}>
                <Text style={[styles.th, { width: 100 }]}>Date</Text>
                <Text style={[styles.th, { width: 120 }]}>Category</Text>
                <Text style={[styles.th, { width: 150 }]}>Description</Text>
                <Text style={[styles.th, { width: 100 }]}>Vendor</Text>
                <Text style={[styles.th, { width: 100, textAlign: 'right' }]}>Amount</Text>
                <Text style={[styles.th, { width: 100 }]}>State</Text>
                {canApprove && <Text style={[styles.th, { width: 150 }]}></Text>}
              </View>
              {expenses.length === 0 && <Text style={styles.emptyText}>No expenses recorded yet.</Text>}
              {expenses.map((e) => (
                <View key={e._id} style={styles.tr}>
                  <Text style={[styles.td, { width: 100 }]}>{shortDate(e.incurredAt || e.createdAt)}</Text>
                  <Text style={[styles.td, { width: 120 }]}>{e.category}</Text>
                  <Text style={[styles.td, { width: 150 }]}>{e.description}</Text>
                  <Text style={[styles.td, { width: 100 }]}>{e.vendor || '—'}</Text>
                  <Text style={[styles.td, { width: 100, textAlign: 'right', fontWeight: '700' }]}>{PKR(e.amount)}</Text>
                  <View style={[styles.td, { width: 100 }]}>
                    <Badge
                      label={e.state || 'PENDING'}
                      status={e.state === 'APPROVED' ? 'APPROVED' : e.state === 'REJECTED' ? 'REJECTED' : 'PENDING_APPROVAL'}
                    />
                  </View>
                  {canApprove && e.state === 'PENDING' && (
                     <View style={[styles.td, { width: 150, flexDirection: 'row', gap: 6 }]}>
                       <TouchableOpacity style={styles.btnPrimary} onPress={() => decideExpense(e._id, 'APPROVED')}><Text style={styles.btnPrimaryText}>Approve</Text></TouchableOpacity>
                       <TouchableOpacity style={styles.btnDanger} onPress={() => decideExpense(e._id, 'REJECTED')}><Text style={styles.btnDangerText}>Reject</Text></TouchableOpacity>
                     </View>
                  )}
                </View>
              ))}
            </View>
          )}

          {tab === 'MONTHLY' && (
            <View style={{ minWidth: 700 }}>
              <View style={styles.thRow}>
                <Text style={[styles.th, { width: 100 }]}>Month</Text>
                <Text style={[styles.th, { width: 120, textAlign: 'right' }]}>Donations</Text>
                <Text style={[styles.th, { width: 120, textAlign: 'right' }]}>Transfers In</Text>
                <Text style={[styles.th, { width: 120, textAlign: 'right' }]}>Expenses</Text>
                <Text style={[styles.th, { width: 120, textAlign: 'right' }]}>Transfers Out</Text>
                <Text style={[styles.th, { width: 120, textAlign: 'right' }]}>Net Balance</Text>
              </View>
              {monthly.length === 0 && <Text style={styles.emptyText}>No monthly activity in this period.</Text>}
              {monthly.map((m) => (
                <View key={m.month} style={styles.tr}>
                  <Text style={[styles.td, { width: 100 }]}>{m.month}</Text>
                  <Text style={[styles.td, { width: 120, textAlign: 'right' }]}>{PKR(m.donations)}</Text>
                  <Text style={[styles.td, { width: 120, textAlign: 'right' }]}>{PKR(m.transfersIn)}</Text>
                  <Text style={[styles.td, { width: 120, textAlign: 'right' }]}>{PKR(m.expenses)}</Text>
                  <Text style={[styles.td, { width: 120, textAlign: 'right' }]}>{PKR(m.transfersOut)}</Text>
                  <Text style={[styles.td, { width: 120, textAlign: 'right', fontWeight: '700', color: m.netBalance < 0 ? Colors.error : Colors.success }]}>{PKR(m.netBalance)}</Text>
                </View>
              ))}
              {monthly.length > 0 && (
                <View style={[styles.tr, { backgroundColor: Colors.surfaceAlt }]}>
                  <Text style={[styles.td, { width: 100, fontWeight: '700' }]}>Totals</Text>
                  <Text style={[styles.td, { width: 120, textAlign: 'right', fontWeight: '700' }]}>{PKR(monthly.reduce((a, m) => a + m.donations, 0))}</Text>
                  <Text style={[styles.td, { width: 120, textAlign: 'right', fontWeight: '700' }]}>{PKR(monthly.reduce((a, m) => a + m.transfersIn, 0))}</Text>
                  <Text style={[styles.td, { width: 120, textAlign: 'right', fontWeight: '700' }]}>{PKR(monthly.reduce((a, m) => a + m.expenses, 0))}</Text>
                  <Text style={[styles.td, { width: 120, textAlign: 'right', fontWeight: '700' }]}>{PKR(monthly.reduce((a, m) => a + m.transfersOut, 0))}</Text>
                  <Text style={[styles.td, { width: 120, textAlign: 'right', fontWeight: '700' }]}>{PKR(monthly.reduce((a, m) => a + m.netBalance, 0))}</Text>
                </View>
              )}
            </View>
          )}
        </ScrollView>
      </ScrollView>

      {/* Donation Modal */}
      <Modal visible={showDonation} animationType="slide" presentationStyle="pageSheet" onRequestClose={() => setShowDonation(false)}>
        <SafeAreaView style={{ flex: 1, backgroundColor: Colors.background }}>
          <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1 }}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Record Donation</Text>
              <TouchableOpacity onPress={() => setShowDonation(false)}><Text style={styles.modalCancel}>Cancel</Text></TouchableOpacity>
            </View>
            <ScrollView contentContainerStyle={styles.formContent} keyboardShouldPersistTaps="handled">
              <View style={styles.field}>
                <Text style={styles.fieldLabel}>Amount (PKR) *</Text>
                <TextInput style={styles.fieldInput} value={donationForm.amount} onChangeText={(v) => setDonationForm((f) => ({ ...f, amount: v }))} keyboardType="numeric" />
              </View>
              
              <View style={styles.field}>
                <Text style={styles.fieldLabel}>Donor Type *</Text>
                <View style={styles.pickerWrapper}>
                  <Picker selectedValue={donationForm.donorType} onValueChange={(itemValue) => setDonationForm((f) => ({ ...f, donorType: itemValue }))}>
                    {DONOR_TYPES.map(t => <Picker.Item key={t} label={t.replace('_', ' ')} value={t} />)}
                  </Picker>
                </View>
              </View>

              {donationForm.donorType !== 'ANONYMOUS' && (
                <View style={styles.field}>
                  <Text style={styles.fieldLabel}>Donor Name</Text>
                  <TextInput style={styles.fieldInput} value={donationForm.donorName} onChangeText={(v) => setDonationForm((f) => ({ ...f, donorName: v }))} />
                </View>
              )}
              {donationForm.donorType === 'NON_MEMBER' && (
                <View style={styles.field}>
                  <Text style={styles.fieldLabel}>Donor CNIC</Text>
                  <TextInput style={styles.fieldInput} value={donationForm.donorCnic} onChangeText={(v) => setDonationForm((f) => ({ ...f, donorCnic: v }))} keyboardType="numeric" />
                </View>
              )}

              <View style={styles.field}>
                <Text style={styles.fieldLabel}>Payment Mode *</Text>
                <View style={styles.pickerWrapper}>
                  <Picker selectedValue={donationForm.paymentMode} onValueChange={(itemValue) => setDonationForm((f) => ({ ...f, paymentMode: itemValue }))}>
                    {PAYMENT_MODES.map(t => <Picker.Item key={t} label={t.replace('_', ' ')} value={t} />)}
                  </Picker>
                </View>
              </View>

              <View style={styles.field}>
                <Text style={styles.fieldLabel}>Received At (YYYY-MM-DD)</Text>
                <TextInput style={styles.fieldInput} value={donationForm.receivedAt} onChangeText={(v) => setDonationForm((f) => ({ ...f, receivedAt: v }))} />
              </View>

              <TouchableOpacity style={styles.btnSave} onPress={saveDonation} disabled={saving}>
                {saving ? <ActivityIndicator color="#fff" /> : <Text style={styles.btnSaveText}>Save Donation</Text>}
              </TouchableOpacity>
            </ScrollView>
          </KeyboardAvoidingView>
        </SafeAreaView>
      </Modal>

      {/* Expense Modal */}
      <Modal visible={showExpense} animationType="slide" presentationStyle="pageSheet" onRequestClose={() => setShowExpense(false)}>
        <SafeAreaView style={{ flex: 1, backgroundColor: Colors.background }}>
          <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1 }}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Record Expense</Text>
              <TouchableOpacity onPress={() => setShowExpense(false)}><Text style={styles.modalCancel}>Cancel</Text></TouchableOpacity>
            </View>
            <ScrollView contentContainerStyle={styles.formContent} keyboardShouldPersistTaps="handled">
              <View style={styles.field}>
                <Text style={styles.fieldLabel}>Amount (PKR) *</Text>
                <TextInput style={styles.fieldInput} value={expenseForm.amount} onChangeText={(v) => setExpenseForm((f) => ({ ...f, amount: v }))} keyboardType="numeric" />
              </View>
              
              <View style={styles.field}>
                <Text style={styles.fieldLabel}>Category *</Text>
                <View style={styles.pickerWrapper}>
                  <Picker selectedValue={expenseForm.category} onValueChange={(itemValue) => setExpenseForm((f) => ({ ...f, category: itemValue }))}>
                    {EXPENSE_CATEGORIES.map(c => <Picker.Item key={c} label={c.replace('_', ' ')} value={c} />)}
                  </Picker>
                </View>
              </View>

              <View style={styles.field}>
                <Text style={styles.fieldLabel}>Description *</Text>
                <TextInput style={[styles.fieldInput, { height: 80, textAlignVertical: 'top' }]} value={expenseForm.description} onChangeText={(v) => setExpenseForm((f) => ({ ...f, description: v }))} multiline />
              </View>

              <View style={styles.field}>
                <Text style={styles.fieldLabel}>Vendor / Payee</Text>
                <TextInput style={styles.fieldInput} value={expenseForm.vendor} onChangeText={(v) => setExpenseForm((f) => ({ ...f, vendor: v }))} />
              </View>

              <View style={styles.field}>
                <Text style={styles.fieldLabel}>Payment Mode *</Text>
                <View style={styles.pickerWrapper}>
                  <Picker selectedValue={expenseForm.paymentMode} onValueChange={(itemValue) => setExpenseForm((f) => ({ ...f, paymentMode: itemValue }))}>
                    {PAYMENT_MODES.map(t => <Picker.Item key={t} label={t.replace('_', ' ')} value={t} />)}
                  </Picker>
                </View>
              </View>

              <View style={styles.field}>
                <Text style={styles.fieldLabel}>Incurred At (YYYY-MM-DD) *</Text>
                <TextInput style={styles.fieldInput} value={expenseForm.incurredAt} onChangeText={(v) => setExpenseForm((f) => ({ ...f, incurredAt: v }))} />
              </View>

              <TouchableOpacity style={styles.btnSave} onPress={saveExpense} disabled={saving}>
                {saving ? <ActivityIndicator color="#fff" /> : <Text style={styles.btnSaveText}>Save Expense</Text>}
              </TouchableOpacity>
            </ScrollView>
          </KeyboardAvoidingView>
        </SafeAreaView>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: Colors.background },
  header: { padding: Spacing.lg, backgroundColor: Colors.surface, borderBottomWidth: 1, borderBottomColor: Colors.border },
  pageTitle: { fontSize: FontSize.xl, fontWeight: '700', color: Colors.text },
  pageSubtitle: { fontSize: FontSize.sm, color: Colors.textMuted, marginTop: 4 },
  
  kpiScroll: { flexGrow: 0, borderBottomWidth: 1, borderBottomColor: Colors.border, backgroundColor: Colors.surfaceAlt },
  kpiContainer: { padding: Spacing.md, gap: Spacing.md },
  kpiBox: { padding: Spacing.md, backgroundColor: Colors.surface, borderRadius: 8, minWidth: 140, borderWidth: 1, borderColor: Colors.border },
  kpiLabel: { fontSize: FontSize.xs, color: Colors.textMuted, fontWeight: '600', textTransform: 'uppercase', marginBottom: 4 },
  kpiValue: { fontSize: FontSize.lg, fontWeight: '700', color: Colors.text },
  kpiHint: { fontSize: FontSize.xs, color: Colors.textMuted, marginTop: 4 },

  tabRow: { flexDirection: 'row', backgroundColor: Colors.surface, borderBottomWidth: 1, borderBottomColor: Colors.border },
  tab: { paddingVertical: 12, paddingHorizontal: 16, borderBottomWidth: 2, borderBottomColor: 'transparent' },
  tabActive: { borderBottomColor: Colors.primary },
  tabText: { fontSize: FontSize.sm, fontWeight: '600', color: Colors.textMuted },
  tabTextActive: { color: Colors.primary },

  actionsRow: { flexDirection: 'row', justifyContent: 'flex-end', padding: Spacing.md },
  
  btnPrimary: { backgroundColor: Colors.primary, paddingHorizontal: 16, paddingVertical: 10, borderRadius: 8 },
  btnPrimaryText: { color: '#fff', fontSize: FontSize.sm, fontWeight: '700' },
  btnDanger: { backgroundColor: '#fee2e2', paddingHorizontal: 12, paddingVertical: 6, borderRadius: Radius.sm, borderWidth: 1, borderColor: '#fca5a5' },
  btnDangerText: { color: Colors.error, fontSize: FontSize.xs, fontWeight: '600' },
  btnSecondary: { backgroundColor: Colors.surfaceAlt, paddingHorizontal: 12, paddingVertical: 6, borderRadius: Radius.sm, borderWidth: 1, borderColor: Colors.border },
  btnSecondaryText: { color: Colors.text, fontSize: FontSize.sm, fontWeight: '600' },
  btnGhost: { paddingHorizontal: 12, paddingVertical: 6 },
  btnGhostText: { color: Colors.textMuted, fontSize: FontSize.sm, fontWeight: '600' },

  rangeFilterContainer: { backgroundColor: Colors.surface, padding: Spacing.md, borderBottomWidth: 1, borderBottomColor: Colors.border },
  rangeInputs: { flexDirection: 'row', gap: Spacing.md, marginBottom: Spacing.sm },
  quickRangeScroll: { gap: Spacing.sm },

  tableScroll: { flex: 1, padding: Spacing.lg },
  thRow: { flexDirection: 'row', borderBottomWidth: 2, borderBottomColor: Colors.border, paddingBottom: 8, marginBottom: 8 },
  th: { fontSize: FontSize.sm, fontWeight: '700', color: Colors.textMuted, paddingHorizontal: 8 },
  tr: { flexDirection: 'row', paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: Colors.borderLight, alignItems: 'center' },
  td: { fontSize: FontSize.sm, color: Colors.text, paddingHorizontal: 8 },
  emptyText: { textAlign: 'center', padding: 24, color: Colors.textMuted, fontStyle: 'italic' },

  modalHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', padding: Spacing.lg, backgroundColor: Colors.surface, borderBottomWidth: 1, borderBottomColor: Colors.border },
  modalCancel: { fontSize: FontSize.base, color: Colors.textMuted },
  modalTitle: { fontSize: FontSize.lg, fontWeight: '700', color: Colors.text },
  formContent: { padding: Spacing.lg },
  field: { marginBottom: Spacing.lg },
  fieldLabel: { fontSize: FontSize.sm, fontWeight: '600', color: Colors.text, marginBottom: 6 },
  fieldInput: { borderWidth: 1, borderColor: Colors.border, borderRadius: 8, paddingHorizontal: Spacing.md, paddingVertical: 10, fontSize: FontSize.base, color: Colors.text, backgroundColor: Colors.surface },
  pickerWrapper: { borderWidth: 1, borderColor: Colors.border, borderRadius: 8, backgroundColor: Colors.surface, overflow: 'hidden' },
  btnSave: { backgroundColor: Colors.primary, padding: 16, borderRadius: 8, alignItems: 'center', marginTop: Spacing.lg },
  btnSaveText: { color: '#fff', fontSize: FontSize.base, fontWeight: '700' },
});
