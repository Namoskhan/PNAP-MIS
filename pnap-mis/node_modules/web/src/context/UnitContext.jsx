import { createContext, useContext, useEffect, useMemo, useState } from 'react';
import { api } from '../api/client';
import { useAuth } from './AuthContext';

// SRS §13.3 / DASH-002 — every authenticated screen runs in the
// context of a selected unit (level + id). Higher-level users can
// switch into any subordinate unit's view; lower-level users are
// pinned to their own.
const UnitContext = createContext(null);
const STORAGE_KEY = 'pnap_unit_ctx';

const LEVEL_ORDER = ['CENTRAL', 'PROVINCE', 'DISTRICT', 'AREA', 'BASIC_UNIT'];

export function UnitProvider({ children }) {
  const { user } = useAuth();
  const [provinces, setProvinces] = useState([]);
  const [districts, setDistricts] = useState([]);
  const [areas, setAreas] = useState([]);
  const [units, setUnits] = useState([]);

  const [ctx, setCtx] = useState(() => {
    try { return JSON.parse(localStorage.getItem(STORAGE_KEY)) || null; }
    catch { return null; }
  });

  // /api/org/provinces is auth-gated. Only fetch once the user is
  // logged in; otherwise an anonymous visitor on /register or /login
  // would trigger a 401 and the axios interceptor would bounce them
  // back to /login. Re-runs after login because `user` updates.
  useEffect(() => {
    if (!user) { setProvinces([]); return; }
    api.get('/org/provinces').then((r) => setProvinces(r.data.data)).catch(() => {});

    // Constrain unit context for AREA_ADMINs to their own area or
    // a basic unit beneath it. If no ctx exists yet, default to
    // their area. If a stale ctx from a previous session points
    // higher (PROVINCE / DISTRICT / CENTRAL), reset it — those
    // levels are out of an Area Admin's scope and trying to render
    // a province cabinet from their token would surface as 0
    // members and an "Invalid input" banner.
    const isHigherAdmin = ['SUPER_ADMIN','PROVINCE_ADMIN','DISTRICT_ADMIN']
      .some((r) => user.roles?.includes(r));

    // Pure MEMBER (no admin, no cabinet role) — pin to their Basic
    // Unit so /unit/meetings and /unit/activities show their unit's
    // schedule. Skip if any operator/cabinet role is also held; those
    // branches below take precedence and pin to the unit where they
    // hold their role.
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

    if (user.roles?.includes('AREA_ADMIN') && !isHigherAdmin && user.scope?.areaId) {
      const inScope = ctx && (
        ctx.unitLevel === 'BASIC_UNIT' ||
        (ctx.unitLevel === 'AREA' && String(ctx.unitId) === String(user.scope.areaId))
      );
      if (!inScope) {
        setCtx({
          unitLevel: 'AREA',
          unitId: user.scope.areaId,
          unitName: user.fullName?.replace(' Area Admin', '') || 'My Area',
        });
      }
    }

    // SENIOR_MAWIN / SR_VICE_PRESIDENT / FIRST_SECRETARY / SECRETARY /
    // FINANCE_SECRETARY — pin context to the unit where they hold the
    // active role assignment. SR_VICE_PRESIDENT plays the operator
    // role at PROVINCE level (per the project directive) and
    // FIRST_SECRETARY at CENTRAL (per SRS §5.2).
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
    // PRESIDENT / SR_VICE_PRESIDENT / VICE_PRESIDENT — Province
    // cabinet (SRS §3.3). Pin ctx to the PROVINCE unit where they
    // hold the role so the sidebar / dashboard / cabinet pages target
    // their province.
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
    // GENERAL_SECRETARY at Province (or Central) — pin ctx to the
    // unit where they hold the role.
    const isGeneralSecretaryOnly = user.roles?.includes('GENERAL_SECRETARY') &&
      !isHigherAdmin && !user.roles?.includes('AREA_ADMIN') &&
      !user.roles?.includes('SENIOR_MAWIN') && !user.roles?.includes('SR_VICE_PRESIDENT') &&
      !user.roles?.includes('FIRST_SECRETARY') && !user.roles?.includes('SECRETARY') &&
      !user.roles?.includes('FINANCE_SECRETARY') && !user.roles?.includes('PRESIDENT') &&
      !user.roles?.includes('VICE_PRESIDENT');
    // Central tier ceremonial roles — CHAIRMAN, CO_CHAIRMAN,
    // SR_VICE_CHAIRMAN, VICE_CHAIRMAN. Pin ctx to the CENTRAL
    // singleton unit where their RoleAssignment lives.
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
    // Custom catalogue roles (CUSTOM_*) aren't in the persona chain
    // above, but their holders still operate at the unit where the
    // role is assigned — pin ctx from their first active assignment
    // so unit pages (meetings, finance, cabinet) target the right
    // unit instead of nagging "select a unit context".
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
          // Already pinned to this unit — skip the redundant setCtx
          // (the effect re-runs on every /auth/me poll; without this
          // guard the ctx object churned every cycle).
          if (ctx && ctx.unitLevel === sm.unitLevel && String(ctx.unitId) === String(sm.unitId)) return;
          let unitName = '';
          // Look up a friendly name for the unit so the page header
          // reads "Cabinet · Block 1" instead of an ObjectId.
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
          } catch { /* ignore — fall back to generic label */ }
          setCtx({
            unitLevel: sm.unitLevel,
            unitId: sm.unitId,
            unitName: unitName || 'My Unit',
          });
        })
        .catch(() => {});
    }
  }, [user]);

  useEffect(() => {
    if (ctx) localStorage.setItem(STORAGE_KEY, JSON.stringify(ctx));
    else localStorage.removeItem(STORAGE_KEY);
  }, [ctx]);

  async function loadDistricts(provinceId) {
    const r = await api.get('/org/districts', { params: { provinceId } });
    setDistricts(r.data.data);
    return r.data.data;
  }
  async function loadAreas(districtId) {
    const r = await api.get('/org/areas', { params: { districtId } });
    setAreas(r.data.data);
    return r.data.data;
  }
  async function loadUnits(areaId) {
    const r = await api.get('/org/basic-units', { params: { areaId } });
    setUnits(r.data.data);
    return r.data.data;
  }

  const value = useMemo(
    () => ({
      ctx, setCtx,
      provinces, districts, areas, units,
      loadDistricts, loadAreas, loadUnits,
      LEVEL_ORDER,
    }),
    [ctx, provinces, districts, areas, units]
  );

  return <UnitContext.Provider value={value}>{children}</UnitContext.Provider>;
}

export function useUnit() {
  const v = useContext(UnitContext);
  if (!v) throw new Error('useUnit must be used inside UnitProvider');
  return v;
}
