const crypto = require('crypto');
const UnitTierConfig = require('../models/UnitTierConfig');
const FieldDefinition = require('../models/FieldDefinition');
const UnitTierConfigSnapshot = require('../models/UnitTierConfigSnapshot');
const { ApiError } = require('../utils/response');

// unitTierConfigService — produce / fetch frozen snapshots of a
// UnitTierConfig at a specific configVersion. Mirrors the shape of
// configSnapshotService (the one that powers EventTypeConfig) so the
// same hybrid-dynamic pattern applies to per-unit custom attributes:
// every Province / District / Area / BasicUnit / Central document
// pins the snapshot it was validated against, and labels/validation
// stay self-describing forever.
//
// Snapshots are unique per (tierCode, configVersion). materialise()
// is idempotent and safe under concurrency thanks to the unique
// index on UnitTierConfigSnapshot.

// In-process LRU. Snapshots are append-only, so cached rows never go
// stale. Live tier-config docs go through resolveTier() which always
// re-reads from Mongo (the cache is for snapshots only).
const _byId = new Map();
const _MAX = 64;

function _cacheGet(id) {
  const k = String(id);
  const v = _byId.get(k);
  if (v) {
    _byId.delete(k);
    _byId.set(k, v); // bump to MRU
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

// Resolve a tier config by its tierCode, populate active customFields,
// throw if missing or deactivated.
async function resolveTier(tierCode) {
  const code = String(tierCode || '').toUpperCase();
  const cfg = await UnitTierConfig.findOne({ tierCode: code })
    .populate({ path: 'customFields', match: { isActive: true } });
  if (!cfg) throw new ApiError(404, 'TIER_CONFIG_NOT_FOUND', `Tier config "${code}" not found`);
  if (!cfg.isActive) throw new ApiError(400, 'TIER_CONFIG_INACTIVE', `Tier "${code}" is deactivated`);
  return cfg;
}

// materialise — return the snapshot row for the tier's CURRENT
// configVersion, creating it on first use. Idempotent + race-safe.
async function materialise(tierCode) {
  const cfg = await resolveTier(tierCode);
  const sortedFields = (cfg.customFields || []).slice().sort(
    (a, b) => (a.sortOrder || 0) - (b.sortOrder || 0)
  );
  const resolvedFields = _freezeFields(sortedFields);

  const payload = {
    tierCode: cfg.tierCode,
    configVersion: cfg.configVersion,
    label: cfg.label,
    pluralLabel: cfg.pluralLabel,
    capabilities: cfg.capabilities ? cfg.capabilities.toObject?.() ?? cfg.capabilities : {},
    bodyPolicy: cfg.bodyPolicy ? cfg.bodyPolicy.toObject?.() ?? cfg.bodyPolicy : {},
    resolvedFields,
  };
  const snapshotHash = _hash(payload);

  const existing = await UnitTierConfigSnapshot.findOne({
    tierCode: payload.tierCode,
    configVersion: payload.configVersion,
  });
  if (existing) {
    _cachePut(existing._id, existing);
    return { snapshot: existing, config: cfg };
  }
  try {
    const doc = await UnitTierConfigSnapshot.create({ ...payload, snapshotHash });
    _cachePut(doc._id, doc);
    return { snapshot: doc, config: cfg };
  } catch (err) {
    if (err && err.code === 11000) {
      const fallback = await UnitTierConfigSnapshot.findOne({
        tierCode: payload.tierCode,
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
  const doc = await UnitTierConfigSnapshot.findById(snapshotId);
  if (doc) _cachePut(doc._id, doc);
  return doc;
}

// invalidate — drop cached snapshot rows for a tierCode. Called by
// the admin controller after a config edit so the next materialise()
// produces a fresh snapshot. Existing snapshot DOCUMENTS stay
// forever (append-only); this only clears the in-process cache.
function invalidate(tierCode) {
  const code = String(tierCode || '').toUpperCase();
  for (const [k, v] of _byId) {
    if (v.tierCode === code) _byId.delete(k);
  }
}

module.exports = {
  resolveTier,
  materialise,
  getById,
  invalidate,
};

// FieldDefinition import ensures the model is registered before
// UnitTierConfig populates `customFields`. The require alone is enough.
void FieldDefinition;
