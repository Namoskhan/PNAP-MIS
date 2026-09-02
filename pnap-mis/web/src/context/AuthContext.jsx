import { createContext, useContext, useEffect, useMemo, useState } from 'react';
import { api } from '../api/client';

const AuthContext = createContext(null);
const ACTIVE_ROLE_KEY = 'pnap_active_role';

// Role-priority order — used when picking a default "active role" for
// users who hold multiple. Higher in the list wins. Mirrors the
// hierarchy of dashboards a person would naturally land on.
const ROLE_PRIORITY = [
  'SUPER_ADMIN', 'CENTRAL_ADMIN', 'PROVINCE_ADMIN', 'DISTRICT_ADMIN', 'AREA_ADMIN',
  'CHAIRMAN', 'CO_CHAIRMAN', 'PRESIDENT',
  'SECRETARY',
  'SR_VICE_PRESIDENT', 'FIRST_SECRETARY', 'SENIOR_MAWIN',
  'GENERAL_SECRETARY',
  'FINANCE_SECRETARY',
  'VICE_PRESIDENT', 'SR_VICE_CHAIRMAN', 'VICE_CHAIRMAN',
  'PRESS_SECRETARY', 'CULTURE_SECRETARY', 'SPORTS_SECRETARY',
  'OTHER', 'MEMBER',
];

function pickDefault(user) {
  const roles = user?.roles || [];
  if (roles.length === 0) return null;
  // Built-in roles by priority — but never auto-prefer the base
  // MEMBER portal while a real role exists.
  for (const r of ROLE_PRIORITY) {
    if (r === 'MEMBER') continue;
    if (roles.includes(r)) return r;
  }
  // Custom catalogue roles only count when they actually grant
  // something — a permission-less custom role would render an
  // operator shell with nothing usable in it, so its holder lands
  // on the member portal instead.
  const perms = user?.rolePermissions || {};
  const custom = roles.find((r) => r !== 'MEMBER' && (perms[r]?.length ?? 0) > 0);
  if (custom) return custom;
  return roles.includes('MEMBER') ? 'MEMBER' : roles[0];
}

export function AuthProvider({ children }) {
  const [user, setUser] = useState(() => {
    const raw = localStorage.getItem('pnap_user');
    return raw ? JSON.parse(raw) : null;
  });
  const [loading, setLoading] = useState(false);

  // Active role — the single role the user wants to "view as" right
  // now. Persisted so reloads keep the same persona. null means
  // "use all my roles at once" (the original behavior).
  const [activeRole, setActiveRoleRaw] = useState(() => localStorage.getItem(ACTIVE_ROLE_KEY) || null);

  function setActiveRole(role) {
    if (role) localStorage.setItem(ACTIVE_ROLE_KEY, role);
    else localStorage.removeItem(ACTIVE_ROLE_KEY);
    setActiveRoleRaw(role);
  }

  // Pull fresh `/auth/me` whenever the app boots OR the tab gets
  // focus. The cached user in localStorage is just a first-paint
  // hint — the permission set, role labels, and isActive flag can
  // change while the user is logged in (Super Admin edits a role's
  // permissions, a holder gets deactivated, a custom role gets
  // renamed). Re-fetching here keeps the UI honest without a manual
  // logout/login.
  async function refreshMe() {
    const token = localStorage.getItem('pnap_token');
    if (!token) return null;
    try {
      const res = await api.get('/auth/me');
      const fresh = res.data.data;
      setUser(fresh);
      localStorage.setItem('pnap_user', JSON.stringify(fresh));
      return fresh;
    } catch {
      // 401 will already redirect via the api client interceptor; on
      // any other failure, leave the cached user in place rather than
      // logging the user out.
      return null;
    }
  }

  useEffect(() => {
    refreshMe();
    function onVisible() {
      if (document.visibilityState === 'visible') refreshMe();
    }
    document.addEventListener('visibilitychange', onVisible);
    window.addEventListener('focus', onVisible);
    // Periodic re-sync — focus/visibility alone never fires for a
    // user who keeps working in the same tab, so permission or role
    // revocations left their UI (sidebar, buttons) stale until a tab
    // switch. Poll keeps the UI honest within a minute; the server
    // re-checks every request either way.
    const poll = setInterval(() => {
      if (document.visibilityState === 'visible') refreshMe();
    }, 60000);
    return () => {
      document.removeEventListener('visibilitychange', onVisible);
      window.removeEventListener('focus', onVisible);
      clearInterval(poll);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Auto-pick a default active role when a multi-role user logs in
  // without one chosen. Single-role users keep activeRole === null
  // (no need for a selector if there's nothing to switch between).
  useEffect(() => {
    if (!user) { setActiveRole(null); return; }
    const isSuper = (user.roles || []).includes('SUPER_ADMIN') || user.isBootstrap;
    if (isSuper) {
      if (activeRole) setActiveRole(null);
      return;
    }
    const all = user.roles || [];
    if (all.length <= 1) { if (activeRole) setActiveRole(null); return; }
    // Re-pick when nothing is chosen, the choice no longer exists, or
    // the chosen custom role has lost every permission (its persona
    // would be an empty shell — auto-heal to a meaningful one).
    const deadCustom = activeRole
      && !ROLE_PRIORITY.includes(activeRole)
      && ((user.rolePermissions?.[activeRole]?.length ?? 0) === 0);
    if (!activeRole || !all.includes(activeRole) || deadCustom) {
      setActiveRole(pickDefault(user));
    }
  }, [user]);

  // Effective user — what the rest of the app sees. When activeRole
  // is set, narrow user.roles to just that one role so every
  // role-aware component (sidebar, permission helpers, page guards)
  // updates transparently. We also narrow `permissions` to just the
  // active role's grants — without this, a multi-role holder's UI
  // wouldn't reflect "what does this role on its own actually let me
  // do?", which is the whole point of the View As selector. The
  // backend always re-resolves on a per-request basis so anyone who
  // really holds another role can still hit those endpoints; this is
  // a UI affordance only. allRoles preserves the full list for the
  // selector itself.
  const effectiveUser = useMemo(() => {
    if (!user) return null;
    const isSuper = (user.roles || []).includes('SUPER_ADMIN') || user.isBootstrap;
    if (isSuper) {
      return {
        ...user,
        roles: ['SUPER_ADMIN'],
        allRoles: ['SUPER_ADMIN'],
        permissions: user.permissions || [],
        canViewExecutiveDashboard: true,
      };
    }
    const all = user.roles || [];
    if (!activeRole || all.length <= 1) {
      return { ...user, allRoles: all };
    }
    // Narrow permissions to just what the active role grants.
    // Falls back to the full union if rolePermissions wasn't shipped
    // (legacy token / older server build).
    const perms = (user.rolePermissions?.[activeRole] || user.permissions || []);
    const EXECUTIVE_ROLES = ['SUPER_ADMIN', 'CENTRAL_ADMIN', 'CHAIRMAN', 'CO_CHAIRMAN', 'SR_VICE_CHAIRMAN', 'VICE_CHAIRMAN', 'FIRST_SECRETARY'];
    const canViewExec = EXECUTIVE_ROLES.includes(activeRole) || (activeRole === 'GENERAL_SECRETARY' && !user.scope?.provinceId);
    return {
      ...user,
      roles: [activeRole],
      allRoles: all,
      permissions: perms,
      canViewExecutiveDashboard: canViewExec,
    };
  }, [user, activeRole]);

  async function login(identifier, password) {
    setLoading(true);
    try {
      const res = await api.post('/auth/login', { identifier, password });
      const { token, user } = res.data.data;
      localStorage.setItem('pnap_token', token);
      localStorage.setItem('pnap_user', JSON.stringify(user));
      // Reset persona on a fresh login so the picker shows up afresh.
      setActiveRole(null);
      setUser(user);
      return user;
    } finally {
      setLoading(false);
    }
  }

  function logout() {
    localStorage.removeItem('pnap_token');
    localStorage.removeItem('pnap_user');
    localStorage.removeItem(ACTIVE_ROLE_KEY);
    // The selected unit context is per-session state and must go too.
    // Leaving it behind meant the NEXT account to sign in on this
    // browser inherited it — sign out of Super Admin, in as an Area
    // Admin, and the top bar still read "CENTRAL · PKNAP Central".
    // UnitContext also stamps the stored row with the owning user id,
    // so a session that ends without calling logout (expired token,
    // closed tab) is covered as well; this is the tidy path.
    localStorage.removeItem('pnap_unit_ctx');
    setActiveRoleRaw(null);
    setUser(null);
  }

  function hasRole(...roles) {
    return effectiveUser?.roles?.some((r) => roles.includes(r));
  }

  return (
    <AuthContext.Provider value={{
      user: effectiveUser,
      loading,
      login,
      logout,
      hasRole,
      activeRole,
      setActiveRole,
      allRoles: effectiveUser?.allRoles || [],
      // Surfaces a manual refresh — call after any action that
      // changes role permissions / role labels / isActive on the
      // current user (e.g., after a Roles save) to pick up the new
      // state without a hard refresh.
      refreshMe,
    }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  return useContext(AuthContext);
}
