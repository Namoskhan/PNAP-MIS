const ActivityLog = require('../models/ActivityLog');
const User = require('../models/User');
const Member = require('../models/Member');
const Meeting = require('../models/Meeting');
const Activity = require('../models/Activity');
const FundTransfer = require('../models/FundTransfer');
const RoleAssignment = require('../models/RoleAssignment');
const Announcement = require('../models/Announcement');
const Expense = require('../models/Expense');
const AuditLog = require('../models/AuditLog');
const activityService = require('../services/activityService');

// ─── One-time derivation of history into ActivityLog ───────────────
//
// The activity hooks only see work done from the moment they ship.
// Without this, every member and every unit would read INACTIVE on
// first boot and the executive dashboard would look broken rather
// than empty — an organization with years of meetings on file would
// be reported as entirely dormant.
//
// So we replay what the existing collections already record. Every
// meaningful action in this system left a timestamp and an actor
// behind (Meeting.createdBy + createdAt, Member.approvedBy +
// approvedAt, FundTransfer.initiatedBy + initiatedAt, …); this walks
// those and materializes the equivalent ActivityLog rows.
//
// Idempotent three ways over:
//   • every derived row carries a deterministic dedupeKey, unique in
//     the collection, so a re-run inserts nothing;
//   • inserts are unordered, so expected duplicate-key errors don't
//     abandon the batch;
//   • a sentinel row records completion, so a normal boot skips the
//     scan entirely rather than re-reading every collection.
//
// Bump BACKFILL_VERSION to force a re-derivation after changing what
// counts as historical activity.

const BACKFILL_VERSION = 'v1';
const SENTINEL_KEY = `backfill:${BACKFILL_VERSION}:complete`;
const BATCH = 1000;

// Actions are credited to MEMBERS, but most source records name a
// USER. One lookup builds the whole translation table; admin accounts
// with no linked member simply resolve to null and their rows land
// with memberId unset (correct — they are not members).
async function userToMemberMap() {
  const users = await User.find({ memberId: { $exists: true, $ne: null } })
    .select('_id memberId').lean();
  return new Map(users.map((u) => [String(u._id), u.memberId]));
}

async function flush(docs, stats) {
  if (docs.length === 0) return;
  try {
    const res = await ActivityLog.insertMany(docs, { ordered: false });
    stats.inserted += res.length;
  } catch (err) {
    // A duplicate key here is the expected outcome of a partial
    // previous run — count what did land and move on.
    stats.inserted += err.result?.nInserted ?? err.insertedDocs?.length ?? 0;
    if (err.code !== 11000 && !err.writeErrors) throw err;
  }
  docs.length = 0;
}

function row({ action, memberId, actorUserId, unitLevel, unitId, chain, targetType, targetId, targetLabel, occurredAt, dedupeKey }) {
  if (!occurredAt) return null;
  return {
    action,
    category: ActivityLog.ACTIONS[action] || 'OTHER',
    memberId: memberId || null,
    actorUserId: actorUserId || null,
    unitLevel: unitLevel || undefined,
    unitId: unitId || undefined,
    basicUnitId: chain?.basicUnitId || null,
    areaId: chain?.areaId || null,
    districtId: chain?.districtId || null,
    provinceId: chain?.provinceId || null,
    targetType,
    targetId,
    targetLabel: targetLabel ? String(targetLabel).slice(0, 200) : undefined,
    occurredAt: new Date(occurredAt),
    dedupeKey,
  };
}

// Walk a query in batches, mapping each source document to zero or
// more ActivityLog rows. Cursor-based so a large meeting or member
// collection never has to fit in memory at once.
async function derive(Model, filter, projection, mapFn, stats) {
  const docs = [];
  const cursor = Model.find(filter).select(projection).lean().cursor({ batchSize: BATCH });
  for await (const src of cursor) {
    for (const r of mapFn(src)) {
      if (r) docs.push(r);
    }
    if (docs.length >= BATCH) await flush(docs, stats);
  }
  await flush(docs, stats);
}

async function backfillActivityLog() {
  const done = await ActivityLog.exists({ dedupeKey: SENTINEL_KEY });
  if (done) return { skipped: true, inserted: 0, membersTouched: 0 };

  const u2m = await userToMemberMap();
  const member = (userId) => (userId ? u2m.get(String(userId)) || null : null);
  const stats = { inserted: 0 };

  const chainOf = (d) => ({
    basicUnitId: d.basicUnitId, areaId: d.areaId, districtId: d.districtId, provinceId: d.provinceId,
  });

  // ── Meetings: creation, finalization, attendance ────────────────
  // There is no finalizedBy field on Meeting, so the convening
  // officer (createdBy) is credited for the finalization too — the
  // closest honest attribution the stored data supports.
  await derive(
    Meeting, {},
    'unitLevel unitId basicUnitId areaId districtId provinceId type title state createdBy createdAt finalizedAt attendance chairpersonId supervisorMemberId',
    (m) => {
      const chain = chainOf(m);
      const base = {
        actorUserId: m.createdBy,
        unitLevel: m.unitLevel,
        unitId: m.unitId,
        chain,
        targetType: 'Meeting',
        targetId: m._id,
        targetLabel: m.title || m.type,
      };
      const out = [row({
        ...base,
        action: 'MEETING_CREATED',
        memberId: member(m.createdBy),
        occurredAt: m.createdAt,
        dedupeKey: `meeting:${m._id}:MEETING_CREATED`,
      })];

      if (m.state === 'FINALIZED' && m.finalizedAt) {
        out.push(row({
          ...base,
          action: 'MEETING_FINALIZED',
          memberId: member(m.createdBy),
          occurredAt: m.finalizedAt,
          dedupeKey: `meeting:${m._id}:MEETING_FINALIZED`,
        }));

        const when = m.finalizedAt;
        const attended = new Set();
        for (const a of m.attendance || []) {
          if (a.status !== 'PRESENT' && a.status !== 'LATE') continue;
          attended.add(String(a.memberId));
          out.push(row({
            ...base,
            action: 'ATTENDANCE_MARKED',
            memberId: a.memberId,
            occurredAt: when,
            dedupeKey: `meeting:${m._id}:ATTENDANCE_MARKED:${a.memberId}`,
          }));
        }
        for (const id of [m.chairpersonId, m.supervisorMemberId]) {
          if (!id || attended.has(String(id))) continue;
          out.push(row({
            ...base,
            action: 'MEETING_PARTICIPATION',
            memberId: id,
            occurredAt: when,
            dedupeKey: `meeting:${m._id}:MEETING_PARTICIPATION:${id}`,
          }));
        }
      }
      return out;
    },
    stats,
  );

  // ── Activities: creation, completion, participation ─────────────
  await derive(
    Activity, {},
    'unitLevel unitId basicUnitId areaId districtId provinceId type title state createdBy createdAt updatedAt leadMemberId participants',
    (a) => {
      const base = {
        actorUserId: a.createdBy,
        unitLevel: a.unitLevel,
        unitId: a.unitId,
        chain: chainOf(a),
        targetType: 'Activity',
        targetId: a._id,
        targetLabel: a.title,
      };
      const out = [row({
        ...base,
        action: 'ACTIVITY_CREATED',
        memberId: member(a.createdBy),
        occurredAt: a.createdAt,
        dedupeKey: `activity:${a._id}:ACTIVITY_CREATED`,
      })];

      if (a.state === 'COMPLETED') {
        // No completedAt column exists; updatedAt is when the state
        // last moved, which for a COMPLETED activity is the completion.
        const when = a.updatedAt || a.createdAt;
        out.push(row({
          ...base,
          action: 'ACTIVITY_COMPLETED',
          memberId: member(a.createdBy),
          occurredAt: when,
          dedupeKey: `activity:${a._id}:ACTIVITY_COMPLETED`,
        }));
        for (const id of [...(a.participants || []), a.leadMemberId].filter(Boolean)) {
          out.push(row({
            ...base,
            action: 'ACTIVITY_PARTICIPATION',
            memberId: id,
            occurredAt: when,
            dedupeKey: `activity:${a._id}:ACTIVITY_PARTICIPATION:${id}`,
          }));
        }
      }
      return out;
    },
    stats,
  );

  // ── Fund transfers ──────────────────────────────────────────────
  await derive(
    FundTransfer, {},
    'sourceLevel sourceUnitId destinationLevel destinationUnitId sourceName destinationName basicUnitId areaId districtId provinceId state initiatedBy initiatedAt acknowledgedBy acknowledgedAt',
    (t) => {
      const label = `${t.sourceName || t.sourceLevel} → ${t.destinationName || t.destinationLevel}`;
      const out = [row({
        action: 'FUND_TRANSFER_INITIATED',
        memberId: member(t.initiatedBy),
        actorUserId: t.initiatedBy,
        unitLevel: t.sourceLevel,
        unitId: t.sourceUnitId,
        chain: chainOf(t),
        targetType: 'FundTransfer',
        targetId: t._id,
        targetLabel: label,
        occurredAt: t.initiatedAt,
        dedupeKey: `transfer:${t._id}:FUND_TRANSFER_INITIATED`,
      })];
      if (t.state === 'ACKNOWLEDGED' && t.acknowledgedAt) {
        out.push(row({
          action: 'FUND_TRANSFER_ACKNOWLEDGED',
          memberId: member(t.acknowledgedBy),
          actorUserId: t.acknowledgedBy,
          unitLevel: t.destinationLevel,
          unitId: t.destinationUnitId,
          // The stored chain describes the SOURCE; a destination in
          // another branch would be mis-attributed, so leave it unset
          // and let unitLevel/unitId carry the location.
          chain: null,
          targetType: 'FundTransfer',
          targetId: t._id,
          targetLabel: label,
          occurredAt: t.acknowledgedAt,
          dedupeKey: `transfer:${t._id}:FUND_TRANSFER_ACKNOWLEDGED`,
        }));
      }
      return out;
    },
    stats,
  );

  // ── Member registration + approval ──────────────────────────────
  await derive(
    Member, {},
    'basicUnitId areaId districtId provinceId fullName submittedBy createdAt approvedBy approvedAt',
    (m) => {
      const base = {
        unitLevel: 'BASIC_UNIT',
        unitId: m.basicUnitId,
        chain: chainOf(m),
        targetType: 'Member',
        targetId: m._id,
        targetLabel: m.fullName,
      };
      const out = [];
      if (m.submittedBy) {
        out.push(row({
          ...base,
          action: 'MEMBER_REGISTERED',
          memberId: member(m.submittedBy),
          actorUserId: m.submittedBy,
          occurredAt: m.createdAt,
          dedupeKey: `member:${m._id}:MEMBER_REGISTERED`,
        }));
      }
      if (m.approvedBy && m.approvedAt) {
        out.push(row({
          ...base,
          action: 'MEMBER_APPROVED',
          memberId: member(m.approvedBy),
          actorUserId: m.approvedBy,
          occurredAt: m.approvedAt,
          dedupeKey: `member:${m._id}:MEMBER_APPROVED`,
        }));
      }
      return out;
    },
    stats,
  );

  // ── Cabinet role assignments ────────────────────────────────────
  // Three credits: whoever proposed it, whoever decided it, and the
  // member who took office.
  await derive(
    RoleAssignment, {},
    'unitLevel unitId memberId roleCode state initiatedBy initiatedAt decidedBy decidedAt startedAt',
    (ra) => {
      const base = {
        unitLevel: ra.unitLevel,
        unitId: ra.unitId,
        chain: null,
        targetType: 'RoleAssignment',
        targetId: ra._id,
        targetLabel: ra.roleCode,
        action: 'CABINET_ROLE_ASSIGNED',
      };
      const out = [];
      if (ra.initiatedBy && ra.initiatedAt) {
        out.push(row({
          ...base,
          memberId: member(ra.initiatedBy),
          actorUserId: ra.initiatedBy,
          occurredAt: ra.initiatedAt,
          dedupeKey: `role:${ra._id}:INITIATED`,
        }));
      }
      if (ra.decidedBy && ra.decidedAt) {
        out.push(row({
          ...base,
          memberId: member(ra.decidedBy),
          actorUserId: ra.decidedBy,
          occurredAt: ra.decidedAt,
          dedupeKey: `role:${ra._id}:DECIDED`,
        }));
      }
      if (ra.state === 'APPROVED' && ra.memberId) {
        out.push(row({
          ...base,
          memberId: ra.memberId,
          occurredAt: ra.startedAt || ra.decidedAt,
          dedupeKey: `role:${ra._id}:HOLDER`,
        }));
      }
      return out;
    },
    stats,
  );

  // ── Announcements ───────────────────────────────────────────────
  await derive(
    Announcement, {},
    'unitLevel unitId basicUnitId areaId districtId provinceId title authorUserId createdAt',
    (a) => [row({
      action: 'ANNOUNCEMENT_CREATED',
      memberId: member(a.authorUserId),
      actorUserId: a.authorUserId,
      unitLevel: a.unitLevel,
      unitId: a.unitId,
      chain: chainOf(a),
      targetType: 'Announcement',
      targetId: a._id,
      targetLabel: a.title,
      occurredAt: a.createdAt,
      dedupeKey: `announcement:${a._id}:ANNOUNCEMENT_CREATED`,
    })],
    stats,
  );

  // ── Expense returns: submission + approval ──────────────────────
  await derive(
    Expense, {},
    'unitLevel unitId basicUnitId areaId districtId provinceId category state recordedBy createdAt approvedBy approvedAt',
    (e) => {
      const base = {
        unitLevel: e.unitLevel,
        unitId: e.unitId,
        chain: chainOf(e),
        targetType: 'Expense',
        targetId: e._id,
        targetLabel: e.category,
      };
      const out = [];
      if (e.recordedBy) {
        out.push(row({
          ...base,
          action: 'REPORT_SUBMITTED',
          memberId: member(e.recordedBy),
          actorUserId: e.recordedBy,
          occurredAt: e.createdAt,
          dedupeKey: `expense:${e._id}:REPORT_SUBMITTED`,
        }));
      }
      if (e.approvedBy && e.approvedAt) {
        out.push(row({
          ...base,
          action: 'REPORT_APPROVED',
          memberId: member(e.approvedBy),
          actorUserId: e.approvedBy,
          occurredAt: e.approvedAt,
          dedupeKey: `expense:${e._id}:REPORT_APPROVED`,
        }));
      }
      return out;
    },
    stats,
  );

  // ── Historical administrative actions ───────────────────────────
  // Going forward utils/audit.js mirrors these live; this covers what
  // was already on file.
  await derive(
    AuditLog, {},
    'actorUserId action targetType targetId targetLabel createdAt',
    (a) => [row({
      action: 'ADMIN_ACTION',
      memberId: member(a.actorUserId),
      actorUserId: a.actorUserId,
      chain: null,
      targetType: a.targetType,
      targetId: a.targetId,
      targetLabel: a.targetLabel || a.action,
      occurredAt: a.createdAt,
      dedupeKey: `audit:${a._id}:ADMIN_ACTION`,
    })],
    stats,
  );

  // Collapse the replayed history into Member.lastActivityAt, the
  // denormalized field every active/inactive query reads.
  const refreshed = await activityService.refreshLastActivity();

  // Mark completion so subsequent boots skip the whole scan.
  // category SYSTEM keeps this bookkeeping row out of every read path
  // (see analyticsService.activityMatch) — it is not party work and
  // must not show up in a feed, a trend bucket or an event count.
  await ActivityLog.create({
    action: 'SYSTEM_BACKFILL',
    category: 'SYSTEM',
    occurredAt: new Date(),
    targetType: 'System',
    targetLabel: `activity backfill ${BACKFILL_VERSION}`,
    dedupeKey: SENTINEL_KEY,
  });

  return { skipped: false, inserted: stats.inserted, membersTouched: refreshed.updated };
}

module.exports = { backfillActivityLog, BACKFILL_VERSION };
