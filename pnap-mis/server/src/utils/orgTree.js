const BasicUnit = require('../models/BasicUnit');
const Area = require('../models/Area');
const District = require('../models/District');
const Province = require('../models/Province');
const Central = require('../models/Central');
const { ensureCentralSingleton } = require('./centralUnit');

// orgTree — read-only navigation over the organization hierarchy.
//
// The four territorial collections plus the Central singleton form one
// logical tree:
//
//   (root)
//     ├── Central
//     └── Province ── District ── Area ── Basic Unit
//
// Every consumer that needs to *browse* or *identify* a unit without
// knowing its tier up front goes through here: the tree endpoint, and
// fund-transfer destination resolution. Unit CRUD stays in
// orgController — this module never writes.
//
// Only active units are ever returned. A deactivated unit is not a
// place funds can be sent, and it should not be reachable in a picker.

const LEVEL_ORDER = ['BASIC_UNIT', 'AREA', 'DISTRICT', 'PROVINCE', 'CENTRAL'];

const LEVEL_LABEL = {
  BASIC_UNIT: 'Basic Unit',
  AREA: 'Area',
  DISTRICT: 'District',
  PROVINCE: 'Province',
  CENTRAL: 'Center',
};

const MODEL = {
  BASIC_UNIT: BasicUnit, AREA: Area, DISTRICT: District, PROVINCE: Province, CENTRAL: Central,
};

// Downward links. Central is a leaf — it heads the organization but
// owns no sub-units of its own; the provinces hang off the root.
const CHILD_LEVEL = {
  PROVINCE: 'DISTRICT', DISTRICT: 'AREA', AREA: 'BASIC_UNIT', BASIC_UNIT: null, CENTRAL: null,
};

// The field on a child that points at its parent.
const PARENT_KEY = { DISTRICT: 'provinceId', AREA: 'districtId', BASIC_UNIT: 'areaId' };

// Denormalized ancestor ids carried by each level, top → down. Used to
// build a unit's path in a single round of lookups.
const ANCESTOR_KEYS = {
  BASIC_UNIT: [['PROVINCE', 'provinceId'], ['DISTRICT', 'districtId'], ['AREA', 'areaId']],
  AREA: [['PROVINCE', 'provinceId'], ['DISTRICT', 'districtId']],
  DISTRICT: [['PROVINCE', 'provinceId']],
  PROVINCE: [],
  CENTRAL: [],
};

function levelRank(level) {
  return LEVEL_ORDER.indexOf(level);
}

function isLevel(level) {
  return Object.prototype.hasOwnProperty.call(LEVEL_LABEL, level);
}

function toNode(level, doc, extra) {
  if (!doc) return null;
  const parentKey = PARENT_KEY[level];
  return {
    id: String(doc._id),
    level,
    levelLabel: LEVEL_LABEL[level],
    name: doc.name,
    parentId: parentKey && doc[parentKey] ? String(doc[parentKey]) : null,
    parentLevel: parentKey ? LEVEL_ORDER[levelRank(level) + 1] : null,
    // The province this node belongs to — itself, for a province.
    // Central belongs to none: it sits above the provinces, not
    // inside one. Callers use this to confine a subtree to one
    // province (see transferRouting's destination scope).
    provinceId: level === 'PROVINCE'
      ? String(doc._id)
      : (doc.provinceId ? String(doc.provinceId) : null),
    ...extra,
  };
}

// Annotate a page of same-level nodes with `hasChildren` using one
// query for the whole page rather than one per row.
async function _markHasChildren(level, nodes) {
  const childLevel = CHILD_LEVEL[level];
  if (!childLevel || nodes.length === 0) {
    return nodes.map((n) => ({ ...n, hasChildren: false }));
  }
  const key = PARENT_KEY[childLevel];
  const parents = await MODEL[childLevel].distinct(key, {
    [key]: { $in: nodes.map((n) => n.id) },
    isActive: true,
  });
  const withKids = new Set(parents.map(String));
  return nodes.map((n) => ({ ...n, hasChildren: withKids.has(n.id) }));
}

// Top of the tree: the Central body plus every province. Both are
// small, fixed-size sets, so the root is never paginated.
//
// `provinceId` confines the tree to a single province — the caller
// then sees Central plus their own province and nothing else. Used by
// the transfer picker, where a sub-province unit may not address
// another province's branch at all.
async function rootNodes({ provinceId } = {}) {
  const filter = { isActive: true, ...(provinceId ? { _id: provinceId } : {}) };
  const [central, provinces] = await Promise.all([
    ensureCentralSingleton(),
    Province.find(filter).select('name').sort({ name: 1 }).lean(),
  ]);
  const provinceNodes = await _markHasChildren('PROVINCE', provinces.map((p) => toNode('PROVINCE', p)));
  return [toNode('CENTRAL', central, { hasChildren: false }), ...provinceNodes];
}

// One page of a node's direct children, alphabetical. Callers drive
// lazy loading by requesting a page only when a branch is opened.
async function childrenOf(parentLevel, parentId, { page = 1, limit = 50, provinceId } = {}) {
  const childLevel = CHILD_LEVEL[parentLevel];
  if (!childLevel) return { nodes: [], total: 0, page: 1, limit, totalPages: 0 };

  const p = Math.max(1, parseInt(page, 10) || 1);
  const lim = Math.min(200, Math.max(1, parseInt(limit, 10) || 50));
  // A parent's children are inside the parent's province by
  // construction, so the province filter only matters as a backstop
  // against a caller naming a parent outside its own scope.
  const filter = {
    [PARENT_KEY[childLevel]]: parentId,
    isActive: true,
    ...(provinceId ? { provinceId } : {}),
  };

  const [docs, total] = await Promise.all([
    MODEL[childLevel].find(filter)
      .select('name areaId districtId provinceId')
      .sort({ name: 1 })
      .skip((p - 1) * lim)
      .limit(lim)
      .lean(),
    MODEL[childLevel].countDocuments(filter),
  ]);

  const nodes = await _markHasChildren(childLevel, docs.map((d) => toNode(childLevel, d)));
  return { nodes, total, page: p, limit: lim, totalPages: Math.ceil(total / lim) };
}

// Look a unit up when its tier is already known — one query.
async function findUnitAt(level, id) {
  if (!isLevel(level) || !id) return null;
  const doc = await MODEL[level].findById(id).lean();
  if (!doc || doc.isActive === false) return null;
  return toNode(level, doc, { isActive: true });
}

// Look a unit up when its tier is NOT known — the case for a
// destination id arriving from a client, which must never be trusted
// to say what tier it belongs to. Probes all five collections; the id
// itself decides the answer.
async function findUnitById(id) {
  if (!id || !/^[0-9a-fA-F]{24}$/.test(String(id))) return null;
  const found = await Promise.all(
    LEVEL_ORDER.map(async (level) => {
      const doc = await MODEL[level].findById(id).lean();
      return doc ? { level, doc } : null;
    }),
  );
  const hit = found.find(Boolean);
  if (!hit) return null;
  return toNode(hit.level, hit.doc, { isActive: hit.doc.isActive !== false });
}

// A unit's ancestors, top → down, excluding the unit itself. Resolved
// from the denormalized ids each row already carries, so it costs one
// parallel batch regardless of depth. Ancestors that no longer exist
// are dropped rather than throwing.
async function ancestorsOf(node) {
  if (!node) return [];
  const keys = ANCESTOR_KEYS[node.level] || [];
  const doc = await MODEL[node.level].findById(node.id).lean();
  if (!doc) return [];
  const resolved = await Promise.all(
    keys.map(async ([level, key]) => (doc[key] ? findUnitAt(level, doc[key]) : null)),
  );
  return resolved.filter(Boolean);
}

// Full path top → down, ending with the unit itself.
async function pathOf(node) {
  if (!node) return [];
  return [...(await ancestorsOf(node)), node];
}

function _escapeRegex(s) {
  return String(s).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

// Name search across every tier.
//
// Returns the matches AND all of their ancestors, so a client can
// rebuild a pruned, fully-expanded tree from a single response
// instead of issuing one lazy-load request per ancestor. `matchIds`
// says which of those nodes actually matched the query; the rest are
// context.
//
// `provinceId` confines the search to one province, matching what
// rootNodes does for browsing — a scoped caller must not be able to
// reach another province's units by typing their names.
async function searchTree(q, { limit = 25, provinceId } = {}) {
  const term = String(q || '').trim();
  if (term.length < 2) return { nodes: [], matchIds: [], total: 0, truncated: false };

  const rx = new RegExp(_escapeRegex(term), 'i');
  const lim = Math.min(100, Math.max(1, parseInt(limit, 10) || 25));

  // A province scopes itself by _id; everything below it carries a
  // provinceId. Central belongs to no province and stays reachable.
  const scopeFor = (level) => {
    if (!provinceId || level === 'CENTRAL') return {};
    return level === 'PROVINCE' ? { _id: provinceId } : { provinceId };
  };

  // Search top-down so that when results are capped, the larger
  // organizational bodies survive the cut — they orient the user
  // better than an arbitrary slice of basic units would.
  const perLevel = await Promise.all(
    ['CENTRAL', 'PROVINCE', 'DISTRICT', 'AREA', 'BASIC_UNIT'].map(async (level) => {
      const filter = {
        name: rx,
        ...(level === 'CENTRAL' ? {} : { isActive: true }),
        ...scopeFor(level),
      };
      const [docs, count] = await Promise.all([
        MODEL[level].find(filter).select('name areaId districtId provinceId')
          .sort({ name: 1 }).limit(lim + 1).lean(),
        MODEL[level].countDocuments(filter),
      ]);
      return { level, docs, count };
    }),
  );

  const total = perLevel.reduce((sum, r) => sum + r.count, 0);
  const matches = [];
  for (const { level, docs } of perLevel) {
    for (const d of docs) {
      if (matches.length >= lim) break;
      matches.push(toNode(level, d, { hasChildren: false }));
    }
  }

  // Pull in ancestors so every match is reachable from the root, and
  // fill in each node's real hasChildren so the tree still expands.
  const byId = new Map();
  for (const m of matches) byId.set(m.id, m);
  const ancestorLists = await Promise.all(matches.map((m) => ancestorsOf(m)));
  for (const list of ancestorLists) {
    for (const a of list) if (!byId.has(a.id)) byId.set(a.id, a);
  }

  const nodes = [...byId.values()];
  const byLevel = new Map();
  for (const n of nodes) {
    if (!byLevel.has(n.level)) byLevel.set(n.level, []);
    byLevel.get(n.level).push(n);
  }
  const marked = (await Promise.all(
    [...byLevel.entries()].map(([level, group]) => _markHasChildren(level, group)),
  )).flat();

  return {
    nodes: marked,
    matchIds: matches.map((m) => m.id),
    total,
    truncated: total > matches.length,
  };
}

module.exports = {
  LEVEL_ORDER,
  LEVEL_LABEL,
  CHILD_LEVEL,
  levelRank,
  isLevel,
  rootNodes,
  childrenOf,
  findUnitAt,
  findUnitById,
  ancestorsOf,
  pathOf,
  searchTree,
};
