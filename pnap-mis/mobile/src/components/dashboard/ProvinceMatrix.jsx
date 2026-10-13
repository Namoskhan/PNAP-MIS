import { useMemo, useState } from 'react';
import {
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useLanguage } from '../../context/LanguageContext';
import { Colors, FontSize, Radius, Spacing } from '../../constants/colors';

const num = (v) => (v ?? 0).toLocaleString();
const pct = (a, b) => (b > 0 ? Math.round((a / b) * 100) : 0);

function formatOfficer(officer) {
  if (!officer?.fullName) return null;
  const rawRole = officer.roleCode || '';
  let roleTitle = 'President';
  if (rawRole) {
    if (rawRole.includes('PRESIDENT')) {
      roleTitle = 'President';
    } else {
      roleTitle = rawRole
        .replace(/_/g, ' ')
        .toLowerCase()
        .replace(/\b\w/g, (c) => c.toUpperCase());
    }
  }
  return `${officer.fullName} (${roleTitle})`;
}

function SubUnitItem({ item, isRTL }) {
  const isZero = item.active === 0 && item.total > 0;
  const isComplete = item.active === item.total && item.total > 0;
  const isPartial = item.active > 0 && item.active < item.total;

  return (
    <View style={[styles.subUnitItem, isRTL && { alignItems: 'flex-end' }]}>
      <View style={[styles.subUnitValRow, isRTL && { flexDirection: 'row-reverse' }]}>
        {isComplete ? (
          <View style={styles.solidDot} />
        ) : isPartial ? (
          <Ionicons name="pie-chart" size={11} color="#16a34a" style={styles.pieIcon} />
        ) : null}
        <Text style={[styles.subUnitValText, isZero && styles.subUnitValZero]}>
          {item.active}/{item.total}
        </Text>
      </View>
      <Text style={[styles.subUnitLabelText, isZero && styles.subUnitLabelZero, isRTL && { textAlign: 'right' }]}>
        {item.label}
      </Text>
    </View>
  );
}

function UnitCard({ r, onDrill }) {
  const { t, isRTL } = useLanguage();
  const m = r.members || {};
  const memberPct = m.activePct ?? pct(m.active, m.total);
  const officerText = formatOfficer(r.officer);

  const districtsTier =
    r.districts && (r.districts.total > 0 || r.level === 'PROVINCE')
      ? { label: t('units.districts', 'Districts'), active: r.districts.active ?? 0, total: r.districts.total ?? 0 }
      : null;

  const areasTier =
    r.areas && r.areas.total > 0
      ? { label: t('units.areas', 'Areas'), active: r.areas.active ?? 0, total: r.areas.total ?? 0 }
      : null;

  const basicUnitsTier =
    r.basicUnits && r.basicUnits.total > 0
      ? { label: t('units.basicUnits', 'Basic Units'), active: r.basicUnits.active ?? 0, total: r.basicUnits.total ?? 0 }
      : null;

  return (
    <View style={[styles.unitCard, !r.isActiveUnit && styles.inactiveUnitCard]}>
      {/* ── Header: Unit Name + Status Badge & Officer ── */}
      <View style={[styles.cardHead, isRTL && { flexDirection: 'row-reverse' }]}>
        <TouchableOpacity
          style={styles.titleTouch}
          onPress={() => onDrill?.(r.level, r._id, r.name)}
          activeOpacity={0.7}
        >
          <Text
            style={[
              styles.unitName,
              !r.isActiveUnit && styles.inactiveUnitName,
              isRTL && { textAlign: 'right' },
            ]}
            numberOfLines={1}
          >
            {r.name} <Text style={[styles.drillArrow, !r.isActiveUnit && styles.inactiveUnitName]}>{isRTL ? '←' : '→'}</Text>
          </Text>
        </TouchableOpacity>

        <View style={[styles.headRight, isRTL && { alignItems: 'flex-start' }]}>
          <View style={[styles.badgePill, r.isActiveUnit ? styles.activeBadgePill : styles.inactiveBadgePill]}>
            <Text style={[styles.badgeText, r.isActiveUnit ? styles.activeBadgeText : styles.inactiveBadgeText]}>
              {r.isActiveUnit ? 'ACTIVE' : 'INACTIVE'}
            </Text>
          </View>
          {officerText && r.isActiveUnit ? (
            <Text style={[styles.officerText, isRTL && { textAlign: 'left' }]} numberOfLines={1}>
              {officerText}
            </Text>
          ) : null}
        </View>
      </View>

      {/* ── Divider ── */}
      <View style={styles.cardDivider} />

      {/* ── Body: 2 Columns (Members on Left, Sub-units on Right) ── */}
      <View style={[styles.cardBody, isRTL && { flexDirection: 'row-reverse' }]}>
        {/* Left Column: Members */}
        <View style={[styles.leftCol, isRTL && { alignItems: 'flex-end', paddingRight: 0, paddingLeft: 10 }]}>
          <Text style={[styles.membersValText, !r.isActiveUnit && styles.inactiveMembersText, isRTL && { textAlign: 'right' }]}>
            {num(m.total)} {t('common.members', 'Members')}
          </Text>
          <Text style={[styles.membersSubText, isRTL && { textAlign: 'right' }]}>
            ({num(m.active)} {t('dashboard.takingPart', 'Taking part')} · {num(m.inactive)} {t('dashboard.notTakingPartShort', 'Not')})
          </Text>
          <View style={styles.membersTrack}>
            <View
              style={[
                styles.membersFill,
                {
                  width: `${memberPct}%`,
                  backgroundColor: r.isActiveUnit && m.total > 0 ? '#16a34a' : '#cbd5e1',
                },
              ]}
            />
          </View>
        </View>

        {/* Vertical Divider */}
        <View style={styles.verticalDivider} />

        {/* Right Column: Sub-unit tiers */}
        <View style={[styles.rightCol, isRTL && { paddingLeft: 0, paddingRight: 10, alignItems: 'flex-end' }]}>
          <View style={[styles.tiersRow, isRTL && { flexDirection: 'row-reverse' }]}>
            {districtsTier && <SubUnitItem item={districtsTier} isRTL={isRTL} />}
            {areasTier && <SubUnitItem item={areasTier} isRTL={isRTL} />}
          </View>
          {basicUnitsTier && (
            <View style={[styles.tiersRowBottom, isRTL && { flexDirection: 'row-reverse' }]}>
              <SubUnitItem item={basicUnitsTier} isRTL={isRTL} />
            </View>
          )}
        </View>
      </View>
    </View>
  );
}

export default function ProvinceMatrix({ rows, levelNoun = 'Province', onDrill }) {
  const { t, isRTL } = useLanguage();
  const [query, setQuery] = useState('');
  const [page, setPage] = useState(1);
  const [showAll, setShowAll] = useState(false);
  const noun = levelNoun.toLowerCase();
  const all = rows || [];

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return all;
    return all.filter((r) => `${r.name} ${r.code || ''}`.toLowerCase().includes(q));
  }, [all, query]);

  const PAGE_SIZE = 6;
  const totalPages = Math.ceil(filtered.length / PAGE_SIZE) || 1;
  const currentPage = Math.min(Math.max(page, 1), totalPages);

  const displayed = useMemo(() => {
    if (showAll) return filtered;
    const start = (currentPage - 1) * PAGE_SIZE;
    return filtered.slice(start, start + PAGE_SIZE);
  }, [filtered, showAll, currentPage]);

  if (all.length === 0) {
    return (
      <View style={styles.emptyContainer}>
        <Text style={styles.emptyText}>{t('dashboard.noUnitsFoundSelection', `No ${noun}s found in this view.`)}</Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      {/* Search Filter Toolbar (shown when >= 4 items) */}
      {all.length >= 4 && (
        <View style={[styles.searchRow, isRTL && { flexDirection: 'row-reverse' }]}>
          <TextInput
            style={[styles.searchInput, isRTL && { textAlign: 'right' }]}
            value={query}
            onChangeText={(text) => {
              setQuery(text);
              setPage(1);
            }}
            placeholder={t('dashboard.filterUnitsByName', `Filter ${noun}s by name…`)}
            placeholderTextColor={Colors.textMuted}
          />
          {query ? (
            <TouchableOpacity
              onPress={() => {
                setQuery('');
                setPage(1);
              }}
              style={styles.clearBtn}
            >
              <Text style={styles.clearText}>✕</Text>
            </TouchableOpacity>
          ) : null}
        </View>
      )}

      {filtered.length === 0 ? (
        <View style={styles.emptyContainer}>
          <Text style={styles.emptyText}>{t('dashboard.noUnitMatchesQuery', `No ${noun} matches “${query}”.`)}</Text>
        </View>
      ) : (
        <>
          <View style={styles.grid}>
            {displayed.map((r) => (
              <UnitCard key={r._id} r={r} onDrill={onDrill} />
            ))}
          </View>

          {/* Pagination Controls */}
          {filtered.length > PAGE_SIZE && (
            <View style={[styles.pagerRow, isRTL && { flexDirection: 'row-reverse' }]}>
              <View style={[styles.pagerNavGroup, isRTL && { flexDirection: 'row-reverse' }]}>
                <TouchableOpacity
                  disabled={currentPage <= 1 || showAll}
                  style={[styles.pagerBtn, (currentPage <= 1 || showAll) && styles.pagerBtnDisabled]}
                  onPress={() => setPage((p) => Math.max(p - 1, 1))}
                >
                  <Text style={[styles.pagerBtnText, (currentPage <= 1 || showAll) && styles.pagerBtnTextDisabled]}>
                    {isRTL ? '▶ ' + t('common.previous', 'Prev') : '◀ ' + t('common.previous', 'Prev')}
                  </Text>
                </TouchableOpacity>

                <Text style={styles.pagerInfo}>
                  {showAll
                    ? `${filtered.length} ${t('common.all', 'All')}`
                    : `${currentPage} / ${totalPages}`}
                </Text>

                <TouchableOpacity
                  disabled={currentPage >= totalPages || showAll}
                  style={[styles.pagerBtn, (currentPage >= totalPages || showAll) && styles.pagerBtnDisabled]}
                  onPress={() => setPage((p) => Math.min(p + 1, totalPages))}
                >
                  <Text style={[styles.pagerBtnText, (currentPage >= totalPages || showAll) && styles.pagerBtnTextDisabled]}>
                    {isRTL ? t('common.next', 'Next') + ' ◀' : t('common.next', 'Next') + ' ▶'}
                  </Text>
                </TouchableOpacity>
              </View>

              <TouchableOpacity
                style={[styles.toggleAllBtn, showAll && styles.toggleAllBtnActive]}
                onPress={() => setShowAll((s) => !s)}
              >
                <Text style={[styles.toggleAllText, showAll && styles.toggleAllTextActive]}>
                  {showAll
                    ? t('dashboard.showPaged', `Show ${PAGE_SIZE}`)
                    : t('dashboard.showAllRows', `All (${filtered.length})`)}
                </Text>
              </TouchableOpacity>
            </View>
          )}
        </>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    gap: 8,
  },
  searchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#ffffff',
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
    backgroundColor: Colors.surfaceAlt,
    borderRadius: Radius.md,
  },
  emptyText: {
    fontSize: FontSize.sm,
    color: Colors.textMuted,
  },
  grid: {
    gap: 10,
  },

  // ── UNIT CARD STYLING (MATCHES REFERENCE IMAGE) ──
  unitCard: {
    backgroundColor: '#ffffff',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#e2e8f0',
    paddingHorizontal: 16,
    paddingTop: 14,
    paddingBottom: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.04,
    shadowRadius: 3,
    elevation: 1,
  },
  inactiveUnitCard: {
    borderColor: '#e2e8f0',
  },
  cardHead: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    gap: 8,
  },
  titleTouch: {
    flex: 1,
    justifyContent: 'center',
  },
  unitName: {
    fontSize: 18,
    fontWeight: '800',
    color: '#1e1b4b',
    letterSpacing: -0.3,
  },
  inactiveUnitName: {
    color: '#64748b',
  },
  drillArrow: {
    fontSize: 16,
    fontWeight: '700',
    color: '#1e1b4b',
  },
  headRight: {
    alignItems: 'flex-end',
    gap: 3,
  },
  badgePill: {
    paddingHorizontal: 8,
    paddingVertical: 2.5,
    borderRadius: 12,
  },
  activeBadgePill: {
    backgroundColor: '#dcfce7',
  },
  inactiveBadgePill: {
    backgroundColor: '#f1f5f9',
  },
  badgeText: {
    fontSize: 10.5,
    fontWeight: '800',
    letterSpacing: 0.4,
  },
  activeBadgeText: {
    color: '#15803d',
  },
  inactiveBadgeText: {
    color: '#64748b',
  },
  officerText: {
    fontSize: 11.5,
    color: '#334155',
    fontWeight: '500',
    marginTop: 2,
  },
  cardDivider: {
    height: 1,
    backgroundColor: '#f1f5f9',
    marginTop: 10,
    marginBottom: 12,
  },
  cardBody: {
    flexDirection: 'row',
    alignItems: 'flex-start',
  },
  leftCol: {
    flex: 1.05,
    paddingRight: 8,
    justifyContent: 'center',
  },
  membersValText: {
    fontSize: 16,
    fontWeight: '800',
    color: '#0f172a',
    letterSpacing: -0.2,
  },
  inactiveMembersText: {
    color: '#0f172a',
  },
  membersSubText: {
    fontSize: 11,
    color: '#475569',
    marginTop: 2,
    fontWeight: '400',
  },
  membersTrack: {
    height: 5,
    borderRadius: 2.5,
    backgroundColor: '#e2e8f0',
    marginTop: 8,
    width: '92%',
    overflow: 'hidden',
  },
  membersFill: {
    height: '100%',
    borderRadius: 2.5,
  },
  verticalDivider: {
    width: 1,
    backgroundColor: '#f1f5f9',
    alignSelf: 'stretch',
    marginHorizontal: 4,
  },
  rightCol: {
    flex: 0.95,
    paddingLeft: 10,
    justifyContent: 'center',
  },
  tiersRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 14,
  },
  tiersRowBottom: {
    marginTop: 8,
    flexDirection: 'row',
  },
  subUnitItem: {
    minWidth: 54,
  },
  subUnitValRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  solidDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#16a34a',
  },
  pieIcon: {
    marginRight: 1,
  },
  subUnitValText: {
    fontSize: 14,
    fontWeight: '800',
    color: '#0f172a',
  },
  subUnitValZero: {
    color: '#94a3b8',
    fontWeight: '700',
  },
  subUnitLabelText: {
    fontSize: 11,
    color: '#334155',
    fontWeight: '500',
    marginTop: 2,
  },
  subUnitLabelZero: {
    color: '#94a3b8',
  },

  // ── PAGINATION CONTROLS ──
  pagerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: Spacing.xs,
    paddingTop: Spacing.sm,
    borderTopWidth: 1,
    borderTopColor: Colors.borderLight,
    gap: 8,
  },
  pagerNavGroup: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  pagerBtn: {
    paddingVertical: 5,
    paddingHorizontal: 10,
    borderRadius: Radius.sm,
    backgroundColor: Colors.surface,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  pagerBtnDisabled: {
    opacity: 0.35,
  },
  pagerBtnText: {
    fontSize: 11,
    fontWeight: '600',
    color: Colors.text,
  },
  pagerBtnTextDisabled: {
    color: Colors.textMuted,
  },
  pagerInfo: {
    fontSize: 11,
    fontWeight: '700',
    color: Colors.primary,
    minWidth: 42,
    textAlign: 'center',
  },
  toggleAllBtn: {
    paddingVertical: 5,
    paddingHorizontal: 10,
    borderRadius: Radius.sm,
    backgroundColor: Colors.surface,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  toggleAllBtnActive: {
    backgroundColor: 'rgba(30, 64, 175, 0.1)',
    borderColor: Colors.primary,
  },
  toggleAllText: {
    fontSize: 11,
    fontWeight: '600',
    color: Colors.textMuted,
  },
  toggleAllTextActive: {
    color: Colors.primary,
    fontWeight: '700',
  },
});
