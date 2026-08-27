import { createContext, useContext, useEffect, useMemo, useState } from 'react';
import { Storage } from '../utils/storage';
import { api } from '../api/client';
import { useAuth } from './AuthContext';
import { LEVEL_ORDER, homeTierOf, homeUnitIdOf, levelIndex } from '../utils/unitTier';

// Port of web/src/context/UnitContext.jsx.
// Uses cross-platform Storage (SecureStore on Native, localStorage on Web).

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
    await Storage.setItem(STORAGE_KEY, JSON.stringify({ ...ctx, userId }));
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

  // Hydrate stored context for the current user, or fallback to home tier.
  useEffect(() => {
    if (!user?._id) { setCtxRaw(null); setReady(true); return; }
    readStored(user._id).then((stored) => {
      if (stored) {
        setCtxRaw(stored);
      } else {
        const home = homeTierOf(user);
        const s = user?.scope || {};
        const unitId = homeUnitIdOf(user);
        let unitName = s.basicUnitName || s.areaName || s.districtName || s.provinceName || 'My Unit';
        if (home.level === 'CENTRAL') {
          unitName = 'Central Party';
        }
        setCtxRaw({ unitLevel: home.level, unitId: unitId || 'CENTRAL', unitName });
      }
      setReady(true);
    });
  }, [user?._id]);

  // Load provinces list and correct/pin context based on user roles and scope
  useEffect(() => {
    if (!user) { setProvinces([]); return; }
    api.get('/org/provinces').then((r) => setProvinces(r.data.data || [])).catch(() => {});

    const isHigherAdmin = ['SUPER_ADMIN', 'CENTRAL_ADMIN', 'PROVINCE_ADMIN', 'DISTRICT_ADMIN']
      .some((r) => user.roles?.includes(r));

    const isCentralAdmin = user.roles?.includes('CENTRAL_ADMIN')
      && !user.roles?.includes('SUPER_ADMIN');
    if (isCentralAdmin) {
      const inScope = ctx && (ctx.unitLevel === 'CENTRAL' || ctx.unitLevel === 'PROVINCE');
      if (!inScope) {
        api.get('/org/central')
          .then((r) => setCtx({
            unitLevel: 'CENTRAL',
            unitId: r.data.data._id,
            unitName: r.data.data.name || 'PKNAP Central',
          }))
          .catch(() => {});
      }
    }

    const CABINET_ROLE_CODES = [
      'SECRETARY', 'SENIOR_MAWIN', 'FINANCE_SECRETARY',
      'PRESS_SECRETARY', 'CULTURE_SECRETARY', 'SPORTS_SECRETARY',
      'PRESIDENT', 'SR_VICE_PRESIDENT', 'VICE_PRESIDENT', 'GENERAL_SECRETARY',
      'CHAIRMAN', 'CO_CHAIRMAN', 'SR_VICE_CHAIRMAN', 'VICE_CHAIRMAN', 'FIRST_SECRETARY',
      'OTHER',
    ];
    const isPureMember = user.roles?.includes('MEMBER')
      && !isHigherAdmin && !user.roles?.includes('AREA_ADMIN')
      && !CABINET_ROLE_CODES.some((r) => user.roles?.includes(r));
    if (isPureMember && user.scope?.basicUnitId) {
      const inBu = ctx && ctx.unitLevel === 'BASIC_UNIT'
        && String(ctx.unitId) === String(user.scope.basicUnitId);
      if (!inBu) {
        setCtx({
          unitLevel: 'BASIC_UNIT',
          unitId: user.scope.basicUnitId,
          unitName: 'My Basic Unit',
        });
      }
    }

    const isSuperOrCentral = user.roles?.includes('SUPER_ADMIN')
      || user.roles?.includes('CENTRAL_ADMIN');

    if (!isSuperOrCentral && user.roles?.includes('PROVINCE_ADMIN') && user.scope?.provinceId) {
      const inScope = ctx && (
        ['DISTRICT', 'AREA', 'BASIC_UNIT'].includes(ctx.unitLevel)
        || (ctx.unitLevel === 'PROVINCE' && String(ctx.unitId) === String(user.scope.provinceId))
      );
      if (!inScope) {
        setCtx({ unitLevel: 'PROVINCE', unitId: user.scope.provinceId, unitName: 'My Province' });
        api.get('/org/provinces')
          .then((r) => {
            const p = (r.data.data || [])
              .find((x) => String(x._id) === String(user.scope.provinceId));
            if (p?.name) {
              setCtx((c) => (c && String(c.unitId) === String(user.scope.provinceId)
                ? { ...c, unitName: p.name } : c));
            }
          })
          .catch(() => {});
      }
    }

    if (!isSuperOrCentral && user.roles?.includes('DISTRICT_ADMIN')
      && !user.roles?.includes('PROVINCE_ADMIN') && user.scope?.districtId) {
      const inScope = ctx && (
        ['AREA', 'BASIC_UNIT'].includes(ctx.unitLevel)
        || (ctx.unitLevel === 'DISTRICT' && String(ctx.unitId) === String(user.scope.districtId))
      );
      if (!inScope) {
        setCtx({ unitLevel: 'DISTRICT', unitId: user.scope.districtId, unitName: 'My District' });
        api.get('/org/districts', { params: { provinceId: user.scope.provinceId } })
          .then((r) => {
            const d = (r.data.data || [])
              .find((x) => String(x._id) === String(user.scope.districtId));
            if (d?.name) {
              setCtx((c) => (c && String(c.unitId) === String(user.scope.districtId)
                ? { ...c, unitName: d.name } : c));
            }
          })
          .catch(() => {});
      }
    }

    if (user.roles?.includes('AREA_ADMIN') && !isHigherAdmin && user.scope?.areaId) {
      const inScope = ctx && (
        ctx.unitLevel === 'BASIC_UNIT' ||
        (ctx.unitLevel === 'AREA' && String(ctx.unitId) === String(user.scope.areaId))
      );
      if (!inScope) {
        setCtx({
          unitLevel: 'AREA',
          unitId: user.scope.areaId,
          unitName: 'My Area',
        });
        api.get('/org/areas', { params: { districtId: user.scope.districtId } })
          .then((r) => {
            const area = (r.data.data || [])
              .find((a) => String(a._id) === String(user.scope.areaId));
            if (area?.name) {
              setCtx((c) => (c && String(c.unitId) === String(user.scope.areaId)
                ? { ...c, unitName: area.name }
                : c));
            }
          })
          .catch(() => {});
      }
    }

    const isSeniorMawin = user.roles?.includes('SENIOR_MAWIN') &&
      !isHigherAdmin && !user.roles?.includes('AREA_ADMIN');
    const isSrVicePresident = user.roles?.includes('SR_VICE_PRESIDENT') &&
      !isHigherAdmin && !user.roles?.includes('AREA_ADMIN') &&
      !user.roles?.includes('SENIOR_MAWIN');
    const isFirstSecretary = user.roles?.includes('FIRST_SECRETARY') &&
      !isHigherAdmin && !user.roles?.includes('AREA_ADMIN') &&
      !user.roles?.includes('SENIOR_MAWIN') && !user.roles?.includes('SR_VICE_PRESIDENT');
    const isUnitSecretary = user.roles?.includes('SECRETARY') &&
      !isHigherAdmin && !user.roles?.includes('AREA_ADMIN') &&
      !user.roles?.includes('SENIOR_MAWIN') && !user.roles?.includes('SR_VICE_PRESIDENT') &&
      !user.roles?.includes('FIRST_SECRETARY');
    const isFinanceSec = user.roles?.includes('FINANCE_SECRETARY') &&
      !isHigherAdmin && !user.roles?.includes('AREA_ADMIN') &&
      !user.roles?.includes('SENIOR_MAWIN') && !user.roles?.includes('SR_VICE_PRESIDENT') &&
      !user.roles?.includes('FIRST_SECRETARY') && !user.roles?.includes('SECRETARY');
    const isPresidentOnly = user.roles?.includes('PRESIDENT') &&
      !isHigherAdmin && !user.roles?.includes('AREA_ADMIN') &&
      !user.roles?.includes('SENIOR_MAWIN') && !user.roles?.includes('SR_VICE_PRESIDENT') &&
      !user.roles?.includes('FIRST_SECRETARY') && !user.roles?.includes('SECRETARY') &&
      !user.roles?.includes('FINANCE_SECRETARY');
    const isVicePresidentOnly = user.roles?.includes('VICE_PRESIDENT') &&
      !isHigherAdmin && !user.roles?.includes('AREA_ADMIN') &&
      !user.roles?.includes('SENIOR_MAWIN') && !user.roles?.includes('SR_VICE_PRESIDENT') &&
      !user.roles?.includes('FIRST_SECRETARY') && !user.roles?.includes('SECRETARY') &&
      !user.roles?.includes('FINANCE_SECRETARY') && !user.roles?.includes('PRESIDENT');
    const isGeneralSecretaryOnly = user.roles?.includes('GENERAL_SECRETARY') &&
      !isHigherAdmin && !user.roles?.includes('AREA_ADMIN') &&
      !user.roles?.includes('SENIOR_MAWIN') && !user.roles?.includes('SR_VICE_PRESIDENT') &&
      !user.roles?.includes('FIRST_SECRETARY') && !user.roles?.includes('SECRETARY') &&
      !user.roles?.includes('FINANCE_SECRETARY') && !user.roles?.includes('PRESIDENT') &&
      !user.roles?.includes('VICE_PRESIDENT');
    const centralChairmanRoles = ['CHAIRMAN', 'CO_CHAIRMAN', 'SR_VICE_CHAIRMAN', 'VICE_CHAIRMAN'];
    const isCentralChairmanOnly = centralChairmanRoles.some((r) => user.roles?.includes(r))
      && !isHigherAdmin && !user.roles?.includes('AREA_ADMIN')
      && !user.roles?.includes('SENIOR_MAWIN') && !user.roles?.includes('SR_VICE_PRESIDENT')
      && !user.roles?.includes('FIRST_SECRETARY') && !user.roles?.includes('SECRETARY')
      && !user.roles?.includes('FINANCE_SECRETARY') && !user.roles?.includes('PRESIDENT')
      && !user.roles?.includes('VICE_PRESIDENT') && !user.roles?.includes('GENERAL_SECRETARY');
    const myChairmanRole = isCentralChairmanOnly
      ? centralChairmanRoles.find((r) => user.roles?.includes(r))
      : null;
    const pinRoleCode = isSeniorMawin ? 'SENIOR_MAWIN'
      : isSrVicePresident ? 'SR_VICE_PRESIDENT'
      : isFirstSecretary ? 'FIRST_SECRETARY'
      : isUnitSecretary ? 'SECRETARY'
      : isFinanceSec ? 'FINANCE_SECRETARY'
      : isPresidentOnly ? 'PRESIDENT'
      : isVicePresidentOnly ? 'VICE_PRESIDENT'
      : isGeneralSecretaryOnly ? 'GENERAL_SECRETARY'
      : myChairmanRole
      ? myChairmanRole
      : null;

    const needsGenericPin = !pinRoleCode && !isHigherAdmin
      && !user.roles?.includes('AREA_ADMIN') && !isPureMember && !!user.memberId;
    if ((pinRoleCode || needsGenericPin) && user.memberId) {
      api.get('/roles', { params: { memberId: user.memberId, state: 'APPROVED' } })
        .then(async (r) => {
          const list = r.data.data || [];
          const sm = pinRoleCode
            ? list.find((a) => a.roleCode === pinRoleCode && !a.endedAt)
            : list.find((a) => !a.endedAt);
          if (!sm) return;
          if (ctx && ctx.unitLevel === sm.unitLevel && String(ctx.unitId) === String(sm.unitId)) return;
          let unitName = '';
          try {
            if (sm.unitLevel === 'BASIC_UNIT' && user.scope?.areaId) {
              const lst = await api.get('/org/basic-units', { params: { areaId: user.scope.areaId } });
              const u = lst.data.data.find((b) => String(b._id) === String(sm.unitId));
              unitName = u?.name || '';
            } else if (sm.unitLevel === 'AREA' && user.scope?.districtId) {
              const lst = await api.get('/org/areas', { params: { districtId: user.scope.districtId } });
              const u = lst.data.data.find((a) => String(a._id) === String(sm.unitId));
              unitName = u?.name || '';
            } else if (sm.unitLevel === 'DISTRICT' && user.scope?.provinceId) {
              const lst = await api.get('/org/districts', { params: { provinceId: user.scope.provinceId } });
              const u = lst.data.data.find((d) => String(d._id) === String(sm.unitId));
              unitName = u?.name || '';
            } else if (sm.unitLevel === 'PROVINCE') {
              const lst = await api.get('/org/provinces');
              const u = lst.data.data.find((p) => String(p._id) === String(sm.unitId));
              unitName = u?.name || '';
            } else if (sm.unitLevel === 'CENTRAL') {
              try {
                const c = await api.get('/org/central');
                unitName = c.data.data?.name || 'PKNAP Central';
              } catch { unitName = 'PKNAP Central'; }
            }
          } catch { /* ignore */ }
          setCtx({
            unitLevel: sm.unitLevel,
            unitId: sm.unitId,
            unitName: unitName || 'My Unit',
          });
        })
        .catch(() => {});
    }
  }, [user]);

  async function setCtx(newCtx) {
    if (typeof newCtx === 'function') {
      setCtxRaw((prev) => {
        const resolved = newCtx(prev);
        if (resolved && user?._id) writeStored(resolved, user._id);
        else if (!resolved) Storage.removeItem(STORAGE_KEY);
        return resolved;
      });
    } else {
      setCtxRaw(newCtx);
      if (newCtx && user?._id) await writeStored(newCtx, user._id);
      else if (!newCtx) await Storage.removeItem(STORAGE_KEY);
    }
  }

  async function loadDistricts(provinceId) {
    const r = await api.get('/org/districts', { params: { provinceId } });
    setDistricts(r.data.data || []);
    return r.data.data || [];
  }
  async function loadAreas(districtId) {
    const r = await api.get('/org/areas', { params: { districtId } });
    setAreas(r.data.data || []);
    return r.data.data || [];
  }
  async function loadUnits(areaId) {
    const r = await api.get('/org/basic-units', { params: { areaId } });
    setUnits(r.data.data || []);
    return r.data.data || [];
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

  return (
    <UnitContext.Provider value={value}>
      {children}
    </UnitContext.Provider>
  );
}

export function useUnit() {
  const v = useContext(UnitContext);
  if (!v) throw new Error('useUnit must be used inside UnitProvider');
  return v;
}
