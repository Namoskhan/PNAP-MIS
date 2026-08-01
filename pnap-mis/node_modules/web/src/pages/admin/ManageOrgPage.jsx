import { useEffect, useState } from 'react';
import { api, errorMessage } from '../../api/client';
import { useAuth } from '../../context/AuthContext';
import { useToast } from '../../components/Toast';
import { SkeletonRows } from '../../components/Skeleton';

// Role-aware org-management page.
//   SUPER_ADMIN    → manages Provinces, creates Province Admins
//   PROVINCE_ADMIN → manages Districts in their province, creates District Admins
//   DISTRICT_ADMIN → manages Areas in their district, creates Area Admins
//   AREA_ADMIN     → manages Basic Units in their area (no admin user needed)

const TIER = {
  SUPER_ADMIN: {
    title: 'Manage Provinces',
    childLabel: 'Province',
    childPlural: 'Provinces',
    listEndpoint: '/org/provinces',
    createEndpoint: '/org/provinces',
    childAdminRole: 'PROVINCE_ADMIN',
    parentLabel: null,
    showCreateAdmin: true,
  },
  PROVINCE_ADMIN: {
    title: 'Manage Districts',
    childLabel: 'District',
    childPlural: 'Districts',
    listEndpoint: '/org/districts',
    createEndpoint: '/org/districts',
    childAdminRole: 'DISTRICT_ADMIN',
    parentLabel: 'Province',
    parentScopeKey: 'provinceId',
    showCreateAdmin: true,
  },
  DISTRICT_ADMIN: {
    title: 'Manage Areas',
    childLabel: 'Area',
    childPlural: 'Areas',
    listEndpoint: '/org/areas',
    createEndpoint: '/org/areas',
    childAdminRole: 'AREA_ADMIN',
    parentLabel: 'District',
    parentScopeKey: 'districtId',
    showCreateAdmin: true,
  },
  AREA_ADMIN: {
    title: 'Manage Basic Units',
    childLabel: 'Basic Unit',
    childPlural: 'Basic Units',
    listEndpoint: '/org/basic-units',
    createEndpoint: '/org/basic-units',
    childAdminRole: null,
    parentLabel: 'Area',
    parentScopeKey: 'areaId',
    showCreateAdmin: false,
  },
};

function pickTier(roles) {
  if (roles.includes('SUPER_ADMIN')) return TIER.SUPER_ADMIN;
  if (roles.includes('PROVINCE_ADMIN')) return TIER.PROVINCE_ADMIN;
  if (roles.includes('DISTRICT_ADMIN')) return TIER.DISTRICT_ADMIN;
  if (roles.includes('AREA_ADMIN')) return TIER.AREA_ADMIN;
  return null;
}

export default function ManageOrgPage() {
  const { user } = useAuth();
  const toast = useToast();
  const tier = pickTier(user?.roles || []);

  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(false);

  async function load() {
    if (!tier) return;
    setLoading(true);
    try {
      const params = {};
      if (tier.parentScopeKey === 'provinceId' && user.scope?.provinceId) params.provinceId = user.scope.provinceId;
      if (tier.parentScopeKey === 'districtId' && user.scope?.districtId) params.districtId = user.scope.districtId;
      if (tier.parentScopeKey === 'areaId' && user.scope?.areaId) params.areaId = user.scope.areaId;
      const r = await api.get(tier.listEndpoint, { params });
      setItems(r.data.data || []);
    } catch (e) {
      toast.error(errorMessage(e));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { load(); /* eslint-disable-next-line */ }, [user?.id]);

  if (!tier) {
    return (
      <div>
        <div className="page-header"><h2>Organization</h2></div>
        <div className="empty-smart">
          <div className="empty-icon">🚫</div>
          <h3>No org-management access</h3>
          <p>Your role does not have permission to create units.</p>
        </div>
      </div>
    );
  }

  return (
    <div>
      <div className="page-header">
        <div>
          <div style={{ fontSize: 11, color: 'var(--muted)', letterSpacing: 0.4, textTransform: 'uppercase' }}>
            {tier.parentLabel ? `Within your ${tier.parentLabel.toLowerCase()}` : 'System-wide'}
          </div>
          <h2 style={{ margin: '1px 0 0' }}>{tier.title}</h2>
        </div>
        <button className="btn" type="button" onClick={() => setOpen(true)}>
          + Create {tier.childLabel}
        </button>
      </div>

      <CreateModal
        open={open}
        onClose={() => setOpen(false)}
        tier={tier}
        user={user}
        onCreated={(child) => {
          toast.success(`${child?.name || tier.childLabel} created`, { title: `${tier.childLabel} added` });
          load();
        }}
      />

      <table className="smart">
        <thead>
          <tr>
            <th>Name</th>
            <th>Code</th>
            <th>Status</th>
          </tr>
        </thead>
        <tbody>
          {loading && <SkeletonRows rows={5} cols={3} />}
          {!loading && items.length === 0 && (
            <tr>
              <td colSpan="3" style={{ padding: 0 }}>
                <div className="empty-smart" style={{ border: 'none', padding: 36 }}>
                  <div className="empty-icon">📂</div>
                  <h3>No {tier.childPlural.toLowerCase()} yet</h3>
                  <p>Click <strong>+ Create {tier.childLabel}</strong> to add the first one.</p>
                </div>
              </td>
            </tr>
          )}
          {!loading && items.map((it) => (
            <tr key={it._id}>
              <td className="cell-strong">{it.name}</td>
              <td>{it.code || <span className="cell-muted">—</span>}</td>
              <td><span className="badge ACTIVE">{it.isActive === false ? 'Inactive' : 'Active'}</span></td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function CreateModal({ open, onClose, tier, user, onCreated }) {
  const toast = useToast();
  const [form, setForm] = useState({ name: '', code: '' });
  const [admin, setAdmin] = useState({ fullName: '', username: '', email: '', password: '' });
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');

  useEffect(() => {
    if (!open) return;
    setForm({ name: '', code: '' });
    setAdmin({ fullName: '', username: '', email: '', password: '' });
    setErr('');
  }, [open]);

  if (!open) return null;

  async function onSubmit(e) {
    e.preventDefault();
    setErr('');
    if (!form.name.trim()) { setErr(`${tier.childLabel} name is required`); return; }
    if (tier.showCreateAdmin) {
      if (!admin.fullName.trim()) { setErr('Admin full name is required'); return; }
      if (!admin.username && !admin.email) { setErr('Either username or email is required for the admin'); return; }
      if (!admin.password || admin.password.length < 6) { setErr('Admin password must be at least 6 characters'); return; }
    }
    setBusy(true);
    try {
      // 1. Create the child unit
      const body = { name: form.name.trim() };
      if (form.code.trim()) body.code = form.code.trim();
      // Inject the parent scope so backend RBAC passes
      if (tier.parentScopeKey === 'provinceId') body.provinceId = user.scope?.provinceId;
      if (tier.parentScopeKey === 'districtId') body.districtId = user.scope?.districtId;
      if (tier.parentScopeKey === 'areaId') body.areaId = user.scope?.areaId;
      const childRes = await api.post(tier.createEndpoint, body);
      const child = childRes.data.data;

      // 2. Create the admin user (if applicable)
      if (tier.showCreateAdmin && tier.childAdminRole) {
        const scope = {};
        if (tier.childAdminRole === 'PROVINCE_ADMIN') scope.provinceId = child._id;
        if (tier.childAdminRole === 'DISTRICT_ADMIN') scope.districtId = child._id;
        if (tier.childAdminRole === 'AREA_ADMIN') scope.areaId = child._id;
        const adminBody = {
          fullName: admin.fullName.trim(),
          password: admin.password,
          role: tier.childAdminRole,
          scope,
        };
        if (admin.email.trim()) adminBody.email = admin.email.trim();
        if (admin.username.trim()) adminBody.username = admin.username.trim();
        try {
          await api.post('/admin/users', adminBody);
        } catch (adminErr) {
          // Child unit was created but admin failed — surface clearly
          toast.error(`${tier.childLabel} created, but admin failed: ${errorMessage(adminErr)}`, { duration: 7000 });
          onCreated?.(child);
          onClose?.();
          return;
        }
      }
      onCreated?.(child);
      onClose?.();
    } catch (e) {
      const msg = errorMessage(e);
      setErr(msg);
      toast.error(msg, { title: `Could not create ${tier.childLabel.toLowerCase()}` });
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="modal-backdrop" onClick={(e) => { if (e.target === e.currentTarget && !busy) onClose?.(); }}>
      <div className="modal" style={{ maxWidth: 560 }} role="dialog" aria-modal="true" aria-label={`Create ${tier.childLabel}`}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
          <h2 style={{ margin: 0 }}>Create {tier.childLabel}</h2>
          <button type="button" className="btn secondary" onClick={() => !busy && onClose?.()}
            style={{ padding: '4px 10px', fontSize: 18, lineHeight: 1 }} aria-label="Close">×</button>
        </div>

        {err && <div className="alert error">{err}</div>}

        <form onSubmit={onSubmit}>
          <h3 className="section-title" style={{ marginTop: 4 }}>{tier.childLabel} details</h3>
          <div className="form-grid">
            <div className="field">
              <label>{tier.childLabel} name *</label>
              <input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required />
            </div>
            <div className="field">
              <label>Code (optional)</label>
              <input value={form.code} onChange={(e) => setForm({ ...form, code: e.target.value })} placeholder="e.g. PB-04" />
            </div>
          </div>

          {tier.showCreateAdmin && (
            <>
              <h3 className="section-title">{tier.childLabel} admin account</h3>
              <p className="muted" style={{ marginTop: 0, fontSize: 13 }}>
                This {tier.childAdminRole.replace('_', ' ').toLowerCase()} will manage all units below.
              </p>
              <div className="form-grid">
                <div className="field">
                  <label>Admin full name *</label>
                  <input value={admin.fullName} onChange={(e) => setAdmin({ ...admin, fullName: e.target.value })} required />
                </div>
                <div className="field">
                  <label>Username</label>
                  <input value={admin.username} onChange={(e) => setAdmin({ ...admin, username: e.target.value })} placeholder="e.g. punjab-admin" />
                </div>
                <div className="field">
                  <label>Email (alternative login)</label>
                  <input type="email" value={admin.email} onChange={(e) => setAdmin({ ...admin, email: e.target.value })} />
                </div>
                <div className="field">
                  <label>Password * (min 6 chars)</label>
                  <input type="password" value={admin.password} onChange={(e) => setAdmin({ ...admin, password: e.target.value })} required minLength={6} />
                </div>
              </div>
              <div className="alert info" style={{ background: 'var(--info-bg)', border: '1px solid var(--info)', color: 'var(--info)', fontSize: 13, padding: 10, borderRadius: 6, marginTop: 8 }}>
                Username OR email is required as the login identifier — at least one.
              </div>
            </>
          )}

          <div style={{ marginTop: 18, display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
            <button className="btn secondary" type="button" onClick={() => !busy && onClose?.()} disabled={busy}>Cancel</button>
            <button className="btn" type="submit" disabled={busy}>
              {busy ? 'Creating…' : `Create ${tier.childLabel}${tier.showCreateAdmin ? ' + Admin' : ''}`}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
