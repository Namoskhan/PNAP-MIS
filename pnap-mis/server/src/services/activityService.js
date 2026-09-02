const mongoose = require('mongoose');
const ActivityLog = require('../models/ActivityLog');
const Member = require('../models/Member');
const { resolveUnitChain } = require('../utils/unitScope');

const ACTIONS = ActivityLog.ACTIONS;

// ─── Centralized Activity Service ──────────────────────────────────
//
// The ONE place meaningful organizational activity is recorded. Every
// module calls record()/recordMany() and nothing else; no controller
// writes ActivityLog or touches Member.lastActivityAt directly. That
// keeps the definition of "activity" in a single file, so the rule
// can be tightened later without a sweep through twenty controllers.
//
// Two things happen per call, both idempotent-safe:
//   1. an ActivityLog row (the audit-grade history behind the trend
//      chart and the "last activity" columns);
//   2. a $max bump of Member.lastActivityAt (the denormalized hot
//      field the active/inactive queries read — $max so an
//      out-of-order backfill row can never move it backwards).
//
// Every call is FIRE-AND-FORGET by contract, matching utils/notify and
// utils/audit: a failure here is logged and swallowed, never
// propagated. Recording that a meeting was finalized must not be able
// to fail finalizing the meeting.

// Days of inactivity after which a member / unit is considered dormant.
// Single source of truth — analyticsService imports it rather than
// re-declaring 30.
const ACTIVE_WINDOW_DAYS = 30;

function activityCutoff(days = ACTIVE_WINDOW_DAYS, now = new Date()) {
  return new Date(now.getTime() - days * 24 * 3600 * 1000);
}

// Resolve the Member behind a login. Admin accounts (Super, Central,
// tier admins) have no linked Member — their work still lands in the
// log with memberId null so it shows on the trend, but it cannot make
// a member "active", which is correct: they are not members.
function memberIdOfUser(user) {
  return user?.memberId || null;
}

// Normalize the unit chain. Callers that already hold a resolved chain
// (most do — they just built one to denormalize onto their own record)
// pass it straight through; the rest name a unit and we resolve it.
async function resolveChain({ chain, unitLevel, unitId }) {
  if (chain) {
    return {
      basicUnitId: chain.basicUnitId || null,
      areaId: chain.areaId || null,
      districtId: chain.districtId || null,
      provinceId: chain.provinceId || null,
    };
  }
  if (!unitLevel || !unitId) return {};
  try {
    return (await resolveUnitChain(unitLevel, unitId)) || {};
  } catch {
    return {};
  }
}

function buildDoc({
  action, memberId, actorUser, actorUserId,
  unitLevel, unitId, chainFields,
  targetType, targetId, targetLabel,
  occurredAt, dedupeKey,
}) {
  const validTargetId = mongoose.Types.ObjectId.isValid(targetId) ? targetId : undefined;
  const label = targetLabel ? String(targetLabel).slice(0, 200) : (targetId && !validTargetId ? String(targetId) : undefined);

  return {
    action,
    category: ACTIONS[action] || 'OTHER',
    memberId: memberId || memberIdOfUser(actorUser) || null,
    actorUserId: actorUserId || actorUser?._id || null,
    unitLevel: unitLevel || undefined,
    unitId: unitId && mongoose.Types.ObjectId.isValid(unitId) ? unitId : undefined,
    ...chainFields,
    targetType,
    targetId: validTargetId,
    targetLabel: label,
    occurredAt: occurredAt ? new Date(occurredAt) : new Date(),
    dedupeKey: dedupeKey || undefined,
  };
}

// Bump the denormalized hot field. $max keeps the newest timestamp
// regardless of the order rows arrive in, which matters because the
// backfill replays history after live traffic has already started.
async function touchMembers(memberIds, occurredAt) {
  const ids = [...new Set((memberIds || []).filter(Boolean).map(String))];
  if (ids.length === 0) return;
  await Member.updateMany(
    { _id: { $in: ids } },
    { $max: { lastActivityAt: occurredAt ? new Date(occurredAt) : new Date() } },
  );
}

/**
 * Record one meaningful organizational activity.
 *
 * @param {object}  opts
 * @param {string}  opts.action       — an ActivityLog.ACTIONS key
 * @param {object} [opts.req]         — express request; actor taken from req.user
 * @param {object} [opts.actorUser]   — the acting User, when there is no req
 * @param {string} [opts.memberId]    — credit this member instead of the actor's own
 * @param {string} [opts.unitLevel]   — authoring tier
 * @param {string} [opts.unitId]      — authoring unit
 * @param {object} [opts.chain]       — pre-resolved {basicUnitId, areaId, districtId, provinceId}
 * @param {string} [opts.targetType]  — e.g. 'Meeting'
 * @param {*}      [opts.targetId]
 * @param {string} [opts.targetLabel]
 * @param {Date}   [opts.occurredAt]  — defaults to now
 * @param {string} [opts.dedupeKey]   — backfill idempotency handle
 * @returns {Promise<object|null>} the created row, or null on failure
 */
async function record(opts = {}) {
  try {
    const actorUser = opts.actorUser || opts.req?.user || null;
    const chainFields = await resolveChain(opts);
    const doc = buildDoc({ ...opts, actorUser, chainFields });
    if (!doc.action) return null;
    const row = await ActivityLog.create(doc);
    await touchMembers([doc.memberId], doc.occurredAt);
    return row;
  } catch (err) {
    // Duplicate dedupeKey is the expected outcome of replaying a
    // backfill — not worth a log line.
    if (err?.code !== 11000) {
      console.warn(`[activity] failed to record ${opts.action}: ${err.message}`);
    }
    return null;
  }
}

/**
 * Record the same activity for many members at once — the attendance
 * roster case. One insertMany + one updateMany instead of N round
 * trips, so finalizing a 300-person meeting stays a two-query
 * operation.
 *
 * @param {object}   opts      — as record(), minus memberId
 * @param {string[]} memberIds — members to credit
 */
async function recordMany(memberIds, opts = {}) {
  const ids = [...new Set((memberIds || []).filter(Boolean).map(String))];
  if (ids.length === 0) return [];
  try {
    const actorUser = opts.actorUser || opts.req?.user || null;
    const chainFields = await resolveChain(opts);
    const docs = ids.map((memberId) => buildDoc({
      ...opts,
      memberId,
      actorUser,
      chainFields,
      dedupeKey: opts.dedupeKey ? `${opts.dedupeKey}:${memberId}` : undefined,
    }));
    // ordered:false so one duplicate key doesn't abandon the rest.
    const rows = await ActivityLog.insertMany(docs, { ordered: false }).catch((err) => {
      if (err?.code === 11000 || err?.writeErrors) return err.insertedDocs || [];
      throw err;
    });
    await touchMembers(ids, opts.occurredAt);
    return rows;
  } catch (err) {
    console.warn(`[activity] bulk record ${opts.action} failed: ${err.message}`);
    return [];
  }
}

/**
 * Recompute Member.lastActivityAt from the log, authoritatively.
 *
 * Used by the backfill after replaying history, and as the repair hook
 * when the denormalized field is suspected of drift. Unlike the write
 * path this uses $set rather than $max, and nulls out members with no
 * log rows at all — a repair that can only ever move timestamps
 * forward cannot fix an over-stated one, which is the failure it most
 * needs to fix. The log is the source of truth; this makes the
 * denormalized field agree with it exactly.
 *
 * Safe because the only writer of lastActivityAt is this service, and
 * every row it writes is in the log being read here. A write landing
 * mid-repair would be re-applied by its own $max on the next call.
 *
 * @param {object} [filter] — Member filter to limit the repair
 */
async function refreshLastActivity(filter = {}) {
  const rows = await ActivityLog.aggregate([
    // SYSTEM rows are internal bookkeeping, not organizational work.
    { $match: { memberId: { $ne: null }, category: { $ne: 'SYSTEM' } } },
    { $group: { _id: '$memberId', last: { $max: '$occurredAt' } } },
  ]);

  const ops = rows.map((r) => ({
    updateOne: {
      filter: { _id: r._id, ...filter },
      update: { $set: { lastActivityAt: r.last } },
    },
  }));

  // Clear members who hold a timestamp but have no surviving rows.
  // Walked as a cursor against the in-memory id set rather than sent
  // as one enormous $nin — the "has rows" set is roughly every active
  // member, which is far too big to inline into a query.
  const withRows = new Set(rows.map((r) => String(r._id)));
  const stale = await Member.find({ ...filter, lastActivityAt: { $ne: null } })
    .select('_id').lean();
  for (const m of stale) {
    if (!withRows.has(String(m._id))) {
      ops.push({
        updateOne: { filter: { _id: m._id }, update: { $set: { lastActivityAt: null } } },
      });
    }
  }

  if (ops.length === 0) return { updated: 0 };
  const res = await Member.bulkWrite(ops, { ordered: false });
  return { updated: res.modifiedCount || 0 };
}

module.exports = {
  ACTIONS,
  ACTIVE_WINDOW_DAYS,
  activityCutoff,
  record,
  recordMany,
  refreshLastActivity,
};
