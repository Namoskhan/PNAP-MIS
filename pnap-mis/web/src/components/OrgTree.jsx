import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { api, errorMessage } from '../api/client';

// OrgTree — browse/search picker over the organization hierarchy.
//
//   Pakistan (static root label)
//     ├── Center
//     └── Province ── District ── Area ── Basic Unit
//
// Two modes, both served by GET /api/organization/tree:
//
//   browse — roots are fetched once; a branch's children are fetched
//            the first time it is opened, one page at a time. The full
//            unit table is never loaded.
//   search — one request returns the matches AND their ancestors, so
//            the pruned tree can be rendered fully expanded without a
//            request per ancestor.
//
// `source` ({ level, unitId }) asks the server for the subtree that
// unit may send funds to, rather than the whole organization. The
// server decides what that subtree is — this component only says who
// is asking. Every request carries it, so search cannot reach past
// the scope either.
//
// Selection is single-node and reported upward via onSelect(node).
// The component holds no transfer logic — it is a generic picker.

const ROOT = '__root__';
const PAGE_SIZE = 50;

// One-letter tier badge. A letter in a coloured disc reads at a glance
// and stays legible at any zoom, unlike the glyph bullets this
// replaced — and it is what makes a row's tier obvious without
// reading the pill at the far end.
const LEVEL_INITIAL = {
  CENTRAL: 'C', PROVINCE: 'P', DISTRICT: 'D', AREA: 'A', BASIC_UNIT: 'U',
};

export default function OrgTree({ selectedId, onSelect, disabledId, source, autoFocus = false }) {
  // id → node, for every node seen so far (roots, loaded pages, hits).
  const [nodes, setNodes] = useState(new Map());
  // parent id → { ids, total, page, loading }. ROOT keys the top level.
  const [branches, setBranches] = useState(new Map());
  const [expanded, setExpanded] = useState(new Set());
  const [err, setErr] = useState('');

  const [query, setQuery] = useState('');
  const [search, setSearch] = useState(null); // { ids, matchIds, truncated, total }
  const [searching, setSearching] = useState(false);

  // Roving tabindex: exactly one row is tabbable, and arrow keys move
  // it. `focusId` is the row that owns the tab stop.
  const [focusId, setFocusId] = useState(null);
  const rowRefs = useRef(new Map());
  const shouldFocus = useRef(false);

  function absorb(list) {
    setNodes((prev) => {
      const next = new Map(prev);
      for (const n of list) next.set(n.id, n);
      return next;
    });
  }

  // Identifies the sender on every request so the server can confine
  // the tree to what that unit may send to.
  const scope = source?.level && source?.unitId
    ? { sourceLevel: source.level, sourceUnitId: source.unitId }
    : {};
  const scopeKey = `${scope.sourceLevel || ''}:${scope.sourceUnitId || ''}`;

  const loadBranch = useCallback(async (parent, page = 1) => {
    const key = parent ? parent.id : ROOT;
    setBranches((prev) => {
      const next = new Map(prev);
      next.set(key, { ...(next.get(key) || { ids: [], total: 0 }), loading: true });
      return next;
    });
    try {
      const params = parent
        ? { ...scope, parentId: parent.id, parentLevel: parent.level, page, limit: PAGE_SIZE }
        : { ...scope };
      const r = await api.get('/organization/tree', { params });
      const list = r.data.data.nodes || [];
      const total = r.data.meta?.total ?? list.length;
      absorb(list);
      setBranches((prev) => {
        const next = new Map(prev);
        const existing = page > 1 ? (next.get(key)?.ids || []) : [];
        // Concatenate pages, de-duplicated — "Load more" appends.
        const seen = new Set(existing);
        next.set(key, {
          ids: [...existing, ...list.map((n) => n.id).filter((id) => !seen.has(id))],
          total, page, loading: false,
        });
        return next;
      });
    } catch (e) {
      setErr(errorMessage(e));
      setBranches((prev) => {
        const next = new Map(prev);
        next.set(key, { ...(next.get(key) || { ids: [], total: 0 }), loading: false });
        return next;
      });
    }
    // scopeKey, not `scope`: the object is rebuilt every render, the
    // string only changes when the sender actually changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scopeKey]);

  // Everything cached — roots, loaded branches, expansion — belongs to
  // one scope. Changing the sender invalidates all of it.
  useEffect(() => {
    setNodes(new Map());
    setBranches(new Map());
    setExpanded(new Set());
    setFocusId(null);
    loadBranch(null);
  }, [loadBranch]);

  // Debounced search. Below two characters we fall back to browse mode
  // rather than asking the server to match on a single letter.
  useEffect(() => {
    const term = query.trim();
    if (term.length < 2) { setSearch(null); setSearching(false); return undefined; }
    setSearching(true);
    const t = setTimeout(async () => {
      try {
        const r = await api.get('/organization/tree', {
          params: { ...scope, q: term, limit: 25 },
        });
        const d = r.data.data;
        absorb(d.nodes || []);
        setSearch({
          ids: new Set((d.nodes || []).map((n) => n.id)),
          matchIds: new Set(d.matchIds || []),
          truncated: !!d.truncated,
          total: r.data.meta?.total ?? (d.matchIds || []).length,
        });
        setErr('');
      } catch (e) {
        setErr(errorMessage(e));
      } finally { setSearching(false); }
    }, 300);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [query, scopeKey]);

  function toggle(node) {
    if (!node.hasChildren) return;
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(node.id)) next.delete(node.id);
      else {
        next.add(node.id);
        if (!branches.has(node.id)) loadBranch(node);
      }
      return next;
    });
  }

  function open(node) {
    if (!node.hasChildren || expanded.has(node.id)) return;
    setExpanded((prev) => new Set(prev).add(node.id));
    if (!branches.has(node.id)) loadBranch(node);
  }

  function close(node) {
    setExpanded((prev) => {
      const next = new Set(prev);
      next.delete(node.id);
      return next;
    });
  }

  // Children of `parentId` in the current mode. In search mode the
  // tree is built entirely from the returned slice — matches plus
  // their ancestors — and every branch in it counts as expanded.
  const childIdsOf = useCallback((parentId) => {
    if (search) {
      const key = parentId === ROOT ? null : parentId;
      return [...search.ids]
        .map((id) => nodes.get(id))
        .filter((n) => n && (n.parentId || null) === key)
        .sort((a, b) => a.name.localeCompare(b.name))
        .map((n) => n.id);
    }
    return branches.get(parentId)?.ids || [];
  }, [search, nodes, branches]);

  // Flatten what is on screen, in visual order — the list arrow keys
  // walk, and the render order itself.
  const visible = useMemo(() => {
    const out = [];
    const walk = (parentId, depth) => {
      for (const id of childIdsOf(parentId)) {
        const node = nodes.get(id);
        if (!node) continue;
        const isOpen = search ? true : expanded.has(id);
        out.push({ node, depth, isOpen });
        if (isOpen && node.hasChildren) walk(id, depth + 1);
      }
    };
    walk(ROOT, 0);
    return out;
  }, [childIdsOf, nodes, expanded, search]);

  // Keep the roving tab stop on a row that still exists.
  useEffect(() => {
    if (visible.length === 0) { setFocusId(null); return; }
    if (!focusId || !visible.some((v) => v.node.id === focusId)) {
      setFocusId(selectedId && visible.some((v) => v.node.id === selectedId)
        ? selectedId : visible[0].node.id);
    }
  }, [visible, focusId, selectedId]);

  // Only move DOM focus when a keystroke asked for it — never on the
  // initial render, which would steal focus from the search box.
  useEffect(() => {
    if (!shouldFocus.current) return;
    shouldFocus.current = false;
    rowRefs.current.get(focusId)?.focus();
  }, [focusId]);

  function moveTo(index) {
    const clamped = Math.max(0, Math.min(visible.length - 1, index));
    const target = visible[clamped];
    if (!target) return;
    shouldFocus.current = true;
    setFocusId(target.node.id);
  }

  function onKeyDown(e, entry, index) {
    const { node, isOpen } = entry;
    switch (e.key) {
      case 'ArrowDown': e.preventDefault(); moveTo(index + 1); break;
      case 'ArrowUp': e.preventDefault(); moveTo(index - 1); break;
      case 'Home': e.preventDefault(); moveTo(0); break;
      case 'End': e.preventDefault(); moveTo(visible.length - 1); break;
      case 'ArrowRight':
        e.preventDefault();
        if (node.hasChildren && !isOpen) open(node);
        else if (isOpen) moveTo(index + 1);
        break;
      case 'ArrowLeft': {
        e.preventDefault();
        if (node.hasChildren && isOpen && !search) { close(node); break; }
        // Collapsed (or a leaf) — step out to the parent row.
        const parentIdx = visible.findIndex((v) => v.node.id === node.parentId);
        if (parentIdx > -1) moveTo(parentIdx);
        break;
      }
      case 'Enter':
      case ' ':
        e.preventDefault();
        if (node.id !== disabledId) onSelect?.(node);
        break;
      default:
    }
  }

  const rootBranch = branches.get(ROOT);
  const loadingRoots = rootBranch?.loading && (rootBranch?.ids || []).length === 0;

  return (
    <div className="orgtree">
      <div className="orgtree-search">
        <input
          type="search"
          value={query}
          autoFocus={autoFocus}
          placeholder="Search any province, district, area or unit…"
          aria-label="Search the organization"
          onChange={(e) => setQuery(e.target.value)}
        />
        {query && (
          <button type="button" className="btn ghost" onClick={() => setQuery('')}>Clear</button>
        )}
      </div>

      {err && <div className="alert error" style={{ marginBottom: 10 }}>{err}</div>}

      {search && (
        <p className="orgtree-status">
          {searching ? 'Searching…'
            : search.matchIds.size === 0
              ? `No unit matches “${query.trim()}”.`
              : `${search.total} match${search.total === 1 ? '' : 'es'}${search.truncated ? ` — showing the first ${search.matchIds.size}` : ''}, shown in context.`}
        </p>
      )}

      <div className="orgtree-scroll">
        {loadingRoots && <p className="muted" style={{ padding: 12 }}>Loading organization…</p>}

        <ul className="orgtree-list" role="tree" aria-label="Organization">
          {!search && !loadingRoots && (
            <li className="orgtree-rootlabel" role="none">Pakistan</li>
          )}
          {visible.map((entry, i) => {
            const { node, depth, isOpen } = entry;
            const isSelected = node.id === selectedId;
            const isDisabled = node.id === disabledId;
            const isMatch = search?.matchIds.has(node.id);
            return (
              <li key={node.id} role="none">
                <div
                  role="treeitem"
                  aria-level={depth + 1}
                  aria-selected={isSelected}
                  aria-expanded={node.hasChildren ? isOpen : undefined}
                  aria-disabled={isDisabled || undefined}
                  tabIndex={node.id === focusId ? 0 : -1}
                  ref={(el) => {
                    if (el) rowRefs.current.set(node.id, el);
                    else rowRefs.current.delete(node.id);
                  }}
                  className={`orgtree-row${isSelected ? ' selected' : ''}`
                    + `${isDisabled ? ' disabled' : ''}${isMatch ? ' match' : ''}`}
                  style={{ paddingLeft: 8 + depth * 18 }}
                  onKeyDown={(e) => onKeyDown(e, entry, i)}
                  onFocus={() => setFocusId(node.id)}
                  onClick={() => { if (!isDisabled) onSelect?.(node); }}
                >
                  {node.hasChildren ? (
                    <button
                      type="button"
                      className="orgtree-caret"
                      tabIndex={-1}
                      aria-label={isOpen ? `Collapse ${node.name}` : `Expand ${node.name}`}
                      onClick={(e) => { e.stopPropagation(); toggle(node); }}
                    >
                      <svg viewBox="0 0 10 10" width="10" height="10" aria-hidden="true">
                        <path d="M3 1.5 L7 5 L3 8.5" fill="none" stroke="currentColor"
                          strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
                      </svg>
                    </button>
                  ) : (
                    <span className="orgtree-caret placeholder" aria-hidden="true" />
                  )}
                  <span className="orgtree-badge" data-level={node.level} aria-hidden="true">
                    {LEVEL_INITIAL[node.level]}
                  </span>
                  <span className="orgtree-text">
                    <span className="orgtree-name">{node.name}</span>
                    <span className="orgtree-level">{node.levelLabel}</span>
                  </span>
                  {isDisabled
                    ? <span className="orgtree-note">your unit</span>
                    : (
                      <span className="orgtree-radio" aria-hidden="true">
                        <svg viewBox="0 0 12 12" width="12" height="12">
                          <path d="M1.5 6.2 L4.6 9.2 L10.5 3" fill="none" stroke="currentColor"
                            strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                        </svg>
                      </span>
                    )}
                </div>

                {isOpen && !search && <LoadMore
                  branch={branches.get(node.id)}
                  onMore={(page) => loadBranch(node, page)}
                  depth={depth}
                />}
              </li>
            );
          })}
        </ul>

        {!search && !loadingRoots && visible.length === 0 && (
          <p className="muted" style={{ padding: 12 }}>No units are on record yet.</p>
        )}
      </div>
    </div>
  );
}

// Pagination control for a lazily-loaded branch. Only rendered when
// the server said there are more children than we have fetched.
function LoadMore({ branch, onMore, depth }) {
  if (!branch) return null;
  if (branch.loading) {
    return <p className="orgtree-more muted" style={{ paddingLeft: 30 + depth * 18 }}>Loading…</p>;
  }
  if (branch.ids.length >= branch.total) return null;
  return (
    <p className="orgtree-more" style={{ paddingLeft: 30 + depth * 18 }}>
      <button type="button" className="btn ghost" onClick={() => onMore(branch.page + 1)}>
        Show {Math.min(PAGE_SIZE, branch.total - branch.ids.length)} more
        {' '}({branch.ids.length} of {branch.total})
      </button>
    </p>
  );
}
