const crypto = require('crypto');
const { getById: getSnapshotById } = require('./configSnapshotService');

// eventHashService — canonical, version-aware hash for finalized
// records. The §8 design pins the hash inputs to the snapshot field
// order so that editing the live catalogue later cannot change a
// previously-computed hash. `verify(meeting)` re-derives and compares.
//
// IMPORTANT: This is the ONLY place that should compute the
// finalize hash. Controllers must call compute() / verify() — never
// hash inline — so the canonicalisation rules stay consistent.

function _canonical(value) {
  if (value === null || value === undefined) return null;
  if (Array.isArray(value)) return value.map(_canonical);
  if (value instanceof Date) return value.toISOString();
  if (typeof value === 'object') {
    const out = {};
    for (const k of Object.keys(value).sort()) out[k] = _canonical(value[k]);
    return out;
  }
  if (typeof value === 'string') return value.trim();
  return value;
}

function _hashOf(obj) {
  return crypto.createHash('sha256').update(JSON.stringify(_canonical(obj))).digest('hex');
}

// Pull a per-field value from dynamicData, in the order the snapshot
// declares. Unknown keys present in the doc are intentionally not
// hashed — only the snapshot defines what counts as "the record".
function _canonicaliseDynamic(dynamicData, snapshot) {
  const data = dynamicData || {};
  const out = {};
  const fields = (snapshot?.resolvedFields || []).slice().sort((a, b) => {
    const sa = a.sortOrder ?? 0;
    const sb = b.sortOrder ?? 0;
    if (sa !== sb) return sa - sb;
    return String(a.key).localeCompare(String(b.key));
  });
  for (const f of fields) {
    const raw = data[f.key];
    out[f.key] = raw === undefined ? null : _canonical(raw);
  }
  return out;
}

// Build the canonical payload for a Meeting. The fixed system-core
// fields here mirror the original implementation in
// meetingController.finalize so existing finalized records can be
// re-verified bit-for-bit (modulo dynamicData, which the legacy hash
// did not see — verify() handles that).
function _meetingPayload(meeting, snapshot) {
  return {
    id: String(meeting._id),
    configSnapshotId: meeting.configSnapshotId ? String(meeting.configSnapshotId) : null,
    systemCore: {
      unitLevel: meeting.unitLevel,
      unitId: meeting.unitId ? String(meeting.unitId) : null,
      basicUnitId: meeting.basicUnitId ? String(meeting.basicUnitId) : null,
      areaId: meeting.areaId ? String(meeting.areaId) : null,
      districtId: meeting.districtId ? String(meeting.districtId) : null,
      provinceId: meeting.provinceId ? String(meeting.provinceId) : null,
      typeCode: meeting.typeCode || meeting.type,
      body: meeting.body,
      startAt: meeting.startAt,
      endAt: meeting.endAt,
      decisions: meeting.decisions || '',
      attendance: (meeting.attendance || []).map((a) => ({
        memberId: a.memberId ? String(a.memberId) : null,
        status: a.status,
      })),
      photos: (meeting.photos || []).map((p) => p.sha256).filter(Boolean).sort(),
    },
    dynamicData: _canonicaliseDynamic(meeting.dynamicData, snapshot),
  };
}

// Activities don't currently carry a hash, but we expose the same
// canonicalisation in case the controller wants to add one later.
function _activityPayload(activity, snapshot) {
  return {
    id: String(activity._id),
    configSnapshotId: activity.configSnapshotId ? String(activity.configSnapshotId) : null,
    systemCore: {
      unitLevel: activity.unitLevel,
      unitId: activity.unitId ? String(activity.unitId) : null,
      basicUnitId: activity.basicUnitId ? String(activity.basicUnitId) : null,
      areaId: activity.areaId ? String(activity.areaId) : null,
      districtId: activity.districtId ? String(activity.districtId) : null,
      provinceId: activity.provinceId ? String(activity.provinceId) : null,
      typeCode: activity.typeCode || activity.type,
      body: activity.body,
      startAt: activity.startAt,
      endAt: activity.endAt,
      photos: (activity.photos || []).map((p) => p.sha256).filter(Boolean).sort(),
    },
    dynamicData: _canonicaliseDynamic(activity.dynamicData, snapshot),
  };
}

async function compute(entity, doc, snapshot) {
  if (!snapshot && doc.configSnapshotId) {
    snapshot = await getSnapshotById(doc.configSnapshotId);
  }
  const payload = entity === 'MEETING'
    ? _meetingPayload(doc, snapshot)
    : _activityPayload(doc, snapshot);
  return _hashOf(payload);
}

async function verify(entity, doc) {
  if (!doc || !doc.finalizedHash) return { ok: false, reason: 'NO_HASH' };
  const recomputed = await compute(entity, doc);
  return {
    ok: recomputed === doc.finalizedHash,
    expected: doc.finalizedHash,
    computed: recomputed,
  };
}

module.exports = { compute, verify };
