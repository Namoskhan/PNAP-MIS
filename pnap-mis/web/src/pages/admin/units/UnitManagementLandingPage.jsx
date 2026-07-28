import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../../../api/client';
import { useAuth } from '../../../context/AuthContext';
import { hasPermission } from '../../../utils/permissions';
import { BarChartIcon, BuildingIcon, ClipboardIcon, FileTextIcon, RepeatIcon, ScaleIcon, UsersIcon } from '../../../components/icons';

// Landing page at /admin/units — config-overview dashboard. Each
// card shows a count of configured rows for one of the seven Unit
// Management surfaces, plus a link into the editor page.
//
// Counts are best-effort; failures fall through to "—" so a single
// dead endpoint doesn't blank the whole page.
const SURFACES = [
  { key: 'tier-configs', label: 'Unit Type Manager', icon: <BuildingIcon size={20} />,
    description: 'Tier labels, capabilities, body policy, custom fields.',
    path: '/admin/units/tier-configs',
    fetchUrl: '/admin/units/tier-configs',
    countNote: 'tier configs' },
  { key: 'cabinet-templates', label: 'Cabinet Structure', icon: <UsersIcon size={20} />,
    description: 'Cabinet slots per tier — required vs optional, term length.',
    path: '/admin/units/cabinet-templates',
    fetchUrl: '/admin/units/cabinet-templates',
    countNote: 'slot templates' },
  { key: 'policies', label: 'Unit Policies', icon: <ScaleIcon size={20} />,
    description: 'Quorum, finance thresholds, transfer direction rules.',
    path: '/admin/units/policies',
    fetchUrl: '/admin/units/policies',
    countNote: 'policy rows' },
  { key: 'workflows', label: 'Workflow Manager', icon: <RepeatIcon size={20} />,
    description: 'Approval chains for expense / member / role / transfer.',
    path: '/admin/units/workflows',
    fetchUrl: '/admin/units/workflows',
    countNote: 'workflows' },
  { key: 'responsibility-templates', label: 'Responsibility Manager', icon: <ClipboardIcon size={20} />,
    description: 'Auto-assign tasks on meeting/activity events.',
    path: '/admin/units/responsibility-templates',
    fetchUrl: '/admin/units/responsibility-templates',
    countNote: 'task templates' },
  { key: 'performance-rulesets', label: 'Performance Rules', icon: <BarChartIcon size={20} />,
    description: 'Weighted scoring formula for member performance.',
    path: '/admin/units/performance-rulesets',
    fetchUrl: '/admin/units/performance-rulesets',
    countNote: 'rulesets' },
  { key: 'report-templates', label: 'Report Templates', icon: <FileTextIcon size={20} />,
    description: 'Composable PDF / XLSX reports built from sections.',
    path: '/admin/units/report-templates',
    fetchUrl: '/admin/units/report-templates',
    countNote: 'templates' },
];

export default function UnitManagementLandingPage() {
  const { user } = useAuth();
  const canRead = hasPermission(user, 'VIEW_UNIT_CONFIG') || hasPermission(user, 'MANAGE_UNIT_CONFIG');
  const [counts, setCounts] = useState({});
  const [busy, setBusy] = useState(true);

  useEffect(() => {
    if (!canRead) { setBusy(false); return; }
    let cancel = false;
    setBusy(true);
    Promise.all(SURFACES.map((s) =>
      api.get(s.fetchUrl)
        .then((r) => [s.key, (r.data?.data || []).length])
        .catch(() => [s.key, null])
    )).then((entries) => {
      if (cancel) return;
      setCounts(Object.fromEntries(entries));
      setBusy(false);
    });
    return () => { cancel = true; };
  }, [canRead]);

  return (
    <div>
      {/* Hero */}
      <div className="rm-hero">
        <div className="rm-hero-content">
          <div className="rm-hero-icon" aria-hidden="true"><BuildingIcon size={22} /></div>
          <div style={{ flex: 1 }}>
            <h2 className="rm-hero-title">Unit Management</h2>
            <div className="rm-hero-sub">
              Configure how every tier operates — labels, cabinet structure, policies, workflows, scoring, and reports.
            </div>
          </div>
        </div>
      </div>

      {!canRead && (
        <div className="alert error">
          You need <code>VIEW_UNIT_CONFIG</code> or <code>MANAGE_UNIT_CONFIG</code> to view this section.
        </div>
      )}

      {canRead && (
        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))',
          gap: 14,
          marginTop: 12,
        }}>
          {SURFACES.map((s) => {
            const count = counts[s.key];
            return (
              <Link
                key={s.key}
                to={s.path}
                className="rm-card"
                style={{
                  display: 'block',
                  padding: 18,
                  textDecoration: 'none',
                  color: 'inherit',
                  border: '1px solid var(--border)',
                  borderRadius: 12,
                  transition: 'transform .12s ease, box-shadow .12s ease',
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.transform = 'translateY(-2px)';
                  e.currentTarget.style.boxShadow = '0 6px 14px rgba(15, 23, 42, 0.08)';
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.transform = 'translateY(0)';
                  e.currentTarget.style.boxShadow = 'none';
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8 }}>
                  <span style={{ display: 'inline-flex', alignItems: 'center', color: 'var(--primary)' }} aria-hidden="true">{s.icon}</span>
                  <strong style={{ fontSize: 14 }}>{s.label}</strong>
                </div>
                <div className="muted" style={{ fontSize: 13, marginBottom: 12 }}>
                  {s.description}
                </div>
                <div style={{
                  display: 'inline-block',
                  padding: '4px 10px',
                  borderRadius: 999,
                  background: count == null ? 'rgba(148, 163, 184, 0.12)' : 'rgba(30, 64, 175, 0.06)',
                  fontSize: 12,
                  fontWeight: 600,
                }}>
                  {busy ? '…'
                    : count == null ? '—'
                    : `${count} ${s.countNote}`}
                </div>
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}
