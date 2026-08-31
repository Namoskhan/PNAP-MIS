import { useMemo, useState } from 'react';
import {
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { Colors, FontSize, Radius, Spacing } from '../../constants/colors';
import Card from '../Card';
import Badge from '../Badge';

const num = (v) => (v ?? 0).toLocaleString();
const pct = (a, b) => (b > 0 ? Math.round((a / b) * 100) : 0);

function TierBar({ label, active, total }) {
  if (total == null || total === 0) return null;
  const p = pct(active, total);
  return (
    <View style={styles.tierRow}>
      <View style={styles.tierHeader}>
        <Text style={styles.tierLabel}>{label}</Text>
        <Text style={styles.tierNum}>
          <Text style={{ fontWeight: '700', color: Colors.text }}>{num(active)}</Text>
          <Text style={{ color: Colors.textMuted }}> of {num(total)}</Text>
        </Text>
      </View>
      <View style={styles.tierTrack}>
        <View
          style={[
            styles.tierFill,
            {
              width: `${p}%`,
              backgroundColor: p >= 50 ? Colors.success : p > 0 ? Colors.warning : Colors.border,
            },
          ]}
        />
      </View>
    </View>
  );
}

function UnitCard({ r, onDrill }) {
  const m = r.members || {};
  const memberPct = m.activePct ?? pct(m.active, m.total);

  return (
    <Card style={[styles.unitCard, !r.isActiveUnit && styles.dormantCard]}>
      {/* Header: Name + Badge */}
      <View style={styles.cardHead}>
        <TouchableOpacity
          style={{ flex: 1 }}
          onPress={() => onDrill?.(r.level, r._id, r.name)}
        >
          <Text style={styles.unitName} numberOfLines={1}>
            {r.name} <Text style={styles.drillArrow}>→</Text>
          </Text>
        </TouchableOpacity>
        <Badge
          label={r.isActiveUnit ? 'Working' : 'Silent'}
          bg={r.isActiveUnit ? 'rgba(22, 163, 74, 0.12)' : 'rgba(100, 116, 139, 0.15)'}
          color={r.isActiveUnit ? Colors.success : Colors.textMuted}
        />
      </View>

      {/* Members Stats */}
      <View style={styles.membersBlock}>
        <View style={styles.membersLeadRow}>
          <Text style={styles.membersVal}>{num(m.total)}</Text>
          <Text style={styles.membersLabel}>members</Text>
          <Text style={styles.membersSplit}>
            ({num(m.active)} active · {num(m.inactive)} silent)
          </Text>
        </View>
        <View style={styles.membersTrack}>
          <View style={[styles.membersFill, { width: `${memberPct}%` }]} />
        </View>
      </View>

      {/* Sub-tier Progress Bars */}
      <View style={styles.tiersContainer}>
        <TierBar label="Districts" active={r.districts?.active} total={r.districts?.total} />
        <TierBar label="Areas" active={r.areas?.active} total={r.areas?.total} />
        <TierBar label="Basic Units" active={r.basicUnits?.active} total={r.basicUnits?.total} />
      </View>

      {/* Responsible Officer */}
      <View style={styles.officerRow}>
        <Text style={styles.officerLabel}>In charge: </Text>
        {r.officer?.fullName ? (
          <Text style={styles.officerName} numberOfLines={1}>
            {r.officer.fullName}{' '}
            <Text style={styles.officerRole}>
              ({String(r.officer.roleCode || '').replace(/_/g, ' ').toLowerCase()})
            </Text>
          </Text>
        ) : (
          <Text style={styles.officerNone}>No office bearer on record</Text>
        )}
      </View>
    </Card>
  );
}

export default function ProvinceMatrix({ rows, levelNoun = 'Province', onDrill }) {
  const [query, setQuery] = useState('');
  const noun = levelNoun.toLowerCase();
  const all = rows || [];

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return all;
    return all.filter((r) => `${r.name} ${r.code || ''}`.toLowerCase().includes(q));
  }, [all, query]);

  if (all.length === 0) {
    return (
      <Card style={styles.emptyContainer}>
        <Text style={styles.emptyText}>No {noun}s found in this view.</Text>
      </Card>
    );
  }

  return (
    <View style={styles.container}>
      {/* Search Filter Toolbar */}
      {all.length >= 4 && (
        <View style={styles.searchRow}>
          <TextInput
            style={styles.searchInput}
            value={query}
            onChangeText={setQuery}
            placeholder={`Filter ${noun}s by name…`}
            placeholderTextColor={Colors.textMuted}
          />
          {query ? (
            <TouchableOpacity onPress={() => setQuery('')} style={styles.clearBtn}>
              <Text style={styles.clearText}>✕</Text>
            </TouchableOpacity>
          ) : null}
        </View>
      )}

      {filtered.length === 0 ? (
        <Card style={styles.emptyContainer}>
          <Text style={styles.emptyText}>No {noun} matches “{query}”.</Text>
        </Card>
      ) : (
        <View style={styles.grid}>
          {filtered.map((r) => (
            <UnitCard key={r._id} r={r} onDrill={onDrill} />
          ))}
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    gap: Spacing.sm,
  },
  searchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.surface,
    borderRadius: Radius.md,
    borderWidth: 1,
    borderColor: Colors.border,
    paddingHorizontal: Spacing.sm,
    marginBottom: Spacing.xs,
  },
  searchInput: {
    flex: 1,
    height: 38,
    fontSize: FontSize.sm,
    color: Colors.text,
  },
  clearBtn: {
    padding: 6,
  },
  clearText: {
    color: Colors.textMuted,
    fontSize: FontSize.xs,
    fontWeight: '700',
  },
  emptyContainer: {
    padding: Spacing.lg,
    alignItems: 'center',
  },
  emptyText: {
    fontSize: FontSize.sm,
    color: Colors.textMuted,
  },
  grid: {
    gap: Spacing.sm,
  },
  unitCard: {
    padding: Spacing.md,
    gap: Spacing.sm,
  },
  dormantCard: {
    opacity: 0.85,
    borderLeftWidth: 3,
    borderLeftColor: Colors.warning,
  },
  cardHead: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: 8,
  },
  unitName: {
    fontSize: FontSize.md,
    fontWeight: '800',
    color: Colors.primary,
  },
  drillArrow: {
    fontSize: FontSize.sm,
    color: Colors.accent,
  },
  membersBlock: {
    gap: 4,
  },
  membersLeadRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
    gap: 4,
  },
  membersVal: {
    fontSize: FontSize.md,
    fontWeight: '800',
    color: Colors.text,
  },
  membersLabel: {
    fontSize: FontSize.xs,
    fontWeight: '600',
    color: Colors.textMuted,
  },
  membersSplit: {
    fontSize: 10,
    color: Colors.textMuted,
    marginLeft: 'auto',
  },
  membersTrack: {
    height: 6,
    borderRadius: 3,
    backgroundColor: Colors.surfaceAlt,
    overflow: 'hidden',
  },
  membersFill: {
    height: '100%',
    backgroundColor: Colors.success,
    borderRadius: 3,
  },
  tiersContainer: {
    gap: 4,
    backgroundColor: Colors.surfaceAlt,
    padding: Spacing.sm,
    borderRadius: Radius.sm,
  },
  tierRow: {
    gap: 2,
  },
  tierHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  tierLabel: {
    fontSize: 11,
    fontWeight: '600',
    color: Colors.textMuted,
  },
  tierNum: {
    fontSize: 11,
  },
  tierTrack: {
    height: 4,
    borderRadius: 2,
    backgroundColor: 'rgba(0,0,0,0.06)',
    overflow: 'hidden',
  },
  tierFill: {
    height: '100%',
    borderRadius: 2,
  },
  officerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    borderTopWidth: 1,
    borderTopColor: Colors.border,
    paddingTop: 6,
  },
  officerLabel: {
    fontSize: 11,
    color: Colors.textMuted,
    fontWeight: '600',
  },
  officerName: {
    fontSize: 11,
    fontWeight: '700',
    color: Colors.text,
    flex: 1,
  },
  officerRole: {
    fontWeight: '500',
    color: Colors.textMuted,
    textTransform: 'capitalize',
  },
  officerNone: {
    fontSize: 11,
    color: Colors.textMuted,
    fontStyle: 'italic',
  },
});
