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
import { Link } from 'expo-router';
import { useAuth } from '../context/AuthContext';
import useAnalytics from '../hooks/useAnalytics';
import { Colors, FontSize, Radius, Spacing } from '../constants/colors';
import Card from './Card';
import Badge from './Badge';
import EmptyState from './EmptyState';
import { Donut, SmartKpi } from './charts';

// Dashboard Acts Components
import ScopeBreadcrumb from './dashboard/ScopeBreadcrumb';
import AnalyticsFilters from './dashboard/AnalyticsFilters';
import ProvinceMatrix from './dashboard/ProvinceMatrix';
import MembershipAnalytics from './dashboard/MembershipAnalytics';
import CampaignsAnalytics from './dashboard/CampaignsAnalytics';
import MeetingsAnalytics from './dashboard/MeetingsAnalytics';
import ReportsAnalytics from './dashboard/ReportsAnalytics';
import { InactiveUnitsTable, InactiveMembersTable } from './dashboard/InactiveTables';

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
const pct = (a, b) => (b > 0 ? Math.round((a / b) * 100) : 0);

const unitStat = (u) => {
  if (!u || !u.total) return {};
  const p = pct(u.active, u.total);
  return { share: p, tone: p >= 50 ? 'good' : 'warn' };
};

/** Act section header */
function ActHeader({ n, title, lead, meta }) {
  return (
    <View style={styles.actHeader}>
      <View style={styles.actMarker}>
        <Text style={styles.actMarkerText}>{n}</Text>
      </View>
      <View style={styles.actHeading}>
        <Text style={styles.actTitle}>{title}</Text>
        {lead && <Text style={styles.actLead}>{lead}</Text>}
      </View>
      {meta && (
        <View style={styles.actMetaBadge}>
          <Text style={styles.actMetaText}>{meta}</Text>
        </View>
      )}
    </View>
  );
}

/** Act 1 Standing Stat Tile with Donut Gauge */
function StandingStat({ value, label, sub, share }) {
  return (
    <Card style={styles.statCard}>
      <View style={styles.statMainRow}>
        <View style={{ flex: 1 }}>
          <Text style={styles.statVal}>{typeof value === 'number' ? num(value) : value || 0}</Text>
          <Text style={styles.statLabel}>{label}</Text>
          {sub && <Text style={styles.statSub}>{sub}</Text>}
        </View>
        {share != null && (
          <View style={styles.statGauge}>
            <Donut
              percent={share}
              label=""
              size={54}
              stroke={6}
              color={share >= 50 ? Colors.success : Colors.warning}
              trackColor={Colors.surfaceAlt}
            />
          </View>
        )}
      </View>
    </Card>
  );
}

const ACT_TABS = [
  { key: 'ALL', label: 'All Acts' },
  { key: 'STANDING', label: '1. Standing' },
  { key: 'PROVINCES', label: '2. Provinces' },
  { key: 'PEOPLE', label: '3. People' },
  { key: 'WORK', label: '4. Work' },
  { key: 'GOVERNANCE', label: '5. Governance' },
  { key: 'REPORTS', label: '6. Reports' },
  { key: 'ATTENTION', label: '7. Attention' },
];

export default function CommandCenter({ accessScope = null }) {
  const { user } = useAuth();
  const scrollViewRef = useRef(null);

  const initialScope = useMemo(() => {
    if (!accessScope?.level || !accessScope?.unitId) return EMPTY_SCOPE;
    return { ...EMPTY_SCOPE, [DRILL_KEY[accessScope.level]]: accessScope.unitId };
  }, [accessScope]);

  const [scope, setScope] = useState(initialScope);
  const [filters, setFilters] = useState({ days: 365, memberStatus: '', orgStatus: '' });
  const [activeTab, setActiveTab] = useState('ALL');
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
  const trail = scopeInfo.data?.trail;
  const scopeName = trail?.length ? trail[trail.length - 1].name : 'National Standing';
  const windowLabel = `last ${filters.days} days`;
  const childNoun = LEVEL_NOUN[org.data?.level] || 'Province';

  const periodFrom = (() => {
    const d = new Date();
    d.setDate(d.getDate() - filters.days);
    return d.toISOString().slice(0, 10);
  })();

  return (
    <SafeAreaView style={styles.safe}>
      {/* Banner / Masthead */}
      <View style={styles.banner}>
        <View style={{ flex: 1 }}>
          <Text style={styles.bannerEyebrow}>COMMAND CENTER</Text>
          <Text style={styles.bannerTitle} numberOfLines={1}>{scopeName}</Text>
          <Text style={styles.bannerSub}>System-wide Organizational Intelligence</Text>
        </View>
        <View style={styles.bannerActions}>
          <Link href="/announcements" asChild>
            <TouchableOpacity style={styles.headerBtn}>
              <Text style={styles.headerIcon}>📣</Text>
            </TouchableOpacity>
          </Link>
          <Link href="/notifications" asChild>
            <TouchableOpacity style={styles.headerBtn}>
              <Text style={styles.headerIcon}>🔔</Text>
            </TouchableOpacity>
          </Link>
          <View style={styles.liveBadge}>
            <View style={styles.liveDot} />
            <Text style={styles.liveText}>Live</Text>
          </View>
        </View>
      </View>

      {/* Acts Jump Bar */}
      <View style={styles.tabsBar}>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.tabsScroll}>
          {ACT_TABS.map((t) => {
            const active = activeTab === t.key;
            return (
              <TouchableOpacity
                key={t.key}
                style={[styles.tabBtn, active && styles.tabBtnActive]}
                onPress={() => setActiveTab(t.key)}
              >
                <Text style={[styles.tabText, active && styles.tabTextActive]}>
                  {t.label}
                </Text>
              </TouchableOpacity>
            );
          })}
        </ScrollView>
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
          <View style={{ marginBottom: Spacing.xs }}>
            <ScopeBreadcrumb trail={trail} onNavigate={navigateTo} />
            <TouchableOpacity
              style={styles.backNationalBtn}
              onPress={() => navigateTo('NATIONAL')}
            >
              <Text style={styles.backNationalText}>← Back to National (Entire Country)</Text>
            </TouchableOpacity>
          </View>
        ) : null}

        {/* Filters Panel */}
        <AnalyticsFilters
          scope={scope}
          filters={filters}
          onScope={(next) => setScope({ ...EMPTY_SCOPE, ...next })}
          onFilters={setFilters}
          busy={summary.loading}
          lockScope={lockedScope}
        />

        {summary.error ? (
          <Card style={styles.errorCard}>
            <Text style={styles.errorText}>{summary.error}</Text>
          </Card>
        ) : null}

        {/* ── ACT 1 — Standing ── */}
        {(activeTab === 'ALL' || activeTab === 'STANDING') && (
          <View style={styles.actSection}>
            <ActHeader n="1" title="Where the party stands" />
            {summary.loading && !s ? (
              <ActivityIndicator size="small" color={Colors.primary} style={{ marginVertical: 12 }} />
            ) : s && o ? (
              <View style={styles.statsGrid}>
                <StandingStat
                  value={s.membership?.total}
                  label="Total Membership"
                  sub={`${num(s.membership?.newMembers)} joined in ${windowLabel}`}
                />
                <StandingStat
                  value={o.basicUnits?.total}
                  label="Basic Units"
                  sub={`${num(o.basicUnits?.active)} working · ${num(o.basicUnits?.inactive)} silent`}
                  {...unitStat(o.basicUnits)}
                />
                <StandingStat
                  value={o.areas?.total}
                  label="Area Units"
                  sub={`${num(o.areas?.active)} working · ${num(o.areas?.inactive)} silent`}
                  {...unitStat(o.areas)}
                />
                <StandingStat
                  value={o.districts?.total}
                  label="District Units"
                  sub={`${num(o.districts?.active)} working · ${num(o.districts?.inactive)} silent`}
                  {...unitStat(o.districts)}
                />
                <StandingStat
                  value={o.provinces?.total}
                  label="Provincial Parties"
                  sub={`${num(o.provinces?.active)} working · ${num(o.provinces?.inactive)} silent`}
                  {...unitStat(o.provinces)}
                />
              </View>
            ) : null}
          </View>
        )}

        {/* ── ACT 2 — Provinces / Units Matrix ── */}
        {(activeTab === 'ALL' || activeTab === 'PROVINCES') && (
          <View style={styles.actSection}>
            <ActHeader
              n="2"
              title={`Every ${childNoun.toLowerCase()}, side by side`}
              lead="Tap any card to drill in."
              meta={org.data?.rows ? `${org.data.rows.length} ${childNoun.toLowerCase()}s` : null}
            />
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
                onDrill={drillTo}
              />
            )}
          </View>
        )}

        {/* ── ACT 3 — People (Membership) ── */}
        {(activeTab === 'ALL' || activeTab === 'PEOPLE') && (
          <View style={styles.actSection}>
            <ActHeader
              n="3"
              title="Who is joining, and who is taking part"
              meta={s ? `${num(s.membership?.newMembers)} new` : null}
            />
            <MembershipAnalytics
              params={params}
              windowLabel={windowLabel}
              byStatus={s?.membership?.byStatus}
            />
          </View>
        )}

        {/* ── ACT 4 — Work (Campaigns) ── */}
        {(activeTab === 'ALL' || activeTab === 'WORK') && (
          <View style={styles.actSection}>
            <ActHeader
              n="4"
              title="Coordination campaigns"
              meta={s ? `${num(s.campaigns?.running)} running` : null}
            />
            <CampaignsAnalytics params={params} windowLabel={windowLabel} />
          </View>
        )}

        {/* ── ACT 5 — Governance (Meetings) ── */}
        {(activeTab === 'ALL' || activeTab === 'GOVERNANCE') && (
          <View style={styles.actSection}>
            <ActHeader
              n="5"
              title="Meetings and governance"
              lead="Scheduled vs conducted by tier, body & year."
              meta={s ? `${num(s.meetings?.conducted)} of ${num(s.meetings?.total)} held` : null}
            />
            <MeetingsAnalytics params={params} windowLabel={windowLabel} />
          </View>
        )}

        {/* ── ACT 6 — Reports ── */}
        {(activeTab === 'ALL' || activeTab === 'REPORTS') && (
          <View style={styles.actSection}>
            <ActHeader
              n="6"
              title="Reports"
              meta={s ? `${num(s.reports?.outstanding)} owed` : null}
            />
            <ReportsAnalytics
              params={params}
              periodFrom={periodFrom}
              scope={scope}
            />
          </View>
        )}

        {/* ── ACT 7 — Attention (Dormant Entities) ── */}
        {(activeTab === 'ALL' || activeTab === 'ATTENTION') && (
          <View style={styles.actSection}>
            <ActHeader
              n="7"
              title="Needs attention"
              lead="Dormant units & members with officers responsible."
            />
            <View style={{ gap: Spacing.md }}>
              <InactiveUnitsTable params={params} />
              <InactiveMembersTable params={params} />
            </View>
          </View>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: Colors.background },
  scroll: { flex: 1 },
  content: { padding: Spacing.md, paddingBottom: 40 },
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
    fontSize: 10,
    color: 'rgba(255, 255, 255, 0.85)',
    marginTop: 1,
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
  tabsBar: {
    backgroundColor: '#1e293b',
    paddingVertical: 6,
  },
  tabsScroll: {
    paddingHorizontal: Spacing.md,
    gap: 6,
  },
  tabBtn: {
    paddingVertical: 4,
    paddingHorizontal: 10,
    borderRadius: Radius.pill,
    backgroundColor: '#334155',
  },
  tabBtnActive: {
    backgroundColor: Colors.accent,
  },
  tabText: {
    fontSize: 11,
    fontWeight: '600',
    color: '#cbd5e1',
  },
  tabTextActive: {
    color: '#fff',
    fontWeight: '700',
  },
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
  actSection: {
    marginBottom: Spacing.lg,
    gap: Spacing.sm,
  },
  actHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    borderBottomWidth: 2,
    borderBottomColor: Colors.border,
    paddingBottom: 6,
    marginBottom: 4,
  },
  actMarker: {
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: Colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  actMarkerText: {
    fontSize: 11,
    fontWeight: '800',
    color: '#fff',
  },
  actHeading: {
    flex: 1,
  },
  actTitle: {
    fontSize: FontSize.sm + 1,
    fontWeight: '800',
    color: Colors.text,
  },
  actLead: {
    fontSize: 10,
    color: Colors.textMuted,
  },
  actMetaBadge: {
    backgroundColor: Colors.surfaceAlt,
    paddingVertical: 2,
    paddingHorizontal: 6,
    borderRadius: Radius.sm,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  actMetaText: {
    fontSize: 10,
    fontWeight: '600',
    color: Colors.primary,
  },
  statsGrid: {
    gap: Spacing.xs,
  },
  statCard: {
    padding: Spacing.md,
  },
  statMainRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
  },
  statVal: {
    fontSize: FontSize.xl,
    fontWeight: '800',
    color: Colors.text,
    letterSpacing: -0.5,
  },
  statLabel: {
    fontSize: FontSize.xs,
    fontWeight: '700',
    color: Colors.primary,
    marginTop: 1,
  },
  statSub: {
    fontSize: 10,
    color: Colors.textMuted,
    marginTop: 2,
  },
  statGauge: {
    alignItems: 'center',
    justifyContent: 'center',
  },
});
