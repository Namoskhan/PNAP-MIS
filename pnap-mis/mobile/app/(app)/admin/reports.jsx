import { useEffect, useState, useMemo } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Modal,
  Platform,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { useLocalSearchParams } from 'expo-router';
import { useAuth } from '../../../src/context/AuthContext';
import { useUnit } from '../../../src/context/UnitContext';
import { useLanguage } from '../../../src/context/LanguageContext';
import { canManageFinance, isHigherAdmin, isAreaAdmin, hasRole } from '../../../src/utils/permissions';
import { api, errorMessage } from '../../../src/api/client';
import { useNetwork } from '../../../src/context/NetworkContext';
import { Colors, FontSize, Spacing, Radius } from '../../../src/constants/colors';
import Card from '../../../src/components/Card';
import DatePicker from '../../../src/components/DatePicker';
import Avatar from '../../../src/components/Avatar';
import Badge from '../../../src/components/Badge';
import UnitSwitcherModal from '../../../src/components/UnitSwitcherModal';
import { PKR } from '../../../src/utils/formatters';
import { downloadAndShare } from '../../../src/utils/export';
import { Ionicons } from '@expo/vector-icons';

const COMMITTEE_TIER_LABELS = {
  PROVINCE: 'Sobayi',
  DISTRICT: 'Zilla',
  AREA: 'Elaqai',
  CENTRAL: 'Central Committee',
  BASIC_UNIT: 'Basic Unit',
};

export default function ReportsScreen() {
  const { user } = useAuth();
  const { ctx, provinces, setCtx } = useUnit();
  const { t, isRTL } = useLanguage();
  const params = useLocalSearchParams();

  const queryBody = params.body || '';
  const isCongressView = queryBody === 'CONGRESS';
  const isJirgaView = queryBody === 'JIRGA';
  const isCommitteeView = queryBody === 'COMMITTEE';

  const [unitSwitcherVisible, setUnitSwitcherVisible] = useState(false);

  // Derive active unit from route params OR context directly
  const activeLevel = params.unitLevel || ctx?.unitLevel || 'CENTRAL';
  const activeUnitId = params.unitId || ctx?.unitId || '';

  const activeUnitName = useMemo(() => {
    if (activeLevel === 'CENTRAL') return 'PKNAP Central';
    return ctx?.unitName || activeLevel;
  }, [activeLevel, ctx?.unitName]);

  const [resolvedUnitId, setResolvedUnitId] = useState(activeUnitId);

  useEffect(() => {
    if (activeLevel === 'CENTRAL' && (!activeUnitId || activeUnitId === 'CENTRAL')) {
      api.get('/org/central').then((r) => {
        if (r.data?.data?._id) setResolvedUnitId(r.data.data._id);
      }).catch(() => {});
    } else {
      setResolvedUnitId(activeUnitId);
    }
  }, [activeUnitId, activeLevel]);

  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [scope, setScope] = useState('subtree');
  const [members, setMembers] = useState([]);
  const [memberId, setMemberId] = useState('');
  const [memberModalOpen, setMemberModalOpen] = useState(false);
  const [memberSearch, setMemberSearch] = useState('');

  const [busyKey, setBusyKey] = useState(null);
  const [error, setError] = useState('');
  const [report, setReport] = useState(null);
  const [reportLoading, setReportLoading] = useState(false);

  // Quick date presets
  function applyDatePreset(preset) {
    const now = new Date();
    if (preset === 'THIS_MONTH') {
      const start = new Date(now.getFullYear(), now.getMonth(), 1);
      const end = new Date(now.getFullYear(), now.getMonth() + 1, 0);
      setFrom(start.toISOString().split('T')[0]);
      setTo(end.toISOString().split('T')[0]);
    } else if (preset === 'LAST_MONTH') {
      const start = new Date(now.getFullYear(), now.getMonth() - 1, 1);
      const end = new Date(now.getFullYear(), now.getMonth(), 0);
      setFrom(start.toISOString().split('T')[0]);
      setTo(end.toISOString().split('T')[0]);
    } else if (preset === '30_DAYS') {
      const start = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
      setFrom(start.toISOString().split('T')[0]);
      setTo(now.toISOString().split('T')[0]);
    } else if (preset === 'YTD') {
      const start = new Date(now.getFullYear(), 0, 1);
      setFrom(start.toISOString().split('T')[0]);
      setTo(now.toISOString().split('T')[0]);
    } else if (preset === 'CLEAR') {
      setFrom('');
      setTo('');
    }
  }

  // Fetch eligible members
  useEffect(() => {
    if (!resolvedUnitId || resolvedUnitId === 'CENTRAL') return;
    setMemberId('');
    setReport(null);
    const bodyTarget = isCongressView ? 'CONGRESS' : (isJirgaView ? 'JIRGA' : (isCommitteeView ? 'COMMITTEE' : 'GENERAL_BODY'));
    
    api.get('/meetings/eligible-attendees', {
      params: { unitLevel: activeLevel, unitId: resolvedUnitId, body: bodyTarget },
    })
      .then((r) => setMembers(r.data.data || []))
      .catch(() => {
        const p = { status: 'ACTIVE', limit: 500 };
        if (activeLevel === 'BASIC_UNIT') p.basicUnitId = resolvedUnitId;
        else if (activeLevel === 'AREA') p.areaId = resolvedUnitId;
        else if (activeLevel === 'DISTRICT') p.districtId = resolvedUnitId;
        else if (activeLevel === 'PROVINCE') p.provinceId = resolvedUnitId;
        else if (activeLevel === 'CENTRAL') p.scope = 'all';
        api.get('/members', { params: p }).then((r) => setMembers(r.data.data || [])).catch(() => {});
      });
  }, [activeLevel, resolvedUnitId, isCommitteeView, isJirgaView, isCongressView]);

  const { isOnline } = useNetwork();

  // Fetch live member report preview
  useEffect(() => {
    if (!memberId) {
      setReport(null);
      return;
    }
    if (!isOnline) {
      setReport(null);
      setReportLoading(false);
      return;
    }
    setReportLoading(true);
    setError('');
    const p = {};
    if (from) p.from = from;
    if (to) p.to = to;
    api.get(`/performance/member/${memberId}`, { params: p })
      .then((r) => setReport(r.data.data))
      .catch((e) => {
        setReport(null);
        setError(errorMessage(e));
      })
      .finally(() => setReportLoading(false));
  }, [memberId, from, to, isOnline]);

  function getUnitParams(kind) {
    const p = { unitLevel: activeLevel, unitId: resolvedUnitId || (activeLevel === 'CENTRAL' ? 'CENTRAL' : activeUnitId) };
    if (from) p.from = from;
    if (to) p.to = to;
    if (activeLevel === 'BASIC_UNIT') {
      p.scope = 'own';
    } else if (!isCongressView && scope) {
      p.scope = scope;
    }
    if (isCongressView) {
      p.body = 'CONGRESS';
      p.scope = 'own';
    } else if (isJirgaView) {
      p.body = 'JIRGA';
    } else if (isCommitteeView) {
      p.body = 'COMMITTEE';
    } else {
      if (kind === 'meetings') {
        p.body = 'NON_COMMITTEE';
      } else if (kind === 'finance') {
        p.body = 'EXECUTIVE';
      }
    }
    return p;
  }

  async function handleDownloadUnit(kind, format) {
    if (!isOnline) {
      setError(t('reports.offlineMsg', 'Report generation and exports require an active internet connection.'));
      return;
    }
    setError('');
    const busyId = `${kind}-${format}`;
    setBusyKey(busyId);
    try {
      const qParams = getUnitParams(kind);
      const bodySuffix = isCongressView ? '-congress' : (isJirgaView ? '-jirga' : (isCommitteeView ? '-committee' : (kind === 'finance' ? '-executive' : '')));
      const scopeSuffix = (activeLevel !== 'BASIC_UNIT' && !isCongressView && scope === 'subtree') ? '-aggregated' : '';
      const safeUnit = (activeUnitName || activeLevel).replace(/[^a-zA-Z0-9_-]/g, '_');
      const filename = `${activeLevel}-${safeUnit}-${kind}${bodySuffix}${scopeSuffix}.${format}`;

      await downloadAndShare(`/exports/unit/${kind}/${format}`, filename, qParams);
    } catch (e) {
      setError(t('reports.exportFailed', 'Export failed: {{msg}}', { msg: e.message || 'unknown' }));
    } finally {
      setBusyKey(null);
    }
  }

  async function handleDownloadMember(format) {
    if (!memberId) return;
    if (!isOnline) {
      setError(t('reports.offlineMsg', 'Report generation and exports require an active internet connection.'));
      return;
    }
    setError('');
    const busyId = `member-${format}`;
    setBusyKey(busyId);
    try {
      const p = {};
      if (from) p.from = from;
      if (to) p.to = to;
      const mem = members.find((m) => String(m._id) === String(memberId));
      const safeMember = (mem?.fullName || memberId).replace(/[^a-zA-Z0-9_-]/g, '_');
      const filename = `member-${safeMember}-performance.${format}`;
      await downloadAndShare(`/exports/member/${memberId}/${format}`, filename, p);
    } catch (e) {
      setError(t('reports.exportFailed', 'Export failed: {{msg}}', { msg: e.message || 'unknown' }));
    } finally {
      setBusyKey(null);
    }
  }

  const committeeTier = COMMITTEE_TIER_LABELS[activeLevel] || activeLevel;
  const committeeTierFormatted = committeeTier
    ? (committeeTier.toLowerCase().endsWith('committee') ? committeeTier : `${committeeTier} Committee`)
    : 'Committee';
  const jirgaTier = activeLevel === 'CENTRAL' ? 'Qomi Jirga' : 'Sobayi Jirga';
  const unitDisplayName = activeUnitName;

  const scopeDescription = isCongressView ? (
    t('reports.nationalCongressAssemblyRecords', 'National Congress Assembly Records (Central)')
  ) : (isJirgaView ? (
    scope === 'subtree' ? t('reports.aggregatedJirgaReport', 'Aggregated {{tier}} Report (Including all subordinate tiers)', { tier: jirgaTier }) : t('reports.directJirgaRecordsOnly', '{{tier}} Direct Records Only', { tier: jirgaTier })
  ) : (isCommitteeView ? {
    BASIC_UNIT: t('reports.basicUnitDirect', 'Basic Unit Level (Direct unit records)'),
    AREA: scope === 'subtree' ? t('reports.aggElaqai', 'Aggregated Elaqai Committee Report (Roll-up of all subordinate Basic Units + Elaqai Committee activities)') : t('reports.directElaqai', 'Elaqai Committee Level Only (Records authored directly at Elaqai)'),
    DISTRICT: scope === 'subtree' ? t('reports.aggZilla', 'Aggregated Zilla Committee Report (Roll-up of all subordinate Elaqai Committees & Basic Units + Zilla Committee activities)') : t('reports.directZilla', 'Zilla Committee Level Only (Records authored directly at Zilla)'),
    PROVINCE: scope === 'subtree' ? t('reports.aggSobayi', 'Aggregated Sobayi Committee Report (Roll-up of all subordinate Zilla, Elaqai Committees & Basic Units + Sobayi Committee activities)') : t('reports.directSobayi', 'Sobayi Committee Level Only (Records authored directly at Sobayi)'),
    CENTRAL: scope === 'subtree' ? t('reports.aggCentral', 'Aggregated Central Committee Report (Nationwide roll-up across all subordinate Sobayi, Zilla, and Elaqai Committees)') : t('reports.directCentral', 'Central Committee Level Only (Records authored directly at Central)'),
  }[activeLevel] || '' : {
    BASIC_UNIT: t('reports.basicUnitDirect', 'Basic Unit Level (Direct unit records)'),
    AREA: scope === 'subtree' ? t('reports.aggArea', 'Aggregated Area Report (Roll-up of all subordinate Basic Units + Area activities)') : t('reports.directArea', 'Area Level Only (Records authored directly at Area)'),
    DISTRICT: scope === 'subtree' ? t('reports.aggDistrict', 'Aggregated District Report (Roll-up of all subordinate Areas & Basic Units + District activities)') : t('reports.directDistrict', 'District Level Only (Records authored directly at District)'),
    PROVINCE: scope === 'subtree' ? t('reports.aggProvince', 'Aggregated Province Report (Roll-up of all subordinate Districts, Areas & Basic Units + Province activities)') : t('reports.directProvince', 'Province Level Only (Records authored directly at Province)'),
    CENTRAL: scope === 'subtree' ? t('reports.aggOrgCentral', 'Aggregated Central Report (Nationwide roll-up across all subordinate tiers)') : t('reports.directOrgCentral', 'Central Level Only (Records authored directly at Central)'),
  }[activeLevel] || ''));

  const pageTitle = isCongressView
    ? t('reports.nationalCongressTitle', 'National Congress Reports · PKNAP Central')
    : (isJirgaView
      ? `${jirgaTier} ${t('reports.reports', 'Reports')} · ${unitDisplayName}`
      : (isCommitteeView
        ? `${committeeTierFormatted} ${t('reports.reports', 'Reports')} · ${unitDisplayName}`
        : `${t('reports.reports', 'Reports')} · ${unitDisplayName}`));

  const meetingsReportTitle = isCongressView
    ? t('reports.congressMeetingsReport', 'National Congress Meetings & Activities Report')
    : (isJirgaView
      ? `${jirgaTier} ${t('reports.meetingsAndActivitiesReport', 'Meetings & Activities Report')}`
      : (isCommitteeView
        ? `${committeeTierFormatted} ${t('reports.meetingsAndActivitiesReport', 'Meetings & Activities Report')}`
        : t('reports.meetingsAndActivitiesReport', 'Meetings & Activities Report')));

  const meetingsDesc = isCongressView
    ? t('reports.congressMeetingsDesc', 'National Congress meetings (with embedded photos), congress activities, and responsibilities.')
    : (isCommitteeView
      ? t('reports.committeeMeetingsDesc', 'Committee meetings (with embedded photos), committee activities, and committee responsibilities.')
      : t('reports.executiveMeetingsDesc', 'Executive & General Body meetings (with embedded photos), executive activities, and responsibilities.'));

  const financeReportTitle = isCongressView
    ? t('reports.congressFinanceReport', 'National Congress Finance Report')
    : (isJirgaView
      ? `${jirgaTier} ${t('reports.financeReport', 'Finance Report')}`
      : (isCommitteeView
        ? `${committeeTierFormatted} ${t('reports.financeReport', 'Finance Report')}`
        : t('reports.financeReport', 'Finance Report')));

  const financeDesc = isCongressView
    ? t('reports.congressFinanceDesc', 'National Congress donations ledger, expenses ledger, and congress net balance for the period.')
    : (isCommitteeView
      ? t('reports.committeeFinanceDesc', 'Committee donations ledger, expenses ledger, and the committee net balance for the period.')
      : t('reports.executiveFinanceDesc', 'Executive donations ledger, expenses ledger, and the executive net balance for the period.'));

  const memberReportTitle = isCongressView
    ? t('reports.congressMemberPerfTitle', 'Congress Member Performance Report')
    : (isCommitteeView
      ? t('reports.committeeMemberPerfTitle', 'Committee Member Performance Report')
      : t('reports.memberPerformanceTitle', 'Individual Performance Report'));

  const memberDesc = isCongressView
    ? t('reports.congressMemberPerfDesc', 'Performance scorecard and attendance report for National Congress members.')
    : (isCommitteeView
      ? t('reports.committeeMemberPerfDesc', 'Performance scorecard and attendance report for committee members.')
      : t('reports.executiveMemberPerfDesc', 'Performance scorecard and attendance report for executive committee and subordinate members.'));

  const selectedMember = members.find((m) => m._id === memberId);
  const filteredMembers = members.filter((m) => {
    if (!memberSearch) return true;
    const s = memberSearch.toLowerCase();
    return (
      (m.fullName && m.fullName.toLowerCase().includes(s)) ||
      (m.memberId && m.memberId.toLowerCase().includes(s)) ||
      (m.cnic && m.cnic.includes(s)) ||
      (m.roleText && m.roleText.toLowerCase().includes(s))
    );
  });

  // If user opened Congress stream but is below Central tier, show guidance card
  if (isCongressView && activeLevel !== 'CENTRAL') {
    return (
      <SafeAreaView style={styles.safe}>
        <ScrollView contentContainerStyle={styles.content}>
          <View style={styles.guidanceCard}>
            <View style={styles.guidanceIconBox}>
              <Ionicons name="people-outline" size={40} color={Colors.primary} />
            </View>
            <Text style={[styles.guidanceTitle, isRTL && { textAlign: 'center' }]}>{t('congress.centralOnlyTitle', 'National Congress operates exclusively at the Central Level')}</Text>
            <Text style={[styles.guidanceText, isRTL && { textAlign: 'center' }]}>
              {t('congress.centralOnlyText', 'Under the PKNAP constitution, the National Congress (قومي کانګرس) is the supreme representative assembly operating at the Central tier. Lower tiers operate via Sobayi Jirga (Province) and Zilla & Elaqayi Committees (District & Area).')}
            </Text>

            <View style={styles.guidanceBtnCol}>
              <TouchableOpacity
                style={[styles.guidanceBtnPrimary, isRTL && { flexDirection: 'row-reverse' }]}
                onPress={() => {
                  setCtx({ unitLevel: 'CENTRAL', unitId: 'CENTRAL', unitName: 'PKNAP Central' });
                }}
              >
                <Ionicons name="globe-outline" size={18} color="#fff" style={isRTL ? { marginLeft: 6 } : { marginRight: 6 }} />
                <Text style={styles.guidanceBtnPrimaryText}>{t('congress.switchToCentral', 'Switch to Central Unit Context →')}</Text>
              </TouchableOpacity>
            </View>
          </View>
        </ScrollView>
      </SafeAreaView>
    );
  }

  // If user opened Jirga stream but is below Province tier, show guidance card
  if (isJirgaView && activeLevel !== 'CENTRAL' && activeLevel !== 'PROVINCE') {
    return (
      <SafeAreaView style={styles.safe}>
        <ScrollView contentContainerStyle={styles.content}>
          <View style={styles.guidanceCard}>
            <View style={styles.guidanceIconBox}>
              <Ionicons name="people-outline" size={40} color={Colors.primary} />
            </View>
            <Text style={[styles.guidanceTitle, isRTL && { textAlign: 'center' }]}>{t('activities.jirgaProvincialOnlyTitle', 'Jirga is only available at Provincial and Central tiers')}</Text>
            <Text style={[styles.guidanceText, isRTL && { textAlign: 'center' }]}>
              {t('activities.jirgaProvincialOnlyText', 'Under the party constitution, the Sobayi Jirga (صوبايي جرګه) operates at the Province level, and the Qomi Jirga / National Jirga (قومي جرګه) operates at the Central level. District and Area units operate via Zilla & Elaqayi Committees.')}
            </Text>

            <View style={styles.guidanceBtnCol}>
              {isHigherAdmin(user) && (
                <TouchableOpacity
                  style={[styles.guidanceBtnPrimary, isRTL && { flexDirection: 'row-reverse' }]}
                  onPress={() => {
                    setCtx({ unitLevel: 'CENTRAL', unitId: 'CENTRAL', unitName: 'PKNAP Central' });
                  }}
                >
                  <Ionicons name="globe-outline" size={18} color="#fff" style={isRTL ? { marginLeft: 6 } : { marginRight: 6 }} />
                  <Text style={styles.guidanceBtnPrimaryText}>{t('activities.openQomiJirga', 'Open Qomi Jirga (Central)')}</Text>
                </TouchableOpacity>
              )}

              {user?.scope?.provinceId && (
                <TouchableOpacity
                  style={[styles.guidanceBtnSecondary, isRTL && { flexDirection: 'row-reverse' }]}
                  onPress={() => {
                    setCtx({ unitLevel: 'PROVINCE', unitId: user.scope.provinceId, unitName: user.scope.provinceName || 'Province' });
                  }}
                >
                  <Ionicons name="location-outline" size={18} color={Colors.primary} style={isRTL ? { marginLeft: 6 } : { marginRight: 6 }} />
                  <Text style={styles.guidanceBtnSecondaryText}>{t('activities.openMySobayiJirga', 'Open My Sobayi Jirga')}</Text>
                </TouchableOpacity>
              )}

              {isHigherAdmin(user) && provinces && provinces.length > 0 && (
                <View style={{ marginTop: 12 }}>
                  <Text style={[styles.guidanceSubHead, isRTL && { textAlign: 'right' }]}>{t('activities.orSwitchProvincialJirga', 'OR SWITCH TO PROVINCIAL SOBAYI JIRGA:')}</Text>
                  <View style={styles.provGrid}>
                    {provinces.map((prov) => (
                      <TouchableOpacity
                        key={prov._id}
                        style={styles.provPillBtn}
                        onPress={() => setCtx({ unitLevel: 'PROVINCE', unitId: prov._id, unitName: prov.name })}
                      >
                        <Text style={styles.provPillBtnText}>{prov.name} {t('finance.sobayiJirga', 'Sobayi Jirga')} →</Text>
                      </TouchableOpacity>
                    ))}
                  </View>
                </View>
              )}
            </View>
          </View>
        </ScrollView>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.safe}>
      <ScrollView contentContainerStyle={styles.content}>
        {/* Header Banner */}
        <View style={styles.header}>
          <View style={[{ flexDirection: 'row', alignItems: 'center', gap: 6, flexWrap: 'wrap' }, isRTL && { flexDirection: 'row-reverse' }]}>
            <Text style={[styles.pageTitle, isRTL && { textAlign: 'right' }]}>{pageTitle}</Text>
            {!isOnline && (
              <View style={{ backgroundColor: '#FEE2E2', borderColor: '#FCA5A5', borderWidth: 1, borderRadius: 12, paddingHorizontal: 8, paddingVertical: 2 }}>
                <Text style={{ fontSize: 11, fontWeight: '700', color: '#DC2626' }}>{t('common.offlineMode', 'Offline Mode')}</Text>
              </View>
            )}
          </View>
        </View>

        {!isOnline && (
          <View style={[{ backgroundColor: '#FEF2F2', borderColor: '#FECACA', borderWidth: 1, borderRadius: 8, padding: 12, marginBottom: Spacing.md, flexDirection: 'row', alignItems: 'center', gap: 8 }, isRTL && { flexDirection: 'row-reverse' }]}>
            <Ionicons name="cloud-offline-outline" size={20} color="#DC2626" />
            <Text style={[{ color: '#991B1B', fontSize: 13, flex: 1, lineHeight: 18 }, isRTL && { textAlign: 'right' }]}>
              {t('reports.offlineMsg', 'You are currently offline. Report compilation, real-time analytics, and PDF/Excel downloads are disabled until network connectivity is restored.')}
            </Text>
          </View>
        )}

        {/* Unit Context Card */}
        {!isCongressView && (
          <Card style={[styles.card, styles.unitContextCard]}>
            <View style={[styles.unitContextRow, isRTL && { flexDirection: 'row-reverse' }]}>
              <View style={styles.unitContextIconBox}>
                <Ionicons name="business" size={20} color={Colors.primary} />
              </View>
              <View style={[{ flex: 1 }, isRTL && { alignItems: 'flex-end' }]}>
                <Text style={[styles.unitContextLabel, isRTL && { textAlign: 'right' }]}>{t('reports.activeReportingUnit', 'ACTIVE REPORTING UNIT')}</Text>
                <Text style={[styles.unitContextName, isRTL && { textAlign: 'right' }]}>{activeUnitName}</Text>
                <Text style={[styles.unitContextTier, isRTL && { textAlign: 'right' }]}>{t('reports.tierSuffix', '{{tier}} TIER', { tier: t('units.' + activeLevel.toLowerCase(), activeLevel.replace('_', ' ')) })}</Text>
              </View>
              <TouchableOpacity
                style={[styles.switchUnitBtn, isRTL && { flexDirection: 'row-reverse' }]}
                onPress={() => setUnitSwitcherVisible(true)}
              >
                <Ionicons name="swap-horizontal" size={16} color={Colors.primary} style={{ marginHorizontal: 4 }} />
                <Text style={styles.switchUnitBtnText}>{t('reports.switch', 'Switch')}</Text>
              </TouchableOpacity>
            </View>
          </Card>
        )}

        {error ? <Text style={[styles.errorText, isRTL && { textAlign: 'right' }]}>{error}</Text> : null}

        {/* Scope & Period Filter Card */}
        <Card style={styles.card}>
          <Text style={[styles.cardTitle, isRTL && { textAlign: 'right' }]}>{t('reports.scopeAndPeriodFilter', 'Report Scope & Period Filter')}</Text>
          
          {activeLevel !== 'BASIC_UNIT' && !isCongressView ? (
            <View style={{ marginBottom: Spacing.md }}>
              <Text style={[styles.label, isRTL && { textAlign: 'right' }]}>{t('reports.dataAggregationScope', 'Data Aggregation Scope')}</Text>
              <View style={[styles.scopeTabs, isRTL && { flexDirection: 'row-reverse' }]}>
                <TouchableOpacity 
                  style={[styles.scopeTab, scope === 'subtree' && styles.scopeTabActive]}
                  onPress={() => setScope('subtree')}
                >
                  <Text style={[styles.scopeTabText, scope === 'subtree' && styles.scopeTabTextActive]}>
                    {t('reports.aggregatedRollup', 'Aggregated (Include all subordinate units roll-up)')}
                  </Text>
                </TouchableOpacity>
                <TouchableOpacity 
                  style={[styles.scopeTab, scope === 'own' && styles.scopeTabActive]}
                  onPress={() => setScope('own')}
                >
                  <Text style={[styles.scopeTabText, scope === 'own' && styles.scopeTabTextActive]}>
                    {t('reports.thisUnitTierOnly', 'This unit tier only')}
                  </Text>
                </TouchableOpacity>
              </View>
            </View>
          ) : null}

          {/* Date Presets */}
          <View style={{ marginBottom: Spacing.sm }}>
            <Text style={[styles.label, isRTL && { textAlign: 'right' }]}>{t('reports.quickDateRange', 'Quick Date Range')}</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={[styles.presetScroll, isRTL && { flexDirection: 'row-reverse' }]}>
              <TouchableOpacity style={styles.presetBtn} onPress={() => applyDatePreset('THIS_MONTH')}>
                <Text style={styles.presetBtnText}>{t('reports.thisMonth', 'This Month')}</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.presetBtn} onPress={() => applyDatePreset('LAST_MONTH')}>
                <Text style={styles.presetBtnText}>{t('reports.lastMonth', 'Last Month')}</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.presetBtn} onPress={() => applyDatePreset('30_DAYS')}>
                <Text style={styles.presetBtnText}>{t('reports.last30Days', 'Last 30 Days')}</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.presetBtn} onPress={() => applyDatePreset('YTD')}>
                <Text style={styles.presetBtnText}>{t('reports.ytd', 'Year to Date')}</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[styles.presetBtn, { backgroundColor: '#fee2e2' }]} onPress={() => applyDatePreset('CLEAR')}>
                <Text style={[styles.presetBtnText, { color: Colors.error }]}>{t('common.clear', 'Clear')}</Text>
              </TouchableOpacity>
            </ScrollView>
          </View>

          <View style={[styles.dateRow, isRTL && { flexDirection: 'row-reverse' }]}>
            <View style={styles.dateField}>
              <DatePicker
                label={t('reports.fromDate', 'From Date')}
                value={from}
                onChange={setFrom}
                placeholder={t('reports.startDate', 'Start Date')}
              />
            </View>
            <View style={styles.dateField}>
              <DatePicker
                label={t('reports.toDate', 'To Date')}
                value={to}
                onChange={setTo}
                placeholder={t('reports.endDate', 'End Date')}
              />
            </View>
          </View>

          {scopeDescription ? (
            <View style={styles.scopeBadge}>
              <Text style={[styles.scopeBadgeText, isRTL && { textAlign: 'right' }]}>
                📊 <Text style={{ fontWeight: '700' }}>{t('reports.reportMode', 'Report Mode:')}</Text> {scopeDescription}
              </Text>
            </View>
          ) : null}
        </Card>

        {/* Meetings & Activities Report Card */}
        <Card style={styles.card}>
          <Text style={[styles.cardTitle, isRTL && { textAlign: 'right' }]}>{meetingsReportTitle}</Text>
          <Text style={[styles.cardDesc, isRTL && { textAlign: 'right' }]}>{meetingsDesc}</Text>
          <View style={[styles.btnRow, isRTL && { flexDirection: 'row-reverse' }]}>
            <TouchableOpacity
              style={styles.btnPrimary}
              onPress={() => handleDownloadUnit('meetings', 'pdf')}
              disabled={!!busyKey}
            >
              {busyKey === 'meetings-pdf' ? (
                <ActivityIndicator size="small" color="#fff" />
              ) : (
                <Text style={styles.btnPrimaryText}>{t('common.downloadPdf', 'Download PDF')}</Text>
              )}
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.btnSecondary}
              onPress={() => handleDownloadUnit('meetings', 'xlsx')}
              disabled={!!busyKey}
            >
              {busyKey === 'meetings-xlsx' ? (
                <ActivityIndicator size="small" color={Colors.text} />
              ) : (
                <Text style={styles.btnSecondaryText}>{t('common.downloadExcel', 'Download Excel')}</Text>
              )}
            </TouchableOpacity>
          </View>
        </Card>

        {/* Activities & Field Operations Report Card */}
        <Card style={styles.card}>
          <Text style={[styles.cardTitle, isRTL && { textAlign: 'right' }]}>{t('reports.activitiesReportTitle', 'Activities & Field Operations Report')}</Text>
          <Text style={[styles.cardDesc, isRTL && { textAlign: 'right' }]}>
            {t('reports.activitiesReportDesc', 'Detailed record of public events, protests, membership drives, door-to-door campaigns, and field initiatives with GPS verification.')}
          </Text>
          <View style={[styles.btnRow, isRTL && { flexDirection: 'row-reverse' }]}>
            <TouchableOpacity
              style={styles.btnPrimary}
              onPress={() => handleDownloadUnit('activities', 'pdf')}
              disabled={!!busyKey}
            >
              {busyKey === 'activities-pdf' ? (
                <ActivityIndicator size="small" color="#fff" />
              ) : (
                <Text style={styles.btnPrimaryText}>{t('common.downloadPdf', 'Download PDF')}</Text>
              )}
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.btnSecondary}
              onPress={() => handleDownloadUnit('activities', 'xlsx')}
              disabled={!!busyKey}
            >
              {busyKey === 'activities-xlsx' ? (
                <ActivityIndicator size="small" color={Colors.text} />
              ) : (
                <Text style={styles.btnSecondaryText}>{t('common.downloadExcel', 'Download Excel')}</Text>
              )}
            </TouchableOpacity>
          </View>
        </Card>

        {/* Finance Report Card */}
        {canManageFinance(user) && (
          <Card style={styles.card}>
            <Text style={[styles.cardTitle, isRTL && { textAlign: 'right' }]}>{financeReportTitle}</Text>
            <Text style={[styles.cardDesc, isRTL && { textAlign: 'right' }]}>{financeDesc}</Text>
            <View style={[styles.btnRow, isRTL && { flexDirection: 'row-reverse' }]}>
              <TouchableOpacity
                style={styles.btnPrimary}
                onPress={() => handleDownloadUnit('finance', 'pdf')}
                disabled={!!busyKey}
              >
                {busyKey === 'finance-pdf' ? (
                  <ActivityIndicator size="small" color="#fff" />
                ) : (
                  <Text style={styles.btnPrimaryText}>{t('common.downloadPdf', 'Download PDF')}</Text>
                )}
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.btnSecondary}
                onPress={() => handleDownloadUnit('finance', 'xlsx')}
                disabled={!!busyKey}
              >
                {busyKey === 'finance-xlsx' ? (
                  <ActivityIndicator size="small" color={Colors.text} />
                ) : (
                  <Text style={styles.btnSecondaryText}>{t('common.downloadExcel', 'Download Excel')}</Text>
                )}
              </TouchableOpacity>
            </View>
          </Card>
        )}

        {/* Member Performance Report Card */}
        <Card style={styles.card}>
          <Text style={[styles.cardTitle, isRTL && { textAlign: 'right' }]}>{memberReportTitle}</Text>
          <Text style={[styles.cardDesc, isRTL && { textAlign: 'right' }]}>{memberDesc}</Text>

          {/* Member Picker */}
          <View style={styles.field}>
            <Text style={[styles.label, isRTL && { textAlign: 'right' }]}>{isCongressView ? t('reports.congressMember', 'Congress Member') : (isCommitteeView ? t('reports.committeeMember', 'Committee Member') : t('reports.member', 'Member'))}</Text>
            <TouchableOpacity
              style={[styles.pickerButton, isRTL && { flexDirection: 'row-reverse' }]}
              onPress={() => setMemberModalOpen(true)}
            >
              <Text style={[styles.pickerButtonText, !selectedMember && { color: Colors.textMuted }, isRTL && { textAlign: 'right' }]}>
                {selectedMember
                  ? `${selectedMember.fullName} · ${selectedMember.memberId || selectedMember.cnic}${selectedMember.roleText ? ` (${selectedMember.roleText})` : ''}`
                  : t('reports.pickMember', '— pick a member —')}
              </Text>
              <Ionicons name="chevron-down" size={18} color={Colors.textMuted} />
            </TouchableOpacity>
          </View>

          <View style={[styles.btnRow, isRTL && { flexDirection: 'row-reverse' }]}>
            <TouchableOpacity
              style={[styles.btnPrimary, !memberId && { opacity: 0.5 }]}
              onPress={() => handleDownloadMember('pdf')}
              disabled={!memberId || !!busyKey}
            >
              {busyKey === 'member-pdf' ? (
                <ActivityIndicator size="small" color="#fff" />
              ) : (
                <Text style={styles.btnPrimaryText}>{t('common.downloadPdf', 'Download PDF')}</Text>
              )}
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.btnSecondary, !memberId && { opacity: 0.5 }]}
              onPress={() => handleDownloadMember('xlsx')}
              disabled={!memberId || !!busyKey}
            >
              {busyKey === 'member-xlsx' ? (
                <ActivityIndicator size="small" color={Colors.text} />
              ) : (
                <Text style={styles.btnSecondaryText}>{t('common.downloadExcel', 'Download Excel')}</Text>
              )}
            </TouchableOpacity>
          </View>

          {/* Live Performance Preview */}
          {memberId && reportLoading ? (
            <View style={{ paddingVertical: Spacing.lg, alignItems: 'center' }}>
              <ActivityIndicator size="small" color={Colors.primary} />
              <Text style={styles.loadingText}>{t('reports.loadingPreview', 'Loading preview…')}</Text>
            </View>
          ) : null}

          {memberId && !reportLoading && report ? (
            <View style={styles.previewContainer}>
              {/* Member Profile Row */}
              <View style={[styles.memberProfileRow, isRTL && { flexDirection: 'row-reverse' }]}>
                <Avatar name={report.member?.fullName} size={54} />
                <View style={[{ flex: 1 }, isRTL && { alignItems: 'flex-end' }]}>
                  <Text style={[styles.memberProfileName, isRTL && { textAlign: 'right' }]}>{report.member?.fullName}</Text>
                  <Text style={[styles.memberProfileMeta, isRTL && { textAlign: 'right' }]}>
                    {report.member?.memberId || '—'} · {report.member?.cnic}
                    {report.member?.phone ? ` · ${report.member.phone}` : ''}
                  </Text>
                  {report.roles && report.roles.length > 0 ? (
                    <View style={[styles.roleBadgesRow, isRTL && { flexDirection: 'row-reverse' }]}>
                      {report.roles.map((r, i) => (
                        <Badge
                          key={i}
                          label={`${r.customRoleName || t('roles.' + r.roleCode, r.roleCode)} @ ${t('units.' + (r.unitLevel?.toLowerCase() || ''), r.unitLevel)}`}
                          status="ACTIVE"
                        />
                      ))}
                    </View>
                  ) : null}
                </View>
              </View>

              {/* KPI Scorecards Grid */}
              <View style={styles.kpiGrid}>
                <View style={styles.kpiCard}>
                  <Text style={styles.kpiLabel}>{t('reports.meetingsRoster', 'Meetings (roster)')}</Text>
                  <Text style={styles.kpiValue}>{report.meetings?.totalRoster ?? 0}</Text>
                  <Text style={styles.kpiHint}>{t('reports.finalizedInRange', 'finalized in range')}</Text>
                </View>

                <View style={[styles.kpiCard, { borderColor: Colors.success, borderWidth: 1 }]}>
                  <Text style={styles.kpiLabel}>{t('status.present', 'Present')}</Text>
                  <Text style={[styles.kpiValue, { color: Colors.success }]}>{report.meetings?.present ?? 0}</Text>
                  {Boolean(report.meetings?.late && report.meetings.late > 0) ? (
                    <Text style={styles.kpiHint}>{t('status.lateCount', '+{{count}} late', { count: report.meetings.late })}</Text>
                  ) : null}
                </View>

                <View style={[styles.kpiCard, { borderColor: Colors.error, borderWidth: 1 }]}>
                  <Text style={styles.kpiLabel}>{t('status.absent', 'Absent')}</Text>
                  <Text style={[styles.kpiValue, { color: Colors.error }]}>{report.meetings?.absent ?? 0}</Text>
                </View>

                <View style={styles.kpiCard}>
                  <Text style={styles.kpiLabel}>{t('activities.activities', 'Activities')}</Text>
                  <Text style={styles.kpiValue}>{report.activities?.participated ?? 0}</Text>
                  <Text style={styles.kpiHint}>{t('reports.ledCount', '{{count}} led', { count: report.activities?.led ?? 0 })}</Text>
                </View>

                <View style={styles.kpiCard}>
                  <Text style={styles.kpiLabel}>{t('reports.donationsCollected', 'Donations Collected')}</Text>
                  <Text style={styles.kpiValue}>{PKR(report.donations?.total ?? 0)}</Text>
                  <Text style={styles.kpiHint}>{t('reports.entriesCount', '{{count}} entries', { count: report.donations?.count ?? 0 })}</Text>
                </View>

                <View style={[styles.kpiCard, { width: '100%' }]}>
                  <Text style={styles.kpiLabel}>{t('reports.responsibilities', 'Responsibilities')}</Text>
                  <Text style={styles.kpiValue}>
                    {report.responsibilities?.completed ?? 0}/{report.responsibilities?.total ?? 0}
                  </Text>
                  <Text style={styles.kpiHint}>
                    {report.responsibilities?.completionRate != null ? `${report.responsibilities.completionRate}% ${t('reports.done', 'done')}` : '—'} · {t('reports.pendingCount', '{{count}} pending', { count: report.responsibilities?.pending ?? 0 })}
                  </Text>
                </View>
              </View>

              {(report.range?.from || report.range?.to) ? (
                <Text style={[styles.rangeFooter, isRTL && { textAlign: 'right' }]}>
                  {t('reports.range', 'Range: {{from}} → {{to}}', { from: report.range.from || '—', to: report.range.to || t('common.today', 'today') })}
                </Text>
              ) : null}
            </View>
          ) : null}
        </Card>
      </ScrollView>

      {/* Member Picker Modal */}
      <Modal visible={memberModalOpen} animationType="slide" presentationStyle="pageSheet" onRequestClose={() => setMemberModalOpen(false)}>
        <SafeAreaView style={{ flex: 1, backgroundColor: Colors.background }}>
          <View style={[styles.modalHeader, isRTL && { flexDirection: 'row-reverse' }]}>
            <Text style={styles.modalTitle}>{t('reports.selectMember', 'Select Member')}</Text>
            <TouchableOpacity onPress={() => setMemberModalOpen(false)}>
              <Text style={styles.modalCancel}>{t('common.done', 'Done')}</Text>
            </TouchableOpacity>
          </View>
          
          <View style={{ padding: Spacing.md }}>
            <TextInput
              style={[styles.searchInput, isRTL && { textAlign: 'right' }]}
              placeholder={t('reports.searchMemberPlaceholder', 'Search by name, member ID, CNIC...')}
              placeholderTextColor={Colors.textMuted}
              value={memberSearch}
              onChangeText={setMemberSearch}
            />
          </View>

          <FlatList
            data={filteredMembers}
            keyExtractor={(item) => item._id}
            renderItem={({ item }) => {
              const active = item._id === memberId;
              return (
                <TouchableOpacity
                  style={[styles.memberItem, active && styles.memberItemActive, isRTL && { flexDirection: 'row-reverse' }]}
                  onPress={() => {
                    setMemberId(item._id);
                    setMemberModalOpen(false);
                  }}
                >
                  <Avatar name={item.fullName} size={36} />
                  <View style={[{ flex: 1 }, isRTL && { alignItems: 'flex-end', marginHorizontal: Spacing.sm }]}>
                    <Text style={[styles.memberName, isRTL && { textAlign: 'right' }]}>{item.fullName}</Text>
                    <Text style={[styles.memberSub, isRTL && { textAlign: 'right' }]}>
                      {item.memberId || item.cnic}{item.roleText ? ` · ${item.roleText}` : ''}
                    </Text>
                  </View>
                  {active && <Ionicons name="checkmark" size={20} color={Colors.primary} />}
                </TouchableOpacity>
              );
            }}
            ListEmptyComponent={
              <Text style={[styles.emptyMembers, isRTL && { textAlign: 'right' }]}>{t('reports.noEligibleMembers', 'No eligible members found')}</Text>
            }
          />
        </SafeAreaView>
      </Modal>

      {/* Unit Switcher Modal */}
      <UnitSwitcherModal
        visible={unitSwitcherVisible}
        onClose={() => setUnitSwitcherVisible(false)}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: Colors.background },
  content: { padding: Spacing.lg, paddingBottom: 40 },
  header: { marginBottom: Spacing.md },
  pageTitle: { fontSize: FontSize.xl, fontWeight: '700', color: Colors.text },
  denied: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: Spacing.xl },
  deniedText: { fontSize: FontSize.base, color: Colors.textMuted, textAlign: 'center' },

  unitContextCard: {
    backgroundColor: '#fff',
    borderColor: `${Colors.primary}30`,
    borderWidth: 1.5,
  },
  unitContextRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.md,
  },
  unitContextIconBox: {
    width: 44,
    height: 44,
    borderRadius: Radius.md,
    backgroundColor: `${Colors.primary}15`,
    alignItems: 'center',
    justifyContent: 'center',
  },
  unitContextLabel: {
    fontSize: 10,
    fontWeight: '800',
    color: Colors.primary,
    letterSpacing: 0.8,
    marginBottom: 2,
  },
  unitContextName: {
    fontSize: FontSize.md,
    fontWeight: '700',
    color: Colors.text,
  },
  unitContextTier: {
    fontSize: 11,
    color: Colors.textMuted,
    marginTop: 2,
    fontWeight: '600',
  },
  switchUnitBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: `${Colors.primary}15`,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: Radius.sm,
  },
  switchUnitBtnText: {
    color: Colors.primary,
    fontSize: FontSize.xs,
    fontWeight: '700',
  },

  tierPillsWrapper: { marginBottom: Spacing.md },
  tierPillsScroll: { flexDirection: 'row', gap: 8, paddingVertical: 2 },
  tierPill: { paddingHorizontal: 14, paddingVertical: 8, borderRadius: 20, backgroundColor: Colors.surface, borderWidth: 1, borderColor: Colors.border },
  tierPillActive: { backgroundColor: Colors.primary, borderColor: Colors.primary },
  tierPillText: { fontSize: FontSize.xs, fontWeight: '600', color: Colors.text },
  tierPillTextActive: { color: '#fff', fontWeight: '700' },

  card: { marginBottom: Spacing.md, padding: Spacing.lg },
  cardTitle: { fontSize: FontSize.base, fontWeight: '700', color: Colors.text, marginBottom: 4 },
  cardDesc: { fontSize: FontSize.xs, color: Colors.textMuted, marginBottom: Spacing.md, lineHeight: 18 },

  label: { fontSize: FontSize.xs, fontWeight: '600', color: Colors.textMuted, marginBottom: 6 },
  scopeTabs: { backgroundColor: Colors.surfaceAlt, borderRadius: Radius.md, padding: 4, gap: 4 },
  scopeTab: { paddingVertical: 8, paddingHorizontal: 12, borderRadius: Radius.sm, alignItems: 'center' },
  scopeTabActive: {
    backgroundColor: Colors.surface,
    ...Platform.select({
      web: {
        boxShadow: '0 1px 2px rgba(0, 0, 0, 0.05)',
      },
      default: {
        elevation: 1,
        shadowColor: '#000',
        shadowOpacity: 0.05,
        shadowRadius: 2,
      },
    }),
  },
  scopeTabText: { fontSize: FontSize.xs, fontWeight: '600', color: Colors.textMuted, textAlign: 'center' },
  scopeTabTextActive: { color: Colors.text },

  presetScroll: { flexDirection: 'row', gap: 8, paddingVertical: 4 },
  presetBtn: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: Radius.sm,
    backgroundColor: Colors.surfaceAlt,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  presetBtnText: {
    fontSize: 11,
    fontWeight: '600',
    color: Colors.text,
  },

  dateRow: { flexDirection: 'row', gap: Spacing.md, marginTop: Spacing.xs },
  dateField: { flex: 1 },
  scopeBadge: { marginTop: Spacing.md, backgroundColor: Colors.surfaceAlt, padding: Spacing.sm, borderRadius: Radius.sm },
  scopeBadgeText: { fontSize: FontSize.xs, color: Colors.textMuted, lineHeight: 18 },

  btnRow: { flexDirection: 'row', gap: Spacing.sm, flexWrap: 'wrap' },
  btnPrimary: {
    flex: 1,
    backgroundColor: Colors.primary,
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderRadius: Radius.md,
    alignItems: 'center',
    justifyContent: 'center',
    minWidth: 130,
  },
  btnPrimaryText: { color: '#fff', fontSize: FontSize.sm, fontWeight: '700' },
  btnSecondary: {
    flex: 1,
    backgroundColor: Colors.surfaceAlt,
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderRadius: Radius.md,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: Colors.border,
    minWidth: 130,
  },
  btnSecondaryText: { color: Colors.text, fontSize: FontSize.sm, fontWeight: '600' },

  field: { marginBottom: Spacing.md },
  pickerButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: Colors.surface,
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: Radius.md,
    paddingHorizontal: Spacing.md,
    paddingVertical: 12,
  },
  pickerButtonText: { fontSize: FontSize.sm, color: Colors.text, flex: 1, marginRight: 8 },

  previewContainer: {
    marginTop: Spacing.lg,
    paddingTop: Spacing.lg,
    borderTopWidth: 1,
    borderTopColor: Colors.borderLight,
  },
  memberProfileRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.md, marginBottom: Spacing.md },
  memberProfileName: { fontSize: FontSize.base, fontWeight: '700', color: Colors.text },
  memberProfileMeta: { fontSize: FontSize.xs, color: Colors.textMuted, marginTop: 2 },
  roleBadgesRow: { flexDirection: 'row', gap: 6, flexWrap: 'wrap', marginTop: 6 },

  kpiGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.sm, marginTop: Spacing.sm },
  kpiCard: {
    flex: 1,
    minWidth: 130,
    flexBasis: '47%',
    backgroundColor: Colors.surfaceAlt,
    borderRadius: Radius.md,
    padding: Spacing.md,
    borderWidth: 1,
    borderColor: Colors.borderLight,
  },
  kpiLabel: { fontSize: FontSize.xs, fontWeight: '600', color: Colors.textMuted, textTransform: 'uppercase' },
  kpiValue: { fontSize: FontSize.xl, fontWeight: '800', color: Colors.text, marginTop: 4 },
  kpiHint: { fontSize: FontSize.xs - 1, color: Colors.textMuted, marginTop: 4 },
  rangeFooter: { fontSize: FontSize.xs, color: Colors.textMuted, marginTop: Spacing.md, textAlign: 'center' },
  loadingText: { fontSize: FontSize.xs, color: Colors.textMuted, marginTop: 6 },

  errorText: { color: Colors.error, fontSize: FontSize.sm, marginBottom: Spacing.md, textAlign: 'center' },

  modalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: Spacing.lg,
    backgroundColor: Colors.surface,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
  },
  modalTitle: { fontSize: FontSize.lg, fontWeight: '700', color: Colors.text },
  modalCancel: { fontSize: FontSize.base, color: Colors.primary, fontWeight: '600' },
  searchInput: {
    backgroundColor: Colors.surface,
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: Radius.md,
    paddingHorizontal: Spacing.md,
    paddingVertical: 10,
    fontSize: FontSize.sm,
    color: Colors.text,
  },
  memberItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.md,
    paddingHorizontal: Spacing.lg,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: Colors.borderLight,
    backgroundColor: Colors.surface,
  },
  memberItemActive: { backgroundColor: '#eff6ff' },
  memberName: { fontSize: FontSize.sm, fontWeight: '600', color: Colors.text },
  memberSub: { fontSize: FontSize.xs, color: Colors.textMuted, marginTop: 2 },
  emptyMembers: { textAlign: 'center', padding: 32, color: Colors.textMuted, fontStyle: 'italic' },

  // Guidance Card (when on lower tier context)
  guidanceCard: {
    backgroundColor: '#fff',
    borderRadius: Radius.xl,
    padding: Spacing.xl,
    alignItems: 'center',
    textAlign: 'center',
    marginVertical: Spacing.lg,
  },
  guidanceIconBox: {
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: '#eff6ff',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: Spacing.md,
  },
  guidanceTitle: {
    fontSize: FontSize.lg,
    fontWeight: '800',
    color: Colors.text,
    textAlign: 'center',
    marginBottom: Spacing.sm,
  },
  guidanceText: {
    fontSize: FontSize.sm,
    color: Colors.textMuted,
    textAlign: 'center',
    lineHeight: 22,
    marginBottom: Spacing.lg,
  },
  guidanceBtnCol: {
    width: '100%',
    gap: 10,
  },
  guidanceBtnPrimary: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: Colors.primary,
    paddingVertical: 12,
    paddingHorizontal: Spacing.lg,
    borderRadius: Radius.md,
  },
  guidanceBtnPrimaryText: {
    color: '#fff',
    fontSize: FontSize.md,
    fontWeight: '700',
  },
  guidanceBtnSecondary: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#eff6ff',
    borderWidth: 1,
    borderColor: Colors.primary,
    paddingVertical: 12,
    paddingHorizontal: Spacing.lg,
    borderRadius: Radius.md,
  },
  guidanceBtnSecondaryText: {
    color: Colors.primary,
    fontSize: FontSize.md,
    fontWeight: '700',
  },
  guidanceSubHead: {
    fontSize: 11,
    fontWeight: '700',
    color: Colors.textMuted,
    letterSpacing: 0.5,
    marginBottom: 8,
    textAlign: 'center',
  },
  provGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    justifyContent: 'center',
  },
  provPillBtn: {
    backgroundColor: '#f8fafc',
    borderWidth: 1,
    borderColor: '#e2e8f0',
    paddingVertical: 6,
    paddingHorizontal: 12,
    borderRadius: Radius.full,
  },
  provPillBtnText: {
    fontSize: 12,
    fontWeight: '600',
    color: Colors.text,
  },
});
