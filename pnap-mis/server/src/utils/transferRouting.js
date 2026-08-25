const { ApiError } = require('./response');
const {
  LEVEL_ORDER, LEVEL_LABEL, levelRank, findUnitAt, findUnitById, pathOf,
} = require('./orgTree');

// Fund-transfer destination rule — revised finance policy.
//
// A Finance Secretary names the recipient explicitly. There is no
// derived destination and no notion of a "parent": the unit the sender
// picks is the unit that receives the funds and the only unit that
// acknowledges them. What bounds the choice is the PROVINCE.
//
//   Basic Unit / Area / District FS → any Basic Unit, Area or District
//                                      inside THEIR OWN province, and
//                                      that province itself
//   Province FS                     → any unit anywhere, including
//                                      other provinces (KPK → Punjab)
//                                      and units within them
//   Center                          → cannot initiate (unchanged; it
//                                      is not in sourceLevel's enum)
//
// Crossing a provincial boundary is a province-level act: only a
// Province Finance Secretary may do it. A district cannot pay another
// province's area, and cannot pay another province directly either.
//
// The Center is above the provinces rather than inside one, so it
// stays addressable from every tier — that is the original upward
// route to Central, which nothing here was asked to remove. To close
// it off for sub-province senders, drop the CENTRAL exemption in
// assertWithinScope below; nothing else needs to change.
//
// This module owns the rule and is the ONLY way a destination gets
// onto a FundTransfer. The preview endpoint and the create path both
// call resolveDestination, so what the sender is shown and what the
// server will store cannot diverge.

// Tiers that may receive a transfer. Every tier is addressable: the
// four territorial levels per the permission matrix, plus Central,
// which has always been a valid recipient and stays one.
const DESTINATION_LEVELS = LEVEL_ORDER;

// Tiers that may send. Mirrors FundTransfer.sourceLevel's enum.
const SOURCE_LEVELS = ['BASIC_UNIT', 'AREA', 'DISTRICT', 'PROVINCE', 'CENTRAL'];

function canInitiateFrom(level) {
  return SOURCE_LEVELS.includes(level);
}

// Only a Province or Central may address units outside its own province.
function canCrossProvinces(sourceLevel) {
  return sourceLevel === 'PROVINCE' || sourceLevel === 'CENTRAL';
}

// The province a sender is confined to, or null when it is confined to
// nothing. Drives BOTH the destination check below and the subtree the
// organization-tree endpoint will show, so the picker offers exactly
// what create will accept.
function destinationScope(source) {
  if (!source || canCrossProvinces(source.level)) return { provinceId: null };
  return { provinceId: source.provinceId || null };
}

// Reject a destination that lies outside the sender's province.
function assertWithinScope(source, destination) {
  const { provinceId } = destinationScope(source);
  if (!provinceId) return;
  // Central sits above the provinces rather than inside one, so it is
  // not "another province" and stays reachable from every tier.
  if (destination.level === 'CENTRAL') return;

  if (!destination.provinceId || String(destination.provinceId) !== String(provinceId)) {
    throw new ApiError(400, 'OUT_OF_PROVINCE',
      `${destination.name} is outside your province. A ${LEVEL_LABEL[source.level] || source.level} `
      + 'may only send funds within its own province — transfers across provinces are initiated '
      + 'by the Province Finance Secretary.');
  }
}

// Which way the money moves, for the UnitPolicy direction rule and
// for display. Under the old parent-only routing this was always UP;
// arbitrary destinations make DOWN (District → Area) and SAME_TIER
// (KPK → Punjab) ordinary cases.
function transferDirection(sourceLevel, destinationLevel) {
  const s = levelRank(sourceLevel);
  const d = levelRank(destinationLevel);
  if (s < 0 || d < 0) return null;
  if (d > s) return 'UP';
  if (d < s) return 'DOWN';
  return 'SAME_TIER';
}

// Resolve and validate a destination the sender chose.
//
// `destinationId` is the ONLY routing input accepted from a client,
// and it is treated as an opaque id: the tier AND the province it
// belongs to are looked up from the database, never taken from the
// request. A client therefore cannot mislabel a unit to slip past the
// tier or province check, and cannot address anything that is not a
// real, active unit.
//
// Throws ApiError with a specific code for each failure so the UI can
// say what actually went wrong. Returns:
//   { source, destination, path, direction }
// where `path` is the destination's full hierarchy, top → down.
async function resolveDestination(sourceLevel, sourceUnitId, destinationId) {
  if (!canInitiateFrom(sourceLevel)) {
    throw new ApiError(400, 'INVALID_LEVEL',
      `A ${LEVEL_LABEL[sourceLevel] || sourceLevel} cannot initiate fund transfers`);
  }
  // The sender is resolved from the database too — its province is
  // what bounds the choice, so it cannot come from the request either.
  const source = await findUnitAt(sourceLevel, sourceUnitId);
  if (!source) {
    throw new ApiError(400, 'INVALID_UNIT', 'Source unit not found or deactivated');
  }
  if (!destinationId) {
    throw new ApiError(400, 'DESTINATION_REQUIRED',
      'Select the unit that will receive these funds');
  }

  const destination = await findUnitById(destinationId);
  if (!destination) {
    throw new ApiError(400, 'DESTINATION_NOT_FOUND',
      'That destination no longer exists — pick another unit from the organization tree');
  }
  // findUnitById reports active status rather than filtering on it,
  // so a deactivated unit gets its own message instead of "not found".
  if (destination.isActive === false) {
    throw new ApiError(400, 'DESTINATION_INACTIVE',
      `${destination.name} is deactivated and cannot receive funds`);
  }
  if (!DESTINATION_LEVELS.includes(destination.level)) {
    throw new ApiError(400, 'INVALID_DESTINATION',
      `Funds cannot be sent to a ${LEVEL_LABEL[destination.level] || destination.level}`);
  }
  // A unit cannot pay itself — the transfer would have no counterparty
  // and its own Finance Secretary would be its own approver.
  if (destination.id === source.id) {
    throw new ApiError(400, 'SELF_TRANSFER',
      'A unit cannot transfer funds to itself');
  }
  assertWithinScope(source, destination);

  return {
    source,
    destination,
    path: await pathOf(destination),
    direction: transferDirection(sourceLevel, destination.level),
  };
}

// The sender's own node, for labelling the record and the UI, plus the
// province its choice is confined to. Returns null when the unit is
// missing or deactivated.
async function resolveSource(sourceLevel, sourceUnitId) {
  return findUnitAt(sourceLevel, sourceUnitId);
}

module.exports = {
  LEVEL_ORDER,
  LEVEL_LABEL,
  DESTINATION_LEVELS,
  SOURCE_LEVELS,
  canInitiateFrom,
  canCrossProvinces,
  destinationScope,
  transferDirection,
  resolveDestination,
  resolveSource,
};
