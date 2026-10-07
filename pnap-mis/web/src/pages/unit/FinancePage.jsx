import { useEffect, useMemo, useRef, useState } from 'react';
import { useLocation, Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useUnit } from '../../context/UnitContext';
import { useAuth } from '../../context/AuthContext';
import { hasPermission } from '../../utils/permissions';
import {
  canManageFinance, canApproveExpense, isCentralAdminOversight, isSuperAdminOversight, isSuperAdmin,
  hasRole, OPERATOR_AUTOPIN_ROLES,
} from '../../utils/permissions';
import { api, errorMessage } from '../../api/client';
import { useToast } from '../../components/Toast';
import { formatCnic, isCompleteCnic } from '../../utils/formatters';

import dialog from '../../components/dialog';
import { XIcon, CongressIcon } from '../../components/icons';
import { formatUnitArrangedBy } from '../../utils/unitFormat';
const PKR = new Intl.NumberFormat('en-PK', { style: 'currency', currency: 'PKR', maximumFractionDigits: 0 });

const EXPENSE_CATEGORIES = ['OFFICE','TRANSPORT','PRINTING','REFRESHMENTS','STAGE_EQUIPMENT','COMMUNICATION','DONATIONS_OUT','SALARIES_STIPENDS','MISC'];
const PAYMENT_MODES = ['CASH','BANK_TRANSFER','MOBILE_WALLET','CHEQUE'];
const DONOR_TYPES = ['MEMBER','NON_MEMBER','CORPORATE','ANONYMOUS'];

// Mirrors financeController's FIN-003 / FIN-004 rules. Kept here so the
// form can state the limits up front instead of letting the officer
// fill everything in and take a 400 on submit.
const ANONYMOUS_CAP = 5000;
const NON_MEMBER_CNIC_THRESHOLD = 50000;

function bodySupported(level) {
  return level === 'BASIC_UNIT' || level === 'AREA' || level === 'DISTRICT'
    || level === 'PROVINCE' || level === 'CENTRAL';
}

function getWhatsAppUrl(phone, message) {
  if (!phone) return '#';
  let clean = String(phone).replace(/[^0-9]/g, '');
  if (clean.startsWith('0')) clean = '92' + clean.slice(1);
  return `https://wa.me/${clean}?text=${encodeURIComponent(message)}`;
}

// Shown next to every field the server actually requires.
const Req = () => <span className="req">*</span>;

export default function FinancePage() {
  const { t } = useTranslation();
  const { ctx, setCtx } = useUnit();
  const { user, setActiveRole, allRoles } = useAuth();
  const location = useLocation();
  const toast = useToast();

  function handleSwitchToCentral() {
    const rolesList = allRoles || user?.allRoles || user?.roles || [];
    const isSuper = rolesList.includes('SUPER_ADMIN') || user?.isBootstrap;
    const isCentral = rolesList.includes('CENTRAL_ADMIN');
    if (isSuper && setActiveRole) {
      setActiveRole('SUPER_ADMIN');
    } else if (isCentral && setActiveRole) {
      setActiveRole('CENTRAL_ADMIN');
    }
    api.get('/org/central')
      .then((r) => setCtx({ unitLevel: 'CENTRAL', unitId: r.data.data._id, unitName: r.data.data.name || 'PKNAP Central' }))
      .catch(() => setCtx({ unitLevel: 'CENTRAL', unitId: 'CENTRAL', unitName: 'PKNAP Central' }));
  }

  const queryBody = new URLSearchParams(location.search).get('body');
  const isCongressView = queryBody === 'CONGRESS';
  const isJirgaView = queryBody === 'JIRGA';
  const isCommitteeView = queryBody === 'COMMITTEE';
  const targetBody = isCongressView ? 'CONGRESS' : (isJirgaView ? 'JIRGA' : (isCommitteeView ? 'COMMITTEE' : 'EXECUTIVE'));

  const canRecord = canManageFinance(user)
    && !isCentralAdminOversight(user)
    && !isSuperAdminOversight(user)
    && !(isSuperAdmin(user) && (ctx?.unitLevel === 'CENTRAL' || isCongressView));
  const canApprove = canApproveExpense(user) && !isCentralAdminOversight(user) && !isSuperAdminOversight(user);
  // The view-only banner only triggers for personas without write
  // powers (e.g. Secretary). Senior Mawin (and equivalents) now share
  // the Finance Secretary's powers per product directive, so they
  // pass canRecord and skip the banner entirely.
  const isViewOnly = !canRecord && hasRole(user, 'SECRETARY');

  // Re-pin ctx to the user's actual role-assignment unit on mount AND
  // whenever the user's effective role list changes (e.g. they used
  // the "View As Role" picker). Without re-running on roles-change,
  // switching personas would leave the page reading from the previous
  // persona's unit until a hard refresh.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (!user?.memberId) return;
    const operatorRoles = OPERATOR_AUTOPIN_ROLES;
    const myOperator = operatorRoles.find((r) => user.roles?.includes(r));
    // Auto-pin also fires for users who hold a custom catalogue role
    // (e.g. CUSTOM_KAKAKHAN). Plain MEMBER + admins are skipped.
    const hasCustomRole = (user.roles || []).some((r) =>
      r && r !== 'MEMBER' && r !== 'OTHER' && !operatorRoles.includes(r) && !['SUPER_ADMIN', 'PROVINCE_ADMIN', 'DISTRICT_ADMIN', 'AREA_ADMIN'].includes(r)
    );
    if (!myOperator && !hasCustomRole) return;
    api.get('/roles', { params: { memberId: user.memberId, state: 'APPROVED' } })
      .then(async (r) => {
        const ras = r.data.data || [];
        // Pin priority: matching operator role first, any built-in
        // operator next, then any active non-OTHER assignment (covers
        // custom catalogue roles).
        const ra = ras.find((a) => a.roleCode === myOperator && !a.endedAt)
                 || ras.find((a) => operatorRoles.includes(a.roleCode) && !a.endedAt)
                 || ras.find((a) => !a.endedAt && a.roleCode !== 'OTHER');
        if (!ra) return;
        // Friendly unit name lookup — matches UnitContext's logic.
        let unitName = '';
        try {
          if (ra.unitLevel === 'BASIC_UNIT' && user.scope?.areaId) {
            const lst = await api.get('/org/basic-units', { params: { areaId: user.scope.areaId } });
            unitName = lst.data.data.find((b) => String(b._id) === String(ra.unitId))?.name || '';
          } else if (ra.unitLevel === 'AREA' && user.scope?.districtId) {
            const lst = await api.get('/org/areas', { params: { districtId: user.scope.districtId } });
            unitName = lst.data.data.find((a) => String(a._id) === String(ra.unitId))?.name || '';
          } else if (ra.unitLevel === 'DISTRICT' && user.scope?.provinceId) {
            const lst = await api.get('/org/districts', { params: { provinceId: user.scope.provinceId } });
            unitName = lst.data.data.find((d) => String(d._id) === String(ra.unitId))?.name || '';
          } else if (ra.unitLevel === 'PROVINCE') {
            const lst = await api.get('/org/provinces');
            unitName = lst.data.data.find((p) => String(p._id) === String(ra.unitId))?.name || '';
          } else if (ra.unitLevel === 'CENTRAL') {
            try {
              const c = await api.get('/org/central');
              unitName = c.data.data?.name || 'PKNAP Central';
            } catch { unitName = 'PKNAP Central'; }
          }
        } catch { /* fall back to generic label */ }
        setCtx({ unitLevel: ra.unitLevel, unitId: ra.unitId, unitName: unitName || 'My Unit' });
      })
      .catch(() => {});
  }, [user?.memberId, user?.roles?.join(',')]);

  const [summary, setSummary] = useState(null);
  const [donations, setDonations] = useState([]);
  const [expenses, setExpenses] = useState([]);
  const [tab, setTab] = useState('donations');

  const [donForm, setDonForm] = useState({ amount: '', donorType: 'MEMBER', donorMemberId: '', donorName: '', donorCnic: '', paymentMode: 'CASH', receivedAt: '' });
  const [donReceipt, setDonReceipt] = useState(null);
  const [donModalOpen, setDonModalOpen] = useState(false);

  const [expForm, setExpForm] = useState({ amount: '', category: 'OFFICE', description: '', vendor: '', paymentMode: 'CASH', incurredAt: '' });
  const [expEvidence, setExpEvidence] = useState(null);
  const [expModalOpen, setExpModalOpen] = useState(false);

  const [members, setMembers] = useState([]);
  const [monthly, setMonthly] = useState([]);
  const [monthFrom, setMonthFrom] = useState('');
  const [monthTo, setMonthTo] = useState('');

  const [duesMonth, setDuesMonth] = useState(() => new Date().getMonth() + 1);
  const [duesYear, setDuesYear] = useState(() => new Date().getFullYear());
  const [duesData, setDuesData] = useState(null);
  const [duesLoading, setDuesLoading] = useState(false);
  const [reminding, setReminding] = useState(false);

  const [err, setErr] = useState('');

  const [lastRefreshed, setLastRefreshed] = useState(null);
  const [autoRefresh, setAutoRefresh] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [pulseKey, setPulseKey] = useState(0);
  const lastSummaryRef = useRef(null);
  const fetchIdRef = useRef(0);

  async function reload() {
    if (!ctx) return;
    const myId = ++fetchIdRef.current;
    setRefreshing(true);
    try {
      const params = {
        unitLevel: ctx.unitLevel,
        unitId: ctx.unitId,
        body: targetBody,
      };
      const [s, d, e] = await Promise.all([
        api.get('/finance/summary', { params }),
        api.get('/finance/donations', { params }),
        api.get('/finance/expenses', { params }),
      ]);
      if (myId !== fetchIdRef.current) return;
      const next = s.data.data;
      const prev = lastSummaryRef.current;
      const changed = !prev
        || prev.donations?.total !== next.donations?.total
        || prev.expenses?.total !== next.expenses?.total
        || prev.balance !== next.balance
        || prev.transfersIn?.total !== next.transfersIn?.total
        || prev.transfersOut?.total !== next.transfersOut?.total;
      if (changed) setPulseKey((k) => k + 1);
      lastSummaryRef.current = next;
      setSummary(next);
      setDonations(d.data.data || []);
      setExpenses(e.data.data || []);
      setLastRefreshed(new Date());
    } catch { /* swallow — keep showing stale figures rather than blanking */ }
    finally {
      if (myId === fetchIdRef.current) setRefreshing(false);
    }
  }
  useEffect(() => { reload(); }, [ctx, targetBody]);

  const displayedDonations = useMemo(() => {
    return (donations || []).filter((d) => {
      if (isCongressView) return d.body === 'CONGRESS';
      if (isJirgaView) return d.body === 'JIRGA';
      if (isCommitteeView) return d.body === 'COMMITTEE';
      return d.body === 'EXECUTIVE' || !d.body || (d.body !== 'COMMITTEE' && d.body !== 'JIRGA' && d.body !== 'CONGRESS');
    });
  }, [donations, isCommitteeView, isJirgaView, isCongressView]);

  const displayedExpenses = useMemo(() => {
    return (expenses || []).filter((e) => {
      if (isCongressView) return e.body === 'CONGRESS';
      if (isJirgaView) return e.body === 'JIRGA';
      if (isCommitteeView) return e.body === 'COMMITTEE';
      return e.body === 'EXECUTIVE' || !e.body || (e.body !== 'COMMITTEE' && e.body !== 'JIRGA' && e.body !== 'CONGRESS');
    });
  }, [expenses, isCommitteeView, isJirgaView, isCongressView]);

  useEffect(() => {
    if (!autoRefresh || !ctx) return;
    let timer = null;
    function tick() {
      if (document.visibilityState === 'visible') reload();
    }
    timer = setInterval(tick, 15000);
    function onVis() { if (document.visibilityState === 'visible') reload(); }
    document.addEventListener('visibilitychange', onVis);
    return () => {
      if (timer) clearInterval(timer);
      document.removeEventListener('visibilitychange', onVis);
    };
  }, [autoRefresh, ctx, targetBody]);

  useEffect(() => {
    if (!ctx) return;
    const params = { limit: 500 };
    if (ctx.unitLevel === 'BASIC_UNIT') params.basicUnitId = ctx.unitId;
    else if (ctx.unitLevel === 'AREA') params.areaId = ctx.unitId;
    else if (ctx.unitLevel === 'DISTRICT') params.districtId = ctx.unitId;
    else if (ctx.unitLevel === 'PROVINCE') params.provinceId = ctx.unitId;
    api.get('/members', { params }).then((r) => setMembers(r.data.data)).catch(() => {});
  }, [ctx]);

  async function reloadMonthly() {
    if (!ctx) return;
    try {
      const params = {
        unitLevel: ctx.unitLevel,
        unitId: ctx.unitId,
        body: targetBody,
        from: monthFrom || undefined,
        to: monthTo || undefined,
      };
      const r = await api.get('/finance/monthly', { params });
      setMonthly(r.data.data || []);
    } catch { /* swallow */ }
  }
  useEffect(() => {
    if (tab === 'monthly') reloadMonthly();
  }, [ctx, tab, targetBody, monthFrom, monthTo]);

  async function loadDues() {
    if (!ctx) return;
    setDuesLoading(true);
    try {
      const res = await api.get('/finance/reminders/monthly-status', {
        params: {
          unitLevel: ctx.unitLevel,
          unitId: ctx.unitId,
          month: duesMonth,
          year: duesYear,
        },
      });
      setDuesData(res.data.data);
    } catch (e) {
      toast.error(errorMessage(e), { title: 'Could not load dues status' });
    } finally {
      setDuesLoading(false);
    }
  }

  useEffect(() => {
    if (tab === 'dues') loadDues();
  }, [ctx, tab, duesMonth, duesYear]);

  async function handleSendReminders(memberIds = null) {
    if (!ctx) return;
    setReminding(true);
    try {
      const res = await api.post('/finance/reminders/send-monthly', {
        unitLevel: ctx.unitLevel,
        unitId: ctx.unitId,
        month: duesMonth,
        year: duesYear,
        memberIds,
      });
      toast.success(
        t('finance.remindersSentSuccess', `Sent ${res.data.data.notifiedCount} in-app reminder(s).`),
        { title: t('finance.remindersSent', 'Reminders Sent') }
      );
      loadDues();
    } catch (e) {
      toast.error(errorMessage(e), { title: 'Could not send reminders' });
    } finally {
      setReminding(false);
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

  const donAmount = parseFloat(donForm.amount) || 0;
  const donCnicRequired = donForm.donorType === 'NON_MEMBER' && donAmount > NON_MEMBER_CNIC_THRESHOLD;
  const donErrors = useMemo(() => {
    const errs = {};
    if (donForm.amount !== '' && !(donAmount > 0)) {
      errs.amount = 'Amount must be greater than zero';
    }
    if (donForm.donorType === 'ANONYMOUS' && donAmount > ANONYMOUS_CAP) {
      errs.amount = `Anonymous donations capped at PKR ${ANONYMOUS_CAP.toLocaleString()}`;
    }
    if (donCnicRequired && !donForm.donorCnic) {
      errs.donorCnic = `CNIC is required for non-member donations above PKR ${NON_MEMBER_CNIC_THRESHOLD.toLocaleString()}`;
    } else if (donForm.donorCnic && !isCompleteCnic(donForm.donorCnic)) {
      errs.donorCnic = 'CNIC must be 13 digits (42101-1234567-1)';
    }
    if (!donForm.receivedAt) {
      errs.receivedAt = 'Received date is required';
    }
    return errs;
  }, [donForm.amount, donForm.donorType, donForm.donorCnic, donForm.receivedAt, donAmount, donCnicRequired]);

  const expAmount = parseFloat(expForm.amount) || 0;
  const expErrors = useMemo(() => {
    const errs = {};
    if (expForm.amount !== '' && !(expAmount > 0)) {
      errs.amount = 'Amount must be greater than zero';
    }
    if (expForm.description && expForm.description.trim().length < 3) {
      errs.description = 'Description must be at least 3 characters';
    }
    return errs;
  }, [expForm.amount, expForm.description, expAmount]);

  async function recordDonation() {
    setErr('');
    if (Object.keys(donErrors).length) {
      setErr('Please fix the highlighted fields.');
      return;
    }
    try {
      const fd = new FormData();
      let donorName = donForm.donorName;
      let donorCnic = donForm.donorCnic;
      if (donForm.donorType === 'MEMBER' && donForm.donorMemberId) {
        const found = members.find((m) => String(m._id) === String(donForm.donorMemberId));
        if (found) {
          if (!donorName) donorName = found.fullName;
          if (!donorCnic && found.cnic) donorCnic = found.cnic;
        }
      }
      const payload = {
        ...donForm,
        donorName,
        donorCnic,
        unitLevel: ctx.unitLevel,
        unitId: ctx.unitId,
        body: targetBody,
      };
      Object.entries(payload).forEach(([k, v]) => {
        if (v !== '' && v != null) fd.append(k, v);
      });
      if (donReceipt) {
        fd.append('receipt', donReceipt);
      }
      const amount = parseFloat(donForm.amount);
      await api.post('/finance/donations', fd);
      setDonForm({ amount: '', donorType: 'MEMBER', donorMemberId: '', donorName: '', donorCnic: '', paymentMode: 'CASH', receivedAt: '' });
      setDonReceipt(null);
      setDonModalOpen(false);
      reload();
      toast.success(`Donation of ${PKR.format(amount)} submitted for approval.`, { title: 'Donation recorded' });
    } catch (e) {
      toast.error(errorMessage(e), { title: 'Could not record donation', duration: 7000 });
    }
  }

  async function decideDonation(id, decision) {
    try {
      await api.post(`/finance/donations/${id}/decide`, { decision });
      reload();
      toast.success(`Donation ${decision.toLowerCase()}.`);
    } catch (e) {
      toast.error(errorMessage(e), { title: `Could not ${decision.toLowerCase()} donation`, duration: 7000 });
    }
  }

  async function recordExpense() {
    setErr('');
    if (!(expAmount > 0)) { setErr('Enter an expense amount greater than 0.'); return; }
    if (!expForm.description || expForm.description.trim().length < 3) {
      setErr('Enter a description of at least 3 characters.'); return;
    }
    if (!expForm.incurredAt) { setErr('Pick the date the expense was incurred.'); return; }
    if (!expEvidence) { setErr('Please attach a bill / voucher.'); return; }
    if (Object.keys(expErrors).length) { setErr('Please fix the highlighted fields.'); return; }
    try {
      const fd = new FormData();
      const payload = { ...expForm, unitLevel: ctx.unitLevel, unitId: ctx.unitId, body: targetBody };
      Object.entries(payload).forEach(([k, v]) => {
        if (v !== '' && v != null) fd.append(k, v);
      });
      fd.append('evidence', expEvidence);
      const amount = parseFloat(expForm.amount);
      await api.post('/finance/expenses', fd);
      setExpForm({ amount: '', category: 'OFFICE', description: '', vendor: '', paymentMode: 'CASH', incurredAt: '' });
      setExpEvidence(null);
      setExpModalOpen(false);
      reload();
      toast.success(`Expense of ${PKR.format(amount)} submitted for approval.`, { title: 'Expense recorded' });
    } catch (e) {
      toast.error(errorMessage(e), { title: 'Could not record expense', duration: 7000 });
    }
  }

  async function decideExpense(id, decision) {
    try {
      await api.post(`/finance/expenses/${id}/decide`, { decision });
      reload();
      toast.success(`Expense ${decision.toLowerCase()}.`);
    } catch (e) {
      toast.error(errorMessage(e), { title: `Could not ${decision.toLowerCase()} expense`, duration: 7000 });
    }
  }

  function downloadReport(format) {
    if (!ctx) return;
    const params = new URLSearchParams({
      unitLevel: ctx.unitLevel,
      unitId: ctx.unitId,
      body: targetBody,
      scope: 'own',
    });
    const ext = format === 'pdf' ? 'pdf' : 'xlsx';
    const filename = `${ctx.unitName || 'unit'}-${targetBody.toLowerCase()}-finance.${ext}`;
    const token = localStorage.getItem('pnap_token');
    fetch(`/api/exports/unit/finance/${format}?${params.toString()}`, {
      headers: token ? { Authorization: `Bearer ${token}` } : {},
    }).then(async (res) => {
      if (!res.ok) throw new Error('Export failed');
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url; a.download = filename;
      document.body.appendChild(a); a.click(); a.remove();
      URL.revokeObjectURL(url);
    }).catch(() => toast.error('Download failed.', { title: 'Export failed' }));
  }

  if (!ctx) return <p>Select a unit context first.</p>;
  if (!hasPermission(user, 'MANAGE_FINANCE') && !hasPermission(user, 'APPROVE_EXPENSE') && !canApproveExpense(user)) {
    return (
      <div className="card" style={{ maxWidth: 620, margin: '40px auto', textAlign: 'center', padding: '36px 24px' }}>
        <div style={{ fontSize: 44, marginBottom: 12 }}>🔒</div>
        <h3 style={{ margin: '0 0 10px 0' }}>{t('finance.restrictedLedger', 'Financial Ledger is Restricted')}</h3>
        <p className="muted" style={{ margin: '0 auto 20px auto', maxWidth: 480, fontSize: 14, lineHeight: 1.6 }}>
          {t('finance.memberPortalHint', 'Unit financial management is restricted to leadership and Finance Secretaries. You can review your personal contributions, donation receipts, and membership status on your profile.')}
        </p>
        {user?.memberId ? (
          <Link to={`/members/${user.memberId}`} className="btn">
            {t('finance.viewMyDonations', 'View My Contributions & Receipts')}
          </Link>
        ) : (
          <Link to="/" className="btn secondary">
            {t('common.goToDashboard', 'Go to Dashboard')}
          </Link>
        )}
      </div>
    );
  }

  // If user opened Congress stream but is below Central tier, show guidance card
  if (isCongressView && ctx?.unitLevel !== 'CENTRAL') {
    return (
      <div>
        <div className="page-header">
          <h2>{t('finance.nationalCongress', 'National Congress Finance')} · قومي کانګرس</h2>
        </div>
        <div className="card" style={{ maxWidth: 680, margin: '20px auto', textAlign: 'center', padding: '32px 24px' }}>
          <div style={{ display: 'inline-flex', padding: 14, borderRadius: '50%', background: 'var(--surface-alt)', marginBottom: 16 }}>
            <CongressIcon size={36} />
          </div>
          <h3 style={{ marginTop: 0 }}>{t('activities.congressCentralOnlyTitle', 'National Congress operates exclusively at the Central Level')}</h3>
          <p className="muted" style={{ lineHeight: 1.6 }}>
            {t('activities.congressCentralOnlyText', 'Under the PKNAP constitution, the National Congress is the supreme representative assembly operating at the Central tier. Lower tiers operate via Sobayi Jirga and Zilla & Elaqayi Committees.')}
          </p>
          <div style={{ display: 'flex', gap: 12, justifyContent: 'center', marginTop: 24, flexWrap: 'wrap' }}>
            <button
              type="button"
              className="btn"
              onClick={handleSwitchToCentral}
            >
              {t('activities.switchToCentral', 'Switch to Central Unit Context →')}
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div>
      <div className="page-header">
        <div>
          <h2>
            {isCongressView
              ? `${t('finance.nationalCongress', 'National Congress Finance')} · PKNAP Central`
              : (isJirgaView
                ? (ctx.unitLevel === 'CENTRAL' ? t('finance.qomiJirga', 'Qomi Jirga Finance') : `${t('finance.sobayiJirga', 'Sobayi Jirga Finance')} · ${ctx.unitName}`)
                : (isCommitteeView ? `${t('finance.committeeFinance', 'Committee Finance')} · ${ctx.unitName}` : `${t('finance.executiveFinance', 'Executive Finance')} · ${ctx.unitName}`))}
          </h2>
          <div className="subtitle">{ctx.unitLevel.replace('_', ' ')}</div>
        </div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <button className="btn secondary" onClick={() => downloadReport('pdf')}>{t('finance.downloadPdf', 'Download PDF')}</button>
          <button className="btn secondary" onClick={() => downloadReport('xlsx')}>{t('finance.downloadExcel', 'Download Excel')}</button>
        </div>
      </div>

      {err && !donModalOpen && !expModalOpen && <div className="alert error">{err}</div>}

      {summary && (
        <>
          <div className="kpi-grid" key={pulseKey}>
            <div className="kpi kpi-pulse"><div className="label">{t('finance.donations', 'Donations')}</div><div className="value">{PKR.format(summary.donations.total)}</div><div className="hint">{summary.donations.count} {t('finance.entries', 'entries')}</div></div>
            <div className="kpi kpi-pulse"><div className="label">{t('finance.approvedExpenses', 'Approved Expenses')}</div><div className="value">{PKR.format(summary.expenses.total)}</div><div className="hint">{summary.expenses.count} {t('finance.entries', 'entries')}</div></div>
            {summary.transfersIn && (
              <div className="kpi kpi-pulse"><div className="label">{t('finance.transfersIn', 'Transfers In')}</div><div className="value">{PKR.format(summary.transfersIn.total)}</div><div className="hint">{summary.transfersIn.count} {t('finance.acknowledged', 'acknowledged')}</div></div>
            )}
            {summary.transfersOut && (
              <div className="kpi kpi-pulse"><div className="label">{t('finance.transfersOut', 'Transfers Out')}</div><div className="value">{PKR.format(summary.transfersOut.total)}</div><div className="hint">{summary.transfersOut.count} {t('finance.acknowledged', 'acknowledged')}</div></div>
            )}
            <div className={`kpi kpi-pulse ${summary.balance < 0 ? 'kpi-danger' : 'kpi-good'}`}><div className="label">{t('finance.netBalance', 'Net Balance')}</div><div className="value">{PKR.format(summary.balance)}</div></div>
          </div>
        </>
      )}

      <div className="toolbar">
        <button className={`btn ${tab === 'donations' ? '' : 'secondary'}`} onClick={() => setTab('donations')}>{t('finance.donations', 'Donations')}</button>
        <button className={`btn ${tab === 'expenses' ? '' : 'secondary'}`} onClick={() => setTab('expenses')}>{t('finance.expenses', 'Expenses')}</button>
        <button className={`btn ${tab === 'monthly' ? '' : 'secondary'}`} onClick={() => setTab('monthly')}>{t('finance.monthlyStatements', 'Monthly Statements')}</button>
        <button className={`btn ${tab === 'dues' ? '' : 'secondary'}`} onClick={() => setTab('dues')}>{t('finance.monthlyDues', 'Monthly Dues (PKR 100)')}</button>
      </div>

      {tab === 'donations' && (
        <>
          {canRecord && (
            <div style={{ marginBottom: 12, display: 'flex', justifyContent: 'flex-end' }}>
              <button className="btn" onClick={() => { setErr(''); setDonModalOpen(true); }}>
                {isCongressView ? t('finance.recordCongressDonation', '+ Record Congress Donation') : (isJirgaView ? t('finance.recordJirgaDonation', '+ Record Jirga Donation') : (isCommitteeView ? t('finance.recordCommitteeDonation', '+ Record Committee Donation') : t('finance.recordDonation', '+ Record Donation')))}
              </button>
            </div>
          )}
          {canRecord && donModalOpen && (
            <div className="modal-backdrop" onClick={(e) => { if (e.target === e.currentTarget) setDonModalOpen(false); }}>
              <div className="modal" style={{ maxWidth: 720 }} role="dialog" aria-modal="true" aria-label={t('finance.recordDonation', 'Record Donation')}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
                  <h3 style={{ margin: 0 }}>
                    {isCongressView ? t('finance.recordCongressDonation', 'Record Congress Donation') : (isJirgaView ? t('finance.recordJirgaDonation', 'Record Jirga Donation') : (isCommitteeView ? t('finance.recordCommitteeDonation', 'Record Committee Donation') : t('finance.recordDonation', 'Record a Donation')))}
                  </h3>
                  <button type="button" className="btn secondary" onClick={() => setDonModalOpen(false)} aria-label={t('common.close', 'Close')} style={{ padding: '4px 10px', fontSize: 18, lineHeight: 1 }}><XIcon size={16} /></button>
                </div>
                {err && <div className="alert error" style={{ marginBottom: 10 }}>{err}</div>}
                <p className="muted" style={{ marginTop: 0, fontSize: 13 }}>
                  {t('finance.fieldsMarkedRequired', 'Fields marked * are required.')}
                </p>
                <div className="form-grid">
                  <div className="field"><label>{t('finance.amount', 'Amount')} (PKR) <Req /></label>
                    <input type="number" min="1" required value={donForm.amount}
                      aria-invalid={donErrors.amount ? 'true' : undefined}
                      onChange={(e) => setDonForm({ ...donForm, amount: e.target.value })} />
                    {donErrors.amount
                      ? <div className="error">{donErrors.amount}</div>
                      : donForm.donorType === 'ANONYMOUS'
                        ? <div className="hint">{t('finance.anonymousCap', `Anonymous donations are capped at ${PKR.format(ANONYMOUS_CAP)}.`)}</div>
                        : null}
                  </div>
                  <div className="field"><label>{t('finance.donorType', 'Donor Type')} <Req /></label>
                    <select
                      value={donForm.donorType}
                      onChange={(e) => {
                        const nextType = e.target.value;
                        const mem = nextType === 'MEMBER' ? members.find((m) => String(m._id) === String(donForm.donorMemberId)) : null;
                        setDonForm({
                          ...donForm,
                          donorType: nextType,
                          donorMemberId: nextType === 'MEMBER' ? donForm.donorMemberId : '',
                          donorName: nextType === 'MEMBER' ? (mem?.fullName || '') : (nextType === 'ANONYMOUS' ? '' : donForm.donorName),
                          donorCnic: nextType === 'MEMBER' ? (mem?.cnic || '') : (nextType === 'ANONYMOUS' ? '' : donForm.donorCnic),
                        });
                      }}
                    >
                      {DONOR_TYPES.map((dType) => <option key={dType} value={dType}>{t(`finance.${dType.toLowerCase().replace('_', '')}`, dType)}</option>)}
                    </select></div>
                  {donForm.donorType === 'MEMBER' && (
                    <div className="field full">
                      <label>{t('finance.donorMember', 'Donor (member)')}</label>
                      <select
                        value={donForm.donorMemberId}
                        onChange={(e) => {
                          const mId = e.target.value;
                          const selected = members.find((m) => String(m._id) === String(mId));
                          setDonForm({
                            ...donForm,
                            donorMemberId: mId,
                            donorName: selected ? selected.fullName : '',
                            donorCnic: selected?.cnic || '',
                          });
                        }}
                      >
                        <option value="">— {t('finance.pickMember', 'pick a member')} —</option>
                        {members.map((m) => <option key={m._id} value={m._id}>{m.fullName} · {m.memberId || m.cnic}</option>)}
                      </select>
                      <div className="hint">Linking to a member also reflects the donation on their performance report.</div>
                    </div>
                  )}
                  {(donForm.donorType === 'NON_MEMBER' || donForm.donorType === 'CORPORATE') && (
                    <>
                      <div className="field"><label>{t('finance.donorName', 'Donor Name')}</label>
                        <input value={donForm.donorName} onChange={(e) => setDonForm({ ...donForm, donorName: e.target.value })} /></div>
                      <div className="field">
                        <label>{t('finance.donorCnic', 'Donor CNIC')} {donCnicRequired && <Req />}</label>
                        <input
                          value={donForm.donorCnic}
                          placeholder="42101-1234567-1"
                          inputMode="numeric"
                          aria-invalid={donErrors.donorCnic ? 'true' : undefined}
                          onChange={(e) => setDonForm({ ...donForm, donorCnic: formatCnic(e.target.value) })}
                        />
                        {donErrors.donorCnic
                          ? <div className="error">{donErrors.donorCnic}</div>
                          : <div className="hint">
                              {donForm.donorType === 'NON_MEMBER'
                                ? `Required above ${PKR.format(NON_MEMBER_CNIC_THRESHOLD)}; optional below.`
                                : 'Optional.'}
                            </div>}
                      </div>
                    </>
                  )}
                  <div className="field"><label>{t('finance.paymentMode', 'Payment Mode')} <Req /></label>
                    <select value={donForm.paymentMode} onChange={(e) => setDonForm({ ...donForm, paymentMode: e.target.value })}>
                      {PAYMENT_MODES.map((m) => <option key={m} value={m}>{t(`finance.${m.toLowerCase().replace(/_([a-z])/g, (_, l) => l.toUpperCase())}`, m)}</option>)}
                    </select></div>
                  <div className="field"><label>{t('finance.receivedAt', 'Received At')} <Req /></label>
                    <input type="date" required value={donForm.receivedAt}
                      aria-invalid={donErrors.receivedAt ? 'true' : undefined}
                      onChange={(e) => setDonForm({ ...donForm, receivedAt: e.target.value })} />
                    {donErrors.receivedAt && <div className="error">{donErrors.receivedAt}</div>}
                  </div>
                  <div className="field full"><label>{t('finance.receiptImage', 'Receipt Image')}</label>
                    <input type="file" accept="image/*,application/pdf" onChange={(e) => setDonReceipt(e.target.files?.[0] || null)} />
                    <div className="hint">Optional.</div></div>
                </div>
                <div style={{ marginTop: 18, display: 'flex', gap: 10, justifyContent: 'flex-end', flexWrap: 'wrap' }}>
                  <button className="btn secondary" type="button" onClick={() => setDonModalOpen(false)}>{t('common.cancel', 'Cancel')}</button>
                  <button className="btn" onClick={recordDonation}>{t('finance.recordDonation', 'Record Donation')}</button>
                </div>
              </div>
            </div>
          )}

          <div className="table-responsive">
          <table className="list">
            <thead>
              <tr>
                <th>{t('finance.receipt', 'Receipt')}</th>
                <th>{t('common.date', 'Date')}</th>
                <th>{t('finance.donor', 'Donor')}</th>
                <th>{t('finance.collectedBy', 'Collected By')}</th>
                <th>{t('finance.mode', 'Mode')}</th>
                <th style={{ textAlign: 'right' }}>{t('finance.amount', 'Amount')}</th>
                <th>{t('finance.status', 'Status')}</th>
                <th>{t('finance.actions', 'Actions')}</th>
              </tr>
            </thead>
            <tbody>
              {displayedDonations.length === 0 && (
                <tr>
                  <td colSpan="8" style={{ textAlign: 'center', padding: '24px 12px', color: 'var(--text-muted)' }}>
                    {t('finance.noDonationsYet', 'No donations recorded yet.')}
                  </td>
                </tr>
              )}
              {displayedDonations.map((d) => {
                const memberObj = (d.donorMemberId && typeof d.donorMemberId === 'object') ? d.donorMemberId : null;
                const memberFromList = (!memberObj && d.donorMemberId)
                  ? members.find((m) => String(m._id) === String(d.donorMemberId))
                  : null;
                const effectiveDonorName = d.donorType === 'ANONYMOUS'
                  ? t('finance.anonymous', 'Anonymous')
                  : (d.donorName || memberObj?.fullName || memberFromList?.fullName || (d.donorType === 'MEMBER' ? t('finance.member', 'Member') : '—'));

                const isCng = d.body === 'CONGRESS';
                const isJrg = d.body === 'JIRGA';
                const isCm = d.body === 'COMMITTEE';

                return (
                  <tr key={d._id}>
                    <td>
                      <div>
                        <span
                          className="badge"
                          style={{
                            marginRight: 6,
                            background: isCng ? '#e0f2fe' : (isJrg ? '#f3e8ff' : (isCm ? 'var(--primary-subtle, #e0f2fe)' : 'var(--surface-sunken, #f1f5f9)')),
                            color: isCng ? '#0369a1' : (isJrg ? '#6b21a8' : (isCm ? 'var(--primary, #0369a1)' : 'var(--text-muted, #475569)')),
                            border: isCng ? '1px solid #bae6fd' : (isJrg ? '1px solid #d8b4fe' : undefined),
                            fontWeight: 600,
                            fontSize: 11,
                          }}
                        >
                          {isCng ? 'Congress' : (isJrg ? 'Jirga' : (isCm ? 'Committee' : 'Executive'))}
                        </span>
                        {d.receiptNo}
                      </div>
                      {d.unitLevel && (
                        <div className="muted" style={{ fontSize: 11, marginTop: 3 }}>
                          <span className="badge" style={{ fontSize: 10, padding: '1px 5px', background: 'var(--surface-alt)', border: '1px solid var(--border)' }}>
                            {formatUnitArrangedBy(d, { isCommitteeView, isJirgaView, isCongressView })}
                          </span>
                        </div>
                      )}
                    </td>
                    <td>{new Date(d.receivedAt).toLocaleDateString()}</td>
                    <td>{effectiveDonorName}</td>
                    <td>
                      <div style={{ fontWeight: 500 }}>
                        {d.recordedBy?.fullName || d.recordedBy?.username || d.recordedByName || '—'}
                      </div>
                      {d.recordedBy?.roles?.[0] && (
                        <div className="muted" style={{ fontSize: 11 }}>
                          {t(`roles.${d.recordedBy.roles[0].toLowerCase()}`, d.recordedBy.roles[0].replace(/_/g, ' '))}
                        </div>
                      )}
                    </td>
                    <td>{d.paymentMode}</td>
                    <td style={{ textAlign: 'right' }}>
                      <div style={{ fontWeight: 600 }}>{PKR.format(d.amount)}</div>
                      {d.amount >= 5000 && (
                        <div style={{ fontSize: 10, color: 'var(--success, #16a34a)', fontWeight: 700, marginTop: 2 }}>
                          ★ {t('finance.majorContribution', '5,000+ Major')}
                        </div>
                      )}
                    </td>
                    <td><span className={`badge ${d.state || 'APPROVED'}`}>{d.state || 'APPROVED'}</span></td>
                    <td>
                      <div style={{ display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap' }}>
                        {d.state === 'PENDING' && canApprove && (
                          <>
                            <button className="btn" onClick={() => decideDonation(d._id, 'APPROVED')}>{t('finance.approve', 'Approve')}</button>{' '}
                            <button className="btn danger" onClick={() => decideDonation(d._id, 'REJECTED')}>{t('finance.reject', 'Reject')}</button>
                          </>
                        )}
                        {(d.donorMemberId?.phone || d.amount >= 5000) && (
                          <a
                            href={getWhatsAppUrl(
                              d.donorMemberId?.phone,
                              `Assalam-o-Alaikum ${effectiveDonorName}, on behalf of PKNAP, we express our heartfelt gratitude for your generous contribution of PKR ${PKR.format(d.amount)} (Receipt #${d.receiptNo}). Your support strengthens our organizational mission. JazakAllah Khair!`
                            )}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="btn secondary"
                            style={{ padding: '2px 8px', fontSize: 11, textDecoration: 'none', display: 'inline-flex', alignItems: 'center', gap: 4 }}
                            title={t('finance.sendWhatsAppThankYou', 'Send WhatsApp Thank You')}
                          >
                            💬 {t('finance.thankYou', 'Thank You')}
                          </a>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          </div>
        </>
      )}

      {tab === 'expenses' && (
        <>
          {canRecord && (
            <div style={{ marginBottom: 12, display: 'flex', justifyContent: 'flex-end' }}>
              <button className="btn" onClick={() => { setErr(''); setExpModalOpen(true); }}>
                {isCongressView
                  ? t('finance.recordCongressExpense', '+ Record Congress Expense')
                  : (isJirgaView
                    ? t('finance.recordJirgaExpense', '+ Record Jirga Expense')
                    : (isCommitteeView
                      ? t('finance.recordCommitteeExpense', '+ Record Committee Expense')
                      : t('finance.recordExpense', '+ Record Expense')))}
              </button>
            </div>
          )}
          {canRecord && expModalOpen && (
            <div className="modal-backdrop" onClick={(e) => { if (e.target === e.currentTarget) setExpModalOpen(false); }}>
              <div className="modal" style={{ maxWidth: 720 }} role="dialog" aria-modal="true" aria-label={t('finance.recordExpense', 'Record Expense')}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
                  <h3 style={{ margin: 0 }}>
                    {isCongressView
                      ? t('finance.recordCongressExpense', 'Record Congress Expense')
                      : (isJirgaView
                        ? t('finance.recordJirgaExpense', 'Record Jirga Expense')
                        : (isCommitteeView
                          ? t('finance.recordCommitteeExpense', 'Record Committee Expense')
                          : t('finance.recordExpense', 'Record an Expense')))}
                  </h3>
                  <button type="button" className="btn secondary" onClick={() => setExpModalOpen(false)} aria-label={t('common.close', 'Close')} style={{ padding: '4px 10px', fontSize: 18, lineHeight: 1 }}><XIcon size={16} /></button>
                </div>
                {err && <div className="alert error" style={{ marginBottom: 10 }}>{err}</div>}
                <p className="muted" style={{ marginTop: 0, fontSize: 13 }}>
                  {t('finance.fieldsMarkedRequired', 'Fields marked * are required.')}
                </p>
                <div className="form-grid">
                  <div className="field"><label>{t('finance.amount', 'Amount (PKR)')} <Req /></label>
                    <input type="number" min="1" required value={expForm.amount}
                      aria-invalid={expErrors.amount ? 'true' : undefined}
                      onChange={(e) => setExpForm({ ...expForm, amount: e.target.value })} />
                    {expErrors.amount && <div className="error">{expErrors.amount}</div>}
                  </div>
                  <div className="field"><label>{t('finance.category', 'Category')} <Req /></label>
                    <select value={expForm.category} onChange={(e) => setExpForm({ ...expForm, category: e.target.value })}>
                      {EXPENSE_CATEGORIES.map((c) => <option key={c}>{c}</option>)}
                    </select></div>
                  <div className="field full"><label>{t('finance.description', 'Description')} <Req /></label>
                    <input required value={expForm.description}
                      aria-invalid={expErrors.description ? 'true' : undefined}
                      onChange={(e) => setExpForm({ ...expForm, description: e.target.value })} />
                    {expErrors.description && <div className="error">{expErrors.description}</div>}
                  </div>
                  <div className="field"><label>{t('finance.vendorPayee', 'Vendor / Payee')}</label>
                    <input value={expForm.vendor} onChange={(e) => setExpForm({ ...expForm, vendor: e.target.value })} />
                    <div className="hint">{t('common.optional', 'Optional')}</div></div>
                  <div className="field"><label>{t('finance.paymentMode', 'Payment Mode')} <Req /></label>
                    <select value={expForm.paymentMode} onChange={(e) => setExpForm({ ...expForm, paymentMode: e.target.value })}>
                      {PAYMENT_MODES.map((m) => <option key={m}>{m}</option>)}
                    </select></div>
                  <div className="field"><label>{t('finance.incurredAt', 'Incurred At')} <Req /></label>
                    <input type="date" required value={expForm.incurredAt} onChange={(e) => setExpForm({ ...expForm, incurredAt: e.target.value })} /></div>
                  <div className="field full"><label>{t('finance.billVoucher', 'Bill / Voucher')} <Req /></label>
                    <input type="file" accept="image/*,application/pdf" onChange={(e) => setExpEvidence(e.target.files?.[0] || null)} />
                    <div className="hint">{expEvidence ? expEvidence.name : t('finance.billRequiredHint', 'An expense cannot be recorded without a bill or voucher.')}</div></div>
                </div>
                <div style={{ marginTop: 18, display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
                  <button className="btn secondary" type="button" onClick={() => setExpModalOpen(false)}>{t('common.cancel', 'Cancel')}</button>
                  <button className="btn" onClick={recordExpense}>{t('finance.recordExpense', 'Record Expense')}</button>
                </div>
              </div>
            </div>
          )}

          <div className="table-responsive">
          <table className="list">
            <thead>
              <tr>
                <th>{t('common.date', 'Date')}</th>
                <th>{t('finance.category', 'Category')}</th>
                <th>{t('finance.description', 'Description')}</th>
                <th>{t('finance.recordedBy', 'Recorded By')}</th>
                <th>{t('finance.vendorPayee', 'Vendor')}</th>
                <th style={{ textAlign: 'right' }}>{t('finance.amount', 'Amount')}</th>
                <th>{t('finance.status', 'State')}</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {displayedExpenses.length === 0 && (
                <tr>
                  <td colSpan="8" style={{ textAlign: 'center', padding: '24px 12px', color: 'var(--text-muted)' }}>
                    {t('finance.noExpensesYet', 'No expenses recorded yet.')}
                  </td>
                </tr>
              )}
              {displayedExpenses.map((x) => {
                const isCng = x.body === 'CONGRESS';
                const isJrg = x.body === 'JIRGA';
                const isCm = x.body === 'COMMITTEE';
                return (
                <tr key={x._id}>
                  <td>{new Date(x.incurredAt).toLocaleDateString()}</td>
                  <td>
                    <span
                      className="badge"
                      style={{
                        marginRight: 6,
                        background: isCng ? '#e0f2fe' : (isJrg ? '#f3e8ff' : (isCm ? 'var(--primary-subtle, #e0f2fe)' : 'var(--surface-sunken, #f1f5f9)')),
                        color: isCng ? '#0369a1' : (isJrg ? '#6b21a8' : (isCm ? 'var(--primary, #0369a1)' : 'var(--text-muted, #475569)')),
                        border: isCng ? '1px solid #bae6fd' : (isJrg ? '1px solid #d8b4fe' : undefined),
                        fontWeight: 600,
                        fontSize: 11,
                      }}
                    >
                      {isCng ? t('units.nationalCongress', 'Congress') : (isJrg ? t('units.jirga', 'Jirga') : (isCm ? t('units.committee', 'Committee') : t('roles.executive', 'Executive')))}
                    </span>
                    {x.category}
                  </td>
                  <td>
                    <div>{x.description}</div>
                    {x.unitLevel && (
                      <div className="muted" style={{ fontSize: 11, marginTop: 3 }}>
                        <span className="badge" style={{ fontSize: 10, padding: '1px 5px', background: 'var(--surface-alt)', border: '1px solid var(--border)' }}>
                          {formatUnitArrangedBy(x, { isCommitteeView, isJirgaView, isCongressView })}
                        </span>
                      </div>
                    )}
                  </td>
                  <td>
                    <div style={{ fontWeight: 500 }}>
                      {x.recordedBy?.fullName || x.recordedBy?.username || x.recordedByName || '—'}
                    </div>
                    {x.recordedBy?.roles?.[0] && (
                      <div className="muted" style={{ fontSize: 11 }}>
                        {t(`roles.${x.recordedBy.roles[0].toLowerCase()}`, x.recordedBy.roles[0].replace(/_/g, ' '))}
                      </div>
                    )}
                  </td>
                  <td>{x.vendor || '—'}</td>
                  <td style={{ textAlign: 'right' }}>{PKR.format(x.amount)}</td>
                  <td><span className={`badge ${x.state}`}>{x.state}</span></td>
                  <td>{x.state === 'PENDING' && canApprove && (
                    <>
                      <button className="btn" onClick={() => decideExpense(x._id, 'APPROVED')}>{t('finance.approve', 'Approve')}</button>{' '}
                      <button className="btn danger" onClick={() => decideExpense(x._id, 'REJECTED')}>{t('finance.reject', 'Reject')}</button>
                    </>
                  )}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          </div>
        </>
      )}

      {tab === 'monthly' && (
        <>
          <div className="card" style={{ marginBottom: 16 }}>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'flex-end' }}>
              <div className="field" style={{ minWidth: 180 }}>
                <label>{t('finance.from', 'From')}</label>
                <input type="date" value={monthFrom} onChange={(e) => setMonthFrom(e.target.value)} />
              </div>
              <div className="field" style={{ minWidth: 180 }}>
                <label>{t('finance.to', 'To')}</label>
                <input type="date" value={monthTo} onChange={(e) => setMonthTo(e.target.value)} />
              </div>
              <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                <button className="btn secondary" onClick={() => applyQuickRange('this')}>{t('finance.thisMonth', 'This month')}</button>
                <button className="btn secondary" onClick={() => applyQuickRange('last')}>{t('finance.lastMonth', 'Last month')}</button>
                <button className="btn secondary" onClick={() => applyQuickRange('3')}>{t('finance.last3Months', 'Last 3 months')}</button>
                <button className="btn secondary" onClick={() => applyQuickRange('ytd')}>{t('finance.ytd', 'Year-to-date')}</button>
                <button className="btn ghost" onClick={() => applyQuickRange('all')}>{t('finance.allTime', 'All time')}</button>
              </div>
            </div>
          </div>

          <div className="table-responsive">
          <table className="list">
            <thead>
              <tr>
                <th>{t('finance.month', 'Month')}</th>
                <th style={{ textAlign: 'right' }}>{t('finance.donations', 'Donations')}</th>
                <th style={{ textAlign: 'right' }}>{t('finance.transfersIn', 'Transfers In')}</th>
                <th style={{ textAlign: 'right' }}>{t('finance.expenses', 'Expenses')}</th>
                <th style={{ textAlign: 'right' }}>{t('finance.transfersOut', 'Transfers Out')}</th>
                <th style={{ textAlign: 'right' }}>{t('finance.netBalance', 'Net Balance')}</th>
              </tr>
            </thead>
            <tbody>
              {monthly.length === 0 && (
                <tr>
                  <td colSpan="6" style={{ textAlign: 'center', padding: '24px 12px', color: 'var(--text-muted)' }}>
                    {t('finance.noTransactions', 'No financial activity in this period.')}
                  </td>
                </tr>
              )}
              {monthly.map((m) => (
                <tr key={m.month}>
                  <td>{m.month}</td>
                  <td style={{ textAlign: 'right' }}>{PKR.format(m.donations)}</td>
                  <td style={{ textAlign: 'right' }}>{PKR.format(m.transfersIn)}</td>
                  <td style={{ textAlign: 'right' }}>{PKR.format(m.expenses)}</td>
                  <td style={{ textAlign: 'right' }}>{PKR.format(m.transfersOut)}</td>
                  <td style={{ textAlign: 'right', color: m.netBalance < 0 ? 'var(--danger)' : 'var(--success)', fontWeight: 600 }}>
                    {PKR.format(m.netBalance)}
                  </td>
                </tr>
              ))}
              {monthly.length > 0 && (
                <tr style={{ fontWeight: 600, background: 'var(--surface-alt)' }}>
                  <td>{t('finance.totals', 'Totals')}</td>
                  <td style={{ textAlign: 'right' }}>{PKR.format(monthly.reduce((a, m) => a + m.donations, 0))}</td>
                  <td style={{ textAlign: 'right' }}>{PKR.format(monthly.reduce((a, m) => a + m.transfersIn, 0))}</td>
                  <td style={{ textAlign: 'right' }}>{PKR.format(monthly.reduce((a, m) => a + m.expenses, 0))}</td>
                  <td style={{ textAlign: 'right' }}>{PKR.format(monthly.reduce((a, m) => a + m.transfersOut, 0))}</td>
                  <td style={{ textAlign: 'right' }}>{PKR.format(monthly.reduce((a, m) => a + m.netBalance, 0))}</td>
                </tr>
              )}
            </tbody>
          </table>
          </div>
        </>
      )}

      {tab === 'dues' && (
        <div style={{ marginTop: 16 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 12, marginBottom: 16 }}>
            <div>
              <h3 style={{ margin: 0 }}>
                {t('finance.monthlyDuesTitle', 'Monthly Membership Contributions (PKR 100)')}
              </h3>
              <p className="muted" style={{ margin: '4px 0 0 0', fontSize: 13 }}>
                {t('finance.monthlyDuesDesc', 'Track active members who have contributed the monthly PKR 100 donation and send reminders.')}
              </p>
            </div>
            <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
              <select value={duesMonth} onChange={(e) => setDuesMonth(Number(e.target.value))} style={{ padding: '6px 10px', borderRadius: 6 }}>
                {[1,2,3,4,5,6,7,8,9,10,11,12].map((m) => (
                  <option key={m} value={m}>{new Date(2000, m - 1).toLocaleString('default', { month: 'long' })}</option>
                ))}
              </select>
              <input
                type="number"
                value={duesYear}
                onChange={(e) => setDuesYear(Number(e.target.value))}
                style={{ width: 80, padding: '6px 10px', borderRadius: 6 }}
              />
              <button className="btn secondary" onClick={loadDues} disabled={duesLoading}>
                {t('common.refresh', 'Refresh')}
              </button>
            </div>
          </div>

          {duesData && (
            <>
              <div className="kpis" style={{ marginBottom: 20 }}>
                <div className="kpi">
                  <div className="label">{t('finance.activeMembers', 'Active Members')}</div>
                  <div className="value">{duesData.totalMembers}</div>
                  <div className="hint">{t('finance.expectedDues', `Expected: ${PKR.format(duesData.totalMembers * 100)}`)}</div>
                </div>
                <div className="kpi kpi-good">
                  <div className="label">{t('finance.paidMembers', 'Paid (≥ PKR 100)')}</div>
                  <div className="value">{duesData.paidCount}</div>
                  <div className="hint">{duesData.totalMembers ? `${Math.round((duesData.paidCount / duesData.totalMembers) * 100)}% compliance` : '—'}</div>
                </div>
                <div className={`kpi ${duesData.unpaidCount > 0 ? 'kpi-danger' : 'kpi-good'}`}>
                  <div className="label">{t('finance.unpaidMembers', 'Pending / Unpaid')}</div>
                  <div className="value">{duesData.unpaidCount}</div>
                  <div className="hint">{t('finance.dueRemaining', `Due: ${PKR.format(duesData.unpaidCount * 100)}`)}</div>
                </div>
                <div className="kpi">
                  <div className="label">{t('finance.totalCollected', 'Total Collected')}</div>
                  <div className="value">{PKR.format(duesData.totalCollected)}</div>
                  <div className="hint">{duesData.monthName} {duesData.year}</div>
                </div>
              </div>

              {canRecord && duesData.unpaidCount > 0 && (
                <div style={{ marginBottom: 16, display: 'flex', justifyContent: 'flex-end', gap: 10, flexWrap: 'wrap' }}>
                  <button
                    className="btn"
                    onClick={() => handleSendReminders()}
                    disabled={reminding}
                  >
                    {reminding ? t('common.sending', 'Sending...') : t('finance.sendAllReminders', `🔔 Send In-App Reminders to All ${duesData.unpaidCount} Unpaid Members`)}
                  </button>
                </div>
              )}

              {duesData.unpaidCount === 0 ? (
                <div className="alert success" style={{ padding: '24px 16px', textAlign: 'center' }}>
                  🎉 {t('finance.allPaidNotice', `All active members have contributed their monthly PKR 100 donation for ${duesData.monthName} ${duesData.year}!`)}
                </div>
              ) : (
                <div className="table-responsive">
                  <table className="list">
                    <thead>
                      <tr>
                        <th>{t('finance.member', 'Member')}</th>
                        <th>{t('finance.contact', 'Contact')}</th>
                        <th>{t('finance.cnic', 'CNIC')}</th>
                        <th style={{ textAlign: 'right' }}>{t('finance.contributed', 'Contributed')}</th>
                        <th style={{ textAlign: 'right' }}>{t('finance.remaining', 'Remaining')}</th>
                        <th>{t('finance.lastReminder', 'Last In-App Reminder')}</th>
                        <th>{t('finance.actions', 'Actions')}</th>
                      </tr>
                    </thead>
                    <tbody>
                      {duesData.unpaidMembers.map((m) => {
                        const waUrl = getWhatsAppUrl(
                          m.phone,
                          `Assalam-o-Alaikum ${m.fullName}, this is a gentle reminder regarding your monthly membership contribution of PKR 100 for ${duesData.monthName} ${duesData.year} to PKNAP. Please submit your contribution at your earliest convenience. JazakAllah Khair!`
                        );
                        return (
                          <tr key={m._id}>
                            <td>
                              <div style={{ fontWeight: 600 }}>{m.fullName}</div>
                              <div className="muted" style={{ fontSize: 11 }}>{m.memberId || '—'}</div>
                            </td>
                            <td>{m.phone || '—'}</td>
                            <td>{m.cnic || '—'}</td>
                            <td style={{ textAlign: 'right', fontWeight: 500 }}>{PKR.format(m.totalDonated)}</td>
                            <td style={{ textAlign: 'right', fontWeight: 700, color: 'var(--danger, #dc2626)' }}>{PKR.format(m.dueRemaining)}</td>
                            <td>
                              {m.lastNotifiedAt ? (
                                <span className="muted" style={{ fontSize: 12 }}>
                                  {new Date(m.lastNotifiedAt).toLocaleDateString()}
                                </span>
                              ) : (
                                <span className="muted" style={{ fontSize: 12 }}>{t('common.never', 'Never')}</span>
                              )}
                            </td>
                            <td>
                              <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                                {canRecord && (
                                  <button
                                    className="btn btn-sm secondary"
                                    onClick={() => handleSendReminders([m._id])}
                                    disabled={reminding}
                                    title={t('finance.sendInAppReminder', 'Send In-App Reminder')}
                                  >
                                    🔔 {t('finance.remind', 'Remind')}
                                  </button>
                                )}
                                {m.phone && (
                                  <a
                                    href={waUrl}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="btn btn-sm secondary"
                                    style={{ textDecoration: 'none', display: 'inline-flex', alignItems: 'center', gap: 4 }}
                                    title={t('finance.sendWhatsAppReminder', 'Send WhatsApp Reminder')}
                                  >
                                    💬 WhatsApp
                                  </a>
                                )}
                              </div>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </>
          )}
        </div>
      )}
    </div>
  );
}
