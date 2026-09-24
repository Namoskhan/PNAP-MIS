import { createContext, useContext, useEffect, useMemo, useState } from 'react';
import { Platform } from 'react-native';
import { Storage } from '../utils/storage';
import { api, setUnauthorizedHandler } from '../api/client';

// Port of web/src/context/AuthContext.jsx.
// Uses cross-platform Storage (SecureStore on Native, localStorage on Web).

const AuthContext = createContext(null);
const TOKEN_KEY = 'pnap_token';
const USER_KEY = 'pnap_user';
const ACTIVE_ROLE_KEY = 'pnap_active_role';
const REMEMBER_ME_KEY = 'pnap_remember_me';
const SESSION_EXPIRY_KEY = 'pnap_session_expiry';
const SEVEN_DAYS_MS = 7 * 24 * 60 * 60 * 1000;
const TWELVE_HOURS_MS = 12 * 60 * 60 * 1000;

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

  // Listen for global 401s from client.js
  useEffect(() => {
    setUnauthorizedHandler(() => {
      setUser(null);
      setActiveRoleRaw(null);
    });
    return () => setUnauthorizedHandler(null);
  }, []);

  // Hydrate from Storage on first mount (async for native SecureStore).
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const [rawUser, rawRole, rawToken, rawExpiry] = await Promise.all([
          Storage.getItem(USER_KEY),
          Storage.getItem(ACTIVE_ROLE_KEY),
          Storage.getItem(TOKEN_KEY),
          Storage.getItem(SESSION_EXPIRY_KEY),
        ]);
        if (cancelled) return;

        // Check if session has expired past 7 days (or 12h without rememberMe)
        if (rawExpiry) {
          const expiry = Number(rawExpiry);
          if (expiry > 0 && Date.now() > expiry) {
            console.log('[AuthContext] Session expired past duration; clearing credentials.');
            await Promise.all([
              Storage.removeItem(TOKEN_KEY),
              Storage.removeItem(USER_KEY),
              Storage.removeItem(ACTIVE_ROLE_KEY),
              Storage.removeItem(SESSION_EXPIRY_KEY),
            ]);
            setUser(null);
            setActiveRoleRaw(null);
            setLoading(false);
            return;
          }
        }

        if (rawUser && rawToken) {
          try {
            setUser(JSON.parse(rawUser));
          } catch (e) {
            console.warn('[AuthContext] Parse user error:', e);
          }
        } else if (!rawToken) {
          setUser(null);
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

      // Sliding window extension: if rememberMe is enabled, extend session expiry by 7 days
      const rawRemember = await Storage.getItem(REMEMBER_ME_KEY);
      if (rawRemember === 'true') {
        const newExpiry = Date.now() + SEVEN_DAYS_MS;
        await Storage.setItem(SESSION_EXPIRY_KEY, String(newExpiry));
      }

      return fresh;
    } catch {
      // Offline / network failure: retain cached user and credentials
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
    const dashboard = user.dashboardAccessByRole?.[activeRole];
    return {
      ...user,
      roles: [activeRole],
      allRoles: all,
      permissions: perms,
      canViewExecutiveDashboard: Boolean(dashboard),
      dashboardScope: dashboard?.level === 'CENTRAL' ? null : dashboard,
    };
  }, [user, activeRole]);

  async function login(identifier, password, rememberMe = true) {
    setLoading(true);
    try {
      const res = await api.post('/auth/login', {
        identifier,
        password,
        rememberMe: Boolean(rememberMe),
      });
      const { token, user: u } = res.data.data;
      const durationMs = rememberMe ? SEVEN_DAYS_MS : TWELVE_HOURS_MS;
      const expiry = Date.now() + durationMs;

      await Promise.all([
        Storage.setItem(TOKEN_KEY, token),
        Storage.setItem(USER_KEY, JSON.stringify(u)),
        Storage.setItem(REMEMBER_ME_KEY, rememberMe ? 'true' : 'false'),
        Storage.setItem(SESSION_EXPIRY_KEY, String(expiry)),
      ]);

      await setActiveRole(null);
      setUser(u);
      return u;
    } finally {
      setLoading(false);
    }
  }

  async function logout() {
    await Promise.all([
      Storage.removeItem(TOKEN_KEY),
      Storage.removeItem(USER_KEY),
      Storage.removeItem(ACTIVE_ROLE_KEY),
      Storage.removeItem('pnap_unit_ctx'),
      Storage.removeItem(SESSION_EXPIRY_KEY),
    ]);
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
