import { useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Platform,
  RefreshControl,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { Link, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useAuth } from '../../context/AuthContext';
import { useUnit } from '../../context/UnitContext';
import { useNetwork } from '../../context/NetworkContext';
import { useLanguage } from '../../context/LanguageContext';
import { api, errorMessage, isNetworkError } from '../../api/client';
import { useToast } from '../Toast';
import { getCache, setCache } from '../../services/offlineStorage';
import {
  isHigherAdmin,
  isPresidentPersona,
  isProvinceAdminOnly,
  isDistrictAdminOnly,
  isFinanceOnly,
  hasRole,
  roleLabel,
} from '../../utils/permissions';
import {
  SmartKpi,
  Donut,
  PctBar,
  VBars,
  AreaTrendChart,
  PieChart,
  BRAND,
} from '../charts';
import Card from '../Card';
import Badge from '../Badge';
import UnitSwitcherModal from '../UnitSwitcherModal';
import { Colors, FontSize, Radius, Spacing } from '../../constants/colors';
import { downloadAndShare } from '../../utils/export';

const getMeetingTypeLabel = (code, t) => {
  const map = {
    GBM: t('meetings.types.generalBody', 'General Body'),
    EXC: t('meetings.types.executive', 'Executive'),
    PRT: t('meetings.types.protest', 'Protest'),
    JLS: t('meetings.types.jalsa', 'Jalsa'),
    CMP: t('meetings.types.campaign', 'Campaign'),
    SEM: t('meetings.types.seminar', 'Seminar'),
    STC: t('meetings.types.studyCircle', 'Study Circle'),
    OTH: t('meetings.types.other', 'Other'),
  };
  return map[code] || code;
};

const getActivityTypeLabel = (code, t) => {
  const map = {
    PROTEST: t('activities.types.protest', 'Protest'),
    JALSA: t('activities.types.jalsa', 'Jalsa'),
    CAMPAIGN: t('activities.types.campaign', 'Campaign'),
    SEMINAR: t('activities.types.seminar', 'Seminar'),
    STUDY_CIRCLE: t('activities.types.studyCircle', 'Study Circle'),
    TASK: t('activities.types.task', 'Task'),
    COMMUNITY_SERVICE: t('activities.types.communityService', 'Community Service'),
    OTHER: t('activities.types.other', 'Other'),
  };
  return map[code] || code;
};

function formatPkr(val) {
  if (val == null) return 'Rs. 0';
  const abs = Math.abs(val);
  const sign = val < 0 ? '-' : '';
  if (abs >= 1e6) return `${sign}Rs. ${(abs / 1e6).toFixed(1)}M`;
  if (abs >= 1e3) return `${sign}Rs. ${(abs / 1e3).toFixed(1)}k`;
  return `${sign}Rs. ${abs.toLocaleString()}`;
}

function childLevelOf(parentLevel) {
  return ({ CENTRAL: 'PROVINCE', PROVINCE: 'DISTRICT', DISTRICT: 'AREA', AREA: 'BASIC_UNIT' })[parentLevel] || null;
}

export default function UnitDashboard() {
  const router = useRouter();
  const { user } = useAuth();
  const { ctx, setCtx } = useUnit();
  const { isOnline } = useNetwork();
  const toast = useToast();
  const { t, isRTL } = useLanguage();

  const [data, setData] = useState(null);
  const [subordinates, setSubordinates] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [lastRefreshed, setLastRefreshed] = useState(null);

  // Drill Path state
  const [homeCtx, setHomeCtx] = useState(null);
  const [drillPath, setDrillPath] = useState([]);

  // Unit Switcher modal
  const [switcherVisible, setSwitcherVisible] = useState(false);

  // Report Builder state
  const today = new Date();
  const ymToday = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}`;
  const [reportSubId, setReportSubId] = useState('self');
  const [reportMonth, setReportMonth] = useState(ymToday);
  const [reportPreview, setReportPreview] = useState(null);
  const [previewBusy, setPreviewBusy] = useState(false);
  const [exportBusy, setExportBusy] = useState(false);

  const fetchIdRef = useRef(0);

  // Keep track of home context
  useEffect(() => {
    if (ctx && !homeCtx && drillPath.length === 0) {
      setHomeCtx(ctx);
    }
  }, [ctx]);

  const loadData = useRef(null);
  loadData.current = async function loadData(silent = false) {
    if (!ctx?.unitLevel || !ctx?.unitId) {
      setLoading(false);
      setRefreshing(false);
      return;
    }

    const myId = ++fetchIdRef.current;

    // First load from offline cache if available
    const cacheKeyUnit = `dashboard_unit_${ctx.unitLevel}_${ctx.unitId}`;
    const cacheKeySubs = `dashboard_subordinates_${ctx.unitLevel}_${ctx.unitId}`;
    const [cachedUnit, cachedSubs] = await Promise.all([
      getCache(cacheKeyUnit),
      ctx.unitLevel !== 'BASIC_UNIT' ? getCache(cacheKeySubs) : Promise.resolve([]),
    ]);

    if (myId === fetchIdRef.current && cachedUnit) {
      setData(cachedUnit);
      if (cachedSubs) setSubordinates(cachedSubs);
      if (!silent) setLoading(false);
    } else if (!silent) {
      setLoading(true);
    }

    // IF OFFLINE: Retain cache immediately and do not fire requests to server
    if (!isOnline) {
      if (myId === fetchIdRef.current) {
        setLoading(false);
        setRefreshing(false);
        setLastRefreshed(new Date());
      }
      return;
    }

    setRefreshing(true);

    const tasks = [
      api.get('/dashboard/unit', { params: { unitLevel: ctx.unitLevel, unitId: ctx.unitId } })
        .then((r) => {
          if (myId === fetchIdRef.current && r.data?.data) {
            setData(r.data.data);
            setCache(cacheKeyUnit, r.data.data).catch(() => {});
          }
        })
        .catch((err) => {
          if (myId === fetchIdRef.current) {
            if (!isNetworkError(err) || !cachedUnit) {
              toast.error(errorMessage(err));
            }
          }
        }),
    ];

    if (ctx.unitLevel !== 'BASIC_UNIT') {
      tasks.push(
        api.get('/dashboard/subordinates', { params: { unitLevel: ctx.unitLevel, unitId: ctx.unitId } })
          .then((r) => {
            if (myId === fetchIdRef.current && r.data?.data) {
              setSubordinates(r.data.data);
              setCache(cacheKeySubs, r.data.data).catch(() => {});
            }
          })
          .catch((err) => {
            if (myId === fetchIdRef.current && !cachedSubs) {
              setSubordinates([]);
            }
          })
      );
    } else if (myId === fetchIdRef.current) {
      setSubordinates([]);
    }

    Promise.all(tasks).finally(() => {
      if (myId === fetchIdRef.current) {
        setLoading(false);
        setRefreshing(false);
        setLastRefreshed(new Date());
      }
    });
  };

  useEffect(() => {
    loadData.current(false);
  }, [ctx?.unitLevel, ctx?.unitId, isOnline]);

  // Polling: every 3 minutes, only when online and active
  useEffect(() => {
    if (!isOnline) return;
    const timer = setInterval(() => {
      if (typeof document !== 'undefined' && document.hidden) return;
      loadData.current(true);
    }, 180000);
    return () => clearInterval(timer);
  }, [ctx?.unitLevel, ctx?.unitId, isOnline]);

  function onRefresh() {
    setRefreshing(true);
    if (!isOnline) {
      loadData.current(false);
      return;
    }
    loadData.current(true);
  }

  // Drill down into a subordinate unit
  function drillIntoSubordinate(s) {
    const nextChildLevel = childLevelOf(ctx?.unitLevel);
    if (!nextChildLevel) return;

    const nextUnit = {
      unitLevel: nextChildLevel,
      unitId: s._id,
      unitName: s.name,
    };
    const nextPath = [...drillPath, nextUnit];
    setDrillPath(nextPath);
    setCtx(nextUnit);
  }

  function returnToHomeUnit() {
    setDrillPath([]);
    if (homeCtx) {
      setCtx(homeCtx);
    }
  }

  function jumpToCrumb(index) {
    if (index < 0) return returnToHomeUnit();
    const nextPath = drillPath.slice(0, index + 1);
    setDrillPath(nextPath);
    setCtx(nextPath[nextPath.length - 1]);
  }

  const isDrilledIn = drillPath.length > 0;

  // Resolve target for report generation
  function resolveReportTarget() {
    if (reportSubId === 'self') {
      return { unitLevel: ctx.unitLevel, unitId: ctx.unitId, name: ctx.unitName };
    }
    const sub = subordinates.find((s) => String(s._id) === String(reportSubId));
    if (!sub) return null;
    return { unitLevel: childLevelOf(ctx?.unitLevel), unitId: sub._id, name: sub.name, code: sub.code };
  }

  function reportRange() {
    const [y, m] = reportMonth.split('-').map(Number);
    const from = `${y}-${String(m).padStart(2, '0')}-01`;
    const lastDay = new Date(y, m, 0).getDate();
    const to = `${y}-${String(m).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`;
    return { from, to };
  }

  async function previewSubReport() {
    if (!isOnline) {
      toast.show('Offline: report preview requires an active internet connection.', 'info');
      return;
    }
    const target = resolveReportTarget();
    if (!target) {
      toast.error('Select a unit first.');
      return;
    }
    setReportPreview(null);
    setPreviewBusy(true);
    try {
      const { from, to } = reportRange();
      const params = { unitLevel: target.unitLevel, unitId: target.unitId, from, to };
      const [meetingsRes, activitiesRes, donationsRes, expensesRes, monthlyRes] = await Promise.all([
        api.get('/meetings', { params }).then((r) => r.data.data || []).catch(() => []),
        api.get('/activities', { params }).then((r) => r.data.data || []).catch(() => []),
        api.get('/finance/donations', { params }).then((r) => r.data.data || []).catch(() => []),
        api.get('/finance/expenses', { params }).then((r) => r.data.data || []).catch(() => []),
        api.get('/finance/monthly', { params }).then((r) => r.data.data || []).catch(() => []),
      ]);
      const monthBucket = monthlyRes[0] || { donations: 0, expenses: 0, transfersIn: 0, transfersOut: 0, netBalance: 0 };
      setReportPreview({
        sub: target,
        from,
        to,
        counts: {
          meetings: meetingsRes.length,
          activities: activitiesRes.length,
          donations: donationsRes.length,
          expenses: expensesRes.length,
        },
        finance: {
          donationsTotal: monthBucket.donations || 0,
          expensesTotal: monthBucket.expenses || 0,
          transfersIn: monthBucket.transfersIn || 0,
          transfersOut: monthBucket.transfersOut || 0,
          balance: monthBucket.netBalance || 0,
        },
        meetings: meetingsRes,
        activities: activitiesRes,
      });
    } catch {
      toast.error('Could not load report preview.');
    } finally {
      setPreviewBusy(false);
    }
  }

  async function downloadSubReport(kind, format) {
    if (!isOnline) {
      toast.error('Offline: report export requires an active internet connection.');
      return;
    }
    const target = resolveReportTarget();
    if (!target) {
      toast.error('Select a unit first.');
      return;
    }
    const { from, to } = reportRange();
    const filename = `${target.name.replace(/\s+/g, '_')}-${reportMonth}-${kind}.${format === 'pdf' ? 'pdf' : 'xlsx'}`;
    setExportBusy(true);
    try {
      await downloadAndShare(`/exports/unit/${kind}/${format}`, filename, {
        unitLevel: target.unitLevel,
        unitId: target.unitId,
        from,
        to,
      });
      toast.success(`${kind.toUpperCase()} report exported successfully.`);
    } catch (err) {
      toast.error(errorMessage(err) || 'Export failed.');
    } finally {
      setExportBusy(false);
    }
  }

  const childLabel = {
    AREA: 'Basic Unit',
    DISTRICT: 'Area',
    PROVINCE: 'District',
    CENTRAL: 'Province',
  }[ctx?.unitLevel] || 'Sub-Unit';

  const firstName = user?.fullName?.split(' ')[0] || 'Admin';
  const hasHigherAdminPersona = isHigherAdmin(user);
  const onlyDistrictAdmin = isDistrictAdminOnly(user);
  const onlyProvinceAdmin = isProvinceAdminOnly(user);
  const isFinanceOnlyUser = isFinanceOnly(user);
  const isPresidentPersonaUser = isPresidentPersona(user);

  const canSwitchUnits = hasHigherAdminPersona || onlyProvinceAdmin || onlyDistrictAdmin;

  if (loading && !data) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color={Colors.primary} />
        <Text style={styles.loadingText}>
          {t('dashboard.loadingUnit', 'Loading your unit…')}
        </Text>
      </View>
    );
  }

  return (
    <SafeAreaView style={styles.safe}>
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.content}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={Colors.primary} />}
      >
        {/* ─── Hero Banner ─── */}
        <View style={styles.heroBanner}>
          <View style={[styles.heroTop, isRTL && { flexDirection: 'row-reverse' }]}>
            <View style={{ flex: 1 }}>
              <View style={[styles.eyebrowRow, isRTL && { flexDirection: 'row-reverse' }]}>
                <View style={styles.eyebrowBadge}>
                  <Text style={styles.eyebrowText}>
                    {ctx?.unitLevel ? ctx.unitLevel.replace('_', ' ').toUpperCase() : 'UNIT'}
                  </Text>
                </View>
                <View style={[styles.liveBadge, !isOnline && { backgroundColor: '#fef3c7', borderColor: '#fde68a' }, isRTL && { flexDirection: 'row-reverse' }]}>
                  <View style={[styles.liveDot, refreshing && styles.liveDotPulse, !isOnline && { backgroundColor: '#d97706' }]} />
                  <Text style={[styles.liveText, !isOnline && { color: '#92400e' }]}>
                    {!isOnline
                      ? t('dashboard.offlineCached', 'Offline (Cached)')
                      : refreshing
                      ? t('dashboard.updating', 'Updating…')
                      : lastRefreshed
                      ? `${t('dashboard.live', 'Live')} · ${lastRefreshed.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`
                      : t('dashboard.live', 'Live')}
                  </Text>
                </View>
              </View>
              <Text style={[styles.heroName, isRTL && { textAlign: 'right' }]}>
                {t('dashboard.welcome', 'Welcome')}, {firstName}
              </Text>
              <Text style={[styles.heroUnit, isRTL && { textAlign: 'right' }]} numberOfLines={1}>{ctx?.unitName || 'My Unit'}</Text>
            </View>

            <View style={[styles.headerIcons, isRTL && { flexDirection: 'row-reverse' }]}>
              {canSwitchUnits && (
                <TouchableOpacity
                  style={styles.iconBtn}
                  onPress={() => setSwitcherVisible(true)}
                  title="Switch Unit Context"
                >
                  <Text style={styles.iconBtnText}>🏢</Text>
                </TouchableOpacity>
              )}
              <Link href="/announcements" asChild>
                <TouchableOpacity style={styles.iconBtn}>
                  <Text style={styles.iconBtnText}>📣</Text>
                </TouchableOpacity>
              </Link>
              <Link href="/notifications" asChild>
                <TouchableOpacity style={styles.iconBtn}>
                  <Text style={styles.iconBtnText}>🔔</Text>
                </TouchableOpacity>
              </Link>
            </View>
          </View>

          {/* Metric Chips in Hero */}
          {data && (
            <View style={[styles.heroChipsGrid, isRTL && { flexDirection: 'row-reverse' }]}>
              <View style={[styles.heroChip, isRTL && { flexDirection: 'row-reverse' }]}>
                <Text style={styles.heroChipIcon}>👥</Text>
                <View>
                  <Text style={[styles.heroChipVal, isRTL && { textAlign: 'right' }]}>{(data.members?.total ?? 0).toLocaleString()}</Text>
                  <Text style={[styles.heroChipLabel, isRTL && { textAlign: 'right' }]}>{t('dashboard.members', 'Members')}</Text>
                </View>
              </View>
              <View style={[styles.heroChip, isRTL && { flexDirection: 'row-reverse' }]}>
                <Text style={styles.heroChipIcon}>📋</Text>
                <View>
                  <Text style={[styles.heroChipVal, isRTL && { textAlign: 'right' }]}>{(data.meetings?.last30Days ?? 0).toLocaleString()}</Text>
                  <Text style={[styles.heroChipLabel, isRTL && { textAlign: 'right' }]}>{t('dashboard.meetings30', 'Meetings (30d)')}</Text>
                </View>
              </View>
              <View style={[styles.heroChip, isRTL && { flexDirection: 'row-reverse' }]}>
                <Text style={styles.heroChipIcon}>🎯</Text>
                <View>
                  <Text style={[styles.heroChipVal, isRTL && { textAlign: 'right' }]}>{(data.activities?.last30Days ?? 0).toLocaleString()}</Text>
                  <Text style={[styles.heroChipLabel, isRTL && { textAlign: 'right' }]}>{t('dashboard.activities30', 'Activities (30d)')}</Text>
                </View>
              </View>
              <View style={[styles.heroChip, isRTL && { flexDirection: 'row-reverse' }]}>
                <Text style={styles.heroChipIcon}>💰</Text>
                <View>
                  <Text style={[styles.heroChipVal, isRTL && { textAlign: 'right' }]}>{formatPkr(data.finance?.balance ?? 0)}</Text>
                  <Text style={[styles.heroChipLabel, isRTL && { textAlign: 'right' }]}>{t('dashboard.netBalance', 'Net Balance')}</Text>
                </View>
              </View>
            </View>
          )}
        </View>

        {/* ─── Breadcrumbs (when drilled into subordinate units) ─── */}
        {isDrilledIn && homeCtx && (
          <View style={styles.drillBreadcrumbs}>
            <View style={styles.drillCrumbsRow}>
              <TouchableOpacity onPress={() => jumpToCrumb(-1)}>
                <Text style={styles.drillHomeText}>🏠 {homeCtx.unitName}</Text>
              </TouchableOpacity>
              {drillPath.map((seg, i) => (
                <View key={i} style={styles.drillSeg}>
                  <Text style={styles.drillSep}>›</Text>
                  <TouchableOpacity
                    onPress={() => jumpToCrumb(i)}
                    disabled={i === drillPath.length - 1}
                  >
                    <Text
                      style={[
                        styles.drillSegText,
                        i === drillPath.length - 1 && styles.drillSegActive,
                      ]}
                    >
                      {seg.unitName}
                    </Text>
                  </TouchableOpacity>
                </View>
              ))}
            </View>
            <TouchableOpacity style={styles.returnBtn} onPress={returnToHomeUnit}>
              <Text style={styles.returnBtnText}>
                {isRTL ? `← ${t('dashboard.returnTo', 'Return to')} ${homeCtx.unitName}` : `← ${t('dashboard.returnTo', 'Return to')} ${homeCtx.unitName}`}
              </Text>
            </TouchableOpacity>
          </View>
        )}

        {/* ─── 4 Primary Smart KPI Cards ─── */}
        {data && (
          <>
            <View style={[styles.kpiRow, isRTL && { flexDirection: 'row-reverse' }]}>
              <SmartKpi
                label={t('dashboard.members', 'Members')}
                value={data.members?.active}
                icon="👥"
                iconBg="#eff6ff"
                iconColor="#1e40af"
                spark={(data.analytics?.trend || []).map((b) => b.members || 0)}
                format={(v) => `${(v ?? 0).toLocaleString()} / ${data.members?.total ?? 0}`}
                subLabel={t('dashboard.activeRoster', 'Active roster')}
              />
              <SmartKpi
                label={t('dashboard.donations', 'Donations')}
                value={data.finance?.donations}
                icon="💰"
                iconBg="#dcfce7"
                iconColor="#15803d"
                sparkColor="#15803d"
                spark={(data.analytics?.trend || []).map((b) => b.donations || 0)}
                format={(v) => formatPkr(v)}
                subLabel={t('dashboard.totalIncome', 'Total income')}
              />
            </View>
            <View style={[styles.kpiRow, isRTL && { flexDirection: 'row-reverse' }]}>
              <SmartKpi
                label={t('dashboard.expenses', 'Expenses')}
                value={data.finance?.expenses}
                icon="🧾"
                iconBg="#fee2e2"
                iconColor="#b91c1c"
                sparkColor="#b91c1c"
                spark={(data.analytics?.trend || []).map((b) => b.expenses || 0)}
                format={(v) => formatPkr(v)}
                subLabel={t('dashboard.approvedSpent', 'Approved spent')}
              />
              <SmartKpi
                label={t('dashboard.meetings30', 'Meetings (30d)')}
                value={data.meetings?.last30Days}
                icon="📅"
                iconBg="#fef3c7"
                iconColor="#b45309"
                sparkColor="#b45309"
                spark={(data.analytics?.trend || []).map((b) => b.meetings || 0)}
                format={(v) => (v ?? 0).toLocaleString()}
                subLabel={t('dashboard.last30Days', 'Last 30 days')}
              />
            </View>

            {/* ─── Secondary Cards (Pending Approvals + Net Balance) ─── */}
            <View style={styles.cardsRow}>
              {/* Pending Approvals Card */}
              <Card style={styles.secondaryCard}>
                <View style={[styles.cardHeader, isRTL && { flexDirection: 'row-reverse' }]}>
                  <View>
                    <Text style={[styles.cardTitle, isRTL && { textAlign: 'right' }]}>{t('dashboard.pendingApprovals', 'Pending Approvals')}</Text>
                    <Text style={[styles.cardSub, isRTL && { textAlign: 'right' }]}>{t('dashboard.membersAwaitingReview', 'Members awaiting review')}</Text>
                  </View>
                  <Text style={styles.metaBadge}>{data.members?.pending || 0}</Text>
                </View>
                <View style={[styles.donutRow, isRTL && { flexDirection: 'row-reverse' }]}>
                  <Donut
                    percent={data.members?.total > 0 ? Math.round(((data.members?.pending || 0) / data.members.total) * 100) : 0}
                    label={t('dashboard.pending', 'pending')}
                    size={84}
                    stroke={10}
                    color="#f59e0b"
                    trackColor="#fef3c7"
                  />
                  <View style={[styles.donutLegend, isRTL && { alignItems: 'flex-end' }]}>
                    <Text style={[styles.legendLine, isRTL && { textAlign: 'right' }]}>
                      <Text style={styles.boldText}>{data.members?.active || 0}</Text> {t('dashboard.active', 'active')}
                    </Text>
                    <Text style={[styles.legendLine, isRTL && { textAlign: 'right' }]}>
                      <Text style={[styles.boldText, { color: '#d97706' }]}>{data.members?.pending || 0}</Text> {t('dashboard.pending', 'pending')}
                    </Text>
                    <Text style={[styles.legendLine, isRTL && { textAlign: 'right' }]}>
                      <Text style={[styles.boldText, { color: Colors.textMuted }]}>{data.members?.total || 0}</Text> {t('dashboard.totalRoster', 'total roster')}
                    </Text>
                  </View>
                </View>
              </Card>

              {/* Net Balance Card */}
              <Card style={styles.secondaryCard}>
                <View style={[styles.cardHeader, isRTL && { flexDirection: 'row-reverse' }]}>
                  <View>
                    <Text style={[styles.cardTitle, isRTL && { textAlign: 'right' }]}>{t('dashboard.netBalance', 'Net Balance')}</Text>
                    <Text style={[styles.cardSub, isRTL && { textAlign: 'right' }]}>{t('dashboard.donMinusExp', 'Donations − Expenses')}</Text>
                  </View>
                  <Text style={[styles.metaBadge, { color: (data.finance?.balance || 0) < 0 ? Colors.error : Colors.success }]}>
                    {formatPkr(data.finance?.balance || 0)}
                  </Text>
                </View>
                <VBars
                  rows={[
                    { label: t('dashboard.donShort', 'Don.'), value: data.finance?.donations || 0, color: '#16a34a' },
                    { label: t('dashboard.expShort', 'Exp.'), value: data.finance?.expenses || 0, color: '#dc2626' },
                    { label: t('dashboard.balShort', 'Bal.'), value: Math.max(0, data.finance?.balance || 0), color: '#2563eb' },
                  ]}
                  height={95}
                />
              </Card>
            </View>

            {/* ─── Analytics & Performance ─── */}
            {data.analytics && (
              <>
                <Text style={[styles.sectionHeading, isRTL && { textAlign: 'right' }]}>{t('dashboard.orgAnalytics', 'Organizational Analytics')}</Text>

                {/* Meeting & Activity Breakdown VBars */}
                <View style={styles.cardsRow}>
                  <Card style={styles.secondaryCard}>
                    <View style={[styles.cardHeader, isRTL && { flexDirection: 'row-reverse' }]}>
                      <View>
                        <Text style={[styles.cardTitle, isRTL && { textAlign: 'right' }]}>{t('dashboard.meetingTypes', 'Meeting Types')}</Text>
                        <Text style={[styles.cardSub, isRTL && { textAlign: 'right' }]}>{t('dashboard.last30Days', 'Last 30 days')}</Text>
                      </View>
                      <Text style={styles.metaBadge}>{data.meetings?.last30Days || 0}</Text>
                    </View>
                    <VBars
                      rows={(data.analytics.meetingsByType || []).map((r) => ({
                        label: (getMeetingTypeLabel(r.type, t) || r.type).slice(0, 5),
                        value: r.count,
                        color: BRAND.dark,
                      }))}
                      height={95}
                      emptyLabel={t('dashboard.noMeetings30d', 'No meetings logged in 30d.')}
                    />
                  </Card>

                  <Card style={styles.secondaryCard}>
                    <View style={[styles.cardHeader, isRTL && { flexDirection: 'row-reverse' }]}>
                      <View>
                        <Text style={[styles.cardTitle, isRTL && { textAlign: 'right' }]}>{t('dashboard.activityTypes', 'Activity Types')}</Text>
                        <Text style={[styles.cardSub, isRTL && { textAlign: 'right' }]}>{t('dashboard.last30Days', 'Last 30 days')}</Text>
                      </View>
                      <Text style={styles.metaBadge}>{data.activities?.last30Days || 0}</Text>
                    </View>
                    <VBars
                      rows={(data.analytics.activitiesByType || []).map((r) => ({
                        label: (getActivityTypeLabel(r.type, t) || r.type).slice(0, 5),
                        value: r.count,
                        color: BRAND.mid,
                      }))}
                      height={95}
                      emptyLabel={t('dashboard.noActivities30d', 'No activities logged in 30d.')}
                    />
                  </Card>
                </View>

                {/* Engagement Quality Card */}
                <Card style={styles.fullCard}>
                  <View style={[styles.cardHeader, isRTL && { flexDirection: 'row-reverse' }]}>
                    <View>
                      <Text style={[styles.cardTitle, isRTL && { textAlign: 'right' }]}>{t('dashboard.engagementQuality', 'Engagement Quality')}</Text>
                      <Text style={[styles.cardSub, isRTL && { textAlign: 'right' }]}>
                        {data.analytics.quality?.finalizedTotal || 0} {t('dashboard.eventsEvaluated', 'finalized events evaluated')}
                      </Text>
                    </View>
                    <Badge label={t('dashboard.auditPassed', 'Audit Passed')} color={Colors.success} bg="#dcfce7" />
                  </View>
                  <View style={[styles.qualityContainer, isRTL && { flexDirection: 'row-reverse' }]}>
                    {(() => {
                      const q = data.analytics.quality || {};
                      const score = (q.attendanceRate != null || q.photoCoveragePct != null || q.gpsTaggedPct != null)
                        ? Math.round(((q.attendanceRate || 0) + (q.photoCoveragePct || 0) + (q.gpsTaggedPct || 0)) / 3)
                        : 0;
                      return (
                        <>
                          <View style={styles.qualityDonutBox}>
                            <Donut percent={score} label={t('dashboard.overallScore', 'overall score')} size={96} stroke={10} color={BRAND.dark} />
                          </View>
                          <View style={styles.qualityBars}>
                            <PctBar label={t('dashboard.attendanceRate', 'Attendance Rate')} value={q.attendanceRate} threshold={60} />
                            <PctBar label={t('dashboard.photoCoverage', 'Photo Coverage')} value={q.photoCoveragePct} threshold={50} />
                            <PctBar label={t('dashboard.gpsTaggedLocation', 'GPS-Tagged Location')} value={q.gpsTaggedPct} threshold={70} />
                          </View>
                        </>
                      );
                    })()}
                  </View>
                </Card>

                {/* Activity Trend (6 Months) */}
                <Card style={styles.fullCard}>
                  <View style={[styles.cardHeader, isRTL && { flexDirection: 'row-reverse' }]}>
                    <View>
                      <Text style={[styles.cardTitle, isRTL && { textAlign: 'right' }]}>{t('dashboard.activityTrend', 'Activity Trend')}</Text>
                      <Text style={[styles.cardSub, isRTL && { textAlign: 'right' }]}>{t('dashboard.past6MonthsVelocity', 'Past 6 months event velocity')}</Text>
                    </View>
                    <Text style={styles.metaBadge}>
                      {(data.analytics.trend || []).reduce((s, b) => s + (b.meetings || 0) + (b.activities || 0), 0)} {t('dashboard.total', 'total')}
                    </Text>
                  </View>
                  <AreaTrendChart trend={data.analytics.trend || []} height={120} barColor={BRAND.dark} />
                </Card>

                {/* Type Share Distribution Breakdown */}
                {((data.analytics.meetingsByType && data.analytics.meetingsByType.length > 0) ||
                  (data.analytics.activitiesByType && data.analytics.activitiesByType.length > 0)) && (
                  <View style={styles.cardsRow}>
                    {data.analytics.meetingsByType && data.analytics.meetingsByType.length > 0 && (
                      <Card style={styles.secondaryCard}>
                        <Text style={[styles.cardTitle, isRTL && { textAlign: 'right' }]}>{t('dashboard.meetingShare', 'Meeting Share')}</Text>
                        <Text style={[styles.cardSub, { marginBottom: 10 }, isRTL && { textAlign: 'right' }]}>{t('dashboard.composition30d', '30 days composition')}</Text>
                        <PieChart
                          segments={data.analytics.meetingsByType.map((r) => ({
                            label: getMeetingTypeLabel(r.type, t) || r.type,
                            value: r.count,
                          }))}
                        />
                      </Card>
                    )}
                    {data.analytics.activitiesByType && data.analytics.activitiesByType.length > 0 && (
                      <Card style={styles.secondaryCard}>
                        <Text style={[styles.cardTitle, isRTL && { textAlign: 'right' }]}>{t('dashboard.activityShare', 'Activity Share')}</Text>
                        <Text style={[styles.cardSub, { marginBottom: 10 }, isRTL && { textAlign: 'right' }]}>{t('dashboard.composition30d', '30 days composition')}</Text>
                        <PieChart
                          segments={data.analytics.activitiesByType.map((r) => ({
                            label: getActivityTypeLabel(r.type, t) || r.type,
                            value: r.count,
                          }))}
                        />
                      </Card>
                    )}
                  </View>
                )}

                {/* Campaign Performance (if present) */}
                {data.analytics.campaigns && data.analytics.campaigns.total > 0 && (
                  <Card style={styles.fullCard}>
                    <View style={[styles.cardHeader, isRTL && { flexDirection: 'row-reverse' }]}>
                      <View>
                        <Text style={[styles.cardTitle, isRTL && { textAlign: 'right' }]}>{t('dashboard.campaignPerformance', 'Campaign Performance')}</Text>
                        <Text style={[styles.cardSub, isRTL && { textAlign: 'right' }]}>
                          {data.analytics.campaigns.total} {t('dashboard.activeCampaigns', 'active campaigns')}
                        </Text>
                      </View>
                      <Badge label={t('dashboard.campaignActive', 'Campaign Active')} color="#2563eb" bg="#eff6ff" />
                    </View>
                    <View style={[styles.campaignKpiGrid, isRTL && { flexDirection: 'row-reverse' }]}>
                      <View style={styles.campKpiBox}>
                        <Text style={styles.campKpiVal}>{data.analytics.campaigns.peopleContacted?.toLocaleString() || 0}</Text>
                        <Text style={styles.campKpiLabel}>{t('dashboard.peopleContacted', 'People Contacted')}</Text>
                      </View>
                      <View style={styles.campKpiBox}>
                        <Text style={styles.campKpiVal}>{data.analytics.campaigns.householdsVisited?.toLocaleString() || 0}</Text>
                        <Text style={styles.campKpiLabel}>{t('dashboard.households', 'Households')}</Text>
                      </View>
                      <View style={styles.campKpiBox}>
                        <Text style={styles.campKpiVal}>{data.analytics.campaigns.pamphletsDistributed?.toLocaleString() || 0}</Text>
                        <Text style={styles.campKpiLabel}>{t('dashboard.pamphlets', 'Pamphlets')}</Text>
                      </View>
                      <View style={styles.campKpiBox}>
                        <Text style={styles.campKpiVal}>{data.analytics.campaigns.volunteerHours?.toLocaleString() || 0}</Text>
                        <Text style={styles.campKpiLabel}>{t('dashboard.volHours', 'Vol. Hours')}</Text>
                      </View>
                    </View>
                    <View style={styles.funnelBox}>
                      <View style={[styles.funnelHeader, isRTL && { flexDirection: 'row-reverse' }]}>
                        <Text style={styles.funnelLabel}>{t('dashboard.conversionFunnel', 'Conversion Funnel')}</Text>
                        <Text style={styles.funnelMeta}>
                          {data.analytics.campaigns.actualJoiners?.toLocaleString() || 0} / {data.analytics.campaigns.expectedJoiners?.toLocaleString() || 0}
                        </Text>
                      </View>
                      <PctBar
                        label={t('dashboard.expectedActualJoiners', 'Expected → Actual Joiners')}
                        value={data.analytics.campaigns.conversionPct}
                        threshold={70}
                      />
                    </View>
                  </Card>
                )}
              </>
            )}

            {/* ─── Subordinate Units & Hierarchical Roll-Up ─── */}
            {!isFinanceOnlyUser && data.subordinateUnits && Object.keys(data.subordinateUnits).length > 0 && (
              <Card style={styles.fullCard}>
                <View style={[styles.cardHeader, isRTL && { flexDirection: 'row-reverse' }]}>
                  <View>
                    <Text style={[styles.cardTitle, isRTL && { textAlign: 'right' }]}>{t('dashboard.subordinateUnits', 'Subordinate Units & Roll-Up')}</Text>
                    <Text style={[styles.cardSub, isRTL && { textAlign: 'right' }]}>{t('dashboard.hierarchicalBreakdown', 'Hierarchical breakdown under')} {ctx?.unitName}</Text>
                  </View>
                  <Badge label={`${ctx?.unitLevel?.replace('_', ' ')} ${t('dashboard.hierarchy', 'Hierarchy')}`} color={Colors.primary} bg="#eff6ff" />
                </View>

                {/* Aggregated Rollup Box */}
                {data.rollup && (
                  <View style={styles.rollupBox}>
                    <Text style={[styles.rollupTitle, isRTL && { textAlign: 'right' }]}>{t('dashboard.aggregatedRollup', 'AGGREGATED SUBTREE ROLL-UP')}</Text>
                    <View style={[styles.rollupGrid, isRTL && { flexDirection: 'row-reverse' }]}>
                      <View style={styles.rollupKpi}>
                        <Text style={styles.rollupKpiVal}>{data.rollup.totalUnits || 0}</Text>
                        <Text style={styles.rollupKpiLabel}>{t('dashboard.subUnits', 'Sub-Units')}</Text>
                      </View>
                      <View style={styles.rollupKpi}>
                        <Text style={[styles.rollupKpiVal, { color: Colors.success }]}>{data.rollup.totalMembers || 0}</Text>
                        <Text style={styles.rollupKpiLabel}>{t('dashboard.members', 'Members')}</Text>
                      </View>
                      <View style={styles.rollupKpi}>
                        <Text style={styles.rollupKpiVal}>{data.rollup.meetings30 || 0}</Text>
                        <Text style={styles.rollupKpiLabel}>{t('nav.meetings', 'Meetings')}</Text>
                      </View>
                      <View style={styles.rollupKpi}>
                        <Text style={styles.rollupKpiVal}>{data.rollup.activities30 || 0}</Text>
                        <Text style={styles.rollupKpiLabel}>{t('nav.activities', 'Activities')}</Text>
                      </View>
                      <View style={styles.rollupKpi}>
                        <Text style={styles.rollupKpiVal}>{formatPkr(data.rollup.donations)}</Text>
                        <Text style={styles.rollupKpiLabel}>{t('dashboard.donations', 'Donations')}</Text>
                      </View>
                      <View style={styles.rollupKpi}>
                        <Text style={styles.rollupKpiVal}>{formatPkr(data.rollup.expenses)}</Text>
                        <Text style={styles.rollupKpiLabel}>{t('dashboard.expenses', 'Expenses')}</Text>
                      </View>
                    </View>
                  </View>
                )}

                {/* Subordinate Count Badges */}
                <View style={[styles.subCountChips, isRTL && { flexDirection: 'row-reverse' }]}>
                  {Object.entries(data.subordinateUnits).map(([k, v]) => (
                    <View key={k} style={[styles.subChip, isRTL && { flexDirection: 'row-reverse' }]}>
                      <Text style={styles.subChipLabel}>
                        {k.replace(/([A-Z])/g, ' $1').replace(/^./, (s) => s.toUpperCase())}
                      </Text>
                      <Text style={styles.subChipVal}>{v}</Text>
                    </View>
                  ))}
                </View>

                {/* Subordinate Units List with Drill-Down */}
                {subordinates.length > 0 && (
                  <View style={styles.subList}>
                    <Text style={[styles.subListHeading, isRTL && { textAlign: 'right' }]}>
                      {childLabel}s {t('dashboard.directoryTap', 'Directory · Tap to drill into dashboard')}
                    </Text>
                    {subordinates.map((s) => (
                      <TouchableOpacity
                        key={s._id}
                        style={[styles.subRow, isRTL && { flexDirection: 'row-reverse' }]}
                        onPress={() => drillIntoSubordinate(s)}
                        activeOpacity={0.7}
                      >
                        <View style={[styles.subRowLeft, isRTL && { alignItems: 'flex-end' }]}>
                          <Text style={[styles.subRowName, isRTL && { textAlign: 'right' }]}>{s.name}</Text>
                          {s.code && <Text style={styles.subRowCode}>· {s.code}</Text>}
                        </View>
                        <View style={[styles.subRowStats, isRTL && { flexDirection: 'row-reverse' }]}>
                          <View style={styles.subStatItem}>
                            <Text style={styles.subStatVal}>{s.members}</Text>
                            <Text style={styles.subStatLabel}>{t('dashboard.mbrsShort', 'Mbrs')}</Text>
                          </View>
                          <View style={styles.subStatItem}>
                            <Text style={styles.subStatVal}>{s.meetings30}</Text>
                            <Text style={styles.subStatLabel}>{t('dashboard.mtgShort', 'Mtg')}</Text>
                          </View>
                          <View style={styles.subStatItem}>
                            <Text style={styles.subStatVal}>{s.activities30 ?? 0}</Text>
                            <Text style={styles.subStatLabel}>{t('dashboard.actShort', 'Act')}</Text>
                          </View>
                          <View style={styles.subStatItem}>
                            <Text style={[styles.subStatVal, { color: s.balance < 0 ? Colors.error : Colors.success }]}>
                              {formatPkr(s.balance)}
                            </Text>
                            <Text style={styles.subStatLabel}>{t('dashboard.balShort', 'Bal')}</Text>
                          </View>
                          <Text style={styles.chevron}>{isRTL ? '‹' : '›'}</Text>
                        </View>
                      </TouchableOpacity>
                    ))}
                  </View>
                )}
              </Card>
            )}

            {/* ─── Generate Subordinate Report ─── */}
            {!isFinanceOnlyUser && (!isPresidentPersonaUser || ctx?.unitLevel === 'CENTRAL') && (
              <Card style={styles.fullCard}>
                <Text style={[styles.cardTitle, isRTL && { textAlign: 'right' }]}>{t('dashboard.generateReport', 'Generate Subordinate Report')}</Text>
                <Text style={[styles.cardSub, isRTL && { textAlign: 'right' }]}>{t('dashboard.exportFilteredRecords', 'Export filtered meeting and finance records')}</Text>

                {/* Unit Selector Chips */}
                <View style={{ marginTop: 12 }}>
                  <Text style={[styles.inputLabel, isRTL && { textAlign: 'right' }]}>{t('common.select', 'SELECT UNIT')}</Text>
                  <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={[styles.unitPickerScroll, isRTL && { flexDirection: 'row-reverse' }]}>
                    <TouchableOpacity
                      style={[styles.unitPickChip, reportSubId === 'self' && styles.unitPickChipActive]}
                      onPress={() => setReportSubId('self')}
                    >
                      <Text style={[styles.unitPickText, reportSubId === 'self' && styles.unitPickTextActive]}>
                        ⭐ {ctx?.unitName} ({t('dashboard.current', 'Current')})
                      </Text>
                    </TouchableOpacity>
                    {subordinates.map((s) => (
                      <TouchableOpacity
                        key={s._id}
                        style={[styles.unitPickChip, reportSubId === s._id && styles.unitPickChipActive]}
                        onPress={() => setReportSubId(s._id)}
                      >
                        <Text style={[styles.unitPickText, reportSubId === s._id && styles.unitPickTextActive]}>
                          {s.name}
                        </Text>
                      </TouchableOpacity>
                    ))}
                  </ScrollView>
                </View>

                {/* Action buttons */}
                <View style={[styles.reportBtnRow, isRTL && { flexDirection: 'row-reverse' }]}>
                  <TouchableOpacity
                    style={[styles.previewBtn, (!isOnline || previewBusy) && { opacity: 0.6 }]}
                    onPress={previewSubReport}
                    disabled={previewBusy || !isOnline}
                  >
                    {previewBusy ? (
                      <ActivityIndicator size="small" color={Colors.primary} />
                    ) : (
                      <Text style={styles.previewBtnText}>
                        {!isOnline ? t('dashboard.offlinePreviewUnavailable', 'Offline (Preview Unavailable)') : `🔍 ${t('dashboard.previewReport', 'Preview Report')}`}
                      </Text>
                    )}
                  </TouchableOpacity>
                </View>

                {/* Export Buttons */}
                <View style={[styles.exportSection, isRTL && { flexDirection: 'row-reverse' }]}>
                  <View style={styles.exportCol}>
                    <Text style={[styles.exportLabel, isRTL && { textAlign: 'right' }]}>{t('nav.meetings', 'Meetings')} Report:</Text>
                    <View style={[styles.exportBtnGroup, isRTL && { flexDirection: 'row-reverse' }]}>
                      <TouchableOpacity
                        style={[styles.expBtn, (!isOnline || exportBusy) && { opacity: 0.5 }]}
                        onPress={() => downloadSubReport('meetings', 'pdf')}
                        disabled={exportBusy || !isOnline}
                      >
                        <Text style={styles.expBtnText}>📄 PDF</Text>
                      </TouchableOpacity>
                      <TouchableOpacity
                        style={[styles.expBtn, styles.expBtnSecondary, (!isOnline || exportBusy) && { opacity: 0.5 }]}
                        onPress={() => downloadSubReport('meetings', 'xlsx')}
                        disabled={exportBusy || !isOnline}
                      >
                        <Text style={styles.expBtnTextSecondary}>📊 Excel</Text>
                      </TouchableOpacity>
                    </View>
                  </View>

                  <View style={styles.exportCol}>
                    <Text style={[styles.exportLabel, isRTL && { textAlign: 'right' }]}>{t('nav.finance', 'Finance')} Report:</Text>
                    <View style={[styles.exportBtnGroup, isRTL && { flexDirection: 'row-reverse' }]}>
                      <TouchableOpacity
                        style={[styles.expBtn, (!isOnline || exportBusy) && { opacity: 0.5 }]}
                        onPress={() => downloadSubReport('finance', 'pdf')}
                        disabled={exportBusy || !isOnline}
                      >
                        <Text style={styles.expBtnText}>📄 PDF</Text>
                      </TouchableOpacity>
                      <TouchableOpacity
                        style={[styles.expBtn, styles.expBtnSecondary, (!isOnline || exportBusy) && { opacity: 0.5 }]}
                        onPress={() => downloadSubReport('finance', 'xlsx')}
                        disabled={exportBusy || !isOnline}
                      >
                        <Text style={styles.expBtnTextSecondary}>📊 Excel</Text>
                      </TouchableOpacity>
                    </View>
                  </View>
                </View>

                {/* Report Preview */}
                {reportPreview && (
                  <View style={styles.previewContainer}>
                    <Text style={styles.previewHeading}>
                      {reportPreview.sub.name} · {reportPreview.from} → {reportPreview.to}
                    </Text>
                    <View style={[styles.previewKpis, isRTL && { flexDirection: 'row-reverse' }]}>
                      <View style={styles.prevKpiBox}>
                        <Text style={styles.prevKpiVal}>{reportPreview.counts.meetings}</Text>
                        <Text style={styles.prevKpiLabel}>{t('nav.meetings', 'Meetings')}</Text>
                      </View>
                      <View style={styles.prevKpiBox}>
                        <Text style={styles.prevKpiVal}>{reportPreview.counts.activities}</Text>
                        <Text style={styles.prevKpiLabel}>{t('nav.activities', 'Activities')}</Text>
                      </View>
                      <View style={styles.prevKpiBox}>
                        <Text style={styles.prevKpiVal}>{formatPkr(reportPreview.finance.donationsTotal)}</Text>
                        <Text style={styles.prevKpiLabel}>{t('dashboard.donations', 'Donations')}</Text>
                      </View>
                      <View style={styles.prevKpiBox}>
                        <Text style={styles.prevKpiVal}>{formatPkr(reportPreview.finance.expensesTotal)}</Text>
                        <Text style={styles.prevKpiLabel}>{t('dashboard.expenses', 'Expenses')}</Text>
                      </View>
                      <View style={styles.prevKpiBox}>
                        <Text style={[styles.prevKpiVal, { color: reportPreview.finance.balance < 0 ? Colors.error : Colors.success }]}>
                          {formatPkr(reportPreview.finance.balance)}
                        </Text>
                        <Text style={styles.prevKpiLabel}>{t('dashboard.netBalance', 'Net Balance')}</Text>
                      </View>
                    </View>
                  </View>
                )}
              </Card>
            )}

            {/* ─── Committee / Cabinet Overview ─── */}
            {data.committee && ctx?.unitLevel !== 'BASIC_UNIT' && (
              <Card style={styles.fullCard}>
                <View style={styles.cardHeader}>
                  <View>
                    <Text style={styles.cardTitle}>{data.committee.name}</Text>
                    <Text style={styles.cardSub}>
                      {data.committee.formedAt ? t('dashboard.activeCommitteeCabinet', 'Active Committee Cabinet') : t('dashboard.pendingActivation', 'Pending Activation')}
                    </Text>
                  </View>
                  <Badge label={t('dashboard.cabinet', 'Cabinet')} color="#8b5cf6" bg="#f5f3ff" />
                </View>
                <View style={styles.rollupGrid}>
                  <View style={styles.rollupKpi}>
                    <Text style={styles.rollupKpiVal}>{data.committee.totalMembers || 0}</Text>
                    <Text style={styles.rollupKpiLabel}>{t('dashboard.totalMembers', 'Total Members')}</Text>
                  </View>
                  <View style={styles.rollupKpi}>
                    <Text style={styles.rollupKpiVal}>{data.committee.executiveCount || 0}</Text>
                    <Text style={styles.rollupKpiLabel}>{t('meetings.types.executive', 'Executive')}</Text>
                  </View>
                  <View style={styles.rollupKpi}>
                    <Text style={styles.rollupKpiVal}>{data.committee.permanentCount || 0}</Text>
                    <Text style={styles.rollupKpiLabel}>{t('dashboard.selective', 'Selective')}</Text>
                  </View>
                  <View style={styles.rollupKpi}>
                    <Text style={styles.rollupKpiVal}>{data.committee.meetings30 ?? 0}</Text>
                    <Text style={styles.rollupKpiLabel}>{t('dashboard.meetings30', 'Meetings (30d)')}</Text>
                  </View>
                </View>
                <View style={styles.commActions}>
                  <Link href="/unit/committee" asChild>
                    <TouchableOpacity style={styles.commBtn}>
                      <Text style={styles.commBtnText}>{t('dashboard.committeeRoster', 'Committee Roster')} →</Text>
                    </TouchableOpacity>
                  </Link>
                  <Link href="/meetings?body=COMMITTEE" asChild>
                    <TouchableOpacity style={styles.commBtn}>
                      <Text style={styles.commBtnText}>{t('nav.meetings', 'Meetings')} →</Text>
                    </TouchableOpacity>
                  </Link>
                  <Link href="/activities?body=COMMITTEE" asChild>
                    <TouchableOpacity style={styles.commBtn}>
                      <Text style={styles.commBtnText}>{t('nav.activities', 'Activities')} →</Text>
                    </TouchableOpacity>
                  </Link>
                  <Link href="/finance?body=COMMITTEE" asChild>
                    <TouchableOpacity style={styles.commBtn}>
                      <Text style={styles.commBtnText}>{t('nav.finance', 'Finance')} →</Text>
                    </TouchableOpacity>
                  </Link>
                </View>
              </Card>
            )}

            {/* ─── Quick Shortcuts Hub ─── */}
            <Card style={styles.fullCard}>
              <Text style={styles.cardTitle}>{t('dashboard.quickNavHub', 'Quick Navigation Hub')}</Text>
              <Text style={[styles.cardSub, { marginBottom: 12 }]}>{t('dashboard.directAccessUnitMgmt', 'Direct access to unit management')}</Text>
              <View style={styles.hubGrid}>
                <Link href="/members" asChild>
                  <TouchableOpacity style={styles.hubTile}>
                    <Text style={styles.hubIcon}>👥</Text>
                    <Text style={styles.hubText}>{t('nav.members', 'Members')}</Text>
                  </TouchableOpacity>
                </Link>
                {ctx?.unitLevel !== 'BASIC_UNIT' && (
                  <Link href="/unit/committee" asChild>
                    <TouchableOpacity style={styles.hubTile}>
                      <Text style={styles.hubIcon}>🤝</Text>
                      <Text style={styles.hubText}>{t('nav.committee', 'Committee')}</Text>
                    </TouchableOpacity>
                  </Link>
                )}
                <Link href="/meetings" asChild>
                  <TouchableOpacity style={styles.hubTile}>
                    <Text style={styles.hubIcon}>📅</Text>
                    <Text style={styles.hubText}>{t('nav.meetings', 'Meetings')}</Text>
                  </TouchableOpacity>
                </Link>
                <Link href="/activities" asChild>
                  <TouchableOpacity style={styles.hubTile}>
                    <Text style={styles.hubIcon}>🎯</Text>
                    <Text style={styles.hubText}>{t('nav.activities', 'Activities')}</Text>
                  </TouchableOpacity>
                </Link>
                <Link href="/finance" asChild>
                  <TouchableOpacity style={styles.hubTile}>
                    <Text style={styles.hubIcon}>💰</Text>
                    <Text style={styles.hubText}>{t('nav.finance', 'Finance')}</Text>
                  </TouchableOpacity>
                </Link>
                <Link href="/cabinet" asChild>
                  <TouchableOpacity style={styles.hubTile}>
                    <Text style={styles.hubIcon}>🏛️</Text>
                    <Text style={styles.hubText}>{t('nav.cabinet', 'Cabinet')}</Text>
                  </TouchableOpacity>
                </Link>
                <Link href="/admin" asChild>
                  <TouchableOpacity style={styles.hubTile}>
                    <Text style={styles.hubIcon}>⚙️</Text>
                    <Text style={styles.hubText}>{t('nav.admin', 'Admin')}</Text>
                  </TouchableOpacity>
                </Link>
              </View>
            </Card>
          </>
        )}
      </ScrollView>

      {/* Unit Switcher Modal */}
      <UnitSwitcherModal
        visible={switcherVisible}
        onClose={() => setSwitcherVisible(false)}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: Colors.background },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: Colors.background, padding: 20 },
  loadingText: { marginTop: 12, fontSize: FontSize.sm, color: Colors.textMuted, fontWeight: '600' },
  scroll: { flex: 1 },
  content: { padding: Spacing.md, paddingBottom: 40 },

  // Hero
  heroBanner: {
    backgroundColor: Colors.primary,
    borderRadius: Radius.xl,
    padding: Spacing.lg,
    marginBottom: Spacing.md,
    ...Platform.select({
      web: {
        boxShadow: '0 4px 8px rgba(30, 64, 175, 0.2)',
      },
      default: {
        shadowColor: Colors.primary,
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.2,
        shadowRadius: 8,
        elevation: 4,
      },
    }),
  },
  heroTop: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    marginBottom: Spacing.md,
  },
  eyebrowRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 6,
  },
  eyebrowBadge: {
    backgroundColor: 'rgba(255,255,255,0.2)',
    paddingVertical: 3,
    paddingHorizontal: 8,
    borderRadius: Radius.sm,
  },
  eyebrowText: {
    fontSize: 9,
    fontWeight: '800',
    color: '#fff',
    letterSpacing: 0.8,
  },
  liveBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  liveDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: '#4ade80',
  },
  liveDotPulse: {
    backgroundColor: '#facc15',
  },
  liveText: {
    fontSize: 10,
    color: 'rgba(255,255,255,0.8)',
    fontWeight: '600',
  },
  heroName: {
    fontSize: FontSize.xl,
    fontWeight: '800',
    color: '#fff',
  },
  heroUnit: {
    fontSize: FontSize.sm,
    color: 'rgba(255,255,255,0.85)',
    fontWeight: '600',
    marginTop: 2,
  },
  headerIcons: {
    flexDirection: 'row',
    gap: 6,
  },
  iconBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: 'rgba(255,255,255,0.18)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  iconBtnText: {
    fontSize: 16,
  },
  heroChipsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    borderTopWidth: 1,
    borderTopColor: 'rgba(255,255,255,0.15)',
    paddingTop: Spacing.md,
  },
  heroChip: {
    flex: 1,
    minWidth: '45%',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: 'rgba(255,255,255,0.12)',
    paddingVertical: 8,
    paddingHorizontal: 10,
    borderRadius: Radius.md,
  },
  heroChipIcon: {
    fontSize: 18,
  },
  heroChipVal: {
    fontSize: FontSize.sm,
    fontWeight: '800',
    color: '#fff',
  },
  heroChipLabel: {
    fontSize: 10,
    color: 'rgba(255,255,255,0.75)',
    fontWeight: '500',
  },

  // Drill Breadcrumbs
  drillBreadcrumbs: {
    backgroundColor: Colors.surface,
    padding: Spacing.md,
    borderRadius: Radius.lg,
    borderWidth: 1,
    borderColor: Colors.border,
    marginBottom: Spacing.md,
  },
  drillCrumbsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    gap: 6,
    marginBottom: 8,
  },
  drillHomeText: {
    fontSize: FontSize.xs,
    fontWeight: '700',
    color: Colors.primary,
  },
  drillSeg: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  drillSep: {
    fontSize: FontSize.xs,
    color: Colors.textMuted,
  },
  drillSegText: {
    fontSize: FontSize.xs,
    color: Colors.primary,
    fontWeight: '600',
  },
  drillSegActive: {
    color: Colors.text,
    fontWeight: '800',
  },
  returnBtn: {
    alignSelf: 'flex-start',
    backgroundColor: Colors.surfaceAlt,
    paddingVertical: 6,
    paddingHorizontal: 12,
    borderRadius: Radius.pill,
  },
  returnBtnText: {
    fontSize: FontSize.xs,
    color: Colors.text,
    fontWeight: '700',
  },

  // KPI Rows
  kpiRow: {
    flexDirection: 'row',
    gap: Spacing.sm,
    marginBottom: Spacing.sm,
  },

  // Cards
  cardsRow: {
    flexDirection: 'row',
    gap: Spacing.sm,
    marginBottom: Spacing.sm,
  },
  secondaryCard: {
    flex: 1,
    minWidth: '48%',
    marginBottom: 0,
    padding: Spacing.md,
  },
  fullCard: {
    marginBottom: Spacing.sm,
    padding: Spacing.md,
  },
  cardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: Spacing.sm,
  },
  cardTitle: {
    fontSize: FontSize.sm,
    fontWeight: '700',
    color: Colors.text,
  },
  cardSub: {
    fontSize: FontSize.xs - 1,
    color: Colors.textMuted,
    marginTop: 1,
  },
  metaBadge: {
    fontSize: FontSize.xs,
    fontWeight: '700',
    color: Colors.primary,
  },
  sectionHeading: {
    fontSize: FontSize.sm,
    fontWeight: '800',
    color: Colors.text,
    letterSpacing: 0.5,
    marginTop: Spacing.sm,
    marginBottom: Spacing.sm,
  },

  // Donut & Legend
  donutRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginTop: 4,
  },
  donutLegend: {
    flex: 1,
    gap: 4,
  },
  legendLine: {
    fontSize: FontSize.xs,
    color: Colors.textMuted,
  },
  boldText: {
    fontWeight: '800',
    color: Colors.text,
  },

  // Engagement Quality
  qualityContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 16,
    marginTop: 6,
  },
  qualityDonutBox: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  qualityBars: {
    flex: 1,
    gap: 4,
  },

  // Campaign Performance
  campaignKpiGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginVertical: 8,
  },
  campKpiBox: {
    flex: 1,
    minWidth: '45%',
    backgroundColor: Colors.surfaceAlt,
    padding: 8,
    borderRadius: Radius.sm,
    alignItems: 'center',
  },
  campKpiVal: {
    fontSize: FontSize.base,
    fontWeight: '800',
    color: Colors.text,
  },
  campKpiLabel: {
    fontSize: 10,
    color: Colors.textMuted,
    fontWeight: '600',
    marginTop: 2,
  },
  funnelBox: {
    marginTop: 8,
    padding: 10,
    backgroundColor: Colors.surfaceAlt,
    borderRadius: Radius.md,
  },
  funnelHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 4,
  },
  funnelLabel: {
    fontSize: FontSize.xs,
    fontWeight: '700',
    color: Colors.text,
  },
  funnelMeta: {
    fontSize: 10,
    color: Colors.textMuted,
  },

  // Rollup & Subordinates
  rollupBox: {
    backgroundColor: Colors.surfaceAlt,
    padding: 12,
    borderRadius: Radius.md,
    marginBottom: 12,
  },
  rollupTitle: {
    fontSize: 10,
    fontWeight: '800',
    color: Colors.textMuted,
    letterSpacing: 0.6,
    marginBottom: 8,
  },
  rollupGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  rollupKpi: {
    flex: 1,
    minWidth: '30%',
    alignItems: 'center',
    paddingVertical: 4,
  },
  rollupKpiVal: {
    fontSize: FontSize.sm,
    fontWeight: '800',
    color: Colors.text,
  },
  rollupKpiLabel: {
    fontSize: 9,
    color: Colors.textMuted,
    fontWeight: '600',
    marginTop: 2,
  },
  subCountChips: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginBottom: 12,
  },
  subChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: Colors.surfaceAlt,
    paddingVertical: 6,
    paddingHorizontal: 10,
    borderRadius: Radius.pill,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  subChipLabel: {
    fontSize: FontSize.xs,
    color: Colors.textMuted,
    fontWeight: '600',
  },
  subChipVal: {
    fontSize: FontSize.xs,
    fontWeight: '800',
    color: Colors.primary,
  },
  subList: {
    borderTopWidth: 1,
    borderTopColor: Colors.border,
    paddingTop: 12,
    gap: 8,
  },
  subListHeading: {
    fontSize: FontSize.xs,
    fontWeight: '700',
    color: Colors.textMuted,
    marginBottom: 4,
  },
  subRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 10,
    paddingHorizontal: 12,
    backgroundColor: Colors.surfaceAlt,
    borderRadius: Radius.md,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  subRowLeft: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  subRowName: {
    fontSize: FontSize.sm,
    fontWeight: '700',
    color: Colors.text,
  },
  subRowCode: {
    fontSize: FontSize.xs,
    color: Colors.textMuted,
  },
  subRowStats: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  subStatItem: {
    alignItems: 'flex-end',
  },
  subStatVal: {
    fontSize: FontSize.xs,
    fontWeight: '700',
    color: Colors.text,
  },
  subStatLabel: {
    fontSize: 8,
    color: Colors.textMuted,
    fontWeight: '600',
  },
  chevron: {
    fontSize: 16,
    color: Colors.textMuted,
    fontWeight: '800',
    marginLeft: 4,
  },

  // Subordinate Reports
  inputLabel: {
    fontSize: 10,
    fontWeight: '700',
    color: Colors.textMuted,
    marginBottom: 6,
    letterSpacing: 0.6,
  },
  unitPickerScroll: {
    gap: 6,
    paddingVertical: 4,
  },
  unitPickChip: {
    paddingVertical: 6,
    paddingHorizontal: 12,
    borderRadius: Radius.pill,
    backgroundColor: Colors.surfaceAlt,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  unitPickChipActive: {
    backgroundColor: Colors.primary,
    borderColor: Colors.primary,
  },
  unitPickText: {
    fontSize: FontSize.xs,
    fontWeight: '600',
    color: Colors.text,
  },
  unitPickTextActive: {
    color: '#fff',
  },
  reportBtnRow: {
    marginTop: 12,
  },
  previewBtn: {
    backgroundColor: Colors.surfaceAlt,
    paddingVertical: 10,
    borderRadius: Radius.md,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: Colors.border,
  },
  previewBtnText: {
    fontSize: FontSize.sm,
    fontWeight: '700',
    color: Colors.primary,
  },
  exportSection: {
    flexDirection: 'row',
    gap: 12,
    marginTop: 12,
  },
  exportCol: {
    flex: 1,
    gap: 6,
  },
  exportLabel: {
    fontSize: 10,
    fontWeight: '700',
    color: Colors.textMuted,
  },
  exportBtnGroup: {
    flexDirection: 'row',
    gap: 6,
  },
  expBtn: {
    flex: 1,
    backgroundColor: Colors.primary,
    paddingVertical: 8,
    borderRadius: Radius.sm,
    alignItems: 'center',
  },
  expBtnSecondary: {
    backgroundColor: Colors.surfaceAlt,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  expBtnText: {
    color: '#fff',
    fontSize: FontSize.xs,
    fontWeight: '700',
  },
  expBtnTextSecondary: {
    color: Colors.text,
    fontSize: FontSize.xs,
    fontWeight: '700',
  },

  // Preview Box
  previewContainer: {
    marginTop: 14,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: Colors.border,
  },
  previewHeading: {
    fontSize: FontSize.xs,
    fontWeight: '800',
    color: Colors.text,
    marginBottom: 8,
  },
  previewKpis: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
  },
  prevKpiBox: {
    flex: 1,
    minWidth: '30%',
    backgroundColor: Colors.surfaceAlt,
    padding: 6,
    borderRadius: Radius.sm,
    alignItems: 'center',
  },
  prevKpiVal: {
    fontSize: FontSize.xs,
    fontWeight: '800',
    color: Colors.text,
  },
  prevKpiLabel: {
    fontSize: 8,
    color: Colors.textMuted,
    fontWeight: '600',
    marginTop: 2,
  },

  // Committee
  commActions: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginTop: 12,
    borderTopWidth: 1,
    borderTopColor: Colors.border,
    paddingTop: 10,
  },
  commBtn: {
    backgroundColor: Colors.surfaceAlt,
    paddingVertical: 6,
    paddingHorizontal: 10,
    borderRadius: Radius.sm,
  },
  commBtnText: {
    fontSize: FontSize.xs,
    fontWeight: '600',
    color: Colors.primary,
  },

  // Hub Grid
  hubGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  hubTile: {
    flex: 1,
    minWidth: '30%',
    backgroundColor: Colors.surfaceAlt,
    padding: Spacing.md,
    borderRadius: Radius.md,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: Colors.border,
  },
  hubIcon: {
    fontSize: 22,
    marginBottom: 4,
  },
  hubText: {
    fontSize: FontSize.xs,
    fontWeight: '700',
    color: Colors.text,
  },
});
