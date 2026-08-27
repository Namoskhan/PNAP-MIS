import { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Modal,
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
import { canManageFinance, isHigherAdmin, isAreaAdmin, hasRole } from '../../../src/utils/permissions';
import { api, errorMessage } from '../../../src/api/client';
import { Colors, FontSize, Spacing, Radius } from '../../../src/constants/colors';
import Card from '../../../src/components/Card';
import DatePicker from '../../../src/components/DatePicker';
import Avatar from '../../../src/components/Avatar';
import Badge from '../../../src/components/Badge';
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
  const { ctx, provinces } = useUnit();
  const params = useLocalSearchParams();

  const queryBody = params.body || '';
  const isCongressView = queryBody === 'CONGRESS';
  const isJirgaView = queryBody === 'JIRGA';
  const isCommitteeView = queryBody === 'COMMITTEE';

  const [selectedLevel, setSelectedLevel] = useState(() => {
    if (params.unitLevel) return params.unitLevel;
    if (isJirgaView && provinces && provinces.length > 0) return 'PROVINCE';
    return ctx?.unitLevel || 'CENTRAL';
  });

  const [selectedUnitId, setSelectedUnitId] = useState(() => {
    if (params.unitId && params.unitId !== 'CENTRAL') return params.unitId;
    if (isJirgaView && provinces && provinces.length > 0) return provinces[0]._id;
    return ctx?.unitId || '';
  });

  // Sync with provinces when they become available
  useEffect(() => {
    if (isJirgaView && !selectedUnitId && provinces && provinces.length > 0) {
      setSelectedLevel('PROVINCE');
      setSelectedUnitId(provinces[0]._id);
    }
  }, [provinces, isJirgaView]);

  const activeLevel = selectedLevel;
  const [resolvedUnitId, setResolvedUnitId] = useState(selectedUnitId);

  useEffect(() => {
    let rawId = selectedUnitId;
    if (activeLevel === 'CENTRAL' && (!rawId || rawId === 'CENTRAL')) {
      api.get('/org/central').then((r) => {
        if (r.data?.data?._id) setResolvedUnitId(r.data.data._id);
      }).catch(() => {});
    } else {
      setResolvedUnitId(rawId);
    }
  }, [selectedUnitId, activeLevel]);

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

  // Fetch live member report preview
  useEffect(() => {
    if (!memberId) {
      setReport(null);
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
  }, [memberId, from, to]);

  if (!isHigherAdmin(user) && !isAreaAdmin(user) && !hasRole(user, 'SENIOR_MAWIN', 'SECRETARY', 'FINANCE_SECRETARY')) {
    return (
      <SafeAreaView style={styles.safe}>
        <View style={styles.denied}>
          <Text style={styles.deniedText}>🔒 You do not have access to export reports.</Text>
        </View>
      </SafeAreaView>
    );
  }

  function getUnitParams(kind) {
    const p = { unitLevel: activeLevel, unitId: resolvedUnitId || (activeLevel === 'CENTRAL' ? 'CENTRAL' : (params.unitId || ctx?.unitId)) };
    if (from) p.from = from;
    if (to) p.to = to;
    if (activeLevel !== 'BASIC_UNIT' && !isCongressView && scope) p.scope = scope;
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
    setError('');
    const busyId = `${kind}-${format}`;
    setBusyKey(busyId);
    try {
      const qParams = getUnitParams(kind);
      const bodySuffix = isCongressView ? '-congress' : (isJirgaView ? '-jirga' : (isCommitteeView ? '-committee' : (kind === 'finance' ? '-executive' : '')));
      const scopeSuffix = (activeLevel !== 'BASIC_UNIT' && !isCongressView && scope === 'subtree') ? '-aggregated' : '';
      const unitName = activeLevel === 'CENTRAL' ? 'Central' : (ctx?.unitName || activeLevel);
      const safeUnit = (unitName || 'unit').replace(/[^a-zA-Z0-9_-]/g, '_');
      const filename = `${activeLevel}-${safeUnit}-${kind}${bodySuffix}${scopeSuffix}.${format}`;

      await downloadAndShare(`/exports/unit/${kind}/${format}`, filename, qParams);
    } catch (e) {
      setError('Export failed: ' + (e.message || 'unknown'));
    } finally {
      setBusyKey(null);
    }
  }

  async function handleDownloadMember(format) {
    if (!memberId) return;
    setError('');
    const busyId = `member-${format}`;
    setBusyKey(busyId);
    try {
      const p = {};
      if (from) p.from = from;
      if (to) p.to = to;
      const filename = `member-${memberId}-performance.${format}`;
      await downloadAndShare(`/exports/member/${memberId}/${format}`, filename, p);
    } catch (e) {
      setError('Export failed: ' + (e.message || 'unknown'));
    } finally {
      setBusyKey(null);
    }
  }

  const committeeTier = COMMITTEE_TIER_LABELS[activeLevel] || activeLevel;
  const jirgaTier = activeLevel === 'CENTRAL' ? 'Qomi Jirga' : 'Sobayi Jirga';
  const unitDisplayName = activeLevel === 'CENTRAL' ? 'PKNAP Central' : (ctx?.unitName || activeLevel);

  const scopeDescription = isCongressView ? (
    'National Congress Assembly Records (Central)'
  ) : (isJirgaView ? (
    scope === 'subtree' ? `Aggregated ${jirgaTier} Report` : `${jirgaTier} Direct Records`
  ) : (isCommitteeView ? {
    BASIC_UNIT: 'Basic Unit Level (Direct unit records)',
    AREA: scope === 'subtree' ? 'Aggregated Elaqai Committee Report (Roll-up of all subordinate Basic Units + Elaqai Committee activities)' : 'Elaqai Committee Level Only (Records authored directly at Elaqai)',
    DISTRICT: scope === 'subtree' ? 'Aggregated Zilla Committee Report (Roll-up of all subordinate Elaqai Committees & Basic Units + Zilla Committee activities)' : 'Zilla Committee Level Only (Records authored directly at Zilla)',
    PROVINCE: scope === 'subtree' ? 'Aggregated Sobayi Committee Report (Roll-up of all subordinate Zilla, Elaqai Committees & Basic Units + Sobayi Committee activities)' : 'Sobayi Committee Level Only (Records authored directly at Sobayi)',
    CENTRAL: scope === 'subtree' ? 'Aggregated Central Committee Report (Nationwide roll-up across all subordinate Sobayi, Zilla, and Elaqai Committees)' : 'Central Committee Level Only (Records authored directly at Central)',
  }[activeLevel] || '' : {
    BASIC_UNIT: 'Basic Unit Level (Direct unit records)',
    AREA: scope === 'subtree' ? 'Aggregated Area Report (Roll-up of all subordinate Basic Units + Area activities)' : 'Area Level Only (Records authored directly at Area)',
    DISTRICT: scope === 'subtree' ? 'Aggregated District Report (Roll-up of all subordinate Areas & Basic Units + District activities)' : 'District Level Only (Records authored directly at District)',
    PROVINCE: scope === 'subtree' ? 'Aggregated Province Report (Roll-up of all subordinate Districts, Areas & Basic Units + Province activities)' : 'Province Level Only (Records authored directly at Province)',
    CENTRAL: scope === 'subtree' ? 'Aggregated Central Report (Nationwide roll-up across all subordinate tiers)' : 'Central Level Only (Records authored directly at Central)',
  }[activeLevel] || ''));

  const pageTitle = isCongressView
    ? 'National Congress Reports · PKNAP Central'
    : (isJirgaView
      ? `${jirgaTier} Reports · ${unitDisplayName}`
      : (isCommitteeView
        ? `${committeeTier ? `${committeeTier} Committee` : 'Committee'} Reports · ${unitDisplayName}`
        : `Reports · ${unitDisplayName}`));

  const meetingsReportTitle = isCongressView
    ? 'National Congress Meetings & Activities Report'
    : (isJirgaView
      ? `${jirgaTier} Meetings & Activities Report`
      : (isCommitteeView
        ? `${committeeTier ? `${committeeTier} Committee ` : 'Committee '}Meetings & Activities Report`
        : 'Meetings & Activities Report'));

  const meetingsDesc = isCongressView
    ? 'National Congress meetings (with embedded photos), congress activities, and responsibilities.'
    : (isCommitteeView
      ? 'Committee meetings (with embedded photos), committee activities, and committee responsibilities.'
      : 'Executive & General Body meetings (with embedded photos), executive activities, and responsibilities.');

  const financeReportTitle = isCongressView
    ? 'National Congress Finance Report'
    : (isJirgaView
      ? `${jirgaTier} Finance Report`
      : (isCommitteeView
        ? `${committeeTier ? `${committeeTier} Committee ` : 'Committee '}Finance Report`
        : 'Finance Report'));

  const financeDesc = isCongressView
    ? 'National Congress donations ledger, expenses ledger, and congress net balance for the period.'
    : (isCommitteeView
      ? 'Committee donations ledger, expenses ledger, and the committee net balance for the period.'
      : 'Executive donations ledger, expenses ledger, and the executive net balance for the period.');

  const memberReportTitle = isCongressView
    ? 'Congress Member Performance Report'
    : (isCommitteeView
      ? 'Committee Member Performance Report'
      : 'Individual Performance Report');

  const memberDesc = isCongressView
    ? 'Performance scorecard and attendance report for National Congress members.'
    : (isCommitteeView
      ? 'Performance scorecard and attendance report for committee members.'
      : 'Performance scorecard and attendance report for executive committee and subordinate members.');

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

  return (
    <SafeAreaView style={styles.safe}>
      <ScrollView contentContainerStyle={styles.content}>
        {/* Header Banner */}
        <View style={styles.header}>
          <Text style={styles.pageTitle}>{pageTitle}</Text>
        </View>

        {/* Province Switcher Pills for Jirga */}
        {isJirgaView && provinces && provinces.length > 0 && (
          <View style={styles.tierPillsWrapper}>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.tierPillsScroll}>
              {provinces.map((prov) => {
                const isActive = selectedLevel === 'PROVINCE' && String(selectedUnitId) === String(prov._id);
                return (
                  <TouchableOpacity
                    key={prov._id}
                    style={[styles.tierPill, isActive && styles.tierPillActive]}
                    onPress={() => {
                      setSelectedLevel('PROVINCE');
                      setSelectedUnitId(prov._id);
                    }}
                  >
                    <Text style={[styles.tierPillText, isActive && styles.tierPillTextActive]}>
                      {prov.name} Sobayi Jirga
                    </Text>
                  </TouchableOpacity>
                );
              })}
              <TouchableOpacity
                style={[styles.tierPill, selectedLevel === 'CENTRAL' && styles.tierPillActive]}
                onPress={() => {
                  setSelectedLevel('CENTRAL');
                  setSelectedUnitId('CENTRAL');
                }}
              >
                <Text style={[styles.tierPillText, selectedLevel === 'CENTRAL' && styles.tierPillTextActive]}>
                  Qomi Jirga (Central)
                </Text>
              </TouchableOpacity>
            </ScrollView>
          </View>
        )}

        {error ? <Text style={styles.errorText}>{error}</Text> : null}

        {/* Scope & Period Filter Card */}
        <Card style={styles.card}>
          <Text style={styles.cardTitle}>Report Scope & Period Filter</Text>
          
          {activeLevel !== 'BASIC_UNIT' && !isCongressView ? (
            <View style={{ marginBottom: Spacing.md }}>
              <Text style={styles.label}>Data Aggregation Scope</Text>
              <View style={styles.scopeTabs}>
                <TouchableOpacity 
                  style={[styles.scopeTab, scope === 'subtree' && styles.scopeTabActive]}
                  onPress={() => setScope('subtree')}
                >
                  <Text style={[styles.scopeTabText, scope === 'subtree' && styles.scopeTabTextActive]}>
                    Aggregated (Include all subordinate units roll-up)
                  </Text>
                </TouchableOpacity>
                <TouchableOpacity 
                  style={[styles.scopeTab, scope === 'own' && styles.scopeTabActive]}
                  onPress={() => setScope('own')}
                >
                  <Text style={[styles.scopeTabText, scope === 'own' && styles.scopeTabTextActive]}>
                    This unit tier only
                  </Text>
                </TouchableOpacity>
              </View>
            </View>
          ) : null}

          <View style={styles.dateRow}>
            <View style={styles.dateField}>
              <DatePicker
                label="From Date"
                value={from}
                onChange={setFrom}
                placeholder="Start Date"
              />
            </View>
            <View style={styles.dateField}>
              <DatePicker
                label="To Date"
                value={to}
                onChange={setTo}
                placeholder="End Date"
              />
            </View>
          </View>

          {scopeDescription ? (
            <View style={styles.scopeBadge}>
              <Text style={styles.scopeBadgeText}>
                📊 <Text style={{ fontWeight: '700' }}>Report Mode:</Text> {scopeDescription}
              </Text>
            </View>
          ) : null}
        </Card>

        {/* Meetings & Activities Report Card */}
        <Card style={styles.card}>
          <Text style={styles.cardTitle}>{meetingsReportTitle}</Text>
          <Text style={styles.cardDesc}>{meetingsDesc}</Text>
          <View style={styles.btnRow}>
            <TouchableOpacity
              style={styles.btnPrimary}
              onPress={() => handleDownloadUnit('meetings', 'pdf')}
              disabled={!!busyKey}
            >
              {busyKey === 'meetings-pdf' ? (
                <ActivityIndicator size="small" color="#fff" />
              ) : (
                <Text style={styles.btnPrimaryText}>Download PDF</Text>
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
                <Text style={styles.btnSecondaryText}>Download Excel</Text>
              )}
            </TouchableOpacity>
          </View>
        </Card>

        {/* Finance Report Card */}
        <Card style={styles.card}>
          <Text style={styles.cardTitle}>{financeReportTitle}</Text>
          <Text style={styles.cardDesc}>{financeDesc}</Text>
          <View style={styles.btnRow}>
            <TouchableOpacity
              style={styles.btnPrimary}
              onPress={() => handleDownloadUnit('finance', 'pdf')}
              disabled={!!busyKey}
            >
              {busyKey === 'finance-pdf' ? (
                <ActivityIndicator size="small" color="#fff" />
              ) : (
                <Text style={styles.btnPrimaryText}>Download PDF</Text>
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
                <Text style={styles.btnSecondaryText}>Download Excel</Text>
              )}
            </TouchableOpacity>
          </View>
        </Card>

        {/* Member Performance Report Card */}
        <Card style={styles.card}>
          <Text style={styles.cardTitle}>{memberReportTitle}</Text>
          <Text style={styles.cardDesc}>{memberDesc}</Text>

          {/* Member Picker */}
          <View style={styles.field}>
            <Text style={styles.label}>{isCongressView ? 'Congress Member' : (isCommitteeView ? 'Committee Member' : 'Member')}</Text>
            <TouchableOpacity
              style={styles.pickerButton}
              onPress={() => setMemberModalOpen(true)}
            >
              <Text style={[styles.pickerButtonText, !selectedMember && { color: Colors.textMuted }]}>
                {selectedMember
                  ? `${selectedMember.fullName} · ${selectedMember.memberId || selectedMember.cnic}${selectedMember.roleText ? ` (${selectedMember.roleText})` : ''}`
                  : '— pick a member —'}
              </Text>
              <Ionicons name="chevron-down" size={18} color={Colors.textMuted} />
            </TouchableOpacity>
          </View>

          <View style={styles.btnRow}>
            <TouchableOpacity
              style={[styles.btnPrimary, !memberId && { opacity: 0.5 }]}
              onPress={() => handleDownloadMember('pdf')}
              disabled={!memberId || !!busyKey}
            >
              {busyKey === 'member-pdf' ? (
                <ActivityIndicator size="small" color="#fff" />
              ) : (
                <Text style={styles.btnPrimaryText}>Download PDF</Text>
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
                <Text style={styles.btnSecondaryText}>Download Excel</Text>
              )}
            </TouchableOpacity>
          </View>

          {/* Live Performance Preview */}
          {memberId && reportLoading ? (
            <View style={{ paddingVertical: Spacing.lg, alignItems: 'center' }}>
              <ActivityIndicator size="small" color={Colors.primary} />
              <Text style={styles.loadingText}>Loading preview…</Text>
            </View>
          ) : null}

          {memberId && !reportLoading && report ? (
            <View style={styles.previewContainer}>
              {/* Member Profile Row */}
              <View style={styles.memberProfileRow}>
                <Avatar name={report.member?.fullName} size={54} />
                <View style={{ flex: 1 }}>
                  <Text style={styles.memberProfileName}>{report.member?.fullName}</Text>
                  <Text style={styles.memberProfileMeta}>
                    {report.member?.memberId || '—'} · {report.member?.cnic}
                    {report.member?.phone ? ` · ${report.member.phone}` : ''}
                  </Text>
                  {report.roles && report.roles.length > 0 ? (
                    <View style={styles.roleBadgesRow}>
                      {report.roles.map((r, i) => (
                        <Badge
                          key={i}
                          label={`${r.customRoleName || r.roleCode} @ ${r.unitLevel}`}
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
                  <Text style={styles.kpiLabel}>Meetings (roster)</Text>
                  <Text style={styles.kpiValue}>{report.meetings?.totalRoster ?? 0}</Text>
                  <Text style={styles.kpiHint}>finalized in range</Text>
                </View>

                <View style={[styles.kpiCard, { borderColor: Colors.success, borderWidth: 1 }]}>
                  <Text style={styles.kpiLabel}>Present</Text>
                  <Text style={[styles.kpiValue, { color: Colors.success }]}>{report.meetings?.present ?? 0}</Text>
                  {Boolean(report.meetings?.late && report.meetings.late > 0) ? (
                    <Text style={styles.kpiHint}>+{report.meetings.late} late</Text>
                  ) : null}
                </View>

                <View style={[styles.kpiCard, { borderColor: Colors.error, borderWidth: 1 }]}>
                  <Text style={styles.kpiLabel}>Absent</Text>
                  <Text style={[styles.kpiValue, { color: Colors.error }]}>{report.meetings?.absent ?? 0}</Text>
                </View>

                <View style={styles.kpiCard}>
                  <Text style={styles.kpiLabel}>Attendance Rate</Text>
                  <Text style={styles.kpiValue}>
                    {report.meetings?.attendanceRate != null ? `${report.meetings.attendanceRate}%` : '—'}
                  </Text>
                </View>

                <View style={styles.kpiCard}>
                  <Text style={styles.kpiLabel}>Activities</Text>
                  <Text style={styles.kpiValue}>{report.activities?.participated ?? 0}</Text>
                  <Text style={styles.kpiHint}>{report.activities?.led ?? 0} led</Text>
                </View>

                <View style={styles.kpiCard}>
                  <Text style={styles.kpiLabel}>Donations Collected</Text>
                  <Text style={styles.kpiValue}>{PKR(report.donations?.total ?? 0)}</Text>
                  <Text style={styles.kpiHint}>{report.donations?.count ?? 0} entries</Text>
                </View>

                <View style={[styles.kpiCard, { width: '100%' }]}>
                  <Text style={styles.kpiLabel}>Responsibilities</Text>
                  <Text style={styles.kpiValue}>
                    {report.responsibilities?.completed ?? 0}/{report.responsibilities?.total ?? 0}
                  </Text>
                  <Text style={styles.kpiHint}>
                    {report.responsibilities?.completionRate != null ? `${report.responsibilities.completionRate}% done` : '—'} · {report.responsibilities?.pending ?? 0} pending
                  </Text>
                </View>
              </View>

              {(report.range?.from || report.range?.to) ? (
                <Text style={styles.rangeFooter}>
                  Range: {report.range.from || '—'} → {report.range.to || 'today'}
                </Text>
              ) : null}
            </View>
          ) : null}
        </Card>
      </ScrollView>

      {/* Member Picker Modal */}
      <Modal visible={memberModalOpen} animationType="slide" presentationStyle="pageSheet" onRequestClose={() => setMemberModalOpen(false)}>
        <SafeAreaView style={{ flex: 1, backgroundColor: Colors.background }}>
          <View style={styles.modalHeader}>
            <Text style={styles.modalTitle}>Select Member</Text>
            <TouchableOpacity onPress={() => setMemberModalOpen(false)}>
              <Text style={styles.modalCancel}>Done</Text>
            </TouchableOpacity>
          </View>
          
          <View style={{ padding: Spacing.md }}>
            <TextInput
              style={styles.searchInput}
              placeholder="Search by name, member ID, CNIC..."
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
                  style={[styles.memberItem, active && styles.memberItemActive]}
                  onPress={() => {
                    setMemberId(item._id);
                    setMemberModalOpen(false);
                  }}
                >
                  <Avatar name={item.fullName} size={36} />
                  <View style={{ flex: 1 }}>
                    <Text style={styles.memberName}>{item.fullName}</Text>
                    <Text style={styles.memberSub}>
                      {item.memberId || item.cnic}{item.roleText ? ` · ${item.roleText}` : ''}
                    </Text>
                  </View>
                  {active && <Ionicons name="checkmark" size={20} color={Colors.primary} />}
                </TouchableOpacity>
              );
            }}
            ListEmptyComponent={
              <Text style={styles.emptyMembers}>No eligible members found</Text>
            }
          />
        </SafeAreaView>
      </Modal>
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
  scopeTabActive: { backgroundColor: Colors.surface, elevation: 1, shadowColor: '#000', shadowOpacity: 0.05, shadowRadius: 2 },
  scopeTabText: { fontSize: FontSize.xs, fontWeight: '600', color: Colors.textMuted, textAlign: 'center' },
  scopeTabTextActive: { color: Colors.text },

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
});
