import React, { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Image,
  KeyboardAvoidingView,
  Modal,
  Platform,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  useWindowDimensions,
  View,
} from 'react-native';
import { useLocalSearchParams } from 'expo-router';
import * as ImagePicker from 'expo-image-picker';
import { Picker } from '@react-native-picker/picker';
import { Ionicons } from '@expo/vector-icons';
import { useAuth } from '../../../src/context/AuthContext';
import { useUnit } from '../../../src/context/UnitContext';
import { api, errorMessage, resolveMediaUrl } from '../../../src/api/client';
import {
  canManageFinance,
  canApproveExpense,
  hasPermission,
  isCentralAdminOversight,
  isSuperAdminOversight,
  isHigherAdmin,
} from '../../../src/utils/permissions';
import { useToast } from '../../../src/components/Toast';
import Badge from '../../../src/components/Badge';
import OrgTree from '../../../src/components/OrgTree';
import { Colors, FontSize, Spacing, Radius } from '../../../src/constants/colors';
import { shortDate, PKR } from '../../../src/utils/formatters';
import { downloadAndShare } from '../../../src/utils/export';

const LEVEL_LABEL = {
  BASIC_UNIT: 'Basic Unit',
  AREA: 'Area',
  DISTRICT: 'District',
  PROVINCE: 'Province',
  CENTRAL: 'Center',
};

const DIRECTION_LABEL = {
  UP: 'Upward',
  DOWN: 'Downward',
  SAME_TIER: 'Same tier',
};
const FLOW_LABEL = DIRECTION_LABEL;

const PAYMENT_MODES = ['BANK_TRANSFER', 'CASH', 'MOBILE_WALLET', 'CHEQUE'];

export default function TransfersScreen() {
  const { user } = useAuth();
  const { ctx, provinces, setCtx } = useUnit();
  const toast = useToast();
  const params = useLocalSearchParams();
  const { width, height } = useWindowDimensions();

  const isSmall = width < 480;
  const isTablet = width >= 768;
  const isDesktop = width >= 1024;

  const queryBody = params.body || '';
  const isJirgaView = queryBody === 'JIRGA';
  const isCommitteeView = queryBody === 'COMMITTEE';
  const targetBody = isJirgaView ? 'JIRGA' : (isCommitteeView ? 'COMMITTEE' : 'EXECUTIVE');

  const [tab, setTab] = useState('outgoing');
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);

  const activeLevel = params.unitLevel || ctx?.unitLevel || 'CENTRAL';
  const rawUnitId = params.unitId || ctx?.unitId || '';
  const [resolvedUnitId, setResolvedUnitId] = useState(rawUnitId);

  // Resolve CENTRAL unit ObjectId if passed as string 'CENTRAL'
  useEffect(() => {
    let currentRaw = rawUnitId;
    if (activeLevel === 'CENTRAL' && (!currentRaw || currentRaw === 'CENTRAL')) {
      api.get('/org/central').then((r) => {
        if (r.data?.data?._id) {
          setResolvedUnitId(r.data.data._id);
        }
      }).catch(() => {});
    } else {
      setResolvedUnitId(currentRaw);
    }
  }, [rawUnitId, activeLevel]);

  const hasFinanceAccess = hasPermission(user, 'MANAGE_FINANCE') || hasPermission(user, 'APPROVE_EXPENSE');
  const canSend = canManageFinance(user) && !isCentralAdminOversight(user) && !isSuperAdminOversight(user);

  // Initiate Modal State
  const [transferModalOpen, setTransferModalOpen] = useState(false);
  const [picked, setPicked] = useState(null);
  const [preview, setPreview] = useState(null);
  const [previewErr, setPreviewErr] = useState('');
  const [previewLoading, setPreviewLoading] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);

  const [form, setForm] = useState({ amount: '', mode: 'BANK_TRANSFER', reference: '', note: '' });
  const [receipt, setReceipt] = useState(null);
  const [submitting, setSubmitting] = useState(false);
  const [previewUrl, setPreviewUrl] = useState(null);
  const [modalErr, setModalErr] = useState('');

  // Rejection Modal State
  const [rejectModalOpen, setRejectModalOpen] = useState(false);
  const [rejectTargetId, setRejectTargetId] = useState(null);
  const [rejectReason, setRejectReason] = useState('');
  const [rejecting, setRejecting] = useState(false);
  const [rejectErr, setRejectErr] = useState('');
  const [sourceBalance, setSourceBalance] = useState(null);
  const [pendingOutAmount, setPendingOutAmount] = useState(0);

  // Approve Modal State
  const [approveModalOpen, setApproveModalOpen] = useState(false);
  const [approveTarget, setApproveTarget] = useState(null);
  const [approveNote, setApproveNote] = useState('');
  const [approving, setApproving] = useState(false);
  const [approveErr, setApproveErr] = useState('');

  function openApproveModal(t) {
    setApproveTarget(t);
    setApproveNote('');
    setApproveErr('');
    setApproveModalOpen(true);
  }

  async function handleConfirmApprove() {
    if (!approveTarget?._id) return;
    setApproving(true);
    setApproveErr('');
    try {
      await api.post(`/transfers/${approveTarget._id}/ack`, { note: approveNote.trim() || undefined });
      setApproveModalOpen(false);
      reload();
      toast.success('Transfer acknowledged — funds added to your balance.');
    } catch (e) {
      setApproveErr(errorMessage(e));
      toast.error(errorMessage(e));
    } finally {
      setApproving(false);
    }
  }

  async function loadSourceBalance() {
    if (!activeLevel || !resolvedUnitId || resolvedUnitId === 'CENTRAL') return;
    try {
      const q = { unitLevel: activeLevel, unitId: resolvedUnitId, body: targetBody };
      const res = await api.get('/finance/summary', { params: q });
      if (res.data?.data) {
        setSourceBalance(res.data.data.availableBalance ?? res.data.data.balance ?? 0);
        setPendingOutAmount(res.data.data.pendingTransfersOut?.total || 0);
      }
    } catch {}
  }

  function openInitiate() {
    setForm({ amount: '', mode: 'BANK_TRANSFER', reference: '', note: '' });
    setReceipt(null);
    setPicked(null);
    setPreview(null);
    setPreviewErr('');
    setModalErr('');
    setConfirmOpen(false);
    loadSourceBalance();
    setTransferModalOpen(true);
  }

  // Cancel Modal State
  const [cancelModalOpen, setCancelModalOpen] = useState(false);
  const [cancelTarget, setCancelTarget] = useState(null);
  const [cancelling, setCancelling] = useState(false);
  const [cancelErr, setCancelErr] = useState('');

  function openCancelModal(t) {
    setCancelTarget(t);
    setCancelErr('');
    setCancelModalOpen(true);
  }

  async function handleConfirmCancel() {
    if (!cancelTarget?._id) return;
    setCancelling(true);
    setCancelErr('');
    try {
      await api.post(`/transfers/${cancelTarget._id}/cancel`, {});
      setCancelModalOpen(false);
      reload();
      toast.success('Pending transfer cancelled — funds restored.');
    } catch (e) {
      setCancelErr(errorMessage(e));
      toast.error(errorMessage(e));
    } finally {
      setCancelling(false);
    }
  }

  async function reload() {
    if (!activeLevel || !resolvedUnitId || resolvedUnitId === 'CENTRAL') return;
    setLoading(true);
    try {
      const q = { unitLevel: activeLevel, unitId: resolvedUnitId, direction: tab, body: targetBody };
      const r = await api.get('/transfers', { params: q });
      setItems(r.data.data || []);
      loadSourceBalance();
    } catch (err) {
      toast.error(errorMessage(err));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (resolvedUnitId && resolvedUnitId !== 'CENTRAL') {
      reload();
    }
  }, [tab, activeLevel, resolvedUnitId, targetBody]);

  // Preview destination whenever selection changes
  useEffect(() => {
    if (!picked || !activeLevel || !resolvedUnitId || resolvedUnitId === 'CENTRAL') {
      setPreview(null);
      setPreviewErr('');
      return;
    }
    let cancelled = false;
    setPreviewLoading(true);
    setPreviewErr('');
    
    api.get('/transfers/destination-preview', {
      params: {
        sourceLevel: activeLevel,
        sourceUnitId: resolvedUnitId,
        destinationId: picked.id,
      },
    }).then((res) => {
      if (!cancelled) {
        setPreview(res.data.data);
        setPreviewErr('');
      }
    }).catch((err) => {
      if (!cancelled) {
        setPreview(null);
        setPreviewErr(errorMessage(err));
      }
    }).finally(() => {
      if (!cancelled) setPreviewLoading(false);
    });

    return () => { cancelled = true; };
  }, [picked, activeLevel, resolvedUnitId]);

  async function pickImage() {
    if (Platform.OS === 'web') {
      const input = document.createElement('input');
      input.type = 'file';
      input.accept = 'image/*';
      input.onchange = (e) => {
        const file = e.target.files?.[0];
        if (file) {
          setReceipt({
            uri: URL.createObjectURL(file),
            name: file.name,
            type: file.type || 'image/jpeg',
            file: file,
          });
        }
      };
      input.click();
      return;
    }

    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== 'granted') {
      Alert.alert('Permission Denied', 'Permission to access gallery is required to attach receipts.');
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      quality: 0.8,
    });
    if (!result.canceled && result.assets?.[0]) {
      const a = result.assets[0];
      setReceipt({
        uri: a.uri,
        name: a.fileName || 'receipt.jpg',
        type: a.mimeType || 'image/jpeg',
      });
    }
  }

  function handleProceedToConfirm() {
    setModalErr('');
    if (!picked || !preview) {
      setModalErr('Please select a valid destination unit from the tree.');
      return;
    }
    const amt = parseFloat(form.amount);
    if (!form.amount || isNaN(amt) || amt <= 0) {
      setModalErr('Please enter a valid positive transfer amount.');
      return;
    }
    if (!receipt) {
      setModalErr('Proof of payment (receipt image) is required.');
      return;
    }
    setConfirmOpen(true);
  }

  async function initiate() {
    if (submitting) return;
    setSubmitting(true);
    setModalErr('');
    try {
      const fd = new FormData();
      fd.append('sourceLevel', activeLevel);
      fd.append('sourceUnitId', resolvedUnitId);
      fd.append('destinationId', preview.destination.id);
      fd.append('amount', form.amount);
      fd.append('mode', form.mode);
      if (form.reference) fd.append('reference', form.reference.trim());
      if (form.note) fd.append('note', form.note.trim());
      fd.append('body', targetBody);

      if (Platform.OS === 'web' && receipt.file) {
        fd.append('receipt', receipt.file, receipt.name || 'receipt.jpg');
      } else if (Platform.OS === 'web' && receipt.uri.startsWith('blob:')) {
        const response = await fetch(receipt.uri);
        const blob = await response.blob();
        fd.append('receipt', blob, receipt.name || 'receipt.jpg');
      } else {
        fd.append('receipt', {
          uri: receipt.uri,
          type: receipt.type || 'image/jpeg',
          name: receipt.name || 'receipt.jpg',
        });
      }

      await api.post('/transfers', fd, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });
      
      const successMsg = `Fund transfer of ${PKR(parseFloat(form.amount))} to ${preview.destination.name} initiated successfully!`;
      setForm({ amount: '', mode: 'BANK_TRANSFER', reference: '', note: '' });
      setReceipt(null);
      setPicked(null);
      setPreview(null);
      setConfirmOpen(false);
      setTransferModalOpen(false);
      reload();
      toast.success(successMsg);
    } catch (e) {
      const err = errorMessage(e);
      setModalErr(err);
      toast.error(err);
      setConfirmOpen(false);
    } finally {
      setSubmitting(false);
    }
  }

  function openRejectModal(id) {
    setRejectTargetId(id);
    setRejectReason('');
    setRejectErr('');
    setRejectModalOpen(true);
  }

  async function handleConfirmReject() {
    if (!rejectReason.trim()) {
      setRejectErr('Please provide a reason for rejecting this transfer.');
      return;
    }
    setRejecting(true);
    setRejectErr('');
    try {
      await api.post(`/transfers/${rejectTargetId}/reject`, { reason: rejectReason.trim() });
      setRejectModalOpen(false);
      reload();
      toast.success('Transfer rejected.');
    } catch (e) {
      setRejectErr(errorMessage(e));
      toast.error(errorMessage(e));
    } finally {
      setRejecting(false);
    }
  }

  function counterparty(t) {
    const name = tab === 'outgoing' ? t.destinationName : t.sourceName;
    const level = tab === 'outgoing' ? t.destinationLevel : t.sourceLevel;
    if (!name) return LEVEL_LABEL[level] || level;
    return level === 'CENTRAL' ? name : `${name} ${LEVEL_LABEL[level] || level}`;
  }

  const displayedItems = (items || []).filter((t) => {
    if (isJirgaView) return t.body === 'JIRGA';
    if (isCommitteeView) return t.body === 'COMMITTEE';
    return t.body === 'EXECUTIVE' || !t.body || (t.body !== 'COMMITTEE' && t.body !== 'JIRGA');
  });

  const unitDisplayName = isJirgaView
    ? (activeLevel === 'CENTRAL' ? 'PKNAP Central' : (ctx?.unitName ? `${ctx.unitName} Sobayi Jirga` : 'Province Jirga'))
    : (ctx?.unitName || (activeLevel === 'CENTRAL' ? 'PKNAP Central' : 'My Unit'));

  const pageTitle = isJirgaView
    ? (activeLevel === 'CENTRAL' ? 'Qomi Jirga Fund Transfers' : `Sobayi Jirga Fund Transfers · ${ctx?.unitName || 'Province'}`)
    : (isCommitteeView ? `Committee Transfers · ${unitDisplayName}` : `Executive Transfers · ${unitDisplayName}`);

  const [exporting, setExporting] = useState(null);

  async function handleExport(fmt) {
    if (exporting) return;
    setExporting(fmt);
    try {
      const qParams = {
        unitLevel: activeLevel,
        unitId: resolvedUnitId || (activeLevel === 'CENTRAL' ? 'CENTRAL' : ctx?.unitId),
        scope: 'own',
      };
      if (isJirgaView) qParams.body = 'JIRGA';
      else if (isCommitteeView) qParams.body = 'COMMITTEE';
      else qParams.body = 'EXECUTIVE';

      const safeName = (ctx?.unitName || (activeLevel === 'CENTRAL' ? 'central' : 'unit')).replace(/[^a-zA-Z0-9_-]/g, '_');
      const filename = `${safeName}-transfers.${fmt}`;
      await downloadAndShare(`/exports/unit/transfers/${fmt}`, filename, qParams);
      toast.success(`${fmt.toUpperCase()} export downloaded.`);
    } catch (e) {
      toast.error(e.message || `Export ${fmt.toUpperCase()} failed.`);
    } finally {
      setExporting(null);
    }
  }

  if (!hasFinanceAccess) {
    return (
      <SafeAreaView style={styles.safe}>
        <View style={styles.restrictedBox}>
          <Ionicons name="lock-closed-outline" size={48} color={Colors.error} style={{ marginBottom: 12 }} />
          <Text style={styles.restrictedTitle}>Finance Access Required</Text>
          <Text style={styles.restrictedText}>
            Your current role does not include finance permissions, so Fund Transfers is unavailable.
          </Text>
        </View>
      </SafeAreaView>
    );
  }

  // If user opened Jirga stream but is below Province tier, show guidance card
  if (isJirgaView && activeLevel !== 'CENTRAL' && activeLevel !== 'PROVINCE') {
    return (
      <SafeAreaView style={styles.safe}>
        <ScrollView contentContainerStyle={{ padding: Spacing.lg }}>
          <View style={styles.guidanceCard}>
            <View style={styles.guidanceIconBox}>
              <Ionicons name="people-outline" size={40} color={Colors.primary} />
            </View>
            <Text style={styles.guidanceTitle}>Jirga is only available at Provincial and Central tiers</Text>
            <Text style={styles.guidanceText}>
              Under the party constitution, the <Text style={{ fontWeight: '700' }}>Sobayi Jirga (صوبايي جرګه)</Text> operates at the Province level, and the <Text style={{ fontWeight: '700' }}>Qomi Jirga / National Jirga (قومي جرګه)</Text> operates at the Central level. District and Area units operate via <Text style={{ fontWeight: '700' }}>Zilla & Elaqayi Committees</Text>.
            </Text>

            <View style={styles.guidanceBtnCol}>
              {isHigherAdmin(user) && (
                <TouchableOpacity
                  style={styles.guidanceBtnPrimary}
                  onPress={() => {
                    setCtx({ unitLevel: 'CENTRAL', unitId: 'CENTRAL', unitName: 'PKNAP Central' });
                  }}
                >
                  <Ionicons name="globe-outline" size={18} color="#fff" style={{ marginRight: 6 }} />
                  <Text style={styles.guidanceBtnPrimaryText}>Open Qomi Jirga (Central)</Text>
                </TouchableOpacity>
              )}

              {user?.scope?.provinceId && (
                <TouchableOpacity
                  style={styles.guidanceBtnSecondary}
                  onPress={() => {
                    setCtx({ unitLevel: 'PROVINCE', unitId: user.scope.provinceId, unitName: user.scope.provinceName || 'Province' });
                  }}
                >
                  <Ionicons name="location-outline" size={18} color={Colors.primary} style={{ marginRight: 6 }} />
                  <Text style={styles.guidanceBtnSecondaryText}>Open My Sobayi Jirga</Text>
                </TouchableOpacity>
              )}

              {isHigherAdmin(user) && provinces && provinces.length > 0 && (
                <View style={{ marginTop: 12 }}>
                  <Text style={styles.guidanceSubHead}>OR SWITCH TO PROVINCIAL SOBAYI JIRGA:</Text>
                  <View style={styles.provGrid}>
                    {provinces.map((prov) => (
                      <TouchableOpacity
                        key={prov._id}
                        style={styles.provPillBtn}
                        onPress={() => setCtx({ unitLevel: 'PROVINCE', unitId: prov._id, unitName: prov.name })}
                      >
                        <Text style={styles.provPillBtnText}>{prov.name} Sobayi Jirga →</Text>
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
      <View style={[styles.mainContainer, isTablet && styles.mainContainerTablet]}>
        
        {/* Header */}
        <View style={[styles.header, isSmall && styles.headerSmall]}>
          <View style={styles.headerTitleWrap}>
            <Text style={styles.pageTitle}>{pageTitle}</Text>
            <Text style={styles.pageSubtitle}>
              {unitDisplayName} · {activeLevel.replace('_', ' ')}
            </Text>
          </View>
          <View style={styles.headerActions}>
            <TouchableOpacity
              style={styles.iconBtn}
              onPress={() => handleExport('pdf')}
              disabled={!!exporting}
            >
              {exporting === 'pdf' ? (
                <ActivityIndicator size="small" color={Colors.primary} />
              ) : (
                <>
                  <Ionicons name="document-text-outline" size={18} color={Colors.primary} />
                  {isTablet && <Text style={styles.iconBtnText}>PDF</Text>}
                </>
              )}
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.iconBtn}
              onPress={() => handleExport('xlsx')}
              disabled={!!exporting}
            >
              {exporting === 'xlsx' ? (
                <ActivityIndicator size="small" color={Colors.primary} />
              ) : (
                <>
                  <Ionicons name="grid-outline" size={18} color={Colors.primary} />
                  {isTablet && <Text style={styles.iconBtnText}>Excel</Text>}
                </>
              )}
            </TouchableOpacity>
            {canSend && (
              <TouchableOpacity style={styles.primaryBtn} onPress={openInitiate}>
                <Ionicons name="send" size={15} color="#fff" />
                <Text style={styles.primaryBtnText}>{isTablet ? '+ Initiate Transfer' : 'Transfer'}</Text>
              </TouchableOpacity>
            )}
          </View>
        </View>

        {/* Scope banner */}
        <View style={styles.banner}>
          <Ionicons name="information-circle-outline" size={18} color={Colors.primary} style={{ marginRight: 8, marginTop: 1 }} />
          <Text style={styles.bannerText}>
            <Text style={{ fontWeight: '700', color: Colors.text }}>{unitDisplayName}</Text>{' '}
            {activeLevel === 'CENTRAL'
              ? 'may send funds to any unit in the organization.'
              : activeLevel === 'PROVINCE'
                ? 'may send funds to any unit in the organization, including other provinces.'
                : 'may send funds to any unit within its own province, or to the Center.'}
            {' '}The destination unit receives and acknowledges the funds.
          </Text>
        </View>

        {/* Tabs */}
        <View style={styles.tabRow}>
          <TouchableOpacity style={[styles.tab, tab === 'outgoing' && styles.tabActive]} onPress={() => setTab('outgoing')}>
            <Ionicons name="arrow-up-circle-outline" size={16} color={tab === 'outgoing' ? Colors.primary : Colors.textMuted} style={{ marginRight: 6 }} />
            <Text style={[styles.tabText, tab === 'outgoing' && styles.tabTextActive]}>Outgoing Transfers</Text>
          </TouchableOpacity>
          <TouchableOpacity style={[styles.tab, tab === 'incoming' && styles.tabActive]} onPress={() => setTab('incoming')}>
            <Ionicons name="arrow-down-circle-outline" size={16} color={tab === 'incoming' ? Colors.primary : Colors.textMuted} style={{ marginRight: 6 }} />
            <Text style={[styles.tabText, tab === 'incoming' && styles.tabTextActive]}>Incoming Transfers</Text>
          </TouchableOpacity>
        </View>

        {/* Table / List View */}
        {loading ? (
          <ActivityIndicator size="large" color={Colors.primary} style={{ marginTop: 40 }} />
        ) : (
          <ScrollView 
            style={styles.tableScroll} 
            horizontal={!isTablet} 
            showsHorizontalScrollIndicator={true}
          >
            <View style={{ minWidth: isTablet ? '100%' : 920, width: isTablet ? '100%' : undefined }}>
              <View style={styles.thRow}>
                <Text style={[styles.th, { width: isTablet ? '11%' : 95 }]}>Date</Text>
                <Text style={[styles.th, { width: isTablet ? '23%' : 220 }]}>{tab === 'outgoing' ? 'To Destination' : 'From Sender'}</Text>
                <Text style={[styles.th, { width: isTablet ? '13%' : 120 }]}>Mode</Text>
                <Text style={[styles.th, { width: isTablet ? '13%' : 120 }]}>Reference</Text>
                <Text style={[styles.th, { width: isTablet ? '12%' : 110, textAlign: 'right' }]}>Amount</Text>
                <Text style={[styles.th, { width: isTablet ? '9%' : 80, textAlign: 'center' }]}>Receipt</Text>
                <Text style={[styles.th, { width: isTablet ? '10%' : 115 }]}>State</Text>
                <Text style={[styles.th, { width: isTablet ? '14%' : 160, textAlign: 'center' }]}>Actions</Text>
              </View>

              {displayedItems.length === 0 ? (
                <Text style={styles.emptyText}>No {isJirgaView ? 'Jirga' : (isCommitteeView ? 'committee' : 'executive')} transfers in this view.</Text>
              ) : (
                displayedItems.map((t) => (
                  <View key={t._id} style={styles.tr}>
                    <Text style={[styles.td, { width: isTablet ? '11%' : 95 }]} numberOfLines={1}>
                      {shortDate(t.createdAt)}
                    </Text>
                    
                    <View style={[styles.td, { width: isTablet ? '23%' : 220, flexDirection: 'row', alignItems: 'center' }]}>
                      <View style={{
                        backgroundColor: t.body === 'JIRGA' ? '#f3e8ff' : (t.body === 'COMMITTEE' ? '#e0f2fe' : '#f1f5f9'),
                        paddingHorizontal: 5, paddingVertical: 2, borderRadius: 4, marginRight: 6,
                        borderWidth: t.body === 'JIRGA' ? 1 : 0, borderColor: '#d8b4fe'
                      }}>
                        <Text style={{
                          color: t.body === 'JIRGA' ? '#6b21a8' : (t.body === 'COMMITTEE' ? '#0369a1' : '#475569'),
                          fontSize: 9, fontWeight: '700'
                        }}>
                          {t.body === 'JIRGA' ? 'Jirga' : (t.body === 'COMMITTEE' ? 'Comm' : 'Exec')}
                        </Text>
                      </View>
                      <Text numberOfLines={2} style={{ flex: 1, fontSize: FontSize.sm, color: Colors.text, fontWeight: '600' }}>
                        {counterparty(t)}
                      </Text>
                    </View>

                    <Text style={[styles.td, { width: isTablet ? '13%' : 120 }]} numberOfLines={1}>{t.mode?.replace('_', ' ')}</Text>
                    <Text style={[styles.td, { width: isTablet ? '13%' : 120, color: Colors.textMuted }]} numberOfLines={1}>{t.reference || '—'}</Text>
                    <Text style={[styles.td, { width: isTablet ? '12%' : 110, textAlign: 'right', fontWeight: '700', color: Colors.text }]} numberOfLines={1}>
                      {PKR(t.amount)}
                    </Text>
                    
                    <View style={[styles.td, { width: isTablet ? '9%' : 80, alignItems: 'center', justifyContent: 'center' }]}>
                      {t.receiptImageUrl ? (
                        <TouchableOpacity 
                          style={styles.receiptPill}
                          onPress={() => setPreviewUrl(resolveMediaUrl(t.receiptImageUrl))}
                        >
                          <Ionicons name="image" size={13} color={Colors.primary} />
                          <Text style={styles.receiptPillText}>View</Text>
                        </TouchableOpacity>
                      ) : (
                        <Text style={{ color: Colors.textMuted }}>—</Text>
                      )}
                    </View>

                    <View style={[styles.td, { width: isTablet ? '10%' : 115, justifyContent: 'center' }]}>
                      <Badge variant={t.state === 'ACKNOWLEDGED' ? 'success' : t.state === 'REJECTED' ? 'error' : (t.state === 'CANCELLED' ? 'muted' : 'warning')} label={t.state} />
                      {t.state === 'REJECTED' && t.decisionNote && (
                        <Text style={{ fontSize: 10, color: Colors.error, marginTop: 2 }} numberOfLines={2}>
                          {t.decisionNote}
                        </Text>
                      )}
                    </View>

                    <View style={[styles.td, { width: isTablet ? '14%' : 160, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6 }]}>
                      {tab === 'incoming' && t.state === 'PENDING_ACK' ? (
                        <>
                          <TouchableOpacity style={[styles.btnSmall, { backgroundColor: Colors.primary }]} onPress={() => openApproveModal(t)}>
                            <Text style={{ color: '#fff', fontSize: 11, fontWeight: '700' }}>Approve</Text>
                          </TouchableOpacity>
                          <TouchableOpacity style={[styles.btnSmall, { backgroundColor: Colors.error }]} onPress={() => openRejectModal(t._id)}>
                            <Text style={{ color: '#fff', fontSize: 11, fontWeight: '700' }}>Reject</Text>
                          </TouchableOpacity>
                        </>
                      ) : tab === 'outgoing' && t.state === 'PENDING_ACK' ? (
                        <TouchableOpacity style={[styles.btnSmall, { backgroundColor: '#e11d48' }]} onPress={() => openCancelModal(t)}>
                          <Text style={{ color: '#fff', fontSize: 11, fontWeight: '700' }}>Cancel</Text>
                        </TouchableOpacity>
                      ) : (
                        <Text style={{ color: Colors.textMuted, fontSize: 11 }}>—</Text>
                      )}
                    </View>
                  </View>
                ))
              )}
            </View>
          </ScrollView>
        )}

      </View>

      {/* Initiate Transfer Modal */}
      <Modal visible={transferModalOpen} animationType="slide" presentationStyle={isTablet ? 'overFullScreen' : 'pageSheet'} transparent={isTablet} onRequestClose={() => setTransferModalOpen(false)}>
        <SafeAreaView style={[styles.modalSafeWrapper, isTablet && styles.modalSafeWrapperTablet]}>
          <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={[styles.modalCard, isTablet && styles.modalCardTablet]}>
            
            {/* Modal Header */}
            <View style={styles.modalHeader}>
              <View>
                <Text style={styles.modalTitle}>Initiate Fund Transfer</Text>
                <Text style={{ fontSize: FontSize.xs, color: Colors.textMuted, marginTop: 2 }}>
                  Transfer funds securely to any destination within policy.
                </Text>
              </View>
              <TouchableOpacity onPress={() => setTransferModalOpen(false)} style={styles.closeBtn}>
                <Ionicons name="close" size={24} color={Colors.text} />
              </TouchableOpacity>
            </View>
            
            {/* Modal Body: 2 Columns on Tablet/Desktop, 1 Column on Mobile */}
            <View style={[styles.transferModalLayout, isTablet && styles.transferModalLayoutTablet]}>
              
              {/* Left Column: Org Tree */}
              <View style={[styles.treeCol, isTablet && styles.treeColTablet]}>
                <Text style={styles.fieldLabel}>Choose Destination (from Tree) *</Text>
                <View style={[styles.treeContainer, isTablet && { height: Math.min(520, height * 0.55) }]}>
                  <OrgTree 
                    selectedId={picked?.id} 
                    disabledId={resolvedUnitId} 
                    source={{ level: activeLevel, unitId: resolvedUnitId }}
                    onSelect={(node) => setPicked(node)}
                  />
                </View>
              </View>

              {/* Right Column: Form Inputs */}
              <ScrollView 
                style={[styles.formCol, isTablet && styles.formColTablet]} 
                contentContainerStyle={{ padding: isTablet ? Spacing.md : Spacing.lg, paddingBottom: 40 }}
                keyboardShouldPersistTaps="handled"
              >
                {/* Inline Error Alert Banner */}
                {modalErr ? (
                  <View style={styles.alertError}>
                    <Ionicons name="alert-circle" size={18} color={Colors.error} style={{ marginRight: 8 }} />
                    <Text style={styles.alertErrorText}>{modalErr}</Text>
                  </View>
                ) : null}

                {/* Transfer From */}
                <View style={styles.field}>
                  <Text style={styles.fieldLabel}>Transfer From (Source)</Text>
                  <View style={styles.endpointCard}>
                    <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                      <Text style={styles.endpointLevel}>{LEVEL_LABEL[activeLevel] || activeLevel}</Text>
                      {sourceBalance !== null && (
                        <Text style={{ fontSize: 12, fontWeight: '700', color: sourceBalance > 0 ? '#15803d' : '#b91c1c' }}>
                          Available: {PKR(sourceBalance)}
                        </Text>
                      )}
                    </View>
                    <Text style={styles.endpointName}>{unitDisplayName}</Text>
                    {pendingOutAmount > 0 && (
                      <Text style={{ fontSize: 11, color: '#d97706', marginTop: 4 }}>
                        ⚠️ {PKR(pendingOutAmount)} committed in unacknowledged Outgoing transfers
                      </Text>
                    )}
                  </View>
                </View>

                {/* Selected Destination Card */}
                <View style={styles.field}>
                  <Text style={styles.fieldLabel}>Selected Destination</Text>
                  {!picked ? (
                    <View style={[styles.endpointCard, { backgroundColor: '#f8fafc', borderColor: '#e2e8f0' }]}>
                      <Text style={{ color: Colors.textMuted, fontStyle: 'italic', fontSize: FontSize.sm }}>
                        👈 Pick a destination unit from the organization tree.
                      </Text>
                    </View>
                  ) : previewLoading ? (
                    <View style={[styles.endpointCard, { flexDirection: 'row', alignItems: 'center', gap: 8 }]}>
                      <ActivityIndicator size="small" color={Colors.primary} />
                      <Text style={{ color: Colors.textMuted }}>Validating transfer routing...</Text>
                    </View>
                  ) : previewErr ? (
                    <View style={[styles.endpointCard, { backgroundColor: '#fef2f2', borderColor: '#fecaca' }]}>
                      <Text style={{ color: Colors.error, fontSize: FontSize.sm, fontWeight: '600' }}>{previewErr}</Text>
                    </View>
                  ) : preview ? (
                    <View style={[styles.endpointCard, { backgroundColor: '#f0fdf4', borderColor: '#bbf7d0' }]}>
                      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                        <Text style={[styles.endpointName, { color: '#166534' }]}>{preview.destination.name}</Text>
                        {preview.direction && (
                          <View style={{ backgroundColor: '#dcfce7', paddingHorizontal: 6, paddingVertical: 2, borderRadius: 4 }}>
                            <Text style={{ fontSize: 10, fontWeight: '700', color: '#15803d' }}>
                              {DIRECTION_LABEL[preview.direction] || preview.direction}
                            </Text>
                          </View>
                        )}
                      </View>
                      <Text style={{ fontSize: FontSize.xs, color: '#15803d', marginTop: 2, fontWeight: '600' }}>
                        {LEVEL_LABEL[preview.destination.level] || preview.destination.level}
                      </Text>
                      {preview.path && preview.path.length > 0 && (
                        <Text style={{ fontSize: 11, color: '#166534', marginTop: 4 }}>
                          Hierarchy: {preview.path.map(p => p.name).join(' → ')}
                        </Text>
                      )}
                    </View>
                  ) : null}
                </View>

                {/* Amount */}
                <View style={styles.field}>
                  <Text style={styles.fieldLabel}>Amount (PKR) <Text style={{ color: Colors.error }}>*</Text></Text>
                  <TextInput 
                    style={styles.fieldInput} 
                    keyboardType="numeric"
                    placeholder="e.g. 50000"
                    placeholderTextColor={Colors.textMuted}
                    value={form.amount}
                    onChangeText={(val) => {
                      setForm({ ...form, amount: val });
                      if (modalErr) setModalErr('');
                    }}
                  />
                  {sourceBalance !== null && (
                    <Text style={{ fontSize: 11, color: Colors.textMuted, marginTop: 4 }}>
                      Maximum transferable: <Text style={{ fontWeight: '700', color: sourceBalance > 0 ? '#15803d' : '#b91c1c' }}>{PKR(sourceBalance)}</Text>
                    </Text>
                  )}
                </View>

                {/* Mode & Reference in 2 columns on Tablet */}
                <View style={[styles.rowFields, isTablet && styles.rowFieldsTablet]}>
                  <View style={[styles.field, isTablet && { flex: 1 }]}>
                    <Text style={styles.fieldLabel}>Payment Mode</Text>
                    <View style={styles.pickerWrapper}>
                      <Picker
                        selectedValue={form.mode}
                        onValueChange={(val) => setForm({ ...form, mode: val })}
                      >
                        {PAYMENT_MODES.map(m => (
                          <Picker.Item key={m} label={m.replace('_', ' ')} value={m} />
                        ))}
                      </Picker>
                    </View>
                  </View>

                  <View style={[styles.field, isTablet && { flex: 1 }]}>
                    <Text style={styles.fieldLabel}>Reference / Cheque No.</Text>
                    <TextInput 
                      style={styles.fieldInput} 
                      placeholder="e.g. TXN-998811"
                      placeholderTextColor={Colors.textMuted}
                      value={form.reference}
                      onChangeText={(val) => setForm({ ...form, reference: val })}
                    />
                  </View>
                </View>

                {/* Notes */}
                <View style={styles.field}>
                  <Text style={styles.fieldLabel}>Notes</Text>
                  <TextInput 
                    style={[styles.fieldInput, { height: 60 }]} 
                    placeholder="Optional transfer note for receiver"
                    placeholderTextColor={Colors.textMuted}
                    multiline
                    value={form.note}
                    onChangeText={(val) => setForm({ ...form, note: val })}
                  />
                </View>

                {/* Receipt upload */}
                <View style={styles.field}>
                  <Text style={styles.fieldLabel}>Receipt / Payment Proof <Text style={{ color: Colors.error }}>*</Text></Text>
                  <TouchableOpacity style={styles.uploadBtn} onPress={pickImage}>
                    <Ionicons name="cloud-upload-outline" size={20} color={Colors.primary} style={{ marginRight: 8 }} />
                    <Text style={styles.uploadBtnText}>{receipt ? 'Change Receipt Image' : 'Attach Receipt Image (PNG / JPG)'}</Text>
                  </TouchableOpacity>
                  {receipt && (
                    <View style={styles.receiptPreview}>
                      <Image source={{ uri: receipt.uri }} style={styles.receiptThumb} />
                      <Text style={styles.receiptName} numberOfLines={1}>{receipt.name || 'receipt.jpg'}</Text>
                      <Ionicons name="checkmark-circle" size={18} color="#15803d" />
                    </View>
                  )}
                </View>

                {/* Action buttons */}
                <View style={{ flexDirection: 'row', gap: 10, marginTop: 14 }}>
                  <TouchableOpacity 
                    style={[styles.btnSecondary, { flex: 1, alignItems: 'center', paddingVertical: 12 }]} 
                    onPress={() => setTransferModalOpen(false)}
                  >
                    <Text style={styles.btnSecondaryText}>Cancel</Text>
                  </TouchableOpacity>
                  <TouchableOpacity 
                    style={[styles.primaryBtn, { flex: 2, justifyContent: 'center', paddingVertical: 12 }]} 
                    onPress={handleProceedToConfirm}
                  >
                    <Text style={[styles.primaryBtnText, { fontSize: FontSize.sm }]}>Proceed to Confirm ➔</Text>
                  </TouchableOpacity>
                </View>

              </ScrollView>
            </View>

          </KeyboardAvoidingView>
        </SafeAreaView>
      </Modal>

      {/* Confirmation Modal */}
      {confirmOpen && preview && (
        <Modal visible={confirmOpen} transparent animationType="fade" onRequestClose={() => setConfirmOpen(false)}>
          <View style={styles.modalBackdrop}>
            <View style={[styles.confirmModal, { maxWidth: 540 }]}>
              <Text style={styles.confirmTitle}>Confirm Transfer Summary</Text>
              <Text style={styles.confirmSubtitle}>Please review transfer details before dispatching funds.</Text>

              <View style={styles.summaryTable}>
                <View style={styles.summaryRow}>
                  <Text style={styles.summaryKey}>From</Text>
                  <Text style={styles.summaryVal}>{unitDisplayName} ({LEVEL_LABEL[activeLevel] || activeLevel})</Text>
                </View>
                <View style={styles.summaryRow}>
                  <Text style={styles.summaryKey}>To</Text>
                  <Text style={styles.summaryVal}>{preview.destination.name}</Text>
                </View>
                <View style={styles.summaryRow}>
                  <Text style={styles.summaryKey}>Destination Level</Text>
                  <Text style={styles.summaryVal}>{preview.destination.level}</Text>
                </View>
                {preview.path && (
                  <View style={styles.summaryRow}>
                    <Text style={styles.summaryKey}>Hierarchy</Text>
                    <Text style={styles.summaryVal}>{preview.path.map(p => p.name).join(' → ')}</Text>
                  </View>
                )}
                <View style={styles.summaryRow}>
                  <Text style={styles.summaryKey}>Amount</Text>
                  <Text style={[styles.summaryVal, { fontWeight: '800', color: Colors.primary, fontSize: FontSize.base }]}>
                    {form.amount ? PKR(parseFloat(form.amount)) : '—'}
                  </Text>
                </View>
                <View style={styles.summaryRow}>
                  <Text style={styles.summaryKey}>Receipt</Text>
                  <Text style={styles.summaryVal}>{receipt ? `Attached (${receipt.name || 'image'})` : 'None'}</Text>
                </View>
                <View style={styles.summaryRow}>
                  <Text style={styles.summaryKey}>Mode</Text>
                  <Text style={styles.summaryVal}>{form.mode} {form.reference ? `· ${form.reference}` : ''}</Text>
                </View>
                {form.note ? (
                  <View style={styles.summaryRow}>
                    <Text style={styles.summaryKey}>Notes</Text>
                    <Text style={styles.summaryVal}>{form.note}</Text>
                  </View>
                ) : null}
              </View>

              <View style={{ flexDirection: 'row', gap: 10, marginTop: 20, justifyContent: 'flex-end' }}>
                <TouchableOpacity 
                  style={[styles.btnSecondary, { paddingHorizontal: 16, paddingVertical: 10 }]} 
                  disabled={submitting} 
                  onPress={() => setConfirmOpen(false)}
                >
                  <Text style={styles.btnSecondaryText}>Back</Text>
                </TouchableOpacity>
                <TouchableOpacity 
                  style={[styles.primaryBtn, { paddingHorizontal: 18, paddingVertical: 10, flexDirection: 'row', alignItems: 'center', gap: 6 }]} 
                  disabled={submitting} 
                  onPress={initiate}
                >
                  {submitting && <ActivityIndicator size="small" color="#fff" />}
                  <Text style={styles.primaryBtnText}>{submitting ? 'Transferring…' : 'Confirm & Send'}</Text>
                </TouchableOpacity>
              </View>
            </View>
          </View>
        </Modal>
      )}

      {/* Cancel Modal */}
      {cancelModalOpen && cancelTarget && (
        <Modal visible={cancelModalOpen} transparent animationType="fade" onRequestClose={() => !cancelling && setCancelModalOpen(false)}>
          <View style={styles.modalBackdrop}>
            <View style={[styles.confirmModal, { maxWidth: 500 }]}>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                <Text style={styles.confirmTitle}>Cancel Pending Transfer</Text>
                <TouchableOpacity onPress={() => !cancelling && setCancelModalOpen(false)}>
                  <Ionicons name="close" size={24} color={Colors.text} />
                </TouchableOpacity>
              </View>
              <Text style={styles.confirmSubtitle}>
                Are you sure you want to cancel the transfer of <Text style={{ fontWeight: '700', color: Colors.text }}>{PKR(cancelTarget.amount)}</Text> to <Text style={{ fontWeight: '700', color: Colors.text }}>{cancelTarget.destinationName}</Text>?
              </Text>
              <Text style={{ fontSize: 12, color: '#15803d', marginTop: 6, fontWeight: '600' }}>
                ✓ Committed funds will be restored immediately to your available balance.
              </Text>

              {cancelErr ? (
                <View style={[styles.alertError, { marginTop: 12 }]}>
                  <Ionicons name="alert-circle" size={18} color={Colors.error} style={{ marginRight: 6 }} />
                  <Text style={styles.alertErrorText}>{cancelErr}</Text>
                </View>
              ) : null}

              <View style={{ flexDirection: 'row', gap: 10, marginTop: 20, justifyContent: 'flex-end' }}>
                <TouchableOpacity 
                  style={[styles.btnSecondary, { paddingHorizontal: 16, paddingVertical: 10 }]} 
                  disabled={cancelling} 
                  onPress={() => setCancelModalOpen(false)}
                >
                  <Text style={styles.btnSecondaryText}>Keep Transfer</Text>
                </TouchableOpacity>
                <TouchableOpacity 
                  style={[{ backgroundColor: Colors.error, borderRadius: Radius.md, paddingHorizontal: 18, paddingVertical: 10, flexDirection: 'row', alignItems: 'center', gap: 6 }]} 
                  disabled={cancelling} 
                  onPress={handleConfirmCancel}
                >
                  {cancelling && <ActivityIndicator size="small" color="#fff" />}
                  <Text style={{ color: '#fff', fontWeight: '700', fontSize: FontSize.sm }}>{cancelling ? 'Cancelling…' : 'Yes, Cancel Transfer'}</Text>
                </TouchableOpacity>
              </View>
            </View>
          </View>
        </Modal>
      )}

      {/* Approve / Review Receipt Modal */}
      {approveModalOpen && approveTarget && (
        <Modal visible={approveModalOpen} transparent animationType="slide" onRequestClose={() => !approving && setApproveModalOpen(false)}>
          <View style={styles.modalBackdrop}>
            <View style={[styles.confirmModal, { maxHeight: '90%', width: '92%', maxWidth: 540 }]}>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
                <View style={{ flex: 1, marginRight: 8 }}>
                  <Text style={styles.confirmTitle}>Review & Acknowledge</Text>
                  <Text style={{ fontSize: 12, color: Colors.textMuted }}>Verify payment receipt and details before accepting funds.</Text>
                </View>
                <TouchableOpacity onPress={() => !approving && setApproveModalOpen(false)}>
                  <Ionicons name="close" size={24} color={Colors.text} />
                </TouchableOpacity>
              </View>

              <ScrollView showsVerticalScrollIndicator={false}>
                {approveErr ? (
                  <View style={[styles.alertError, { marginBottom: 12 }]}>
                    <Ionicons name="alert-circle" size={18} color={Colors.error} style={{ marginRight: 6 }} />
                    <Text style={styles.alertErrorText}>{approveErr}</Text>
                  </View>
                ) : null}

                {/* Summary Table */}
                <View style={styles.summaryTable}>
                  <View style={styles.summaryRow}>
                    <Text style={styles.summaryKey}>From Unit</Text>
                    <Text style={styles.summaryVal}>{approveTarget.sourceName} ({LEVEL_LABEL[approveTarget.sourceLevel] || approveTarget.sourceLevel})</Text>
                  </View>
                  <View style={styles.summaryRow}>
                    <Text style={styles.summaryKey}>Amount</Text>
                    <Text style={[styles.summaryVal, { fontWeight: '800', color: '#15803d', fontSize: FontSize.md }]}>
                      {PKR(approveTarget.amount)}
                    </Text>
                  </View>
                  <View style={styles.summaryRow}>
                    <Text style={styles.summaryKey}>Payment Mode</Text>
                    <Text style={styles.summaryVal}>{approveTarget.mode} {approveTarget.reference ? `· Ref: ${approveTarget.reference}` : ''}</Text>
                  </View>
                  {approveTarget.note ? (
                    <View style={styles.summaryRow}>
                      <Text style={styles.summaryKey}>Sender Note</Text>
                      <Text style={styles.summaryVal}>{approveTarget.note}</Text>
                    </View>
                  ) : null}
                </View>

                {/* Receipt Image Box */}
                <Text style={{ fontSize: 13, fontWeight: '700', color: Colors.text, marginTop: 14, marginBottom: 6 }}>
                  Payment Proof / Receipt
                </Text>
                {approveTarget.receiptImageUrl ? (
                  <View style={{ borderRadius: Radius.md, overflow: 'hidden', borderWidth: 1, borderColor: Colors.border, backgroundColor: '#0f172a' }}>
                    <Image 
                      source={{ uri: resolveMediaUrl(approveTarget.receiptImageUrl) }} 
                      style={{ width: '100%', height: Math.min(260, height * 0.35) }} 
                      resizeMode="contain" 
                    />
                    <TouchableOpacity 
                      style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, paddingVertical: 8, backgroundColor: 'rgba(15, 23, 42, 0.8)' }}
                      onPress={() => {
                        setPreviewUrl(resolveMediaUrl(approveTarget.receiptImageUrl));
                      }}
                    >
                      <Ionicons name="expand-outline" size={16} color="#fff" />
                      <Text style={{ color: '#fff', fontSize: 12, fontWeight: '600' }}>Tap to view full size</Text>
                    </TouchableOpacity>
                  </View>
                ) : (
                  <View style={{ padding: 14, backgroundColor: '#fef3c7', borderRadius: Radius.md, flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                    <Ionicons name="warning-outline" size={20} color="#b45309" />
                    <Text style={{ color: '#92400e', fontSize: 12, flex: 1 }}>No receipt image was attached by the sender.</Text>
                  </View>
                )}

                {/* Optional Note */}
                <Text style={{ fontSize: 12, fontWeight: '600', color: Colors.textMuted, marginTop: 14, marginBottom: 4 }}>
                  Acknowledgment Note (Optional)
                </Text>
                <TextInput
                  style={[styles.fieldInput, { height: 44 }]}
                  placeholder="e.g. Verified via Bank Alfalah ref #12345"
                  placeholderTextColor={Colors.textMuted}
                  value={approveNote}
                  onChangeText={setApproveNote}
                />
              </ScrollView>

              <View style={{ flexDirection: 'row', gap: 10, marginTop: 16, justifyContent: 'flex-end', paddingTop: 10, borderTopWidth: 1, borderTopColor: Colors.border }}>
                <TouchableOpacity 
                  style={[styles.btnSecondary, { paddingHorizontal: 14, paddingVertical: 10 }]} 
                  disabled={approving} 
                  onPress={() => setApproveModalOpen(false)}
                >
                  <Text style={styles.btnSecondaryText}>Close</Text>
                </TouchableOpacity>
                <TouchableOpacity 
                  style={[{ backgroundColor: Colors.error, borderRadius: Radius.md, paddingHorizontal: 14, paddingVertical: 10, justifyContent: 'center' }]} 
                  disabled={approving} 
                  onPress={() => {
                    const id = approveTarget._id;
                    setApproveModalOpen(false);
                    openRejectModal(id);
                  }}
                >
                  <Text style={{ color: '#fff', fontWeight: '700', fontSize: FontSize.sm }}>Reject</Text>
                </TouchableOpacity>
                <TouchableOpacity 
                  style={[{ backgroundColor: '#15803d', borderRadius: Radius.md, paddingHorizontal: 16, paddingVertical: 10, flexDirection: 'row', alignItems: 'center', gap: 6 }]} 
                  disabled={approving} 
                  onPress={handleConfirmApprove}
                >
                  {approving && <ActivityIndicator size="small" color="#fff" />}
                  <Text style={{ color: '#fff', fontWeight: '700', fontSize: FontSize.sm }}>
                    {approving ? 'Acknowledging…' : `Accept Funds (${PKR(approveTarget.amount)})`}
                  </Text>
                </TouchableOpacity>
              </View>
            </View>
          </View>
        </Modal>
      )}

      {/* Receipt Image Preview Modal */}
      {previewUrl && (
        <Modal visible={!!previewUrl} transparent animationType="fade" onRequestClose={() => setPreviewUrl(null)}>
          <View style={styles.modalBackdrop}>
            <View style={[styles.confirmModal, { maxWidth: 640, width: '94%' }]}>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
                <Text style={styles.confirmTitle}>Receipt / Proof of Payment</Text>
                <TouchableOpacity onPress={() => setPreviewUrl(null)}>
                  <Ionicons name="close" size={24} color={Colors.text} />
                </TouchableOpacity>
              </View>
              <Image 
                source={{ uri: resolveMediaUrl(previewUrl) }} 
                style={{ width: '100%', height: Math.min(420, height * 0.5), borderRadius: 8, backgroundColor: '#0f172a' }} 
                resizeMode="contain" 
              />
              <View style={{ marginTop: 16, alignItems: 'flex-end' }}>
                <TouchableOpacity style={styles.btnSecondary} onPress={() => setPreviewUrl(null)}>
                  <Text style={styles.btnSecondaryText}>Close</Text>
                </TouchableOpacity>
              </View>
            </View>
          </View>
        </Modal>
      )}

    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: Colors.background },
  mainContainer: { flex: 1, width: '100%' },
  mainContainerTablet: { maxWidth: 1200, alignSelf: 'center' },

  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.md,
    backgroundColor: Colors.surface,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
    flexWrap: 'wrap',
    gap: 12,
  },
  headerSmall: {
    paddingHorizontal: Spacing.md,
    paddingVertical: 12,
  },
  headerTitleWrap: { flex: 1, minWidth: 180 },
  pageTitle: { fontSize: FontSize.lg, fontWeight: '800', color: Colors.text },
  pageSubtitle: { fontSize: FontSize.xs, color: Colors.textMuted, marginTop: 2 },
  headerActions: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  
  iconBtn: {
    backgroundColor: Colors.surfaceAlt,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: Radius.md,
    borderWidth: 1,
    borderColor: Colors.border,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  iconBtnText: {
    fontSize: FontSize.xs,
    fontWeight: '600',
    color: Colors.text,
  },
  primaryBtn: {
    backgroundColor: Colors.primary,
    paddingVertical: 8,
    paddingHorizontal: 14,
    borderRadius: Radius.md,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    ...Platform.select({
      web: {
        boxShadow: '0 2px 3px rgba(30, 64, 175, 0.18)',
      },
      default: {
        shadowColor: Colors.primary,
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.18,
        shadowRadius: 3,
        elevation: 2,
      },
    }),
  },
  primaryBtnText: { fontSize: FontSize.xs, fontWeight: '700', color: '#fff' },
  btnSecondary: {
    backgroundColor: Colors.surfaceAlt,
    borderWidth: 1,
    borderColor: Colors.border,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: Radius.md,
  },
  btnSecondaryText: { color: Colors.text, fontSize: FontSize.sm, fontWeight: '600' },
  btnSmall: { paddingHorizontal: 10, paddingVertical: 6, borderRadius: Radius.sm },
  
  tierPillsWrapper: { paddingHorizontal: Spacing.lg, paddingVertical: 10, backgroundColor: Colors.surface, borderBottomWidth: 1, borderBottomColor: Colors.border },
  tierPillsScroll: { flexDirection: 'row', gap: 8 },
  tierPill: { paddingHorizontal: 14, paddingVertical: 7, borderRadius: 20, backgroundColor: Colors.surfaceAlt, borderWidth: 1, borderColor: Colors.border },
  tierPillActive: { backgroundColor: Colors.primary, borderColor: Colors.primary },
  tierPillText: { fontSize: FontSize.xs, fontWeight: '600', color: Colors.text },
  tierPillTextActive: { color: '#fff', fontWeight: '700' },

  banner: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    marginHorizontal: Spacing.lg,
    marginVertical: 10,
    padding: 12,
    backgroundColor: '#f8fafc',
    borderRadius: Radius.md,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  bannerText: { flex: 1, fontSize: FontSize.xs, color: Colors.textMuted, lineHeight: 18 },

  tabRow: {
    flexDirection: 'row',
    paddingHorizontal: Spacing.lg,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
    backgroundColor: Colors.surface,
  },
  tab: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderBottomWidth: 2,
    borderBottomColor: 'transparent',
  },
  tabActive: { borderBottomColor: Colors.primary },
  tabText: { fontSize: FontSize.sm, fontWeight: '500', color: Colors.textMuted },
  tabTextActive: { color: Colors.primary, fontWeight: '700' },

  tableScroll: { flex: 1, backgroundColor: Colors.surface },
  thRow: { flexDirection: 'row', backgroundColor: '#f8fafc', borderBottomWidth: 1, borderBottomColor: Colors.border, paddingVertical: 10, paddingHorizontal: Spacing.md, alignItems: 'center' },
  th: { fontSize: FontSize.xs, fontWeight: '700', color: Colors.textMuted, textTransform: 'uppercase' },
  tr: { flexDirection: 'row', borderBottomWidth: 1, borderBottomColor: Colors.border, paddingVertical: 12, paddingHorizontal: Spacing.md, alignItems: 'center' },
  td: { fontSize: FontSize.sm, color: Colors.text },
  emptyText: { textAlign: 'center', padding: Spacing.xl, color: Colors.textMuted, fontStyle: 'italic' },
  receiptPill: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingVertical: 4, paddingHorizontal: 8, backgroundColor: '#eff6ff', borderRadius: Radius.sm, borderWidth: 1, borderColor: '#dbeafe' },
  receiptPillText: { color: Colors.primary, fontWeight: '600', fontSize: FontSize.xs },

  // Initiate Modal Styles
  modalSafeWrapper: { flex: 1, backgroundColor: Colors.background },
  modalSafeWrapperTablet: { backgroundColor: 'rgba(0,0,0,0.6)', justifyContent: 'center', alignItems: 'center', padding: Spacing.lg },
  modalCard: { flex: 1, backgroundColor: Colors.background },
  modalCardTablet: {
    width: '100%',
    maxWidth: 960,
    maxHeight: '92%',
    backgroundColor: Colors.surface,
    borderRadius: Radius.xl,
    overflow: 'hidden',
    ...Platform.select({
      web: {
        boxShadow: '0 10px 20px rgba(0, 0, 0, 0.25)',
      },
      default: {
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 10 },
        shadowOpacity: 0.25,
        shadowRadius: 20,
        elevation: 10,
      },
    }),
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
    backgroundColor: '#f8fafc',
  },
  modalTitle: { fontSize: FontSize.lg, fontWeight: '800', color: Colors.text },
  closeBtn: { padding: 4 },

  transferModalLayout: { flex: 1, flexDirection: 'column' },
  transferModalLayoutTablet: { flexDirection: 'row' },
  treeCol: { padding: Spacing.lg, borderBottomWidth: 1, borderBottomColor: Colors.border },
  treeColTablet: { flex: 1, borderBottomWidth: 0, borderRightWidth: 1, borderRightColor: Colors.border, padding: Spacing.lg },
  treeContainer: { height: 280, backgroundColor: Colors.surface, borderRadius: Radius.md, borderWidth: 1, borderColor: Colors.border, overflow: 'hidden' },

  formCol: { flex: 1 },
  formColTablet: { flex: 1.25 },
  field: { marginBottom: 14 },
  rowFields: { flexDirection: 'column' },
  rowFieldsTablet: { flexDirection: 'row', gap: 12 },
  fieldLabel: { fontSize: FontSize.xs, fontWeight: '700', color: Colors.text, marginBottom: 5, textTransform: 'uppercase', letterSpacing: 0.3 },
  fieldInput: { borderWidth: 1.5, borderColor: Colors.border, borderRadius: Radius.md, paddingHorizontal: 12, paddingVertical: 9, fontSize: FontSize.sm, backgroundColor: Colors.surfaceAlt, color: Colors.text },
  pickerWrapper: { borderWidth: 1.5, borderColor: Colors.border, borderRadius: Radius.md, backgroundColor: Colors.surfaceAlt, overflow: 'hidden' },

  endpointCard: { padding: 12, borderRadius: Radius.md, borderWidth: 1.5, borderColor: Colors.border, backgroundColor: Colors.surfaceAlt },
  endpointLevel: { fontSize: FontSize.xs, fontWeight: '700', color: Colors.textMuted, textTransform: 'uppercase' },
  endpointName: { fontSize: FontSize.base, fontWeight: '700', color: Colors.text, marginTop: 2 },

  uploadBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', borderWidth: 1.5, borderColor: Colors.primary, borderStyle: 'dashed', borderRadius: Radius.md, padding: 12, backgroundColor: '#f0f9ff' },
  uploadBtnText: { color: Colors.primary, fontWeight: '700', fontSize: FontSize.sm },
  receiptPreview: { flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 8, padding: 8, backgroundColor: Colors.surface, borderWidth: 1, borderColor: Colors.border, borderRadius: Radius.md },
  receiptThumb: { width: 40, height: 40, borderRadius: 4 },
  receiptName: { fontSize: FontSize.xs, color: Colors.text, flex: 1 },

  // Generic Dialog Modal Styles
  modalBackdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', justifyContent: 'center', alignItems: 'center', padding: 16 },
  confirmModal: {
    width: '100%',
    maxWidth: 520,
    backgroundColor: Colors.surface,
    borderRadius: Radius.xl,
    padding: 20,
    ...Platform.select({
      web: {
        boxShadow: '0 6px 10px rgba(0, 0, 0, 0.2)',
      },
      default: {
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 6 },
        shadowOpacity: 0.2,
        shadowRadius: 10,
        elevation: 6,
      },
    }),
  },
  confirmTitle: { fontSize: FontSize.lg, fontWeight: '800', color: Colors.text },
  confirmSubtitle: { fontSize: FontSize.xs, color: Colors.textMuted, marginTop: 2, marginBottom: 14 },
  alertError: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#fef2f2', borderWidth: 1, borderColor: '#fecaca', borderRadius: Radius.md, padding: 10, marginBottom: 14 },
  alertErrorText: { color: Colors.error, fontSize: FontSize.sm, fontWeight: '600', flex: 1 },
  summaryTable: { backgroundColor: '#f8fafc', borderRadius: Radius.md, borderWidth: 1, borderColor: Colors.border, padding: 12 },
  summaryRow: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 6, borderBottomWidth: 1, borderBottomColor: '#f1f5f9' },
  summaryKey: { fontSize: FontSize.xs, fontWeight: '600', color: Colors.textMuted, width: 120 },
  summaryVal: { fontSize: FontSize.xs, color: Colors.text, flex: 1, textAlign: 'right' },

  restrictedBox: { flex: 1, padding: Spacing.xl, alignItems: 'center', justifyContent: 'center' },
  restrictedTitle: { fontSize: FontSize.lg, fontWeight: '700', color: Colors.text, textAlign: 'center' },
  restrictedText: { fontSize: FontSize.sm, color: Colors.textMuted, textAlign: 'center', marginTop: 8, maxWidth: 320 },

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
