import { useEffect, useState } from 'react';
import { api, errorMessage } from '../../api/client';

// SRS §5.1 — "the province will be structured by the Central Admin".
// Read-only listing of every province + the auto-provisioned
// Province Admin username for each. Province creation lives in the
// seed / startup backfill — the Central Admin does not create
// provinces ad-hoc from the panel.
export default function ManageProvincesPage() {
  const [items, setItems] = useState([]);
  const [err, setErr] = useState('');

  useEffect(() => {
    api.get('/org/provinces')
      .then((r) => setItems(r.data.data))
      .catch((e) => setErr(errorMessage(e)));
  }, []);

  return (
    <div>
      <div className="page-header">
        <h2>Provinces</h2>
      </div>
      <p className="muted">
        Per SRS §5.1, every province has an auto-provisioned Province Admin user
        (username = slugified province name, password = 123456).
      </p>

      {err && <div className="alert error">{err}</div>}

      <div className="card">
        <h3 style={{ marginTop: 0 }}>Existing Provinces</h3>
        {items.length === 0 ? (
          <p className="muted">No provinces yet.</p>
        ) : (
          <table className="list">
            <thead><tr><th>Name</th><th>Code</th><th>Province Admin Username</th><th>Status</th></tr></thead>
            <tbody>
              {items.map((p) => (
                <tr key={p._id}>
                  <td><strong>{p.name}</strong></td>
                  <td>{p.code}</td>
                  <td><code>{p.name.toLowerCase().replace(/[^a-z0-9]+/g, '-')}</code> <span className="muted" style={{ fontSize: 12 }}>(pw: 123456)</span></td>
                  <td><span className="badge ACTIVE">{p.isActive ? 'Active' : 'Inactive'}</span></td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
