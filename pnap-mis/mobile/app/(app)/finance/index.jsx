import { useEffect, useState, useMemo } from 'react';
import {
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Modal,
  Platform,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { useLocalSearchParams, router } from 'expo-router';
import { Picker } from '@react-native-picker/picker';
import * as ImagePicker from 'expo-image-picker';
import { Ionicons } from '@expo/vector-icons';

import { useAuth } from '../../../src/context/AuthContext';
import { useUnit } from '../../../src/context/UnitContext';
import { api, errorMessage } from '../../../src/api/client';
import {
  canManageFinance,
  canApproveExpense,
  isCentralAdminOversight,
  isSuperAdminOversight,
  isSuperAdmin,
} from '../../../src/utils/permissions';
import { useToast } from '../../../src/components/Toast';
import Badge from '../../../src/components/Badge';
import DatePicker from '../../../src/components/DatePicker';
import { Colors, FontSize, Spacing, Radius } from '../../../src/constants/colors';
import { shortDate, PKR, formatCnic, isCompleteCnic } from '../../../src/utils/formatters';
import { downloadAndShare } from '../../../src/utils/export';
import { formatUnitArrangedBy } from '../../../src/utils/unitFormat';

const FINANCE_TABS = [
  { label: 'Donations', value: 'DONATIONS', icon: 'cash-outline' },
  { label: 'Expenses', value: 'EXPENSES', icon: 'receipt-outline' },
  { label: 'Transfers', value: 'TRANSFERS', icon: 'swap-horizontal-outline' },
  { label: 'Monthly', value: 'MONTHLY', icon: 'bar-chart-outline' },
];

const EXPENSE_CATEGORIES = [
  { code: 'OFFICE', label: 'Office' },
  { code: 'TRANSPORT', label: 'Transport' },
  { code: 'PRINTING', label: 'Printing' },
  { code: 'REFRESHMENTS', label: 'Refreshments' },
  { code: 'STAGE_EQUIPMENT', label: 'Stage Equipment' },
  { code: 'COMMUNICATION', label: 'Communication' },
  { code: 'DONATIONS_OUT', label: 'Donations Out' },
  { code: 'SALARIES_STIPENDS', label: 'Salaries / Stipends' },
  { code: 'MISC', label: 'Miscellaneous' },
];

const DONOR_TYPES = [
  { code: 'MEMBER', label: 'Member', icon: 'person-outline' },
  { code: 'NON_MEMBER', label: 'Non-Member', icon: 'people-outline' },
  { code: 'CORPORATE', label: 'Corporate', icon: 'business-outline' },
  { code: 'ANONYMOUS', label: 'Anonymous', icon: 'eye-off-outline' },
];

const PAYMENT_MODES = [
  { code: 'CASH', label: 'Cash' },
  { code: 'BANK_TRANSFER', label: 'Bank Transfer' },
  { code: 'MOBILE_WALLET', label: 'Mobile Wallet' },
  { code: 'CHEQUE', label: 'Cheque' },
];

const ANONYMOUS_CAP = 5000;
const NON_MEMBER_CNIC_THRESHOLD = 50000;

export default function FinanceScreen() {
  const { user } = useAuth();
  const { ctx, provinces } = useUnit();
  const toast = useToast();
  const params = useLocalSearchParams();

  const queryBody = params.body || '';
  const isCongressView = queryBody === 'CONGRESS';
  const isJirgaView = queryBody === 'JIRGA';
  const isCommitteeView = queryBody === 'COMMITTEE';
  const targetBody = isCongressView ? 'CONGRESS' : (isJirgaView ? 'JIRGA' : (isCommitteeView ? 'COMMITTEE' : 'EXECUTIVE'));

  const [jirgaLevel, setJirgaLevel] = useState(() => {
    if (params.unitLevel) return params.unitLevel;
    return 'PROVINCE';
  });
  const [jirgaUnitId, setJirgaUnitId] = useState(() => {
    if (params.unitId && params.unitId !== 'CENTRAL') return params.unitId;
    return provinces?.[0]?._id || '';
  });

  // Sync with provinces when they become available
  useEffect(() => {
    if (isJirgaView && !jirgaUnitId && provinces && provinces.length > 0) {
      setJirgaLevel('PROVINCE');
      setJirgaUnitId(provinces[0]._id);
    }
  }, [provinces, isJirgaView, jirgaUnitId]);

  const activeLevel = isJirgaView ? jirgaLevel : (params.unitLevel || ctx?.unitLevel || 'CENTRAL');
  const rawUnitId = isJirgaView ? jirgaUnitId : (params.unitId || ctx?.unitId || '');
  const canRecord = canManageFinance(user)
    && !isCentralAdminOversight(user)
    && !isSuperAdminOversight(user)
    && !(isSuperAdmin(user) && (activeLevel === 'CENTRAL' || isCongressView));
  const canApprove = canApproveExpense(user);
  const [resolvedUnitId, setResolvedUnitId] = useState(rawUnitId);

  useEffect(() => {
    let currentRaw = rawUnitId;
    if (activeLevel === 'CENTRAL' && (!currentRaw || currentRaw === 'CENTRAL')) {
      api.get('/org/central').then((r) => {
        if (r.data?.data?._id) setResolvedUnitId(r.data.data._id);
      }).catch(() => {});
    } else {
      setResolvedUnitId(currentRaw);
    }
  }, [rawUnitId, activeLevel]);

  const [tab, setTab] = useState('DONATIONS');
  const [donations, setDonations] = useState([]);
  const [expenses, setExpenses] = useState([]);
  const [monthly, setMonthly] = useState([]);
  const [summary, setSummary] = useState(null);
  const [members, setMembers] = useState([]);
  
  const [monthFrom, setMonthFrom] = useState('');
  const [monthTo, setMonthTo] = useState('');

  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  
  const [showDonation, setShowDonation] = useState(false);
  const [showExpense, setShowExpense] = useState(false);
  
  const [donationForm, setDonationForm] = useState({
    amount: '',
    donorType: 'MEMBER',
    donorMemberId: '',
    donorName: '',
    donorCnic: '',
    paymentMode: 'CASH',
    receivedAt: '',
  });
  const [donReceipt, setDonReceipt] = useState(null);

  const [expenseForm, setExpenseForm] = useState({
    amount: '',
    category: 'OFFICE',
    description: '',
    vendor: '',
    paymentMode: 'CASH',
    incurredAt: '',
  });
  const [expEvidence, setExpEvidence] = useState(null);

  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState('');

  // Load eligible members for donor linking
  useEffect(() => {
    if (!resolvedUnitId || resolvedUnitId === 'CENTRAL') {
      api.get('/members', { params: { limit: 500 } }).then((r) => setMembers(r.data?.data || [])).catch(() => {});
      return;
    }
    const p = { limit: 500 };
    if (activeLevel === 'BASIC_UNIT') p.basicUnitId = resolvedUnitId;
    else if (activeLevel === 'AREA') p.areaId = resolvedUnitId;
    else if (activeLevel === 'DISTRICT') p.districtId = resolvedUnitId;
    else if (activeLevel === 'PROVINCE') p.provinceId = resolvedUnitId;
    api.get('/members', { params: p }).then((r) => setMembers(r.data?.data || [])).catch(() => {});
  }, [activeLevel, resolvedUnitId]);

  async function load(silent = false) {
    if (!resolvedUnitId || resolvedUnitId === 'CENTRAL') { setLoading(false); return; }
    if (!silent) setLoading(true);
    const qParams = { unitLevel: activeLevel, unitId: resolvedUnitId, body: targetBody };
    try {
      const [dRes, eRes, sRes] = await Promise.all([
        api.get('/finance/donations', { params: qParams }),
        api.get('/finance/expenses', { params: qParams }),
        api.get('/finance/summary', { params: qParams }).catch(() => ({ data: { data: null } })),
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
    if (!resolvedUnitId || resolvedUnitId === 'CENTRAL') return;
    try {
      const qParams = {
        unitLevel: activeLevel,
        unitId: resolvedUnitId,
        body: targetBody,
        from: monthFrom || undefined,
        to: monthTo || undefined,
      };
      const r = await api.get('/finance/monthly', { params: qParams });
      setMonthly(r.data.data || []);
    } catch { /* ignore */ }
  }

  useEffect(() => { load(); }, [activeLevel, resolvedUnitId, targetBody]);
  useEffect(() => {
    if (tab === 'MONTHLY') {
      loadMonthly();
    }
  }, [activeLevel, resolvedUnitId, tab, targetBody, monthFrom, monthTo]);

  function openDonationModal() {
    const today = new Date().toISOString().split('T')[0];
    setDonationForm({
      amount: '',
      donorType: 'MEMBER',
      donorMemberId: '',
      donorName: '',
      donorCnic: '',
      paymentMode: 'CASH',
      receivedAt: today,
    });
    setDonReceipt(null);
    setErr('');
    setShowDonation(true);
  }

  function openExpenseModal() {
    const today = new Date().toISOString().split('T')[0];
    setExpenseForm({
      amount: '',
      category: 'OFFICE',
      description: '',
      vendor: '',
      paymentMode: 'CASH',
      incurredAt: today,
    });
    setExpEvidence(null);
    setErr('');
    setShowExpense(true);
  }

  const donAmount = parseFloat(donationForm.amount) || 0;
  const donCnicRequired = donationForm.donorType === 'NON_MEMBER' && donAmount > NON_MEMBER_CNIC_THRESHOLD;

  async function pickDonReceipt() {
    if (Platform.OS === 'web' && typeof document !== 'undefined') {
      const input = document.createElement('input');
      input.type = 'file';
      input.accept = 'image/*,.pdf';
      input.onchange = (e) => {
        const file = e.target.files?.[0];
        if (file) setDonReceipt(file);
      };
      input.click();
    } else {
      try {
        const res = await ImagePicker.launchImageLibraryAsync({
          mediaTypes: ['images'],
          allowsMultipleSelection: false,
          quality: 0.85,
        });
        if (!res.canceled && res.assets && res.assets.length > 0) {
          const a = res.assets[0];
          setDonReceipt({
            uri: a.uri,
            name: a.fileName || 'receipt.jpg',
            type: 'image/jpeg',
          });
        }
      } catch (e) {
        toast.error(errorMessage(e));
      }
    }
  }

  async function pickExpEvidence() {
    if (Platform.OS === 'web' && typeof document !== 'undefined') {
      const input = document.createElement('input');
      input.type = 'file';
      input.accept = 'image/*,.pdf';
      input.onchange = (e) => {
        const file = e.target.files?.[0];
        if (file) setExpEvidence(file);
      };
      input.click();
    } else {
      try {
        const res = await ImagePicker.launchImageLibraryAsync({
          mediaTypes: ['images'],
          allowsMultipleSelection: false,
          quality: 0.85,
        });
        if (!res.canceled && res.assets && res.assets.length > 0) {
          const a = res.assets[0];
          setExpEvidence({
            uri: a.uri,
            name: a.fileName || 'voucher.jpg',
            type: 'image/jpeg',
          });
        }
      } catch (e) {
        toast.error(errorMessage(e));
      }
    }
  }

  async function saveDonation() {
    setErr('');
    if (!(donAmount > 0)) { setErr('Amount must be greater than zero.'); return; }
    if (donationForm.donorType === 'ANONYMOUS' && donAmount > ANONYMOUS_CAP) {
      setErr(`Anonymous donations are capped at ${PKR(ANONYMOUS_CAP)}.`);
      return;
    }
    if (donCnicRequired && !donationForm.donorCnic) {
      setErr(`CNIC is required for non-member donations above ${PKR(NON_MEMBER_CNIC_THRESHOLD)}.`);
      return;
    }
    if (donationForm.donorCnic && !isCompleteCnic(donationForm.donorCnic)) {
      setErr('CNIC must be 13 digits (42101-1234567-1).');
      return;
    }
    if (!donationForm.receivedAt) {
      setErr('Received date is required.');
      return;
    }

    setSaving(true);
    try {
      const fd = new FormData();
      let donorName = donationForm.donorName;
      let donorCnic = donationForm.donorCnic;
      if (donationForm.donorType === 'MEMBER' && donationForm.donorMemberId) {
        const found = members.find((m) => String(m._id) === String(donationForm.donorMemberId));
        if (found) {
          if (!donorName) donorName = found.fullName;
          if (!donorCnic && found.cnic) donorCnic = found.cnic;
        }
      }

      const payload = {
        ...donationForm,
        donorName,
        donorCnic,
        unitLevel: activeLevel,
        unitId: resolvedUnitId,
        body: targetBody,
      };

      Object.entries(payload).forEach(([k, v]) => {
        if (v !== '' && v != null) fd.append(k, String(v));
      });

      if (donReceipt) {
        if (Platform.OS === 'web') {
          fd.append('receipt', donReceipt);
        } else {
          fd.append('receipt', {
            uri: donReceipt.uri,
            name: donReceipt.name,
            type: donReceipt.type,
          });
        }
      }

      await api.post('/finance/donations', fd, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });
      const streamLabel = isCongressView ? 'Congress' : (isJirgaView ? 'Jirga' : (isCommitteeView ? 'Committee' : 'Executive'));
      toast.success(`${streamLabel} donation of ${PKR(donAmount)} recorded.`);
      setShowDonation(false);
      load(true);
    } catch (e) {
      setErr(errorMessage(e));
      toast.error(errorMessage(e));
    } finally {
      setSaving(false);
    }
  }

  async function saveExpense() {
    setErr('');
    const expAmount = parseFloat(expenseForm.amount) || 0;
    if (!(expAmount > 0)) { setErr('Amount must be greater than zero.'); return; }
    if (!expenseForm.description || expenseForm.description.trim().length < 3) {
      setErr('Description must be at least 3 characters.');
      return;
    }
    if (!expenseForm.incurredAt) {
      setErr('Incurred date is required.');
      return;
    }

    setSaving(true);
    try {
      const fd = new FormData();
      const payload = {
        ...expenseForm,
        unitLevel: activeLevel,
        unitId: resolvedUnitId,
        body: targetBody,
      };

      Object.entries(payload).forEach(([k, v]) => {
        if (v !== '' && v != null) fd.append(k, String(v));
      });

      if (expEvidence) {
        if (Platform.OS === 'web') {
          fd.append('evidence', expEvidence);
        } else {
          fd.append('evidence', {
            uri: expEvidence.uri,
            name: expEvidence.name,
            type: expEvidence.type,
          });
        }
      }

      await api.post('/finance/expenses', fd, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });
      const streamLabel = isCongressView ? 'Congress' : (isJirgaView ? 'Jirga' : (isCommitteeView ? 'Committee' : 'Executive'));
      toast.success(`${streamLabel} expense of ${PKR(expAmount)} submitted.`);
      setShowExpense(false);
      load(true);
    } catch (e) {
      setErr(errorMessage(e));
      toast.error(errorMessage(e));
    } finally {
      setSaving(false);
    }
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

  const [exporting, setExporting] = useState(null);

  function getExportParams() {
    return {
      unitLevel: activeLevel,
      unitId: resolvedUnitId || (activeLevel === 'CENTRAL' ? 'CENTRAL' : (params.unitId || ctx?.unitId)),
      body: targetBody,
      from: monthFrom || undefined,
      to: monthTo || undefined,
    };
  }

  function getExportFilename(ext) {
    const unitName = ctx?.unitName || (activeLevel === 'CENTRAL' ? 'Central' : activeLevel);
    const stream = isCongressView
      ? '-congress'
      : (isJirgaView
        ? '-jirga'
        : (isCommitteeView
          ? '-committee'
          : '-executive'));
    const safeUnit = (unitName || 'unit').replace(/[^a-zA-Z0-9_-]/g, '_');
    return `${safeUnit}${stream}-finance.${ext}`;
  }

  async function handleExport(fmt) {
    if (exporting) return;
    setExporting(fmt);
    try {
      const qParams = getExportParams();
      const filename = getExportFilename(fmt);
      await downloadAndShare(`/exports/unit/finance/${fmt}`, filename, qParams);
      toast.success(`${fmt.toUpperCase()} export downloaded.`);
    } catch (e) {
      toast.error(e.message || `Export ${fmt.toUpperCase()} failed.`);
    } finally {
      setExporting(null);
    }
  }

  const selectedProvince = isJirgaView ? (provinces || []).find((p) => String(p._id) === String(jirgaUnitId)) : null;
  const pageTitle = isCongressView
    ? 'National Congress Finance · PKNAP Central'
    : (isJirgaView
      ? (activeLevel === 'CENTRAL' ? 'Qomi Jirga Finance · PKNAP Central' : `Sobayi Jirga Finance · ${selectedProvince?.name || 'Province'}`)
      : (isCommitteeView
        ? `Committee Finance · ${ctx?.unitName || 'PKNAP Central'}`
        : `Finance · ${ctx?.unitName || 'PKNAP Central'}`));

  const pageSubtitle = isCongressView
    ? 'PKNAP Central · National Congress fund ledger & transactions'
    : (isJirgaView
      ? (activeLevel === 'CENTRAL' ? 'PKNAP Central · Qomi Jirga transactions' : `${selectedProvince?.name || 'Province'} · Sobayi Jirga fund ledger`)
      : `${ctx?.unitName || (activeLevel === 'CENTRAL' ? 'PKNAP Central' : 'My Unit')} · Inflow, Outflow & Monthly Statements`);

  const recordDonationBtnLabel = isCongressView
    ? '+ Record Congress Donation'
    : (isJirgaView
      ? '+ Record Jirga Donation'
      : (isCommitteeView ? '+ Record Committee Donation' : '+ Record Donation'));

  const recordExpenseBtnLabel = isCongressView
    ? '+ Record Congress Expense'
    : (isJirgaView
      ? '+ Record Jirga Expense'
      : (isCommitteeView ? '+ Record Committee Expense' : '+ Record Expense'));

  return (
    <SafeAreaView style={styles.safe}>
      {/* Top Header Card */}
      <View style={styles.header}>
        <View style={styles.headerTop}>
          <View style={{ flex: 1 }}>
            <View style={styles.badgeRow}>
              <View style={styles.unitLevelBadge}>
                <Text style={styles.unitLevelBadgeText}>{activeLevel.replace('_', ' ')}</Text>
              </View>
              {isJirgaView && (
                <View style={styles.streamBadgeJirga}>
                  <Text style={styles.streamBadgeTextJirga}>Jirga Ledger</Text>
                </View>
              )}
            </View>
            <Text style={styles.pageTitle}>{pageTitle}</Text>
            <Text style={styles.pageSubtitle}>{pageSubtitle}</Text>
          </View>

          <View style={styles.headerActionsRow}>
            <TouchableOpacity
              style={styles.btnExport}
              onPress={() => router.push({
                pathname: '/finance/transfers',
                params: { body: targetBody, unitLevel: activeLevel, unitId: resolvedUnitId }
              })}
            >
              <Ionicons name="swap-horizontal-outline" size={15} color={Colors.primary} />
              <Text style={[styles.btnExportText, { color: Colors.primary, fontWeight: '700' }]}>Transfers</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.btnExport, exporting === 'pdf' && { opacity: 0.6 }]}
              onPress={() => handleExport('pdf')}
              disabled={!!exporting}
            >
              {exporting === 'pdf' ? (
                <ActivityIndicator size="small" color={Colors.textMuted} />
              ) : (
                <Ionicons name="document-text-outline" size={15} color={Colors.text} />
              )}
              <Text style={styles.btnExportText}>PDF</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.btnExport, exporting === 'xlsx' && { opacity: 0.6 }]}
              onPress={() => handleExport('xlsx')}
              disabled={!!exporting}
            >
              {exporting === 'xlsx' ? (
                <ActivityIndicator size="small" color={Colors.textMuted} />
              ) : (
                <Ionicons name="stats-chart-outline" size={15} color={Colors.text} />
              )}
              <Text style={styles.btnExportText}>Excel</Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>

      {/* Province Switcher Pills for Jirga */}
      {isJirgaView && provinces && provinces.length > 0 && (
        <View style={styles.tierPillsWrapper}>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.tierPillsScroll}>
            {provinces.map((prov) => {
              const isActive = jirgaLevel === 'PROVINCE' && String(jirgaUnitId) === String(prov._id);
              return (
                <TouchableOpacity
                  key={prov._id}
                  style={[styles.tierPill, isActive && styles.tierPillActive]}
                  onPress={() => {
                    setJirgaLevel('PROVINCE');
                    setJirgaUnitId(prov._id);
                  }}
                >
                  <Ionicons
                    name="location-outline"
                    size={14}
                    color={isActive ? '#fff' : Colors.textMuted}
                    style={{ marginRight: 4 }}
                  />
                  <Text style={[styles.tierPillText, isActive && styles.tierPillTextActive]}>
                    {prov.name} Sobayi Jirga
                  </Text>
                </TouchableOpacity>
              );
            })}
            <TouchableOpacity
              style={[styles.tierPill, jirgaLevel === 'CENTRAL' && styles.tierPillActive]}
              onPress={() => {
                setJirgaLevel('CENTRAL');
                setJirgaUnitId('CENTRAL');
              }}
            >
              <Ionicons
                name="shield-outline"
                size={14}
                color={jirgaLevel === 'CENTRAL' ? '#fff' : Colors.textMuted}
                style={{ marginRight: 4 }}
              />
              <Text style={[styles.tierPillText, jirgaLevel === 'CENTRAL' && styles.tierPillTextActive]}>
                Qomi Jirga (Central)
              </Text>
            </TouchableOpacity>
          </ScrollView>
        </View>
      )}

      <ScrollView style={{ flex: 1 }} showsVerticalScrollIndicator={false}>
        {/* KPI Dashboard Cards */}
        {summary && (
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            style={styles.kpiScroll}
            contentContainerStyle={styles.kpiContainer}
          >
            {/* Donations KPI */}
            <View style={[styles.kpiCard, { borderTopColor: '#16a34a' }]}>
              <View style={styles.kpiHeaderRow}>
                <Text style={styles.kpiLabel}>Donations</Text>
                <View style={[styles.kpiIconBox, { backgroundColor: '#dcfce7' }]}>
                  <Ionicons name="arrow-down-outline" size={14} color="#16a34a" />
                </View>
              </View>
              <Text style={[styles.kpiValue, { color: '#16a34a' }]}>{PKR(summary.donations?.total || 0)}</Text>
              <Text style={styles.kpiHint}>{summary.donations?.count || 0} entries</Text>
            </View>

            {/* Approved Expenses KPI */}
            <View style={[styles.kpiCard, { borderTopColor: '#dc2626' }]}>
              <View style={styles.kpiHeaderRow}>
                <Text style={styles.kpiLabel}>Approved Expenses</Text>
                <View style={[styles.kpiIconBox, { backgroundColor: '#fee2e2' }]}>
                  <Ionicons name="arrow-up-outline" size={14} color="#dc2626" />
                </View>
              </View>
              <Text style={[styles.kpiValue, { color: '#dc2626' }]}>{PKR(summary.expenses?.total || 0)}</Text>
              <Text style={styles.kpiHint}>{summary.expenses?.count || 0} entries</Text>
            </View>

            {/* Transfers In KPI */}
            {summary.transfersIn ? (
              <View style={[styles.kpiCard, { borderTopColor: '#0284c7' }]}>
                <View style={styles.kpiHeaderRow}>
                  <Text style={styles.kpiLabel}>Transfers In</Text>
                  <View style={[styles.kpiIconBox, { backgroundColor: '#e0f2fe' }]}>
                    <Ionicons name="enter-outline" size={14} color="#0284c7" />
                  </View>
                </View>
                <Text style={[styles.kpiValue, { color: '#0284c7' }]}>{PKR(summary.transfersIn.total)}</Text>
                <Text style={styles.kpiHint}>{summary.transfersIn.count} acknowledged</Text>
              </View>
            ) : null}

            {/* Transfers Out KPI */}
            {summary.transfersOut ? (
              <View style={[styles.kpiCard, { borderTopColor: '#d97706' }]}>
                <View style={styles.kpiHeaderRow}>
                  <Text style={styles.kpiLabel}>Transfers Out</Text>
                  <View style={[styles.kpiIconBox, { backgroundColor: '#fef3c7' }]}>
                    <Ionicons name="exit-outline" size={14} color="#d97706" />
                  </View>
                </View>
                <Text style={[styles.kpiValue, { color: '#d97706' }]}>{PKR(summary.transfersOut.total)}</Text>
                <Text style={styles.kpiHint}>{summary.transfersOut.count} acknowledged</Text>
              </View>
            ) : null}

            {/* Net Balance KPI */}
            <View style={[styles.kpiCard, { borderTopColor: (summary.balance || 0) < 0 ? '#dc2626' : '#16a34a' }]}>
              <View style={styles.kpiHeaderRow}>
                <Text style={styles.kpiLabel}>Net Balance</Text>
                <View style={[styles.kpiIconBox, { backgroundColor: (summary.balance || 0) < 0 ? '#fee2e2' : '#dcfce7' }]}>
                  <Ionicons
                    name="wallet-outline"
                    size={14}
                    color={(summary.balance || 0) < 0 ? '#dc2626' : '#16a34a'}
                  />
                </View>
              </View>
              <Text style={[styles.kpiValue, { color: (summary.balance || 0) < 0 ? '#dc2626' : '#16a34a' }]}>
                {PKR(summary.balance || 0)}
              </Text>
              <View style={{ marginTop: 4 }}>
                <Text style={[styles.kpiHint, { fontWeight: '600', color: (summary.balance || 0) < 0 ? '#dc2626' : '#16a34a' }]}>
                  {(summary.balance || 0) < 0 ? 'Deficit' : 'Surplus'}
                </Text>
              </View>
            </View>
          </ScrollView>
        )}

        {/* Tab & Action Toolbar */}
        <View style={styles.toolbarSection}>
          <View style={styles.segmentedControl}>
            {FINANCE_TABS.map((t) => {
              const active = tab === t.value;
              return (
                <TouchableOpacity
                  key={t.value}
                  style={[styles.segmentBtn, active && styles.segmentBtnActive]}
                  onPress={() => {
                    if (t.value === 'TRANSFERS') {
                      router.push({
                        pathname: '/finance/transfers',
                        params: { body: targetBody, unitLevel: activeLevel, unitId: resolvedUnitId }
                      });
                    } else {
                      setTab(t.value);
                    }
                  }}
                >
                  <Ionicons
                    name={t.icon}
                    size={15}
                    color={active ? Colors.primary : Colors.textMuted}
                    style={{ marginRight: 6 }}
                  />
                  <Text style={[styles.segmentText, active && styles.segmentTextActive]}>{t.label}</Text>
                </TouchableOpacity>
              );
            })}
          </View>

          {canRecord && (
            <View style={styles.recordActionBox}>
              {tab === 'DONATIONS' && (
                <TouchableOpacity style={styles.btnRecord} onPress={openDonationModal}>
                  <Ionicons name="add-circle" size={18} color="#fff" />
                  <Text style={styles.btnRecordText}>{recordDonationBtnLabel}</Text>
                </TouchableOpacity>
              )}
              {tab === 'EXPENSES' && (
                <TouchableOpacity style={[styles.btnRecord, { backgroundColor: '#0f766e' }]} onPress={openExpenseModal}>
                  <Ionicons name="add-circle" size={18} color="#fff" />
                  <Text style={styles.btnRecordText}>{recordExpenseBtnLabel}</Text>
                </TouchableOpacity>
              )}
            </View>
          )}
        </View>

        {/* Monthly Filter Bar */}
        {tab === 'MONTHLY' && (
          <View style={styles.rangeCard}>
            <View style={styles.rangeHeader}>
              <Ionicons name="filter-outline" size={16} color={Colors.text} />
              <Text style={styles.rangeHeaderTitle}>Date Filter & Presets</Text>
            </View>
            <View style={styles.rangeInputs}>
              <View style={styles.rangeInputCol}>
                <Text style={styles.rangeLabel}>From</Text>
                <TextInput
                  style={styles.rangeInput}
                  placeholder="YYYY-MM-DD"
                  placeholderTextColor={Colors.textLight}
                  value={monthFrom}
                  onChangeText={setMonthFrom}
                />
              </View>
              <View style={styles.rangeInputCol}>
                <Text style={styles.rangeLabel}>To</Text>
                <TextInput
                  style={styles.rangeInput}
                  placeholder="YYYY-MM-DD"
                  placeholderTextColor={Colors.textLight}
                  value={monthTo}
                  onChangeText={setMonthTo}
                />
              </View>
            </View>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.quickRangeScroll}>
              <TouchableOpacity style={styles.rangePill} onPress={() => applyQuickRange('this')}>
                <Text style={styles.rangePillText}>This month</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.rangePill} onPress={() => applyQuickRange('last')}>
                <Text style={styles.rangePillText}>Last month</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.rangePill} onPress={() => applyQuickRange('3')}>
                <Text style={styles.rangePillText}>Last 3 months</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.rangePill} onPress={() => applyQuickRange('ytd')}>
                <Text style={styles.rangePillText}>Year-to-date</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[styles.rangePill, { backgroundColor: '#f1f5f9' }]} onPress={() => applyQuickRange('all')}>
                <Text style={[styles.rangePillText, { color: Colors.textMuted }]}>All time</Text>
              </TouchableOpacity>
            </ScrollView>
          </View>
        )}

        {/* Data Table */}
        <View style={styles.tableContainer}>
          <ScrollView horizontal showsHorizontalScrollIndicator={true} contentContainerStyle={{ paddingBottom: 24 }}>
            {tab === 'DONATIONS' && (
              <View style={{ minWidth: 680 }}>
                <View style={styles.thRow}>
                  <Text style={[styles.th, { width: 150 }]}>Receipt</Text>
                  <Text style={[styles.th, { width: 110 }]}>Date</Text>
                  <Text style={[styles.th, { width: 160 }]}>Donor</Text>
                  <Text style={[styles.th, { width: 110 }]}>Mode</Text>
                  <Text style={[styles.th, { width: 130, textAlign: 'right' }]}>Amount (PKR)</Text>
                </View>

                {donations.length === 0 && !loading && (
                  <View style={styles.emptyWrap}>
                    <Ionicons name="wallet-outline" size={32} color={Colors.textLight} />
                    <Text style={styles.emptyText}>
                      No {isJirgaView ? 'Jirga' : (isCommitteeView ? 'committee' : 'executive')} donations recorded yet.
                    </Text>
                  </View>
                )}

                {donations.map((d) => {
                  const memberObj = (d.donorMemberId && typeof d.donorMemberId === 'object') ? d.donorMemberId : null;
                  const memberFromList = (!memberObj && d.donorMemberId)
                    ? members.find((m) => String(m._id) === String(d.donorMemberId))
                    : null;
                  const effectiveDonorName = d.donorType === 'ANONYMOUS'
                    ? 'Anonymous'
                    : (d.donorName || memberObj?.fullName || memberFromList?.fullName || (d.donorType === 'MEMBER' ? 'Member' : '—'));

                  const isCng = d.body === 'CONGRESS';
                  const isJrg = d.body === 'JIRGA';
                  const isCm = d.body === 'COMMITTEE';

                  return (
                    <View key={d._id} style={styles.tr}>
                      <View style={[styles.td, { width: 150 }]}>
                        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                          <Badge
                            label={isCng ? 'Congress' : (isJrg ? 'Jirga' : (isCm ? 'Committee' : 'Executive'))}
                            color={isCng ? '#0369a1' : (isJrg ? '#6b21a8' : (isCm ? '#0369a1' : '#475569'))}
                            bg={isCng ? '#e0f2fe' : (isJrg ? '#f3e8ff' : (isCm ? '#e0f2fe' : '#f1f5f9'))}
                          />
                          <Text style={{ fontSize: 11, color: Colors.text, fontWeight: '700' }}>{d.receiptNo}</Text>
                        </View>
                        {d.unitLevel && (
                          <Text style={styles.unitArrangedSubText}>
                            {formatUnitArrangedBy(d, { isCommitteeView, isJirgaView, isCongressView })}
                          </Text>
                        )}
                      </View>

                      <Text style={[styles.td, { width: 110 }]}>{shortDate(d.receivedAt || d.createdAt)}</Text>
                      <Text style={[styles.td, { width: 160 }]} numberOfLines={1}>{effectiveDonorName}</Text>
                      <Text style={[styles.td, { width: 110 }]}>{d.paymentMode}</Text>
                      <Text style={[styles.td, { width: 130, textAlign: 'right', fontWeight: '800', color: '#15803d' }]}>
                        {PKR(d.amount)}
                      </Text>
                    </View>
                  );
                })}
              </View>
            )}

            {tab === 'EXPENSES' && (
              <View style={{ minWidth: 800 }}>
                <View style={styles.thRow}>
                  <Text style={[styles.th, { width: 100 }]}>Date</Text>
                  <Text style={[styles.th, { width: 130 }]}>Category</Text>
                  <Text style={[styles.th, { width: 180 }]}>Description</Text>
                  <Text style={[styles.th, { width: 110 }]}>Vendor</Text>
                  <Text style={[styles.th, { width: 110, textAlign: 'right' }]}>Amount</Text>
                  <Text style={[styles.th, { width: 90 }]}>State</Text>
                  <Text style={[styles.th, { width: 150 }]}>Actions</Text>
                </View>

                {expenses.length === 0 && !loading && (
                  <View style={styles.emptyWrap}>
                    <Ionicons name="receipt-outline" size={32} color={Colors.textLight} />
                    <Text style={styles.emptyText}>
                      No {isCongressView ? 'Congress' : (isJirgaView ? 'Jirga' : (isCommitteeView ? 'committee' : 'executive'))} expenses recorded yet.
                    </Text>
                  </View>
                )}

                {expenses.map((e) => {
                  const isCng = e.body === 'CONGRESS';
                  const isJrg = e.body === 'JIRGA';
                  const isCm = e.body === 'COMMITTEE';

                  return (
                    <View key={e._id} style={styles.tr}>
                      <Text style={[styles.td, { width: 100 }]}>{shortDate(e.incurredAt || e.createdAt)}</Text>
                      <View style={[styles.td, { width: 130 }]}>
                        <Badge
                          label={isCng ? 'Congress' : (isJrg ? 'Jirga' : (isCm ? 'Committee' : 'Executive'))}
                          color={isCng ? '#0369a1' : (isJrg ? '#6b21a8' : (isCm ? '#0369a1' : '#475569'))}
                          bg={isCng ? '#e0f2fe' : (isJrg ? '#f3e8ff' : (isCm ? '#e0f2fe' : '#f1f5f9'))}
                        />
                        <Text style={{ fontSize: 11, color: Colors.text, marginTop: 2, fontWeight: '600' }}>{e.category}</Text>
                      </View>
                      <View style={[styles.td, { width: 180 }]}>
                        <Text style={{ fontSize: 12, color: Colors.text }} numberOfLines={2}>{e.description}</Text>
                        {e.unitLevel && (
                          <Text style={styles.unitArrangedSubText}>
                            {formatUnitArrangedBy(e, { isCommitteeView, isJirgaView, isCongressView })}
                          </Text>
                        )}
                      </View>
                      <Text style={[styles.td, { width: 110 }]} numberOfLines={1}>{e.vendor || '—'}</Text>
                      <Text style={[styles.td, { width: 110, textAlign: 'right', fontWeight: '800', color: '#b91c1c' }]}>
                        {PKR(e.amount)}
                      </Text>
                      <View style={[styles.td, { width: 90 }]}>
                        <Badge
                          label={e.state || 'PENDING'}
                          color={e.state === 'APPROVED' ? '#15803d' : (e.state === 'REJECTED' ? '#b91c1c' : '#b45309')}
                          bg={e.state === 'APPROVED' ? '#dcfce7' : (e.state === 'REJECTED' ? '#fee2e2' : '#fef3c7')}
                        />
                      </View>
                      <View style={[styles.td, { width: 150, flexDirection: 'row', gap: 6 }]}>
                        {e.state === 'PENDING' && canApprove ? (
                          <>
                            <TouchableOpacity style={styles.btnApprove} onPress={() => decideExpense(e._id, 'APPROVED')}>
                              <Ionicons name="checkmark" size={13} color="#15803d" />
                              <Text style={styles.btnApproveText}>Approve</Text>
                            </TouchableOpacity>
                            <TouchableOpacity style={styles.btnDanger} onPress={() => decideExpense(e._id, 'REJECTED')}>
                              <Ionicons name="close" size={13} color="#b91c1c" />
                              <Text style={styles.btnDangerText}>Reject</Text>
                            </TouchableOpacity>
                          </>
                        ) : null}
                      </View>
                    </View>
                  );
                })}
              </View>
            )}

            {tab === 'MONTHLY' && (
              <View style={{ minWidth: 680 }}>
                <View style={styles.thRow}>
                  <Text style={[styles.th, { width: 110 }]}>Month</Text>
                  <Text style={[styles.th, { width: 120, textAlign: 'right' }]}>Donations</Text>
                  <Text style={[styles.th, { width: 120, textAlign: 'right' }]}>Transfers In</Text>
                  <Text style={[styles.th, { width: 120, textAlign: 'right' }]}>Expenses</Text>
                  <Text style={[styles.th, { width: 120, textAlign: 'right' }]}>Transfers Out</Text>
                  <Text style={[styles.th, { width: 120, textAlign: 'right' }]}>Net Balance</Text>
                </View>

                {monthly.length === 0 && !loading && (
                  <View style={styles.emptyWrap}>
                    <Ionicons name="calendar-outline" size={32} color={Colors.textLight} />
                    <Text style={styles.emptyText}>No monthly statements found for this period.</Text>
                  </View>
                )}

                {monthly.map((m) => (
                  <View key={m.month} style={styles.tr}>
                    <Text style={[styles.td, { width: 110, fontWeight: '600' }]}>{m.month}</Text>
                    <Text style={[styles.td, { width: 120, textAlign: 'right', color: '#16a34a', fontWeight: '600' }]}>{PKR(m.donations)}</Text>
                    <Text style={[styles.td, { width: 120, textAlign: 'right', color: '#0284c7' }]}>{PKR(m.transfersIn)}</Text>
                    <Text style={[styles.td, { width: 120, textAlign: 'right', color: '#dc2626', fontWeight: '600' }]}>{PKR(m.expenses)}</Text>
                    <Text style={[styles.td, { width: 120, textAlign: 'right', color: '#d97706' }]}>{PKR(m.transfersOut)}</Text>
                    <Text style={[styles.td, { width: 120, textAlign: 'right', fontWeight: '800', color: m.netBalance < 0 ? '#dc2626' : '#16a34a' }]}>
                      {PKR(m.netBalance)}
                    </Text>
                  </View>
                ))}

                {monthly.length > 0 && (
                  <View style={[styles.tr, { backgroundColor: '#f8fafc', borderTopWidth: 2, borderTopColor: Colors.border }]}>
                    <Text style={[styles.td, { width: 110, fontWeight: '800' }]}>Totals</Text>
                    <Text style={[styles.td, { width: 120, textAlign: 'right', fontWeight: '800', color: '#16a34a' }]}>
                      {PKR(monthly.reduce((a, m) => a + m.donations, 0))}
                    </Text>
                    <Text style={[styles.td, { width: 120, textAlign: 'right', fontWeight: '800', color: '#0284c7' }]}>
                      {PKR(monthly.reduce((a, m) => a + m.transfersIn, 0))}
                    </Text>
                    <Text style={[styles.td, { width: 120, textAlign: 'right', fontWeight: '800', color: '#dc2626' }]}>
                      {PKR(monthly.reduce((a, m) => a + m.expenses, 0))}
                    </Text>
                    <Text style={[styles.td, { width: 120, textAlign: 'right', fontWeight: '800', color: '#d97706' }]}>
                      {PKR(monthly.reduce((a, m) => a + m.transfersOut, 0))}
                    </Text>
                    <Text style={[styles.td, { width: 120, textAlign: 'right', fontWeight: '900', color: '#0f172a' }]}>
                      {PKR(monthly.reduce((a, m) => a + m.netBalance, 0))}
                    </Text>
                  </View>
                )}
              </View>
            )}
          </ScrollView>
        </View>
      </ScrollView>

      {/* Record Donation Modal */}
      <Modal visible={showDonation} animationType="slide" presentationStyle="pageSheet" onRequestClose={() => setShowDonation(false)}>
        <SafeAreaView style={styles.modalSafe}>
          <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1 }}>
            <View style={styles.modalHeaderCard}>
              <View style={{ flex: 1 }}>
                <Text style={styles.modalHeaderCardTitle}>{recordDonationBtnLabel.replace('+ ', '')}</Text>
                <Text style={styles.modalHeaderCardSub}>
                  Fields marked with <Text style={{ color: Colors.error, fontWeight: '700' }}>*</Text> are required
                </Text>
              </View>
              <TouchableOpacity style={styles.modalCloseCircle} onPress={() => setShowDonation(false)}>
                <Ionicons name="close" size={20} color="#475569" />
              </TouchableOpacity>
            </View>

            <ScrollView contentContainerStyle={styles.formScrollBody} keyboardShouldPersistTaps="handled">
              {err ? (
                <View style={styles.formErrorBox}>
                  <Ionicons name="alert-circle" size={18} color="#b91c1c" />
                  <Text style={styles.formErrorText}>{err}</Text>
                </View>
              ) : null}

              {/* Amount Field Card */}
              <View style={styles.formCard}>
                <Text style={styles.cardHeaderLabel}>
                  Amount & Currency <Text style={{ color: Colors.error }}>*</Text>
                </Text>
                <View style={styles.amountInputRow}>
                  <View style={styles.currencyPrefixBadge}>
                    <Text style={styles.currencyPrefixText}>PKR</Text>
                  </View>
                  <TextInput
                    style={styles.amountInput}
                    value={donationForm.amount}
                    onChangeText={(v) => setDonationForm((f) => ({ ...f, amount: v }))}
                    keyboardType="numeric"
                    placeholder="0.00"
                    placeholderTextColor="#94a3b8"
                  />
                </View>
                {donationForm.donorType === 'ANONYMOUS' && (
                  <View style={styles.capNoticeBox}>
                    <Ionicons name="information-circle-outline" size={14} color="#d97706" />
                    <Text style={styles.capNoticeText}>Anonymous donations are capped at {PKR(ANONYMOUS_CAP)}.</Text>
                  </View>
                )}
              </View>

              {/* Donor Type & Details Card */}
              <View style={styles.formCard}>
                <Text style={styles.cardHeaderLabel}>
                  Donor Information <Text style={{ color: Colors.error }}>*</Text>
                </Text>

                {/* Donor Type Pill Selector */}
                <View style={styles.donorTypePillGrid}>
                  {DONOR_TYPES.map((t) => {
                    const isSel = donationForm.donorType === t.code;
                    return (
                      <TouchableOpacity
                        key={t.code}
                        style={[styles.donorTypeChip, isSel && styles.donorTypeChipActive]}
                        onPress={() => {
                          const nextType = t.code;
                          const mem = nextType === 'MEMBER' ? members.find((m) => String(m._id) === String(donationForm.donorMemberId)) : null;
                          setDonationForm((f) => ({
                            ...f,
                            donorType: nextType,
                            donorMemberId: nextType === 'MEMBER' ? f.donorMemberId : '',
                            donorName: nextType === 'MEMBER' ? (mem?.fullName || '') : (nextType === 'ANONYMOUS' ? '' : f.donorName),
                            donorCnic: nextType === 'MEMBER' ? (mem?.cnic || '') : (nextType === 'ANONYMOUS' ? '' : f.donorCnic),
                          }));
                        }}
                      >
                        <Ionicons
                          name={t.icon}
                          size={16}
                          color={isSel ? '#1e40af' : '#64748b'}
                        />
                        <Text style={[styles.donorTypeChipText, isSel && styles.donorTypeChipTextActive]}>
                          {t.label}
                        </Text>
                      </TouchableOpacity>
                    );
                  })}
                </View>

                {/* Member selection dropdown */}
                {donationForm.donorType === 'MEMBER' && (
                  <View style={styles.inputGroup}>
                    <Text style={styles.inputGroupLabel}>Select Member <Text style={{ color: Colors.error }}>*</Text></Text>
                    <View style={styles.modernPickerWrap}>
                      <Picker
                        selectedValue={donationForm.donorMemberId}
                        onValueChange={(val) => {
                          const sel = members.find((m) => String(m._id) === String(val));
                          setDonationForm((f) => ({
                            ...f,
                            donorMemberId: val,
                            donorName: sel ? sel.fullName : '',
                            donorCnic: sel?.cnic || '',
                          }));
                        }}
                      >
                        <Picker.Item label="— Choose from registered members —" value="" />
                        {members.map((m) => (
                          <Picker.Item key={m._id} label={`${m.fullName} · ${m.memberId || m.cnic || ''}`} value={m._id} />
                        ))}
                      </Picker>
                    </View>
                    <Text style={styles.fieldHint}>Linking records this donation on the member's annual performance report.</Text>
                  </View>
                )}

                {/* Non-member / Corporate fields */}
                {(donationForm.donorType === 'NON_MEMBER' || donationForm.donorType === 'CORPORATE') && (
                  <>
                    <View style={styles.inputGroup}>
                      <Text style={styles.inputGroupLabel}>Donor Name</Text>
                      <TextInput
                        style={styles.modernTextInput}
                        value={donationForm.donorName}
                        onChangeText={(v) => setDonationForm((f) => ({ ...f, donorName: v }))}
                        placeholder="e.g. Haji Abdul Qadir"
                        placeholderTextColor="#94a3b8"
                      />
                    </View>

                    <View style={styles.inputGroup}>
                      <Text style={styles.inputGroupLabel}>
                        Donor CNIC {donCnicRequired ? <Text style={{ color: Colors.error }}>*</Text> : '(Optional)'}
                      </Text>
                      <TextInput
                        style={styles.modernTextInput}
                        value={donationForm.donorCnic}
                        onChangeText={(v) => setDonationForm((f) => ({ ...f, donorCnic: formatCnic(v) }))}
                        placeholder="42101-1234567-1"
                        placeholderTextColor="#94a3b8"
                        keyboardType="numeric"
                      />
                      <Text style={styles.fieldHint}>
                        {donationForm.donorType === 'NON_MEMBER'
                          ? `Required for non-member donations exceeding ${PKR(NON_MEMBER_CNIC_THRESHOLD)}.`
                          : 'Optional for audit documentation.'}
                      </Text>
                    </View>
                  </>
                )}
              </View>

              {/* Payment & Date Card */}
              <View style={styles.formCard}>
                <Text style={styles.cardHeaderLabel}>
                  Payment & Transaction Details <Text style={{ color: Colors.error }}>*</Text>
                </Text>

                <View style={styles.inputGroup}>
                  <Text style={styles.inputGroupLabel}>Payment Mode <Text style={{ color: Colors.error }}>*</Text></Text>
                  <View style={styles.modernPickerWrap}>
                    <Picker
                      selectedValue={donationForm.paymentMode}
                      onValueChange={(itemValue) => setDonationForm((f) => ({ ...f, paymentMode: itemValue }))}
                    >
                      {PAYMENT_MODES.map((t) => <Picker.Item key={t.code} label={t.label} value={t.code} />)}
                    </Picker>
                  </View>
                </View>

                <View style={styles.inputGroup}>
                  <DatePicker
                    label="Received Date *"
                    value={donationForm.receivedAt}
                    onChange={(v) => setDonationForm((f) => ({ ...f, receivedAt: v }))}
                    placeholder="Select received date"
                  />
                </View>

                {/* Receipt Attachment Box */}
                <View style={styles.inputGroup}>
                  <Text style={styles.inputGroupLabel}>Receipt Image or PDF (Optional)</Text>
                  <TouchableOpacity style={[styles.modernUploadZone, donReceipt && styles.modernUploadZoneActive]} onPress={pickDonReceipt}>
                    <View style={[styles.uploadIconCircle, donReceipt && { backgroundColor: '#dcfce7' }]}>
                      <Ionicons
                        name={donReceipt ? 'checkmark-circle' : 'cloud-upload'}
                        size={22}
                        color={donReceipt ? '#15803d' : '#1e40af'}
                      />
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={[styles.uploadZoneTitle, donReceipt && { color: '#15803d' }]}>
                        {donReceipt ? (donReceipt.name || 'Receipt Document Selected') : 'Upload Receipt / Deposit Slip'}
                      </Text>
                      <Text style={styles.uploadZoneSub}>
                        {donReceipt ? 'Tap to change attached file' : 'PNG, JPG, or PDF (up to 10MB)'}
                      </Text>
                    </View>
                  </TouchableOpacity>
                </View>
              </View>

              {/* Bottom Actions */}
              <View style={styles.modalBottomActions}>
                <TouchableOpacity style={styles.btnModalCancel} onPress={() => setShowDonation(false)}>
                  <Text style={styles.btnModalCancelText}>Cancel</Text>
                </TouchableOpacity>
                <TouchableOpacity style={styles.btnModalSubmit} onPress={saveDonation} disabled={saving}>
                  {saving ? (
                    <ActivityIndicator color="#fff" />
                  ) : (
                    <>
                      <Ionicons name="checkmark-circle-outline" size={18} color="#fff" style={{ marginRight: 6 }} />
                      <Text style={styles.btnModalSubmitText}>Record Donation</Text>
                    </>
                  )}
                </TouchableOpacity>
              </View>
            </ScrollView>
          </KeyboardAvoidingView>
        </SafeAreaView>
      </Modal>

      {/* Record Expense Modal */}
      <Modal visible={showExpense} animationType="slide" presentationStyle="pageSheet" onRequestClose={() => setShowExpense(false)}>
        <SafeAreaView style={styles.modalSafe}>
          <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1 }}>
            <View style={styles.modalHeaderCard}>
              <View style={{ flex: 1 }}>
                <Text style={styles.modalHeaderCardTitle}>{recordExpenseBtnLabel.replace('+ ', '')}</Text>
                <Text style={styles.modalHeaderCardSub}>
                  Fields marked with <Text style={{ color: Colors.error, fontWeight: '700' }}>*</Text> are required
                </Text>
              </View>
              <TouchableOpacity style={styles.modalCloseCircle} onPress={() => setShowExpense(false)}>
                <Ionicons name="close" size={20} color="#475569" />
              </TouchableOpacity>
            </View>

            <ScrollView contentContainerStyle={styles.formScrollBody} keyboardShouldPersistTaps="handled">
              {err ? (
                <View style={styles.formErrorBox}>
                  <Ionicons name="alert-circle" size={18} color="#b91c1c" />
                  <Text style={styles.formErrorText}>{err}</Text>
                </View>
              ) : null}

              {/* Amount Field Card */}
              <View style={styles.formCard}>
                <Text style={styles.cardHeaderLabel}>
                  Expense Amount <Text style={{ color: Colors.error }}>*</Text>
                </Text>
                <View style={styles.amountInputRow}>
                  <View style={[styles.currencyPrefixBadge, { backgroundColor: '#fee2e2' }]}>
                    <Text style={[styles.currencyPrefixText, { color: '#dc2626' }]}>PKR</Text>
                  </View>
                  <TextInput
                    style={styles.amountInput}
                    value={expenseForm.amount}
                    onChangeText={(v) => setExpenseForm((f) => ({ ...f, amount: v }))}
                    keyboardType="numeric"
                    placeholder="0.00"
                    placeholderTextColor="#94a3b8"
                  />
                </View>
              </View>

              {/* Category & Description Card */}
              <View style={styles.formCard}>
                <Text style={styles.cardHeaderLabel}>
                  Expense Details <Text style={{ color: Colors.error }}>*</Text>
                </Text>

                <View style={styles.inputGroup}>
                  <Text style={styles.inputGroupLabel}>Category <Text style={{ color: Colors.error }}>*</Text></Text>
                  <View style={styles.modernPickerWrap}>
                    <Picker
                      selectedValue={expenseForm.category}
                      onValueChange={(itemValue) => setExpenseForm((f) => ({ ...f, category: itemValue }))}
                    >
                      {EXPENSE_CATEGORIES.map((c) => <Picker.Item key={c.code} label={c.label} value={c.code} />)}
                    </Picker>
                  </View>
                </View>

                <View style={styles.inputGroup}>
                  <Text style={styles.inputGroupLabel}>Description <Text style={{ color: Colors.error }}>*</Text></Text>
                  <TextInput
                    style={[styles.modernTextInput, { height: 90, textAlignVertical: 'top', paddingTop: 10 }]}
                    value={expenseForm.description}
                    onChangeText={(v) => setExpenseForm((f) => ({ ...f, description: v }))}
                    placeholder="Explain purpose of expenditure (minimum 3 characters)"
                    placeholderTextColor="#94a3b8"
                    multiline
                  />
                </View>

                <View style={styles.inputGroup}>
                  <Text style={styles.inputGroupLabel}>Vendor / Payee</Text>
                  <TextInput
                    style={styles.modernTextInput}
                    value={expenseForm.vendor}
                    onChangeText={(v) => setExpenseForm((f) => ({ ...f, vendor: v }))}
                    placeholder="Supplier or service provider name"
                    placeholderTextColor="#94a3b8"
                  />
                  <Text style={styles.fieldHint}>Optional: Store the merchant or vendor invoice name.</Text>
                </View>
              </View>

              {/* Payment & Incurred Date Card */}
              <View style={styles.formCard}>
                <Text style={styles.cardHeaderLabel}>
                  Payment & Documentation <Text style={{ color: Colors.error }}>*</Text>
                </Text>

                <View style={styles.inputGroup}>
                  <Text style={styles.inputGroupLabel}>Payment Mode <Text style={{ color: Colors.error }}>*</Text></Text>
                  <View style={styles.modernPickerWrap}>
                    <Picker
                      selectedValue={expenseForm.paymentMode}
                      onValueChange={(itemValue) => setExpenseForm((f) => ({ ...f, paymentMode: itemValue }))}
                    >
                      {PAYMENT_MODES.map((t) => <Picker.Item key={t.code} label={t.label} value={t.code} />)}
                    </Picker>
                  </View>
                </View>

                <View style={styles.inputGroup}>
                  <DatePicker
                    label="Incurred Date *"
                    value={expenseForm.incurredAt}
                    onChange={(v) => setExpenseForm((f) => ({ ...f, incurredAt: v }))}
                    placeholder="Select incurred date"
                  />
                </View>

                {/* Evidence Bill / Voucher Attachment */}
                <View style={styles.inputGroup}>
                  <Text style={styles.inputGroupLabel}>Bill or Voucher Receipt (Required for Approval)</Text>
                  <TouchableOpacity style={[styles.modernUploadZone, expEvidence && styles.modernUploadZoneActive]} onPress={pickExpEvidence}>
                    <View style={[styles.uploadIconCircle, expEvidence && { backgroundColor: '#dcfce7' }, { backgroundColor: '#f0fdfa' }]}>
                      <Ionicons
                        name={expEvidence ? 'checkmark-circle' : 'receipt-outline'}
                        size={22}
                        color={expEvidence ? '#15803d' : '#0f766e'}
                      />
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={[styles.uploadZoneTitle, expEvidence && { color: '#15803d' }]}>
                        {expEvidence ? (expEvidence.name || 'Voucher Attached') : 'Attach Bill or Voucher Image'}
                      </Text>
                      <Text style={styles.uploadZoneSub}>
                        {expEvidence ? 'Tap to change attached voucher' : 'Official bill/voucher photo is required'}
                      </Text>
                    </View>
                  </TouchableOpacity>
                </View>
              </View>

              {/* Bottom Actions */}
              <View style={styles.modalBottomActions}>
                <TouchableOpacity style={styles.btnModalCancel} onPress={() => setShowExpense(false)}>
                  <Text style={styles.btnModalCancelText}>Cancel</Text>
                </TouchableOpacity>
                <TouchableOpacity style={[styles.btnModalSubmit, { backgroundColor: '#0f766e' }]} onPress={saveExpense} disabled={saving}>
                  {saving ? (
                    <ActivityIndicator color="#fff" />
                  ) : (
                    <>
                      <Ionicons name="send" size={16} color="#fff" style={{ marginRight: 6 }} />
                      <Text style={styles.btnModalSubmitText}>Submit Expense</Text>
                    </>
                  )}
                </TouchableOpacity>
              </View>
            </ScrollView>
          </KeyboardAvoidingView>
        </SafeAreaView>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: '#f8fafc' },
  header: {
    paddingHorizontal: Spacing.lg,
    paddingTop: Spacing.md,
    paddingBottom: Spacing.md,
    backgroundColor: '#ffffff',
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
  },
  headerTop: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: Spacing.md,
  },
  badgeRow: { flexDirection: 'row', gap: 6, marginBottom: 4, alignItems: 'center' },
  unitLevelBadge: {
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 6,
    backgroundColor: '#f1f5f9',
    borderWidth: 1,
    borderColor: '#cbd5e1',
  },
  unitLevelBadgeText: { fontSize: 10, fontWeight: '700', color: '#475569', textTransform: 'uppercase' },
  streamBadgeJirga: {
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 6,
    backgroundColor: '#f3e8ff',
    borderWidth: 1,
    borderColor: '#d8b4fe',
  },
  streamBadgeTextJirga: { fontSize: 10, fontWeight: '700', color: '#6b21a8' },

  pageTitle: { fontSize: 20, fontWeight: '800', color: '#0f172a', letterSpacing: -0.3 },
  pageSubtitle: { fontSize: FontSize.xs, color: Colors.textMuted, marginTop: 2 },
  
  headerActionsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  btnExport: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 10,
    paddingVertical: 6,
    backgroundColor: '#f8fafc',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#e2e8f0',
  },
  btnExportText: { fontSize: FontSize.xs, fontWeight: '700', color: '#334155' },
  
  tierPillsWrapper: {
    paddingHorizontal: 16,
    paddingVertical: 10,
    backgroundColor: '#ffffff',
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
  },
  tierPillsScroll: { flexDirection: 'row', gap: 8 },
  tierPill: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 20,
    backgroundColor: '#f8fafc',
    borderWidth: 1,
    borderColor: '#e2e8f0',
  },
  tierPillActive: { backgroundColor: Colors.primary, borderColor: Colors.primary },
  tierPillText: { fontSize: 11, fontWeight: '600', color: '#475569' },
  tierPillTextActive: { color: '#ffffff', fontWeight: '700' },

  kpiScroll: { flexGrow: 0, backgroundColor: '#f1f5f9', borderBottomWidth: 1, borderBottomColor: Colors.border },
  kpiContainer: { padding: 12, gap: 10 },
  kpiCard: {
    padding: 14,
    backgroundColor: '#ffffff',
    borderRadius: 12,
    minWidth: 150,
    borderWidth: 1,
    borderColor: '#e2e8f0',
    borderTopWidth: 4,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 2,
    elevation: 1,
  },
  kpiHeaderRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 },
  kpiIconBox: { width: 22, height: 22, borderRadius: 6, justifyContent: 'center', alignItems: 'center' },
  kpiLabel: { fontSize: 11, color: '#64748b', fontWeight: '700', textTransform: 'uppercase' },
  kpiValue: { fontSize: 18, fontWeight: '800', letterSpacing: -0.3 },
  kpiHint: { fontSize: 11, color: '#94a3b8', marginTop: 4 },

  toolbarSection: {
    paddingHorizontal: 16,
    paddingVertical: 12,
    backgroundColor: '#ffffff',
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
  },
  segmentedControl: {
    flexDirection: 'row',
    backgroundColor: '#f1f5f9',
    padding: 3,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#e2e8f0',
  },
  segmentBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 7,
    paddingHorizontal: 12,
    borderRadius: 7,
  },
  segmentBtnActive: {
    backgroundColor: '#ffffff',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.08,
    shadowRadius: 2,
    elevation: 1,
  },
  segmentText: { fontSize: 12, fontWeight: '600', color: '#64748b' },
  segmentTextActive: { color: Colors.primary, fontWeight: '700' },

  recordActionBox: {},
  btnRecord: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: Colors.primary,
    paddingHorizontal: 14,
    paddingVertical: 9,
    borderRadius: 8,
    shadowColor: Colors.primary,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.2,
    shadowRadius: 4,
    elevation: 2,
  },
  btnRecordText: { color: '#ffffff', fontSize: 12, fontWeight: '700' },

  rangeCard: {
    margin: 16,
    padding: 14,
    backgroundColor: '#ffffff',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#e2e8f0',
  },
  rangeHeader: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 10 },
  rangeHeaderTitle: { fontSize: 13, fontWeight: '700', color: '#0f172a' },
  rangeInputs: { flexDirection: 'row', gap: 12, marginBottom: 10 },
  rangeInputCol: { flex: 1 },
  rangeLabel: { fontSize: 11, fontWeight: '600', color: '#64748b', marginBottom: 4 },
  rangeInput: {
    borderWidth: 1,
    borderColor: '#cbd5e1',
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 6,
    fontSize: 13,
    backgroundColor: '#f8fafc',
    color: '#0f172a',
  },
  quickRangeScroll: { gap: 6 },
  rangePill: {
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 6,
    backgroundColor: '#f8fafc',
    borderWidth: 1,
    borderColor: '#e2e8f0',
  },
  rangePillText: { fontSize: 11, fontWeight: '600', color: '#334155' },

  tableContainer: {
    margin: 16,
    backgroundColor: '#ffffff',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#e2e8f0',
    overflow: 'hidden',
  },
  thRow: {
    flexDirection: 'row',
    backgroundColor: '#f8fafc',
    borderBottomWidth: 1,
    borderBottomColor: '#e2e8f0',
    paddingVertical: 10,
  },
  th: {
    fontSize: 11,
    fontWeight: '700',
    color: '#64748b',
    paddingHorizontal: 12,
    textTransform: 'uppercase',
  },
  tr: {
    flexDirection: 'row',
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#f1f5f9',
    alignItems: 'center',
  },
  td: {
    fontSize: 12,
    color: '#1e293b',
    paddingHorizontal: 12,
  },
  unitArrangedSubText: {
    fontSize: 10,
    color: '#64748b',
    marginTop: 2,
  },
  emptyWrap: {
    padding: 36,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  emptyText: {
    fontSize: 13,
    color: '#94a3b8',
    textAlign: 'center',
  },

  btnApprove: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    backgroundColor: '#dcfce7',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: '#86efac',
  },
  btnApproveText: { color: '#15803d', fontSize: 11, fontWeight: '700' },
  btnDanger: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    backgroundColor: '#fee2e2',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: '#fca5a5',
  },
  btnDangerText: { color: '#b91c1c', fontSize: 11, fontWeight: '700' },

  // ================= MODERN MODAL STYLES =================
  modalSafe: { flex: 1, backgroundColor: '#f1f5f9' },
  modalHeaderCard: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingVertical: 16,
    backgroundColor: '#ffffff',
    borderBottomWidth: 1,
    borderBottomColor: '#e2e8f0',
  },
  modalHeaderCardTitle: { fontSize: 18, fontWeight: '800', color: '#0f172a', letterSpacing: -0.3 },
  modalHeaderCardSub: { fontSize: 12, color: '#64748b', marginTop: 2 },
  modalCloseCircle: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: '#f1f5f9',
    alignItems: 'center',
    justifyContent: 'center',
  },
  formScrollBody: {
    padding: 16,
    paddingBottom: 40,
    gap: 16,
  },
  formErrorBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: '#fee2e2',
    borderWidth: 1,
    borderColor: '#fca5a5',
    padding: 12,
    borderRadius: 10,
  },
  formErrorText: { fontSize: 13, color: '#b91c1c', fontWeight: '600', flex: 1 },

  formCard: {
    backgroundColor: '#ffffff',
    borderRadius: 14,
    padding: 16,
    borderWidth: 1,
    borderColor: '#e2e8f0',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.04,
    shadowRadius: 3,
    elevation: 1,
  },
  cardHeaderLabel: {
    fontSize: 14,
    fontWeight: '800',
    color: '#0f172a',
    marginBottom: 14,
    letterSpacing: -0.2,
  },

  amountInputRow: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 2,
    borderColor: '#cbd5e1',
    borderRadius: 12,
    backgroundColor: '#f8fafc',
    overflow: 'hidden',
  },
  currencyPrefixBadge: {
    backgroundColor: '#dbeafe',
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderRightWidth: 1,
    borderRightColor: '#cbd5e1',
  },
  currencyPrefixText: { fontSize: 15, fontWeight: '800', color: '#1e40af' },
  amountInput: {
    flex: 1,
    paddingHorizontal: 14,
    paddingVertical: 10,
    fontSize: 20,
    fontWeight: '800',
    color: '#0f172a',
  },
  capNoticeBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: 8,
    backgroundColor: '#fffbeb',
    padding: 8,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: '#fef3c7',
  },
  capNoticeText: { fontSize: 11, color: '#b45309', fontWeight: '500' },

  donorTypePillGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginBottom: 14,
  },
  donorTypeChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 10,
    backgroundColor: '#f8fafc',
    borderWidth: 1.5,
    borderColor: '#e2e8f0',
  },
  donorTypeChipActive: {
    backgroundColor: '#eff6ff',
    borderColor: '#3b82f6',
  },
  donorTypeChipText: { fontSize: 12, fontWeight: '600', color: '#475569' },
  donorTypeChipTextActive: { color: '#1e40af', fontWeight: '700' },

  inputGroup: {
    marginTop: 12,
  },
  inputGroupLabel: {
    fontSize: 12,
    fontWeight: '700',
    color: '#334155',
    marginBottom: 6,
  },
  modernTextInput: {
    borderWidth: 1.5,
    borderColor: '#cbd5e1',
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 14,
    color: '#0f172a',
    backgroundColor: '#ffffff',
  },
  modernPickerWrap: {
    borderWidth: 1.5,
    borderColor: '#cbd5e1',
    borderRadius: 10,
    backgroundColor: '#ffffff',
    overflow: 'hidden',
  },
  fieldHint: {
    fontSize: 11,
    color: '#64748b',
    marginTop: 4,
  },

  modernUploadZone: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    borderWidth: 1.5,
    borderStyle: 'dashed',
    borderColor: '#cbd5e1',
    borderRadius: 12,
    padding: 14,
    backgroundColor: '#f8fafc',
  },
  modernUploadZoneActive: {
    borderColor: '#86efac',
    backgroundColor: '#f0fdf4',
    borderStyle: 'solid',
  },
  uploadIconCircle: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#eff6ff',
    alignItems: 'center',
    justifyContent: 'center',
  },
  uploadZoneTitle: { fontSize: 13, fontWeight: '700', color: '#0f172a' },
  uploadZoneSub: { fontSize: 11, color: '#64748b', marginTop: 2 },

  modalBottomActions: {
    flexDirection: 'row',
    gap: 12,
    marginTop: 8,
    paddingBottom: 24,
  },
  btnModalCancel: {
    flex: 1,
    paddingVertical: 13,
    borderRadius: 10,
    backgroundColor: '#ffffff',
    borderWidth: 1.5,
    borderColor: '#cbd5e1',
    alignItems: 'center',
    justifyContent: 'center',
  },
  btnModalCancelText: { fontSize: 14, fontWeight: '700', color: '#475569' },
  btnModalSubmit: {
    flex: 2,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 13,
    borderRadius: 10,
    backgroundColor: Colors.primary,
    shadowColor: Colors.primary,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 4,
    elevation: 3,
  },
  btnModalSubmitText: { fontSize: 14, fontWeight: '700', color: '#ffffff' },
});
