import { useEffect, useState } from 'react';
import { useUnit } from '../../context/UnitContext';
import { useAuth } from '../../context/AuthContext';
import { hasPermission } from '../../utils/permissions';
import { api, errorMessage } from '../../api/client';
import OrgTree from '../../components/OrgTree';
import DestinationHierarchy, {
  DestinationHierarchyInline, unitLabel,
} from '../../components/DestinationHierarchy';

const PKR = new Intl.NumberFormat('en-PK', { style: 'currency', currency: 'PKR', maximumFractionDigits: 0 });
// Presentation only — the stored enum codes are untouched.
const LEVEL_LABEL = {
  BASIC_UNIT: 'Basic Unit', AREA: 'Area', DISTRICT: 'District',
  PROVINCE: 'Province', CENTRAL: 'Center',
};
const DIRECTION_LABEL = { UP: 'Upward', DOWN: 'Downward', SAME_TIER: 'Same tier' };

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
  // The node picked in the tree, and the server's verdict on it —
  // resolved unit, full hierarchy, direction. Display only; create
  // re-resolves everything from the id.
  const [picked, setPicked] = useState(null);
  const [preview, setPreview] = useState(null);
  const [previewErr, setPreviewErr] = useState('');
  const [previewLoading, setPreviewLoading] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  async function reload() {
    if (!ctx) return;
    const r = await api.get('/transfers', {
      params: { unitLevel: ctx.unitLevel, unitId: ctx.unitId, direction: tab },
    });
    setItems(r.data.data);
  }
  useEffect(() => { reload(); }, [ctx, tab]);

  // Switching unit context invalidates any pending selection.
  useEffect(() => { resetSelection(); }, [ctx]);

  function resetSelection() {
    setPicked(null);
    setPreview(null);
    setPreviewErr('');
  }

  // Ask the server to validate and describe the node the user picked.
  // This is the same check create performs, run early so an illegal
  // destination is reported before the sender fills in an amount.
  useEffect(() => {
    let cancelled = false;
    if (!ctx || !picked) { setPreview(null); setPreviewErr(''); return undefined; }
    setPreviewLoading(true);
    setPreviewErr('');
    api.get('/transfers/destination-preview', {
      params: { sourceLevel: ctx.unitLevel, sourceUnitId: ctx.unitId, destinationId: picked.id },
    })
      .then((r) => { if (!cancelled) { setPreview(r.data.data); setPreviewErr(''); } })
      .catch((e) => { if (!cancelled) { setPreview(null); setPreviewErr(errorMessage(e)); } })
      .finally(() => { if (!cancelled) setPreviewLoading(false); });
    return () => { cancelled = true; };
  }, [ctx, picked]);

  async function initiate() {
    setErr(''); setMsg('');
    if (!preview) { setErr('Select a destination from the organization tree.'); return; }
    if (!receipt) { setErr('Please attach the receipt / proof-of-payment image before initiating the transfer.'); return; }
    setSubmitting(true);
    try {
      const fd = new FormData();
      fd.append('sourceLevel', ctx.unitLevel);
      fd.append('sourceUnitId', ctx.unitId);
      // The only routing input the server accepts — an opaque id it
      // re-resolves and re-validates on its own.
      fd.append('destinationId', preview.destination.id);
      fd.append('amount', form.amount);
      fd.append('mode', form.mode);
      if (form.reference) fd.append('reference', form.reference);
      if (form.note) fd.append('note', form.note);
      fd.append('receipt', receipt);
      await api.post('/transfers', fd);
      setMsg(`Transfer of ${PKR.format(parseFloat(form.amount))} to ${unitLabel(preview.destination)} initiated. `
        + `Awaiting acknowledgement by the ${preview.destination.levelLabel} Finance Secretary.`);
      setForm({ amount: '', mode: 'BANK_TRANSFER', reference: '', note: '' });
      setReceipt(null);
      resetSelection();
      setConfirmOpen(false);
      setTransferModalOpen(false);
      reload();
    } catch (e) {
      setErr(errorMessage(e));
      setConfirmOpen(false);
    } finally { setSubmitting(false); }
  }

  // Counterparty for a history row. Destinations and sources are now
  // arbitrary units anywhere in the organization, so the record's own
  // denormalized name is the only reliable label. Rows created before
  // that field existed fall back to the tier label.
  function counterparty(t) {
    const name = tab === 'outgoing' ? t.destinationName : t.sourceName;
    const level = tab === 'outgoing' ? t.destinationLevel : t.sourceLevel;
    if (!name) return LEVEL_LABEL[level] || level;
    return level === 'CENTRAL' ? name : `${name} ${LEVEL_LABEL[level] || level}`;
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

  // Center heads the organization and does not initiate transfers —
  // unchanged from before, and enforced server-side by sourceLevel.
  const canSend = ctx.unitLevel !== 'CENTRAL';
  const readyToConfirm = !!preview && !!form.amount && !!receipt;

  return (
    <div>
      <div className="page-header">
        <h2>Fund Transfers · {ctx.unitName}</h2>
        {canSend && (
          <button className="btn" onClick={() => setTransferModalOpen(true)}>+ Initiate Fund Transfer</button>
        )}
      </div>

      {err && !transferModalOpen && <div className="alert error">{err}</div>}
      {msg && <div className="alert success">{msg}</div>}

      {canSend && (
        <div className="tr-banner">
          <span>
            <strong>{ctx.unitName}</strong>{' '}
            {ctx.unitLevel === 'PROVINCE'
              ? 'may send funds to any unit in the organization, including other provinces.'
              : 'may send funds to any unit within its own province, or to the Center. '
                + 'Transfers to another province are initiated by the Province Finance Secretary.'}
            {' '}The unit you choose receives the funds and is the only one that acknowledges them.
          </span>
        </div>
      )}

      {canSend && transferModalOpen && (
        <div className="modal-backdrop" onClick={(e) => { if (e.target === e.currentTarget) setTransferModalOpen(false); }}>
        <div className="modal tr-modal" role="dialog" aria-modal="true" aria-label="Initiate Fund Transfer">
          <div className="tr-modal-head">
            <h3 style={{ margin: 0 }}>Initiate Fund Transfer</h3>
            <button type="button" className="btn secondary" onClick={() => setTransferModalOpen(false)} aria-label="Close" style={{ padding: '4px 10px', fontSize: 18, lineHeight: 1 }}>×</button>
          </div>

          {err && <div className="alert error">{err}</div>}

          {/* Two panes, each scrolling independently inside a
              fixed-height dialog. The tree keeps its own scrollbar and
              stays fully on screen — browsing it never moves the form,
              and filling in the form never moves the tree. Collapses
              to one column below 900px. */}
          <div className="tr-modal-body">

          {/* ── Organization tree ─────────────────────────────── */}
          <div className="tr-pane tr-pane-tree">
            <p className="tr-section-title">Choose Destination</p>
            <OrgTree
              selectedId={picked?.id || null}
              disabledId={ctx.unitId}
              source={{ level: ctx.unitLevel, unitId: ctx.unitId }}
              onSelect={(node) => setPicked(node)}
            />
          </div>

          <div className="tr-pane tr-pane-form">

          {/* ── Transfer From ──────────────────────────────────── */}
          <div className="tr-section">
            <p className="tr-section-title">Transfer From</p>
            <div className="tr-endpoint from">
              <span className="tr-endpoint-level">{LEVEL_LABEL[ctx.unitLevel] || ctx.unitLevel}</span>
              <div className="tr-endpoint-name">{ctx.unitName}</div>
            </div>
          </div>

          {/* ── Selected destination ──────────────────────────── */}
          <div className="tr-section">
            <p className="tr-section-title">Selected Destination</p>
            {!picked && (
              <div className="tr-endpoint to empty">
                <div className="tr-endpoint-name muted">
                  Nothing selected yet — pick a unit from the organization tree.
                </div>
              </div>
            )}
            {picked && previewLoading && <p className="muted">Checking destination…</p>}
            {picked && previewErr && <div className="alert error">{previewErr}</div>}
            {preview && (
              <div className="tr-endpoint to">
                <div className="tr-endpoint-label">Destination</div>
                <div className="tr-endpoint-name">{preview.destination.name}</div>
                <div style={{ marginTop: 8 }}>
                  <span className="tr-endpoint-level">{preview.destination.level}</span>
                  {preview.direction && (
                    <span className="badge" style={{ marginLeft: 6 }}>
                      {DIRECTION_LABEL[preview.direction] || preview.direction}
                    </span>
                  )}
                </div>
                <div className="tr-endpoint-label" style={{ marginTop: 14 }}>Hierarchy</div>
                <DestinationHierarchy path={preview.path} />
                <p className="hint" style={{ marginTop: 10 }}>
                  The {preview.destination.levelLabel} Finance Secretary of{' '}
                  {preview.destination.name} acknowledges this transfer. No other unit reviews it.
                </p>
              </div>
            )}
          </div>

          {/* ── Transfer form ─────────────────────────────────── */}
          <div className="tr-section">
          <p className="tr-section-title">Transfer Details</p>
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
            <div className="field full"><label>Notes</label>
              <input value={form.note} onChange={(e) => setForm({ ...form, note: e.target.value })} /></div>
            <div className="field full">
              <label>Receipt / Proof of Payment <span className="req">*</span></label>
              <input
                type="file"
                accept="image/jpeg,image/png,image/webp"
                onChange={(e) => setReceipt(e.target.files?.[0] || null)}
              />
              <span className="hint">JPEG / PNG / WebP. The receiving Finance Secretary will verify this image before acknowledging.</span>
            </div>
          </div>
          </div>

          </div>{/* /tr-pane-form */}
          </div>{/* /tr-modal-body */}

          <div className="tr-modal-actions">
            <button className="btn secondary" type="button" onClick={() => setTransferModalOpen(false)}>Cancel</button>
            <button
              className="btn"
              onClick={() => { setErr(''); setConfirmOpen(true); }}
              disabled={!readyToConfirm}
            >
              Transfer
            </button>
          </div>
        </div>
        </div>
      )}

      {/* Last stop before the funds leave. */}
      {canSend && confirmOpen && preview && (
        <div
          className="modal-backdrop"
          style={{ zIndex: 1100 }}
          onClick={(e) => { if (e.target === e.currentTarget && !submitting) setConfirmOpen(false); }}
        >
          <div className="modal" style={{ maxWidth: 580 }} role="dialog" aria-modal="true" aria-label="Confirm Transfer">
            <h3 style={{ marginTop: 0 }}>Transfer Summary</h3>
            <p className="muted" style={{ marginTop: 0 }}>You are about to transfer funds.</p>

            <div className="tr-summary">
              <div className="tr-summary-row">
                <div className="tr-summary-key">From</div>
                <div className="tr-summary-val">
                  {ctx.unitName}
                  <span className="muted"> · {LEVEL_LABEL[ctx.unitLevel] || ctx.unitLevel}</span>
                </div>
              </div>
              <div className="tr-summary-row">
                <div className="tr-summary-key">To</div>
                <div className="tr-summary-val">
                  {preview.destination.name}
                  <div className="muted" style={{ fontSize: 12, marginTop: 2 }}>
                    Acknowledged by the {preview.destination.levelLabel} Finance Secretary — no
                    other unit reviews this transfer.
                  </div>
                </div>
              </div>
              <div className="tr-summary-row">
                <div className="tr-summary-key">Destination Level</div>
                <div className="tr-summary-val">{preview.destination.level}</div>
              </div>
              <div className="tr-summary-row">
                <div className="tr-summary-key">Hierarchy</div>
                <div className="tr-summary-val">
                  <DestinationHierarchyInline path={preview.path} />
                </div>
              </div>
              <div className="tr-summary-row">
                <div className="tr-summary-key">Amount</div>
                <div className="tr-summary-val amount">
                  {form.amount ? PKR.format(parseFloat(form.amount)) : '—'}
                </div>
              </div>
              <div className="tr-summary-row">
                <div className="tr-summary-key">Receipt</div>
                <div className="tr-summary-val">{receipt ? `Uploaded — ${receipt.name}` : 'Not attached'}</div>
              </div>
              <div className="tr-summary-row">
                <div className="tr-summary-key">Reference</div>
                <div className="tr-summary-val">{form.mode}{form.reference ? ` · ${form.reference}` : ''}</div>
              </div>
              <div className="tr-summary-row">
                <div className="tr-summary-key">Notes</div>
                <div className="tr-summary-val">{form.note || '—'}</div>
              </div>
            </div>

            <div style={{ marginTop: 16, display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
              <button className="btn secondary" type="button" disabled={submitting} onClick={() => setConfirmOpen(false)}>Cancel</button>
              <button className="btn" onClick={initiate} disabled={submitting}>
                {submitting ? 'Transferring…' : 'Confirm Transfer'}
              </button>
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
              <td>{counterparty(t)}</td>
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
