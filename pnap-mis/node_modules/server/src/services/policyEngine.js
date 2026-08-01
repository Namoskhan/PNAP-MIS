const UnitPolicy = require('../models/UnitPolicy');
const { ApiError } = require('../utils/response');

// policyEngine — single source of truth for resolving and enforcing
// UnitPolicy rules. Domain controllers call into this service rather
// than reading thresholds inline; admin edits to the policy
// catalogue take effect immediately because the cache is keyed on
// (scope, tierCode, unitId) tuples and invalidated on every write.
//
// Resolution order: UNIT → TIER → GLOBAL (most specific wins).
// Within a section, leaf fields are deep-merged so admin can
// override individual rules without copying the entire section.
//
// Assertions are TOLERANT: if a policy field is missing or zero/
// empty, the assertion is a no-op. The default seeded GLOBAL policy
// uses values that match the system's pre-PR-U3 behavior, so
// deploying this engine changes nothing for end users.

// ─── Cache ────────────────────────────────────────────────────────
// LRU keyed on `${tierCode}::${unitId}`. Single in-process cache
// because resolution is read-mostly and admin writes are rare.
// Resolved policies are plain JS objects (no Mongoose hydrated docs)
// so they're cheap to keep around.
const _cache = new Map();
const _MAX = 256;

function _cacheKey(tierCode, unitId) {
  return `${tierCode || 'GLOBAL'}::${unitId || ''}`;
}

function _cacheGet(key) {
  const v = _cache.get(key);
  if (v) {
    _cache.delete(key);
    _cache.set(key, v); // bump to MRU
  }
  return v;
}

function _cachePut(key, value) {
  _cache.set(key, value);
  if (_cache.size > _MAX) {
    const first = _cache.keys().next().value;
    _cache.delete(first);
  }
}

// invalidate — drop cache entries impacted by a policy edit. Called
// by the admin controller after every write.
//   GLOBAL change → drop everything (every resolution depends on GLOBAL)
//   TIER  change → drop entries for that tier (any unitId at that tier)
//   UNIT  change → drop the single entry for (tier, unitId)
function invalidate(scope, tierCode, unitId) {
  if (scope === 'GLOBAL') {
    _cache.clear();
    return;
  }
  if (scope === 'TIER') {
    for (const k of [..._cache.keys()]) {
      if (k.startsWith(`${tierCode}::`)) _cache.delete(k);
    }
    return;
  }
  if (scope === 'UNIT') {
    _cache.delete(_cacheKey(tierCode, unitId));
  }
}

// ─── Resolve ──────────────────────────────────────────────────────

// Deep-merge two policy objects. `over` (more specific) wins on every
// leaf field. Arrays from `over` REPLACE arrays from `under` (we
// don't try to be clever — admin overriding `allowedDirections`
// expects to replace the list, not append to it).
function _deepMerge(under, over) {
  if (over === undefined || over === null) return under;
  if (typeof over !== 'object' || Array.isArray(over)) return over;
  if (typeof under !== 'object' || under === null || Array.isArray(under)) return over;
  const out = { ...under };
  for (const k of Object.keys(over)) {
    if (over[k] === undefined) continue;
    out[k] = _deepMerge(under[k], over[k]);
  }
  return out;
}

// Strip Mongoose internals + collapse Mongoose subdocuments to plain
// objects so the merged policy is a pure POJO.
function _toPlain(doc) {
  if (!doc) return null;
  const o = doc.toObject ? doc.toObject() : doc;
  // Drop the rows that aren't policy slices
  const slice = (s) => (s && Object.keys(s).length ? s : undefined);
  return {
    member:   slice(o.member),
    meeting:  slice(o.meeting),
    finance:  slice(o.finance),
    transfer: slice(o.transfer),
    _meta: {
      scope: o.scope,
      tierCode: o.tierCode,
      unitId: o.unitId ? String(o.unitId) : null,
      policyVersion: o.policyVersion,
    },
  };
}

// resolveFor — return the merged policy for a (tierCode, unitId).
// Result includes a `_versions` block so audit can reconstruct which
// rows fed into the resolution.
async function resolveFor(tierCode, unitId) {
  const code = tierCode ? String(tierCode).toUpperCase() : null;
  const uid = unitId ? String(unitId) : null;
  const key = _cacheKey(code, uid);
  const cached = _cacheGet(key);
  if (cached) return cached;

  // Pull the up-to-three rows that contribute to this resolution.
  const queries = [{ scope: 'GLOBAL', isActive: true }];
  if (code) queries.push({ scope: 'TIER', tierCode: code, isActive: true });
  if (code && uid) queries.push({ scope: 'UNIT', tierCode: code, unitId: uid, isActive: true });

  const docs = await UnitPolicy.find({ $or: queries });
  const byScope = {
    GLOBAL: docs.find((d) => d.scope === 'GLOBAL'),
    TIER:   docs.find((d) => d.scope === 'TIER' && d.tierCode === code),
    UNIT:   docs.find((d) => d.scope === 'UNIT' && d.tierCode === code && String(d.unitId) === uid),
  };

  // Merge: GLOBAL → TIER → UNIT (each overrides previous)
  let merged = { member: {}, meeting: {}, finance: {}, transfer: {} };
  for (const scope of ['GLOBAL', 'TIER', 'UNIT']) {
    const plain = _toPlain(byScope[scope]);
    if (!plain) continue;
    merged = _deepMerge(merged, {
      member: plain.member,
      meeting: plain.meeting,
      finance: plain.finance,
      transfer: plain.transfer,
    });
  }

  merged._versions = {
    global: byScope.GLOBAL?.policyVersion,
    tier:   byScope.TIER?.policyVersion,
    unit:   byScope.UNIT?.policyVersion,
  };
  merged._sources = {
    global: byScope.GLOBAL?._id,
    tier:   byScope.TIER?._id,
    unit:   byScope.UNIT?._id,
  };

  _cachePut(key, merged);
  return merged;
}

// ─── Assertions ───────────────────────────────────────────────────
// Each function is tolerant: a missing/zero rule is a no-op so the
// default permissive policy preserves pre-PR-U3 behavior.

// Compare a meeting's PRESENT-attendance count against quorumMin.
// `attendance` is the array of { memberId, status } records from the
// meeting record. We count PRESENT (LATE doesn't count toward quorum
// on a strict reading; this matches typical parliamentary practice).
function assertMeetingQuorum(meeting, attendance, policy) {
  const rule = policy?.meeting || {};
  const present = (attendance || []).filter((a) => a.status === 'PRESENT').length;

  if (rule.quorumMin && present < rule.quorumMin) {
    throw new ApiError(
      400,
      'POLICY_VIOLATION',
      `Quorum not met: ${present} present, ${rule.quorumMin} required for this ${meeting.unitLevel}.`,
      { rule: 'meeting.quorumMin', threshold: rule.quorumMin, actual: present },
    );
  }

  if (rule.minAttendancePercent) {
    // Total expected attendees = explicit attendance entries (we treat
    // the attendance array as the roster). If empty, percent is N/A.
    const total = (attendance || []).length;
    if (total > 0) {
      const percent = (present / total) * 100;
      if (percent < rule.minAttendancePercent) {
        throw new ApiError(
          400,
          'POLICY_VIOLATION',
          `Attendance below threshold: ${percent.toFixed(0)}% present, ${rule.minAttendancePercent}% required.`,
          { rule: 'meeting.minAttendancePercent', threshold: rule.minAttendancePercent, actual: percent },
        );
      }
    }
  }
}

// Decide whether an expense needs a second approver. Returns
// `{ requiresApproval, reason }` rather than throwing — the caller
// uses the boolean to set the initial state. Falls back to the
// existing 10000 threshold when policy doesn't specify, preserving
// the legacy hardcoded value as a safety net.
function expenseRequiresSecondApprover(amount, policy) {
  const rule = policy?.finance || {};
  const above = rule.expenseRequireSecondApproverAbove;
  if (typeof above === 'number' && above > 0) {
    return {
      requiresApproval: amount > above,
      threshold: above,
      reason: amount > above ? `Expense Rs ${amount} exceeds Rs ${above} second-approver threshold` : null,
    };
  }
  // No rule set → no second approver needed (more permissive than
  // legacy). Admin must explicitly seed a threshold to enforce.
  return { requiresApproval: false, threshold: null, reason: null };
}

// Direction inference + assertion for fund transfers. `direction`
// passed by the controller is one of UP / DOWN / SAME_TIER (or null
// if the controller hasn't computed it yet — we don't infer here).
function assertTransferDirection(direction, policy) {
  const rule = policy?.transfer || {};
  const allowed = Array.isArray(rule.allowedDirections) ? rule.allowedDirections : null;
  if (!allowed || allowed.length === 0) return; // no rule → permissive
  if (!allowed.includes(direction)) {
    throw new ApiError(
      400,
      'POLICY_VIOLATION',
      `Transfer direction "${direction}" is not permitted (allowed: ${allowed.join(', ')}).`,
      { rule: 'transfer.allowedDirections', allowed, actual: direction },
    );
  }
}

// Soft warnings — useful for UI banners that don't block submission.
// Caller decides what to show.
function warnings(record, policy) {
  const out = [];
  const m = policy?.meeting || {};
  if (record?.kind === 'MEETING') {
    const present = (record.attendance || []).filter((a) => a.status === 'PRESENT').length;
    if (m.quorumWarn && present < m.quorumWarn && (!m.quorumMin || present >= m.quorumMin)) {
      out.push({
        rule: 'meeting.quorumWarn',
        message: `Attendance below recommended quorum (${present} / ${m.quorumWarn})`,
      });
    }
  }
  return out;
}

module.exports = {
  resolveFor,
  invalidate,
  assertMeetingQuorum,
  expenseRequiresSecondApprover,
  assertTransferDirection,
  warnings,
};
