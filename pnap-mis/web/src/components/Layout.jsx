import { useEffect, useRef, useState } from 'react';
import { NavLink, Outlet, Link, useLocation } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { useUnit } from '../context/UnitContext';
import {
  isHigherAdmin,
  isAreaAdminOnly,
  isOperatorPersona,
  isPresidentPersona,
  isProvinceAdminOnly,
  isCentralAdminOnly,
  isDistrictAdminOnly,
  isSuperAdmin as isSuperAdminFn,
  isSecretaryOnly,
  isFinanceOnly,
  isPureMember,
  roleLabel,
  hasPermission,
} from '../utils/permissions';
import NotificationBell from './NotificationBell';
import { useBranding } from '../context/BrandingContext';
import {
  UsersIcon, FolderIcon, BuildingIcon, GearIcon,
  UserIcon, PowerIcon, MenuIcon, ChevronLeftIcon, ChevronRightIcon,
  CommitteeIcon, JirgaIcon, CongressIcon,
} from './icons';

const SIDEBAR_KEY = 'pnap_sidebar_collapsed';

// Human-readable label for the role-persona selector.
const ROLE_DISPLAY = {
  SUPER_ADMIN: 'Super Admin',
  CENTRAL_ADMIN: 'Central Admin',
  PROVINCE_ADMIN: 'Province Admin',
  DISTRICT_ADMIN: 'District Admin',
  AREA_ADMIN: 'Area Admin',
  SECRETARY: 'Secretary',
  SENIOR_MAWIN: 'Senior Mawin Sec.',
  FINANCE_SECRETARY: 'Finance Secretary',
  PRESS_SECRETARY: 'Press Secretary',
  CULTURE_SECRETARY: 'Culture Secretary',
  SPORTS_SECRETARY: 'Sports Secretary',
  PRESIDENT: 'President / Saddar',
  SR_VICE_PRESIDENT: 'Senior Vice President',
  VICE_PRESIDENT: 'Vice President',
  GENERAL_SECRETARY: 'General Secretary',
  CHAIRMAN: 'Chairman',
  CO_CHAIRMAN: 'Co-Chairman',
  SR_VICE_CHAIRMAN: 'Sr. Vice Chairman',
  VICE_CHAIRMAN: 'Vice Chairman',
  FIRST_SECRETARY: 'First Secretary',
  OTHER: 'Other',
  MEMBER: 'Member',
};

// SRS §3.1–§3.4 — the wider consultative body's name changes per tier.
function committeeLabel(unitLevel) {
  if (unitLevel === 'AREA') return 'Elaqayi Committee';
  if (unitLevel === 'DISTRICT') return 'Zilla Committee';
  if (unitLevel === 'PROVINCE') return 'Sobayi Committee';
  if (unitLevel === 'CENTRAL') return 'Central Committee';
  return '';
}

// A unit nav entry that is body-aware.
//
// Meetings / Activities / Finance / Transfers each appear TWICE in the
// sidebar now — once plain (Executive) and once under the Committee
// group with `?body=COMMITTEE`. NavLink matches on pathname alone, so
// without this both would light up at once. Same problem, and the same
// fix, as the /admin/users?role=CENTRAL_ADMIN pair.
//
// `body={null}` is the plain entry. It stays active for a bare URL AND
// for ?body=EXECUTIVE, because the pages themselves treat a missing
// param as Executive — so a dashboard link carrying the explicit
// param still highlights the entry it belongs to.
function UnitNavLink({ to, body = null, children }) {
  const { search } = useLocation();
  const norm = (v) => (v === 'COMMITTEE' ? 'COMMITTEE' : (v === 'JIRGA' ? 'JIRGA' : (v === 'CONGRESS' ? 'CONGRESS' : 'EXECUTIVE')));
  const current = norm(new URLSearchParams(search).get('body'));
  const target = body ? `${to}?body=${body}` : to;
  return (
    <NavLink
      to={target}
      className={({ isActive }) => (isActive && current === norm(body) ? 'active' : undefined)}
    >
      {children}
    </NavLink>
  );
}

// The Committee hub — one collapsible group holding every surface of
// the wider body, each pinned to ?body=COMMITTEE. Basic Units have no
// committee (SRS §3.1, and `committeeController.composition` rejects
// that level outright), so the whole group is hidden there.
function CommitteeNav({ ctx, canFinance, showEvents = true, defaultOpen = true }) {
  if (!ctx || ctx.unitLevel === 'BASIC_UNIT') return null;
  const label = committeeLabel(ctx.unitLevel);
  if (!label) return null;
  return (
    <NavGroup
      label={label}
      icon={<CommitteeIcon size={14} />}
      variant="committee"
      storageKey="pnap_nav_committee"
      defaultOpen={defaultOpen}
    >
      <UnitNavLink to="/unit/committee">Composition</UnitNavLink>
      {showEvents && <UnitNavLink to="/unit/meetings" body="COMMITTEE">Committee Meetings</UnitNavLink>}
      {showEvents && <UnitNavLink to="/unit/activities" body="COMMITTEE">Committee Activities</UnitNavLink>}
      {canFinance && <UnitNavLink to="/unit/finance" body="COMMITTEE">Committee Finance</UnitNavLink>}
      {canFinance && <UnitNavLink to="/unit/transfers" body="COMMITTEE">Committee Transfers</UnitNavLink>}
      {/* Committee-scoped reports — downloads filtered to the committee body */}
      <UnitNavLink to="/unit/reports" body="COMMITTEE">Committee Reports</UnitNavLink>
    </NavGroup>
  );
}

// The Jirga hub — dedicated collapsible group for Qomi Jirga (Central)
// and Sobayi Jirga (Province), each pinned to ?body=JIRGA.
function JirgaNav({ ctx, canFinance, showEvents = true, defaultOpen = false }) {
  if (!ctx || (ctx.unitLevel !== 'CENTRAL' && ctx.unitLevel !== 'PROVINCE')) return null;
  const label = ctx.unitLevel === 'CENTRAL' ? 'Qomi Jirga' : 'Sobayi Jirga';
  return (
    <NavGroup
      label={label}
      icon={<JirgaIcon size={14} />}
      variant="jirga"
      storageKey={`pnap_nav_jirga_${ctx.unitLevel.toLowerCase()}`}
      defaultOpen={defaultOpen}
    >
      <UnitNavLink to="/unit/jirga">Composition</UnitNavLink>
      {showEvents && <UnitNavLink to="/unit/meetings" body="JIRGA">Jirga Meetings</UnitNavLink>}
      {showEvents && <UnitNavLink to="/unit/activities" body="JIRGA">Jirga Activities</UnitNavLink>}
      {canFinance && <UnitNavLink to="/unit/finance" body="JIRGA">Jirga Finance</UnitNavLink>}
      {canFinance && <UnitNavLink to="/unit/transfers" body="JIRGA">Jirga Transfers</UnitNavLink>}
      <UnitNavLink to="/unit/reports" body="JIRGA">Jirga Reports</UnitNavLink>
    </NavGroup>
  );
}

// National Congress hub — supreme assembly at Central level.
function CongressNav({ ctx, canFinance, showEvents = true, defaultOpen = false }) {
  if (!ctx || ctx.unitLevel !== 'CENTRAL') return null;
  return (
    <NavGroup
      label="National Congress"
      icon={<CongressIcon size={14} />}
      variant="congress"
      storageKey="pnap_nav_congress"
      defaultOpen={defaultOpen}
    >
      <UnitNavLink to="/unit/congress">Congress Roster</UnitNavLink>
      {showEvents && <UnitNavLink to="/unit/meetings" body="CONGRESS">Congress Meetings</UnitNavLink>}
      {showEvents && <UnitNavLink to="/unit/activities" body="CONGRESS">Congress Activities</UnitNavLink>}
      {canFinance && <UnitNavLink to="/unit/finance" body="CONGRESS">Congress Finance</UnitNavLink>}
      <UnitNavLink to="/unit/reports" body="CONGRESS">Congress Reports</UnitNavLink>
    </NavGroup>
  );
}

export default function Layout() {
  // Two sidebar entries share /admin/users and are distinguished only
  // by their query string, so active-state has to consider it —
  // NavLink matches on pathname alone.
  const { search, pathname } = useLocation();
  const { user, logout, allRoles, activeRole, setActiveRole } = useAuth();
  const { ctx } = useUnit();
  const branding = useBranding();
  // Sidebar collapse — persisted in localStorage so the choice
  // sticks across reloads. If the user has never made a choice,
  // fall back to the admin-controlled `sidebarDefaultCollapsed`
  // dashboard preference (per-user pref still wins once set).
  const [collapsed, setCollapsed] = useState(() => {
    const stored = localStorage.getItem(SIDEBAR_KEY);
    if (stored === '1') return true;
    if (stored === '0') return false;
    return !!branding?.dashboard?.sidebarDefaultCollapsed;
  });
  // If the dashboard preference loads AFTER the initial render
  // (public-branding fetch is async) and the user still has no
  // localStorage preference, sync to the loaded default.
  useEffect(() => {
    const stored = localStorage.getItem(SIDEBAR_KEY);
    if (stored === '1' || stored === '0') return;
    const want = !!branding?.dashboard?.sidebarDefaultCollapsed;
    setCollapsed((prev) => (prev !== want ? want : prev));
  }, [branding?.dashboard?.sidebarDefaultCollapsed]);
  function toggleSidebar() {
    setCollapsed((c) => {
      const next = !c;
      try { localStorage.setItem(SIDEBAR_KEY, next ? '1' : '0'); } catch {}
      return next;
    });
  }

  // Persona detection — single source of truth in utils/permissions.js.
  // Each "isFoo" mirrors the precise sidebar branch ordering used
  // below (Super → National → Area Admin → Operator (SM/1stSec) →
  // Secretary → District / Province / Central Admin → Finance →
  // Member → President-style → fallback).
  const isSuperAdmin = isSuperAdminFn(user);
  const isAreaAdmin = isAreaAdminOnly(user);
  const isSeniorMawin = isOperatorPersona(user);
  const isSecretary = isSecretaryOnly(user);
  const isDistrictAdmin = isDistrictAdminOnly(user);
  const isProvinceAdmin = isProvinceAdminOnly(user);
  const isCentralAdmin = isCentralAdminOnly(user);
  const isFinanceSecretary = isFinanceOnly(user);
  const isMember = isPureMember(user);
  const isPresident = isPresidentPersona(user);
  // Used to gate the broad Member / Register Member surface — kept
  // for parity with the original sidebar comments.
  const hasHigherAdmin = isHigherAdmin(user);

  // Capability gates for nav items. These read the LIVE permission
  // set (already narrowed by View-As), so revoking a permission from
  // a role hides its surfaces for every holder — persona branches
  // alone are role-code based and kept showing links the holder
  // could no longer use.
  const canFinance = hasPermission(user, 'MANAGE_FINANCE') || hasPermission(user, 'APPROVE_EXPENSE');
  const canRegister = hasPermission(user, 'REGISTER_MEMBER');
  const canApproveMembers = hasPermission(user, 'APPROVE_MEMBER');

  return (
    <div className="app-shell">
      <aside className={`sidebar ${collapsed ? 'collapsed' : ''}`}>
        <button
          className={`sidebar-toggle ${collapsed ? 'collapsed' : 'open'}`}
          onClick={toggleSidebar}
          title={collapsed ? 'Open sidebar' : 'Collapse sidebar'}
          aria-label={collapsed ? 'Open sidebar' : 'Collapse sidebar'}
        >
          {collapsed ? <MenuIcon /> : <ChevronLeftIcon />}
        </button>
        {/* Sidebar brand. Reads from BrandingContext so admin
            edits to identity.shortName show up here on next focus
            without a hard reload. Falls back to 'PKNAP' if
            branding hasn't loaded yet. */}
        <h1>{branding.identity?.shortName || 'PKNAP'}</h1>

        {isSuperAdmin && (
          <>
            <div className="nav-group">God Mode</div>
            <nav>
              <NavLink to="/" end>Dashboard</NavLink>
              {/* Lands on the user directory pre-filtered to the tier
                  Super Admin is responsible for; the create action for
                  this role lives there too, since a Central Admin has
                  no org unit to be created alongside. */}
              <NavLink
                to="/admin/users?role=CENTRAL_ADMIN"
                className={({ isActive }) => (
                  isActive && search.includes('role=CENTRAL_ADMIN') ? 'active' : undefined
                )}
              >Central Admins</NavLink>
              {/* Province management is SHARED with the Central Admin,
                  not delegated away from Super Admin. Both tiers create
                  provinces; only Super Admin can delete one, and only
                  Super Admin can walk the whole hierarchy from here —
                  hence "Units" rather than "Provinces". */}
              <NavLink to="/admin/manage-org">Manage Units</NavLink>
              <NavLink to="/members">All Members</NavLink>
              <NavLink to="/admin/pending-approvals">Pending Role Approvals</NavLink>
              <NavLink to="/admin/finance-overview">Finance Overview</NavLink>
            </nav>
            <NavGroup label="User Manager" icon={<UsersIcon size={14} />} storageKey="pnap_nav_user_manager" defaultOpen>
              <NavLink to="/admin/roles">Role Management</NavLink>
              {/* Same page as the Central Admins entry above but with
                  no role filter — so its active state must exclude the
                  filtered URL, otherwise both light up at once. */}
              <NavLink
                to="/admin/users"
                className={({ isActive }) => (isActive && !search ? 'active' : undefined)}
              >All Users &amp; Credentials</NavLink>
              <NavLink to="/admin/audit">Audit Log</NavLink>
            </NavGroup>
            <NavGroup label="Event Manager" icon={<FolderIcon size={14} />} storageKey="pnap_nav_event_manager">
              <NavLink to="/admin/events/meeting-types">Meeting Types</NavLink>
              <NavLink to="/admin/events/activity-types">Activity Types</NavLink>
              <NavLink to="/admin/events/fields">Field Library</NavLink>
            </NavGroup>
            <NavGroup label="Unit Management" icon={<BuildingIcon size={14} />} storageKey="pnap_nav_unit_mgmt">
              <NavLink to="/admin/units" end>Overview</NavLink>
              <NavLink to="/admin/units/tier-configs">Unit Type Manager</NavLink>
              <NavLink to="/admin/units/cabinet-templates">Cabinet Structure</NavLink>
              <NavLink to="/admin/units/policies">Unit Policies</NavLink>
              <NavLink to="/admin/units/workflows">Workflow Manager</NavLink>
              <NavLink to="/admin/units/responsibility-templates">Responsibility Manager</NavLink>
              <NavLink to="/admin/units/performance-rulesets">Performance Rules</NavLink>
              <NavLink to="/admin/units/report-templates">Report Templates</NavLink>
            </NavGroup>
            <NavGroup label="Settings" icon={<GearIcon size={14} />} storageKey="pnap_nav_settings">
              <NavLink to="/admin/settings" end>Branding Overview</NavLink>
              <NavLink to="/admin/settings/identity">System Identity</NavLink>
              <NavLink to="/admin/settings/logos">Logo Manager</NavLink>
              <NavLink to="/admin/settings/theme">Theme Manager</NavLink>
              <NavLink to="/admin/settings/typography">Typography</NavLink>
              <NavLink to="/admin/settings/dashboard">UI Preferences</NavLink>
              <NavLink to="/admin/settings/reports">Report Branding</NavLink>
              <NavLink to="/admin/settings/login">Login Customization</NavLink>
              <NavLink to="/admin/settings/history">Settings History</NavLink>
            </NavGroup>
            <div className="nav-group">Central Tier</div>
            <nav>
              <NavLink to="/unit" end>Central Dashboard</NavLink>
              <NavLink to="/unit/cabinet">Central Cabinet</NavLink>
              <NavLink to="/unit/congress">National Congress</NavLink>
              <UnitNavLink to="/unit/meetings">Central Meetings</UnitNavLink>
              <UnitNavLink to="/unit/activities">Central Activities</UnitNavLink>
              <NavLink to="/unit/responsibilities">Central Responsibilities</NavLink>
              <UnitNavLink to="/unit/finance">Central Finance</UnitNavLink>
              <UnitNavLink to="/unit/transfers">Central Fund Transfers</UnitNavLink>
              <UnitNavLink to="/unit/reports">Central Reports</UnitNavLink>
            </nav>
            <CongressNav ctx={{ unitLevel: 'CENTRAL', unitId: 'CENTRAL', unitName: 'Central' }} canFinance={true} defaultOpen={false} />
            <JirgaNav ctx={{ unitLevel: 'CENTRAL', unitId: 'CENTRAL', unitName: 'Central' }} canFinance={true} defaultOpen={false} />
            {/* Super Admin removed from Committee group per request. */}
          </>
        )}


        {isAreaAdmin && (
          <>
            <div className="nav-group">My Area</div>
            <nav>
              <NavLink to="/unit" end>Dashboard</NavLink>
              <NavLink to="/admin/manage-org">Manage Basic Units</NavLink>
              <NavLink to="/members/pending" end>Member Approvals</NavLink>
              {/* "/members" is a prefix of "/members/pending", so a plain
                  NavLink lights up alongside Member Approvals. Stay active
                  on the list + member detail pages, but never on /pending. */}
              <NavLink
                to="/members"
                className={({ isActive }) => (
                  isActive && pathname !== '/members/pending' ? 'active' : undefined
                )}
              >All Members</NavLink>
              <NavLink to="/unit/cabinet">Assign Cabinet Roles</NavLink>
              <NavLink to="/unit/responsibilities">Responsibilities</NavLink>
            </nav>
          </>
        )}

        {isCentralAdmin && (
          <>
            <div className="nav-group">My Organization</div>
            <nav>
              <NavLink to="/unit" end>Dashboard</NavLink>
              <NavLink to="/admin/manage-org">Manage Provinces</NavLink>
              <NavLink to="/members">Province Members</NavLink>
              <NavLink to="/unit/cabinet">Assign Province Cabinet Roles</NavLink>
              <NavLink to="/unit/responsibilities">Responsibilities</NavLink>
              <NavLink to="/unit/breakdown">Province Breakdown</NavLink>
              <UnitNavLink to="/unit/reports">Reports</UnitNavLink>
            </nav>
            <CongressNav ctx={ctx} canFinance={canFinance} defaultOpen={false} />
            <JirgaNav ctx={ctx} canFinance={canFinance} defaultOpen={false} />
          </>
        )}

        {isDistrictAdmin && (
          <>
            <div className="nav-group">My District</div>
            <nav>
              <NavLink to="/unit" end>Dashboard</NavLink>
              <NavLink to="/admin/manage-org">Manage Areas</NavLink>
              <NavLink to="/members">Members</NavLink>
              <NavLink to="/unit/cabinet">Assign Area Cabinet Roles</NavLink>
              <NavLink to="/unit/responsibilities">Responsibilities</NavLink>
              <NavLink to="/unit/breakdown">Area Breakdown</NavLink>
              <UnitNavLink to="/unit/reports">Reports</UnitNavLink>
            </nav>
          </>
        )}

        {isProvinceAdmin && (
          <>
            <div className="nav-group">My Province</div>
            <nav>
              <NavLink to="/unit" end>Dashboard</NavLink>
              <NavLink to="/admin/manage-org">Manage Districts</NavLink>
              <NavLink to="/members">All Province Members</NavLink>
              <NavLink to="/unit/cabinet">Assign District Cabinet Roles</NavLink>
              <NavLink to="/unit/responsibilities">Responsibilities</NavLink>
              <NavLink to="/unit/breakdown">District Breakdown</NavLink>
              <UnitNavLink to="/unit/reports">Reports</UnitNavLink>
            </nav>
            <JirgaNav ctx={ctx} canFinance={canFinance} defaultOpen={false} />
          </>
        )}

        {isSeniorMawin && (
          <>
            <div className="nav-group">
              {ctx ? `${ctx.unitLevel.replace('_', ' ')} · ${ctx.unitName}` : 'Unit'}
            </div>
            <nav>
              <NavLink to="/unit" end>Dashboard</NavLink>
              <NavLink to="/unit/cabinet">Cabinet & Roles</NavLink>
              <UnitNavLink to="/unit/meetings">Meetings</UnitNavLink>
              <UnitNavLink to="/unit/activities">Activities</UnitNavLink>
              <NavLink to="/unit/responsibilities">Responsibilities</NavLink>
              {canFinance && <UnitNavLink to="/unit/finance">Finance</UnitNavLink>}
              {canFinance && <UnitNavLink to="/unit/transfers">Fund Transfers</UnitNavLink>}
              <NavLink to="/unit/performance">Member Performance</NavLink>
              <UnitNavLink to="/unit/reports">Reports</UnitNavLink>
            </nav>
            <CommitteeNav ctx={ctx} canFinance={canFinance} defaultOpen={false} />
            <CongressNav ctx={ctx} canFinance={canFinance} defaultOpen={false} />
            <JirgaNav ctx={ctx} canFinance={canFinance} defaultOpen={false} />
          </>
        )}

        {isSecretary && (
          <>
            <div className="nav-group">
              {ctx ? `${ctx.unitLevel.replace('_', ' ')} · ${ctx.unitName}` : 'Unit'}
            </div>
            <nav>
              <NavLink to="/unit" end>Dashboard</NavLink>
              <NavLink to="/members">Members</NavLink>
              <NavLink to="/unit/cabinet">Cabinet</NavLink>
              <UnitNavLink to="/unit/meetings">Meetings</UnitNavLink>
              <UnitNavLink to="/unit/activities">Activities</UnitNavLink>
              <NavLink to="/unit/responsibilities">Responsibilities</NavLink>
              <NavLink to="/unit/performance">Member Performance</NavLink>
              {canFinance && <UnitNavLink to="/unit/finance">Finance Summary</UnitNavLink>}
              <UnitNavLink to="/unit/reports">Reports</UnitNavLink>
            </nav>
            {/* Secretary saw the committee at AREA, DISTRICT, PROVINCE, CENTRAL. */}
            {ctx && ctx.unitLevel !== 'BASIC_UNIT' && (
              <CommitteeNav ctx={ctx} canFinance={canFinance} />
            )}
            <CongressNav ctx={ctx} canFinance={canFinance} />
            <JirgaNav ctx={ctx} canFinance={canFinance} />
          </>
        )}

        {isFinanceSecretary && (
          <>
            <div className="nav-group">
              {ctx ? `${ctx.unitLevel.replace('_', ' ')} · ${ctx.unitName}` : 'Unit'}
            </div>
            <nav>
              <NavLink to={user?.canViewExecutiveDashboard ? '/' : '/unit'} end>
                {user?.canViewExecutiveDashboard ? 'Central Dashboard' : 'Dashboard'}
              </NavLink>
              {canFinance && <UnitNavLink to="/unit/finance">Finance</UnitNavLink>}
              {canFinance && <UnitNavLink to="/unit/transfers">Fund Transfers</UnitNavLink>}
              {/* Not gated on MANAGE_MEETINGS: this persona cannot ASSIGN
                  a responsibility, but a Senior Mawin can assign one TO
                  them, and they need a way to open it and mark it done.
                  The page hides every write control by itself. */}
              <NavLink to="/unit/responsibilities">My Responsibilities</NavLink>
              {ctx && ctx.unitLevel !== 'BASIC_UNIT' && (
                <NavLink to="/unit/breakdown">Subordinate Breakdown</NavLink>
              )}
              <UnitNavLink to="/unit/reports">Reports</UnitNavLink>
            </nav>
            {/* The Finance Secretary keeps the unit's books for Executive, Committee, Jirga, and Congress bodies */}
            <CommitteeNav ctx={ctx} canFinance={canFinance} showEvents={false} />
            <CongressNav ctx={ctx} canFinance={canFinance} showEvents={false} />
            <JirgaNav ctx={ctx} canFinance={canFinance} showEvents={false} />
          </>
        )}

        {isMember && (
          <>
            <div className="nav-group">My Unit</div>
            <nav>
              <NavLink to="/" end>My Dashboard</NavLink>
              {/* No committee group for a pure member, but these stay
                  body-aware so the entry doesn't stay lit if one lands
                  on a ?body=COMMITTEE URL from elsewhere. */}
              <UnitNavLink to="/unit/meetings">Meetings</UnitNavLink>
              <UnitNavLink to="/unit/activities">Activities</UnitNavLink>
              <NavLink to="/unit/responsibilities">My Responsibilities</NavLink>
              {user?.memberId && (
                <NavLink to={`/members/${user.memberId}`}>My Profile</NavLink>
              )}
            </nav>
          </>
        )}

        {isPresident && (
          <>
            <div className="nav-group">
              {ctx ? `${ctx.unitLevel.replace('_', ' ')} · ${ctx.unitName}` : 'Province'}
            </div>
            <nav>
              <NavLink to={user?.canViewExecutiveDashboard ? '/' : '/unit'} end>
                {user?.canViewExecutiveDashboard ? 'Central Dashboard' : 'Dashboard'}
              </NavLink>
              <NavLink to="/members">Members</NavLink>
              <NavLink to="/unit/cabinet">Cabinet & Roles</NavLink>
              <UnitNavLink to="/unit/meetings">Meetings</UnitNavLink>
              <UnitNavLink to="/unit/activities">Activities</UnitNavLink>
              <NavLink to="/unit/responsibilities">Responsibilities</NavLink>
              {canFinance && <UnitNavLink to="/unit/finance">Finance</UnitNavLink>}
              {canFinance && <UnitNavLink to="/unit/transfers">Fund Transfers</UnitNavLink>}
              <NavLink to="/unit/performance">Member Performance</NavLink>
              <UnitNavLink to="/unit/reports">Reports</UnitNavLink>
            </nav>
            <CommitteeNav ctx={ctx} canFinance={canFinance} />
            <CongressNav ctx={ctx} canFinance={canFinance} />
            <JirgaNav ctx={ctx} canFinance={canFinance} />
          </>
        )}

        {!isSuperAdmin && !isCentralAdmin && !isAreaAdmin && !isSeniorMawin && !isSecretary && !isFinanceSecretary && !isDistrictAdmin && !isProvinceAdmin && !isMember && !isPresident && (
          <>
            {user?.canViewExecutiveDashboard ? (
              <>
                <div className="nav-group">CENTRAL · PKNAP CENTRAL</div>
                <nav>
                  <NavLink to="/" end>Central Dashboard</NavLink>
                  <NavLink to="/members">Members</NavLink>
                  {canRegister && <NavLink to="/members/new">Register Member</NavLink>}
                  {canApproveMembers && <NavLink to="/members/pending">Approval Queue</NavLink>}
                  <NavLink to="/unit/cabinet">Cabinet & Roles</NavLink>
                  <UnitNavLink to="/unit/meetings">Meetings</UnitNavLink>
                  <UnitNavLink to="/unit/activities">Activities</UnitNavLink>
                  <NavLink to="/unit/responsibilities">Responsibilities</NavLink>
                  <NavLink to="/unit/performance">Member Performance</NavLink>
                  {canFinance && <UnitNavLink to="/unit/finance">Finance</UnitNavLink>}
                  {canFinance && <UnitNavLink to="/unit/transfers">Fund Transfers</UnitNavLink>}
                  <UnitNavLink to="/unit/reports">Reports</UnitNavLink>
                </nav>
              </>
            ) : (
              <>
                <div className="nav-group">
                  {ctx ? `${ctx.unitLevel.replace('_', ' ')} · ${ctx.unitName}` : 'Unit'}
                </div>
                <nav>
                  <NavLink to="/unit" end>Dashboard</NavLink>
                  <NavLink to="/members">Members</NavLink>
                  {canRegister && <NavLink to="/members/new">Register Member</NavLink>}
                  {canApproveMembers && <NavLink to="/members/pending">Approval Queue</NavLink>}
                  <NavLink to="/unit/cabinet">Cabinet & Roles</NavLink>
                  <UnitNavLink to="/unit/meetings">Meetings</UnitNavLink>
                  <UnitNavLink to="/unit/activities">Activities</UnitNavLink>
                  <NavLink to="/unit/responsibilities">Responsibilities</NavLink>
                  <NavLink to="/unit/performance">Member Performance</NavLink>
                  {canFinance && <UnitNavLink to="/unit/finance">Finance</UnitNavLink>}
                  {canFinance && <UnitNavLink to="/unit/transfers">Fund Transfers</UnitNavLink>}
                  <UnitNavLink to="/unit/reports">Reports</UnitNavLink>
                  {ctx && ctx.unitLevel !== 'BASIC_UNIT' && (
                    <NavLink to="/unit/breakdown">Subordinate Breakdown</NavLink>
                  )}
                </nav>
              </>
            )}
            <CommitteeNav ctx={ctx} canFinance={canFinance} />
            <CongressNav ctx={ctx} canFinance={canFinance} />
            <JirgaNav ctx={ctx} canFinance={canFinance} />
          </>
        )}

        {/* Communication — visible to every authenticated persona */}
        <div className="nav-group">Communication</div>
        <nav>
          <NavLink to="/notifications">Notifications</NavLink>
          <NavLink to="/announcements">Announcements</NavLink>
        </nav>

      </aside>
      <div className="main-col">
        {user && (
          <header className="topbar">
            <div className="topbar-spacer" aria-hidden="true" />
            {(() => {
              // Show the persona switcher whenever the user holds more
              // than one role INCLUDING the base member portal — a
              // custom-role holder (e.g. MEMBER + CUSTOM_X) needs it to
              // move between their role view and the member portal.
              // MEMBER sorts last so real roles lead the list.
              const builtins = new Set(Object.keys(ROLE_DISPLAY));
              const switchableRoles = [...(allRoles || [])]
                // Custom roles with no permissions render an empty
                // shell — don't offer them as a persona.
                .filter((r) => builtins.has(r) || ((user.rolePermissions?.[r]?.length ?? 0) > 0))
                .sort((a, b) => (a === 'MEMBER' ? 1 : 0) - (b === 'MEMBER' ? 1 : 0));
              if (switchableRoles.length > 1) {
                return (
                  <div className="topbar-role">
                    <span className="topbar-role-label">View as</span>
                    <select
                      className="topbar-role-select"
                      value={activeRole || ''}
                      onChange={(e) => setActiveRole(e.target.value || null)}
                      title={`You hold ${switchableRoles.length} roles. Switching changes the sidebar & actions.`}
                    >
                      {switchableRoles.map((r) => (
                        <option key={r} value={r}>{ROLE_DISPLAY[r] || roleLabel(user, r)}</option>
                      ))}
                    </select>
                  </div>
                );
              }
              return null;
            })()}
            <NotificationBell />
            <UserMenu user={user} onLogout={logout} />
          </header>
        )}
        <main className="main">
          <Outlet />
        </main>
      </div>
    </div>
  );
}

// Collapsible sidebar group — header chips between "open" and "closed",
// with the open/closed state persisted in localStorage so the user's
// preference survives reloads. Chevron rotates 90° on toggle.
function NavGroup({ label, icon, variant = '', children, storageKey, defaultOpen = false }) {
  const [open, setOpen] = useState(() => {
    if (!storageKey) return defaultOpen;
    const v = localStorage.getItem(storageKey);
    return v == null ? defaultOpen : v === '1';
  });
  function toggle() {
    setOpen((v) => {
      const next = !v;
      if (storageKey) {
        try { localStorage.setItem(storageKey, next ? '1' : '0'); } catch {}
      }
      return next;
    });
  }
  return (
    <div className={`nav-collapsible ${variant ? `nav-${variant}` : ''} ${open ? 'open' : ''}`}>
      <button type="button" className="nav-collapsible-head" onClick={toggle} aria-expanded={open}>
        {icon && <span className="nav-collapsible-icon" aria-hidden="true">{icon}</span>}
        <span className="nav-collapsible-label">{label}</span>
        <span className={`nav-collapsible-chevron ${open ? 'open' : ''}`} aria-hidden="true"><ChevronRightIcon size={10} /></span>
      </button>
      {open && <nav className="nav-collapsible-body">{children}</nav>}
    </div>
  );
}

function UserMenu({ user, onLogout }) {
  const [open, setOpen] = useState(false);
  const wrapRef = useRef(null);

  useEffect(() => {
    if (!open) return;
    function onDocClick(e) {
      if (wrapRef.current && !wrapRef.current.contains(e.target)) setOpen(false);
    }
    function onKey(e) { if (e.key === 'Escape') setOpen(false); }
    document.addEventListener('mousedown', onDocClick);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDocClick);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  const initial = (user.fullName || '?').trim().charAt(0).toUpperCase();
  const subtitle = (() => {
    const id = user.email || user.username || user.cnic || '';
    const role = user.roles?.filter((r) => r !== 'MEMBER').map((r) => ROLE_DISPLAY[r] || roleLabel(user, r)).join(', ')
      || (user.roles || []).map((r) => ROLE_DISPLAY[r] || roleLabel(user, r)).join(', ');
    return [id, role].filter(Boolean).join(' · ');
  })();

  const memberRoute = user.memberId ? `/members/${user.memberId}` : null;

  return (
    <div className="topbar-user-wrap" ref={wrapRef}>
      <button
        type="button"
        className={`topbar-user${open ? ' open' : ''}`}
        onClick={() => setOpen((o) => !o)}
        aria-haspopup="menu"
        aria-expanded={open}
      >
        <div className="topbar-user-meta">
          <strong>{user.fullName}</strong>
          <span className="topbar-user-sub">{subtitle}</span>
        </div>
        <div className="topbar-avatar" aria-hidden="true">{initial}</div>
        <span className="topbar-chevron" aria-hidden="true">▾</span>
      </button>

      {open && (
        <div className="topbar-menu" role="menu">
          <div className="topbar-menu-head">
            <div className="topbar-menu-avatar">{initial}</div>
            <div>
              <div className="topbar-menu-name">{user.fullName}</div>
              <div className="topbar-menu-mail">{user.email || user.username || user.cnic}</div>
            </div>
          </div>
          {memberRoute && (
            <Link to={memberRoute} className="topbar-menu-item" role="menuitem" onClick={() => setOpen(false)}>
              <span className="topbar-menu-icon"><UserIcon size={15} /></span>
              <span>My Profile</span>
            </Link>
          )}
          <button
            type="button"
            className="topbar-menu-item danger"
            role="menuitem"
            onClick={() => { setOpen(false); onLogout(); }}
          >
            <span className="topbar-menu-icon"><PowerIcon size={15} /></span>
            <span>Logout</span>
          </button>
        </div>
      )}
    </div>
  );
}
