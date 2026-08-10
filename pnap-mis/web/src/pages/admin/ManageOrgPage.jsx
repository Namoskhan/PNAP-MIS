import { useEffect, useState } from 'react';
import { api, errorMessage } from '../../api/client';
import { useAuth } from '../../context/AuthContext';
import { useToast } from '../../components/Toast';
import { SkeletonRows } from '../../components/Skeleton';
import { ChevronRightIcon, XIcon } from '../../components/icons';
import PasswordInput from '../../components/PasswordInput';

import dialog from '../../components/dialog';
// Role-aware org-management page. One row per administrative tier,
// each managing exactly the tier directly below it — the same
// one-level rule the server enforces in utils/adminHierarchy.
//   SUPER_ADMIN    → manages Central Admins AND Provinces (create + DELETE)
//   CENTRAL_ADMIN  → manages Provinces, creates Province Admins (no delete)
//   PROVINCE_ADMIN → manages Districts in their province, creates District Admins
//   DISTRICT_ADMIN → manages Areas in their district, creates Area Admins
//   AREA_ADMIN     → manages Basic Units in their area (no admin user needed)

const TIER = {
  // Province management is SHARED between Super Admin and Central
  // Admin, not delegated away from Super Admin. Both create provinces
  // and both see this list; deletion is Super Admin's alone.
  SUPER_ADMIN: {
    level: 'PROVINCE',
    title: 'Manage Provinces',
    subtitle: 'You can create and delete provinces. Central Admins manage everything within them.',
    childLabel: 'Province',
    childPlural: 'Provinces',
    listEndpoint: '/org/provinces',
    createEndpoint: '/org/provinces',
    childAdminRole: 'PROVINCE_ADMIN',
    parentLabel: null,
    showCreateAdmin: true,
  },
  CENTRAL_ADMIN: {
    level: 'PROVINCE',
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
    level: 'DISTRICT',
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
    level: 'AREA',
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
    level: 'BASIC_UNIT',
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

// Super Admin is the only role that can delete an org unit, and it can
// do so at EVERY tier — so it is also the only role that needs to walk
// down the hierarchy on this page. Every other admin keeps its single
// fixed tier above, unchanged.
//
// `parentParam` is both the list filter and the field the create call
// must carry; for Super Admin it comes from the drill trail rather than
// from user.scope, which is empty for an unscoped account.
const SUPER_LEVELS = [
  {
    level: 'PROVINCE', title: 'Manage Provinces',
    subtitle: 'Open a province to see its districts, then its areas, then its basic units. '
      + 'You can create and delete a unit at any tier.',
    childLabel: 'Province', childPlural: 'Provinces',
    listEndpoint: '/org/provinces', createEndpoint: '/org/provinces',
    deleteEndpoint: '/org/provinces',
    parentParam: null, childAdminRole: 'PROVINCE_ADMIN', showCreateAdmin: true,
  },
  {
    level: 'DISTRICT', title: 'Manage Districts',
    childLabel: 'District', childPlural: 'Districts',
    listEndpoint: '/org/districts', createEndpoint: '/org/districts',
    deleteEndpoint: '/org/districts',
    parentParam: 'provinceId', childAdminRole: 'DISTRICT_ADMIN', showCreateAdmin: true,
  },
  {
    level: 'AREA', title: 'Manage Areas',
    childLabel: 'Area', childPlural: 'Areas',
    listEndpoint: '/org/areas', createEndpoint: '/org/areas',
    deleteEndpoint: '/org/areas',
    parentParam: 'districtId', childAdminRole: 'AREA_ADMIN', showCreateAdmin: true,
  },
  {
    level: 'BASIC_UNIT', title: 'Manage Basic Units',
    childLabel: 'Basic Unit', childPlural: 'Basic Units',
    listEndpoint: '/org/basic-units', createEndpoint: '/org/basic-units',
    deleteEndpoint: '/org/basic-units',
    parentParam: 'areaId', childAdminRole: null, showCreateAdmin: false,
  },
];

// Highest tier wins, so a user holding several admin roles gets the
// broadest surface. Order matches adminHierarchy.ADMIN_TIERS.
function pickTier(roles) {
  if (roles.includes('SUPER_ADMIN')) return TIER.SUPER_ADMIN;
  if (roles.includes('CENTRAL_ADMIN')) return TIER.CENTRAL_ADMIN;
  if (roles.includes('PROVINCE_ADMIN')) return TIER.PROVINCE_ADMIN;
  if (roles.includes('DISTRICT_ADMIN')) return TIER.DISTRICT_ADMIN;
  if (roles.includes('AREA_ADMIN')) return TIER.AREA_ADMIN;
  return null;
}

export default function ManageOrgPage() {
  const { user } = useAuth();
  const toast = useToast();
  const isSuper = (user?.roles || []).includes('SUPER_ADMIN');

  // Super Admin walks the hierarchy; every other admin is pinned to the
  // single tier they administer. `trail` is the path drilled so far —
  // [] means the province list.
  const [trail, setTrail] = useState([]);
  const tier = isSuper
    ? SUPER_LEVELS[Math.min(trail.length, SUPER_LEVELS.length - 1)]
    : pickTier(user?.roles || []);
  const parent = trail[trail.length - 1] || null;
  // A basic unit has no children, so it is where drilling stops.
  const canDrill = isSuper && trail.length < SUPER_LEVELS.length - 1;
  // What opening a row reveals — used for the chevron's tooltip.
  const childNoun = canDrill ? SUPER_LEVELS[trail.length + 1].childLabel : '';

  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(false);

  async function load() {
    if (!tier) return;
    setLoading(true);
    try {
      const params = {};
      if (isSuper) {
        // Parent comes from the drill trail — an unscoped Super Admin
        // has nothing in user.scope to read.
        if (tier.parentParam && parent) params[tier.parentParam] = parent.id;
      } else {
        if (tier.parentScopeKey === 'provinceId' && user.scope?.provinceId) params.provinceId = user.scope.provinceId;
        if (tier.parentScopeKey === 'districtId' && user.scope?.districtId) params.districtId = user.scope.districtId;
        if (tier.parentScopeKey === 'areaId' && user.scope?.areaId) params.areaId = user.scope.areaId;
      }
      const r = await api.get(tier.listEndpoint, { params });
      setItems(r.data.data || []);
    } catch (e) {
      toast.error(errorMessage(e));
    } finally {
      setLoading(false);
    }
  }

  // Reloads on drill as well as on login — the trail IS the query.
  useEffect(() => { load(); /* eslint-disable-next-line */ }, [user?.id, trail]);

  // Deleting an org unit is Super Admin's alone, at every tier. The
  // role check matters independently of the tier: a Central Admin sees
  // this same page with the same province list, so gating on tier alone
  // would hand them the button.
  const canDelete = isSuper;
  // Name + Type + Code + Status, plus Actions when deletion is offered.
  const cols = canDelete ? 5 : 4;
  const [deletingId, setDeletingId] = useState(null);

  async function remove(item) {
    const noun = tier.childLabel.toLowerCase();
    if (!await dialog.confirm(
      `Delete the ${noun} "${item.name}"?\n\n`
      + `Its ${noun} admin account will be deleted along with it.\n\n`
      + 'This cannot be undone. It will be refused if anything else still '
      + 'belongs to it — child units, members, cabinet roles, meetings '
      + 'or activities.'
    )) return;
    setDeletingId(item._id);
    try {
      const res = await api.delete(`${tier.deleteEndpoint}/${item._id}`);
      const removed = res.data?.data?.removedAdmins || 0;
      toast.success(
        removed
          ? `${item.name} deleted, along with ${removed} admin account${removed === 1 ? '' : 's'}.`
          : `${item.name} deleted`,
        { title: `${tier.childLabel} removed` }
      );
      load();
    } catch (e) {
      // The server answers 409 with a sentence naming exactly what is
      // still inside, which is far more useful than "delete failed".
      toast.error(errorMessage(e), { title: 'Could not delete', duration: 9000 });
    } finally {
      setDeletingId(null);
    }
  }

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
            {isSuper
              ? (parent ? `Inside ${parent.name}` : 'System-wide')
              : (tier.parentLabel ? `Within your ${tier.parentLabel.toLowerCase()}` : 'System-wide')}
          </div>
          {/* One page title for Super Admin regardless of depth. The
              tier being viewed is already stated by the breadcrumb and
              by the Type column, so retitling the page on every drill
              just made the header flicker between four names. */}
          <h2 style={{ margin: '1px 0 0' }}>{isSuper ? 'Manage Units' : tier.title}</h2>
          {tier.subtitle && !parent && (
            <div style={{ fontSize: 12, color: 'var(--muted)', marginTop: 4 }}>{tier.subtitle}</div>
          )}
          {/* Drill trail. Only Super Admin can move between tiers here,
              so this renders for nobody else. */}
          {isSuper && trail.length > 0 && (
            <div className="dash-crumbs" style={{ marginTop: 6 }}>
              <button type="button" className="dash-crumb" onClick={() => setTrail([])}>
                Pakistan
              </button>
              {trail.map((t, i) => (
                <span key={t.id}>
                  <span className="dash-crumb-sep">/</span>
                  <button
                    type="button"
                    className="dash-crumb"
                    onClick={() => setTrail(trail.slice(0, i + 1))}
                  >
                    {t.name}
                  </button>
                </span>
              ))}
            </div>
          )}
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
        parentId={isSuper ? parent?.id : undefined}
        onCreated={(child) => {
          toast.success(`${child?.name || tier.childLabel} created`, { title: `${tier.childLabel} added` });
          load();
        }}
      />

      <table className="smart">
        <thead>
          <tr>
            <th>Name</th>
            <th>Type</th>
            <th>Code</th>
            <th>Status</th>
            {canDelete && <th style={{ textAlign: 'right' }}>Actions</th>}
          </tr>
        </thead>
        <tbody>
          {loading && <SkeletonRows rows={5} cols={cols} />}
          {!loading && items.length === 0 && (
            <tr>
              <td colSpan={cols} style={{ padding: 0 }}>
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
              <td className="cell-strong">
                {canDrill ? (
                  // The whole name is the control, with a chevron as the
                  // affordance — a row you can open should look openable
                  // before it is hovered.
                  <button
                    type="button"
                    className="unit-drill"
                    onClick={() => setTrail([...trail, { id: it._id, name: it.name, level: tier.level }])}
                    title={`Open ${it.name} — show its ${childNoun.toLowerCase()}s`}
                  >
                    <span>{it.name}</span>
                    <ChevronRightIcon size={15} />
                  </button>
                ) : it.name}
              </td>
              <td>
                <span className={`unit-type ${tier.level || ''}`}>{tier.childLabel}</span>
              </td>
              <td>{it.code || <span className="cell-muted">—</span>}</td>
              <td><span className="badge ACTIVE">{it.isActive === false ? 'Inactive' : 'Active'}</span></td>
              {canDelete && (
                <td style={{ textAlign: 'right' }}>
                  <button
                    type="button"
                    className="btn danger sm"
                    onClick={() => remove(it)}
                    disabled={deletingId === it._id}
                  >
                    {deletingId === it._id ? 'Deleting…' : 'Delete'}
                  </button>
                </td>
              )}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function CreateModal({ open, onClose, tier, user, parentId, onCreated }) {
  const toast = useToast();
  const [form, setForm] = useState({ name: '', code: '' });
  const [admin, setAdmin] = useState({ fullName: '', username: '', email: '', password: '', passwordConfirm: '' });
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');

  useEffect(() => {
    if (!open) return;
    setForm({ name: '', code: '' });
    setAdmin({ fullName: '', username: '', email: '', password: '', passwordConfirm: '' });
    setErr('');
  }, [open]);

  if (!open) return null;

  async function onSubmit(e) {
    e.preventDefault();
    setErr('');
    if (!form.name.trim()) { setErr(`${tier.childLabel} name is required`); return; }
    if (tier.showCreateAdmin) {
      if (!admin.fullName.trim()) { setErr('Admin full name is required'); return; }
      // Email is mandatory: it is the address the account's verification
      // and password-reset mail is sent to, so an admin created without
      // one can never recover its own credentials.
      if (!admin.email.trim()) { setErr('Admin email is required'); return; }
      if (!admin.password || admin.password.length < 6) { setErr('Admin password must be at least 6 characters'); return; }
      if (admin.password !== admin.passwordConfirm) { setErr('Password and confirmation do not match.'); return; }
    }
    setBusy(true);
    try {
      // 1. Create the child unit
      const body = { name: form.name.trim() };
      if (form.code.trim()) body.code = form.code.trim();
      // Inject the parent scope so backend RBAC passes. A drilling
      // Super Admin supplies it explicitly (parentId) because its own
      // user.scope is empty by design; scoped admins read it from
      // their own scope as before.
      const parentKey = tier.parentScopeKey || tier.parentParam;
      if (parentKey) body[parentKey] = parentId || user.scope?.[parentKey];
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
        // passwordConfirm is a form-only field — it is never sent.
        adminBody.email = admin.email.trim();
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
      // Toast only — `err` above is reserved for the field-level
      // validation messages, which must persist while the form is fixed.
      toast.error(errorMessage(e), { title: `Could not create ${tier.childLabel.toLowerCase()}`, duration: 9000 });
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
            style={{ padding: '4px 10px', fontSize: 18, lineHeight: 1 }} aria-label="Close"><XIcon size={16} /></button>
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
                  <label>Email *</label>
                  <input
                    type="email"
                    value={admin.email}
                    onChange={(e) => setAdmin({ ...admin, email: e.target.value })}
                    required
                    autoComplete="email"
                  />
                </div>
                <div className="field">
                  <label htmlFor="org-admin-pw">Password * (min 6 chars)</label>
                  <PasswordInput
                    id="org-admin-pw"
                    value={admin.password}
                    onChange={(e) => setAdmin({ ...admin, password: e.target.value })}
                    required
                    minLength={6}
                  />
                </div>
                <div className="field">
                  <label htmlFor="org-admin-pw2">Confirm Password *</label>
                  <PasswordInput
                    id="org-admin-pw2"
                    value={admin.passwordConfirm}
                    onChange={(e) => setAdmin({ ...admin, passwordConfirm: e.target.value })}
                    required
                    minLength={6}
                    placeholder="Re-enter password"
                  />
                  {/* Mismatch is caught on submit as well; this is the
                      immediate feedback so it is not a surprise later. */}
                  {admin.passwordConfirm && admin.password !== admin.passwordConfirm && (
                    <div className="error" style={{ fontSize: 12, marginTop: 4 }}>
                      Password and confirmation do not match.
                    </div>
                  )}
                </div>
              </div>
              <div className="alert info" style={{ background: 'var(--info-bg)', border: '1px solid var(--info)', color: 'var(--info)', fontSize: 13, padding: 10, borderRadius: 6, marginTop: 8 }}>
                Email is the login identifier and receives verification and
                password-reset mail. A username may be added as an optional
                second way to sign in.
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
