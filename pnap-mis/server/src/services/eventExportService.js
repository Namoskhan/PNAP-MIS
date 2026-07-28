const { getById: getSnapshotById } = require('./configSnapshotService');

// eventExportService — turn a (Meeting|Activity) document plus its
// frozen snapshot into export-ready columns + rows.
//
// Two principles from §10 of the design:
//   1. Each record's columns come from ITS OWN snapshot (not the live
//      config), so a 2025 meeting always exports with 2025 columns.
//   2. Aggregate exports use the UNION of columns across every
//      snapshot in the result set; missing values render as ''.

function _exportableFields(snapshot) {
  if (!snapshot) return [];
  const fields = (snapshot.resolvedFields || []).filter((f) => f?.reporting?.includeInExport);
  return fields
    .slice()
    .sort((a, b) => {
      const oa = a.reporting?.exportOrder ?? 100;
      const ob = b.reporting?.exportOrder ?? 100;
      if (oa !== ob) return oa - ob;
      return String(a.key).localeCompare(String(b.key));
    })
    .map((f) => ({
      key: f.key,
      label: f.reporting?.exportLabel || f.label || f.key,
      type: f.type,
      order: f.reporting?.exportOrder ?? 100,
    }));
}

function columnsFor(snapshot) {
  return _exportableFields(snapshot);
}

// Render a single export row (object keyed by field key). Values are
// stringified safely; arrays join on ", "; dates become ISO; null/
// undefined → ''. Numeric/currency values stay numeric so the XLSX
// writer can format them as numbers.
function _renderValue(field, raw) {
  if (raw === null || raw === undefined) return '';
  switch (field.type) {
    case 'DATE': {
      const d = raw instanceof Date ? raw : new Date(raw);
      return Number.isNaN(d.getTime()) ? '' : d.toISOString();
    }
    case 'BOOL':
      return raw ? 'Yes' : 'No';
    case 'MULTISELECT':
      return Array.isArray(raw) ? raw.join(', ') : String(raw);
    case 'INT':
    case 'NUMBER':
    case 'CURRENCY':
      return Number(raw);
    default:
      return String(raw);
  }
}

function rowFor(doc, snapshot) {
  const cols = columnsFor(snapshot);
  const data = doc?.dynamicData || {};
  const out = {};
  for (const c of cols) out[c.key] = _renderValue(c, data[c.key]);
  return out;
}

// columnsForMany — build a unioned column set for an array of
// snapshots (keyed by snapshot id to avoid re-walking the same
// snapshot N times). Stable ordering: by exportOrder then key.
async function columnsForMany(snapshotIds) {
  const seen = new Map(); // key → column
  const ids = [...new Set((snapshotIds || []).map(String).filter(Boolean))];
  for (const id of ids) {
    const snap = await getSnapshotById(id);
    if (!snap) continue;
    for (const c of _exportableFields(snap)) {
      if (!seen.has(c.key)) seen.set(c.key, c);
    }
  }
  return [...seen.values()].sort((a, b) => {
    if (a.order !== b.order) return a.order - b.order;
    return a.key.localeCompare(b.key);
  });
}

module.exports = { columnsFor, rowFor, columnsForMany };
