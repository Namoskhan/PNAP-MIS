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
import { useTranslation } from 'react-i18next';
import LanguageSelector from './LanguageSelector';
import { useBranding } from '../context/BrandingContext';
import {
  UsersIcon, FolderIcon, BuildingIcon, GearIcon,
  UserIcon, PowerIcon, MenuIcon, ChevronLeftIcon, ChevronRightIcon,
  CommitteeIcon, JirgaIcon, CongressIcon, GlobeIcon, XIcon, ShieldIcon,
} from './icons';

const SIDEBAR_KEY = 'pnap_sidebar_collapsed';

// Human-readable label for the role-persona selector.
function getRoleLabel(user, r, t) {
  if (t) {
    const key = `roles.${r}`;
    const translated = t(key);
    if (translated && translated !== key) return translated;
  }
  return ROLE_DISPLAY[r] || roleLabel(user, r);
}

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
function committeeLabel(unitLevel, t) {
  if (unitLevel === 'AREA') return t ? t('units.elaqayiCommittee', 'Elaqayi Committee') : 'Elaqayi Committee';
  if (unitLevel === 'DISTRICT') return t ? t('units.zillaCommittee', 'Zilla Committee') : 'Zilla Committee';
  if (unitLevel === 'PROVINCE') return t ? t('units.sobayiCommittee', 'Sobayi Committee') : 'Sobayi Committee';
  if (unitLevel === 'CENTRAL') return t ? t('units.centralCommittee', 'Central Committee') : 'Central Committee';
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
function CommitteeNav({ ctx, canFinance, showEvents = true, defaultOpen = true, fixedTitle = null, fixedLevel = null }) {
  const { t } = useTranslation();
  const activeLevel = fixedLevel || ctx?.unitLevel;
  if (!activeLevel || activeLevel === 'BASIC_UNIT') return null;
  const label = fixedTitle || committeeLabel(activeLevel, t);
  if (!label) return null;
  return (
    <NavGroup
      label={label}
      icon={<CommitteeIcon size={14} />}
      variant="committee"
      storageKey={`pnap_nav_committee_${activeLevel.toLowerCase()}`}
      defaultOpen={defaultOpen}
    >
      <UnitNavLink to="/unit/committee">{t('nav.composition', 'Composition')}</UnitNavLink>
      {showEvents && <UnitNavLink to="/unit/meetings" body="COMMITTEE">{t('nav.committeeMeetings', 'Committee Meetings')}</UnitNavLink>}
      {showEvents && <UnitNavLink to="/unit/activities" body="COMMITTEE">{t('nav.committeeActivities', 'Committee Activities')}</UnitNavLink>}
      {canFinance && <UnitNavLink to="/unit/finance" body="COMMITTEE">{t('nav.committeeFinance', 'Committee Finance')}</UnitNavLink>}
      {canFinance && <UnitNavLink to="/unit/transfers" body="COMMITTEE">{t('nav.committeeTransfers', 'Committee Transfers')}</UnitNavLink>}
      <UnitNavLink to="/unit/reports" body="COMMITTEE">{t('nav.committeeReports', 'Committee Reports')}</UnitNavLink>
    </NavGroup>
  );
}

// The Jirga hub — dedicated collapsible group for Qomi Jirga (Central)
// and Sobayi Jirga (Province), each pinned to ?body=JIRGA.
function JirgaNav({ ctx, canFinance, showEvents = true, defaultOpen = false }) {
  const { t } = useTranslation();
  if (!ctx || (ctx.unitLevel !== 'CENTRAL' && ctx.unitLevel !== 'PROVINCE')) return null;
  const label = ctx.unitLevel === 'CENTRAL' ? t('units.qomiJirga', 'Qomi Jirga') : t('units.sobayiJirga', 'Sobayi Jirga');
  return (
    <NavGroup
      label={label}
      icon={<JirgaIcon size={14} />}
      variant="jirga"
      storageKey={`pnap_nav_jirga_${ctx.unitLevel.toLowerCase()}`}
      defaultOpen={defaultOpen}
    >
      <UnitNavLink to="/unit/jirga">{t('nav.composition', 'Composition')}</UnitNavLink>
      {showEvents && <UnitNavLink to="/unit/meetings" body="JIRGA">{t('nav.jirgaMeetings', 'Jirga Meetings')}</UnitNavLink>}
      {showEvents && <UnitNavLink to="/unit/activities" body="JIRGA">{t('nav.jirgaActivities', 'Jirga Activities')}</UnitNavLink>}
      {canFinance && <UnitNavLink to="/unit/finance" body="JIRGA">{t('nav.jirgaFinance', 'Jirga Finance')}</UnitNavLink>}
      {canFinance && <UnitNavLink to="/unit/transfers" body="JIRGA">{t('nav.jirgaTransfers', 'Jirga Transfers')}</UnitNavLink>}
      <UnitNavLink to="/unit/reports" body="JIRGA">{t('nav.jirgaReports', 'Jirga Reports')}</UnitNavLink>
    </NavGroup>
  );
}

// National Congress hub — supreme assembly at Central level.
function CongressNav({ ctx, canFinance, showEvents = true, defaultOpen = false }) {
  const { t } = useTranslation();
  if (!ctx || ctx.unitLevel !== 'CENTRAL') return null;
  return (
    <NavGroup
      label={t('units.nationalCongress', 'National Congress')}
      icon={<CongressIcon size={14} />}
      variant="congress"
      storageKey="pnap_nav_congress"
      defaultOpen={defaultOpen}
    >
      <UnitNavLink to="/unit/congress">{t('nav.composition', 'Congress Roster')}</UnitNavLink>
      {showEvents && <UnitNavLink to="/unit/meetings" body="CONGRESS">{t('nav.congressMeetings', 'Congress Meetings')}</UnitNavLink>}
      {showEvents && <UnitNavLink to="/unit/activities" body="CONGRESS">{t('nav.congressActivities', 'Congress Activities')}</UnitNavLink>}
      {canFinance && <UnitNavLink to="/unit/finance" body="CONGRESS">{t('nav.congressFinance', 'Congress Finance')}</UnitNavLink>}
      <UnitNavLink to="/unit/reports" body="CONGRESS">{t('nav.congressReports', 'Congress Reports')}</UnitNavLink>
    </NavGroup>
  );
}

export default function Layout() {
  // Two sidebar entries share /admin/users and are distinguished only
  // by their query string, so active-state has to consider it —
  // NavLink matches on pathname alone.
  const { t } = useTranslation();
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

  // Mobile navigation drawer state (< 992px)
  const [mobileOpen, setMobileOpen] = useState(false);

  // Automatically close mobile drawer whenever the user navigates
  useEffect(() => {
    setMobileOpen(false);
  }, [pathname, search]);

  // Lock body scroll and listen for Escape key when mobile drawer is open
  useEffect(() => {
    if (!mobileOpen) return;
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';

    function onKeyDown(e) {
      if (e.key === 'Escape') setMobileOpen(false);
    }
    window.addEventListener('keydown', onKeyDown);
    return () => {
      document.body.style.overflow = prevOverflow;
      window.removeEventListener('keydown', onKeyDown);
    };
  }, [mobileOpen]);

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
      {/* Mobile drawer backdrop */}
      <div
        className={`sidebar-backdrop ${mobileOpen ? 'visible' : ''}`}
        onClick={() => setMobileOpen(false)}
        aria-hidden="true"
      />
      <aside className={`sidebar ${collapsed ? 'collapsed' : ''} ${mobileOpen ? 'mobile-open' : ''}`}>
        <div className="sidebar-top-row">
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, minWidth: 0 }}>
            <img
              src={branding?.logos?.sidebar?.url || '/logo.png'}
              alt="PNAP Logo"
              style={{
                width: 32,
                height: 32,
                borderRadius: '50%',
                objectFit: 'contain',
                flexShrink: 0,
                boxShadow: '0 2px 4px rgba(0,0,0,0.1)'
              }}
            />
            {!collapsed && <h1 style={{ margin: 0, fontSize: 18 }}>{branding.identity?.shortName || 'PKNAP'}</h1>}
          </div>
          <button
            type="button"
            className={`sidebar-toggle ${collapsed ? 'collapsed' : 'open'}`}
            onClick={toggleSidebar}
            title={collapsed ? 'Open sidebar' : 'Collapse sidebar'}
            aria-label={collapsed ? 'Open sidebar' : 'Collapse sidebar'}
          >
            {collapsed ? <MenuIcon /> : <ChevronLeftIcon />}
          </button>
          <button
            type="button"
            className="sidebar-mobile-close"
            onClick={() => setMobileOpen(false)}
            title="Close navigation"
            aria-label="Close navigation"
          >
            <XIcon size={18} />
          </button>
        </div>

        {isSuperAdmin && (
          <>
            <NavGroup
              label={t('nav.superAdmin', 'Super Administration')}
              icon={<ShieldIcon size={14} />}
              storageKey="pnap_nav_super_admin"
              defaultOpen
            >
              <NavLink to="/" end>{t('nav.dashboard', 'Dashboard')}</NavLink>
              {/* Lands on the user directory pre-filtered to the tier
                  Super Admin is responsible for; the create action for
                  this role lives there too, since a Central Admin has
                  no org unit to be created alongside. */}
              <NavLink
                to="/admin/users?role=CENTRAL_ADMIN"
                className={({ isActive }) => (
                  isActive && search.includes('role=CENTRAL_ADMIN') ? 'active' : undefined
                )}
              >{t('nav.centralAdmins', 'Central Admins')}</NavLink>
              {/* Province management is SHARED with the Central Admin,
                  not delegated away from Super Admin. Both tiers create
                  provinces; only Super Admin can delete one, and only
                  Super Admin can walk the whole hierarchy from here —
                  hence "Units" rather than "Provinces". */}
              <NavLink to="/admin/manage-org">{t('nav.manageUnits', 'Manage Units')}</NavLink>
              <NavLink to="/members">{t('nav.allMembers', 'All Members')}</NavLink>
              <NavLink to="/admin/pending-approvals">{t('nav.pendingRoleApprovals', 'Pending Role Approvals')}</NavLink>
              <NavLink to="/admin/finance-overview">{t('nav.financeOverview', 'Finance Overview')}</NavLink>
            </NavGroup>
            <NavGroup label={t('nav.userManager', 'User Manager')} icon={<UsersIcon size={14} />} storageKey="pnap_nav_user_manager" defaultOpen>
              <NavLink to="/admin/roles">{t('nav.roleManagement', 'Role Management')}</NavLink>
              {/* Same page as the Central Admins entry above but with
                  no role filter — so its active state must exclude the
                  filtered URL, otherwise both light up at once. */}
              <NavLink
                to="/admin/users"
                className={({ isActive }) => (isActive && !search ? 'active' : undefined)}
              >{t('nav.allUsers', 'All Users & Credentials')}</NavLink>
              <NavLink to="/admin/audit">{t('nav.auditLogs', 'Audit Log')}</NavLink>
            </NavGroup>
            <NavGroup label={t('nav.eventManager', 'Event Manager')} icon={<FolderIcon size={14} />} storageKey="pnap_nav_event_manager">
              <NavLink to="/admin/events/meeting-types">{t('nav.meetingTypes', 'Meeting Types')}</NavLink>
              <NavLink to="/admin/events/activity-types">{t('nav.activityTypes', 'Activity Types')}</NavLink>
              <NavLink to="/admin/events/fields">{t('nav.fieldLibrary', 'Field Library')}</NavLink>
            </NavGroup>
            <NavGroup label={t('nav.unitManagement', 'Unit Management')} icon={<BuildingIcon size={14} />} storageKey="pnap_nav_unit_mgmt">
              <NavLink to="/admin/units" end>{t('nav.unitOverview', 'Overview')}</NavLink>
              <NavLink to="/admin/units/tier-configs">{t('nav.unitTiers', 'Unit Type Manager')}</NavLink>
              <NavLink to="/admin/units/cabinet-templates">{t('nav.cabinetTemplates', 'Cabinet Structure')}</NavLink>
              <NavLink to="/admin/units/policies">{t('nav.unitPolicies', 'Unit Policies')}</NavLink>
              <NavLink to="/admin/units/workflows">{t('nav.workflows', 'Workflow Manager')}</NavLink>
              <NavLink to="/admin/units/responsibility-templates">{t('nav.taskTemplates', 'Responsibility Manager')}</NavLink>
              <NavLink to="/admin/units/performance-rulesets">{t('nav.performanceRules', 'Performance Rules')}</NavLink>
              <NavLink to="/admin/units/report-templates">{t('nav.reportTemplates', 'Report Templates')}</NavLink>
            </NavGroup>
            <NavGroup label={t('nav.settings', 'Settings')} icon={<GearIcon size={14} />} storageKey="pnap_nav_settings">
              <NavLink to="/admin/settings" end>{t('nav.brandingOverview', 'Branding Overview')}</NavLink>
              <NavLink to="/admin/settings/identity">{t('nav.systemIdentity', 'System Identity')}</NavLink>
              <NavLink to="/admin/settings/logos">{t('nav.logoManager', 'Logo Manager')}</NavLink>
              <NavLink to="/admin/settings/theme">{t('nav.themeManager', 'Theme Manager')}</NavLink>
              <NavLink to="/admin/settings/typography">{t('nav.typography', 'Typography')}</NavLink>
              <NavLink to="/admin/settings/dashboard">{t('nav.dashboardSettings', 'UI Preferences')}</NavLink>
              <NavLink to="/admin/settings/reports">{t('nav.reportBranding', 'Report Branding')}</NavLink>
              <NavLink to="/admin/settings/login">{t('nav.loginSettings', 'Login Customization')}</NavLink>
              <NavLink to="/admin/settings/history">{t('nav.settingsHistory', 'Settings History')}</NavLink>
            </NavGroup>
            <NavGroup label={t('nav.centralTier', 'Central Tier')} icon={<GlobeIcon size={14} />} storageKey="pnap_nav_central_tier" defaultOpen={false}>
              <NavLink to="/unit" end>{t('nav.centralDashboard', 'Central Dashboard')}</NavLink>
              <NavLink to="/unit/cabinet">{t('nav.centralCabinet', 'Central Cabinet')}</NavLink>
              <UnitNavLink to="/unit/meetings">{t('nav.centralMeetings', 'Central Meetings')}</UnitNavLink>
              <UnitNavLink to="/unit/activities">{t('nav.centralActivities', 'Central Activities')}</UnitNavLink>
              <NavLink to="/unit/responsibilities">{t('nav.centralResponsibilities', 'Central Responsibilities')}</NavLink>
              <UnitNavLink to="/unit/finance">{t('nav.centralFinance', 'Central Finance')}</UnitNavLink>
              <UnitNavLink to="/unit/transfers">{t('nav.centralTransfers', 'Central Fund Transfers')}</UnitNavLink>
              <UnitNavLink to="/unit/reports">{t('nav.centralReports', 'Central Reports')}</UnitNavLink>
            </NavGroup>
          </>
        )}


        {isAreaAdmin && (
          <>
            <div className="nav-group">{t('nav.myArea', 'My Area')}</div>
            <nav>
              <NavLink to="/unit" end>{t('nav.dashboard', 'Dashboard')}</NavLink>
              <NavLink to="/admin/manage-org">{t('nav.manageBasicUnits', 'Manage Basic Units')}</NavLink>
              <NavLink to="/members/pending" end>{t('nav.memberApprovals', 'Member Approvals')}</NavLink>
              <NavLink
                to="/members"
                className={({ isActive }) => (
                  isActive && pathname !== '/members/pending' ? 'active' : undefined
                )}
              >{t('nav.allMembers', 'All Members')}</NavLink>
              <NavLink to="/unit/cabinet">{t('nav.assignCabinetRoles', 'Assign Cabinet Roles')}</NavLink>
              <NavLink to="/unit/responsibilities">{t('nav.responsibilities', 'Responsibilities')}</NavLink>
              <NavLink to="/unit/breakdown">{t('nav.unitBreakdown', 'Basic Unit Breakdown')}</NavLink>
              <UnitNavLink to="/unit/reports">{t('nav.reports', 'Reports')}</UnitNavLink>
            </nav>
          </>
        )}

        {isCentralAdmin && (
          <>
            <div className="nav-group">{t('nav.myOrganization', 'My Organization')}</div>
            <nav>
              <NavLink to="/unit" end>{t('nav.dashboard', 'Dashboard')}</NavLink>
              <NavLink to="/admin/manage-org">{t('nav.manageProvinces', 'Manage Provinces')}</NavLink>
              <NavLink to="/members">{t('nav.provinceMembers', 'Province Members')}</NavLink>
              <NavLink to="/unit/cabinet">{t('nav.assignCabinetRoles', 'Assign Province Cabinet Roles')}</NavLink>
              <NavLink to="/unit/responsibilities">{t('nav.responsibilities', 'Responsibilities')}</NavLink>
              <NavLink to="/unit/breakdown">{t('nav.unitBreakdown', 'Province Breakdown')}</NavLink>
              <UnitNavLink to="/unit/reports">{t('nav.reports', 'Reports')}</UnitNavLink>
            </nav>
          </>
        )}

        {isDistrictAdmin && (
          <>
            <div className="nav-group">{t('nav.myDistrict', 'My District')}</div>
            <nav>
              <NavLink to="/unit" end>{t('nav.dashboard', 'Dashboard')}</NavLink>
              <NavLink to="/admin/manage-org">{t('nav.manageAreas', 'Manage Areas')}</NavLink>
              <NavLink to="/members">{t('nav.members', 'Members')}</NavLink>
              <NavLink to="/unit/cabinet">{t('nav.assignCabinetRoles', 'Assign Area Cabinet Roles')}</NavLink>
              <NavLink to="/unit/responsibilities">{t('nav.responsibilities', 'Responsibilities')}</NavLink>
              <NavLink to="/unit/breakdown">{t('nav.unitBreakdown', 'Area Breakdown')}</NavLink>
              <UnitNavLink to="/unit/reports">{t('nav.reports', 'Reports')}</UnitNavLink>
            </nav>
          </>
        )}

        {isProvinceAdmin && (
          <>
            <div className="nav-group">{t('nav.myProvince', 'My Province')}</div>
            <nav>
              <NavLink to="/unit" end>{t('nav.dashboard', 'Dashboard')}</NavLink>
              <NavLink to="/admin/manage-org">{t('nav.manageDistricts', 'Manage Districts')}</NavLink>
              <NavLink to="/members">{t('nav.allMembers', 'All Province Members')}</NavLink>
              <NavLink to="/unit/cabinet">{t('nav.assignCabinetRoles', 'Assign District Cabinet Roles')}</NavLink>
              <NavLink to="/unit/responsibilities">{t('nav.responsibilities', 'Responsibilities')}</NavLink>
              <NavLink to="/unit/breakdown">{t('nav.unitBreakdown', 'District Breakdown')}</NavLink>
              <UnitNavLink to="/unit/reports">{t('nav.reports', 'Reports')}</UnitNavLink>
            </nav>
          </>
        )}

        {isSeniorMawin && (
          <>
            <div className="nav-group">
              {ctx ? `${ctx.unitLevel.replace('_', ' ')} · ${ctx.unitName}` : t('units.unit', 'Unit')}
            </div>
            <nav>
              <NavLink to="/unit" end>{t('nav.dashboard', 'Dashboard')}</NavLink>
              <NavLink to="/unit/cabinet">{t('nav.cabinetAndRoles', 'Cabinet & Roles')}</NavLink>
              <UnitNavLink to="/unit/meetings">{t('nav.meetings', 'Meetings')}</UnitNavLink>
              <UnitNavLink to="/unit/activities">{t('nav.activities', 'Activities')}</UnitNavLink>
              <NavLink to="/unit/responsibilities">{t('nav.responsibilities', 'Responsibilities')}</NavLink>
              {canFinance && <UnitNavLink to="/unit/finance">{t('nav.finance', 'Finance')}</UnitNavLink>}
              {canFinance && <UnitNavLink to="/unit/transfers">{t('nav.fundTransfers', 'Fund Transfers')}</UnitNavLink>}
              <NavLink to="/unit/performance">{t('nav.memberPerformance', 'Member Performance')}</NavLink>
              <UnitNavLink to="/unit/reports">{t('nav.reports', 'Reports')}</UnitNavLink>
            </nav>
            <CommitteeNav ctx={ctx} canFinance={canFinance} defaultOpen={false} />
            <CongressNav ctx={ctx} canFinance={canFinance} defaultOpen={false} />
            <JirgaNav ctx={ctx} canFinance={canFinance} defaultOpen={false} />
          </>
        )}

        {isSecretary && (
          <>
            <div className="nav-group">
              {ctx ? `${ctx.unitLevel.replace('_', ' ')} · ${ctx.unitName}` : t('units.unit', 'Unit')}
            </div>
            <nav>
              <NavLink to="/unit" end>{t('nav.dashboard', 'Dashboard')}</NavLink>
              <NavLink to="/members">{t('nav.members', 'Members')}</NavLink>
              <NavLink to="/unit/cabinet">{t('nav.cabinet', 'Cabinet')}</NavLink>
              <UnitNavLink to="/unit/meetings">{t('nav.meetings', 'Meetings')}</UnitNavLink>
              <UnitNavLink to="/unit/activities">{t('nav.activities', 'Activities')}</UnitNavLink>
              <NavLink to="/unit/responsibilities">{t('nav.responsibilities', 'Responsibilities')}</NavLink>
              <NavLink to="/unit/performance">{t('nav.memberPerformance', 'Member Performance')}</NavLink>
              {canFinance && <UnitNavLink to="/unit/finance">{t('nav.financeSummary', 'Finance Summary')}</UnitNavLink>}
              <UnitNavLink to="/unit/reports">{t('nav.reports', 'Reports')}</UnitNavLink>
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
              {ctx ? `${ctx.unitLevel.replace('_', ' ')} · ${ctx.unitName}` : t('units.unit', 'Unit')}
            </div>
            <nav>
              <NavLink to={user?.canViewExecutiveDashboard ? '/' : '/unit'} end>
                {user?.canViewExecutiveDashboard && !user?.dashboardScope ? t('nav.centralDashboard', 'Central Dashboard') : t('nav.dashboard', 'Dashboard')}
              </NavLink>
              {canFinance && <UnitNavLink to="/unit/finance">{t('nav.finance', 'Finance')}</UnitNavLink>}
              {canFinance && <UnitNavLink to="/unit/transfers">{t('nav.fundTransfers', 'Fund Transfers')}</UnitNavLink>}
              {/* Not gated on MANAGE_MEETINGS: this persona cannot ASSIGN
                  a responsibility, but a Senior Mawin can assign one TO
                  them, and they need a way to open it and mark it done.
                  The page hides every write control by itself. */}
              <NavLink to="/unit/responsibilities">{t('nav.myResponsibilities', 'My Responsibilities')}</NavLink>
              {ctx && ctx.unitLevel !== 'BASIC_UNIT' && (
                <NavLink to="/unit/breakdown">{t('nav.subordinateBreakdown', 'Subordinate Breakdown')}</NavLink>
              )}
              <UnitNavLink to="/unit/reports">{t('nav.reports', 'Reports')}</UnitNavLink>
            </nav>
            {/* The Finance Secretary keeps the unit's books for Executive, Committee, Jirga, and Congress bodies */}
            <CommitteeNav ctx={ctx} canFinance={canFinance} showEvents={false} />
            <CongressNav ctx={ctx} canFinance={canFinance} showEvents={false} />
            <JirgaNav ctx={ctx} canFinance={canFinance} showEvents={false} />
          </>
        )}

        {isMember && (
          <>
            <div className="nav-group">{t('nav.myUnit', 'My Unit')}</div>
            <nav>
              <NavLink to="/" end>{t('nav.myDashboard', 'My Dashboard')}</NavLink>
              {/* No committee group for a pure member, but these stay
                  body-aware so the entry doesn't stay lit if one lands
                  on a ?body=COMMITTEE URL from elsewhere. */}
              <UnitNavLink to="/unit/meetings">{t('nav.meetings', 'Meetings')}</UnitNavLink>
              <UnitNavLink to="/unit/activities">{t('nav.activities', 'Activities')}</UnitNavLink>
              <NavLink to="/unit/responsibilities">{t('nav.myResponsibilities', 'My Responsibilities')}</NavLink>
              {user?.memberId && (
                <NavLink to={`/members/${user.memberId}`}>{t('auth.myProfile', 'My Profile')}</NavLink>
              )}
            </nav>
          </>
        )}

        {isPresident && (
          <>
            <div className="nav-group">
              {ctx ? `${ctx.unitLevel.replace('_', ' ')} · ${ctx.unitName}` : t('nav.myProvince', 'Province')}
            </div>
            <nav>
              <NavLink to={user?.canViewExecutiveDashboard ? '/' : '/unit'} end>
                {user?.canViewExecutiveDashboard && !user?.dashboardScope ? t('nav.centralDashboard', 'Central Dashboard') : t('nav.dashboard', 'Dashboard')}
              </NavLink>
              <NavLink to="/members">{t('nav.members', 'Members')}</NavLink>
              <NavLink to="/unit/cabinet">{t('nav.cabinetAndRoles', 'Cabinet & Roles')}</NavLink>
              <UnitNavLink to="/unit/meetings">{t('nav.meetings', 'Meetings')}</UnitNavLink>
              <UnitNavLink to="/unit/activities">{t('nav.activities', 'Activities')}</UnitNavLink>
              <NavLink to="/unit/responsibilities">{t('nav.responsibilities', 'Responsibilities')}</NavLink>
              {canFinance && <UnitNavLink to="/unit/finance">{t('nav.finance', 'Finance')}</UnitNavLink>}
              {canFinance && <UnitNavLink to="/unit/transfers">{t('nav.fundTransfers', 'Fund Transfers')}</UnitNavLink>}
              <NavLink to="/unit/performance">{t('nav.memberPerformance', 'Member Performance')}</NavLink>
              <UnitNavLink to="/unit/reports">{t('nav.reports', 'Reports')}</UnitNavLink>
            </nav>
            <CommitteeNav ctx={ctx} canFinance={canFinance} />
            <CongressNav ctx={ctx} canFinance={canFinance} />
            <JirgaNav ctx={ctx} canFinance={canFinance} />
          </>
        )}

        {!isSuperAdmin && !isCentralAdmin && !isAreaAdmin && !isSeniorMawin && !isSecretary && !isFinanceSecretary && !isDistrictAdmin && !isProvinceAdmin && !isMember && !isPresident && (
          <>
            {user?.canViewExecutiveDashboard && ctx?.unitLevel === 'CENTRAL' ? (
              <>
                <div className="nav-group">
                  {ctx ? `${ctx.unitLevel.replace('_', ' ')} · ${ctx.unitName}` : 'CENTRAL · PKNAP Central'}
                </div>
                <nav>
                  <NavLink to="/" end>{t('nav.centralDashboard', 'Central Dashboard')}</NavLink>
                  <NavLink to="/members">{t('nav.members', 'Members')}</NavLink>
                  {canRegister && <NavLink to="/members/new">{t('nav.registerMember', 'Register Member')}</NavLink>}
                  {canApproveMembers && <NavLink to="/members/pending">{t('nav.approvalQueue', 'Approval Queue')}</NavLink>}
                  <NavLink to="/unit/cabinet">{t('nav.cabinetAndRoles', 'Cabinet & Roles')}</NavLink>
                  <UnitNavLink to="/unit/meetings">{t('nav.meetings', 'Meetings')}</UnitNavLink>
                  <UnitNavLink to="/unit/activities">{t('nav.activities', 'Activities')}</UnitNavLink>
                  <NavLink to="/unit/responsibilities">{t('nav.responsibilities', 'Responsibilities')}</NavLink>
                  <NavLink to="/unit/performance">{t('nav.memberPerformance', 'Member Performance')}</NavLink>
                  {canFinance && <UnitNavLink to="/unit/finance">{t('nav.finance', 'Finance')}</UnitNavLink>}
                  {canFinance && <UnitNavLink to="/unit/transfers">{t('nav.fundTransfers', 'Fund Transfers')}</UnitNavLink>}
                  <UnitNavLink to="/unit/reports">{t('nav.reports', 'Reports')}</UnitNavLink>
                </nav>
              </>
            ) : (
              <>
                <div className="nav-group">
                  {ctx ? `${ctx.unitLevel.replace('_', ' ')} · ${ctx.unitName}` : t('units.unit', 'Unit')}
                </div>
                <nav>
                  <NavLink to="/unit" end>{t('nav.dashboard', 'Dashboard')}</NavLink>
                  <NavLink to="/members">{t('nav.members', 'Members')}</NavLink>
                  {canRegister && <NavLink to="/members/new">{t('nav.registerMember', 'Register Member')}</NavLink>}
                  {canApproveMembers && <NavLink to="/members/pending">{t('nav.approvalQueue', 'Approval Queue')}</NavLink>}
                  <NavLink to="/unit/cabinet">{t('nav.cabinetAndRoles', 'Cabinet & Roles')}</NavLink>
                  <UnitNavLink to="/unit/meetings">{t('nav.meetings', 'Meetings')}</UnitNavLink>
                  <UnitNavLink to="/unit/activities">{t('nav.activities', 'Activities')}</UnitNavLink>
                  <NavLink to="/unit/responsibilities">{t('nav.responsibilities', 'Responsibilities')}</NavLink>
                  <NavLink to="/unit/performance">{t('nav.memberPerformance', 'Member Performance')}</NavLink>
                  {canFinance && <UnitNavLink to="/unit/finance">{t('nav.finance', 'Finance')}</UnitNavLink>}
                  {canFinance && <UnitNavLink to="/unit/transfers">{t('nav.fundTransfers', 'Fund Transfers')}</UnitNavLink>}
                  <UnitNavLink to="/unit/reports">{t('nav.reports', 'Reports')}</UnitNavLink>
                  {ctx && ctx.unitLevel !== 'BASIC_UNIT' && (
                    <NavLink to="/unit/breakdown">{t('nav.subordinateBreakdown', 'Subordinate Breakdown')}</NavLink>
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
        <div className="nav-group">{t('nav.communication', 'Communication')}</div>
        <nav>
          <NavLink to="/notifications">{t('nav.notifications', 'Notifications')}</NavLink>
          <NavLink to="/announcements">{t('nav.announcements', 'Announcements')}</NavLink>
        </nav>

      </aside>
      <div className="main-col">
        {user && (
          <header className="topbar">
            <button
              type="button"
              className="topbar-mobile-toggle"
              onClick={() => setMobileOpen(true)}
              aria-label="Open navigation menu"
              title="Open menu"
              aria-expanded={mobileOpen}
            >
              <MenuIcon size={20} />
            </button>
            <span className="topbar-mobile-brand">
              {branding.identity?.shortName || 'PKNAP'}
            </span>
            <div className="topbar-spacer" aria-hidden="true" />
            {(() => {
              if (isSuperAdmin) return null;
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
                    <span className="topbar-role-label">{t('auth.viewAs', 'View as')}</span>
                    <select
                      className="topbar-role-select"
                      value={activeRole || ''}
                      onChange={(e) => setActiveRole(e.target.value || null)}
                      title={`You hold ${switchableRoles.length} roles. Switching changes the sidebar & actions.`}
                    >
                      {switchableRoles.map((r) => (
                        <option key={r} value={r}>{getRoleLabel(user, r, t)}</option>
                      ))}
                    </select>
                  </div>
                );
              }
              return null;
            })()}
            <LanguageSelector variant="topbar" />
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
  const { t } = useTranslation();
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
    const role = user.roles?.filter((r) => r !== 'MEMBER').map((r) => getRoleLabel(user, r, t)).join(', ')
      || (user.roles || []).map((r) => getRoleLabel(user, r, t)).join(', ');
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
              <span>{t('auth.myProfile', 'My Profile')}</span>
            </Link>
          )}
          <button
            type="button"
            className="topbar-menu-item danger"
            role="menuitem"
            onClick={() => { setOpen(false); onLogout(); }}
          >
            <span className="topbar-menu-icon"><PowerIcon size={15} /></span>
            <span>{t('auth.logout', 'Logout')}</span>
          </button>
        </div>
      )}
    </div>
  );
}
