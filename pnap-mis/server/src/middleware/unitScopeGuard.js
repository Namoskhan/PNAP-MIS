const { ApiError } = require('../utils/response');
const { unitWithinAreaAdminScope } = require('../utils/unitScope');

// ─── Territorial scope guard for unit-addressed reads ────────────────
//
// Every "unit page" in the client addresses a unit by (level, id) in the
// query string. Until this existed, only roleController and
// performanceController actually checked that the caller was entitled to
// the unit they named — so a DISTRICT_ADMIN who edited the URL, or who
// simply used the Unit Context switcher (which offered every tier to
// everyone), could read another province's finance summary and cabinet
// directory.
//
// The rule itself is NOT reimplemented here. unitWithinAreaAdminScope is
// the single source of truth for "is this unit inside that admin's
// territory", and it already passes non-admin users through untouched so
// a Secretary or Finance Secretary is unaffected — their own
// per-controller checks continue to apply.
//
// Deliberately a no-op when the request does not name a unit: a bare
// `GET /meetings` is a different query with its own filtering, and
// failing it closed here would break every list page rather than
// securing it.

const LEVEL_PARAMS = ['unitLevel', 'level'];
const ID_PARAMS = ['unitId', 'id'];

function readUnitRef(req) {
  const src = { ...(req.query || {}), ...(req.body || {}) };
  let level = null;
  for (const k of LEVEL_PARAMS) if (src[k]) { level = String(src[k]); break; }
  let unitId = null;
  for (const k of ID_PARAMS) if (src[k]) { unitId = String(src[k]); break; }
  return { level, unitId };
}

/**
 * Reject a request that names a unit outside the caller's territory.
 *
 * @param {{ required?: boolean }} [opts]
 *   required:true also rejects a request that names no unit at all —
 *   use only on routes that are meaningless without one.
 */
function requireUnitScope(opts = {}) {
  return async function unitScopeGuard(req, res, next) {
    try {
      const { level, unitId } = readUnitRef(req);
      if (!level || !unitId) {
        if (opts.required) {
          return next(new ApiError(400, 'VALIDATION_ERROR', 'unitLevel and unitId are required'));
        }
        return next();
      }
      const allowed = await unitWithinAreaAdminScope(req.user, level, unitId);
      if (!allowed) {
        // Same code roleController already returns for this condition,
        // so the client's existing handling applies unchanged.
        return next(new ApiError(403, 'OUT_OF_SCOPE',
          'That unit is outside your territorial scope.'));
      }
      return next();
    } catch (err) {
      return next(err);
    }
  };
}

module.exports = { requireUnitScope, readUnitRef };
