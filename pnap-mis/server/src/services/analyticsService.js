const mongoose = require('mongoose');
const Member = require('../models/Member');
const Province = require('../models/Province');
const District = require('../models/District');
const Area = require('../models/Area');
const BasicUnit = require('../models/BasicUnit');
const RoleAssignment = require('../models/RoleAssignment');
const ActivityLog = require('../models/ActivityLog');
const Meeting = require('../models/Meeting');
const Activity = require('../models/Activity');
const Congress = require('../models/Congress');
const activityService = require('./activityService');

// ─── Executive analytics service ───────────────────────────────────
//
// Every aggregation behind the Super Admin dashboard lives here.
// Controllers stay thin (parse → delegate → respond) exactly as the
// project's other service modules do.
//
// Two rules drive the whole file:
//
//   MEMBER ACTIVE   — performed at least one meaningful organizational
//                     activity inside the window. Logins, dashboard
//                     visits and page views are deliberately NOT
//                     activity; only what activityService records is.
//
//   UNIT ACTIVE     — at least one of its KEY OFFICE BEARERS is active.
//                     "Key office bearer" is not a new list: it is
//                     RoleAssignment.MANDATORY_ROLES_PER_LEVEL, the
//                     cabinet roles the org already treats as
//                     mandatory at each tier. Same principle applies
//                     up the hierarchy — Areas, Districts, Provinces.

const { ACTIVE_WINDOW_DAYS } = activityService;

// The cabinet roles that make a unit "run". Reused, not redefined.
const KEY_ROLES = RoleAssignment.MANDATORY_ROLES_PER_LEVEL;

// Which office bearer is named as "responsible" on the inactive
// tables when a unit has several. Ordered most- to least-senior.
const OFFICER_PRIORITY = [
  'PRESIDENT', 'CHAIRMAN', 'GENERAL_SECRETARY', 'SECRETARY',
  'SENIOR_MAWIN', 'FINANCE_SECRETARY',
];

// Tiers the inactive-units table can be pivoted to.
const REPORTABLE_LEVELS = ['BASIC_UNIT', 'AREA', 'DISTRICT', 'PROVINCE'];

// A "campaign" is an Activity of this seeded built-in type. Named once
// so summary() and campaignsAnalytics() can never disagree.
const CAMPAIGN_TYPE = 'CAMPAIGN';

// Tier order for the yearly meeting matrix — top of the organization
// first, so a report reads the way the org is drawn.
const TIER_ORDER = ['CENTRAL', 'PROVINCE', 'DISTRICT', 'AREA', 'BASIC_UNIT'];

// How a meeting's date maps to a reporting year.
//
//   CALENDAR — plain Jan–Dec.
//   FISCAL   — Pakistani fiscal year, July–June, labelled by its
//              starting year. This is NOT invented here: it is the
//              same convention financeController.fiscalYearOf already
//              applies to donations and expenses, so a meeting count
//              and a finance total for "2025" cover the same span.
function yearExpr(basis) {
  if (basis !== 'FISCAL') return { $year: '$startAt' };
  return {
    $cond: [
      { $gte: [{ $month: '$startAt' }, 7] },
      { $year: '$startAt' },
      { $subtract: [{ $year: '$startAt' }, 1] },
    ],
  };
}

function yearLabel(year, basis) {
  return basis === 'FISCAL' ? `FY ${year}–${String(year + 1).slice(2)}` : String(year);
}

/**
 * Congress-to-Congress reporting periods, derived from the stored
 * Congress calendar.
 *
 * A period runs from one Congress to the next; the most recent
 * Congress opens a period that is still running, bounded by `end`.
 * Anything before the FIRST Congress belongs to no period — that is
 * correct rather than a rounding problem, and the caller reports it
 * separately instead of silently folding it into period one.
 *
 * Returns newest-last so the buckets read left-to-right on a chart,
 * matching the calendar and fiscal series.
 */
async function congressPeriods(end) {
  const rows = await Congress.find({ isActive: true }).sort({ heldOn: 1 }).lean();
  if (rows.length === 0) return [];

  return rows.map((c, i) => {
    const next = rows[i + 1];
    return {
      key: i,
      from: c.heldOn,
      to: next ? next.heldOn : null, // null = still running
      label: next
        ? `${c.label} → ${next.label}`
        : `${c.label} → present`,
      shortLabel: c.label,
    };
  }).filter((p) => p.from <= end);
}

// Mongo expression bucketing a meeting date into a congress period
// index. -1 means "before the first Congress", which the assembly
// drops rather than mis-attributing.
function congressExpr(periods) {
  if (periods.length === 0) return { $literal: -1 };
  return {
    $switch: {
      branches: periods.map((p) => ({
        case: {
          $and: [
            { $gte: ['$startAt', p.from] },
            ...(p.to ? [{ $lt: ['$startAt', p.to] }] : []),
          ],
        },
        then: p.key,
      })),
      default: -1,
    },
  };
}

function oid(v) {
  if (!v) return null;
  if (v instanceof mongoose.Types.ObjectId) return v;
  return mongoose.Types.ObjectId.isValid(String(v))
    ? new mongoose.Types.ObjectId(String(v))
    : null;
}

const str = (v) => (v == null ? '' : String(v));

// A bare 'YYYY-MM-DD' end date means the user meant that whole day.
// Date.parse gives midnight, which would silently drop everything
// recorded on the final day of the range — the most recent and most
// interesting day in the window.
function endOfDayIfDateOnly(raw, parsed) {
  if (/^\d{4}-\d{2}-\d{2}$/.test(String(raw).trim())) {
    return new Date(parsed.getTime() + 24 * 3600 * 1000 - 1);
  }
  return parsed;
}

/**
 * Normalize raw query params into the filter object every function
 * here accepts. Done once, in one place, so a controller can never
 * hand a half-parsed filter to an aggregation.
 */
function parseFilters(query = {}) {
  const now = new Date();
  let to = query.to ? new Date(query.to) : null;
  if (to && !isNaN(to.getTime())) to = endOfDayIfDateOnly(query.to, to);
  const days = Math.min(
    3650,
    Math.max(1, parseInt(query.days, 10) || ACTIVE_WINDOW_DAYS),
  );
  const from = query.from
    ? new Date(query.from)
    : activityService.activityCutoff(days, to || now);

  return {
    from: isNaN(from.getTime()) ? activityService.activityCutoff(days, now) : from,
    // A null `to` means "up to now", which unlocks the fast path in
    // activeMemberClause(). Only an explicit historical end date
    // forces the ranged path.
    to: to && !isNaN(to.getTime()) ? to : null,
    days,
    provinceId: oid(query.provinceId),
    districtId: oid(query.districtId),
    areaId: oid(query.areaId),
    basicUnitId: oid(query.basicUnitId),
    memberStatus: query.memberStatus || null,
    orgStatus: ['ACTIVE', 'INACTIVE'].includes(query.orgStatus) ? query.orgStatus : null,
  };
}

// The tier the current scope sits at, and the tier a drill-down step
// would land on. Drives both the breadcrumb and which child cards the
// Organization section renders.
function scopeLevel(f) {
  if (f.basicUnitId) return 'BASIC_UNIT';
  if (f.areaId) return 'AREA';
  if (f.districtId) return 'DISTRICT';
  if (f.provinceId) return 'PROVINCE';
  return 'NATIONAL';
}

const CHILD_OF = {
  NATIONAL: 'PROVINCE',
  PROVINCE: 'DISTRICT',
  DISTRICT: 'AREA',
  AREA: 'BASIC_UNIT',
  BASIC_UNIT: null, // basic units are the leaf — nothing below them
};

// Roll-up filter for records that denormalize the hierarchy (Meeting,
// Activity, Responsibility, ActivityLog). Scoping to a district picks
// up that district's own records AND everything in its areas and basic
// units, which is the semantics an executive view wants.
function chainMatch(f) {
  const m = {};
  if (f.basicUnitId) m.basicUnitId = f.basicUnitId;
  else if (f.areaId) m.areaId = f.areaId;
  else if (f.districtId) m.districtId = f.districtId;
  else if (f.provinceId) m.provinceId = f.provinceId;
  return m;
}

// Territorial clamp for member queries. Most specific filter wins —
// an areaId makes the province/district filters redundant.
function memberMatch(f) {
  const m = chainMatch(f);
  if (f.memberStatus) m.status = f.memberStatus;
  return m;
}

// Same clamp for org-unit queries. A unit at or below the scope is in
// range; a unit ABOVE it is matched by identity (scoping to a district
// leaves exactly one district — that one). Ordered narrowest-first so
// the deepest filter the caller set always wins.
const UNIT_SCOPE_KEYS = [
  ['basicUnitId', 'BASIC_UNIT'],
  ['areaId', 'AREA'],
  ['districtId', 'DISTRICT'],
  ['provinceId', 'PROVINCE'],
];
const UNIT_DEPTH = { PROVINCE: 0, DISTRICT: 1, AREA: 2, BASIC_UNIT: 3 };

// The foreign key that ties a hierarchy-denormalized record (Member,
// Meeting, Activity, Responsibility, ActivityLog) to a unit at a tier.
const LEVEL_FK = {
  PROVINCE: 'provinceId',
  DISTRICT: 'districtId',
  AREA: 'areaId',
  BASIC_UNIT: 'basicUnitId',
};

// Every tier strictly beneath a scope. National sees all four; a
// province sees districts, areas and basic units; and so on. This is
// what lets a section show province-wise AND district-wise AND
// area-wise at once instead of only the immediate child tier.
function tiersBelow(level) {
  if (level === 'NATIONAL') return ['PROVINCE', 'DISTRICT', 'AREA', 'BASIC_UNIT'];
  const depth = UNIT_DEPTH[level];
  return REPORTABLE_LEVELS
    .filter((l) => UNIT_DEPTH[l] > depth)
    .sort((a, b) => UNIT_DEPTH[a] - UNIT_DEPTH[b]);
}

// Tier name → the matching decorated unit list on an org snapshot.
function unitListsOf(org) {
  return {
    PROVINCE: org.provinces,
    DISTRICT: org.districts,
    AREA: org.areas,
    BASIC_UNIT: org.basicUnits,
  };
}

function unitMatch(f, level) {
  const m = { isActive: true };
  for (const [key, keyLevel] of UNIT_SCOPE_KEYS) {
    if (!f[key]) continue;
    if (UNIT_DEPTH[keyLevel] < UNIT_DEPTH[level]) {
      // Scope is above this tier — constrain by the denormalized parent.
      m[key] = f[key];
    } else if (keyLevel === level) {
      m._id = f[key];
    } else {
      // Scope is BELOW this tier: the only unit of this tier in range
      // is the scoped unit's own ancestor, which the UI always sends
      // alongside. Nothing to add beyond what a shallower key already
      // contributed.
      continue;
    }
    break;
  }
  return m;
}

/**
 * The one $match every ActivityLog read starts from.
 *
 * Centralized so the trend, the province roll-up, the recent feed and
 * the active-member set can never drift apart on what counts as an
 * event or how scope is applied — they previously each built their own
 * copy of this filter.
 */
function activityMatch(f, { from, to } = {}) {
  const start = from || f.from;
  const end = to === undefined ? f.to : to;
  return {
    ...chainMatch(f),
    occurredAt: { $gte: start, ...(end ? { $lte: end } : {}) },
    // Internal bookkeeping — the backfill's completion marker — is not
    // organizational activity and must never reach a chart or a feed.
    category: { $ne: 'SYSTEM' },
  };
}

/**
 * The "is this member active" predicate, in two flavours.
 *
 * Fast path (window ends now, which is every live dashboard load):
 * a plain range test on the denormalized Member.lastActivityAt,
 * served straight from the {provinceId, lastActivityAt} index.
 *
 * Ranged path (an explicit historical `to`): lastActivityAt only
 * records the LATEST activity, so it cannot answer "was this member
 * active during March". There we resolve the distinct member set from
 * ActivityLog once and match on it. Correctness over convenience —
 * but only paid for when the user actually asks for history.
 */
async function activeMemberClause(f) {
  if (!f.to) return { lastActivityAt: { $gte: f.from } };

  const rows = await ActivityLog.aggregate([
    { $match: { ...activityMatch(f), memberId: { $ne: null } } },
    { $group: { _id: '$memberId' } },
  ]);
  return { _id: { $in: rows.map((r) => r._id) } };
}

// Mongo expression form of the same predicate, for use inside a
// $group that counts active and total in a single pass.
function activeExpr(f, activeIds) {
  if (!f.to) {
    return {
      $and: [
        { $ne: ['$lastActivityAt', null] },
        { $gte: ['$lastActivityAt', f.from] },
      ],
    };
  }
  return { $in: ['$_id', activeIds] };
}

// ─── Short-lived result cache ──────────────────────────────────────
// The dashboard polls every 25s and several panels share the same
// org snapshot. A 45s TTL means a poll cycle costs one set of
// aggregations rather than one per panel, while staying well inside
// "live" expectations. Bounded so a filter-fiddling user can't grow
// it without limit.
const CACHE_TTL_MS = 45 * 1000;
const CACHE_MAX = 40;
const cache = new Map();

function cacheKey(prefix, f) {
  return [
    prefix, f.from.toISOString(), f.to ? f.to.toISOString() : 'now',
    str(f.provinceId), str(f.districtId), str(f.areaId), str(f.basicUnitId),
    str(f.memberStatus),
  ].join('|');
}

async function cached(prefix, f, producer) {
  const key = cacheKey(prefix, f);
  const hit = cache.get(key);
  if (hit && hit.expires > Date.now()) return hit.value;
  const value = await producer();
  if (cache.size >= CACHE_MAX) cache.delete(cache.keys().next().value);
  cache.set(key, { value, expires: Date.now() + CACHE_TTL_MS });
  return value;
}

// Called by activityService consumers that mutate the org shape.
// Not wired to every write — the TTL handles freshness; this exists
// so a test or an admin action can force a rebuild.
function invalidateCache() {
  cache.clear();
}

/**
 * Last activity timestamp per unit at one tier, derived from its key
 * office bearers.
 *
 * One aggregation for the whole tier — RoleAssignment joined to the
 * bearer's denormalized Member.lastActivityAt, grouped by unit. No
 * per-unit query, so this stays O(1) round trips whether the org has
 * ten basic units or ten thousand.
 *
 * @returns {Map<string, {lastActivityAt: Date|null, officer: object|null, officerCount: number}>}
 */
async function officeBearerActivity(level) {
  const codes = KEY_ROLES[level] || [];
  if (codes.length === 0) return new Map();

  const rows = await RoleAssignment.aggregate([
    {
      $match: {
        unitLevel: level,
        roleCode: { $in: codes },
        state: 'APPROVED',
        endedAt: { $exists: false },
      },
    },
    {
      // let/pipeline form so only the three fields we need cross the
      // wire — a plain localField lookup would drag whole member docs.
      $lookup: {
        from: Member.collection.name,
        let: { mid: '$memberId' },
        pipeline: [
          { $match: { $expr: { $eq: ['$_id', '$$mid'] } } },
          { $project: { fullName: 1, memberId: 1, phone: 1, lastActivityAt: 1 } },
        ],
        as: 'member',
      },
    },
    { $unwind: { path: '$member', preserveNullAndEmptyArrays: false } },
    {
      $group: {
        _id: '$unitId',
        lastActivityAt: { $max: '$member.lastActivityAt' },
        officers: {
          $push: {
            roleCode: '$roleCode',
            memberId: '$member._id',
            memberCode: '$member.memberId',
            fullName: '$member.fullName',
            phone: '$member.phone',
            lastActivityAt: '$member.lastActivityAt',
          },
        },
      },
    },
  ]);

  const map = new Map();
  for (const r of rows) {
    const officers = r.officers || [];
    // Name the most senior bearer as responsible; fall back to
    // whoever is listed first when none match the priority order.
    const officer = OFFICER_PRIORITY
      .map((code) => officers.find((o) => o.roleCode === code))
      .find(Boolean) || officers[0] || null;
    map.set(str(r._id), {
      lastActivityAt: r.lastActivityAt || null,
      officer,
      officerCount: officers.length,
    });
  }
  return map;
}

/**
 * One shared snapshot of the organization: every active unit at every
 * tier (id + name + chain) plus its office-bearer activity. Four unit
 * reads and four role aggregations, cached — so summary(),
 * provinceBreakdown() and inactiveUnits() all reuse a single build
 * instead of re-deriving the same facts three times.
 *
 * Unit rows are small and number in the thousands even for a national
 * org, which is why they are loaded whole rather than counted: the
 * same fetch then serves counts, province bucketing, the activity
 * join AND the inactive tables.
 */
async function orgSnapshot(f) {
  return cached('org', f, async () => {
    const [provinces, districts, areas, basicUnits] = await Promise.all([
      Province.find(unitMatch(f, 'PROVINCE')).select('name code').lean(),
      District.find(unitMatch(f, 'DISTRICT')).select('name code provinceId').lean(),
      Area.find(unitMatch(f, 'AREA')).select('name districtId provinceId').lean(),
      BasicUnit.find(unitMatch(f, 'BASIC_UNIT')).select('name areaId districtId provinceId').lean(),
    ]);

    const [buAct, areaAct, distAct, provAct] = await Promise.all([
      officeBearerActivity('BASIC_UNIT'),
      officeBearerActivity('AREA'),
      officeBearerActivity('DISTRICT'),
      officeBearerActivity('PROVINCE'),
    ]);

    const cutoff = f.from;
    const within = (d) => !!d && new Date(d) >= cutoff && (!f.to || new Date(d) <= f.to);

    // Decorate each unit with its activity verdict once, here, so no
    // downstream caller re-implements the rule.
    const decorate = (units, actMap) => units.map((u) => {
      const a = actMap.get(str(u._id)) || { lastActivityAt: null, officer: null, officerCount: 0 };
      return {
        ...u,
        lastActivityAt: a.lastActivityAt,
        officer: a.officer,
        officerCount: a.officerCount,
        isActiveUnit: within(a.lastActivityAt),
      };
    });

    return {
      provinces: decorate(provinces, provAct),
      districts: decorate(districts, distAct),
      areas: decorate(areas, areaAct),
      basicUnits: decorate(basicUnits, buAct),
    };
  });
}

function tally(units) {
  const active = units.filter((u) => u.isActiveUnit).length;
  return { total: units.length, active, inactive: units.length - active };
}

// ─── Public API ────────────────────────────────────────────────────

/**
 * GET /dashboard/summary — the executive headline numbers.
 * Membership (total / active / inactive / per-status) plus the
 * organizational structure with its own active-inactive split.
 */
async function summary(f) {
  return cached('summary', f, async () => {
    const base = memberMatch(f);
    const scope = chainMatch(f);
    const activeClause = await activeMemberClause(f);
    const inWindow = { $gte: f.from, ...(f.to ? { $lte: f.to } : {}) };
    const now = new Date();

    const [
      total, active, newMembers, byStatus, org,
      meetingStates, campaignStates,
      outstandingReports,
    ] = await Promise.all([
      Member.countDocuments(base),
      Member.countDocuments({ ...base, ...activeClause }),
      // "New" is registered-in-window, which is a different question
      // from active-in-window and routinely a different set.
      Member.countDocuments({ ...base, createdAt: inWindow }),
      Member.aggregate([
        ...(Object.keys(base).length ? [{ $match: base }] : []),
        { $group: { _id: '$status', count: { $sum: 1 } } },
      ]),
      orgSnapshot(f),
      Meeting.aggregate([
        { $match: { ...scope, startAt: inWindow } },
        { $group: { _id: '$state', count: { $sum: 1 } } },
      ]),
      Activity.aggregate([
        { $match: { ...scope, type: CAMPAIGN_TYPE, startAt: inWindow } },
        {
          $group: {
            _id: null,
            total: { $sum: 1 },
            completed: { $sum: { $cond: [{ $eq: ['$state', 'COMPLETED'] }, 1, 0] } },
            upcoming: {
              $sum: {
                $cond: [
                  { $and: [{ $eq: ['$state', 'PLANNED'] }, { $gt: ['$startAt', now] }] }, 1, 0,
                ],
              },
            },
            running: {
              $sum: {
                $cond: [
                  { $and: [{ $eq: ['$state', 'PLANNED'] }, { $lte: ['$startAt', now] }] }, 1, 0,
                ],
              },
            },
          },
        },
      ]),
      // A meeting report is "filed" when the meeting is finalized, and
      // "outstanding" once the meeting has ended without that
      // happening. This is the only report lifecycle the system
      // actually has — reports elsewhere are generated documents
      // (PDF/XLSX exports), which have no pending/completed state.
      Meeting.countDocuments({
        ...scope,
        state: { $in: ['SCHEDULED', 'IN_PROGRESS', 'PENDING_REPORT'] },
        endAt: { $lt: now },
      }),
    ]);

    const statusCounts = Object.fromEntries(Member.STATUSES.map((s) => [s, 0]));
    for (const g of byStatus) if (g._id) statusCounts[g._id] = g.count;

    const mStates = Object.fromEntries(Meeting.STATES.map((s) => [s, 0]));
    for (const g of meetingStates) if (g._id) mStates[g._id] = g.count;

    const camp = campaignStates[0] || { total: 0, completed: 0, upcoming: 0, running: 0 };

    return {
      window: { from: f.from, to: f.to, days: f.days },
      membership: {
        total,
        active,
        inactive: total - active,
        activePct: total ? Math.round((active / total) * 100) : 0,
        newMembers,
        byStatus: statusCounts,
      },
      organization: {
        provinces: tally(org.provinces),
        districts: tally(org.districts),
        areas: tally(org.areas),
        basicUnits: tally(org.basicUnits),
      },
      meetings: {
        total: Object.values(mStates).reduce((a, b) => a + b, 0),
        conducted: mStates.FINALIZED,
        scheduled: mStates.SCHEDULED,
      },
      campaigns: {
        total: camp.total,
        running: camp.running,
        upcoming: camp.upcoming,
        completed: camp.completed,
      },
      // Meeting reports only — see the note on the query above. There
      // is no assignable "report" entity in this system, so there is
      // nothing here to be pending or completed by a person.
      reports: {
        filed: mStates.FINALIZED,
        outstanding: outstandingReports,
      },
      generatedAt: new Date(),
    };
  });
}

/**
 * GET /dashboard/org-breakdown — one card per child unit of the
 * current scope, with membership, sub-structure, active/inactive
 * splits and recent activity.
 *
 * The tier is derived from the scope rather than passed in, which is
 * what makes drill-down work: no scope yields provinces, a province
 * yields its districts, a district its areas, an area its basic units.
 * A basic unit is a leaf and yields nothing.
 *
 * Two grouped aggregations plus the shared org snapshot, whatever the
 * tier. No query runs per unit, so a province with 200 districts costs
 * the same round trips as one with two.
 */
async function orgBreakdown(f) {
  return cached('breakdown', f, async () => {
    const childLevel = CHILD_OF[scopeLevel(f)];
    if (!childLevel) return { level: null, rows: [] };

    const org = await orgSnapshot(f);
    const base = memberMatch(f);

    // The foreign key that ties a member / event / descendant unit back
    // to a unit of the child tier.
    const fk = {
      PROVINCE: 'provinceId', DISTRICT: 'districtId',
      AREA: 'areaId', BASIC_UNIT: 'basicUnitId',
    }[childLevel];

    const units = {
      PROVINCE: org.provinces, DISTRICT: org.districts,
      AREA: org.areas, BASIC_UNIT: org.basicUnits,
    }[childLevel];

    // Ranged windows need the explicit active-member set to build the
    // $cond; the fast path derives it from lastActivityAt inline.
    let activeIds = [];
    if (f.to) {
      const clause = await activeMemberClause(f);
      activeIds = clause._id?.$in || [];
    }

    const [memberRows, activityRows] = await Promise.all([
      // Total + active membership per child unit in a single pass.
      Member.aggregate([
        ...(Object.keys(base).length ? [{ $match: base }] : []),
        {
          $group: {
            _id: `$${fk}`,
            total: { $sum: 1 },
            active: { $sum: { $cond: [activeExpr(f, activeIds), 1, 0] } },
          },
        },
      ]),
      ActivityLog.aggregate([
        { $match: activityMatch(f) },
        {
          $group: {
            _id: `$${fk}`,
            events: { $sum: 1 },
            lastActivityAt: { $max: '$occurredAt' },
          },
        },
      ]),
    ]);

    const memberBy = new Map(memberRows.map((r) => [str(r._id), r]));
    const activityBy = new Map(activityRows.map((r) => [str(r._id), r]));

    // Bucket every descendant tier by this child's id, so each card can
    // report the structure beneath it.
    const bucket = (list) => {
      const m = new Map();
      for (const u of list) {
        const k = str(u[fk]);
        if (!m.has(k)) m.set(k, []);
        m.get(k).push(u);
      }
      return m;
    };
    const distBy = bucket(org.districts);
    const areaBy = bucket(org.areas);
    const buBy = bucket(org.basicUnits);

    const rows = units.map((u) => {
      const k = str(u._id);
      const mem = memberBy.get(k) || { total: 0, active: 0 };
      const act = activityBy.get(k) || { events: 0, lastActivityAt: null };

      return {
        _id: u._id,
        level: childLevel,
        name: u.name,
        code: u.code,
        members: {
          total: mem.total,
          active: mem.active,
          inactive: mem.total - mem.active,
          activePct: mem.total ? Math.round((mem.active / mem.total) * 100) : 0,
        },
        // A tier reports only the tiers strictly below it. Districts
        // have no districts of their own; basic units are leaves.
        districts: childLevel === 'PROVINCE' ? tally(distBy.get(k) || []) : null,
        areas: ['PROVINCE', 'DISTRICT'].includes(childLevel) ? tally(areaBy.get(k) || []) : null,
        basicUnits: childLevel === 'BASIC_UNIT' ? null : tally(buBy.get(k) || []),
        // The unit's OWN activity verdict, from its own cabinet — not
        // inherited from the units beneath it.
        isActiveUnit: u.isActiveUnit,
        officer: u.officer || null,
        recentActivity: {
          events: act.events,
          lastActivityAt: act.lastActivityAt || u.lastActivityAt || null,
        },
      };
    });

    rows.sort((a, b) => b.members.total - a.members.total || a.name.localeCompare(b.name));
    return { level: childLevel, rows };
  });
}

// Backwards-compatible alias. The original endpoint shipped returning a
// bare province array; keep that exact shape so anything already
// calling it keeps working.
async function provinceBreakdown(f) {
  const out = await orgBreakdown({ ...f, provinceId: null, districtId: null, areaId: null, basicUnitId: null });
  return out.rows;
}

/**
 * GET /dashboard/scope — resolve the current scope into a breadcrumb.
 * Four id lookups at most, and only for the levels actually set.
 */
async function scopePath(f) {
  const trail = [{ level: 'NATIONAL', _id: null, name: 'Pakistan' }];
  const steps = [
    ['PROVINCE', f.provinceId, Province],
    ['DISTRICT', f.districtId, District],
    ['AREA', f.areaId, Area],
    ['BASIC_UNIT', f.basicUnitId, BasicUnit],
  ];
  for (const [level, id, Model] of steps) {
    if (!id) break; // the chain is contiguous — stop at the first gap
    const doc = await Model.findById(id).select('name').lean();
    if (!doc) break;
    trail.push({ level, _id: doc._id, name: doc.name });
  }
  return { level: scopeLevel(f), childLevel: CHILD_OF[scopeLevel(f)], trail };
}

// Monthly buckets over a span, with empty months filled in so a chart
// keeps even spacing. Shared by every trend in this file.
function monthBuckets(end, span, rowsById, pick) {
  const out = [];
  for (let i = span - 1; i >= 0; i--) {
    const d = new Date(end);
    d.setDate(1);
    d.setMonth(d.getMonth() - i);
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
    out.push({
      month: key,
      label: d.toLocaleDateString('en', { month: 'short' }),
      ...pick(rowsById.get(key)),
    });
  }
  return out;
}

/**
 * GET /dashboard/membership — total and NEW membership, broken down by
 * the child tier of the current scope.
 *
 * "New" means registered inside the window (Member.createdAt), which
 * is distinct from "active" (acted inside the window). Both are
 * computed in the same pass as the totals.
 */
async function membershipAnalytics(f) {
  return cached('membership', f, async () => {
    const base = memberMatch(f);
    // Every tier beneath the scope, not just the immediate child — the
    // section shows province-wise, district-wise, area-wise and
    // basic-unit-wise membership side by side.
    const levels = tiersBelow(scopeLevel(f));

    let activeIds = [];
    if (f.to) {
      const clause = await activeMemberClause(f);
      activeIds = clause._id?.$in || [];
    }

    const isNew = {
      $and: [
        { $gte: ['$createdAt', f.from] },
        ...(f.to ? [{ $lte: ['$createdAt', f.to] }] : []),
      ],
    };

    const [totals, byUnit, trendRows, org] = await Promise.all([
      Member.aggregate([
        ...(Object.keys(base).length ? [{ $match: base }] : []),
        {
          $group: {
            _id: null,
            total: { $sum: 1 },
            active: { $sum: { $cond: [activeExpr(f, activeIds), 1, 0] } },
            newMembers: { $sum: { $cond: [isNew, 1, 0] } },
          },
        },
      ]),
      // $facet fans the same matched roster out to one grouping per
      // tier, so four breakdowns cost one pass rather than four.
      Member.aggregate([
        ...(Object.keys(base).length ? [{ $match: base }] : []),
        {
          $facet: Object.fromEntries(levels.map((lvl) => [
            lvl,
            [{
              $group: {
                _id: `$${LEVEL_FK[lvl]}`,
                total: { $sum: 1 },
                active: { $sum: { $cond: [activeExpr(f, activeIds), 1, 0] } },
                newMembers: { $sum: { $cond: [isNew, 1, 0] } },
              },
            }],
          ])),
        },
      ]),
      // 12-month registration trend, independent of the activity window
      // so the shape of growth stays visible whatever the filter says.
      Member.aggregate([
        ...(Object.keys(base).length ? [{ $match: base }] : []),
        {
          $group: {
            _id: { $dateToString: { format: '%Y-%m', date: '$createdAt' } },
            newMembers: { $sum: 1 },
          },
        },
      ]),
      orgSnapshot(f),
    ]);

    const facets = byUnit[0] || {};
    const unitsFor = unitListsOf(org);

    // One rows[] per tier. Units with no members are kept here (unlike
    // campaigns) — a district with zero members is a finding, not noise.
    const byLevel = {};
    for (const lvl of levels) {
      const by = new Map((facets[lvl] || []).map((r) => [str(r._id), r]));
      byLevel[lvl] = (unitsFor[lvl] || []).map((u) => {
        const r = by.get(str(u._id)) || { total: 0, active: 0, newMembers: 0 };
        return {
          _id: u._id,
          name: u.name,
          total: r.total,
          active: r.active,
          inactive: r.total - r.active,
          newMembers: r.newMembers,
        };
      }).sort((a, b) => b.total - a.total || a.name.localeCompare(b.name));
    }

    const t = totals[0] || { total: 0, active: 0, newMembers: 0 };
    return {
      levels: levels.filter((l) => byLevel[l].length > 0),
      byLevel,
      totals: {
        total: t.total,
        active: t.active,
        inactive: t.total - t.active,
        newMembers: t.newMembers,
      },
      trend: monthBuckets(
        f.to || new Date(), 12,
        new Map(trendRows.map((r) => [r._id, r])),
        (hit) => ({ newMembers: hit?.newMembers || 0 }),
      ),
    };
  });
}

/**
 * GET /dashboard/meetings — meeting counts by state, by tier and body,
 * plus a 12-month trend.
 *
 * IMPORTANT — what "body" can and cannot say. Meeting.body is
 * EXECUTIVE | COMMITTEE only, so this reports Cabinet (executive) and
 * Committee meetings per tier faithfully. JIRGA meetings are NOT
 * tracked anywhere in the schema: JIRGA exists only as a
 * PermanentMembership.bodyType and a committee VIEW, never as a
 * property of a meeting. Reporting a Jirga count would mean either
 * inventing zeros or widening the Meeting enum, which is a change to
 * the meeting workflow. The API therefore declares the gap
 * (jirgaTracked: false) and the UI states it rather than showing a
 * fabricated zero.
 */
const YEAR_BASES = ['CALENDAR', 'FISCAL', 'CONGRESS'];

async function meetingsAnalytics(f, { yearBasis = 'CALENDAR', years = 5 } = {}) {
  const basis = YEAR_BASES.includes(yearBasis) ? yearBasis : 'CALENDAR';
  const span = Math.min(20, Math.max(1, parseInt(years, 10) || 5));

  return cached(`meetings:${basis}:${span}`, f, async () => {
    const scope = chainMatch(f);
    const windowed = { ...scope, startAt: { $gte: f.from, ...(f.to ? { $lte: f.to } : {}) } };

    const end = f.to || new Date();
    const trendStart = new Date(end);
    trendStart.setMonth(trendStart.getMonth() - 11);
    trendStart.setDate(1);
    trendStart.setHours(0, 0, 0, 0);

    // The yearly series deliberately ignores the activity window: a
    // "last 30 days" filter would collapse a multi-year report to one
    // bar. It respects the territorial scope only, exactly like the
    // 12-month trend above it.
    const periods = basis === 'CONGRESS' ? await congressPeriods(end) : [];
    const bucketExpr = basis === 'CONGRESS' ? congressExpr(periods) : yearExpr(basis);

    // Calendar and fiscal count back `span` years from the end of the
    // window. Congress mode takes NO lower bound: bounding it at the
    // first Congress would silently drop every meeting held before it,
    // making the periods fail to reconcile against the totals. Those
    // meetings are instead bucketed to -1 and reported as unassigned,
    // which is a fact the user can act on rather than a gap they
    // cannot see.
    const yearsStart = basis === 'CONGRESS'
      ? new Date(0)
      : (() => {
        const d = new Date(end);
        d.setFullYear(d.getFullYear() - span);
        return d;
      })();

    const [byState, byTier, trendRows, overdue, yearRows] = await Promise.all([
      Meeting.aggregate([
        { $match: windowed },
        { $group: { _id: '$state', count: { $sum: 1 } } },
      ]),
      Meeting.aggregate([
        { $match: windowed },
        {
          $group: {
            _id: { level: '$unitLevel', body: { $ifNull: ['$body', 'EXECUTIVE'] } },
            total: { $sum: 1 },
            conducted: { $sum: { $cond: [{ $eq: ['$state', 'FINALIZED'] }, 1, 0] } },
            scheduled: { $sum: { $cond: [{ $eq: ['$state', 'SCHEDULED'] }, 1, 0] } },
          },
        },
      ]),
      Meeting.aggregate([
        { $match: { ...scope, startAt: { $gte: trendStart, $lte: end } } },
        {
          $group: {
            _id: { $dateToString: { format: '%Y-%m', date: '$startAt' } },
            total: { $sum: 1 },
            conducted: { $sum: { $cond: [{ $eq: ['$state', 'FINALIZED'] }, 1, 0] } },
          },
        },
      ]),
      // Reports overdue: the meeting has ended but was never finalized.
      // Same rule centralController.alertsFeed already applies.
      Meeting.countDocuments({
        ...scope,
        state: { $in: ['SCHEDULED', 'IN_PROGRESS', 'PENDING_REPORT'] },
        endAt: { $lt: new Date() },
      }),
      // Year x tier x body, in one pass. Every yearly view below is
      // assembled from this single result rather than re-querying per
      // cut, so adding a cut costs no database work.
      Meeting.aggregate([
        { $match: { ...scope, startAt: { $gte: yearsStart, $lte: end } } },
        {
          $group: {
            _id: {
              year: bucketExpr,
              level: '$unitLevel',
              body: { $ifNull: ['$body', 'EXECUTIVE'] },
            },
            total: { $sum: 1 },
            conducted: { $sum: { $cond: [{ $eq: ['$state', 'FINALIZED'] }, 1, 0] } },
            scheduled: { $sum: { $cond: [{ $eq: ['$state', 'SCHEDULED'] }, 1, 0] } },
          },
        },
      ]),
    ]);

    const states = Object.fromEntries(Meeting.STATES.map((s) => [s, 0]));
    for (const r of byState) if (r._id) states[r._id] = r.count;

    // ── Assemble the yearly views from the single year x tier x body
    // result. Years with no meetings are filled in so the series has no
    // gaps, and every year carries the full tier and body key set so a
    // table renders a rectangle rather than a ragged grid.
    const bodiesPresent = [...new Set(yearRows.map((r) => r._id.body))].sort();
    const blankCell = () => ({ total: 0, conducted: 0, scheduled: 0 });

    // The bucket list, whichever basis is in play. Calendar and fiscal
    // enumerate a numeric range; congress enumerates the stored
    // periods. Everything below this point is basis-agnostic.
    let buckets;
    if (basis === 'CONGRESS') {
      // shortLabel is the axis form. "13th National Congress → 14th
      // National Congress" is unreadable on a bar axis but correct in a
      // table, so both travel together and the caller picks.
      buckets = periods.map((p) => ({
        year: p.key, label: p.label, shortLabel: p.shortLabel, from: p.from, to: p.to,
      }));
    } else {
      const endYear = basis === 'FISCAL'
        ? (end.getMonth() >= 6 ? end.getFullYear() : end.getFullYear() - 1)
        : end.getFullYear();
      buckets = [];
      for (let y = endYear - span + 1; y <= endYear; y++) {
        buckets.push({ year: y, label: yearLabel(y, basis) });
      }
    }

    const yearly = buckets.map((b) => ({
      ...b,
      total: 0,
      conducted: 0,
      scheduled: 0,
      bodies: Object.fromEntries(bodiesPresent.map((x) => [x, blankCell()])),
      tiers: Object.fromEntries(TIER_ORDER.map((t) => [t, blankCell()])),
    }));
    const yearIndex = new Map(yearly.map((r, i) => [r.year, i]));
    const labelOf = new Map(yearly.map((r) => [r.year, r.label]));

    // Meetings that predate the first Congress belong to no period.
    // Counted and reported, never folded into period one.
    let unassigned = 0;

    // The flat matrix the detail table iterates, one row per
    // (year, tier, body) combination that actually occurred.
    const yearlyMatrix = [];

    for (const r of yearRows) {
      const { year, level, body } = r._id;
      const cell = { total: r.total, conducted: r.conducted, scheduled: r.scheduled };
      const i = yearIndex.get(year);

      if (i === undefined) {
        // Congress mode: -1 is "before the first Congress". Calendar /
        // fiscal: outside the requested span. Either way it must not
        // land in a bucket it doesn't belong to.
        unassigned += r.total;
        continue;
      }

      yearlyMatrix.push({ year, label: labelOf.get(year), level, body, ...cell });
      const row = yearly[i];
      row.total += r.total;
      row.conducted += r.conducted;
      row.scheduled += r.scheduled;
      for (const bucket of [row.bodies[body], row.tiers[level]]) {
        if (!bucket) continue;
        bucket.total += r.total;
        bucket.conducted += r.conducted;
        bucket.scheduled += r.scheduled;
      }
    }

    yearlyMatrix.sort((a, b) => b.year - a.year
      || TIER_ORDER.indexOf(a.level) - TIER_ORDER.indexOf(b.level)
      || a.body.localeCompare(b.body));

    const basisLabel = {
      FISCAL: 'Fiscal year (Jul–Jun)',
      CONGRESS: 'Congress to Congress',
      CALENDAR: 'Calendar year',
    }[basis];

    return {
      yearBasis: basis,
      yearBasisLabel: basisLabel,
      // Congress mode with no calendar on record can't bucket anything;
      // the UI needs to say so rather than render an empty chart.
      congressConfigured: basis !== 'CONGRESS' || periods.length > 0,
      unassignedMeetings: unassigned,
      // Only the tiers and bodies that actually occur, so the table
      // doesn't carry columns of permanent zeros.
      tiersPresent: TIER_ORDER.filter((t) => yearly.some((y) => y.tiers[t].total > 0)),
      bodiesPresent,
      yearly,
      yearlyMatrix,
      totals: {
        total: Object.values(states).reduce((a, b) => a + b, 0),
        conducted: states.FINALIZED,
        scheduled: states.SCHEDULED,
        overdueReports: overdue,
      },
      byState: states,
      // One row per (tier, body) pair actually present in the data.
      byTier: byTier.map((r) => ({
        level: r._id.level,
        body: r._id.body,
        total: r.total,
        conducted: r.conducted,
        scheduled: r.scheduled,
      })).sort((a, b) => b.total - a.total),
      // Declared, not implied — see the note above this function.
      jirgaTracked: false,
      trend: monthBuckets(
        end, 12,
        new Map(trendRows.map((r) => [r._id, r])),
        (hit) => ({ total: hit?.total || 0, conducted: hit?.conducted || 0 }),
      ),
    };
  });
}

/**
 * GET /dashboard/campaigns — campaign activities by lifecycle stage.
 *
 * A "campaign" is an Activity whose type is CAMPAIGN (the seeded
 * built-in). Its three stages are derived from the stored state plus
 * the schedule, since Activity has no separate RUNNING state:
 *   running   — PLANNED and already started
 *   upcoming  — PLANNED and not yet started
 *   completed — COMPLETED
 */
async function campaignsAnalytics(f) {
  return cached('campaigns', f, async () => {
    const scope = chainMatch(f);
    const now = new Date();
    const match = {
      ...scope,
      type: CAMPAIGN_TYPE,
      startAt: { $gte: f.from, ...(f.to ? { $lte: f.to } : {}) },
    };

    const stage = {
      $switch: {
        branches: [
          { case: { $eq: ['$state', 'COMPLETED'] }, then: 'completed' },
          { case: { $eq: ['$state', 'CANCELLED'] }, then: 'cancelled' },
          { case: { $gt: ['$startAt', now] }, then: 'upcoming' },
        ],
        default: 'running',
      },
    };

    // Every tier strictly below the current scope gets its own
    // breakdown, not just the immediate child: at national scope that
    // means province-wise AND district-wise AND area-wise AND
    // basic-unit-wise, all from one pass over the same documents.
    const levels = tiersBelow(scopeLevel(f));

    const end = f.to || new Date();
    const trendStart = new Date(end);
    trendStart.setMonth(trendStart.getMonth() - 11);
    trendStart.setDate(1);
    trendStart.setHours(0, 0, 0, 0);

    const [byStage, byUnit, reach, trendRows, org] = await Promise.all([
      Activity.aggregate([
        { $match: match },
        { $group: { _id: stage, count: { $sum: 1 } } },
      ]),
      // $facet fans the SAME matched set out to one grouping per tier,
      // so four breakdowns cost one collection scan rather than four.
      Activity.aggregate([
        { $match: match },
        {
          $facet: Object.fromEntries(levels.map((lvl) => [
            lvl,
            [{ $group: { _id: { unit: `$${LEVEL_FK[lvl]}`, stage }, count: { $sum: 1 } } }],
          ])),
        },
      ]),
      // The campaign sub-document the activity module already records.
      Activity.aggregate([
        { $match: { ...match, 'campaign.peopleContacted': { $exists: true, $ne: null } } },
        {
          $group: {
            _id: null,
            peopleContacted: { $sum: { $ifNull: ['$campaign.peopleContacted', 0] } },
            householdsVisited: { $sum: { $ifNull: ['$campaign.householdsVisited', 0] } },
            expectedJoiners: { $sum: { $ifNull: ['$campaign.expectedJoiners', 0] } },
            actualJoiners: { $sum: { $ifNull: ['$campaign.actualJoiners', 0] } },
            volunteerHours: { $sum: { $ifNull: ['$campaign.volunteerHours', 0] } },
          },
        },
      ]),
      Activity.aggregate([
        { $match: { ...scope, type: CAMPAIGN_TYPE, startAt: { $gte: trendStart, $lte: end } } },
        {
          $group: {
            _id: { $dateToString: { format: '%Y-%m', date: '$startAt' } },
            total: { $sum: 1 },
            completed: { $sum: { $cond: [{ $eq: ['$state', 'COMPLETED'] }, 1, 0] } },
          },
        },
      ]),
      orgSnapshot(f),
    ]);

    const totals = { running: 0, upcoming: 0, completed: 0, cancelled: 0 };
    for (const r of byStage) if (r._id in totals) totals[r._id] = r.count;

    const facets = byUnit[0] || {};
    const unitsFor = unitListsOf(org);
    const blank = () => ({ running: 0, upcoming: 0, completed: 0, cancelled: 0 });

    // One rows[] per tier, each named from the org snapshot so a unit
    // is labelled even when the aggregation returned it as a bare id.
    const byLevel = {};
    for (const lvl of levels) {
      const perUnit = new Map();
      for (const r of facets[lvl] || []) {
        const k = str(r._id.unit);
        if (!perUnit.has(k)) perUnit.set(k, blank());
        perUnit.get(k)[r._id.stage] = r.count;
      }
      byLevel[lvl] = (unitsFor[lvl] || []).map((u) => {
        const c = perUnit.get(str(u._id)) || blank();
        return {
          _id: u._id,
          name: u.name,
          ...c,
          total: c.running + c.upcoming + c.completed + c.cancelled,
        };
      }).filter((r) => r.total > 0)
        .sort((a, b) => b.total - a.total || a.name.localeCompare(b.name));
    }

    const rc = reach[0] || null;
    return {
      // Tiers that carry at least one campaign — the UI renders a
      // chart per entry, so empty tiers are dropped here rather than
      // producing four blank cards.
      levels: levels.filter((l) => byLevel[l].length > 0),
      byLevel,
      totals: { ...totals, total: totals.running + totals.upcoming + totals.completed + totals.cancelled },
      reach: rc ? {
        peopleContacted: rc.peopleContacted,
        householdsVisited: rc.householdsVisited,
        expectedJoiners: rc.expectedJoiners,
        actualJoiners: rc.actualJoiners,
        volunteerHours: rc.volunteerHours,
        conversionPct: rc.expectedJoiners ? Math.round((rc.actualJoiners / rc.expectedJoiners) * 100) : null,
      } : null,
      trend: monthBuckets(
        end, 12,
        new Map(trendRows.map((r) => [r._id, r])),
        (hit) => ({ total: hit?.total || 0, completed: hit?.completed || 0 }),
      ),
    };
  });
}

/**
 * GET /dashboard/reports — meeting-report filing status.
 *
 * There is no assignable "report" entity in this system, so there is
 * nothing here that a person can be given and later complete:
 *
 *   • The unit reports admins actually produce (Meetings & Activities,
 *     Finance, Individual Performance) are GENERATED DOCUMENTS — the
 *     /exports/* endpoints render them on demand as PDF or XLSX. A
 *     generated document has no pending or completed state.
 *   • ReportTemplate is a composition definition for those documents,
 *     not a submission.
 *   • Responsibility does carry PENDING / COMPLETED and an assignee,
 *     but it is the TASK module — assigned work, not reports. Counting
 *     it here labelled tasks as reports, which is why it is gone.
 *
 * What remains is the one genuine report lifecycle: a meeting's report
 * is FILED when the meeting is finalized, and OUTSTANDING once the
 * meeting has ended without that happening. That is reported per tier
 * so a Super Admin can see which part of the org is behind on filing.
 */
async function reportsAnalytics(f) {
  return cached('reports', f, async () => {
    const scope = chainMatch(f);
    const now = new Date();
    const windowed = { ...scope, startAt: { $gte: f.from, ...(f.to ? { $lte: f.to } : {}) } };

    const childLevel = CHILD_OF[scopeLevel(f)];
    const fk = LEVEL_FK[childLevel] || 'provinceId';

    const [filedAgg, outstandingAgg, byUnit, org] = await Promise.all([
      Meeting.countDocuments({ ...windowed, state: 'FINALIZED' }),
      Meeting.countDocuments({
        ...scope,
        state: { $in: ['SCHEDULED', 'IN_PROGRESS', 'PENDING_REPORT'] },
        endAt: { $lt: now },
      }),
      // Filed vs outstanding per child unit, in one pass. `outstanding`
      // deliberately ignores the date window — a report from six months
      // ago is still outstanding today.
      Meeting.aggregate([
        { $match: { ...scope, $or: [{ startAt: windowed.startAt }, { endAt: { $lt: now }, state: { $in: ['SCHEDULED', 'IN_PROGRESS', 'PENDING_REPORT'] } }] } },
        {
          $group: {
            _id: `$${fk}`,
            filed: { $sum: { $cond: [{ $eq: ['$state', 'FINALIZED'] }, 1, 0] } },
            outstanding: {
              $sum: {
                $cond: [
                  {
                    $and: [
                      { $in: ['$state', ['SCHEDULED', 'IN_PROGRESS', 'PENDING_REPORT']] },
                      { $lt: ['$endAt', now] },
                    ],
                  }, 1, 0,
                ],
              },
            },
          },
        },
      ]),
      orgSnapshot(f),
    ]);

    const units = (unitListsOf(org)[childLevel]) || [];
    const by = new Map(byUnit.map((r) => [str(r._id), r]));

    const rows = units.map((u) => {
      const r = by.get(str(u._id)) || { filed: 0, outstanding: 0 };
      const total = r.filed + r.outstanding;
      return {
        _id: u._id,
        name: u.name,
        filed: r.filed,
        outstanding: r.outstanding,
        total,
        filingRate: total ? Math.round((r.filed / total) * 100) : null,
      };
    }).filter((r) => r.total > 0)
      .sort((a, b) => b.outstanding - a.outstanding || a.name.localeCompare(b.name));

    const total = filedAgg + outstandingAgg;
    return {
      level: childLevel,
      totals: {
        filed: filedAgg,
        outstanding: outstandingAgg,
        filingRate: total ? Math.round((filedAgg / total) * 100) : null,
      },
      rows,
    };
  });
}

/**
 * GET /dashboard/activity-trend — monthly event counts.
 * Empty months are backfilled so the chart keeps even spacing, the
 * same way the unit dashboard's 6-month trend does.
 */
async function activityTrend(f, months = 12) {
  const span = Math.min(36, Math.max(1, parseInt(months, 10) || 12));
  return cached(`trend:${span}`, f, async () => {
    const end = f.to || new Date();
    const start = new Date(end);
    start.setMonth(start.getMonth() - (span - 1));
    start.setDate(1);
    start.setHours(0, 0, 0, 0);

    const rows = await ActivityLog.aggregate([
      { $match: activityMatch(f, { from: start, to: end }) },
      {
        $group: {
          _id: { $dateToString: { format: '%Y-%m', date: '$occurredAt' } },
          events: { $sum: 1 },
          // $$REMOVE drops rows with no member (admin accounts have no
          // linked Member) instead of letting a single null join the
          // set and inflate every month's distinct-member count by one.
          members: { $addToSet: { $ifNull: ['$memberId', '$$REMOVE'] } },
        },
      },
      { $project: { events: 1, activeMembers: { $size: '$members' } } },
      { $sort: { _id: 1 } },
    ]);

    // What KIND of work the organization does, over the same window.
    // The monthly series answers "how much"; this answers "of what",
    // which the trend line alone can never show.
    const byCategory = await ActivityLog.aggregate([
      { $match: activityMatch(f, { from: start, to: end }) },
      { $group: { _id: '$category', events: { $sum: 1 } } },
      { $sort: { events: -1 } },
    ]);

    return {
      buckets: monthBuckets(
        end, span,
        new Map(rows.map((r) => [r._id, r])),
        (hit) => ({ events: hit?.events || 0, activeMembers: hit?.activeMembers || 0 }),
      ),
      byCategory: byCategory.map((r) => ({ category: r._id || 'OTHER', events: r.events })),
    };
  });
}

/**
 * GET /dashboard/activity — the recent organizational activity feed.
 */
async function recentActivity(f, limit = 20) {
  const n = Math.min(100, Math.max(1, parseInt(limit, 10) || 20));

  const rows = await ActivityLog.find(activityMatch(f))
    .sort({ occurredAt: -1 })
    .limit(n)
    // Two batched lookups for the whole page, not one per row.
    .populate('memberId', 'fullName memberId')
    .populate('provinceId', 'name')
    .lean();

  return rows.map((r) => ({
    _id: r._id,
    action: r.action,
    category: r.category,
    occurredAt: r.occurredAt,
    member: r.memberId ? { _id: r.memberId._id, fullName: r.memberId.fullName, memberId: r.memberId.memberId } : null,
    province: r.provinceId ? { _id: r.provinceId._id, name: r.provinceId.name } : null,
    unitLevel: r.unitLevel || null,
    targetType: r.targetType || null,
    targetLabel: r.targetLabel || null,
  }));
}

/**
 * GET /dashboard/inactive-members — paginated dormant roster, oldest
 * silence first, with the full territorial path for the drill-down
 * links.
 */
async function inactiveMembers(f, { page = 1, limit = 25 } = {}) {
  const p = Math.max(1, parseInt(page, 10) || 1);
  const n = Math.min(200, Math.max(1, parseInt(limit, 10) || 25));

  const activeClause = await activeMemberClause(f);
  // Negate the active predicate. Members who have never acted have no
  // lastActivityAt at all, so $lt alone would miss them — $nin/$not
  // over the same clause keeps both cases in one filter.
  const inactiveClause = activeClause._id
    ? { _id: { $nin: activeClause._id.$in } }
    : { $or: [{ lastActivityAt: null }, { lastActivityAt: { $lt: f.from } }] };

  const filter = { ...memberMatch(f), ...inactiveClause };

  const [total, rows] = await Promise.all([
    Member.countDocuments(filter),
    Member.find(filter)
      .sort({ lastActivityAt: 1, createdAt: 1 })
      .skip((p - 1) * n)
      .limit(n)
      .select('fullName memberId phone status lastActivityAt provinceId districtId areaId basicUnitId createdAt')
      .populate('provinceId', 'name')
      .populate('districtId', 'name')
      .populate('areaId', 'name')
      .populate('basicUnitId', 'name')
      .lean(),
  ]);

  const now = Date.now();
  return {
    total,
    page: p,
    limit: n,
    pages: Math.ceil(total / n) || 1,
    items: rows.map((m) => ({
      _id: m._id,
      fullName: m.fullName,
      memberCode: m.memberId,
      phone: m.phone,
      status: m.status,
      province: m.provinceId?.name || null,
      district: m.districtId?.name || null,
      area: m.areaId?.name || null,
      basicUnit: m.basicUnitId?.name || null,
      lastActivityAt: m.lastActivityAt || null,
      daysInactive: m.lastActivityAt
        ? Math.floor((now - new Date(m.lastActivityAt).getTime()) / 86400000)
        : null,
    })),
  };
}

/**
 * GET /dashboard/inactive-units — the detailed dormancy table.
 *
 * Reads the cached org snapshot, so filtering and paging cost no
 * database work at all. Rows carry the full path plus the responsible
 * office bearer, which is what makes each row actionable.
 */
async function inactiveUnits(f, { level = 'BASIC_UNIT', page = 1, limit = 25 } = {}) {
  const lvl = REPORTABLE_LEVELS.includes(level) ? level : 'BASIC_UNIT';
  const p = Math.max(1, parseInt(page, 10) || 1);
  const n = Math.min(200, Math.max(1, parseInt(limit, 10) || 25));

  const org = await orgSnapshot(f);
  const pool = {
    BASIC_UNIT: org.basicUnits,
    AREA: org.areas,
    DISTRICT: org.districts,
    PROVINCE: org.provinces,
  }[lvl];

  // Name lookups for the path columns, built once from the snapshot.
  const nameOf = (list) => new Map(list.map((u) => [str(u._id), u.name]));
  const provName = nameOf(org.provinces);
  const distName = nameOf(org.districts);
  const areaName = nameOf(org.areas);

  // This table exists to surface dormancy, so INACTIVE is the default.
  // The Organization Status filter flips it to the active roster.
  const wanted = f.orgStatus === 'ACTIVE'
    ? pool.filter((u) => u.isActiveUnit)
    : pool.filter((u) => !u.isActiveUnit);

  const sorted = [...wanted].sort((a, b) => {
    const av = a.lastActivityAt ? new Date(a.lastActivityAt).getTime() : 0;
    const bv = b.lastActivityAt ? new Date(b.lastActivityAt).getTime() : 0;
    return av - bv;
  });

  const now = Date.now();
  const slice = sorted.slice((p - 1) * n, (p - 1) * n + n).map((u) => ({
    _id: u._id,
    level: lvl,
    name: u.name,
    province: lvl === 'PROVINCE' ? u.name : provName.get(str(u.provinceId)) || null,
    district: lvl === 'DISTRICT' ? u.name : distName.get(str(u.districtId)) || null,
    area: lvl === 'AREA' ? u.name : areaName.get(str(u.areaId)) || null,
    basicUnit: lvl === 'BASIC_UNIT' ? u.name : null,
    provinceId: u.provinceId || (lvl === 'PROVINCE' ? u._id : null),
    districtId: u.districtId || (lvl === 'DISTRICT' ? u._id : null),
    areaId: u.areaId || (lvl === 'AREA' ? u._id : null),
    officer: u.officer
      ? {
        memberId: u.officer.memberId,
        memberCode: u.officer.memberCode,
        fullName: u.officer.fullName,
        roleCode: u.officer.roleCode,
        phone: u.officer.phone,
      }
      : null,
    officerCount: u.officerCount,
    lastActivityAt: u.lastActivityAt || null,
    daysInactive: u.lastActivityAt
      ? Math.floor((now - new Date(u.lastActivityAt).getTime()) / 86400000)
      : null,
    status: u.isActiveUnit ? 'ACTIVE' : 'INACTIVE',
  }));

  return {
    level: lvl,
    total: sorted.length,
    page: p,
    limit: n,
    pages: Math.ceil(sorted.length / n) || 1,
    items: slice,
  };
}

module.exports = {
  ACTIVE_WINDOW_DAYS,
  KEY_ROLES,
  CHILD_OF,
  parseFilters,
  scopeLevel,
  scopePath,
  summary,
  orgBreakdown,
  provinceBreakdown,
  membershipAnalytics,
  meetingsAnalytics,
  campaignsAnalytics,
  reportsAnalytics,
  activityTrend,
  recentActivity,
  inactiveMembers,
  inactiveUnits,
  invalidateCache,
};
