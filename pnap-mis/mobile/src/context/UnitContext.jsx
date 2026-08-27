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
    return { unitLevel: raw.unitLevel, unitId: raw.unitId, unitName: raw.unitName };
  } catch {
    return null;
  }
}

async function writeStored(ctx, userId) {
  try {
    if (ctx && userId) {
      await Storage.setItem(STORAGE_KEY, JSON.stringify({ ...ctx, userId }));
    } else {
      await Storage.removeItem(STORAGE_KEY);
    }
  } catch { /* ignore */ }
}

export function UnitProvider({ children }) {
  const { user } = useAuth();
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

  // Main context resolution & auto-pinning
  useEffect(() => {
    if (!user?._id) {
      setCtxRaw(null);
      setReady(true);
      return;
    }

    let isCancelled = false;

    async function initializeCtx() {
      const stored = await readStored(user._id);

      const isHigherAdmin = ['SUPER_ADMIN', 'CENTRAL_ADMIN', 'PROVINCE_ADMIN', 'DISTRICT_ADMIN']
        .some((r) => user.roles?.includes(r));
      const isSuperOrCentral = user.roles?.includes('SUPER_ADMIN') || user.roles?.includes('CENTRAL_ADMIN');

      // 1. Central Admin
      if (user.roles?.includes('CENTRAL_ADMIN') && !user.roles?.includes('SUPER_ADMIN')) {
        const inScope = stored && (stored.unitLevel === 'CENTRAL' || stored.unitLevel === 'PROVINCE');
        if (inScope) {
          if (!isCancelled) { setCtxRaw(stored); setReady(true); }
          return;
        }
        try {
          const r = await api.get('/org/central');
          if (!isCancelled && r.data?.data?._id) {
            const next = { unitLevel: 'CENTRAL', unitId: r.data.data._id, unitName: r.data.data.name || 'PKNAP Central' };
            setCtxRaw(next);
            await writeStored(next, user._id);
            setReady(true);
            return;
          }
        } catch {}
      }

      // 2. Province Admin (e.g. KPK Admin)
      if (!isSuperOrCentral && user.roles?.includes('PROVINCE_ADMIN') && user.scope?.provinceId) {
        const inScope = stored && (
          ['DISTRICT', 'AREA', 'BASIC_UNIT'].includes(stored.unitLevel) ||
          (stored.unitLevel === 'PROVINCE' && String(stored.unitId) === String(user.scope.provinceId))
        );
        if (inScope) {
          if (!isCancelled) { setCtxRaw(stored); setReady(true); }
          return;
        }
        try {
          const r = await api.get('/org/provinces');
          const p = (r.data.data || []).find((x) => String(x._id) === String(user.scope.provinceId));
          const unitName = p?.name || 'Khyber Pakhtunkhwa';
          const next = { unitLevel: 'PROVINCE', unitId: user.scope.provinceId, unitName };
          if (!isCancelled) {
            setCtxRaw(next);
            await writeStored(next, user._id);
            setReady(true);
          }
          return;
        } catch {
          const next = { unitLevel: 'PROVINCE', unitId: user.scope.provinceId, unitName: 'My Province' };
          if (!isCancelled) { setCtxRaw(next); setReady(true); }
          return;
        }
      }

      // 3. District Admin
      if (!isSuperOrCentral && user.roles?.includes('DISTRICT_ADMIN') && !user.roles?.includes('PROVINCE_ADMIN') && user.scope?.districtId) {
        const inScope = stored && (
          ['AREA', 'BASIC_UNIT'].includes(stored.unitLevel) ||
          (stored.unitLevel === 'DISTRICT' && String(stored.unitId) === String(user.scope.districtId))
        );
        if (inScope) {
          if (!isCancelled) { setCtxRaw(stored); setReady(true); }
          return;
        }
        try {
          const r = await api.get('/org/districts', { params: { provinceId: user.scope.provinceId } });
          const d = (r.data.data || []).find((x) => String(x._id) === String(user.scope.districtId));
          const unitName = d?.name || 'My District';
          const next = { unitLevel: 'DISTRICT', unitId: user.scope.districtId, unitName };
          if (!isCancelled) {
            setCtxRaw(next);
            await writeStored(next, user._id);
            setReady(true);
          }
          return;
        } catch {
          const next = { unitLevel: 'DISTRICT', unitId: user.scope.districtId, unitName: 'My District' };
          if (!isCancelled) { setCtxRaw(next); setReady(true); }
          return;
        }
      }

      // 4. Area Admin
      if (user.roles?.includes('AREA_ADMIN') && !isHigherAdmin && user.scope?.areaId) {
        const inScope = stored && (
          stored.unitLevel === 'BASIC_UNIT' ||
          (stored.unitLevel === 'AREA' && String(stored.unitId) === String(user.scope.areaId))
        );
        if (inScope) {
          if (!isCancelled) { setCtxRaw(stored); setReady(true); }
          return;
        }
        try {
          const r = await api.get('/org/areas', { params: { districtId: user.scope.districtId } });
          const a = (r.data.data || []).find((x) => String(x._id) === String(user.scope.areaId));
          const unitName = a?.name || 'My Area';
          const next = { unitLevel: 'AREA', unitId: user.scope.areaId, unitName };
          if (!isCancelled) {
            setCtxRaw(next);
            await writeStored(next, user._id);
            setReady(true);
          }
          return;
        } catch {
          const next = { unitLevel: 'AREA', unitId: user.scope.areaId, unitName: 'My Area' };
          if (!isCancelled) { setCtxRaw(next); setReady(true); }
          return;
        }
      }

      // 5. Cabinet roles (Senior Mawin, Secretary, Finance Secretary, President, etc.)
      const CABINET_ROLE_CODES = [
        'SECRETARY', 'SENIOR_MAWIN', 'FINANCE_SECRETARY',
        'PRESS_SECRETARY', 'CULTURE_SECRETARY', 'SPORTS_SECRETARY',
        'PRESIDENT', 'SR_VICE_PRESIDENT', 'VICE_PRESIDENT', 'GENERAL_SECRETARY',
        'CHAIRMAN', 'CO_CHAIRMAN', 'SR_VICE_CHAIRMAN', 'VICE_CHAIRMAN', 'FIRST_SECRETARY',
        'OTHER',
      ];
      const hasCabinetRole = CABINET_ROLE_CODES.some((r) => user.roles?.includes(r));
      if (hasCabinetRole && user.memberId) {
        try {
          const r = await api.get('/roles', { params: { memberId: user.memberId, state: 'APPROVED' } });
          const list = r.data.data || [];
          const activeRole = list.find((a) => !a.endedAt);
          if (activeRole) {
            let unitName = '';
            try {
              if (activeRole.unitLevel === 'BASIC_UNIT' && user.scope?.areaId) {
                const lst = await api.get('/org/basic-units', { params: { areaId: user.scope.areaId } });
                const u = lst.data.data.find((b) => String(b._id) === String(activeRole.unitId));
                unitName = u?.name || '';
              } else if (activeRole.unitLevel === 'AREA' && user.scope?.districtId) {
                const lst = await api.get('/org/areas', { params: { districtId: user.scope.districtId } });
                const u = lst.data.data.find((a) => String(a._id) === String(activeRole.unitId));
                unitName = u?.name || '';
              } else if (activeRole.unitLevel === 'DISTRICT' && user.scope?.provinceId) {
                const lst = await api.get('/org/districts', { params: { provinceId: user.scope.provinceId } });
                const u = lst.data.data.find((d) => String(d._id) === String(activeRole.unitId));
                unitName = u?.name || '';
              } else if (activeRole.unitLevel === 'PROVINCE') {
                const lst = await api.get('/org/provinces');
                const u = lst.data.data.find((p) => String(p._id) === String(activeRole.unitId));
                unitName = u?.name || '';
              } else if (activeRole.unitLevel === 'CENTRAL') {
                try {
                  const c = await api.get('/org/central');
                  unitName = c.data.data?.name || 'PKNAP Central';
                } catch { unitName = 'PKNAP Central'; }
              }
            } catch {}
            const next = {
              unitLevel: activeRole.unitLevel,
              unitId: activeRole.unitId,
              unitName: unitName || 'My Unit',
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

      // 6. Pure Member
      const isPureMember = user.roles?.includes('MEMBER') && !isHigherAdmin && !user.roles?.includes('AREA_ADMIN') && !hasCabinetRole;
      if (isPureMember && user.scope?.basicUnitId) {
        const next = {
          unitLevel: 'BASIC_UNIT',
          unitId: user.scope.basicUnitId,
          unitName: 'My Basic Unit',
        };
        if (!isCancelled) {
          setCtxRaw(next);
          await writeStored(next, user._id);
          setReady(true);
        }
        return;
      }

      // 7. Fallback to stored or home tier
      if (stored) {
        if (!isCancelled) { setCtxRaw(stored); setReady(true); }
      } else {
        const home = homeTierOf(user);
        const s = user?.scope || {};
        const unitId = homeUnitIdOf(user);
        let unitName = s.basicUnitName || s.areaName || s.districtName || s.provinceName || 'My Unit';
        if (home.level === 'CENTRAL') {
          unitName = 'PKNAP Central';
          try {
            const r = await api.get('/org/central');
            if (!isCancelled && r.data?.data?._id) {
              const next = { unitLevel: 'CENTRAL', unitId: r.data.data._id, unitName: r.data.data.name || 'PKNAP Central' };
              setCtxRaw(next);
              await writeStored(next, user._id);
              setReady(true);
              return;
            }
          } catch {}
        }
        const next = { unitLevel: home.level, unitId, unitName };
        if (!isCancelled) {
          setCtxRaw(next);
          await writeStored(next, user._id);
          setReady(true);
        }
      }
    }

    initializeCtx();

    return () => { isCancelled = true; };
  }, [user?._id, user?.roles?.join(','), user?.memberId]);

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
