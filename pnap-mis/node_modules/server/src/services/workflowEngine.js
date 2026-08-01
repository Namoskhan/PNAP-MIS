const WorkflowConfig = require('../models/WorkflowConfig');
const { ApiError } = require('../utils/response');
const { userHasPermission } = require('../utils/permissions');

// workflowEngine — resolves and advances approval chains for any
// domain controller (expense / member / role / transfer). Called
// instead of the controller's own permission gate.
//
// Public surface:
//   resolveStages(domain, tierCode, payload)
//   canDecideAt(stage, user)                 → true | throw
//   recordDecision(record, stage, user, decision, note)
//   nextPendingStage(record, stages)
//   isComplete(record, stages)
//   computeFinalState(stages, chain)
//   invalidate(domain, tierCode?)
//
// Stage semantics (re-stated for callers): each stage is either
// APPLIES (must be decided), or SKIPPED (auto-recorded, workflow
// advances). Threshold-based skipping is evaluated against the
// payload at resolution time. APPROVED progresses to the next
// pending stage; REJECTED at any stage freezes the chain to
// REJECTED final state.
//
// Behavior with default seeded configs (single APPLIES stage per
// domain) is byte-equivalent to the legacy single-decision gate.

// ─── Cache ────────────────────────────────────────────────────────
const _cache = new Map();
const _MAX = 128;

function _cacheKey(domain, tierCode) {
  return `${domain}::${tierCode || 'GLOBAL'}`;
}

function _cacheGet(key) {
  const v = _cache.get(key);
  if (v) {
    _cache.delete(key);
    _cache.set(key, v);
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

function invalidate(domain, tierCode) {
  if (!domain) {
    _cache.clear();
    return;
  }
  if (!tierCode) {
    // domain-wide invalidation: drop every cached row for this domain
    for (const k of [..._cache.keys()]) {
      if (k.startsWith(`${domain}::`)) _cache.delete(k);
    }
    return;
  }
  _cache.delete(_cacheKey(domain, tierCode));
}

// ─── Resolution ───────────────────────────────────────────────────

// Pull the active workflow config for (domain, tierCode), preferring
// a TIER-scope row if present, else falling back to GLOBAL.
async function _resolveConfig(domain, tierCode) {
  const code = tierCode ? String(tierCode).toUpperCase() : null;
  const key = _cacheKey(domain, code);
  const cached = _cacheGet(key);
  if (cached !== undefined) return cached;

  let cfg = null;
  if (code) {
    cfg = await WorkflowConfig.findOne({
      domain, scope: 'TIER', tierCode: code, isActive: true,
    }).lean();
  }
  if (!cfg) {
    cfg = await WorkflowConfig.findOne({
      domain, scope: 'GLOBAL', isActive: true,
    }).lean();
  }
  _cachePut(key, cfg || null);
  return cfg || null;
}

// resolveStages — return the ordered stage list with `_applies`
// computed against the payload. Callers iterate this and ask
// canDecideAt() for the first APPLIES stage that doesn't yet have
// an entry in the record's approvalChain.
async function resolveStages(domain, tierCode, payload) {
  const cfg = await _resolveConfig(domain, tierCode);
  if (!cfg) return { config: null, stages: [] };

  const stages = (cfg.stages || []).slice().sort(
    (a, b) => (a.sortOrder || 0) - (b.sortOrder || 0)
  );
  const out = stages.map((s) => {
    let applies = true;
    if (s.thresholdField && typeof s.thresholdAmount === 'number' && s.skipBelowThreshold) {
      const v = payload?.[s.thresholdField];
      const numeric = typeof v === 'number' ? v : parseFloat(v);
      if (Number.isFinite(numeric) && numeric < s.thresholdAmount) applies = false;
    }
    return { ...s, _applies: applies };
  });
  return { config: cfg, stages: out };
}

// ─── Permission check ─────────────────────────────────────────────

// canDecideAt — throws ApiError(403) if the user can't decide this
// stage; returns true if they can.
function canDecideAt(stage, user) {
  if (!stage) {
    throw new ApiError(400, 'NO_STAGE', 'No pending stage to decide');
  }
  if (stage.requirePermission && !userHasPermission(user, stage.requirePermission)) {
    throw new ApiError(
      403,
      'STAGE_FORBIDDEN',
      `Stage "${stage.name}" requires permission ${stage.requirePermission}`,
      { stageCode: stage.code, requirePermission: stage.requirePermission },
    );
  }
  if (stage.requireRoleCode) {
    const has = (user?.roles || []).includes(stage.requireRoleCode);
    if (!has) {
      throw new ApiError(
        403,
        'STAGE_FORBIDDEN',
        `Stage "${stage.name}" requires role ${stage.requireRoleCode}`,
        { stageCode: stage.code, requireRoleCode: stage.requireRoleCode },
      );
    }
  }
  return true;
}

// ─── Chain navigation ─────────────────────────────────────────────

// Find the first APPLIES stage that doesn't yet have a chain entry.
// SKIPPED stages still need an entry, but they're auto-recorded by
// recordDecision() in a single sweep.
function nextPendingStage(record, stages) {
  const decided = new Set((record?.approvalChain || []).map((c) => c.stageCode));
  for (const s of stages) {
    if (!s._applies) continue;
    if (!decided.has(s.code)) return s;
  }
  return null;
}

function isComplete(record, stages) {
  return nextPendingStage(record, stages) === null;
}

// Compute the FINAL state from a complete chain. APPROVED only when
// every APPLIES stage was approved; REJECTED if any APPLIES stage
// was rejected. SKIPPED entries don't gate either way.
function computeFinalState(stages, chain) {
  const byCode = new Map((chain || []).map((c) => [c.stageCode, c]));
  for (const s of stages) {
    if (!s._applies) continue;
    const entry = byCode.get(s.code);
    if (!entry) return 'PENDING';
    if (entry.decision === 'REJECTED') return 'REJECTED';
  }
  return 'APPROVED';
}

// recordDecision — append the user's decision to the chain. Caller
// is responsible for: (a) calling resolveStages first, (b) checking
// canDecideAt(stage, user), (c) persisting the record. Engine just
// builds the chain entry with auto-skipped predecessors.
//
// Returns the new chain (does NOT mutate `record.approvalChain` —
// caller assigns).
function recordDecision(record, stages, stage, user, decision, note) {
  if (!['APPROVED', 'REJECTED'].includes(decision)) {
    throw new ApiError(400, 'INVALID_DECISION', 'decision must be APPROVED or REJECTED');
  }
  const existing = (record?.approvalChain || []).slice();
  const decided = new Set(existing.map((c) => c.stageCode));

  // Auto-record any earlier SKIPPED stages that haven't been touched
  // yet — happens when an admin tightens a workflow mid-flight or
  // when a record advances past a threshold-based skip.
  for (const s of stages) {
    if (decided.has(s.code)) continue;
    if (s.code === stage.code) break;
    if (!s._applies) {
      existing.push({
        stageCode: s.code,
        stageName: s.name,
        decision: 'SKIPPED',
        decidedAt: new Date(),
      });
      decided.add(s.code);
    }
  }

  // Now record the user's decision for the target stage.
  existing.push({
    stageCode: stage.code,
    stageName: stage.name,
    decision,
    decidedBy: user?._id,
    decidedAt: new Date(),
    note: note || undefined,
  });

  return existing;
}

module.exports = {
  resolveStages,
  canDecideAt,
  nextPendingStage,
  isComplete,
  computeFinalState,
  recordDecision,
  invalidate,
};
