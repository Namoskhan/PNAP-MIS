import { useEffect, useRef, useState } from 'react';
import { useUnit } from '../../context/UnitContext';
import { useAuth } from '../../context/AuthContext';
import { hasPermission } from '../../utils/permissions';
import {
  canManageFinance, canApproveExpense, isCentralAdminOversight, isSuperAdminOversight,
  hasRole, OPERATOR_AUTOPIN_ROLES,
} from '../../utils/permissions';
import { api, errorMessage } from '../../api/client';

const PKR = new Intl.NumberFormat('en-PK', { style: 'currency', currency: 'PKR', maximumFractionDigits: 0 });

const EXPENSE_CATEGORIES = ['OFFICE','TRANSPORT','PRINTING','REFRESHMENTS','STAGE_EQUIPMENT','COMMUNICATION','DONATIONS_OUT','SALARIES_STIPENDS','MISC'];
const PAYMENT_MODES = ['CASH','BANK_TRANSFER','MOBILE_WALLET','CHEQUE'];
const DONOR_TYPES = ['MEMBER','NON_MEMBER','CORPORATE','ANONYMOUS'];

export default function FinancePage() {
  const { ctx, setCtx } = useUnit();
  const { user } = useAuth();
  const canRecord = canManageFinance(user) && !isCentralAdminOversight(user) && !isSuperAdminOversight(user);
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
  const [scope, setScope] = useState('own');
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

  const [err, setErr] = useState('');
  const [msg, setMsg] = useState('');

  // Real-time KPI refresh — keeps the summary cards in sync with new
  // donations / expenses / transfers logged by other officers without
  // a manual reload. Tracks last-fetched time + a "live" indicator.
  const [lastRefreshed, setLastRefreshed] = useState(null);
  const [autoRefresh, setAutoRefresh] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  // Skeleton flash on the KPI tiles when a value changes between polls.
  const [pulseKey, setPulseKey] = useState(0);
  const lastSummaryRef = useRef(null);
  // Latest-fetch guard — when ctx changes mid-flight we may have an
  // in-flight reload from the previous ctx that resolves AFTER the
  // new one. Tag each reload with a monotonic id and only commit if
  // ours is still the latest.
  const fetchIdRef = useRef(0);

  async function reload() {
    if (!ctx) return;
    const myId = ++fetchIdRef.current;
    setRefreshing(true);
    try {
      const params = { unitLevel: ctx.unitLevel, unitId: ctx.unitId, scope: scope === 'tree' ? 'subtree' : undefined };
      const [s, d, e] = await Promise.all([
        api.get('/finance/summary', { params }),
        api.get('/finance/donations', { params }),
        api.get('/finance/expenses', { params }),
      ]);
      if (myId !== fetchIdRef.current) return;
      const next = s.data.data;
      // Pulse the KPI tiles when any headline figure changes between polls.
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
      setDonations(d.data.data);
      setExpenses(e.data.data);
      setLastRefreshed(new Date());
    } catch { /* swallow — keep showing stale figures rather than blanking */ }
    finally {
      if (myId === fetchIdRef.current) setRefreshing(false);
    }
  }
  useEffect(() => { reload(); }, [ctx, scope]);

  // Auto-refresh everything (KPI cards + donations + expenses tables)
  // every 15s. Skips when the tab is hidden so we're not burning the
  // API for a backgrounded window. Re-fires immediately on tab focus.
  useEffect(() => {
    if (!autoRefresh || !ctx) return;
    let timer = null;
    function tick() {
      if (document.visibilityState === 'visible') reload();
    }
    timer = setInterval(tick, 15000);
    function onVisible() { if (document.visibilityState === 'visible') reload(); }
    document.addEventListener('visibilitychange', onVisible);
    window.addEventListener('focus', onVisible);
    return () => {
      if (timer) clearInterval(timer);
      document.removeEventListener('visibilitychange', onVisible);
      window.removeEventListener('focus', onVisible);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoRefresh, ctx, scope]);

  // Members for the donor picker (donor-type=MEMBER) — scoped to the
  // selected unit so a Finance Secretary picks from their own roster.
  // Skip the fetch entirely for view-only personas; they have no
  // donation form to fill in.
  useEffect(() => {
    if (!ctx || !canRecord) return;
    const params = { status: 'ACTIVE', limit: 500 };
    if (ctx.unitLevel === 'BASIC_UNIT') params.basicUnitId = ctx.unitId;
    else if (ctx.unitLevel === 'AREA') params.areaId = ctx.unitId;
    else if (ctx.unitLevel === 'DISTRICT') params.districtId = ctx.unitId;
    else if (ctx.unitLevel === 'PROVINCE') params.provinceId = ctx.unitId;
    api.get('/members', { params }).then((r) => setMembers(r.data.data)).catch(() => {});
  }, [ctx, canRecord]);

  async function loadMonthly() {
    if (!ctx) return;
    const params = { unitLevel: ctx.unitLevel, unitId: ctx.unitId, scope: scope === 'tree' ? 'subtree' : undefined };
    if (monthFrom) params.from = monthFrom;
    if (monthTo) params.to = monthTo;
    const r = await api.get('/finance/monthly', { params });
    setMonthly(r.data.data);
  }
  useEffect(() => { if (tab === 'monthly') loadMonthly(); }, [tab, ctx, scope, monthFrom, monthTo]);

  function applyQuickRange(kind) {
    const today = new Date();
    const fmt = (d) => d.toISOString().slice(0, 10);
    if (kind === 'this') {
      const start = new Date(today.getFullYear(), today.getMonth(), 1);
      setMonthFrom(fmt(start)); setMonthTo(fmt(today));
    } else if (kind === 'last') {
      const start = new Date(today.getFullYear(), today.getMonth() - 1, 1);
      const end = new Date(today.getFullYear(), today.getMonth(), 0);
      setMonthFrom(fmt(start)); setMonthTo(fmt(end));
    } else if (kind === '3') {
      const start = new Date(today.getFullYear(), today.getMonth() - 2, 1);
      setMonthFrom(fmt(start)); setMonthTo(fmt(today));
    } else if (kind === 'ytd') {
      const start = new Date(today.getFullYear(), 0, 1);
      setMonthFrom(fmt(start)); setMonthTo(fmt(today));
    } else { setMonthFrom(''); setMonthTo(''); }
  }

  async function recordDonation() {
    setErr(''); setMsg('');
    try {
      // When the donor is a registered member, the donorMemberId link
      // is enough to credit the donation on the member's performance
      // report (SRS §10). Auto-filling the donorName is fine; do NOT
      // auto-fill donorCnic — stored CNICs may not match the strict
      // ##### -####### -# zod regex, which would 400 the request.
      const payload = { ...donForm, unitLevel: ctx.unitLevel, unitId: ctx.unitId };
      if (donForm.donorType === 'MEMBER' && donForm.donorMemberId) {
        const m = members.find((x) => x._id === donForm.donorMemberId);
        if (m) payload.donorName = m.fullName;
        delete payload.donorCnic;
      }
      const fd = new FormData();
      Object.entries(payload).forEach(([k, v]) => {
        if (v !== '' && v != null) fd.append(k, v);
      });
      if (donReceipt) fd.append('receipt', donReceipt);
      await api.post('/finance/donations', fd);
      setMsg('Donation recorded.');
      setDonForm({ amount: '', donorType: 'MEMBER', donorMemberId: '', donorName: '', donorCnic: '', paymentMode: 'CASH', receivedAt: '' });
      setDonReceipt(null);
      setDonModalOpen(false);
      reload();
    } catch (e) { setErr(errorMessage(e)); }
  }

  async function recordExpense() {
    setErr(''); setMsg('');
    if (!expEvidence) { setErr('Please attach a bill / voucher.'); return; }
    try {
      const fd = new FormData();
      Object.entries({ ...expForm, unitLevel: ctx.unitLevel, unitId: ctx.unitId }).forEach(([k, v]) => {
        if (v !== '' && v != null) fd.append(k, v);
      });
      fd.append('evidence', expEvidence);
      await api.post('/finance/expenses', fd);
      setMsg('Expense recorded.');
      setExpForm({ amount: '', category: 'OFFICE', description: '', vendor: '', paymentMode: 'CASH', incurredAt: '' });
      setExpEvidence(null);
      setExpModalOpen(false);
      reload();
    } catch (e) { setErr(errorMessage(e)); }
  }

  async function decideExpense(id, decision) {
    try { await api.post(`/finance/expenses/${id}/decide`, { decision }); reload(); }
    catch (e) { alert(errorMessage(e)); }
  }

  // Authed download helper — same pattern used by MeetingsPage /
  // ReportsPage. Streams the unit-wide finance report (KPIs +
  // donations + expenses) as PDF or XLSX.
  function downloadReport(format) {
    if (!ctx) return;
    const params = new URLSearchParams({ unitLevel: ctx.unitLevel, unitId: ctx.unitId });
    const ext = format === 'pdf' ? 'pdf' : 'xlsx';
    const filename = `${ctx.unitName || 'unit'}-finance.${ext}`;
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
    }).catch(() => alert('Download failed.'));
  }

  if (!ctx) return <p>Select a unit context first.</p>;
  // Server enforces this too (403) — the guard just renders a clear
  // notice instead of a page of failed requests.
  if (!hasPermission(user, 'MANAGE_FINANCE') && !hasPermission(user, 'APPROVE_EXPENSE')) {
    return (
      <div className="alert error">
        Your current role does not include finance permissions, so this page is unavailable.
      </div>
    );
  }


  return (
    <div>
      <div className="page-header">
        <div>
          <h2>Finance · {ctx.unitName}</h2>
          <div className="subtitle">{ctx.unitLevel.replace('_', ' ')}</div>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <button className="btn secondary" onClick={() => downloadReport('pdf')}>Download PDF</button>
          <button className="btn secondary" onClick={() => downloadReport('xlsx')}>Download Excel</button>
        </div>
      </div>

      {err && <div className="alert error">{err}</div>}
      {msg && <div className="alert success">{msg}</div>}

      {summary && (
        <>
          <div className="kpi-grid" key={pulseKey}>
            <div className="kpi kpi-pulse"><div className="label">Donations</div><div className="value">{PKR.format(summary.donations.total)}</div><div className="hint">{summary.donations.count} entries</div></div>
            <div className="kpi kpi-pulse"><div className="label">Approved Expenses</div><div className="value">{PKR.format(summary.expenses.total)}</div><div className="hint">{summary.expenses.count} entries</div></div>
            {summary.transfersIn && (
              <div className="kpi kpi-pulse"><div className="label">Transfers In</div><div className="value">{PKR.format(summary.transfersIn.total)}</div><div className="hint">{summary.transfersIn.count} acknowledged</div></div>
            )}
            {summary.transfersOut && (
              <div className="kpi kpi-pulse"><div className="label">Transfers Out</div><div className="value">{PKR.format(summary.transfersOut.total)}</div><div className="hint">{summary.transfersOut.count} acknowledged</div></div>
            )}
            <div className={`kpi kpi-pulse ${summary.balance < 0 ? 'kpi-danger' : 'kpi-good'}`}><div className="label">Net Balance</div><div className="value">{PKR.format(summary.balance)}</div></div>
          </div>
        </>
      )}

      <div className="toolbar">
        <button className={`btn ${tab === 'donations' ? '' : 'secondary'}`} onClick={() => setTab('donations')}>Donations</button>
        <button className={`btn ${tab === 'expenses' ? '' : 'secondary'}`} onClick={() => setTab('expenses')}>Expenses</button>
        <button className={`btn ${tab === 'monthly' ? '' : 'secondary'}`} onClick={() => setTab('monthly')}>Monthly Statements</button>
      </div>

      {tab === 'donations' && (
        <>
          {canRecord && (
            <div style={{ marginBottom: 12, display: 'flex', justifyContent: 'flex-end' }}>
              <button className="btn" onClick={() => setDonModalOpen(true)}>+ Record Donation</button>
            </div>
          )}
          {canRecord && donModalOpen && (
          <div className="modal-backdrop" onClick={(e) => { if (e.target === e.currentTarget) setDonModalOpen(false); }}>
          <div className="modal" style={{ maxWidth: 720 }} role="dialog" aria-modal="true" aria-label="Record Donation">
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
              <h3 style={{ margin: 0 }}>Record a Donation</h3>
              <button type="button" className="btn secondary" onClick={() => setDonModalOpen(false)} aria-label="Close" style={{ padding: '4px 10px', fontSize: 18, lineHeight: 1 }}>×</button>
            </div>
            <div className="form-grid">
              <div className="field"><label>Amount (PKR)</label>
                <input type="number" value={donForm.amount} onChange={(e) => setDonForm({ ...donForm, amount: e.target.value })} /></div>
              <div className="field"><label>Donor Type</label>
                <select value={donForm.donorType} onChange={(e) => setDonForm({ ...donForm, donorType: e.target.value })}>
                  {DONOR_TYPES.map((t) => <option key={t}>{t}</option>)}
                </select></div>
              {donForm.donorType === 'MEMBER' && (
                <div className="field full">
                  <label>Donor (member)</label>
                  <select value={donForm.donorMemberId} onChange={(e) => setDonForm({ ...donForm, donorMemberId: e.target.value })}>
                    <option value="">— pick a member —</option>
                    {members.map((m) => <option key={m._id} value={m._id}>{m.fullName} · {m.memberId || m.cnic}</option>)}
                  </select>
                  <div className="hint">Linking to a member also reflects the donation on their performance report.</div>
                </div>
              )}
              {(donForm.donorType === 'NON_MEMBER' || donForm.donorType === 'CORPORATE') && (
                <>
                  <div className="field"><label>Donor Name</label>
                    <input value={donForm.donorName} onChange={(e) => setDonForm({ ...donForm, donorName: e.target.value })} /></div>
                  <div className="field"><label>Donor CNIC</label>
                    <input value={donForm.donorCnic} placeholder="42101-1234567-1" onChange={(e) => setDonForm({ ...donForm, donorCnic: e.target.value })} /></div>
                </>
              )}
              <div className="field"><label>Payment Mode</label>
                <select value={donForm.paymentMode} onChange={(e) => setDonForm({ ...donForm, paymentMode: e.target.value })}>
                  {PAYMENT_MODES.map((m) => <option key={m}>{m}</option>)}
                </select></div>
              <div className="field"><label>Received At</label>
                <input type="date" value={donForm.receivedAt} onChange={(e) => setDonForm({ ...donForm, receivedAt: e.target.value })} /></div>
              <div className="field full"><label>Receipt Image (optional)</label>
                <input type="file" accept="image/*,application/pdf" onChange={(e) => setDonReceipt(e.target.files?.[0] || null)} /></div>
            </div>
            <div style={{ marginTop: 18, display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
              <button className="btn secondary" type="button" onClick={() => setDonModalOpen(false)}>Cancel</button>
              <button className="btn" onClick={recordDonation}>Record Donation</button>
            </div>
          </div>
          </div>
          )}

          <table className="list">
            <thead>
              <tr><th>Receipt</th><th>Date</th><th>Donor</th><th>Mode</th><th style={{ textAlign: 'right' }}>Amount</th></tr>
            </thead>
            <tbody>
              {donations.length === 0 && <tr><td colSpan="5">No donations yet.</td></tr>}
              {donations.map((d) => (
                <tr key={d._id}>
                  <td>{d.receiptNo}</td>
                  <td>{new Date(d.receivedAt).toLocaleDateString()}</td>
                  <td>{d.donorType === 'ANONYMOUS' ? 'Anonymous' : (d.donorName || '—')}</td>
                  <td>{d.paymentMode}</td>
                  <td style={{ textAlign: 'right' }}>{PKR.format(d.amount)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </>
      )}

      {tab === 'expenses' && (
        <>
          {canRecord && (
            <div style={{ marginBottom: 12, display: 'flex', justifyContent: 'flex-end' }}>
              <button className="btn" onClick={() => setExpModalOpen(true)}>+ Record Expense</button>
            </div>
          )}
          {canRecord && expModalOpen && (
          <div className="modal-backdrop" onClick={(e) => { if (e.target === e.currentTarget) setExpModalOpen(false); }}>
          <div className="modal" style={{ maxWidth: 720 }} role="dialog" aria-modal="true" aria-label="Record Expense">
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
              <h3 style={{ margin: 0 }}>Record an Expense</h3>
              <button type="button" className="btn secondary" onClick={() => setExpModalOpen(false)} aria-label="Close" style={{ padding: '4px 10px', fontSize: 18, lineHeight: 1 }}>×</button>
            </div>
            <div className="form-grid">
              <div className="field"><label>Amount (PKR)</label>
                <input type="number" value={expForm.amount} onChange={(e) => setExpForm({ ...expForm, amount: e.target.value })} /></div>
              <div className="field"><label>Category</label>
                <select value={expForm.category} onChange={(e) => setExpForm({ ...expForm, category: e.target.value })}>
                  {EXPENSE_CATEGORIES.map((c) => <option key={c}>{c}</option>)}
                </select></div>
              <div className="field full"><label>Description</label>
                <input value={expForm.description} onChange={(e) => setExpForm({ ...expForm, description: e.target.value })} /></div>
              <div className="field"><label>Vendor / Payee</label>
                <input value={expForm.vendor} onChange={(e) => setExpForm({ ...expForm, vendor: e.target.value })} /></div>
              <div className="field"><label>Payment Mode</label>
                <select value={expForm.paymentMode} onChange={(e) => setExpForm({ ...expForm, paymentMode: e.target.value })}>
                  {PAYMENT_MODES.map((m) => <option key={m}>{m}</option>)}
                </select></div>
              <div className="field"><label>Incurred At</label>
                <input type="date" value={expForm.incurredAt} onChange={(e) => setExpForm({ ...expForm, incurredAt: e.target.value })} /></div>
              <div className="field full"><label>Bill / Voucher (required)</label>
                <input type="file" accept="image/*,application/pdf" onChange={(e) => setExpEvidence(e.target.files?.[0] || null)} /></div>
            </div>
            <div style={{ marginTop: 18, display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
              <button className="btn secondary" type="button" onClick={() => setExpModalOpen(false)}>Cancel</button>
              <button className="btn" onClick={recordExpense}>Record Expense</button>
            </div>
          </div>
          </div>
          )}

          <table className="list">
            <thead>
              <tr><th>Date</th><th>Category</th><th>Description</th><th>Vendor</th><th style={{ textAlign: 'right' }}>Amount</th><th>State</th><th></th></tr>
            </thead>
            <tbody>
              {expenses.length === 0 && <tr><td colSpan="7">No expenses yet.</td></tr>}
              {expenses.map((x) => (
                <tr key={x._id}>
                  <td>{new Date(x.incurredAt).toLocaleDateString()}</td>
                  <td>{x.category}</td>
                  <td>{x.description}</td>
                  <td>{x.vendor || '—'}</td>
                  <td style={{ textAlign: 'right' }}>{PKR.format(x.amount)}</td>
                  <td><span className={`badge ${x.state}`}>{x.state}</span></td>
                  <td>{x.state === 'PENDING' && canApprove && (
                    <>
                      <button className="btn" onClick={() => decideExpense(x._id, 'APPROVED')}>Approve</button>{' '}
                      <button className="btn danger" onClick={() => decideExpense(x._id, 'REJECTED')}>Reject</button>
                    </>
                  )}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </>
      )}

      {tab === 'monthly' && (
        <>
          <div className="card" style={{ marginBottom: 16 }}>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'flex-end' }}>
              <div className="field" style={{ minWidth: 180 }}>
                <label>From</label>
                <input type="date" value={monthFrom} onChange={(e) => setMonthFrom(e.target.value)} />
              </div>
              <div className="field" style={{ minWidth: 180 }}>
                <label>To</label>
                <input type="date" value={monthTo} onChange={(e) => setMonthTo(e.target.value)} />
              </div>
              <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                <button className="btn secondary" onClick={() => applyQuickRange('this')}>This month</button>
                <button className="btn secondary" onClick={() => applyQuickRange('last')}>Last month</button>
                <button className="btn secondary" onClick={() => applyQuickRange('3')}>Last 3 months</button>
                <button className="btn secondary" onClick={() => applyQuickRange('ytd')}>Year-to-date</button>
                <button className="btn ghost" onClick={() => applyQuickRange('all')}>All time</button>
              </div>
            </div>
          </div>

          <table className="list">
            <thead>
              <tr>
                <th>Month</th>
                <th style={{ textAlign: 'right' }}>Donations</th>
                <th style={{ textAlign: 'right' }}>Transfers In</th>
                <th style={{ textAlign: 'right' }}>Expenses</th>
                <th style={{ textAlign: 'right' }}>Transfers Out</th>
                <th style={{ textAlign: 'right' }}>Net Balance</th>
              </tr>
            </thead>
            <tbody>
              {monthly.length === 0 && <tr><td colSpan="6" className="muted">No financial activity in this period.</td></tr>}
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
                  <td>Totals</td>
                  <td style={{ textAlign: 'right' }}>{PKR.format(monthly.reduce((a, m) => a + m.donations, 0))}</td>
                  <td style={{ textAlign: 'right' }}>{PKR.format(monthly.reduce((a, m) => a + m.transfersIn, 0))}</td>
                  <td style={{ textAlign: 'right' }}>{PKR.format(monthly.reduce((a, m) => a + m.expenses, 0))}</td>
                  <td style={{ textAlign: 'right' }}>{PKR.format(monthly.reduce((a, m) => a + m.transfersOut, 0))}</td>
                  <td style={{ textAlign: 'right' }}>{PKR.format(monthly.reduce((a, m) => a + m.netBalance, 0))}</td>
                </tr>
              )}
            </tbody>
          </table>
        </>
      )}
    </div>
  );
}
