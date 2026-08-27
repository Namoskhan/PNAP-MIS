import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { api, errorMessage } from '../api/client';
import { Colors, FontSize, Spacing, Radius } from '../constants/colors';

const ROOT = '__root__';
const PAGE_SIZE = 50;

const LEVEL_INITIAL = {
  CENTRAL: 'C', PROVINCE: 'P', DISTRICT: 'D', AREA: 'A', BASIC_UNIT: 'U',
};

const LEVEL_COLORS = {
  CENTRAL: { bg: '#f1f5f9', fg: '#475569' },
  PROVINCE: { bg: '#e0e7ff', fg: '#4338ca' },
  DISTRICT: { bg: '#dbeafe', fg: '#1d4ed8' },
  AREA: { bg: '#fce7f3', fg: '#be185d' },
  BASIC_UNIT: { bg: '#ecfccb', fg: '#4d7c0f' },
};

export default function OrgTree({ selectedId, disabledId, source, onSelect }) {
  const [nodes, setNodes] = useState(new Map());
  const [branches, setBranches] = useState(new Map());
  const [expanded, setExpanded] = useState(new Set());
  const [err, setErr] = useState('');

  const [query, setQuery] = useState('');
  const [search, setSearch] = useState(null);
  const [searching, setSearching] = useState(false);

  const scope = source?.level && source?.unitId
    ? { sourceLevel: source.level, sourceUnitId: source.unitId }
    : {};
  const scopeKey = `${scope.sourceLevel || ''}:${scope.sourceUnitId || ''}`;

  const absorb = (list) => {
    setNodes((prev) => {
      const next = new Map(prev);
      for (const n of list) next.set(n.id, n);
      return next;
    });
  };

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
  }, [scopeKey]);

  useEffect(() => {
    setNodes(new Map());
    setBranches(new Map());
    setExpanded(new Set());
    loadBranch(null);
  }, [loadBranch]);

  useEffect(() => {
    const term = query.trim();
    if (term.length < 2) { setSearch(null); setSearching(false); return; }
    let cancelled = false;
    setSearching(true);
    const t = setTimeout(async () => {
      try {
        const r = await api.get('/organization/tree', {
          params: { ...scope, q: term, limit: 25 },
        });
        if (cancelled) return;
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
        if (!cancelled) setErr(errorMessage(e));
      } finally {
        if (!cancelled) setSearching(false);
      }
    }, 400);
    return () => { cancelled = true; clearTimeout(t); };
  }, [query, scopeKey]);

  const toggle = (node) => {
    if (!node.hasChildren) return;
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(node.id)) {
        next.delete(node.id);
      } else {
        next.add(node.id);
        if (!branches.has(node.id)) loadBranch(node);
      }
      return next;
    });
  };

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

  const renderItem = ({ item }) => {
    const { node, depth, isOpen } = item;
    const isSelected = selectedId === node.id;
    const isDisabled = disabledId === node.id;
    const isMatch = search?.matchIds.has(node.id);
    const indent = search ? 0 : depth * 20;

    const colors = LEVEL_COLORS[node.level] || LEVEL_COLORS.CENTRAL;

    return (
      <View style={[styles.nodeRow, { paddingLeft: indent + Spacing.md }]}>
        <TouchableOpacity 
          style={styles.expandHitbox} 
          onPress={() => toggle(node)}
          disabled={!node.hasChildren}
        >
          {node.hasChildren ? (
            <Ionicons name={isOpen ? 'chevron-down' : 'chevron-forward'} size={18} color={Colors.textMuted} />
          ) : (
            <View style={{ width: 18 }} />
          )}
        </TouchableOpacity>

        <TouchableOpacity 
          style={[
            styles.nodeContent,
            isSelected && styles.nodeContentSelected,
            isDisabled && { opacity: 0.5 }
          ]}
          onPress={() => !isDisabled && onSelect?.(node)}
          disabled={isDisabled}
        >
          <View style={[styles.levelBadge, { backgroundColor: colors.bg }]}>
            <Text style={[styles.levelBadgeText, { color: colors.fg }]}>
              {LEVEL_INITIAL[node.level] || '-'}
            </Text>
          </View>
          <Text style={[
            styles.nodeName, 
            isMatch && { fontWeight: '700' },
            isSelected && { color: Colors.primary, fontWeight: '700' }
          ]} numberOfLines={1}>
            {node.name}
          </Text>
          <Text style={styles.nodeLevel} numberOfLines={1}>
            {node.level.replace('_', ' ')}
          </Text>
        </TouchableOpacity>
      </View>
    );
  };

  const rootBranch = branches.get(ROOT);
  const loadingRoots = rootBranch?.loading && (rootBranch?.ids || []).length === 0;

  return (
    <View style={styles.container}>
      <View style={styles.searchBar}>
        <Ionicons name="search" size={20} color={Colors.textMuted} style={{ marginRight: 8 }} />
        <TextInput
          style={styles.searchInput}
          placeholder="Search units..."
          value={query}
          onChangeText={setQuery}
        />
        {query.length > 0 && (
          <TouchableOpacity onPress={() => setQuery('')} style={{ padding: 4 }}>
            <Ionicons name="close-circle" size={20} color={Colors.textMuted} />
          </TouchableOpacity>
        )}
      </View>

      {err ? <Text style={styles.errorText}>{err}</Text> : null}

      <View style={styles.listContainer}>
        {loadingRoots || searching ? (
          <ActivityIndicator size="large" color={Colors.primary} style={{ marginTop: 24 }} />
        ) : visible.length === 0 ? (
          <Text style={styles.emptyText}>No units found.</Text>
        ) : (
          <ScrollView 
            contentContainerStyle={{ paddingVertical: 8 }}
            nestedScrollEnabled={true}
          >
            {visible.map((item, index) => (
              <React.Fragment key={item.node.id}>
                {renderItem({ item, index })}
              </React.Fragment>
            ))}
          </ScrollView>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.surface,
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: Radius.md,
    overflow: 'hidden',
  },
  searchBar: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: Spacing.md,
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
    backgroundColor: Colors.surface,
  },
  searchInput: {
    flex: 1,
    fontSize: FontSize.base,
    color: Colors.text,
  },
  listContainer: {
    flex: 1,
    minHeight: 250,
  },
  nodeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingRight: Spacing.md,
    paddingVertical: 4,
  },
  expandHitbox: {
    padding: 8,
    marginRight: 2,
  },
  nodeContent: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 6,
    paddingHorizontal: 8,
    borderRadius: Radius.sm,
  },
  nodeContentSelected: {
    backgroundColor: '#e0f2fe',
  },
  levelBadge: {
    width: 22,
    height: 22,
    borderRadius: 11,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 8,
  },
  levelBadgeText: {
    fontSize: 11,
    fontWeight: '700',
  },
  nodeName: {
    fontSize: FontSize.base,
    color: Colors.text,
    flexShrink: 1,
    marginRight: 8,
  },
  nodeLevel: {
    fontSize: FontSize.xs,
    color: Colors.textMuted,
    flexShrink: 0,
  },
  errorText: {
    color: Colors.error,
    padding: Spacing.md,
    textAlign: 'center',
  },
  emptyText: {
    color: Colors.textMuted,
    padding: Spacing.xl,
    textAlign: 'center',
    fontStyle: 'italic',
  }
});
