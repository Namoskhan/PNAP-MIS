import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Platform,
  RefreshControl,
  SafeAreaView,
  ScrollView,
  Share,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { api } from '../api/client';
import { useAuth } from '../context/AuthContext';
import { useLanguage } from '../context/LanguageContext';
import useAnalytics from '../hooks/useAnalytics';
import { Colors, FontSize, Radius, Spacing } from '../constants/colors';
import Card from './Card';
import Badge from './Badge';
import EmptyState from './EmptyState';

// Dashboard Components
import ScopeBreadcrumb from './dashboard/ScopeBreadcrumb';
import AnalyticsFilters from './dashboard/AnalyticsFilters';
import ProvinceMatrix from './dashboard/ProvinceMatrix';
import MembershipAnalytics from './dashboard/MembershipAnalytics';
import CampaignsAnalytics from './dashboard/CampaignsAnalytics';
import MeetingsAnalytics from './dashboard/MeetingsAnalytics';
import ReportsAnalytics from './dashboard/ReportsAnalytics';
import { InactiveUnitsTable } from './dashboard/InactiveTables';
import ExecutivePulse from './dashboard/ExecutivePulse';
import ExecutiveQuickActions from './dashboard/ExecutiveQuickActions';
import CategoryPills from './dashboard/CategoryPills';

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
 * Minimalist, Clean Unit Tier Card
 */
function UnitTierCard({ title, active = 0, total = 0, onPress }) {
  const { isRTL } = useLanguage();
  const p = total > 0 ? Math.round((active / total) * 100) : 0;
  const isGood = p >= 50;

  return (
    <TouchableOpacity
      style={styles.unitTierCard}
      activeOpacity={onPress ? 0.75 : 1}
      onPress={onPress}
      disabled={!onPress}
    >
      <View style={[styles.unitTierTop, isRTL && { flexDirection: 'row-reverse' }]}>
        <Text style={[styles.unitTierTitle, isRTL && { textAlign: 'right' }]} numberOfLines={1}>
          {title}
        </Text>

        <View
          style={[
            styles.unitTierBadge,
            { backgroundColor: isGood ? 'rgba(22, 163, 74, 0.12)' : 'rgba(217, 119, 6, 0.12)' },
          ]}
        >
          <Text style={[styles.unitTierBadgeText, { color: isGood ? Colors.success : Colors.warning }]}>
            {total > 0 ? `${p}%` : '0%'}
          </Text>
        </View>
      </View>

      <View style={[styles.unitTierNumberRow, isRTL && { flexDirection: 'row-reverse' }]}>
        <Text style={styles.unitTierActive}>{num(active)}</Text>
        <Text style={styles.unitTierTotal}> / {num(total)}</Text>
      </View>

      <View style={styles.unitProgressBar}>
        <View
          style={[
            styles.unitProgressFill,
            {
              width: `${Math.min(100, Math.max(0, p))}%`,
              backgroundColor: isGood ? Colors.success : Colors.warning,
            },
          ]}
        />
      </View>
    </TouchableOpacity>
  );
}

/**
 * Clean Section Card (Without verbose descriptions)
 */
function SectionCard({
  icon,
  title,
  meta,
  onLayout,
  children,
}) {
  const { isRTL } = useLanguage();
  return (
    <View style={styles.sectionContainer} onLayout={onLayout}>
      <View style={[styles.sectionHeader, isRTL && { flexDirection: 'row-reverse' }]}>
        <View style={[styles.sectionHeaderLeft, isRTL && { flexDirection: 'row-reverse' }]}>
          <View style={styles.sectionIconBadge}>
            {typeof icon === 'string' ? (
              <Text style={styles.sectionIconText}>{icon}</Text>
            ) : (
              icon
            )}
          </View>
          <Text style={[styles.sectionTitle, isRTL && { textAlign: 'right' }]} numberOfLines={1}>
            {title}
          </Text>
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
  const router = useRouter();
  const { user } = useAuth();
  const { t, isRTL } = useLanguage();
  const isSuper = user?.roles?.includes('SUPER_ADMIN');
  const scrollViewRef = useRef(null);
  const categoryPillsY = useRef(0);
  const sectionPositions = useRef({});
  const [pendingScrollTarget, setPendingScrollTarget] = useState(null);

  const triggerScroll = useCallback((targetY) => {
    const finalY = Math.max(0, targetY - 10);
    scrollViewRef.current?.scrollTo({ y: finalY, animated: true });
    setPendingScrollTarget(null);
  }, []);

  const handleNavClick = useCallback((category, targetSection) => {
    setActiveCategory(category);
    setPendingScrollTarget({ targetSection, time: Date.now() });

    // Fallback timer if onLayout does not re-fire or section is already mounted
    setTimeout(() => {
      let targetY = sectionPositions.current[targetSection];
      if (targetY == null) {
        targetY = categoryPillsY.current ? categoryPillsY.current : 460;
      }
      scrollViewRef.current?.scrollTo({ y: Math.max(0, targetY - 10), animated: true });
      setPendingScrollTarget(null);
    }, 120);
  }, []);

  const initialScope = useMemo(() => {
    if (!accessScope?.level || !accessScope?.unitId) return EMPTY_SCOPE;
    return { ...EMPTY_SCOPE, [DRILL_KEY[accessScope.level]]: accessScope.unitId };
  }, [accessScope]);

  const [scope, setScope] = useState(initialScope);
  const [filters, setFilters] = useState({ days: 365, memberStatus: '', orgStatus: '' });
  const [showFilters, setShowFilters] = useState(false);
  const [activeCategory, setActiveCategory] = useState('all');
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

  const [pendingApprovals, setPendingApprovals] = useState(0);

  const loadPendingApprovals = useCallback(async () => {
    try {
      const r = await api.get('/roles', { params: { state: 'PROPOSED' } });
      setPendingApprovals(r.data?.data?.length || 0);
    } catch {
      // silent
    }
  }, []);

  useEffect(() => {
    loadPendingApprovals();
  }, [loadPendingApprovals]);

  async function onRefresh() {
    setRefreshing(true);
    await Promise.all([
      summary.reload(true),
      scopeInfo.reload(true),
      org.reload(true),
      loadPendingApprovals(),
    ]);
    setRefreshing(false);
  }

  if (!isSuperOrCentral) {
    return (
      <SafeAreaView style={styles.safe}>
        <EmptyState
          icon="shield-outline"
          title={t('common.error', 'Access Denied')}
          subtitle={t('nav.noAccess', 'You do not have permission to view the Command Center.')}
        />
      </SafeAreaView>
    );
  }

  const s = summary.data;
  const o = s?.organization;
  const isCentralDashboard = !accessScope?.unitId;
  const trail = isCentralDashboard
    ? scopeInfo.data?.trail?.filter((item) => item.level !== 'NATIONAL')
    : scopeInfo.data?.trail;
  const scopeName = trail?.length ? trail[trail.length - 1].name : t('commandCenter.theWholeCountry', 'All Pakistan');
  const windowLabel = filters.days === 365 ? '1 Year' : `${filters.days} Days`;
  const childNoun = LEVEL_NOUN[org.data?.level] || t('profile.province', 'Province');

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

  const handleShareBriefing = useCallback(async () => {
    const orgData = summary.data?.organization;
    const memData = summary.data?.membership;
    const mtgData = summary.data?.meetings;
    const scopeLabel = scopeName === t('commandCenter.theWholeCountry', 'All Pakistan') ? 'National' : scopeName;
    const today = new Date().toLocaleDateString();

    const textLines = [
      `🇵🇰 PNAP Executive Briefing — ${scopeLabel}`,
      `📅 Date: ${today}`,
      `════════════════════════════════`,
      `👥 Total Members: ${(memData?.total ?? 0).toLocaleString()}`,
      memData?.newMembers ? `✨ New: +${(memData.newMembers).toLocaleString()}` : null,
      `════════════════════════════════`,
      `🏢 Units Activity:`,
      orgData?.provinces ? `• Provinces: ${orgData.provinces.active} / ${orgData.provinces.total}` : null,
      orgData?.districts ? `• Districts: ${orgData.districts.active} / ${orgData.districts.total}` : null,
      orgData?.areas ? `• Areas: ${orgData.areas.active} / ${orgData.areas.total}` : null,
      orgData?.basicUnits ? `• Basic Units: ${orgData.basicUnits.active} / ${orgData.basicUnits.total}` : null,
      `════════════════════════════════`,
      mtgData ? `📅 Meetings: ${mtgData.conducted ?? 0} / ${mtgData.total ?? 0}` : null,
      pendingApprovals > 0 ? `⏳ Pending Approvals: ${pendingApprovals}` : null,
      `════════════════════════════════`,
      `PNAP MIS Command Center`,
    ].filter(Boolean).join('\n');

    try {
      await Share.share({
        message: textLines,
        title: 'PNAP Executive Briefing',
      });
    } catch {
      // dismissed
    }
  }, [summary.data, scopeName, pendingApprovals, t]);

  return (
    <SafeAreaView style={styles.safe}>
      {/* ── MASTHEAD ── */}
      <View style={styles.masthead}>
        <View style={[styles.mastheadTopRow, isRTL && { flexDirection: 'row-reverse' }]}>
          <View style={[styles.mastheadTag, isRTL && { flexDirection: 'row-reverse' }]}>
            <Ionicons name="shield-checkmark" size={13} color="#60a5fa" />
            <Text style={styles.mastheadTagText}>
              {t('commandCenter.executiveHeaderTag', 'COMMAND CENTER').toUpperCase()}
            </Text>
          </View>

          <View style={[styles.mastheadLiveRow, isRTL && { flexDirection: 'row-reverse' }]}>
            <View style={styles.livePulseDot} />
            <Text style={styles.livePulseText}>{t('dashboard.live', 'LIVE')}</Text>
          </View>
        </View>

        <View style={[styles.mastheadMainRow, isRTL && { flexDirection: 'row-reverse' }]}>
          <Text style={[styles.mastheadScopeName, isRTL && { textAlign: 'right' }]} numberOfLines={1}>
            {scopeName === t('commandCenter.theWholeCountry', 'All Pakistan') ? t('commandCenter.title', 'National Overview') : scopeName}
          </Text>

          {/* 1-Tap Share Button */}
          <TouchableOpacity
            style={styles.mastheadShareBtn}
            activeOpacity={0.8}
            onPress={handleShareBriefing}
          >
            <Ionicons name="share-social-outline" size={14} color="#ffffff" />
            <Text style={styles.mastheadShareText}>{t('commandCenter.shareBrief', 'Share')}</Text>
          </TouchableOpacity>
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
        {/* Scope Breadcrumb */}
        {scope.provinceId && !lockedScope ? (
          <View style={{ marginBottom: Spacing.sm }}>
            {(!isCentralDashboard || trail?.length > 0) ? (
              <ScopeBreadcrumb trail={trail} onNavigate={navigateTo} />
            ) : null}
            <TouchableOpacity
              style={styles.backNationalBtn}
              onPress={() => navigateTo('NATIONAL')}
            >
              <View style={[styles.backRow, isRTL && { flexDirection: 'row-reverse' }]}>
                <Ionicons name={isRTL ? 'arrow-forward' : 'arrow-back'} size={13} color={Colors.primary} />
                <Text style={styles.backNationalText}>
                  {t('commandCenter.backToProvinces', 'All Provinces')}
                </Text>
              </View>
            </TouchableOpacity>
          </View>
        ) : null}

        {/* ── 1-TAP PERIOD STRIP ── */}
        <View style={[styles.quickFilterBar, isRTL && { flexDirection: 'row-reverse' }]}>
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={[styles.quickFilterScroll, isRTL && { flexDirection: 'row-reverse' }]}
          >
            {[
              { label: '1 Year', days: 365 },
              { label: '90 Days', days: 90 },
              { label: '30 Days', days: 30 },
            ].map((p) => {
              const active = filters.days === p.days;
              return (
                <TouchableOpacity
                  key={p.days}
                  style={[styles.periodChip, active && styles.periodChipActive]}
                  activeOpacity={0.7}
                  onPress={() => setFilters((f) => ({ ...f, days: p.days }))}
                >
                  <View style={styles.chipRow}>
                    <Ionicons
                      name="time-outline"
                      size={12}
                      color={active ? '#ffffff' : '#64748b'}
                    />
                    <Text style={[styles.periodChipText, active && styles.periodChipTextActive]}>
                      {p.label}
                    </Text>
                  </View>
                </TouchableOpacity>
              );
            })}

            {/* Scope pill indicator */}
            <View style={styles.scopeIndicatorChip}>
              <View style={styles.chipRow}>
                <Ionicons name="location-outline" size={12} color="#0f172a" />
                <Text style={styles.scopeIndicatorText} numberOfLines={1}>
                  {scope.provinceId ? scopeName : t('commandCenter.allProvinces', 'All Provinces')}
                </Text>
              </View>
            </View>

            {/* Reset button if filtered */}
            {isFiltered && (
              <TouchableOpacity
                style={styles.resetFilterChip}
                onPress={() => {
                  if (!lockedScope) setScope(EMPTY_SCOPE);
                  setFilters({ days: 365, memberStatus: '', orgStatus: '' });
                }}
              >
                <View style={styles.chipRow}>
                  <Ionicons name="refresh-outline" size={12} color="#b91c1c" />
                  <Text style={styles.resetFilterText}>{t('commandCenter.reset', 'Reset')}</Text>
                </View>
              </TouchableOpacity>
            )}

            {/* Filter settings toggle */}
            <TouchableOpacity
              style={[styles.moreFilterBtn, showFilters && styles.moreFilterBtnActive]}
              onPress={() => setShowFilters((v) => !v)}
            >
              <View style={styles.chipRow}>
                <Ionicons
                  name={showFilters ? 'close-outline' : 'options-outline'}
                  size={13}
                  color={showFilters ? '#0f172a' : '#334155'}
                />
                <Text style={[styles.moreFilterText, showFilters && styles.moreFilterTextActive]}>
                  {showFilters ? t('commandCenter.hideFilters', 'Close') : t('commandCenter.filter', 'Filter')}
                </Text>
              </View>
            </TouchableOpacity>
          </ScrollView>
        </View>

        {/* Expandable Filter Panel */}
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

        {/* ── BENTO GRID HERO: Executive Pulse ── */}
        <ExecutivePulse
          summary={summary.data}
          scopeName={scopeName}
          windowLabel={windowLabel}
          pendingApprovals={pendingApprovals}
          isRTL={isRTL}
          t={t}
          onPressMembers={() => handleNavClick('members', 'members')}
          onPressUnits={() => handleNavClick('units', 'units')}
          onPressGovernance={() => handleNavClick('governance', 'meetings')}
          onPressAlerts={() => handleNavClick('alerts', 'alerts')}
        />

        {/* ── QUICK SPEED DIAL ── */}
        <ExecutiveQuickActions
          pendingApprovals={pendingApprovals}
          onShareBriefing={handleShareBriefing}
          isRTL={isRTL}
          t={t}
        />

        {/* ── CATEGORY NAVIGATION PILLS ── */}
        <View
          onLayout={(e) => {
            categoryPillsY.current = e.nativeEvent.layout.y;
          }}
        >
          <CategoryPills
            activeTab={activeCategory}
            onSelectTab={setActiveCategory}
            counts={{
              units: (o?.provinces?.active || 0) + (o?.districts?.active || 0) + (o?.areas?.active || 0) + (o?.basicUnits?.active || 0) || null,
              members: s?.membership?.total ? num(s.membership.total) : null,
              meetings: s?.meetings?.conducted ? num(s.meetings.conducted) : null,
              alerts: (pendingApprovals || 0) + (s?.reports?.outstanding || 0) || null,
            }}
            isRTL={isRTL}
            t={t}
          />
        </View>

        {/* ── SECTION 1: Field Units ── */}
        {(activeCategory === 'all' || activeCategory === 'units') && (
          <SectionCard
            icon={<Ionicons name="business-outline" size={17} color={Colors.primary} />}
            title={activeCategory === 'units' ? t('profile.unitTiers', 'Units & Branches') : t('dashboard.membersAndUnits', 'Units Overview')}
            onLayout={(e) => {
              sectionPositions.current['units'] = e.nativeEvent.layout.y;
              if (pendingScrollTarget?.targetSection === 'units') {
                triggerScroll(e.nativeEvent.layout.y);
              }
            }}
          >
            {summary.loading && !s ? (
              <ActivityIndicator size="small" color={Colors.primary} style={{ marginVertical: 12 }} />
            ) : s && o ? (
              <View style={{ gap: Spacing.sm }}>
                <View style={[styles.tierGridRow, isRTL && { flexDirection: 'row-reverse' }]}>
                  <UnitTierCard
                    title={t('profile.province', 'Provinces')}
                    active={o.provinces?.active}
                    total={o.provinces?.total}
                    onPress={() => setActiveCategory('units')}
                  />
                  <UnitTierCard
                    title={t('profile.district', 'Districts')}
                    active={o.districts?.active}
                    total={o.districts?.total}
                    onPress={() => setActiveCategory('units')}
                  />
                </View>

                <View style={[styles.tierGridRow, isRTL && { flexDirection: 'row-reverse' }]}>
                  <UnitTierCard
                    title={t('profile.area', 'Areas / Tehsils')}
                    active={o.areas?.active}
                    total={o.areas?.total}
                    onPress={() => setActiveCategory('units')}
                  />
                  <UnitTierCard
                    title={t('profile.basicUnit', 'Basic Units')}
                    active={o.basicUnits?.active}
                    total={o.basicUnits?.total}
                    onPress={() => setActiveCategory('units')}
                  />
                </View>
              </View>
            ) : null}
          </SectionCard>
        )}

        {/* ── SECTION 2: Territorial Comparison ── */}
        {(activeCategory === 'all' || activeCategory === 'units') && (
          <SectionCard
            icon={<Ionicons name="map-outline" size={17} color={Colors.primary} />}
            title={t('comparison', 'comparison')}
            meta={org.data?.rows ? `${org.data.rows.length}` : null}
            onLayout={(e) => {
              sectionPositions.current['comparison'] = e.nativeEvent.layout.y;
              if (pendingScrollTarget?.targetSection === 'comparison') {
                triggerScroll(e.nativeEvent.layout.y);
              }
            }}
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
        )}

        {/* ── SECTION 3: Membership Trends ── */}
        {(activeCategory === 'all' || activeCategory === 'members') && (
          <SectionCard
            icon={<Ionicons name="people-outline" size={17} color={Colors.primary} />}
            title={t('dashboard.newAndActiveMembers', 'Membership')}
            meta={s ? `+${num(s.membership?.newMembers)}` : null}
            onLayout={(e) => {
              sectionPositions.current['members'] = e.nativeEvent.layout.y;
              if (pendingScrollTarget?.targetSection === 'members') {
                triggerScroll(e.nativeEvent.layout.y);
              }
            }}
          >
            <MembershipAnalytics
              params={params}
              windowLabel={windowLabel}
              byStatus={s?.membership?.byStatus}
            />
          </SectionCard>
        )}

        {/* ── SECTION 4: Field Campaigns ── */}
        {(activeCategory === 'all' || activeCategory === 'governance') && (
          <SectionCard
            icon={<Ionicons name="megaphone-outline" size={17} color={Colors.primary} />}
            title={t('dashboard.campaigns', 'Campaigns')}
            meta={s ? `${num(s.campaigns?.running)} active` : null}
            onLayout={(e) => {
              sectionPositions.current['campaigns'] = e.nativeEvent.layout.y;
              if (pendingScrollTarget?.targetSection === 'campaigns') {
                triggerScroll(e.nativeEvent.layout.y);
              }
            }}
          >
            <CampaignsAnalytics params={params} windowLabel={windowLabel} showResults={!isSuper} />
          </SectionCard>
        )}

        {/* ── SECTION 5: Governance & Meetings ── */}
        {(activeCategory === 'all' || activeCategory === 'governance') && (
          <SectionCard
            icon={<Ionicons name="calendar-outline" size={17} color={Colors.primary} />}
            title={t('nav.meetings', 'Meetings')}
            meta={s ? `${num(s.meetings?.conducted)} / ${num(s.meetings?.total)}` : null}
            onLayout={(e) => {
              sectionPositions.current['meetings'] = e.nativeEvent.layout.y;
              if (pendingScrollTarget?.targetSection === 'meetings') {
                triggerScroll(e.nativeEvent.layout.y);
              }
            }}
          >
            <MeetingsAnalytics params={params} windowLabel={windowLabel} />
          </SectionCard>
        )}

        {/* ── SECTION 6: Periodic Reports ── */}
        {(activeCategory === 'all' || activeCategory === 'governance') && (
          <SectionCard
            icon={<Ionicons name="document-text-outline" size={17} color={Colors.primary} />}
            title={t('nav.reports', 'Reports')}
            meta={s ? `${num(s.reports?.outstanding)} pending` : null}
            onLayout={(e) => {
              sectionPositions.current['reports'] = e.nativeEvent.layout.y;
              if (pendingScrollTarget?.targetSection === 'reports') {
                triggerScroll(e.nativeEvent.layout.y);
              }
            }}
          >
            <ReportsAnalytics
              params={params}
              periodFrom={periodFrom}
              scope={scope}
              accessScope={accessScope}
            />
          </SectionCard>
        )}

        {/* ── SECTION 7: Needs Attention ── */}
        {(activeCategory === 'all' || activeCategory === 'alerts') && (
          <SectionCard
            icon={<Ionicons name="alert-circle-outline" size={18} color="#d97706" />}
            title={t('dashboard.needsAttention', 'Needs Attention')}
            meta={pendingApprovals > 0 ? `${pendingApprovals} pending` : null}
            onLayout={(e) => {
              sectionPositions.current['alerts'] = e.nativeEvent.layout.y;
              if (pendingScrollTarget?.targetSection === 'alerts') {
                triggerScroll(e.nativeEvent.layout.y);
              }
            }}
          >
            <View style={{ gap: Spacing.sm }}>
              {pendingApprovals > 0 && (
                <View style={[styles.priorityAlertCard, isRTL && { flexDirection: 'row-reverse' }]}>
                  <View style={styles.priorityAlertBadge}>
                    <Ionicons name="hourglass-outline" size={18} color="#d97706" />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={[styles.priorityAlertTitle, isRTL && { textAlign: 'right' }]}>
                      {pendingApprovals} {t('nav.pendingRoleApprovals', 'Role Approvals Pending')}
                    </Text>
                    <TouchableOpacity
                      style={styles.priorityAlertBtn}
                      activeOpacity={0.8}
                      onPress={() => router.push('/admin/pending-approvals')}
                    >
                      <View style={styles.btnRow}>
                        <Ionicons name="flash-outline" size={13} color="#ffffff" />
                        <Text style={styles.priorityAlertBtnText}>
                          {t('common.review', 'Review Now')}
                        </Text>
                        <Ionicons name={isRTL ? 'chevron-back' : 'chevron-forward'} size={13} color="#ffffff" />
                      </View>
                    </TouchableOpacity>
                  </View>
                </View>
              )}
              <InactiveUnitsTable params={params} />
            </View>
          </SectionCard>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: {
    flex: 1,
    backgroundColor: '#f8fafc',
  },
  scroll: {
    flex: 1,
  },
  content: {
    padding: Spacing.md || 14,
    paddingBottom: 60,
  },

  // ── MASTHEAD ──
  masthead: {
    backgroundColor: '#0f172a',
    paddingHorizontal: Spacing.md || 16,
    paddingTop: 12,
    paddingBottom: 14,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255, 255, 255, 0.08)',
  },
  mastheadTopRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 6,
  },
  mastheadTag: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
  },
  mastheadTagText: {
    fontSize: 10,
    fontWeight: '800',
    color: '#94a3b8',
    letterSpacing: 1.2,
  },
  mastheadLiveRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    backgroundColor: 'rgba(34, 197, 94, 0.15)',
    paddingHorizontal: 7,
    paddingVertical: 2,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: 'rgba(34, 197, 94, 0.3)',
  },
  livePulseDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: '#4ade80',
  },
  livePulseText: {
    fontSize: 9,
    fontWeight: '800',
    color: '#4ade80',
  },
  mastheadMainRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
  },
  mastheadScopeName: {
    fontSize: 19,
    fontWeight: '900',
    color: '#ffffff',
    letterSpacing: -0.3,
    flex: 1,
  },
  mastheadShareBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: 'rgba(255, 255, 255, 0.12)',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.2)',
  },
  mastheadShareText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#ffffff',
  },

  // ── PERIOD STRIP ──
  quickFilterBar: {
    marginBottom: Spacing.sm + 2,
  },
  quickFilterScroll: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingVertical: 2,
  },
  chipRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  periodChip: {
    backgroundColor: '#ffffff',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: '#e2e8f0',
  },
  periodChipActive: {
    backgroundColor: '#1e40af',
    borderColor: '#1e40af',
  },
  periodChipText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#475569',
  },
  periodChipTextActive: {
    color: '#ffffff',
  },
  scopeIndicatorChip: {
    backgroundColor: '#ffffff',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: '#e2e8f0',
  },
  scopeIndicatorText: {
    fontSize: 11,
    fontWeight: '600',
    color: '#0f172a',
  },
  resetFilterChip: {
    backgroundColor: '#fee2e2',
    paddingHorizontal: 8,
    paddingVertical: 6,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: '#fca5a5',
  },
  resetFilterText: {
    fontSize: 11,
    fontWeight: '800',
    color: '#b91c1c',
  },
  moreFilterBtn: {
    backgroundColor: '#ffffff',
    paddingHorizontal: 9,
    paddingVertical: 6,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: '#e2e8f0',
  },
  moreFilterBtnActive: {
    backgroundColor: '#f1f5f9',
    borderColor: '#94a3b8',
  },
  moreFilterText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#334155',
  },
  moreFilterTextActive: {
    color: '#0f172a',
  },

  // ── Breadcrumb ──
  backNationalBtn: {
    backgroundColor: '#eff6ff',
    paddingVertical: 6,
    paddingHorizontal: 10,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#bfdbfe',
    alignSelf: 'flex-start',
    marginBottom: Spacing.xs,
  },
  backRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  backNationalText: {
    fontSize: 11,
    fontWeight: '700',
    color: Colors.primary,
  },

  // ── SECTION CARD ──
  sectionContainer: {
    backgroundColor: '#ffffff',
    borderRadius: Radius.lg || 16,
    borderWidth: 1,
    borderColor: 'rgba(226, 232, 240, 0.9)',
    marginBottom: Spacing.md || 14,
    overflow: 'hidden',
    ...Platform.select({
      web: {
        boxShadow: '0 2px 8px rgba(15, 23, 42, 0.03)',
      },
      default: {
        shadowColor: '#0f172a',
        shadowOffset: { width: 0, height: 1 },
        shadowOpacity: 0.04,
        shadowRadius: 4,
        elevation: 1,
      },
    }),
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: Spacing.md || 14,
    paddingVertical: 12,
    backgroundColor: '#f8fafc',
    borderBottomWidth: 1,
    borderBottomColor: '#f1f5f9',
  },
  sectionHeaderLeft: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  sectionIconBadge: {
    width: 30,
    height: 30,
    borderRadius: 8,
    backgroundColor: '#ffffff',
    borderWidth: 1,
    borderColor: '#e2e8f0',
    alignItems: 'center',
    justifyContent: 'center',
  },
  sectionIconText: {
    fontSize: 15,
  },
  sectionTitle: {
    fontSize: 13,
    fontWeight: '800',
    color: '#0f172a',
  },
  sectionMetaBadge: {
    backgroundColor: '#ffffff',
    paddingVertical: 2,
    paddingHorizontal: 7,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#e2e8f0',
    marginLeft: 6,
  },
  sectionMetaText: {
    fontSize: 10,
    fontWeight: '700',
    color: Colors.primary,
  },
  sectionBody: {
    padding: Spacing.md || 14,
    backgroundColor: '#ffffff',
  },

  // ── 2x2 UNIT TIER CARDS ──
  tierGridRow: {
    flexDirection: 'row',
    gap: 8,
  },
  unitTierCard: {
    flex: 1,
    backgroundColor: '#f8fafc',
    borderRadius: 12,
    padding: 10,
    borderWidth: 1,
    borderColor: '#e2e8f0',
  },
  unitTierTop: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 4,
  },
  unitTierTitle: {
    fontSize: 11,
    fontWeight: '800',
    color: '#0f172a',
    marginRight: 4,
    flex: 1,
  },
  unitTierBadge: {
    paddingHorizontal: 5,
    paddingVertical: 1,
    borderRadius: 8,
  },
  unitTierBadgeText: {
    fontSize: 9,
    fontWeight: '800',
  },
  unitTierNumberRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
    marginBottom: 5,
  },
  unitTierActive: {
    fontSize: 16,
    fontWeight: '900',
    color: '#0f172a',
  },
  unitTierTotal: {
    fontSize: 10,
    color: '#64748b',
    fontWeight: '600',
  },
  unitProgressBar: {
    height: 4,
    backgroundColor: '#e2e8f0',
    borderRadius: 2,
    overflow: 'hidden',
  },
  unitProgressFill: {
    height: '100%',
    borderRadius: 2,
  },

  // ── PRIORITY APPROVALS ALERT CARD ──
  priorityAlertCard: {
    backgroundColor: '#fffbeb',
    borderRadius: 12,
    borderWidth: 1.5,
    borderColor: '#fde68a',
    padding: 12,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginBottom: 6,
  },
  priorityAlertBadge: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: '#fef3c7',
    alignItems: 'center',
    justifyContent: 'center',
  },
  priorityAlertTitle: {
    fontSize: 12,
    fontWeight: '800',
    color: '#92400e',
    marginBottom: 6,
  },
  priorityAlertBtn: {
    backgroundColor: '#d97706',
    borderRadius: 8,
    paddingVertical: 5,
    paddingHorizontal: 10,
    alignSelf: 'flex-start',
  },
  btnRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  priorityAlertBtnText: {
    fontSize: 10,
    fontWeight: '800',
    color: '#ffffff',
  },

  // ── ERRORS ──
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
