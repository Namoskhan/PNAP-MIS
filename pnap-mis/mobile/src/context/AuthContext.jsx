import { createContext, useContext, useEffect, useMemo, useState } from 'react';
import { Platform } from 'react-native';
import { Storage } from '../utils/storage';
import { api } from '../api/client';

// Port of web/src/context/AuthContext.jsx.
// Uses cross-platform Storage (SecureStore on Native, localStorage on Web).

const AuthContext = createContext(null);
const TOKEN_KEY = 'pnap_token';
const USER_KEY = 'pnap_user';
const ACTIVE_ROLE_KEY = 'pnap_active_role';

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
  // Synchronously seed from localStorage on Web if available to prevent flash/race
  const [user, setUser] = useState(() => {
    if (Platform.OS === 'web' && typeof window !== 'undefined' && window.localStorage) {
      try {
        const raw = window.localStorage.getItem(USER_KEY);
        return raw ? JSON.parse(raw) : null;
      } catch {
        return null;
      }
    }
    return null;
  });

  const [activeRole, setActiveRoleRaw] = useState(() => {
    if (Platform.OS === 'web' && typeof window !== 'undefined' && window.localStorage) {
      try {
        return window.localStorage.getItem(ACTIVE_ROLE_KEY) || null;
      } catch {
        return null;
      }
    }
    return null;
  });

  const [loading, setLoading] = useState(() => {
    if (Platform.OS === 'web' && typeof window !== 'undefined' && window.localStorage) {
      return false;
    }
    return true;
  });

  // Hydrate from Storage on first mount (async for native SecureStore).
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const [rawUser, rawRole] = await Promise.all([
          Storage.getItem(USER_KEY),
          Storage.getItem(ACTIVE_ROLE_KEY),
        ]);
        if (cancelled) return;
        if (rawUser) {
          try {
            setUser(JSON.parse(rawUser));
          } catch (e) {
            console.warn('[AuthContext] Parse user error:', e);
          }
        }
        if (rawRole) {
          setActiveRoleRaw(rawRole);
        }
      } catch (e) {
        console.warn('[AuthContext] Hydration error:', e);
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  async function setActiveRole(role) {
    setActiveRoleRaw(role);
    if (role) {
      await Storage.setItem(ACTIVE_ROLE_KEY, role);
    } else {
      await Storage.removeItem(ACTIVE_ROLE_KEY);
    }
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

  // Auto-pick active role for multi-role users when none is selected or selected is invalid.
  useEffect(() => {
    if (loading) return; // CRITICAL: Never run auto-pick or wipe activeRole while Storage is still hydrating!
    if (!user) {
      if (activeRole) {
        setActiveRoleRaw(null);
        Storage.removeItem(ACTIVE_ROLE_KEY).catch(() => {});
      }
      return;
    }
    const isSuper = (user.roles || []).includes('SUPER_ADMIN') || user.isBootstrap;
    if (isSuper) {
      if (activeRole) {
        setActiveRoleRaw(null);
        Storage.removeItem(ACTIVE_ROLE_KEY).catch(() => {});
      }
      return;
    }
    const all = user.roles || [];
    if (all.length <= 1) {
      if (activeRole) setActiveRole(null);
      return;
    }
    const deadCustom = activeRole
      && !ROLE_PRIORITY.includes(activeRole)
      && ((user.rolePermissions?.[activeRole]?.length ?? 0) === 0);
    if (!activeRole || !all.includes(activeRole) || deadCustom) {
      setActiveRole(pickDefault(user));
    }
  }, [user, activeRole, loading]);

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
