import { createContext, useContext, useEffect, useMemo, useState } from 'react';
import { api } from '../api/client';
import { useAuth } from './AuthContext';
import { LEVEL_ORDER, homeTierOf, levelIndex } from '../utils/unitTier';

// SRS §13.3 / DASH-002 — every authenticated screen runs in the
// context of a selected unit (level + id). Higher-level users can
// switch into any subordinate unit's view; lower-level users are
// pinned to their own.
const UnitContext = createContext(null);
const STORAGE_KEY = 'pnap_unit_ctx';

// The persisted context is STAMPED WITH THE USER WHO SET IT.
//
// It used to be a bare {unitLevel, unitId, unitName} under a single
// global key, and logout() did not remove it. So the context outlived
// the session: sign out of Super Admin and into an Area Admin on the
// same browser, and the top-left button still read "CENTRAL · PKNAP
// Central", and Assign Cabinet Roles still listed the previous
// account's unit until you manually picked a new one. Binding the row
// to a user id fixes that even when logout never runs — an expired
// token, a closed tab, a second account in the same browser.
function readStored(userId) {
  try {
    const raw = JSON.parse(localStorage.getItem(STORAGE_KEY));
    if (!raw || !raw.unitLevel || !raw.unitId) return null;
    // No stamp = written by the old build, or by a different account.
    // Either way it is not ours; discard rather than inherit it.
    if (!raw.userId || String(raw.userId) !== String(userId || '')) return null;
    return { unitLevel: raw.unitLevel, unitId: raw.unitId, unitName: raw.unitName };
  } catch {
    return null;
  }
}

export function UnitProvider({ children }) {
  const { user } = useAuth();
  const [provinces, setProvinces] = useState([]);
  const [districts, setDistricts] = useState([]);
  const [areas, setAreas] = useState([]);
  const [units, setUnits] = useState([]);

  // AuthContext seeds `user` synchronously from its own localStorage
  // cache, so the owner check is available on the very first render —
  // a foreign context is never painted, not even for one frame.
  const [ctx, setCtx] = useState(() => readStored(user?._id));

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
    const isHigherAdmin = ['SUPER_ADMIN','CENTRAL_ADMIN','PROVINCE_ADMIN','DISTRICT_ADMIN']
      .some((r) => user.roles?.includes(r));

    // CENTRAL_ADMIN — the national tier. It has no territorial scope
    // key of its own (it is responsible for every province), so its
    // home context is the CENTRAL singleton; that is what makes
    // /unit/breakdown list Provinces.
    //
    // Like the AREA_ADMIN branch below, this must also correct a STALE
    // context, not just fill an empty one: ctx is hydrated from
    // localStorage, so a browser that previously held a lower-level
    // context (a district, an area, a basic unit) would keep it and
    // the Province Breakdown would silently render the wrong tier's
    // children. CENTRAL and PROVINCE are both legitimate for this
    // persona — the cabinet page drops them onto a province on
    // purpose — so only levels below province are reset.
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

    // PROVINCE_ADMIN / DISTRICT_ADMIN had NO correction branch at all.
    // Central Admin, Area Admin, plain members and cabinet-role holders
    // each got one; these two fell through every case, so whatever
    // context happened to be in localStorage simply persisted — which
    // is why Assign Cabinet Roles opened on the previous unit until you
    // picked a new one by hand. They now default to their own tier and
    // reject anything above it, exactly like the Area Admin branch.
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
        // The unit's name comes from the AREA, never from the admin's
        // own fullName. It used to be derived by stripping the literal
        // " Area Admin" suffix off the user's name — which only ever
        // worked for the auto-provisioned "<Area> Area Admin" accounts.
        // For an admin created by hand through Manage Organization, the
        // suffix isn't there, so the strip was a no-op and the top-left
        // context button displayed the PERSON'S NAME where a unit name
        // belongs ("AREA · Shumail Khan").
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
          .catch(() => { /* keep the generic label */ });
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
    if (ctx && user?._id) {
      localStorage.setItem(STORAGE_KEY, JSON.stringify({ ...ctx, userId: user._id }));
    } else {
      localStorage.removeItem(STORAGE_KEY);
    }
  }, [ctx, user?._id]);

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
