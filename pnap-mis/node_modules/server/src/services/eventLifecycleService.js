const { ApiError } = require('../utils/response');

// eventLifecycleService — single source of truth for legal state
// transitions on Meeting and Activity records. The CORE lifecycle is
// hardcoded and cannot be configured away (per §6 of the design); a
// type config may add OPTIONAL extra states that slot in *after* an
// existing core state, but the canonical states / order / finalize
// sealing are immutable.
//
// Public surface:
//   coreStatesFor(entity)
//   orderedStatesFor(entity, snapshotOrConfig?)   → core + extra
//   allowedNextStates(entity, currentState, snapshotOrConfig?)
//   canTransition(entity, fromState, toState, snapshotOrConfig?)
//   assertTransition(entity, fromState, toState, snapshotOrConfig?)
//
// Two terminal states per entity:
//   MEETING:  FINALIZED, CANCELLED
//   ACTIVITY: COMPLETED, CANCELLED
// Anything that lands in a terminal state is immutable from the
// lifecycle's perspective; the meeting controller still owns the
// hashing + photo gates separately.

const CORE = {
  MEETING: ['DRAFT', 'SCHEDULED', 'IN_PROGRESS', 'PENDING_REPORT', 'FINALIZED', 'CANCELLED'],
  ACTIVITY: ['PLANNED', 'COMPLETED', 'CANCELLED'],
};

const TERMINAL = {
  MEETING: new Set(['FINALIZED', 'CANCELLED']),
  ACTIVITY: new Set(['COMPLETED', 'CANCELLED']),
};

// Forward edges for the canonical path. CANCELLED is reachable from
// any non-terminal state.
const CORE_EDGES = {
  MEETING: {
    DRAFT: ['SCHEDULED', 'CANCELLED'],
    SCHEDULED: ['IN_PROGRESS', 'CANCELLED'],
    IN_PROGRESS: ['PENDING_REPORT', 'CANCELLED'],
    PENDING_REPORT: ['FINALIZED', 'CANCELLED'],
    FINALIZED: [],
    CANCELLED: [],
  },
  ACTIVITY: {
    PLANNED: ['COMPLETED', 'CANCELLED'],
    COMPLETED: [],
    CANCELLED: [],
  },
};

function coreStatesFor(entity) {
  if (!CORE[entity]) throw new ApiError(400, 'INVALID_ENTITY', `Unknown entity ${entity}`);
  return CORE[entity].slice();
}

// Resolve the workflow.extraStates list off either a config doc, a
// snapshot doc, or a plain object — all three carry the same shape.
function _extraStates(input) {
  if (!input) return [];
  const wf = input.workflow || (input.toObject ? input.toObject().workflow : null);
  return Array.isArray(wf?.extraStates) ? wf.extraStates : [];
}

// orderedStatesFor — returns the full lifecycle as an ordered array
// of { code, kind: 'CORE' | 'EXTRA', after? } records. Extra states
// are inserted immediately after the matching core state.
function orderedStatesFor(entity, input) {
  const core = coreStatesFor(entity);
  const extras = _extraStates(input);
  const out = [];
  for (const code of core) {
    out.push({ code, kind: 'CORE' });
    for (const ex of extras) {
      if (String(ex.after).toUpperCase() === code) {
        out.push({ code: String(ex.code).toUpperCase(), kind: 'EXTRA', after: code, label: ex.label });
      }
    }
  }
  return out;
}

// Build a forward-edges map that includes the optional extras. An
// extra state E inserted after core state C participates as:
//     C ──→ E ──→ (next core state after C)
// In addition, every state outside the terminals can still go to
// CANCELLED.
function _edgesFor(entity, input) {
  const edges = JSON.parse(JSON.stringify(CORE_EDGES[entity]));
  const ordered = orderedStatesFor(entity, input);
  const cancelTo = entity === 'MEETING' ? 'CANCELLED' : 'CANCELLED';

  for (let i = 0; i < ordered.length; i++) {
    const s = ordered[i];
    if (s.kind !== 'EXTRA') continue;
    const prev = ordered[i - 1]?.code;
    const next = ordered[i + 1]?.code;
    edges[s.code] = [];
    if (next) edges[s.code].push(next);
    if (s.code !== cancelTo && !TERMINAL[entity].has(s.code)) {
      edges[s.code].push(cancelTo);
    }
    // Rewire the previous state's edges so the EXTRA sits between it
    // and what was previously its successor.
    if (prev && Array.isArray(edges[prev])) {
      edges[prev] = edges[prev].map((t) => (t === next ? s.code : t));
      if (!edges[prev].includes(s.code)) edges[prev].push(s.code);
    }
  }
  return edges;
}

function allowedNextStates(entity, currentState, input) {
  const edges = _edgesFor(entity, input);
  const list = edges[currentState];
  if (!list) return [];
  return list.slice();
}

function canTransition(entity, fromState, toState, input) {
  if (TERMINAL[entity].has(fromState)) return false;
  const allowed = allowedNextStates(entity, fromState, input);
  return allowed.includes(toState);
}

function assertTransition(entity, fromState, toState, input) {
  if (!canTransition(entity, fromState, toState, input)) {
    throw new ApiError(
      400,
      'INVALID_STATE_TRANSITION',
      `Cannot transition ${entity} from ${fromState} to ${toState}`,
      { allowed: allowedNextStates(entity, fromState, input) }
    );
  }
}

function isTerminal(entity, state) {
  return TERMINAL[entity]?.has(state) === true;
}

module.exports = {
  CORE,
  TERMINAL,
  coreStatesFor,
  orderedStatesFor,
  allowedNextStates,
  canTransition,
  assertTransition,
  isTerminal,
};
