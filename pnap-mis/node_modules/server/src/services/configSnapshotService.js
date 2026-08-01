const crypto = require('crypto');
const EventTypeConfig = require('../models/EventTypeConfig');
const FieldDefinition = require('../models/FieldDefinition');
const EventConfigSnapshot = require('../models/EventConfigSnapshot');
const { ApiError } = require('../utils/response');

// configSnapshotService — produce / fetch frozen snapshots of an
// EventTypeConfig at a specific configVersion. Snapshots are unique
// per (entity, typeCode, configVersion); the helper materialise()
// is idempotent and safe under concurrency thanks to the unique
// index on EventConfigSnapshot.

// Tiny in-process LRU. Snapshots are tiny and read-mostly, so we cache
// them by id during a single process lifetime. The cache only ever
// stores frozen documents (snapshots are append-only) so it never
// goes stale.
const _byId = new Map();
const _MAX = 256;

function _cacheGet(id) {
  const k = String(id);
  const v = _byId.get(k);
  if (v) {
    _byId.delete(k);
    _byId.set(k, v); // bump to most-recent
  }
  return v;
}

function _cachePut(id, doc) {
  const k = String(id);
  _byId.set(k, doc);
  if (_byId.size > _MAX) {
    const firstKey = _byId.keys().next().value;
    _byId.delete(firstKey);
  }
}

function _canonical(value) {
  // Stable JSON — sort object keys at every level so the hash is
  // deterministic regardless of insertion order.
  if (Array.isArray(value)) return value.map(_canonical);
  if (value && typeof value === 'object' && !(value instanceof Date)) {
    const out = {};
    for (const k of Object.keys(value).sort()) out[k] = _canonical(value[k]);
    return out;
  }
  return value;
}

function _hash(obj) {
  return crypto.createHash('sha256').update(JSON.stringify(_canonical(obj))).digest('hex');
}

// Freeze the live type config + its referenced field definitions
// into a portable plain-object payload. Used both to write a
// snapshot row and to compute its hash.
function _freezeFields(fieldDocs) {
  return (fieldDocs || []).map((f) => ({
    key: f.key,
    label: f.label,
    helpText: f.helpText,
    type: f.type,
    required: !!f.required,
    validation: f.validation ? JSON.parse(JSON.stringify(f.validation)) : {},
    visibility: f.visibility ? JSON.parse(JSON.stringify(f.visibility)) : {},
    reporting: f.reporting ? JSON.parse(JSON.stringify(f.reporting)) : {},
    sortOrder: typeof f.sortOrder === 'number' ? f.sortOrder : 100,
  }));
}

// Resolve an EventTypeConfig by (entity, typeCode), populate its
// field defs, and return both. Throws 404 if the type doesn't exist
// or 400 if it's deactivated.
async function resolveType(entity, typeCode) {
  const cfg = await EventTypeConfig.findOne({ entity, code: String(typeCode || '').toUpperCase() })
    .populate({ path: 'fields', match: { isActive: true } });
  if (!cfg) throw new ApiError(404, 'EVENT_TYPE_NOT_FOUND', `${entity.toLowerCase()} type "${typeCode}" not found`);
  if (!cfg.isActive) throw new ApiError(400, 'EVENT_TYPE_INACTIVE', `${entity.toLowerCase()} type "${typeCode}" is deactivated`);
  return cfg;
}

// materialise — return the snapshot row for the type's CURRENT
// configVersion, creating it on first use. Idempotent.
async function materialise(entity, typeCode) {
  const cfg = await resolveType(entity, typeCode);
  const sortedFields = (cfg.fields || []).slice().sort((a, b) => (a.sortOrder || 0) - (b.sortOrder || 0));
  const resolvedFields = _freezeFields(sortedFields);

  const payload = {
    entity: cfg.entity,
    typeCode: cfg.code,
    typeLabel: cfg.label,
    configVersion: cfg.configVersion,
    appliesTo: cfg.appliesTo ? cfg.appliesTo.toObject?.() ?? cfg.appliesTo : {},
    photoPolicy: cfg.photoPolicy ? cfg.photoPolicy.toObject?.() ?? cfg.photoPolicy : {},
    workflow: cfg.workflow ? cfg.workflow.toObject?.() ?? cfg.workflow : {},
    resolvedFields,
  };
  const snapshotHash = _hash(payload);

  // Upsert by the unique key. If two requests race, the unique index
  // makes this safe — the loser falls through to findOne.
  const existing = await EventConfigSnapshot.findOne({
    entity: payload.entity,
    typeCode: payload.typeCode,
    configVersion: payload.configVersion,
  });
  if (existing) {
    _cachePut(existing._id, existing);
    return { snapshot: existing, config: cfg };
  }
  try {
    const doc = await EventConfigSnapshot.create({ ...payload, snapshotHash });
    _cachePut(doc._id, doc);
    return { snapshot: doc, config: cfg };
  } catch (err) {
    if (err && err.code === 11000) {
      const fallback = await EventConfigSnapshot.findOne({
        entity: payload.entity,
        typeCode: payload.typeCode,
        configVersion: payload.configVersion,
      });
      if (fallback) {
        _cachePut(fallback._id, fallback);
        return { snapshot: fallback, config: cfg };
      }
    }
    throw err;
  }
}

async function getById(snapshotId) {
  if (!snapshotId) return null;
  const cached = _cacheGet(snapshotId);
  if (cached) return cached;
  const doc = await EventConfigSnapshot.findById(snapshotId);
  if (doc) _cachePut(doc._id, doc);
  return doc;
}

// invalidate — drop any cached snapshot rows for a (entity, typeCode).
// Called by the admin controller after a config edit so the next
// materialise() picks up the fresh configVersion. Note: existing
// snapshot DOCUMENTS stay forever (they're append-only); this only
// clears the in-process cache.
function invalidate(entity, typeCode) {
  const code = String(typeCode || '').toUpperCase();
  for (const [k, v] of _byId) {
    if (v.entity === entity && v.typeCode === code) _byId.delete(k);
  }
}

module.exports = {
  resolveType,
  materialise,
  getById,
  invalidate,
  _hash, // exported for eventHashService — same canonicalisation
};

// FieldDefinition import ensures the model is registered before
// EventTypeConfig populates `fields`. The require alone is enough.
void FieldDefinition;
