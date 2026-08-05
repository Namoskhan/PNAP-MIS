import SmartKpi from '../SmartKpi';
import { SkeletonKpiGrid } from '../Skeleton';
import {
  UsersIcon, CheckIcon, MinusCircleIcon, GlobeIcon, BuildingIcon,
  FolderIcon, ShieldIcon, CalendarIcon, TargetIcon, ClipboardIcon, ZapIcon,
} from '../icons';

// Section 1 — always expanded, sticky. The numbers an executive should
// see without expanding anything.
//
// Grouped into three bands (membership / structure / operations) with
// a divider between, so seventeen figures still scan as three ideas
// rather than one wall.

function Band({ label, children }) {
  return (
    <div style={{ marginBottom: 12 }}>
      <div className="muted" style={{
        fontSize: 11, fontWeight: 600, letterSpacing: '.04em',
        textTransform: 'uppercase', marginBottom: 7,
      }}>
        {label}
      </div>
      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fit, minmax(185px, 1fr))',
        gap: 10,
      }}>
        {children}
      </div>
    </div>
  );
}

const num = (v) => (v ?? 0).toLocaleString();

export default function ExecutiveSummary({ data, loading, windowLabel }) {
  if (loading && !data) return <SkeletonKpiGrid count={8} />;
  if (!data) {
    return (
      <div className="empty-smart" style={{ padding: '28px 16px' }}>
        <div className="empty-icon">📈</div>
        <p style={{ margin: 0 }}>No summary available for this scope.</p>
      </div>
    );
  }

  const m = data.membership;
  const o = data.organization;
  const mt = data.meetings;
  const c = data.campaigns;
  const r = data.reports;

  return (
    <>
      <Band label={`Membership · ${windowLabel}`}>
        <SmartKpi
          label="Total Members" value={m.total}
          icon={<UsersIcon size={14} />}
          iconBg="var(--primary-tint)" iconColor="var(--primary)"
        />
        <SmartKpi
          label="New Members" value={m.newMembers}
          icon={<ZapIcon size={14} />}
          iconBg="var(--primary-tint)" iconColor="var(--primary)"
        />
        <SmartKpi
          label="Active Members" value={m.active}
          icon={<CheckIcon size={14} />}
          iconBg="var(--success-bg)" iconColor="var(--success)"
          format={(v) => `${num(v)} (${m.activePct}%)`}
        />
        <SmartKpi
          label="Inactive Members" value={m.inactive}
          icon={<MinusCircleIcon size={14} />}
          iconBg="var(--surface-alt)" iconColor="var(--muted)"
        />
      </Band>

      <Band label="Organization">
        <SmartKpi
          label="Total Provinces" value={o.provinces.total}
          icon={<GlobeIcon size={14} />}
          iconBg="var(--primary-tint)" iconColor="var(--primary)"
        />
        <SmartKpi
          label="Total Districts" value={o.districts.total}
          icon={<BuildingIcon size={14} />}
          iconBg="var(--primary-tint)" iconColor="var(--primary)"
        />
        <SmartKpi
          label="Total Areas" value={o.areas.total}
          icon={<FolderIcon size={14} />}
          iconBg="var(--primary-tint)" iconColor="var(--primary)"
        />
        <SmartKpi
          label="Total Basic Units" value={o.basicUnits.total}
          icon={<ShieldIcon size={14} />}
          iconBg="var(--primary-tint)" iconColor="var(--primary)"
        />
        <SmartKpi
          label="Active Units" value={o.basicUnits.active}
          icon={<CheckIcon size={14} />}
          iconBg="var(--success-bg)" iconColor="var(--success)"
        />
        <SmartKpi
          label="Inactive Units" value={o.basicUnits.inactive}
          icon={<MinusCircleIcon size={14} />}
          iconBg="var(--surface-alt)" iconColor="var(--muted)"
        />
      </Band>

      <Band label={`Operations · ${windowLabel}`}>
        <SmartKpi
          label="Total Meetings" value={mt.total}
          icon={<CalendarIcon size={14} />}
          iconBg="var(--primary-tint)" iconColor="var(--primary)"
        />
        <SmartKpi
          label="Conducted Meetings" value={mt.conducted}
          icon={<CheckIcon size={14} />}
          iconBg="var(--success-bg)" iconColor="var(--success)"
        />
        <SmartKpi
          label="Scheduled Meetings" value={mt.scheduled}
          icon={<CalendarIcon size={14} />}
          iconBg="var(--warning-bg)" iconColor="var(--warning)"
        />
        <SmartKpi
          label="Running Campaigns" value={c.running}
          icon={<TargetIcon size={14} />}
          iconBg="var(--primary-tint)" iconColor="var(--primary)"
        />
        {/* Reports here are MEETING reports — filed by finalizing the
            meeting. Nothing in this system assigns a report to a
            person, so there is no pending/completed queue to show. */}
        <SmartKpi
          label="Reports Outstanding" value={r.outstanding}
          icon={<ClipboardIcon size={14} />}
          iconBg="var(--warning-bg)" iconColor="var(--warning)"
        />
        <SmartKpi
          label="Reports Filed" value={r.filed}
          icon={<CheckIcon size={14} />}
          iconBg="var(--success-bg)" iconColor="var(--success)"
        />
      </Band>
    </>
  );
}
