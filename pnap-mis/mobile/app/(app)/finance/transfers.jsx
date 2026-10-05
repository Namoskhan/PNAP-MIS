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
import { useLanguage } from '../../../src/context/LanguageContext';
import { useUnit } from '../../../src/context/UnitContext';
import { api, errorMessage, resolveMediaUrl, isNetworkError } from '../../../src/api/client';
import {
  canManageFinance,
  canApproveExpense,
  hasPermission,
  isCentralAdminOversight,
  isSuperAdminOversight,
  isHigherAdmin,
} from '../../../src/utils/permissions';
import { useToast } from '../../../src/components/Toast';
import { useNetwork } from '../../../src/context/NetworkContext';
import {
  getCache,
  setCache,
  enqueueOfflineAction,
  getOfflineEntities,
  subscribeQueue,
} from '../../../src/services/offlineStorage';
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
  const { t, isRTL } = useLanguage();
  const { user } = useAuth();
  const { ctx, provinces, setCtx } = useUnit();
  const toast = useToast();
  const params = useLocalSearchParams();
  const { width, height } = useWindowDimensions();

  const isSmall = width < 480;
  const isTablet = width >= 768;
  const isDesktop = width >= 1024;

  const getLevelLabel = (level) => {
    switch (level) {
      case 'BASIC_UNIT': return t('levels.basicUnit', 'Basic Unit');
      case 'AREA': return t('levels.area', 'Area');
      case 'DISTRICT': return t('levels.district', 'District');
      case 'PROVINCE': return t('levels.province', 'Province');
      case 'CENTRAL': return t('levels.central', 'Center');
      default: return LEVEL_LABEL[level] || level;
    }
  };

  const getDirectionLabel = (dir) => {
    switch (dir) {
      case 'UP': return t('transfers.upward', 'Upward');
      case 'DOWN': return t('transfers.downward', 'Downward');
      case 'SAME_TIER': return t('transfers.sameTier', 'Same tier');
      default: return DIRECTION_LABEL[dir] || dir;
    }
  };

  const queryBody = params.body || '';
  const isJirgaView = queryBody === 'JIRGA';
  const isCommitteeView = queryBody === 'COMMITTEE';
  const targetBody = isJirgaView ? 'JIRGA' : (isCommitteeView ? 'COMMITTEE' : 'EXECUTIVE');

  const [tab, setTab] = useState('outgoing');
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const { isOnline } = useNetwork();

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

  // Destination Selector Mode: LIST vs TREE
  const [destMode, setDestMode] = useState('LIST');
  const [pickProv, setPickProv] = useState('');
  const [pickDist, setPickDist] = useState('');
  const [pickArea, setPickArea] = useState('');
  const [listProvinces, setListProvinces] = useState([]);
  const [listDistricts, setListDistricts] = useState([]);
  const [listAreas, setListAreas] = useState([]);
  const [listUnits, setListUnits] = useState([]);

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

    // 1. Read from persistent local cache immediately
    let initialBal = null;
    let initialPending = 0;
    try {
      const cached = await getCache(`finance_summary_${activeLevel}_${resolvedUnitId}_${targetBody}`);
      if (cached) {
        initialBal = cached.availableBalance ?? cached.balance ?? 0;
        initialPending = cached.pendingTransfersOut?.total || 0;
      } else {
        const mainFin = await getCache(`finance_${activeLevel}_${resolvedUnitId}_${targetBody}`);
        if (mainFin?.summary) {
          initialBal = mainFin.summary.availableBalance ?? mainFin.summary.balance ?? 0;
          initialPending = mainFin.summary.pendingTransfersOut?.total || 0;
        }
      }
    } catch {}

    // 2. Query offline queue for any pending outgoing transfers
    let localPendingOut = 0;
    try {
      const offlineTransfers = await getOfflineEntities('TRANSFER');
      localPendingOut = (offlineTransfers || []).reduce((acc, t) => {
        const sId = t.sourceUnitId || t.payload?.sourceUnitId;
        const amt = parseFloat(t.amount || t.payload?.amount || 0);
        if (String(sId) === String(resolvedUnitId) && !isNaN(amt)) {
          return acc + amt;
        }
        return acc;
      }, 0);
    } catch {}

    if (initialBal !== null) {
      setSourceBalance(Math.max(0, initialBal - localPendingOut));
      setPendingOutAmount(initialPending + localPendingOut);
    }

    // 3. If online, fetch live summary from server
    if (isOnline) {
      try {
        const q = { unitLevel: activeLevel, unitId: resolvedUnitId, body: targetBody };
        const res = await api.get('/finance/summary', { params: q });
        if (res.data?.data) {
          await setCache(`finance_summary_${activeLevel}_${resolvedUnitId}_${targetBody}`, res.data.data);
          const serverBal = res.data.data.availableBalance ?? res.data.data.balance ?? 0;
          const serverPending = res.data.data.pendingTransfersOut?.total || 0;
          setSourceBalance(Math.max(0, serverBal - localPendingOut));
          setPendingOutAmount(serverPending + localPendingOut);
        }
      } catch {}
    }
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
    const cacheKey = `transfers_${activeLevel}_${resolvedUnitId}_${tab}_${targetBody}`;

    const filterOffline = (offlineList) => {
      return (offlineList || []).filter((o) => {
        const sId = o.sourceUnitId || o.payload?.sourceUnitId;
        const b = o.body || o.payload?.body;
        const matchesUnit = !sId || !resolvedUnitId || sId === resolvedUnitId;
        const matchesBody = !b || b === targetBody;
        return matchesUnit && matchesBody;
      });
    };

    if (!isOnline) {
      const cached = await getCache(cacheKey);
      const offlineItems = await getOfflineEntities('TRANSFER');
      const validOffline = filterOffline(offlineItems);
      setItems([...validOffline, ...(cached || [])]);
      loadSourceBalance();
      setLoading(false);
      return;
    }

    try {
      const q = { unitLevel: activeLevel, unitId: resolvedUnitId, direction: tab, body: targetBody };
      const r = await api.get('/transfers', { params: q });
      const serverItems = r.data.data || [];
      await setCache(cacheKey, serverItems);

      const offlineItems = await getOfflineEntities('TRANSFER');
      const validOffline = filterOffline(offlineItems);
      setItems([...validOffline, ...serverItems]);
      loadSourceBalance();
    } catch (err) {
      // Offline fallback: load from persistent local cache
      const cached = await getCache(cacheKey);
      const offlineItems = await getOfflineEntities('TRANSFER');
      const validOffline = filterOffline(offlineItems);
      if (cached || validOffline.length > 0) {
        setItems([...validOffline, ...(cached || [])]);
      } else if (!isNetworkError(err)) {
        toast.error(errorMessage(err));
      }
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (resolvedUnitId && resolvedUnitId !== 'CENTRAL') {
      reload();
    }
  }, [tab, activeLevel, resolvedUnitId, targetBody]);

  useEffect(() => {
    const unsub = subscribeQueue(() => {
      reload();
    });
    return unsub;
  }, [tab, activeLevel, resolvedUnitId, targetBody]);

  // Load cascading unit lists for destination picker with offline cache
  useEffect(() => {
    if (!transferModalOpen) return;
    (async () => {
      try {
        const res = await api.get('/org/provinces');
        setListProvinces(res.data?.data || []);
      } catch {
        const cached = await getCache('org_provinces');
        if (cached) setListProvinces(cached);
      }
    })();
  }, [transferModalOpen]);

  useEffect(() => {
    if (!pickProv) {
      setListDistricts([]);
      setPickDist('');
      return;
    }
    (async () => {
      try {
        const res = await api.get('/org/districts', { params: { provinceId: pickProv } });
        setListDistricts(res.data?.data || []);
      } catch {
        const cached = await getCache(`org_districts_${pickProv}`);
        if (cached) setListDistricts(cached);
      }
    })();
  }, [pickProv]);

  useEffect(() => {
    if (!pickDist) {
      setListAreas([]);
      setPickArea('');
      return;
    }
    (async () => {
      try {
        const res = await api.get('/org/areas', { params: { districtId: pickDist } });
        setListAreas(res.data?.data || []);
      } catch {
        const cached = await getCache(`org_areas_${pickDist}`);
        if (cached) setListAreas(cached);
      }
    })();
  }, [pickDist]);

  useEffect(() => {
    if (!pickArea) {
      setListUnits([]);
      return;
    }
    (async () => {
      try {
        const res = await api.get('/org/basic-units', { params: { areaId: pickArea } });
        setListUnits(res.data?.data || []);
      } catch {
        const cached = await getCache(`org_basic_units_${pickArea}`);
        if (cached) setListUnits(cached);
      }
    })();
  }, [pickArea]);

  // Preview destination whenever selection changes
  useEffect(() => {
    if (!picked || !activeLevel || !resolvedUnitId || resolvedUnitId === 'CENTRAL') {
      setPreview(null);
      setPreviewErr('');
      return;
    }

    if (String(picked.id) === String(resolvedUnitId)) {
      setPreview(null);
      setPreviewErr('A unit cannot transfer funds to itself. Please select a different destination unit.');
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
        if (isNetworkError(err)) {
          // Offline fallback preview
          setPreview({
            destination: {
              id: picked.id,
              name: picked.name,
              level: picked.level,
            },
            direction: 'SAME_TIER',
            path: [{ name: picked.name, level: picked.level }],
          });
          setPreviewErr('');
        } else {
          setPreview(null);
          setPreviewErr(errorMessage(err));
        }
      }
    }).finally(() => {
      if (!cancelled) setPreviewLoading(false);
    });

    return () => { cancelled = true; };
  }, [picked, activeLevel, resolvedUnitId]);

  async function pickImage() {
    const isAllowedImage = (filename, mimeType) => {
      const ext = (filename || '').toLowerCase();
      const mime = (mimeType || '').toLowerCase();
      return (
        mime.includes('jpeg') ||
        mime.includes('jpg') ||
        mime.includes('png') ||
        mime.includes('webp') ||
        ext.endsWith('.jpg') ||
        ext.endsWith('.jpeg') ||
        ext.endsWith('.png') ||
        ext.endsWith('.webp')
      );
    };

    if (Platform.OS === 'web') {
      const input = document.createElement('input');
      input.type = 'file';
      input.accept = 'image/*';
      input.onchange = (e) => {
        const file = e.target.files?.[0];
        if (file) {
          if (!isAllowedImage(file.name, file.type)) {
            const err = 'Only JPG, PNG, and WebP image formats are supported for payment receipts.';
            setModalErr(err);
            toast.error(err);
            return;
          }
          setReceipt({
            uri: URL.createObjectURL(file),
            name: file.name,
            type: file.type || 'image/jpeg',
            file: file,
          });
          if (modalErr) setModalErr('');
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
      mediaTypes: ['images'],
      quality: 0.8,
    });
    if (!result.canceled && result.assets?.[0]) {
      const a = result.assets[0];
      const filename = a.fileName || 'receipt.jpg';
      const mime = a.mimeType || 'image/jpeg';
      if (!isAllowedImage(filename, mime)) {
        const err = 'Only JPG, PNG, and WebP image formats are supported for payment receipts.';
        setModalErr(err);
        toast.error(err);
        return;
      }
      setReceipt({
        uri: a.uri,
        name: filename,
        type: mime,
      });
      if (modalErr) setModalErr('');
    }
  }

  function handleProceedToConfirm() {
    setModalErr('');
    if (!picked || !preview) {
      setModalErr('Please select a valid destination unit.');
      return;
    }
    if (String(preview?.destination?.id) === String(resolvedUnitId) || String(picked?.id) === String(resolvedUnitId)) {
      setModalErr('A unit cannot transfer funds to itself. Please choose a different destination unit.');
      return;
    }
    const amt = parseFloat(form.amount);
    if (!form.amount || isNaN(amt) || amt <= 0) {
      setModalErr('Please enter a valid positive transfer amount.');
      return;
    }

    // Available Balance Validation
    if (sourceBalance !== null) {
      if (sourceBalance <= 0) {
        setModalErr('Transfer cannot proceed: available balance is PKR 0 (funds are already committed in pending outgoing transfers or exhausted).');
        return;
      }
      if (amt > sourceBalance) {
        setModalErr(`Transfer amount exceeds the available balance of PKR ${sourceBalance.toLocaleString()}.`);
        return;
      }
    }

    if (!receipt) {
      setModalErr('Proof of payment (receipt image) is required.');
      return;
    }
    setConfirmOpen(true);
  }

  async function initiate() {
    if (submitting) return;
    if (String(preview?.destination?.id) === String(resolvedUnitId) || String(picked?.id) === String(resolvedUnitId)) {
      setModalErr('A unit cannot transfer funds to itself.');
      return;
    }
    const amt = parseFloat(form.amount);
    if (!form.amount || isNaN(amt) || amt <= 0) {
      setModalErr('Please enter a valid positive transfer amount.');
      return;
    }

    // Available Balance Validation
    if (sourceBalance !== null) {
      if (sourceBalance <= 0) {
        setModalErr('Transfer cannot proceed: available balance is PKR 0 (funds are already committed in pending outgoing transfers or exhausted).');
        return;
      }
      if (amt > sourceBalance) {
        setModalErr(`Transfer amount exceeds the available balance of PKR ${sourceBalance.toLocaleString()}.`);
        return;
      }
    }

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

      if (!isOnline) {
        throw new Error('OFFLINE_MODE');
      }

      await api.post('/transfers', fd, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });
      
      const successMsg = `Fund transfer of ${PKR(parseFloat(form.amount))} to ${preview.destination.name} initiated successfully!`;
      const amtNum = parseFloat(form.amount);
      setSourceBalance((prev) => (prev !== null ? Math.max(0, prev - amtNum) : 0));
      setPendingOutAmount((prev) => prev + amtNum);

      setForm({ amount: '', mode: 'BANK_TRANSFER', reference: '', note: '' });
      setReceipt(null);
      setPicked(null);
      setPreview(null);
      setConfirmOpen(false);
      setTransferModalOpen(false);
      reload();
      toast.success(successMsg);
    } catch (e) {
      if (e.message === 'OFFLINE_MODE' || isNetworkError(e)) {
        const files = [];
        if (receipt) {
          files.push({
            fieldName: 'receipt',
            name: receipt.name || 'receipt.jpg',
            type: receipt.type || 'image/jpeg',
            uri: receipt.uri,
            file: receipt.file,
          });
        }

        const payload = {
          sourceLevel: activeLevel,
          sourceUnitId: resolvedUnitId,
          destinationId: preview.destination.id,
          amount: form.amount,
          mode: form.mode,
          reference: form.reference?.trim() || undefined,
          note: form.note?.trim() || undefined,
          body: targetBody,
        };

        const offlineRecord = {
          ...payload,
          sourceUnit: { name: ctx?.unitName || 'My Unit', level: activeLevel },
          destinationUnit: { name: preview?.destination?.name || 'Destination' },
          direction: 'OUT',
          state: 'OFFLINE_PENDING',
          _isOffline: true,
          createdAt: new Date().toISOString(),
        };

        await enqueueOfflineAction({
          entityType: 'TRANSFER',
          action: 'CREATE',
          endpoint: '/transfers',
          method: 'POST',
          payload,
          files,
          displayTitle: `Transfer: ${PKR(parseFloat(form.amount))} to ${preview?.destination?.name || 'Unit'}`,
          localRecord: offlineRecord,
        });

        const successMsg = `Offline: Fund transfer of ${PKR(parseFloat(form.amount))} to ${preview.destination.name} saved locally. Will sync when online!`;
        const amtNum = parseFloat(form.amount);
        setSourceBalance((prev) => (prev !== null ? Math.max(0, prev - amtNum) : 0));
        setPendingOutAmount((prev) => prev + amtNum);

        setForm({ amount: '', mode: 'BANK_TRANSFER', reference: '', note: '' });
        setReceipt(null);
        setPicked(null);
        setPreview(null);
        setConfirmOpen(false);
        setTransferModalOpen(false);
        reload();
        toast.success(successMsg);
      } else {
        const err = errorMessage(e);
        setModalErr(err);
        toast.error(err);
        setConfirmOpen(false);
      }
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
    ? (activeLevel === 'CENTRAL' ? t('finance.pknapCentral', 'PKNAP Central') : (ctx?.unitName ? `${ctx.unitName} ${t('finance.sobayiJirga', 'Sobayi Jirga')}` : t('finance.sobayiJirga', 'Province Jirga')))
    : (ctx?.unitName || (activeLevel === 'CENTRAL' ? t('finance.pknapCentral', 'PKNAP Central') : t('finance.myUnit', 'My Unit')));

  const pageTitle = isJirgaView
    ? (activeLevel === 'CENTRAL' ? t('finance.qomiJirgaTransfers', 'Qomi Jirga Fund Transfers') : `${t('finance.sobayiJirgaTransfers', 'Sobayi Jirga Fund Transfers')} · ${ctx?.unitName || t('common.province', 'Province')}`)
    : (isCommitteeView ? `${t('finance.committeeTransfers', 'Committee Transfers')} · ${unitDisplayName}` : `${t('finance.executiveTransfers', 'Executive Transfers')} · ${unitDisplayName}`);

  const [exporting, setExporting] = useState(null);

  async function handleExport(fmt) {
    if (!isOnline) {
      toast.info(t('finance.exportRequiresOnline', 'Exporting requires an active internet connection.'));
      return;
    }
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
      toast.success(t('finance.exportDownloaded', '{{fmt}} export downloaded.', { fmt: fmt.toUpperCase() }));
    } catch (e) {
      toast.error(e.message || t('finance.exportFailed', 'Export {{fmt}} failed.', { fmt: fmt.toUpperCase() }));
    } finally {
      setExporting(null);
    }
  }

  if (!hasFinanceAccess) {
    return (
      <SafeAreaView style={styles.safe}>
        <View style={styles.restrictedBox}>
          <Ionicons name="lock-closed-outline" size={48} color={Colors.error} style={{ marginBottom: 12 }} />
          <Text style={[styles.restrictedTitle, isRTL && { textAlign: 'right' }]}>{t('finance.accessRequired', 'Finance Access Required')}</Text>
          <Text style={[styles.restrictedText, isRTL && { textAlign: 'right' }]}>
            {t('finance.noFinancePerms', 'Your current role does not include finance permissions, so Fund Transfers is unavailable.')}
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
            <Text style={[styles.guidanceTitle, isRTL && { textAlign: 'right' }]}>{t('activities.jirgaProvincialOnlyTitle', 'Jirga is only available at Provincial and Central tiers')}</Text>
            <Text style={[styles.guidanceText, isRTL && { textAlign: 'right' }]}>
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
      <View style={[styles.mainContainer, isTablet && styles.mainContainerTablet]}>
        
        {/* Header */}
        <View style={[styles.header, isSmall && styles.headerSmall, isRTL && { flexDirection: 'row-reverse' }]}>
          <View style={[styles.headerTitleWrap, isRTL && { alignItems: 'flex-end' }]}>
            <View style={[{ flexDirection: isRTL ? 'row-reverse' : 'row', alignItems: 'center', gap: 6, flexWrap: 'wrap' }]}>
              <Text style={styles.pageTitle}>{pageTitle}</Text>
              {!isOnline && (
                <View style={{ backgroundColor: '#FEE2E2', borderColor: '#FCA5A5', borderWidth: 1, borderRadius: 12, paddingHorizontal: 8, paddingVertical: 2 }}>
                  <Text style={{ fontSize: 11, fontWeight: '700', color: '#DC2626' }}>{t('finance.offlineCached', 'Offline (Cached)')}</Text>
                </View>
              )}
            </View>
            <Text style={[styles.pageSubtitle, isRTL && { textAlign: 'right' }]}>
              {unitDisplayName} · {getLevelLabel(activeLevel)}
            </Text>
          </View>
          <View style={[styles.headerActions, isRTL && { flexDirection: 'row-reverse' }]}>
            <TouchableOpacity
              style={[styles.iconBtn, (!isOnline || !!exporting) && { opacity: 0.45 }, isRTL && { flexDirection: 'row-reverse' }]}
              onPress={() => handleExport('pdf')}
              disabled={!isOnline || !!exporting}
            >
              {exporting === 'pdf' ? (
                <ActivityIndicator size="small" color={Colors.primary} />
              ) : (
                <>
                  <Ionicons name="document-text-outline" size={18} color={isOnline ? Colors.primary : Colors.textMuted} />
                  {isTablet && <Text style={[styles.iconBtnText, !isOnline && { color: Colors.textMuted }]}>PDF</Text>}
                </>
              )}
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.iconBtn, (!isOnline || !!exporting) && { opacity: 0.45 }, isRTL && { flexDirection: 'row-reverse' }]}
              onPress={() => handleExport('xlsx')}
              disabled={!isOnline || !!exporting}
            >
              {exporting === 'xlsx' ? (
                <ActivityIndicator size="small" color={Colors.primary} />
              ) : (
                <>
                  <Ionicons name="grid-outline" size={18} color={isOnline ? Colors.primary : Colors.textMuted} />
                  {isTablet && <Text style={[styles.iconBtnText, !isOnline && { color: Colors.textMuted }]}>Excel</Text>}
                </>
              )}
            </TouchableOpacity>
            {canSend && (
              <TouchableOpacity style={[styles.primaryBtn, isRTL && { flexDirection: 'row-reverse' }]} onPress={openInitiate}>
                <Ionicons name="send" size={15} color="#fff" />
                <Text style={styles.primaryBtnText}>{isTablet ? t('finance.initiateTransfer', '+ Initiate Transfer') : t('finance.transfer', 'Transfer')}</Text>
              </TouchableOpacity>
            )}
          </View>
        </View>

        {/* Scope banner */}
        <View style={[styles.banner, isRTL && { flexDirection: 'row-reverse' }]}>
          <Ionicons name="information-circle-outline" size={18} color={Colors.primary} style={isRTL ? { marginLeft: 8, marginTop: 1 } : { marginRight: 8, marginTop: 1 }} />
          <Text style={[styles.bannerText, isRTL && { textAlign: 'right' }]}>
            <Text style={{ fontWeight: '700', color: Colors.text }}>{unitDisplayName}</Text>{' '}
            {activeLevel === 'CENTRAL'
              ? t('finance.scopeBannerCentral', 'may send funds to any unit in the organization.')
              : activeLevel === 'PROVINCE'
                ? t('finance.scopeBannerProvince', 'may send funds to any unit in the organization, including other provinces.')
                : t('finance.scopeBannerSub', 'may send funds to any unit within its own province, or to the Center.')}
            {' '}{t('finance.scopeBannerAck', 'The destination unit receives and acknowledges the funds.')}
          </Text>
        </View>

        {/* Tabs */}
        <View style={[styles.tabRow, isRTL && { flexDirection: 'row-reverse' }]}>
          <TouchableOpacity style={[styles.tab, tab === 'outgoing' && styles.tabActive, isRTL && { flexDirection: 'row-reverse' }]} onPress={() => setTab('outgoing')}>
            <Ionicons name="arrow-up-circle-outline" size={16} color={tab === 'outgoing' ? Colors.primary : Colors.textMuted} style={isRTL ? { marginLeft: 6 } : { marginRight: 6 }} />
            <Text style={[styles.tabText, tab === 'outgoing' && styles.tabTextActive]}>{t('finance.outgoingTransfers', 'Outgoing Transfers')}</Text>
          </TouchableOpacity>
          <TouchableOpacity style={[styles.tab, tab === 'incoming' && styles.tabActive, isRTL && { flexDirection: 'row-reverse' }]} onPress={() => setTab('incoming')}>
            <Ionicons name="arrow-down-circle-outline" size={16} color={tab === 'incoming' ? Colors.primary : Colors.textMuted} style={isRTL ? { marginLeft: 6 } : { marginRight: 6 }} />
            <Text style={[styles.tabText, tab === 'incoming' && styles.tabTextActive]}>{t('finance.incomingTransfers', 'Incoming Transfers')}</Text>
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
              <View style={[styles.thRow, isRTL && { flexDirection: 'row-reverse' }]}>
                <Text style={[styles.th, { width: isTablet ? '11%' : 95 }, isRTL && { textAlign: 'right' }]}>{t('finance.date', 'Date')}</Text>
                <Text style={[styles.th, { width: isTablet ? '23%' : 220 }, isRTL && { textAlign: 'right' }]}>{tab === 'outgoing' ? t('finance.toDestination', 'To Destination') : t('finance.fromSender', 'From Sender')}</Text>
                <Text style={[styles.th, { width: isTablet ? '13%' : 120 }, isRTL && { textAlign: 'right' }]}>{t('finance.mode', 'Mode')}</Text>
                <Text style={[styles.th, { width: isTablet ? '13%' : 120 }, isRTL && { textAlign: 'right' }]}>{t('finance.reference', 'Reference')}</Text>
                <Text style={[styles.th, { width: isTablet ? '12%' : 110, textAlign: isRTL ? 'left' : 'right' }]}>{t('finance.amount', 'Amount')}</Text>
                <Text style={[styles.th, { width: isTablet ? '9%' : 80, textAlign: 'center' }]}>{t('finance.receipt', 'Receipt')}</Text>
                <Text style={[styles.th, { width: isTablet ? '10%' : 115 }, isRTL && { textAlign: 'right' }]}>{t('finance.status', 'State')}</Text>
                <Text style={[styles.th, { width: isTablet ? '14%' : 160, textAlign: 'center' }]}>{t('common.actions', 'Actions')}</Text>
              </View>

              {displayedItems.length === 0 ? (
                <Text style={[styles.emptyText, isRTL && { textAlign: 'right' }]}>{t('finance.noTransfersInView', 'No transfers in this view.')}</Text>
              ) : (
                displayedItems.map((tItem) => (
                  <View key={tItem._id} style={[styles.tr, isRTL && { flexDirection: 'row-reverse' }]}>
                    <Text style={[styles.td, { width: isTablet ? '11%' : 95 }, isRTL && { textAlign: 'right' }]} numberOfLines={1}>
                      {shortDate(tItem.createdAt)}
                    </Text>
                    
                    <View style={[styles.td, { width: isTablet ? '23%' : 220, flexDirection: isRTL ? 'row-reverse' : 'row', alignItems: 'center' }]}>
                      <View style={{
                        backgroundColor: tItem.body === 'JIRGA' ? '#f3e8ff' : (tItem.body === 'COMMITTEE' ? '#e0f2fe' : '#f1f5f9'),
                        paddingHorizontal: 5, paddingVertical: 2, borderRadius: 4, [isRTL ? 'marginLeft' : 'marginRight']: 6,
                        borderWidth: tItem.body === 'JIRGA' ? 1 : 0, borderColor: '#d8b4fe'
                      }}>
                        <Text style={{
                          color: tItem.body === 'JIRGA' ? '#6b21a8' : (tItem.body === 'COMMITTEE' ? '#0369a1' : '#475569'),
                          fontSize: 9, fontWeight: '700'
                        }}>
                          {tItem.body === 'JIRGA' ? t('nav.jirga', 'Jirga') : (tItem.body === 'COMMITTEE' ? t('finance.commShort', 'Comm') : t('finance.execShort', 'Exec'))}
                        </Text>
                      </View>
                      <Text numberOfLines={2} style={[{ flex: 1, fontSize: FontSize.sm, color: Colors.text, fontWeight: '600' }, isRTL && { textAlign: 'right' }]}>
                        {counterparty(tItem)}
                      </Text>
                    </View>

                    <Text style={[styles.td, { width: isTablet ? '13%' : 120 }, isRTL && { textAlign: 'right' }]} numberOfLines={1}>{tItem.mode?.replace('_', ' ')}</Text>
                    <Text style={[styles.td, { width: isTablet ? '13%' : 120, color: Colors.textMuted }, isRTL && { textAlign: 'right' }]} numberOfLines={1}>{tItem.reference || '—'}</Text>
                    <Text style={[styles.td, { width: isTablet ? '12%' : 110, textAlign: isRTL ? 'left' : 'right', fontWeight: '700', color: Colors.text }]} numberOfLines={1}>
                      {PKR(tItem.amount)}
                    </Text>
                    
                    <View style={[styles.td, { width: isTablet ? '9%' : 80, alignItems: 'center', justifyContent: 'center' }]}>
                      {tItem.receiptImageUrl ? (
                        <TouchableOpacity 
                          style={styles.receiptPill}
                          onPress={() => setPreviewUrl(resolveMediaUrl(tItem.receiptImageUrl))}
                        >
                          <Ionicons name="image" size={13} color={Colors.primary} />
                          <Text style={styles.receiptPillText}>{t('common.view', 'View')}</Text>
                        </TouchableOpacity>
                      ) : (
                        <Text style={{ color: Colors.textMuted }}>—</Text>
                      )}
                    </View>

                    <View style={[styles.td, { width: isTablet ? '10%' : 115, justifyContent: 'center' }]}>
                      <Badge variant={tItem._isOffline ? 'warning' : (tItem.state === 'ACKNOWLEDGED' ? 'success' : tItem.state === 'REJECTED' ? 'error' : (tItem.state === 'CANCELLED' ? 'muted' : 'warning'))} label={tItem._isOffline ? 'OFFLINE' : tItem.state} />
                      {tItem.state === 'REJECTED' && tItem.decisionNote && (
                        <Text style={[{ fontSize: 10, color: Colors.error, marginTop: 2 }, isRTL && { textAlign: 'right' }]} numberOfLines={2}>
                          {tItem.decisionNote}
                        </Text>
                      )}
                    </View>

                    <View style={[styles.td, { width: isTablet ? '14%' : 160, flexDirection: isRTL ? 'row-reverse' : 'row', alignItems: 'center', justifyContent: 'center', gap: 6 }]}>
                      {tab === 'incoming' && tItem.state === 'PENDING_ACK' ? (
                        <>
                          <TouchableOpacity style={[styles.btnSmall, { backgroundColor: Colors.primary }]} onPress={() => openApproveModal(tItem)}>
                            <Text style={{ color: '#fff', fontSize: 11, fontWeight: '700' }}>{t('finance.approve', 'Approve')}</Text>
                          </TouchableOpacity>
                          <TouchableOpacity style={[styles.btnSmall, { backgroundColor: Colors.error }]} onPress={() => openRejectModal(tItem._id)}>
                            <Text style={{ color: '#fff', fontSize: 11, fontWeight: '700' }}>{t('finance.reject', 'Reject')}</Text>
                          </TouchableOpacity>
                        </>
                      ) : tab === 'outgoing' && tItem.state === 'PENDING_ACK' ? (
                        <TouchableOpacity style={[styles.btnSmall, { backgroundColor: '#e11d48' }]} onPress={() => openCancelModal(tItem)}>
                          <Text style={{ color: '#fff', fontSize: 11, fontWeight: '700' }}>{t('common.cancel', 'Cancel')}</Text>
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
            <View style={[styles.modalHeader, isRTL && { flexDirection: 'row-reverse' }]}>
              <View>
                <Text style={[styles.modalTitle, isRTL && { textAlign: 'right' }]}>{t('finance.initiateTransferTitle', 'Initiate Fund Transfer')}</Text>
                <Text style={[{ fontSize: FontSize.xs, color: Colors.textMuted, marginTop: 2 }, isRTL && { textAlign: 'right' }]}>
                  {t('finance.initiateTransferSubtitle', 'Transfer funds securely to any destination within policy.')}
                </Text>
              </View>
              <TouchableOpacity onPress={() => setTransferModalOpen(false)} style={styles.closeBtn}>
                <Ionicons name="close" size={24} color={Colors.text} />
              </TouchableOpacity>
            </View>
            
            {/* Modal Body: 2 Columns on Tablet/Desktop, 1 Column on Mobile */}
            <View style={[styles.transferModalLayout, isTablet && styles.transferModalLayoutTablet, isRTL && isTablet && { flexDirection: 'row-reverse' }]}>
              
              {/* Left Column: Destination Selector (Direct Picker or Org Tree) */}
              <View style={[styles.treeCol, isTablet && styles.treeColTablet]}>
                <View style={[{ flexDirection: isRTL ? 'row-reverse' : 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }]}>
                  <Text style={styles.fieldLabel}>{t('finance.chooseDestination', 'Choose Destination *')}</Text>
                  <View style={[styles.destModeToggle, isRTL && { flexDirection: 'row-reverse' }]}>
                    <TouchableOpacity
                      style={[styles.destModeBtn, destMode === 'LIST' && styles.destModeBtnActive]}
                      onPress={() => setDestMode('LIST')}
                    >
                      <Text style={[styles.destModeText, destMode === 'LIST' && styles.destModeTextActive]}>
                        {t('finance.directList', 'Direct List')}
                      </Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={[styles.destModeBtn, destMode === 'TREE' && styles.destModeBtnActive]}
                      onPress={() => setDestMode('TREE')}
                    >
                      <Text style={[styles.destModeText, destMode === 'TREE' && styles.destModeTextActive]}>
                        {t('finance.orgTree', 'Org Tree')}
                      </Text>
                    </TouchableOpacity>
                  </View>
                </View>

                {destMode === 'LIST' ? (
                  <ScrollView
                    style={[styles.treeContainer, { padding: 10 }]}
                    nestedScrollEnabled={true}
                    contentContainerStyle={{ paddingBottom: 20 }}
                  >
                    {/* Quick PKNAP Central option */}
                    <TouchableOpacity
                      style={[styles.quickDestBtn, picked?.id === 'CENTRAL' && styles.quickDestBtnSelected, isRTL && { flexDirection: 'row-reverse' }]}
                      onPress={() => setPicked({ id: 'CENTRAL', name: t('finance.pknapCentral', 'PKNAP Central'), level: 'CENTRAL' })}
                    >
                      <Ionicons name="globe-outline" size={16} color={Colors.primary} />
                      <Text style={styles.quickDestText}>{t('finance.pknapCentralOption', 'PKNAP Central (قومي مرکز)')}</Text>
                    </TouchableOpacity>

                    {/* Province Selection */}
                    <Text style={[styles.fieldSubLabel, { marginTop: 8 }, isRTL && { textAlign: 'right' }]}>{t('finance.stepSelectProvince', '1. Select Province')}</Text>
                    <View style={styles.pickerWrap}>
                      <Picker
                        selectedValue={pickProv}
                        onValueChange={(val) => {
                          setPickProv(val);
                          if (val) {
                            const p = listProvinces.find((x) => x._id === val);
                            if (p) setPicked({ id: p._id, name: p.name, level: 'PROVINCE' });
                          }
                        }}
                        style={styles.picker}
                      >
                        <Picker.Item label={t('finance.chooseProvince', '-- Choose Province --')} value="" />
                        {listProvinces.map((p) => (
                          <Picker.Item key={p._id} label={p.name} value={p._id} />
                        ))}
                      </Picker>
                    </View>

                    {/* District Selection */}
                    {listDistricts.length > 0 && (
                      <>
                        <Text style={[styles.fieldSubLabel, { marginTop: 8 }, isRTL && { textAlign: 'right' }]}>{t('finance.stepSelectDistrict', '2. Select District')}</Text>
                        <View style={styles.pickerWrap}>
                          <Picker
                            selectedValue={pickDist}
                            onValueChange={(val) => {
                              setPickDist(val);
                              if (val) {
                                const d = listDistricts.find((x) => x._id === val);
                                if (d) setPicked({ id: d._id, name: d.name, level: 'DISTRICT' });
                              }
                            }}
                            style={styles.picker}
                          >
                            <Picker.Item label={t('finance.chooseDistrict', '-- Choose District --')} value="" />
                            {listDistricts.map((d) => (
                              <Picker.Item key={d._id} label={d.name} value={d._id} />
                            ))}
                          </Picker>
                        </View>
                      </>
                    )}

                    {/* Area Selection */}
                    {listAreas.length > 0 && (
                      <>
                        <Text style={[styles.fieldSubLabel, { marginTop: 8 }, isRTL && { textAlign: 'right' }]}>{t('finance.stepSelectArea', '3. Select Area')}</Text>
                        <View style={styles.pickerWrap}>
                          <Picker
                            selectedValue={pickArea}
                            onValueChange={(val) => {
                              setPickArea(val);
                              if (val) {
                                const a = listAreas.find((x) => x._id === val);
                                if (a) setPicked({ id: a._id, name: a.name, level: 'AREA' });
                              }
                            }}
                            style={styles.picker}
                          >
                            <Picker.Item label={t('finance.chooseArea', '-- Choose Area --')} value="" />
                            {listAreas.map((a) => (
                              <Picker.Item key={a._id} label={a.name} value={a._id} />
                            ))}
                          </Picker>
                        </View>
                      </>
                    )}

                    {/* Basic Unit Selection */}
                    {listUnits.length > 0 && (
                      <>
                        <Text style={[styles.fieldSubLabel, { marginTop: 8 }, isRTL && { textAlign: 'right' }]}>{t('finance.stepSelectBasicUnit', '4. Select Basic Unit')}</Text>
                        <View style={styles.pickerWrap}>
                          <Picker
                            selectedValue={picked?.level === 'BASIC_UNIT' ? picked.id : ''}
                            onValueChange={(val) => {
                              if (val) {
                                const u = listUnits.find((x) => x._id === val);
                                if (u) setPicked({ id: u._id, name: u.name, level: 'BASIC_UNIT' });
                              }
                            }}
                            style={styles.picker}
                          >
                            <Picker.Item label={t('finance.chooseBasicUnit', '-- Choose Basic Unit --')} value="" />
                            {listUnits.map((u) => (
                              <Picker.Item key={u._id} label={u.name} value={u._id} />
                            ))}
                          </Picker>
                        </View>
                      </>
                    )}
                  </ScrollView>
                ) : (
                  <View style={[styles.treeContainer, isTablet && { height: Math.min(520, height * 0.55) }]}>
                    <OrgTree 
                      selectedId={picked?.id} 
                      disabledId={resolvedUnitId} 
                      source={{ level: activeLevel, unitId: resolvedUnitId }}
                      onSelect={(node) => setPicked(node)}
                    />
                  </View>
                )}
              </View>

              {/* Right Column: Form Inputs */}
              <ScrollView 
                style={[styles.formCol, isTablet && styles.formColTablet]} 
                contentContainerStyle={{ padding: isTablet ? Spacing.md : Spacing.lg, paddingBottom: 40 }}
                keyboardShouldPersistTaps="handled"
              >
                {/* Inline Error Alert Banner */}
                {modalErr ? (
                  <View style={[styles.alertError, isRTL && { flexDirection: 'row-reverse' }]}>
                    <Ionicons name="alert-circle" size={18} color={Colors.error} style={isRTL ? { marginLeft: 8 } : { marginRight: 8 }} />
                    <Text style={[styles.alertErrorText, isRTL && { textAlign: 'right' }]}>{modalErr}</Text>
                  </View>
                ) : null}

                {/* Transfer From */}
                <View style={styles.field}>
                  <Text style={[styles.fieldLabel, isRTL && { textAlign: 'right' }]}>{t('finance.transferFromSource', 'Transfer From (Source)')}</Text>
                  <View style={styles.endpointCard}>
                    <View style={[{ flexDirection: isRTL ? 'row-reverse' : 'row', justifyContent: 'space-between', alignItems: 'center' }]}>
                      <Text style={styles.endpointLevel}>{getLevelLabel(activeLevel)}</Text>
                      {sourceBalance !== null && (
                        <Text style={{ fontSize: 12, fontWeight: '700', color: sourceBalance > 0 ? '#15803d' : '#b91c1c' }}>
                          {t('finance.available', 'Available:')} {PKR(sourceBalance)}
                        </Text>
                      )}
                    </View>
                    <Text style={[styles.endpointName, isRTL && { textAlign: 'right' }]}>{unitDisplayName}</Text>
                    {pendingOutAmount > 0 && (
                      <Text style={[{ fontSize: 11, color: '#d97706', marginTop: 4 }, isRTL && { textAlign: 'right' }]}>
                        {t('finance.committedInUnack', '⚠️ {{amount}} committed in unacknowledged Outgoing transfers', { amount: PKR(pendingOutAmount) })}
                      </Text>
                    )}
                    {sourceBalance !== null && sourceBalance <= 0 && (
                      <View style={[{ backgroundColor: '#fef2f2', borderColor: '#fca5a5', borderWidth: 1, borderRadius: 6, padding: 8, marginTop: 8, flexDirection: isRTL ? 'row-reverse' : 'row', alignItems: 'center' }]}>
                        <Ionicons name="alert-circle" size={16} color={Colors.error} style={isRTL ? { marginLeft: 6 } : { marginRight: 6 }} />
                        <Text style={[{ color: '#b91c1c', fontSize: 11, fontWeight: '600', flex: 1 }, isRTL && { textAlign: 'right' }]}>
                          {t('finance.balanceZeroErr', 'Transfer cannot proceed: available balance is PKR 0 (funds are already committed in pending outgoing transfers or exhausted).')}
                        </Text>
                      </View>
                    )}
                  </View>
                </View>

                {/* Selected Destination Card */}
                <View style={styles.field}>
                  <Text style={[styles.fieldLabel, isRTL && { textAlign: 'right' }]}>{t('finance.selectedDestination', 'Selected Destination')}</Text>
                  {!picked ? (
                    <View style={[styles.endpointCard, { backgroundColor: '#f8fafc', borderColor: '#e2e8f0' }]}>
                      <Text style={[{ color: Colors.textMuted, fontStyle: 'italic', fontSize: FontSize.sm }, isRTL && { textAlign: 'right' }]}>
                        {t('finance.pickDestinationHelp', '👈 Pick a destination unit from the organization tree.')}
                      </Text>
                    </View>
                  ) : previewLoading ? (
                    <View style={[styles.endpointCard, { flexDirection: isRTL ? 'row-reverse' : 'row', alignItems: 'center', gap: 8 }]}>
                      <ActivityIndicator size="small" color={Colors.primary} />
                      <Text style={{ color: Colors.textMuted }}>{t('finance.validatingRouting', 'Validating transfer routing...')}</Text>
                    </View>
                  ) : previewErr ? (
                    <View style={[styles.endpointCard, { backgroundColor: '#fef2f2', borderColor: '#fecaca' }]}>
                      <Text style={[{ color: Colors.error, fontSize: FontSize.sm, fontWeight: '600' }, isRTL && { textAlign: 'right' }]}>{previewErr}</Text>
                    </View>
                  ) : preview ? (
                    <View style={[styles.endpointCard, { backgroundColor: '#f0fdf4', borderColor: '#bbf7d0' }]}>
                      <View style={[{ flexDirection: isRTL ? 'row-reverse' : 'row', justifyContent: 'space-between', alignItems: 'center' }]}>
                        <Text style={[styles.endpointName, { color: '#166534' }]}>{preview.destination.name}</Text>
                        {preview.direction && (
                          <View style={{ backgroundColor: '#dcfce7', paddingHorizontal: 6, paddingVertical: 2, borderRadius: 4 }}>
                            <Text style={{ fontSize: 10, fontWeight: '700', color: '#15803d' }}>
                              {getDirectionLabel(preview.direction)}
                            </Text>
                          </View>
                        )}
                      </View>
                      <Text style={[{ fontSize: FontSize.xs, color: '#15803d', marginTop: 2, fontWeight: '600' }, isRTL && { textAlign: 'right' }]}>
                        {getLevelLabel(preview.destination.level)}
                      </Text>
                      {preview.path && preview.path.length > 0 && (
                        <Text style={[{ fontSize: 11, color: '#166534', marginTop: 4 }, isRTL && { textAlign: 'right' }]}>
                          {t('finance.hierarchy', 'Hierarchy:')} {preview.path.map(p => p.name).join(' → ')}
                        </Text>
                      )}
                    </View>
                  ) : null}
                </View>

                {/* Amount */}
                <View style={styles.field}>
                  <Text style={[styles.fieldLabel, isRTL && { textAlign: 'right' }]}>{t('finance.amountPkrRequired', 'Amount (PKR) *')}</Text>
                  <TextInput 
                    style={[styles.fieldInput, isRTL && { textAlign: 'right' }]} 
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
                    <Text style={[{ fontSize: 11, color: Colors.textMuted, marginTop: 4 }, isRTL && { textAlign: 'right' }]}>
                      {t('finance.maxTransferable', 'Maximum transferable:')} <Text style={{ fontWeight: '700', color: sourceBalance > 0 ? '#15803d' : '#b91c1c' }}>{PKR(sourceBalance)}</Text>
                    </Text>
                  )}
                </View>

                {/* Mode & Reference in 2 columns on Tablet */}
                <View style={[styles.rowFields, isTablet && styles.rowFieldsTablet, isRTL && isTablet && { flexDirection: 'row-reverse' }]}>
                  <View style={[styles.field, isTablet && { flex: 1 }]}>
                    <Text style={[styles.fieldLabel, isRTL && { textAlign: 'right' }]}>{t('finance.paymentMode', 'Payment Mode')}</Text>
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
                    <Text style={[styles.fieldLabel, isRTL && { textAlign: 'right' }]}>{t('finance.refChequeNo', 'Reference / Cheque No.')}</Text>
                    <TextInput 
                      style={[styles.fieldInput, isRTL && { textAlign: 'right' }]} 
                      placeholder="e.g. TXN-998811"
                      placeholderTextColor={Colors.textMuted}
                      value={form.reference}
                      onChangeText={(val) => setForm({ ...form, reference: val })}
                    />
                  </View>
                </View>

                {/* Notes */}
                <View style={styles.field}>
                  <Text style={[styles.fieldLabel, isRTL && { textAlign: 'right' }]}>{t('finance.notes', 'Notes')}</Text>
                  <TextInput 
                    style={[styles.fieldInput, { height: 60 }, isRTL && { textAlign: 'right' }]} 
                    placeholder={t('finance.notesPlaceholder', 'Optional transfer note for receiver')}
                    placeholderTextColor={Colors.textMuted}
                    multiline
                    value={form.note}
                    onChangeText={(val) => setForm({ ...form, note: val })}
                  />
                </View>

                {/* Receipt upload */}
                <View style={styles.field}>
                  <Text style={[styles.fieldLabel, isRTL && { textAlign: 'right' }]}>{t('finance.receiptProofRequired', 'Receipt / Payment Proof *')}</Text>
                  <TouchableOpacity style={[styles.uploadBtn, isRTL && { flexDirection: 'row-reverse' }]} onPress={pickImage}>
                    <Ionicons name="cloud-upload-outline" size={20} color={Colors.primary} style={isRTL ? { marginLeft: 8 } : { marginRight: 8 }} />
                    <Text style={styles.uploadBtnText}>{receipt ? t('finance.changeReceiptImage', 'Change Receipt Image') : t('finance.attachReceiptImage', 'Attach Receipt Image (PNG / JPG)')}</Text>
                  </TouchableOpacity>
                  {receipt && (
                    <View style={[styles.receiptPreview, isRTL && { flexDirection: 'row-reverse' }]}>
                      <Image source={{ uri: receipt.uri }} style={styles.receiptThumb} />
                      <Text style={[styles.receiptName, isRTL && { textAlign: 'right' }]} numberOfLines={1}>{receipt.name || 'receipt.jpg'}</Text>
                      <Ionicons name="checkmark-circle" size={18} color="#15803d" />
                    </View>
                  )}
                </View>

                {/* Action buttons */}
                <View style={[{ flexDirection: isRTL ? 'row-reverse' : 'row', gap: 10, marginTop: 14 }]}>
                  <TouchableOpacity 
                    style={[styles.btnSecondary, { flex: 1, alignItems: 'center', paddingVertical: 12 }]} 
                    onPress={() => setTransferModalOpen(false)}
                  >
                    <Text style={styles.btnSecondaryText}>{t('common.cancel', 'Cancel')}</Text>
                  </TouchableOpacity>
                  <TouchableOpacity 
                    style={[
                      styles.primaryBtn, 
                      { flex: 2, justifyContent: 'center', paddingVertical: 12 },
                      sourceBalance !== null && sourceBalance <= 0 && { backgroundColor: '#94a3b8', opacity: 0.65 },
                    ]} 
                    onPress={handleProceedToConfirm}
                    disabled={sourceBalance !== null && sourceBalance <= 0}
                  >
                    <Text style={[styles.primaryBtnText, { fontSize: FontSize.sm }]}>{t('finance.proceedToConfirm', 'Proceed to Confirm ➔')}</Text>
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
              <Text style={[styles.confirmTitle, isRTL && { textAlign: 'right' }]}>{t('finance.confirmSummary', 'Confirm Transfer Summary')}</Text>
              <Text style={[styles.confirmSubtitle, isRTL && { textAlign: 'right' }]}>{t('finance.confirmSubtitle', 'Please review transfer details before dispatching funds.')}</Text>

              <View style={styles.summaryTable}>
                <View style={[styles.summaryRow, isRTL && { flexDirection: 'row-reverse' }]}>
                  <Text style={[styles.summaryKey, isRTL && { textAlign: 'right' }]}>{t('common.from', 'From')}</Text>
                  <Text style={[styles.summaryVal, isRTL && { textAlign: 'left' }]}>{unitDisplayName} ({getLevelLabel(activeLevel)})</Text>
                </View>
                <View style={[styles.summaryRow, isRTL && { flexDirection: 'row-reverse' }]}>
                  <Text style={[styles.summaryKey, isRTL && { textAlign: 'right' }]}>{t('common.to', 'To')}</Text>
                  <Text style={[styles.summaryVal, isRTL && { textAlign: 'left' }]}>{preview.destination.name}</Text>
                </View>
                <View style={[styles.summaryRow, isRTL && { flexDirection: 'row-reverse' }]}>
                  <Text style={[styles.summaryKey, isRTL && { textAlign: 'right' }]}>{t('finance.destinationLevel', 'Destination Level')}</Text>
                  <Text style={[styles.summaryVal, isRTL && { textAlign: 'left' }]}>{getLevelLabel(preview.destination.level)}</Text>
                </View>
                {preview.path && (
                  <View style={[styles.summaryRow, isRTL && { flexDirection: 'row-reverse' }]}>
                    <Text style={[styles.summaryKey, isRTL && { textAlign: 'right' }]}>{t('finance.hierarchyLabel', 'Hierarchy')}</Text>
                    <Text style={[styles.summaryVal, isRTL && { textAlign: 'left' }]}>{preview.path.map(p => p.name).join(' → ')}</Text>
                  </View>
                )}
                <View style={[styles.summaryRow, isRTL && { flexDirection: 'row-reverse' }]}>
                  <Text style={[styles.summaryKey, isRTL && { textAlign: 'right' }]}>{t('finance.amount', 'Amount')}</Text>
                  <Text style={[styles.summaryVal, { fontWeight: '800', color: Colors.primary, fontSize: FontSize.base }, isRTL && { textAlign: 'left' }]}>
                    {form.amount ? PKR(parseFloat(form.amount)) : '—'}
                  </Text>
                </View>
                <View style={[styles.summaryRow, isRTL && { flexDirection: 'row-reverse' }]}>
                  <Text style={[styles.summaryKey, isRTL && { textAlign: 'right' }]}>{t('finance.receipt', 'Receipt')}</Text>
                  <Text style={[styles.summaryVal, isRTL && { textAlign: 'left' }]}>{receipt ? `${t('finance.attached', 'Attached')} (${receipt.name || 'image'})` : t('common.none', 'None')}</Text>
                </View>
                <View style={[styles.summaryRow, isRTL && { flexDirection: 'row-reverse' }]}>
                  <Text style={[styles.summaryKey, isRTL && { textAlign: 'right' }]}>{t('finance.mode', 'Mode')}</Text>
                  <Text style={[styles.summaryVal, isRTL && { textAlign: 'left' }]}>{form.mode} {form.reference ? `· ${form.reference}` : ''}</Text>
                </View>
                {form.note ? (
                  <View style={[styles.summaryRow, isRTL && { flexDirection: 'row-reverse' }]}>
                    <Text style={[styles.summaryKey, isRTL && { textAlign: 'right' }]}>{t('finance.notes', 'Notes')}</Text>
                    <Text style={[styles.summaryVal, isRTL && { textAlign: 'left' }]}>{form.note}</Text>
                  </View>
                ) : null}
              </View>

              <View style={[{ flexDirection: isRTL ? 'row-reverse' : 'row', gap: 10, marginTop: 20, justifyContent: 'flex-end' }]}>
                <TouchableOpacity 
                  style={[styles.btnSecondary, { paddingHorizontal: 16, paddingVertical: 10 }]} 
                  disabled={submitting} 
                  onPress={() => setConfirmOpen(false)}
                >
                  <Text style={styles.btnSecondaryText}>{t('common.back', 'Back')}</Text>
                </TouchableOpacity>
                <TouchableOpacity 
                  style={[styles.primaryBtn, { paddingHorizontal: 18, paddingVertical: 10, flexDirection: isRTL ? 'row-reverse' : 'row', alignItems: 'center', gap: 6 }]} 
                  disabled={submitting} 
                  onPress={initiate}
                >
                  {submitting && <ActivityIndicator size="small" color="#fff" />}
                  <Text style={styles.primaryBtnText}>{submitting ? t('finance.transferring', 'Transferring…') : t('finance.confirmAndSend', 'Confirm & Send')}</Text>
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
              <View style={[{ flexDirection: isRTL ? 'row-reverse' : 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }]}>
                <Text style={styles.confirmTitle}>{t('finance.cancelPendingTitle', 'Cancel Pending Transfer')}</Text>
                <TouchableOpacity onPress={() => !cancelling && setCancelModalOpen(false)}>
                  <Ionicons name="close" size={24} color={Colors.text} />
                </TouchableOpacity>
              </View>
              <Text style={[styles.confirmSubtitle, isRTL && { textAlign: 'right' }]}>
                {t('finance.cancelPendingSubtitle', 'Are you sure you want to cancel the transfer of {{amount}} to {{destination}}?', {
                  amount: PKR(cancelTarget.amount),
                  destination: cancelTarget.destinationName
                })}
              </Text>
              <Text style={[{ fontSize: 12, color: '#15803d', marginTop: 6, fontWeight: '600' }, isRTL && { textAlign: 'right' }]}>
                {t('finance.cancelRestoredNotice', '✓ Committed funds will be restored immediately to your available balance.')}
              </Text>

              {cancelErr ? (
                <View style={[styles.alertError, { marginTop: 12 }, isRTL && { flexDirection: 'row-reverse' }]}>
                  <Ionicons name="alert-circle" size={18} color={Colors.error} style={isRTL ? { marginLeft: 6 } : { marginRight: 6 }} />
                  <Text style={[styles.alertErrorText, isRTL && { textAlign: 'right' }]}>{cancelErr}</Text>
                </View>
              ) : null}

              <View style={[{ flexDirection: isRTL ? 'row-reverse' : 'row', gap: 10, marginTop: 20, justifyContent: 'flex-end' }]}>
                <TouchableOpacity 
                  style={[styles.btnSecondary, { paddingHorizontal: 16, paddingVertical: 10 }]} 
                  disabled={cancelling} 
                  onPress={() => setCancelModalOpen(false)}
                >
                  <Text style={styles.btnSecondaryText}>{t('finance.keepTransfer', 'Keep Transfer')}</Text>
                </TouchableOpacity>
                <TouchableOpacity 
                  style={[{ backgroundColor: Colors.error, borderRadius: Radius.md, paddingHorizontal: 18, paddingVertical: 10, flexDirection: isRTL ? 'row-reverse' : 'row', alignItems: 'center', gap: 6 }]} 
                  disabled={cancelling} 
                  onPress={handleConfirmCancel}
                >
                  {cancelling && <ActivityIndicator size="small" color="#fff" />}
                  <Text style={{ color: '#fff', fontWeight: '700', fontSize: FontSize.sm }}>{cancelling ? t('common.cancelling', 'Cancelling…') : t('finance.yesCancelTransfer', 'Yes, Cancel Transfer')}</Text>
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
              <View style={[{ flexDirection: isRTL ? 'row-reverse' : 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }]}>
                <View style={[{ flex: 1, [isRTL ? 'marginLeft' : 'marginRight']: 8 }]}>
                  <Text style={[styles.confirmTitle, isRTL && { textAlign: 'right' }]}>{t('finance.reviewAndAcknowledge', 'Review & Acknowledge')}</Text>
                  <Text style={[{ fontSize: 12, color: Colors.textMuted }, isRTL && { textAlign: 'right' }]}>{t('finance.reviewSubtitle', 'Verify payment receipt and details before accepting funds.')}</Text>
                </View>
                <TouchableOpacity onPress={() => !approving && setApproveModalOpen(false)}>
                  <Ionicons name="close" size={24} color={Colors.text} />
                </TouchableOpacity>
              </View>

              <ScrollView showsVerticalScrollIndicator={false}>
                {approveErr ? (
                  <View style={[styles.alertError, { marginBottom: 12 }, isRTL && { flexDirection: 'row-reverse' }]}>
                    <Ionicons name="alert-circle" size={18} color={Colors.error} style={isRTL ? { marginLeft: 6 } : { marginRight: 6 }} />
                    <Text style={[styles.alertErrorText, isRTL && { textAlign: 'right' }]}>{approveErr}</Text>
                  </View>
                ) : null}

                {/* Summary Table */}
                <View style={styles.summaryTable}>
                  <View style={[styles.summaryRow, isRTL && { flexDirection: 'row-reverse' }]}>
                    <Text style={[styles.summaryKey, isRTL && { textAlign: 'right' }]}>{t('finance.fromUnit', 'From Unit')}</Text>
                    <Text style={[styles.summaryVal, isRTL && { textAlign: 'left' }]}>{approveTarget.sourceName} ({getLevelLabel(approveTarget.sourceLevel)})</Text>
                  </View>
                  <View style={[styles.summaryRow, isRTL && { flexDirection: 'row-reverse' }]}>
                    <Text style={[styles.summaryKey, isRTL && { textAlign: 'right' }]}>{t('finance.amount', 'Amount')}</Text>
                    <Text style={[styles.summaryVal, { fontWeight: '800', color: '#15803d', fontSize: FontSize.md }, isRTL && { textAlign: 'left' }]}>
                      {PKR(approveTarget.amount)}
                    </Text>
                  </View>
                  <View style={[styles.summaryRow, isRTL && { flexDirection: 'row-reverse' }]}>
                    <Text style={[styles.summaryKey, isRTL && { textAlign: 'right' }]}>{t('finance.paymentMode', 'Payment Mode')}</Text>
                    <Text style={[styles.summaryVal, isRTL && { textAlign: 'left' }]}>{approveTarget.mode} {approveTarget.reference ? `· ${t('finance.ref', 'Ref')}: ${approveTarget.reference}` : ''}</Text>
                  </View>
                  {approveTarget.note ? (
                    <View style={[styles.summaryRow, isRTL && { flexDirection: 'row-reverse' }]}>
                      <Text style={[styles.summaryKey, isRTL && { textAlign: 'right' }]}>{t('finance.senderNote', 'Sender Note')}</Text>
                      <Text style={[styles.summaryVal, isRTL && { textAlign: 'left' }]}>{approveTarget.note}</Text>
                    </View>
                  ) : null}
                </View>

                {/* Receipt Image Box */}
                <Text style={[{ fontSize: 13, fontWeight: '700', color: Colors.text, marginTop: 14, marginBottom: 6 }, isRTL && { textAlign: 'right' }]}>
                  {t('finance.paymentProofReceipt', 'Payment Proof / Receipt')}
                </Text>
                {approveTarget.receiptImageUrl ? (
                  <View style={{ borderRadius: Radius.md, overflow: 'hidden', borderWidth: 1, borderColor: Colors.border, backgroundColor: '#0f172a' }}>
                    <Image 
                      source={{ uri: resolveMediaUrl(approveTarget.receiptImageUrl) }} 
                      style={{ width: '100%', height: Math.min(260, height * 0.35) }} 
                      resizeMode="contain" 
                    />
                    <TouchableOpacity 
                      style={[{ flexDirection: isRTL ? 'row-reverse' : 'row', alignItems: 'center', justifyContent: 'center', gap: 6, paddingVertical: 8, backgroundColor: 'rgba(15, 23, 42, 0.8)' }]}
                      onPress={() => {
                        setPreviewUrl(resolveMediaUrl(approveTarget.receiptImageUrl));
                      }}
                    >
                      <Ionicons name="expand-outline" size={16} color="#fff" />
                      <Text style={{ color: '#fff', fontSize: 12, fontWeight: '600' }}>{t('finance.tapToViewFull', 'Tap to view full size')}</Text>
                    </TouchableOpacity>
                  </View>
                ) : (
                  <View style={[{ padding: 14, backgroundColor: '#fef3c7', borderRadius: Radius.md, flexDirection: isRTL ? 'row-reverse' : 'row', alignItems: 'center', gap: 8 }]}>
                    <Ionicons name="warning-outline" size={20} color="#b45309" />
                    <Text style={[{ color: '#92400e', fontSize: 12, flex: 1 }, isRTL && { textAlign: 'right' }]}>{t('finance.noReceiptAttached', 'No receipt image was attached by the sender.')}</Text>
                  </View>
                )}

                {/* Optional Note */}
                <Text style={[{ fontSize: 12, fontWeight: '600', color: Colors.textMuted, marginTop: 14, marginBottom: 4 }, isRTL && { textAlign: 'right' }]}>
                  {t('finance.ackNoteOptional', 'Acknowledgment Note (Optional)')}
                </Text>
                <TextInput
                  style={[styles.fieldInput, { height: 44 }, isRTL && { textAlign: 'right' }]}
                  placeholder={t('finance.ackNotePlaceholder', 'e.g. Verified via Bank Alfalah ref #12345')}
                  placeholderTextColor={Colors.textMuted}
                  value={approveNote}
                  onChangeText={setApproveNote}
                />
              </ScrollView>

              <View style={[{ flexDirection: isRTL ? 'row-reverse' : 'row', gap: 10, marginTop: 16, justifyContent: 'flex-end', paddingTop: 10, borderTopWidth: 1, borderTopColor: Colors.border }]}>
                <TouchableOpacity 
                  style={[styles.btnSecondary, { paddingHorizontal: 14, paddingVertical: 10 }]} 
                  disabled={approving} 
                  onPress={() => setApproveModalOpen(false)}
                >
                  <Text style={styles.btnSecondaryText}>{t('common.close', 'Close')}</Text>
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
                  <Text style={{ color: '#fff', fontWeight: '700', fontSize: FontSize.sm }}>{t('finance.reject', 'Reject')}</Text>
                </TouchableOpacity>
                <TouchableOpacity 
                  style={[{ backgroundColor: '#15803d', borderRadius: Radius.md, paddingHorizontal: 16, paddingVertical: 10, flexDirection: isRTL ? 'row-reverse' : 'row', alignItems: 'center', gap: 6 }]} 
                  disabled={approving} 
                  onPress={handleConfirmApprove}
                >
                  {approving && <ActivityIndicator size="small" color="#fff" />}
                  <Text style={{ color: '#fff', fontWeight: '700', fontSize: FontSize.sm }}>
                    {approving ? t('finance.acknowledging', 'Acknowledging…') : `${t('finance.acceptFunds', 'Accept Funds')} (${PKR(approveTarget.amount)})`}
                  </Text>
                </TouchableOpacity>
              </View>
            </View>
          </View>
        </Modal>
      )}

      {/* Reject Modal */}
      {rejectModalOpen && (
        <Modal visible={rejectModalOpen} transparent animationType="fade" onRequestClose={() => !rejecting && setRejectModalOpen(false)}>
          <View style={styles.modalBackdrop}>
            <View style={[styles.confirmModal, { maxWidth: 500 }]}>
              <View style={[{ flexDirection: isRTL ? 'row-reverse' : 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }]}>
                <Text style={styles.confirmTitle}>{t('finance.rejectModalTitle', 'Reject Transfer')}</Text>
                <TouchableOpacity onPress={() => !rejecting && setRejectModalOpen(false)}>
                  <Ionicons name="close" size={24} color={Colors.text} />
                </TouchableOpacity>
              </View>
              <Text style={[styles.confirmSubtitle, isRTL && { textAlign: 'right' }]}>
                {t('finance.rejectModalSubtitle', 'Please provide a reason for rejecting this transfer.')}
              </Text>

              {rejectErr ? (
                <View style={[styles.alertError, { marginTop: 12 }, isRTL && { flexDirection: 'row-reverse' }]}>
                  <Ionicons name="alert-circle" size={18} color={Colors.error} style={isRTL ? { marginLeft: 6 } : { marginRight: 6 }} />
                  <Text style={[styles.alertErrorText, isRTL && { textAlign: 'right' }]}>{rejectErr}</Text>
                </View>
              ) : null}

              <TextInput
                style={[styles.fieldInput, { height: 70, marginTop: 12 }, isRTL && { textAlign: 'right' }]}
                placeholder={t('finance.rejectReasonPlaceholder', 'Reason for rejection (required)')}
                placeholderTextColor={Colors.textMuted}
                multiline
                value={rejectReason}
                onChangeText={setRejectReason}
              />

              <View style={[{ flexDirection: isRTL ? 'row-reverse' : 'row', gap: 10, marginTop: 20, justifyContent: 'flex-end' }]}>
                <TouchableOpacity
                  style={[styles.btnSecondary, { paddingHorizontal: 16, paddingVertical: 10 }]}
                  disabled={rejecting}
                  onPress={() => setRejectModalOpen(false)}
                >
                  <Text style={styles.btnSecondaryText}>{t('common.cancel', 'Cancel')}</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[{ backgroundColor: Colors.error, borderRadius: Radius.md, paddingHorizontal: 18, paddingVertical: 10, flexDirection: isRTL ? 'row-reverse' : 'row', alignItems: 'center', gap: 6 }]}
                  disabled={rejecting}
                  onPress={handleConfirmReject}
                >
                  {rejecting && <ActivityIndicator size="small" color="#fff" />}
                  <Text style={{ color: '#fff', fontWeight: '700', fontSize: FontSize.sm }}>
                    {rejecting ? t('finance.rejecting', 'Rejecting…') : t('finance.confirmRejection', 'Confirm Rejection')}
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
              <View style={[{ flexDirection: isRTL ? 'row-reverse' : 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }]}>
                <Text style={styles.confirmTitle}>{t('finance.receiptPreviewTitle', 'Receipt / Proof of Payment')}</Text>
                <TouchableOpacity onPress={() => setPreviewUrl(null)}>
                  <Ionicons name="close" size={24} color={Colors.text} />
                </TouchableOpacity>
              </View>
              <Image 
                source={{ uri: resolveMediaUrl(previewUrl) }} 
                style={{ width: '100%', height: Math.min(420, height * 0.5), borderRadius: 8, backgroundColor: '#0f172a' }} 
                resizeMode="contain" 
              />
              <View style={[{ marginTop: 16, alignItems: isRTL ? 'flex-start' : 'flex-end' }]}>
                <TouchableOpacity style={styles.btnSecondary} onPress={() => setPreviewUrl(null)}>
                  <Text style={styles.btnSecondaryText}>{t('common.close', 'Close')}</Text>
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
