import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  RefreshControl,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { useAuth } from '../context/AuthContext';
import useAnalytics from '../hooks/useAnalytics';
import { Colors, FontSize, Radius, Spacing } from '../constants/colors';
import Card from './Card';
import Badge from './Badge';
import EmptyState from './EmptyState';

// Dashboard Acts Components
import ScopeBreadcrumb from './dashboard/ScopeBreadcrumb';
import AnalyticsFilters from './dashboard/AnalyticsFilters';
import ProvinceMatrix from './dashboard/ProvinceMatrix';
import MembershipAnalytics from './dashboard/MembershipAnalytics';
import CampaignsAnalytics from './dashboard/CampaignsAnalytics';
import MeetingsAnalytics from './dashboard/MeetingsAnalytics';
import ReportsAnalytics from './dashboard/ReportsAnalytics';
import { InactiveUnitsTable } from './dashboard/InactiveTables';

const EMPTY_SCOPE = { provinceId: '', districtId: '', areaId: '', basicUnitId: '' };
const DRILL_KEY = {
  PROVINCE: 'provinceId',
  DISTRICT: 'districtId',
  AREA: 'areaId',
  BASIC_UNIT: 'basicUnitId',
};
const BELOW = {
  NATIONAL: ['provinceId', 'districtId', 'areaId', 'basicUnitId'],
  PROVINCE: ['districtId', 'areaId', 'basicUnitId'],
  DISTRICT: ['areaId', 'basicUnitId'],
  AREA: ['basicUnitId'],
  BASIC_UNIT: [],
};
const LEVEL_NOUN = {
  PROVINCE: 'Province',
  DISTRICT: 'District',
  AREA: 'Area',
  BASIC_UNIT: 'Basic unit',
};

const num = (v) => (v ?? 0).toLocaleString();

/**
 * Layman-friendly Unit Tier Card
 * Shows clear functioning units vs total with a progress bar and status badge
 */
function UnitTierCard({ title, active = 0, total = 0, noun = 'units' }) {
  const p = total > 0 ? Math.round((active / total) * 100) : 0;
  const isGood = p >= 50;
  const silent = Math.max(0, total - active);

  return (
    <View style={styles.unitTierCard}>
      <View style={styles.unitTierTop}>
        <Text style={styles.unitTierTitle} numberOfLines={1}>{title}</Text>
        <View style={[styles.unitTierBadge, { backgroundColor: isGood ? 'rgba(22, 163, 74, 0.12)' : 'rgba(217, 119, 6, 0.12)' }]}>
          <Text style={[styles.unitTierBadgeText, { color: isGood ? Colors.success : Colors.warning }]}>
            {total > 0 ? `${p}% active` : '0%'}
          </Text>
        </View>
      </View>

      <View style={styles.unitTierNumberRow}>
        <Text style={styles.unitTierActive}>{num(active)}</Text>
        <Text style={styles.unitTierTotal}> of {num(total)}</Text>
      </View>

      <View style={styles.unitProgressBar}>
        <View
          style={[
            styles.unitProgressFill,
            {
              width: `${p}%`,
              backgroundColor: isGood ? Colors.success : Colors.warning,
            },
          ]}
        />
      </View>

      <Text style={styles.unitTierSub} numberOfLines={1}>
        {num(active)} active · {num(silent)} inactive
      </Text>
    </View>
  );
}

/**
 * Section Card
 * Clean, visually distinct section container with icon, number, layman title, subtitle and live count chip
 */
function SectionCard({
  icon,
  number,
  title,
  subtitle,
  meta,
  children,
}) {
  return (
    <View style={styles.sectionContainer}>
      <View style={styles.sectionHeader}>
        <View style={styles.sectionHeaderLeft}>
          <View style={styles.sectionIconBadge}>
            <Text style={styles.sectionIconText}>{icon}</Text>
          </View>
          <View style={{ flex: 1 }}>
            <View style={styles.sectionTitleRow}>
              <Text style={styles.sectionNumber}>{number}.</Text>
              <Text style={styles.sectionTitle} numberOfLines={1}>{title}</Text>
            </View>
            {subtitle ? (
              <Text style={styles.sectionSubtitle} numberOfLines={1}>{subtitle}</Text>
            ) : null}
          </View>
        </View>

        {meta ? (
          <View style={styles.sectionMetaBadge}>
            <Text style={styles.sectionMetaText}>{meta}</Text>
          </View>
        ) : null}
      </View>

      <View style={styles.sectionBody}>
        {children}
      </View>
    </View>
  );
}

export default function CommandCenter({ accessScope = null }) {
  const { user } = useAuth();
  const isSuper = user?.roles?.includes('SUPER_ADMIN');
  const scrollViewRef = useRef(null);

  const initialScope = useMemo(() => {
    if (!accessScope?.level || !accessScope?.unitId) return EMPTY_SCOPE;
    return { ...EMPTY_SCOPE, [DRILL_KEY[accessScope.level]]: accessScope.unitId };
  }, [accessScope]);

  const [scope, setScope] = useState(initialScope);
  const [filters, setFilters] = useState({ days: 365, memberStatus: '', orgStatus: '' });
  const [showFilters, setShowFilters] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  const lockedScope = Boolean(accessScope?.unitId);

  useEffect(() => {
    setScope(initialScope);
  }, [initialScope]);

  const params = useMemo(() => {
    const p = { days: filters.days };
    for (const [k, v] of Object.entries(scope)) {
      if (v) p[k] = v;
    }
    if (filters.memberStatus) p.memberStatus = filters.memberStatus;
    if (filters.orgStatus) p.orgStatus = filters.orgStatus;
    return p;
  }, [scope, filters]);

  const summary = useAnalytics('/dashboard/summary', params, { poll: 60000 });
  const scopeInfo = useAnalytics('/dashboard/scope', params);
  const org = useAnalytics('/dashboard/org-breakdown', params);

  const isSuperOrCentral =
    user?.roles?.includes('SUPER_ADMIN') ||
    user?.roles?.includes('CENTRAL_ADMIN') ||
    !!user?.canViewExecutiveDashboard;

  const drillTo = useCallback(
    (level, id) => {
      if (lockedScope) return;
      setScope((s) => {
        const next = { ...s };
        for (const k of BELOW[level] || []) next[k] = '';
        if (DRILL_KEY[level]) next[DRILL_KEY[level]] = String(id);
        return next;
      });
      scrollViewRef.current?.scrollTo({ y: 0, animated: true });
    },
    [lockedScope]
  );

  const navigateTo = useCallback(
    (level) => {
      if (lockedScope) return;
      setScope((s) => {
        if (level === 'NATIONAL') return EMPTY_SCOPE;
        const next = { ...s };
        for (const k of BELOW[level] || []) next[k] = '';
        return next;
      });
    },
    [lockedScope]
  );

  async function onRefresh() {
    setRefreshing(true);
    await Promise.all([summary.reload(true), scopeInfo.reload(true), org.reload(true)]);
    setRefreshing(false);
  }

  if (!isSuperOrCentral) {
    return (
      <SafeAreaView style={styles.safe}>
        <EmptyState
          icon="🛡️"
          title="Access Denied"
          subtitle="You do not have permission to view the Command Center."
        />
      </SafeAreaView>
    );
  }

  const s = summary.data;
  const o = s?.organization;
  const trail = isSuper
    ? scopeInfo.data?.trail?.filter((item) => item.level !== 'NATIONAL')
    : scopeInfo.data?.trail;
  const scopeName = trail?.length ? trail[trail.length - 1].name : 'the whole country';
  const windowLabel = `last ${filters.days} days`;
  const childNoun = LEVEL_NOUN[org.data?.level] || 'Province';

  const periodFrom = (() => {
    const d = new Date();
    d.setDate(d.getDate() - filters.days);
    return d.toISOString().slice(0, 10);
  })();

  const isFiltered = Boolean(
    scope.provinceId ||
    scope.districtId ||
    scope.areaId ||
    scope.basicUnitId ||
    filters.memberStatus ||
    filters.orgStatus ||
    filters.days !== 365
  );

  return (
    <SafeAreaView style={styles.safe}>
      {/* ── Banner / Masthead ── */}
      <View style={styles.banner}>
        <View style={{ flex: 1 }}>
          {!isSuper ? <Text style={styles.bannerEyebrow}>Dashboard</Text> : null}
          <Text style={styles.bannerTitle} numberOfLines={1}>
            {scopeName === 'the whole country' ? 'Command Center' : scopeName}
          </Text>
        </View>
        <View style={styles.bannerActions}>
          <View style={styles.liveBadge}>
            <View style={styles.liveDot} />
            <Text style={styles.liveText}>Live</Text>
          </View>
        </View>
      </View>

      <ScrollView
        ref={scrollViewRef}
        style={styles.scroll}
        contentContainerStyle={styles.content}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            tintColor={Colors.primary}
          />
        }
      >
        {/* Scope Breadcrumb & Reset button */}
        {scope.provinceId && !lockedScope ? (
          <View style={{ marginBottom: Spacing.sm }}>
            {(!isSuper || trail?.length > 0) ? (
              <ScopeBreadcrumb trail={trail} onNavigate={navigateTo} />
            ) : null}
            <TouchableOpacity
              style={styles.backNationalBtn}
              onPress={() => navigateTo('NATIONAL')}
            >
              <Text style={styles.backNationalText}>Back to all provinces</Text>
            </TouchableOpacity>
          </View>
        ) : null}

        {/* ── Compact Filter Summary Bar (De-cluttered) ── */}
        <View style={styles.filterSummaryBar}>
          <View style={styles.filterSummaryPills}>
            <View style={styles.filterChip}>
              <Text style={styles.filterChipText}>
                ⏱️ {filters.days === 365 ? 'Past 1 Year' : `Past ${filters.days} Days`}
              </Text>
            </View>
            <View style={styles.filterChip}>
              <Text style={styles.filterChipText} numberOfLines={1}>
                📍 {scope.provinceId ? scopeName : 'All provinces'}
              </Text>
            </View>
            {isFiltered && (
              <TouchableOpacity
                style={styles.filterResetMini}
                onPress={() => {
                  if (!lockedScope) setScope(EMPTY_SCOPE);
                  setFilters({ days: 365, memberStatus: '', orgStatus: '' });
                }}
              >
                <Text style={styles.filterResetMiniText}>Reset</Text>
              </TouchableOpacity>
            )}
          </View>

          <TouchableOpacity
            style={styles.filterToggleBtn}
            onPress={() => setShowFilters((v) => !v)}
          >
            <Text style={styles.filterToggleText}>
              {showFilters ? 'Hide Filters ▴' : 'Filters ⚙️'}
            </Text>
          </TouchableOpacity>
        </View>

        {/* Expandable Full Filter Panel */}
        {showFilters && (
          <View style={{ marginBottom: Spacing.sm }}>
            <AnalyticsFilters
              scope={scope}
              filters={filters}
              onScope={(next) => setScope({ ...EMPTY_SCOPE, ...next })}
              onFilters={setFilters}
              busy={summary.loading}
              lockScope={lockedScope}
            />
          </View>
        )}

        {summary.error ? (
          <Card style={styles.errorCard}>
            <Text style={styles.errorText}>{summary.error}</Text>
          </Card>
        ) : null}

        {/* ── SECTION 1: Overview & Standing ── */}
        <SectionCard
          icon="📊"
          number="1"
          title="Members and units"
        >
          {summary.loading && !s ? (
            <ActivityIndicator size="small" color={Colors.primary} style={{ marginVertical: 12 }} />
          ) : s && o ? (
            <View style={{ gap: Spacing.sm }}>
              {/* Highlight Card: Total Membership */}
              <View style={styles.memberHighlightCard}>
                <View style={styles.memberHighlightLeft}>
                  <Text style={styles.memberHighlightLabel}>TOTAL REGISTERED MEMBERS</Text>
                  <Text style={styles.memberHighlightVal}>{num(s.membership?.total)}</Text>
                  <Text style={styles.memberHighlightSub}>
                    {num(s.membership?.newMembers)} joined in the {windowLabel}
                  </Text>
                </View>
                <View style={styles.memberHighlightRight}>
                  <View style={styles.newMemberBadge}>
                    <Text style={styles.newMemberIcon}>✨</Text>
                    <Text style={styles.newMemberCount}>+{num(s.membership?.newMembers)}</Text>
                    <Text style={styles.newMemberLabel}>new in {windowLabel}</Text>
                  </View>
                </View>
              </View>

              {/* 2x2 Unit Tier Cards (De-cluttered Grid) */}
              <View style={styles.tierGridRow}>
                <UnitTierCard
                  title="Provinces"
                  active={o.provinces?.active}
                  total={o.provinces?.total}
                  noun="parties"
                />
                <UnitTierCard
                  title="District Units"
                  active={o.districts?.active}
                  total={o.districts?.total}
                  noun="districts"
                />
              </View>

              <View style={styles.tierGridRow}>
                <UnitTierCard
                  title="Area Units"
                  active={o.areas?.active}
                  total={o.areas?.total}
                  noun="areas"
                />
                <UnitTierCard
                  title="Basic Units"
                  active={o.basicUnits?.active}
                  total={o.basicUnits?.total}
                  noun="units"
                />
              </View>

            </View>
          ) : null}
        </SectionCard>

        {/* ── SECTION 2: Provinces & Units Matrix ── */}
        <SectionCard
          icon="🏛️"
          number="2"
          title={`${childNoun} comparison`}
          subtitle={lockedScope ? 'Records from units that belong to your unit.' : 'Tap a name to view details.'}
          meta={org.data?.rows ? `${org.data.rows.length} ${childNoun.toLowerCase()}s` : null}
        >
          {org.loading && !org.data ? (
            <ActivityIndicator size="small" color={Colors.primary} style={{ marginVertical: 12 }} />
          ) : org.error ? (
            <Card style={styles.errorCard}>
              <Text style={styles.errorText}>{org.error}</Text>
            </Card>
          ) : (
            <ProvinceMatrix
              rows={org.data?.rows || []}
              levelNoun={childNoun}
              onDrill={lockedScope ? undefined : drillTo}
            />
          )}
        </SectionCard>

        {/* ── SECTION 3: Membership Trends & Growth ── */}
        <SectionCard
          icon="👥"
          number="3"
          title="New and active members"
          meta={s ? `${num(s.membership?.newMembers)} new` : null}
        >
          <MembershipAnalytics
            params={params}
            windowLabel={windowLabel}
            byStatus={s?.membership?.byStatus}
          />
        </SectionCard>

        {/* ── SECTION 4: Field Campaigns & Initiatives ── */}
        <SectionCard
          icon="📢"
          number="4"
          title="Campaigns"
          meta={s ? `${num(s.campaigns?.running)} running` : null}
        >
          <CampaignsAnalytics params={params} windowLabel={windowLabel} showResults={!isSuper} />
        </SectionCard>

        {/* ── SECTION 5: Governance & Meetings ── */}
        <SectionCard
          icon="📅"
          number="5"
          title="Meetings"
          subtitle="See planned and completed meetings by level, group and year."
          meta={s ? `${num(s.meetings?.conducted)} of ${num(s.meetings?.total)} held` : null}
        >
          <MeetingsAnalytics params={params} windowLabel={windowLabel} />
        </SectionCard>

        {/* ── SECTION 6: Periodic Reports ── */}
        <SectionCard
          icon="📑"
          number="6"
          title="Reports"
          meta={s ? `${num(s.reports?.outstanding)} owed` : null}
        >
          <ReportsAnalytics
            params={params}
            periodFrom={periodFrom}
            scope={scope}
            accessScope={accessScope}
          />
        </SectionCard>

        {/* ── SECTION 7: Needs Attention ── */}
        <SectionCard
          icon="⚠️"
          number="7"
          title="Needs attention"
          subtitle="See inactive units and the officers in charge."
        >
          <View style={{ gap: Spacing.md }}>
            <InactiveUnitsTable params={params} />
          </View>
        </SectionCard>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: {
    flex: 1,
    backgroundColor: Colors.background,
  },
  scroll: {
    flex: 1,
  },
  content: {
    padding: Spacing.md,
    paddingBottom: 50,
  },

  // ── Masthead ──
  banner: {
    backgroundColor: Colors.primary,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.md,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
  },
  bannerEyebrow: {
    fontSize: 9,
    fontWeight: '800',
    color: 'rgba(255, 255, 255, 0.7)',
    letterSpacing: 1,
  },
  bannerTitle: {
    fontSize: FontSize.lg,
    fontWeight: '800',
    color: '#fff',
    marginTop: 1,
  },
  bannerSub: {
    fontSize: 11,
    color: 'rgba(255, 255, 255, 0.85)',
    marginTop: 2,
  },
  bannerActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  headerBtn: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: 'rgba(255,255,255,0.18)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerIcon: {
    fontSize: 15,
  },
  liveBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: 'rgba(22, 163, 74, 0.25)',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: Radius.pill,
    borderWidth: 1,
    borderColor: 'rgba(22, 163, 74, 0.4)',
  },
  liveDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: '#4ade80',
  },
  liveText: {
    fontSize: 10,
    fontWeight: '700',
    color: '#4ade80',
  },

  // ── Breadcrumb & Reset ──
  backNationalBtn: {
    backgroundColor: Colors.surfaceAlt,
    paddingVertical: 6,
    paddingHorizontal: 10,
    borderRadius: Radius.sm,
    borderWidth: 1,
    borderColor: Colors.border,
    alignSelf: 'flex-start',
    marginBottom: Spacing.xs,
  },
  backNationalText: {
    fontSize: 11,
    fontWeight: '600',
    color: Colors.primary,
  },

  // ── Compact Filter Summary Bar ──
  filterSummaryBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: Colors.surface,
    paddingHorizontal: Spacing.sm + 2,
    paddingVertical: 8,
    borderRadius: Radius.md,
    borderWidth: 1,
    borderColor: Colors.border,
    marginBottom: Spacing.sm,
    gap: 8,
  },
  filterSummaryPills: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: 6,
  },
  filterChip: {
    backgroundColor: Colors.surfaceAlt,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: Radius.pill,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  filterChipText: {
    fontSize: 11,
    fontWeight: '600',
    color: Colors.text,
  },
  filterResetMini: {
    paddingHorizontal: 6,
    paddingVertical: 2,
  },
  filterResetMiniText: {
    fontSize: 11,
    fontWeight: '700',
    color: Colors.primary,
  },
  filterToggleBtn: {
    backgroundColor: Colors.surfaceAlt,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: Radius.sm,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  filterToggleText: {
    fontSize: 11,
    fontWeight: '700',
    color: Colors.primary,
  },

  // ── Executive Pulse (2x2 Grid) ──
  pulseSection: {
    marginBottom: Spacing.md,
  },
  pulseHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 8,
    paddingHorizontal: 2,
  },
  pulseSectionTitle: {
    fontSize: 11,
    fontWeight: '800',
    color: Colors.textMuted,
    letterSpacing: 0.8,
  },
  healthStatusBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    backgroundColor: Colors.surface,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: Radius.pill,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  healthDot: {
    width: 7,
    height: 7,
    borderRadius: 4,
  },
  healthStatusText: {
    fontSize: 10,
    fontWeight: '700',
  },
  pulseGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  pulseCard: {
    flex: 1,
    minWidth: '47%',
    backgroundColor: Colors.surface,
    borderRadius: Radius.md,
    padding: Spacing.md,
    borderWidth: 1,
    borderColor: Colors.border,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.04,
    shadowRadius: 3,
    elevation: 1,
  },
  pulseCardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 6,
  },
  pulseIcon: {
    fontSize: 18,
  },
  pulsePill: {
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: Radius.pill,
  },
  pulsePillText: {
    fontSize: 10,
    fontWeight: '700',
  },
  pulseValue: {
    fontSize: FontSize.xl,
    fontWeight: '800',
    color: Colors.text,
    letterSpacing: -0.5,
  },
  pulseLabel: {
    fontSize: 11,
    fontWeight: '600',
    color: Colors.textMuted,
    marginTop: 2,
  },

  // ── Sections Header ──
  sectionsListHeader: {
    marginTop: Spacing.xs,
    marginBottom: Spacing.sm,
    paddingHorizontal: 2,
  },
  sectionsListTitle: {
    fontSize: 11,
    fontWeight: '800',
    color: Colors.textMuted,
    letterSpacing: 0.8,
  },

  // ── Section Card Container ──
  sectionContainer: {
    backgroundColor: Colors.surface,
    borderRadius: Radius.lg,
    borderWidth: 1,
    borderColor: Colors.border,
    marginBottom: Spacing.lg,
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.04,
    shadowRadius: 4,
    elevation: 2,
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: Spacing.md,
    paddingVertical: 12,
    backgroundColor: Colors.surfaceAlt,
    borderBottomWidth: 1,
    borderBottomColor: Colors.borderLight,
  },
  sectionHeaderLeft: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  sectionIconBadge: {
    width: 32,
    height: 32,
    borderRadius: 8,
    backgroundColor: Colors.surface,
    borderWidth: 1,
    borderColor: Colors.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  sectionIconText: {
    fontSize: 16,
  },
  sectionTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  sectionNumber: {
    fontSize: 12,
    fontWeight: '800',
    color: Colors.primary,
  },
  sectionTitle: {
    fontSize: FontSize.sm + 1,
    fontWeight: '800',
    color: Colors.text,
  },
  sectionSubtitle: {
    fontSize: 10,
    color: Colors.textMuted,
    marginTop: 1,
  },
  sectionMetaBadge: {
    backgroundColor: Colors.surface,
    paddingVertical: 2,
    paddingHorizontal: 6,
    borderRadius: Radius.sm,
    borderWidth: 1,
    borderColor: Colors.border,
    marginLeft: 6,
  },
  sectionMetaText: {
    fontSize: 10,
    fontWeight: '600',
    color: Colors.primary,
  },
  sectionBody: {
    padding: Spacing.md,
    backgroundColor: Colors.surface,
  },

  // ── Section 1 Highlight Card ──
  memberHighlightCard: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#eff6ff',
    padding: Spacing.md,
    borderRadius: Radius.md,
    borderWidth: 1,
    borderColor: '#bfdbfe',
    gap: 12,
  },
  memberHighlightLeft: {
    flex: 1,
  },
  memberHighlightLabel: {
    fontSize: 9,
    fontWeight: '800',
    color: Colors.primary,
    letterSpacing: 0.5,
  },
  memberHighlightVal: {
    fontSize: 26,
    fontWeight: '800',
    color: Colors.text,
    letterSpacing: -0.5,
    marginVertical: 2,
  },
  memberHighlightSub: {
    fontSize: 10,
    color: Colors.textMuted,
  },
  memberHighlightRight: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  newMemberBadge: {
    backgroundColor: '#ffffff',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: Radius.md,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#dbeafe',
  },
  newMemberIcon: {
    fontSize: 12,
  },
  newMemberCount: {
    fontSize: 14,
    fontWeight: '800',
    color: Colors.success,
  },
  newMemberLabel: {
    fontSize: 9,
    color: Colors.textMuted,
    fontWeight: '600',
  },

  // ── 2x2 Unit Tier Cards ──
  tierGridRow: {
    flexDirection: 'row',
    gap: 8,
  },
  unitTierCard: {
    flex: 1,
    backgroundColor: Colors.surfaceAlt,
    borderRadius: Radius.md,
    padding: Spacing.sm + 2,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  unitTierTop: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 4,
  },
  unitTierTitle: {
    fontSize: 11,
    fontWeight: '700',
    color: Colors.text,
    flex: 1,
    marginRight: 4,
  },
  unitTierBadge: {
    paddingHorizontal: 5,
    paddingVertical: 1,
    borderRadius: Radius.pill,
  },
  unitTierBadgeText: {
    fontSize: 9,
    fontWeight: '700',
  },
  unitTierNumberRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
    marginBottom: 6,
  },
  unitTierActive: {
    fontSize: FontSize.lg,
    fontWeight: '800',
    color: Colors.text,
  },
  unitTierTotal: {
    fontSize: 11,
    color: Colors.textMuted,
    fontWeight: '600',
  },
  unitProgressBar: {
    height: 5,
    backgroundColor: '#e2e8f0',
    borderRadius: 3,
    overflow: 'hidden',
    marginBottom: 4,
  },
  unitProgressFill: {
    height: '100%',
    borderRadius: 3,
  },
  unitTierSub: {
    fontSize: 9,
    color: Colors.textMuted,
  },

  // ── Layman Tip Card ──
  laymanTipCard: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    backgroundColor: '#f8fafc',
    padding: Spacing.sm + 2,
    borderRadius: Radius.md,
    borderWidth: 1,
    borderColor: '#e2e8f0',
    gap: 6,
    marginTop: 2,
  },
  laymanTipIcon: {
    fontSize: 13,
  },
  laymanTipText: {
    flex: 1,
    fontSize: 11,
    color: Colors.textMuted,
    lineHeight: 15,
  },

  // ── Errors ──
  errorCard: {
    padding: Spacing.md,
    backgroundColor: '#fef2f2',
    borderColor: '#fecaca',
    marginBottom: Spacing.md,
  },
  errorText: {
    color: Colors.error,
    fontSize: FontSize.xs,
    fontWeight: '600',
  },
});
