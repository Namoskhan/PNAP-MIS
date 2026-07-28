import { useState } from 'react';
import { Link } from 'react-router-dom';
import { publicApi, publicErrorMessage } from '../api/publicClient';
import { formatCnic } from '../utils/formatters';

export default function PublicStatusPage() {
  const [cnic, setCnic] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const [result, setResult] = useState(null);

  async function onSubmit(e) {
    e.preventDefault();
    setErr('');
    setResult(null);
    setBusy(true);
    try {
      const res = await publicApi.get('/status', { params: { cnic } });
      setResult(res.data.data);
    } catch (ex) {
      setErr(publicErrorMessage(ex));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="public-shell">
      <div className="public-card">
        <div className="public-brand">
          <span className="public-logo">PKNAP</span>
          <span>Application Status</span>
        </div>
        <h1>Check Your Application</h1>
        <p className="muted">
          Enter the CNIC you used when registering to see the current status of your
          PKNAP membership application.
        </p>

        {err && <div className="alert error">{err}</div>}

        <form onSubmit={onSubmit}>
          <div className="field">
            <label>CNIC</label>
            <input
              value={cnic}
              placeholder="42101-1234567-1"
              inputMode="numeric"
              maxLength={15}
              onChange={(e) => setCnic(formatCnic(e.target.value))}
              required
            />
          </div>
          <div style={{ display: 'flex', gap: 10, marginTop: 12 }}>
            <button className="btn" type="submit" disabled={busy}>
              {busy ? 'Checking…' : 'Check Status'}
            </button>
            <Link className="btn secondary" to="/register">Back to Registration</Link>
          </div>
        </form>

        {result && (
          <div className="alert success" style={{ marginTop: 16 }}>
            <div><strong>Name:</strong> {result.fullName}</div>
            {result.memberId && <div><strong>Member ID:</strong> {result.memberId}</div>}
            <div><strong>Status:</strong> {result.status}</div>
            {result.statusReason && <div><strong>Reason:</strong> {result.statusReason}</div>}
            <div><strong>Submitted:</strong> {new Date(result.createdAt).toLocaleString()}</div>
          </div>
        )}
      </div>
    </div>
  );
}
