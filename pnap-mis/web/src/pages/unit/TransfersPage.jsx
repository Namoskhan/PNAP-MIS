import { useEffect, useState } from 'react';
import { useUnit } from '../../context/UnitContext';
import { useAuth } from '../../context/AuthContext';
import { hasPermission } from '../../utils/permissions';
import { api, errorMessage } from '../../api/client';

const PKR = new Intl.NumberFormat('en-PK', { style: 'currency', currency: 'PKR', maximumFractionDigits: 0 });
const PARENT = { BASIC_UNIT: 'AREA', AREA: 'DISTRICT', DISTRICT: 'PROVINCE', PROVINCE: 'CENTRAL' };
const RECEIVER_LABEL = {
  BASIC_UNIT: 'Area Finance Secretary',
  AREA: 'District Finance Secretary',
  DISTRICT: 'Province Finance Secretary',
  PROVINCE: 'Central Finance Secretary',
};

export default function TransfersPage() {
  const { ctx } = useUnit();
  const [tab, setTab] = useState('outgoing');
  const [items, setItems] = useState([]);
  const [form, setForm] = useState({ amount: '', mode: 'BANK_TRANSFER', reference: '', note: '' });
  const [receipt, setReceipt] = useState(null);
  const [err, setErr] = useState('');
  const [msg, setMsg] = useState('');
  const [previewUrl, setPreviewUrl] = useState(null);
  const [transferModalOpen, setTransferModalOpen] = useState(false);

  async function reload() {
    if (!ctx) return;
    const r = await api.get('/transfers', {
      params: { unitLevel: ctx.unitLevel, unitId: ctx.unitId, direction: tab },
    });
    setItems(r.data.data);
  }
  useEffect(() => { reload(); }, [ctx, tab]);

  async function initiate() {
    setErr(''); setMsg('');
    if (!receipt) { setErr('Please attach the receipt / proof-of-payment image before initiating the transfer.'); return; }
    try {
      const fd = new FormData();
      fd.append('sourceLevel', ctx.unitLevel);
      fd.append('sourceUnitId', ctx.unitId);
      fd.append('amount', form.amount);
      fd.append('mode', form.mode);
      if (form.reference) fd.append('reference', form.reference);
      if (form.note) fd.append('note', form.note);
      fd.append('receipt', receipt);
      await api.post('/transfers', fd);
      setMsg(`Transfer of ${PKR.format(parseFloat(form.amount))} initiated. Awaiting approval by the ${RECEIVER_LABEL[ctx.unitLevel] || PARENT[ctx.unitLevel]}.`);
      setForm({ amount: '', mode: 'BANK_TRANSFER', reference: '', note: '' });
      setReceipt(null);
      setTransferModalOpen(false);
      reload();
    } catch (e) { setErr(errorMessage(e)); }
  }

  async function ack(id) {
    try { await api.post(`/transfers/${id}/acknowledge`, {}); reload(); }
    catch (e) { alert(errorMessage(e)); }
  }
  async function reject(id) {
    const note = prompt('Reason for rejection:') || '';
    try { await api.post(`/transfers/${id}/reject`, { note }); reload(); }
    catch (e) { alert(errorMessage(e)); }
  }

  const { user } = useAuth();
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


  const canSend = ctx.unitLevel !== 'CENTRAL';

  return (
    <div>
      <div className="page-header">
        <h2>Inter-Level Fund Transfers · {ctx.unitName}</h2>
        {canSend && (
          <button className="btn" onClick={() => setTransferModalOpen(true)}>+ Initiate Transfer</button>
        )}
      </div>

      {err && <div className="alert error">{err}</div>}
      {msg && <div className="alert success">{msg}</div>}

      {canSend && transferModalOpen && (
        <div className="modal-backdrop" onClick={(e) => { if (e.target === e.currentTarget) setTransferModalOpen(false); }}>
        <div className="modal" style={{ maxWidth: 640 }} role="dialog" aria-modal="true" aria-label="Initiate Transfer">
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
            <h3 style={{ margin: 0 }}>Send Surplus Funds Upward</h3>
            <button type="button" className="btn secondary" onClick={() => setTransferModalOpen(false)} aria-label="Close" style={{ padding: '4px 10px', fontSize: 18, lineHeight: 1 }}>×</button>
          </div>
          <div className="form-grid">
            <div className="field"><label>Amount (PKR)</label>
              <input type="number" value={form.amount} onChange={(e) => setForm({ ...form, amount: e.target.value })} /></div>
            <div className="field"><label>Mode</label>
              <select value={form.mode} onChange={(e) => setForm({ ...form, mode: e.target.value })}>
                <option>BANK_TRANSFER</option>
                <option>CASH</option>
                <option>MOBILE_WALLET</option>
                <option>CHEQUE</option>
              </select></div>
            <div className="field"><label>Reference / Cheque No.</label>
              <input value={form.reference} onChange={(e) => setForm({ ...form, reference: e.target.value })} /></div>
            <div className="field full"><label>Note</label>
              <input value={form.note} onChange={(e) => setForm({ ...form, note: e.target.value })} /></div>
            <div className="field full">
              <label>Receipt / Proof of Payment <span className="req">*</span></label>
              <input
                type="file"
                accept="image/jpeg,image/png,image/webp"
                onChange={(e) => setReceipt(e.target.files?.[0] || null)}
              />
              <span className="hint">JPEG / PNG / WebP. The receiving Finance Secretary will verify this image before approving.</span>
            </div>
          </div>
          <div style={{ marginTop: 18, display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
            <button className="btn secondary" type="button" onClick={() => setTransferModalOpen(false)}>Cancel</button>
            <button className="btn" onClick={initiate} disabled={!form.amount || !receipt}>Initiate Transfer</button>
          </div>
        </div>
        </div>
      )}

      <div className="toolbar" style={{ marginTop: 16 }}>
        <button className={`btn ${tab === 'outgoing' ? '' : 'secondary'}`} onClick={() => setTab('outgoing')}>Outgoing</button>
        <button className={`btn ${tab === 'incoming' ? '' : 'secondary'}`} onClick={() => setTab('incoming')}>Incoming</button>
      </div>

      <table className="list">
        <thead>
          <tr>
            <th>Date</th>
            <th>{tab === 'outgoing' ? 'To' : 'From'}</th>
            <th>Mode</th>
            <th>Reference</th>
            <th style={{ textAlign: 'right' }}>Amount</th>
            <th>Receipt</th>
            <th>State</th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          {items.length === 0 && <tr><td colSpan="8" className="muted">No transfers in this view.</td></tr>}
          {items.map((t) => (
            <tr key={t._id}>
              <td>{new Date(t.createdAt).toLocaleDateString()}</td>
              <td>{tab === 'outgoing' ? t.destinationLevel : t.sourceLevel}</td>
              <td>{t.mode}</td>
              <td>{t.reference || '—'}</td>
              <td style={{ textAlign: 'right' }}>{PKR.format(t.amount)}</td>
              <td>
                {t.receiptImageUrl ? (
                  <button className="btn ghost" onClick={() => setPreviewUrl(t.receiptImageUrl)}>View</button>
                ) : (<span className="muted">—</span>)}
              </td>
              <td>
                <span className={`badge ${t.state === 'ACKNOWLEDGED' ? 'APPROVED' : t.state === 'REJECTED' ? 'REJECTED' : 'PENDING'}`}>{t.state}</span>
                {t.state === 'REJECTED' && t.decisionNote && (
                  <div style={{ marginTop: 4, fontSize: 12, color: 'var(--danger)', display: 'flex', gap: 4, alignItems: 'flex-start', maxWidth: 260 }}>
                    <strong>Reason:</strong>
                    <span style={{ flex: 1 }}>{t.decisionNote}</span>
                  </div>
                )}
              </td>
              <td>
                {tab === 'incoming' && t.state === 'PENDING_ACK' && (
                  <>
                    {t.receiptImageUrl && (
                      <>
                        <button className="btn secondary" onClick={() => setPreviewUrl(t.receiptImageUrl)}>Review Receipt</button>{' '}
                      </>
                    )}
                    <button className="btn" onClick={() => ack(t._id)}>Approve</button>{' '}
                    <button className="btn danger" onClick={() => reject(t._id)}>Reject</button>
                  </>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      {previewUrl && (
        <div className="modal-backdrop" onClick={() => setPreviewUrl(null)}>
          <div className="modal" onClick={(e) => e.stopPropagation()} style={{ maxWidth: 720 }}>
            <h3 style={{ marginTop: 0 }}>Receipt / Proof of Payment</h3>
            <img src={previewUrl} alt="Receipt" style={{ maxWidth: '100%', borderRadius: 'var(--radius)', border: '1px solid var(--border)' }} />
            <div style={{ display: 'flex', gap: 8, marginTop: 12, justifyContent: 'flex-end' }}>
              <a className="btn secondary" href={previewUrl} target="_blank" rel="noreferrer">Open full size</a>
              <button className="btn" onClick={() => setPreviewUrl(null)}>Close</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
