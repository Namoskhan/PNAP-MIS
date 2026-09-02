import { createContext, useContext, useEffect, useMemo, useState } from 'react';
import { Storage } from '../utils/storage';
import { api } from '../api/client';
import { useAuth } from './AuthContext';
import { LEVEL_ORDER, homeTierOf, homeUnitIdOf } from '../utils/unitTier';

const UnitContext = createContext(null);
const STORAGE_KEY = 'pnap_unit_ctx';

async function readStored(userId) {
  try {
    const raw = JSON.parse(await Storage.getItem(STORAGE_KEY) || 'null');
    if (!raw || !raw.unitLevel || !raw.unitId) return null;
    if (!raw.userId || String(raw.userId) !== String(userId || '')) return null;
    return { unitLevel: raw.unitLevel, unitId: raw.unitId, unitName: raw.unitName, roleCode: raw.roleCode };
  } catch {
    return null;
  }
}

async function writeStored(ctx, userId, roleCode) {
  try {
    if (ctx && userId) {
      await Storage.setItem(STORAGE_KEY, JSON.stringify({ ...ctx, userId, roleCode }));
    } else {
      await Storage.removeItem(STORAGE_KEY);
    }
  } catch { /* ignore */ }
}

async function resolveUnitName(unitLevel, unitId, userScope) {
  if (!unitLevel || !unitId) return 'My Unit';
  if (unitLevel === 'CENTRAL') {
    try {
      const c = await api.get('/org/central');
      return c.data?.data?.name || 'PKNAP Central';
    } catch {
      return 'PKNAP Central';
    }
  }
  if (unitLevel === 'PROVINCE') {
    try {
      const r = await api.get('/org/provinces');
      const p = (r.data.data || []).find((x) => String(x._id) === String(unitId));
      return p?.name || userScope?.provinceName || 'My Province';
    } catch {
      return userScope?.provinceName || 'My Province';
    }
  }
  if (unitLevel === 'DISTRICT') {
    try {
      const pId = userScope?.provinceId;
      const r = await api.get('/org/districts', { params: pId ? { provinceId: pId } : undefined });
      const d = (r.data.data || []).find((x) => String(x._id) === String(unitId));
      return d?.name || userScope?.districtName || 'My District';
    } catch {
      return userScope?.districtName || 'My District';
    }
  }
  if (unitLevel === 'AREA') {
    try {
      const dId = userScope?.districtId;
      const r = await api.get('/org/areas', { params: dId ? { districtId: dId } : undefined });
      const a = (r.data.data || []).find((x) => String(x._id) === String(unitId));
      return a?.name || userScope?.areaName || 'My Area';
    } catch {
      return userScope?.areaName || 'My Area';
    }
  }
  if (unitLevel === 'BASIC_UNIT') {
    try {
      const aId = userScope?.areaId;
      const r = await api.get('/org/basic-units', { params: aId ? { areaId: aId } : undefined });
      const u = (r.data.data || []).find((x) => String(x._id) === String(unitId));
      return u?.name || userScope?.basicUnitName || 'My Basic Unit';
    } catch {
      return userScope?.basicUnitName || 'My Basic Unit';
    }
  }
  return 'My Unit';
}

export function UnitProvider({ children }) {
  const { user, activeRole } = useAuth();
  const [provinces, setProvinces] = useState([]);
  const [districts, setDistricts] = useState([]);
  const [areas, setAreas] = useState([]);
  const [units, setUnits] = useState([]);
  const [ctx, setCtxRaw] = useState(null);
  const [ready, setReady] = useState(false);

  // Load provinces list when authenticated
  useEffect(() => {
    if (!user) { setProvinces([]); return; }
    api.get('/org/provinces').then((r) => setProvinces(r.data.data || [])).catch(() => {});
  }, [user]);

  // Main context resolution & auto-pinning to active role / persona
  useEffect(() => {
    if (!user?._id) {
      setCtxRaw(null);
      setReady(true);
      return;
    }

    let isCancelled = false;

    async function syncUnitContext() {
      const targetRole = activeRole || (user.roles?.length === 1 ? user.roles[0] : null);

      // 1. If user switched to or is explicitly focused on a specific activeRole:
      if (targetRole) {
        // A. Central Admin / Super Admin
        if (targetRole === 'SUPER_ADMIN' || targetRole === 'CENTRAL_ADMIN') {
          const unitName = await resolveUnitName('CENTRAL', 'CENTRAL', user.scope);
          const next = { unitLevel: 'CENTRAL', unitId: 'CENTRAL', unitName };
          if (!isCancelled) {
            setCtxRaw(next);
            await writeStored(next, user._id, targetRole);
            setReady(true);
          }
          return;
        }

        // B. Province Admin
        if (targetRole === 'PROVINCE_ADMIN' && user.scope?.provinceId) {
          const unitName = await resolveUnitName('PROVINCE', user.scope.provinceId, user.scope);
          const next = { unitLevel: 'PROVINCE', unitId: user.scope.provinceId, unitName };
          if (!isCancelled) {
            setCtxRaw(next);
            await writeStored(next, user._id, targetRole);
            setReady(true);
          }
          return;
        }

        // C. District Admin
        if (targetRole === 'DISTRICT_ADMIN' && user.scope?.districtId) {
          const unitName = await resolveUnitName('DISTRICT', user.scope.districtId, user.scope);
          const next = { unitLevel: 'DISTRICT', unitId: user.scope.districtId, unitName };
          if (!isCancelled) {
            setCtxRaw(next);
            await writeStored(next, user._id, targetRole);
            setReady(true);
          }
          return;
        }

        // D. Area Admin
        if (targetRole === 'AREA_ADMIN' && user.scope?.areaId) {
          const unitName = await resolveUnitName('AREA', user.scope.areaId, user.scope);
          const next = { unitLevel: 'AREA', unitId: user.scope.areaId, unitName };
          if (!isCancelled) {
            setCtxRaw(next);
            await writeStored(next, user._id, targetRole);
            setReady(true);
          }
          return;
        }

        // E. Pure Member
        if (targetRole === 'MEMBER' && user.scope?.basicUnitId) {
          const unitName = await resolveUnitName('BASIC_UNIT', user.scope.basicUnitId, user.scope);
          const next = { unitLevel: 'BASIC_UNIT', unitId: user.scope.basicUnitId, unitName };
          if (!isCancelled) {
            setCtxRaw(next);
            await writeStored(next, user._id, targetRole);
            setReady(true);
          }
          return;
        }

        // F. Cabinet / Office-Holder Role (SENIOR_MAWIN, GENERAL_SECRETARY, PRESS_SECRETARY, etc.)
        if (user.memberId) {
          try {
            const r = await api.get('/roles', { params: { memberId: user.memberId, state: 'APPROVED' } });
            const list = r.data.data || [];
            // Match the specific target active role assignment!
            const matchedAssignment = list.find((a) => a.roleCode === targetRole && !a.endedAt);
            if (matchedAssignment) {
              const unitName = await resolveUnitName(matchedAssignment.unitLevel, matchedAssignment.unitId, user.scope);
              const next = {
                unitLevel: matchedAssignment.unitLevel,
                unitId: matchedAssignment.unitId,
                unitName,
              };
              if (!isCancelled) {
                setCtxRaw(next);
                await writeStored(next, user._id, targetRole);
                setReady(true);
              }
              return;
            }
          } catch {}
        }
      }

      // 2. Default multi-role view (no specific activeRole selected):
      const stored = await readStored(user._id);
      if (stored && !stored.roleCode) {
        if (!isCancelled) { setCtxRaw(stored); setReady(true); }
        return;
      }

      // Fallback: check if user has approved cabinet roles or scope
      if (user.memberId) {
        try {
          const r = await api.get('/roles', { params: { memberId: user.memberId, state: 'APPROVED' } });
          const list = r.data.data || [];
          const firstActive = list.find((a) => !a.endedAt);
          if (firstActive) {
            const unitName = await resolveUnitName(firstActive.unitLevel, firstActive.unitId, user.scope);
            const next = {
              unitLevel: firstActive.unitLevel,
              unitId: firstActive.unitId,
              unitName,
            };
            if (!isCancelled) {
              setCtxRaw(next);
              await writeStored(next, user._id);
              setReady(true);
            }
            return;
          }
        } catch {}
      }

      // Fallback to home tier
      const home = homeTierOf(user);
      const s = user?.scope || {};
      const unitId = homeUnitIdOf(user);
      const unitName = await resolveUnitName(home.level, unitId, s);
      const next = { unitLevel: home.level, unitId, unitName };
      if (!isCancelled) {
        setCtxRaw(next);
        await writeStored(next, user._id);
        setReady(true);
      }
    }

    syncUnitContext();

    return () => {
      isCancelled = true;
    };
  }, [user?._id, activeRole, user?.roles?.join(','), user?.memberId]);

  async function setCtx(newCtx) {
    if (typeof newCtx === 'function') {
      setCtxRaw((prev) => {
        const resolved = newCtx(prev);
        if (resolved && user?._id) writeStored(resolved, user._id);
        else if (!resolved) Storage.removeItem(STORAGE_KEY);
        return resolved;
      });
    } else {
      let resolvedCtx = newCtx;
      if (resolvedCtx && resolvedCtx.unitLevel === 'CENTRAL' && (!resolvedCtx.unitId || resolvedCtx.unitId === 'CENTRAL')) {
        try {
          const r = await api.get('/org/central');
          if (r.data?.data?._id) {
            resolvedCtx = { ...resolvedCtx, unitId: r.data.data._id, unitName: r.data.data.name || 'PKNAP Central' };
          }
        } catch {}
      }
      setCtxRaw(resolvedCtx);
      if (resolvedCtx && user?._id) await writeStored(resolvedCtx, user._id);
      else if (!resolvedCtx) await Storage.removeItem(STORAGE_KEY);
    }
  }

  async function loadDistricts(provinceId) {
    if (!provinceId) return [];
    try {
      const r = await api.get('/org/districts', { params: { provinceId } });
      const list = r.data.data || [];
      setDistricts(list);
      return list;
    } catch {
      return [];
    }
  }

  async function loadAreas(districtId) {
    if (!districtId) return [];
    try {
      const r = await api.get('/org/areas', { params: { districtId } });
      const list = r.data.data || [];
      setAreas(list);
      return list;
    } catch {
      return [];
    }
  }

  async function loadUnits(areaId) {
    if (!areaId) return [];
    try {
      const r = await api.get('/org/basic-units', { params: { areaId } });
      const list = r.data.data || [];
      setUnits(list);
      return list;
    } catch {
      return [];
    }
  }

  const value = useMemo(
    () => ({
      ctx,
      setCtx,
      provinces,
      districts,
      areas,
      units,
      loadDistricts,
      loadAreas,
      loadUnits,
      ready,
      LEVEL_ORDER,
    }),
    [ctx, provinces, districts, areas, units, ready]
  );

  return <UnitContext.Provider value={value}>{children}</UnitContext.Provider>;
}

export function useUnit() {
  const v = useContext(UnitContext);
  if (!v) throw new Error('useUnit must be used inside UnitProvider');
  return v;
}
