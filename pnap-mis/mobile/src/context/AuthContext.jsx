import { createContext, useContext, useEffect, useMemo, useState } from 'react';
import { Storage } from '../utils/storage';
import { api } from '../api/client';

// Port of web/src/context/AuthContext.jsx.
// Uses cross-platform Storage (SecureStore on Native, localStorage on Web).

const AuthContext = createContext(null);
const TOKEN_KEY = 'pnap_token';
const USER_KEY = 'pnap_user';
const ACTIVE_ROLE_KEY = 'pnap_active_role';

const ROLE_PRIORITY = [
  'SUPER_ADMIN', 'PROVINCE_ADMIN', 'DISTRICT_ADMIN', 'AREA_ADMIN',
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
  for (const r of ROLE_PRIORITY) {
    if (r === 'MEMBER') continue;
    if (roles.includes(r)) return r;
  }
  const perms = user?.rolePermissions || {};
  const custom = roles.find((r) => r !== 'MEMBER' && (perms[r]?.length ?? 0) > 0);
  if (custom) return custom;
  return roles.includes('MEMBER') ? 'MEMBER' : roles[0];
}

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [activeRole, setActiveRoleRaw] = useState(null);
  const [loading, setLoading] = useState(true); // true until Storage hydrates

  // Hydrate from Storage on first mount (async).
  useEffect(() => {
    (async () => {
      try {
        const rawUser = await Storage.getItem(USER_KEY);
        const rawRole = await Storage.getItem(ACTIVE_ROLE_KEY);
        if (rawUser) setUser(JSON.parse(rawUser));
        if (rawRole) setActiveRoleRaw(rawRole);
      } catch { /* ignore */ } finally {
        setLoading(false);
      }
    })();
  }, []);

  async function setActiveRole(role) {
    if (role) await Storage.setItem(ACTIVE_ROLE_KEY, role);
    else await Storage.removeItem(ACTIVE_ROLE_KEY);
    setActiveRoleRaw(role);
  }

  async function refreshMe() {
    const token = await Storage.getItem(TOKEN_KEY);
    if (!token) return null;
    try {
      const res = await api.get('/auth/me');
      const fresh = res.data.data;
      setUser(fresh);
      await Storage.setItem(USER_KEY, JSON.stringify(fresh));
      return fresh;
    } catch {
      return null;
    }
  }

  useEffect(() => {
    if (loading) return;
    refreshMe();
    const poll = setInterval(refreshMe, 60000);
    return () => clearInterval(poll);
  }, [loading]);

  // Auto-pick active role for multi-role users.
  useEffect(() => {
    if (!user) { setActiveRole(null); return; }
    const all = user.roles || [];
    if (all.length <= 1) { if (activeRole) setActiveRole(null); return; }
    const deadCustom = activeRole
      && !ROLE_PRIORITY.includes(activeRole)
      && ((user.rolePermissions?.[activeRole]?.length ?? 0) === 0);
    if (!activeRole || !all.includes(activeRole) || deadCustom) {
      setActiveRole(pickDefault(user));
    }
  }, [user]);

  const effectiveUser = useMemo(() => {
    if (!user) return null;
    const all = user.roles || [];
    if (!activeRole || all.length <= 1) {
      return { ...user, allRoles: all };
    }
    const perms = user.rolePermissions?.[activeRole] || user.permissions || [];
    return {
      ...user,
      roles: [activeRole],
      allRoles: all,
      permissions: perms,
    };
  }, [user, activeRole]);

  async function login(identifier, password) {
    setLoading(true);
    try {
      const res = await api.post('/auth/login', { identifier, password });
      const { token, user: u } = res.data.data;
      await Storage.setItem(TOKEN_KEY, token);
      await Storage.setItem(USER_KEY, JSON.stringify(u));
      await setActiveRole(null);
      setUser(u);
      return u;
    } finally {
      setLoading(false);
    }
  }

  async function logout() {
    await Storage.removeItem(TOKEN_KEY);
    await Storage.removeItem(USER_KEY);
    await Storage.removeItem(ACTIVE_ROLE_KEY);
    await Storage.removeItem('pnap_unit_ctx');
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
      refreshMe,
    }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  return useContext(AuthContext);
}
