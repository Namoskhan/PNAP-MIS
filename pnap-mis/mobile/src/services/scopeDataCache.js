import { api, isNetworkError } from '../api/client';
import { setCache, getCache, AppStorage } from './offlineStorage';

const LAST_SYNC_KEY = 'pnap_scoped_cache_meta';
const SYNC_THROTTLE_MS = 10 * 60 * 1000; // 10 minutes throttle for background sync

/**
 * Returns metadata about the last successful scoped data cache sync
 */
export async function getScopedCacheMeta() {
  try {
    const raw = await AppStorage.getItem(LAST_SYNC_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

/**
 * Retrieves eligible attendees with hierarchical fallback:
 * 1. attendees_{unitLevel}_{unitId}_{body}
 * 2. attendees_{unitLevel}_{unitId}_EXECUTIVE
 * 3. attendees_{unitLevel}_{unitId}_all
 * 4. members_{unitLevel}_{unitId}
 */
export async function getCachedAttendees(unitLevel, unitId, body) {
  if (!unitLevel || !unitId) return [];

  // Try exact stream cache
  const exact = await getCache(`attendees_${unitLevel}_${unitId}_${body}`);
  if (exact && exact.length > 0) return exact;

  // Fallback to executive attendees
  const exec = await getCache(`attendees_${unitLevel}_${unitId}_EXECUTIVE`);
  if (exec && exec.length > 0) return exec;

  // Fallback to all attendees
  const all = await getCache(`attendees_${unitLevel}_${unitId}_all`);
  if (all && all.length > 0) return all;

  // Fallback to cached members of that unit
  const members = await getCache(`members_${unitLevel}_${unitId}`);
  if (members && members.length > 0) return members;

  return [];
}

/**
 * Pre-caches only relevant data for the user's role and unit scope.
 * 
 * Example: Senior Mawin of District:
 * - Caches eligible meeting attendees (chairperson candidates) for District Executive, Committee, General Body
 * - Caches District cabinet members & roles
 * - Caches members within that District scope
 * - Caches Areas and Basic Units within that District scope
 * - Caches Event Types (Meetings & Activities)
 * - Caches current active meetings & activities for that District
 */
export async function syncUserScopeCache(user, ctx, options = {}) {
  const { force = false, onProgress } = options;

  if (!user?._id) return { skipped: true, reason: 'No user authenticated' };

  // Check last sync throttle unless forced
  if (!force) {
    const meta = await getScopedCacheMeta();
    if (meta && meta.lastSync && Date.now() - meta.lastSync < SYNC_THROTTLE_MS) {
      return { skipped: true, reason: 'Throttled (recently synced)', meta };
    }
  }

  const scope = user.scope || {};
  const unitLevel = ctx?.unitLevel || (
    scope.basicUnitId ? 'BASIC_UNIT'
      : (scope.areaId ? 'AREA'
      : (scope.districtId ? 'DISTRICT'
      : (scope.provinceId ? 'PROVINCE' : 'CENTRAL')))
  );

  const unitId = ctx?.unitId || (
    unitLevel === 'BASIC_UNIT' ? scope.basicUnitId
      : (unitLevel === 'AREA' ? scope.areaId
      : (unitLevel === 'DISTRICT' ? scope.districtId
      : (unitLevel === 'PROVINCE' ? scope.provinceId : 'CENTRAL')))
  );

  const steps = [];

  // Helper safe fetcher that won't throw or abort other steps
  const safeFetch = async (label, fn) => {
    try {
      await fn();
      steps.push({ label, success: true });
    } catch (err) {
      if (isNetworkError(err)) {
        // If device lost connection, stop early
        throw err;
      }
      steps.push({ label, success: false, err: err?.message });
    }
  };

  try {
    if (onProgress) onProgress({ step: 'EVENT_TYPES', message: 'Caching event types...' });

    // 1. Event Types (Meetings & Activities)
    await safeFetch('Event Types (Meeting)', async () => {
      const res = await api.get('/events/types', { params: { entity: 'MEETING' } });
      const data = res.data?.data || [];
      await setCache('event_types_MEETING_all', data);
      await setCache('event_types_MEETING_EXECUTIVE', data.filter((t) => ['EXC', 'EXECUTIVE'].includes(String(t.code).toUpperCase())));
      await setCache('event_types_MEETING_COMMITTEE', data.filter((t) => ['CMP', 'COMMITTEE'].includes(String(t.code).toUpperCase())));
    });

    await safeFetch('Event Types (Activity)', async () => {
      const res = await api.get('/events/types', { params: { entity: 'ACTIVITY' } });
      const data = res.data?.data || [];
      await setCache('event_types_ACTIVITY_all', data);
    });

    // 2. Organization Units (Provinces, Districts, Areas, Basic Units in user's jurisdiction)
    if (onProgress) onProgress({ step: 'ORG_UNITS', message: 'Caching local unit hierarchy...' });

    await safeFetch('Org Provinces', async () => {
      const res = await api.get('/org/provinces');
      await setCache('org_provinces', res.data?.data || []);
    });

    const provinceId = scope.provinceId;
    if (provinceId) {
      await safeFetch('Org Districts', async () => {
        const res = await api.get('/org/districts', { params: { provinceId } });
        await setCache(`org_districts_${provinceId}`, res.data?.data || []);
      });
    }

    const districtId = scope.districtId || (unitLevel === 'DISTRICT' ? unitId : null);
    if (districtId && districtId !== 'CENTRAL') {
      await safeFetch('Org Areas', async () => {
        const res = await api.get('/org/areas', { params: { districtId } });
        const areas = res.data?.data || [];
        await setCache(`org_areas_${districtId}`, areas);

        // Pre-cache basic units for each area in this district
        for (const a of areas.slice(0, 10)) {
          try {
            const buRes = await api.get('/org/basic-units', { params: { areaId: a._id } });
            await setCache(`org_basic_units_${a._id}`, buRes.data?.data || []);
          } catch {}
        }
      });

      await safeFetch('Org Basic Units', async () => {
        const res = await api.get('/org/basic-units', { params: { districtId } });
        await setCache(`org_basic_units_district_${districtId}`, res.data?.data || []);
      });
    }

    const areaId = scope.areaId || (unitLevel === 'AREA' ? unitId : null);
    if (areaId && areaId !== 'CENTRAL') {
      await safeFetch('Org Basic Units for Area', async () => {
        const res = await api.get('/org/basic-units', { params: { areaId } });
        await setCache(`org_basic_units_${areaId}`, res.data?.data || []);
      });
    }

    // 3. Eligible Attendees / Chairperson Candidates for User's Unit
    if (unitLevel && unitId) {
      if (onProgress) onProgress({ step: 'ATTENDEES', message: 'Caching chairperson candidates...' });

      // Executive Meeting Attendees (Cabinet members)
      await safeFetch('Eligible Attendees (Executive)', async () => {
        const res = await api.get('/meetings/eligible-attendees', {
          params: { unitLevel, unitId, body: 'EXECUTIVE' },
        });
        const data = res.data?.data || [];
        await setCache(`attendees_${unitLevel}_${unitId}_EXECUTIVE`, data);
        await setCache(`attendees_${unitLevel}_${unitId}_all`, data);
      });

      // Committee Meeting Attendees
      await safeFetch('Eligible Attendees (Committee)', async () => {
        const res = await api.get('/meetings/eligible-attendees', {
          params: { unitLevel, unitId, body: 'COMMITTEE' },
        });
        await setCache(`attendees_${unitLevel}_${unitId}_COMMITTEE`, res.data?.data || []);
      });

      // General Body Meeting Attendees
      await safeFetch('Eligible Attendees (General Body)', async () => {
        const res = await api.get('/meetings/eligible-attendees', {
          params: { unitLevel, unitId, body: 'GENERAL_BODY' },
        });
        await setCache(`attendees_${unitLevel}_${unitId}_GENERAL_BODY`, res.data?.data || []);
      });

      // Jirga (if Provincial or Central)
      if (unitLevel === 'PROVINCE' || unitLevel === 'CENTRAL') {
        await safeFetch('Eligible Attendees (Jirga)', async () => {
          const res = await api.get('/meetings/eligible-attendees', {
            params: { unitLevel, unitId, body: 'JIRGA' },
          });
          await setCache(`attendees_${unitLevel}_${unitId}_JIRGA`, res.data?.data || []);
        });
      }

      // 4. Cabinet Members & Role Assignments of User's Unit
      if (onProgress) onProgress({ step: 'CABINET', message: 'Caching cabinet roles...' });

      await safeFetch('Unit Cabinet Roles', async () => {
        const res = await api.get('/roles/cabinet', { params: { unitLevel, unitId } });
        await setCache(`cabinet_roles_${unitLevel}_${unitId}`, res.data?.data || []);
      });

      await safeFetch('Unit Approved Roles', async () => {
        const res = await api.get('/roles', { params: { unitLevel, unitId, state: 'APPROVED' } });
        await setCache(`roles_${unitLevel}_${unitId}`, res.data?.data || []);
      });

      // 5. Members within user's jurisdiction / unit
      if (onProgress) onProgress({ step: 'MEMBERS', message: 'Caching jurisdiction members...' });

      const memberParams = { limit: 200, scope: 'all' };
      if (unitLevel === 'BASIC_UNIT' && unitId !== 'CENTRAL') memberParams.basicUnitId = unitId;
      else if (unitLevel === 'AREA' && unitId !== 'CENTRAL') memberParams.areaId = unitId;
      else if (unitLevel === 'DISTRICT' && unitId !== 'CENTRAL') memberParams.districtId = unitId;
      else if (unitLevel === 'PROVINCE' && unitId !== 'CENTRAL') memberParams.provinceId = unitId;

      await safeFetch('Jurisdiction Members', async () => {
        const res = await api.get('/members', { params: memberParams });
        const data = res.data?.data || [];
        await setCache(`members_${unitLevel}_${unitId}`, data);
        await setCache(`finance_members_${unitLevel}_${unitId}`, data);
        await setCache('members_cache_scope', { items: data, meta: res.data?.meta || { total: data.length } });
      });

      // 6. Recent Meetings & Activities for user's unit
      if (onProgress) onProgress({ step: 'EVENTS', message: 'Caching recent meetings & activities...' });

      await safeFetch('Recent Meetings (Non-Committee)', async () => {
        const res = await api.get('/meetings', {
          params: { unitLevel, unitId, body: 'NON_COMMITTEE' },
        });
        const list = res.data?.data || [];
        await setCache(`meetings_${unitLevel}_${unitId}_NON_COMMITTEE`, list);

        // Pre-cache details and supervisor candidates for the 3 most recent meetings
        for (const m of list.slice(0, 3)) {
          if (m._id) {
            try {
              const mRes = await api.get(`/meetings/${m._id}`);
              if (mRes.data?.data) {
                await setCache(`meeting_detail_${m._id}`, mRes.data.data);
              }
              const attRes = await api.get(`/meetings/${m._id}/attendees`);
              if (attRes.data?.data) {
                await setCache(`meeting_attendees_${m._id}`, attRes.data.data);
              }
              const supRes = await api.get(`/meetings/${m._id}/supervisor-candidates`);
              if (supRes.data?.data) {
                await setCache(`meeting_supervisors_${m._id}`, supRes.data.data);
              }
            } catch {}
          }
        }
      });

      await safeFetch('Recent Meetings (Committee)', async () => {
        const res = await api.get('/meetings', {
          params: { unitLevel, unitId, body: 'COMMITTEE' },
        });
        await setCache(`meetings_${unitLevel}_${unitId}_COMMITTEE`, res.data?.data || []);
      });

      await safeFetch('Recent Activities', async () => {
        const res = await api.get('/activities', {
          params: { unitLevel, unitId },
        });
        const acts = res.data?.data || [];
        await setCache(`activities_${unitLevel}_${unitId}_NON_COMMITTEE`, acts);
        for (const a of acts.slice(0, 3)) {
          if (a._id) {
            await setCache(`activity_detail_${a._id}`, a);
          }
        }
      });

      // 7. Unit Dashboard Data
      if (onProgress) onProgress({ step: 'DASHBOARD', message: 'Caching dashboard statistics...' });

      await safeFetch('Unit Dashboard', async () => {
        const res = await api.get('/dashboard/unit', { params: { unitLevel, unitId } });
        if (res.data?.data) {
          await setCache(`dashboard_unit_${unitLevel}_${unitId}`, res.data.data);
        }
      });

      if (unitLevel !== 'BASIC_UNIT') {
        await safeFetch('Unit Subordinates', async () => {
          const res = await api.get('/dashboard/subordinates', { params: { unitLevel, unitId } });
          if (res.data?.data) {
            await setCache(`dashboard_subordinates_${unitLevel}_${unitId}`, res.data.data);
          }
        });
      }

      // 8. Unit Responsibilities
      if (onProgress) onProgress({ step: 'RESPONSIBILITIES', message: 'Caching responsibilities...' });

      await safeFetch('Unit Responsibilities', async () => {
        const res = await api.get('/responsibilities', { params: { unitLevel, unitId } });
        const respList = res.data?.data || [];
        await setCache(`responsibilities_${unitLevel}_${unitId}_all`, respList);
        await setCache(`responsibilities_${unitLevel}_${unitId}_`, respList);
      });
      // 9. Unit Finance Summaries & Available Balances
      if (onProgress) onProgress({ step: 'FINANCE', message: 'Caching finance summaries...' });

      await safeFetch('Unit Finance Summaries', async () => {
        for (const b of ['EXECUTIVE', 'COMMITTEE', 'JIRGA']) {
          try {
            const res = await api.get('/finance/summary', { params: { unitLevel, unitId, body: b } });
            if (res.data?.data) {
              await setCache(`finance_summary_${unitLevel}_${unitId}_${b}`, res.data.data);
            }
          } catch {}
        }
      });
    }

    // 10. Personal Member Profile (if linked)
    if (user?.memberId) {
      await safeFetch('Personal Member Profile', async () => {
        const res = await api.get(`/members/${user.memberId}`);
        if (res.data?.data) {
          await setCache(`member_profile_${user.memberId}`, res.data.data);
        }
      });
    }

    // Save sync metadata
    const meta = {
      lastSync: Date.now(),
      syncedAt: new Date().toISOString(),
      unitLevel,
      unitId,
      unitName: ctx?.unitName || '',
      stepsCount: steps.length,
      successCount: steps.filter((s) => s.success).length,
    };
    await AppStorage.setItem(LAST_SYNC_KEY, JSON.stringify(meta));

    return { success: true, meta, steps };
  } catch (err) {
    if (isNetworkError(err)) {
      return { skipped: true, reason: 'Device is offline' };
    }
    return { success: false, error: err?.message, steps };
  }
}
