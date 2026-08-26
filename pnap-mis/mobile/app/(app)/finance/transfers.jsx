import React, { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
  Modal,
  KeyboardAvoidingView,
  Platform,
  TextInput,
  Image,
  Alert,
} from 'react-native';
import { useLocalSearchParams } from 'expo-router';
import * as ImagePicker from 'expo-image-picker';
import { Picker } from '@react-native-picker/picker';
import { Ionicons } from '@expo/vector-icons';
import { useAuth } from '../../../src/context/AuthContext';
import { useUnit } from '../../../src/context/UnitContext';
import { api, errorMessage } from '../../../src/api/client';
import { Storage } from '../../../src/utils/storage';
import { canManageFinance } from '../../../src/utils/permissions';
import { useToast } from '../../../src/components/Toast';
import Badge from '../../../src/components/Badge';
import OrgTree from '../../../src/components/OrgTree';
import { Colors, FontSize, Spacing, Radius } from '../../../src/constants/colors';
import { shortDate, PKR } from '../../../src/utils/formatters';

const LEVEL_LABEL = {
  BASIC_UNIT: 'Basic Unit', AREA: 'Area', DISTRICT: 'District',
  PROVINCE: 'Province', CENTRAL: 'Center',
};
const DIRECTION_LABEL = { UP: 'Upward', DOWN: 'Downward', SAME_TIER: 'Same tier' };
const PAYMENT_MODES = ['BANK_TRANSFER', 'CASH', 'MOBILE_WALLET', 'CHEQUE'];

export default function TransfersScreen() {
  const { user } = useAuth();
  const { ctx, setCtx } = useUnit();
  const toast = useToast();
  const params = useLocalSearchParams();

  const queryBody = params.body || '';
  const isJirgaView = queryBody === 'JIRGA';
  const isCommitteeView = queryBody === 'COMMITTEE';
  const targetBody = isJirgaView ? 'JIRGA' : (isCommitteeView ? 'COMMITTEE' : 'EXECUTIVE');

  const [tab, setTab] = useState('outgoing');
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);

  const activeLevel = params.unitLevel || ctx?.unitLevel || 'CENTRAL';
  const [resolvedUnitId, setResolvedUnitId] = useState(ctx?.unitId);

  // Resolve CENTRAL unit ObjectId if passed as string 'CENTRAL'
  useEffect(() => {
    let rawId = params.unitId || ctx?.unitId;
    if (activeLevel === 'CENTRAL' && (!rawId || rawId === 'CENTRAL')) {
      api.get('/org/central').then((r) => {
        if (r.data?.data?._id) {
          setResolvedUnitId(r.data.data._id);
          if (ctx?.unitLevel === 'CENTRAL' && ctx?.unitId === 'CENTRAL') {
            setCtx({ unitLevel: 'CENTRAL', unitId: r.data.data._id, unitName: r.data.data.name || 'PKNAP Central' });
          }
        }
      }).catch(() => {});
    } else {
      setResolvedUnitId(rawId);
    }
  }, [params.unitId, params.unitLevel, ctx]);

  const canSend = canManageFinance(user);

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

  async function reload() {
    if (!activeLevel || !resolvedUnitId || resolvedUnitId === 'CENTRAL') return;
    setLoading(true);
    try {
      const q = { unitLevel: activeLevel, unitId: resolvedUnitId, direction: tab, body: targetBody };
      const r = await api.get('/transfers', { params: q });
      setItems(r.data.data || []);
    } catch (err) {
      toast.error(errorMessage(err));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    reload();
  }, [activeLevel, resolvedUnitId, tab, targetBody]);

  // Destination preview validation
  useEffect(() => {
    let cancelled = false;
    if (!activeLevel || !resolvedUnitId || !picked) {
      setPreview(null);
      setPreviewErr('');
      return;
    }
    setPreviewLoading(true);
    setPreviewErr('');
    api.get('/transfers/destination-preview', {
      params: { sourceLevel: activeLevel, sourceUnitId: resolvedUnitId, destinationId: picked.id },
    })
      .then((r) => {
        if (!cancelled) {
          setPreview(r.data.data);
          setPreviewErr('');
        }
      })
      .catch((e) => {
        if (!cancelled) {
          setPreview(null);
          setPreviewErr(errorMessage(e));
        }
      })
      .finally(() => {
        if (!cancelled) setPreviewLoading(false);
      });
    return () => { cancelled = true; };
  }, [activeLevel, resolvedUnitId, picked]);

  async function pickImage() {
    let result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      quality: 0.8,
    });
    if (!result.canceled) {
      const asset = result.assets[0];
      setReceipt({
        uri: asset.uri,
        type: asset.mimeType || 'image/jpeg',
        name: asset.fileName || 'receipt.jpg',
        file: asset.file,
      });
      setModalErr('');
    }
  }

  function handleProceedToConfirm() {
    setModalErr('');
    if (!picked) {
      const msg = 'Please select a destination unit from the organization tree.';
      setModalErr(msg);
      toast.error(msg);
      return;
    }
    if (previewLoading) {
      const msg = 'Checking destination unit, please wait...';
      setModalErr(msg);
      return;
    }
    if (previewErr || !preview) {
      const msg = previewErr || 'Invalid destination unit selected.';
      setModalErr(msg);
      toast.error(msg);
      return;
    }
    if (!form.amount || parseFloat(form.amount) <= 0) {
      const msg = 'Please enter a valid amount greater than 0.';
      setModalErr(msg);
      toast.error(msg);
      return;
    }
    if (!receipt) {
      const msg = 'Please attach a receipt / proof-of-payment image.';
      setModalErr(msg);
      toast.error(msg);
      return;
    }
    setConfirmOpen(true);
  }

  async function initiate() {
    if (!preview) { setModalErr('Select a valid destination.'); return; }
    if (!form.amount || parseFloat(form.amount) <= 0) { setModalErr('Valid amount is required.'); return; }
    if (!receipt) { setModalErr('Please attach a receipt image.'); return; }

    setSubmitting(true);
    setModalErr('');
    try {
      const fd = new FormData();
      fd.append('sourceLevel', activeLevel);
      fd.append('sourceUnitId', resolvedUnitId);
      fd.append('destinationId', preview.destination.id);
      fd.append('body', targetBody);
      fd.append('amount', form.amount);
      fd.append('mode', form.mode);
      if (form.reference) fd.append('reference', form.reference);
      if (form.note) fd.append('note', form.note);
      
      if (Platform.OS === 'web' && receipt.file) {
        fd.append('receipt', receipt.file);
      } else {
        fd.append('receipt', {
          uri: receipt.uri,
          type: receipt.type,
          name: receipt.name,
        });
      }

      const token = await Storage.getItem('pnap_token');
      const headers = {};
      if (token) headers['Authorization'] = `Bearer ${token}`;
      
      const baseURL = api.defaults.baseURL || 'http://localhost:5000/api';
      const res = await fetch(`${baseURL}/transfers`, {
        method: 'POST',
        headers,
        body: fd
      });

      const resData = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(resData?.error?.message || resData?.message || `Transfer failed (${res.status})`);
      }
      
      const successMsg = `Fund transfer of ${PKR(parseFloat(form.amount))} to ${preview.destination.name} initiated successfully!`;
      setForm({ amount: '', mode: 'BANK_TRANSFER', reference: '', note: '' });
      setReceipt(null);
      setPicked(null);
      setPreview(null);
      setConfirmOpen(false);
      setTransferModalOpen(false);
      reload();
      toast.success(successMsg);

      if (Platform.OS === 'web' && typeof window !== 'undefined' && window.alert) {
        window.alert(successMsg);
      } else {
        Alert.alert('Transfer Initiated', successMsg);
      }
    } catch (e) {
      const err = errorMessage(e);
      setModalErr(err);
      toast.error(err);
      setConfirmOpen(false);

      if (Platform.OS === 'web' && typeof window !== 'undefined' && window.alert) {
        window.alert(`Transfer Error: ${err}`);
      } else {
        Alert.alert('Transfer Failed', err);
      }
    } finally {
      setSubmitting(false);
    }
  }

  async function ack(id) {
    try {
      await api.post(`/transfers/${id}/ack`, {});
      reload();
      toast.success('Transfer acknowledged — funds added to your balance.');
    } catch (e) {
      toast.error(errorMessage(e));
    }
  }

  async function reject(id) {
    const reason = Platform.OS === 'web' && typeof window !== 'undefined' && window.prompt
      ? window.prompt('Reason for rejecting this transfer:')
      : 'Rejected by finance authority';
    
    if (!reason) return;
    try {
      await api.post(`/transfers/${id}/reject`, { reason });
      reload();
      toast.success('Transfer rejected.');
    } catch (e) {
      toast.error(errorMessage(e));
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

  const unitDisplayName = ctx?.unitName || (activeLevel === 'CENTRAL' ? 'PKNAP Central' : 'My Unit');

  const pageTitle = isJirgaView
    ? (activeLevel === 'CENTRAL' ? 'Qomi Jirga Fund Transfers' : `Sobayi Jirga Fund Transfers · ${unitDisplayName}`)
    : (isCommitteeView ? `Committee Transfers · ${unitDisplayName}` : `Executive Transfers · ${unitDisplayName}`);

  return (
    <SafeAreaView style={styles.safe}>
      <View style={styles.header}>
        <Text style={styles.pageTitle}>{pageTitle}</Text>
        <View style={styles.actionsRow}>
          <TouchableOpacity style={styles.btnSecondary} onPress={() => toast.success('Exporting PDF...')}>
            <Text style={styles.btnSecondaryText}>Export PDF</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.btnSecondary} onPress={() => toast.success('Exporting Excel...')}>
            <Text style={styles.btnSecondaryText}>Export Excel</Text>
          </TouchableOpacity>
          {canSend && (
            <TouchableOpacity style={styles.btnPrimary} onPress={() => setTransferModalOpen(true)}>
              <Text style={styles.btnPrimaryText}>
                {isJirgaView ? '+ Initiate Jirga Fund Transfer' : (isCommitteeView ? '+ Initiate Committee Fund Transfer' : '+ Initiate Fund Transfer')}
              </Text>
            </TouchableOpacity>
          )}
        </View>
      </View>

      {/* Scope banner */}
      <View style={styles.banner}>
        <Text style={styles.bannerText}>
          <Text style={{ fontWeight: '700' }}>{unitDisplayName}</Text>{' '}
          {activeLevel === 'CENTRAL'
            ? 'may send funds to any unit in the organization.'
            : activeLevel === 'PROVINCE'
              ? 'may send funds to any unit in the organization, including other provinces.'
              : 'may send funds to any unit within its own province, or to the Center.'}
          {' '}The unit you choose receives the funds and is the only one that acknowledges them.
        </Text>
      </View>

      {/* Tabs */}
      <View style={styles.tabRow}>
        <TouchableOpacity style={[styles.tab, tab === 'outgoing' && styles.tabActive]} onPress={() => setTab('outgoing')}>
          <Text style={[styles.tabText, tab === 'outgoing' && styles.tabTextActive]}>Outgoing</Text>
        </TouchableOpacity>
        <TouchableOpacity style={[styles.tab, tab === 'incoming' && styles.tabActive]} onPress={() => setTab('incoming')}>
          <Text style={[styles.tabText, tab === 'incoming' && styles.tabTextActive]}>Incoming</Text>
        </TouchableOpacity>
      </View>

      {loading ? (
        <ActivityIndicator size="large" color={Colors.primary} style={{ marginTop: 40 }} />
      ) : (
        <ScrollView style={styles.tableScroll} horizontal>
          <View>
            <View style={styles.thRow}>
              <Text style={[styles.th, { width: 100 }]}>Date</Text>
              <Text style={[styles.th, { width: 220 }]}>{tab === 'outgoing' ? 'To' : 'From'}</Text>
              <Text style={[styles.th, { width: 120 }]}>Mode</Text>
              <Text style={[styles.th, { width: 120 }]}>Reference</Text>
              <Text style={[styles.th, { width: 120, textAlign: 'right' }]}>Amount</Text>
              <Text style={[styles.th, { width: 90, textAlign: 'center' }]}>Receipt</Text>
              <Text style={[styles.th, { width: 130 }]}>State</Text>
              <Text style={[styles.th, { width: 160 }]}>Actions</Text>
            </View>

            {displayedItems.length === 0 ? (
              <Text style={styles.emptyText}>No {isJirgaView ? 'Jirga' : (isCommitteeView ? 'committee' : 'executive')} transfers in this view.</Text>
            ) : (
              displayedItems.map((t) => (
                <View key={t._id} style={styles.tr}>
                  <Text style={[styles.td, { width: 100 }]} numberOfLines={1}>{shortDate(t.createdAt)}</Text>
                  
                  <View style={[styles.td, { width: 220, flexDirection: 'row', alignItems: 'center' }]}>
                    <View style={{
                      backgroundColor: t.body === 'JIRGA' ? '#f3e8ff' : (t.body === 'COMMITTEE' ? '#e0f2fe' : '#f1f5f9'),
                      paddingHorizontal: 6, paddingVertical: 2, borderRadius: 4, marginRight: 6,
                      borderWidth: t.body === 'JIRGA' ? 1 : 0, borderColor: '#d8b4fe'
                    }}>
                      <Text style={{
                        color: t.body === 'JIRGA' ? '#6b21a8' : (t.body === 'COMMITTEE' ? '#0369a1' : '#475569'),
                        fontSize: 10, fontWeight: '700'
                      }}>
                        {t.body === 'JIRGA' ? 'Jirga' : (t.body === 'COMMITTEE' ? 'Comm' : 'Exec')}
                      </Text>
                    </View>
                    <Text numberOfLines={2} style={{ flex: 1, fontSize: FontSize.sm, color: Colors.text }}>{counterparty(t)}</Text>
                  </View>

                  <Text style={[styles.td, { width: 120 }]} numberOfLines={1}>{t.mode}</Text>
                  <Text style={[styles.td, { width: 120 }]} numberOfLines={1}>{t.reference || '—'}</Text>
                  <Text style={[styles.td, { width: 120, textAlign: 'right', fontWeight: '600' }]} numberOfLines={1}>{PKR(t.amount)}</Text>
                  
                  <View style={[styles.td, { width: 90, alignItems: 'center', justifyContent: 'center' }]}>
                    {t.receiptImageUrl ? (
                      <TouchableOpacity onPress={() => setPreviewUrl(t.receiptImageUrl)}>
                        <Text style={{ color: Colors.primary, fontWeight: '600', fontSize: FontSize.sm }}>View</Text>
                      </TouchableOpacity>
                    ) : (
                      <Text style={{ color: Colors.textMuted }}>—</Text>
                    )}
                  </View>

                  <View style={[styles.td, { width: 130, justifyContent: 'center' }]}>
                    <Badge variant={t.state === 'ACKNOWLEDGED' ? 'success' : t.state === 'REJECTED' ? 'error' : 'warning'} label={t.state} />
                    {t.state === 'REJECTED' && t.decisionNote && (
                      <Text style={{ fontSize: 10, color: Colors.error, marginTop: 2 }} numberOfLines={2}>
                        Reason: {t.decisionNote}
                      </Text>
                    )}
                  </View>

                  <View style={[styles.td, { width: 160, flexDirection: 'row', alignItems: 'center', gap: 6 }]}>
                    {tab === 'incoming' && t.state === 'PENDING_ACK' ? (
                      <>
                        <TouchableOpacity style={[styles.btnSmall, { backgroundColor: Colors.primary }]} onPress={() => ack(t._id)}>
                          <Text style={{ color: '#fff', fontSize: 11, fontWeight: '700' }}>Approve</Text>
                        </TouchableOpacity>
                        <TouchableOpacity style={[styles.btnSmall, { backgroundColor: Colors.error }]} onPress={() => reject(t._id)}>
                          <Text style={{ color: '#fff', fontSize: 11, fontWeight: '700' }}>Reject</Text>
                        </TouchableOpacity>
                      </>
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

      {/* Initiate Transfer Modal */}
      <Modal visible={transferModalOpen} animationType="slide" presentationStyle="pageSheet" onRequestClose={() => setTransferModalOpen(false)}>
        <SafeAreaView style={{ flex: 1, backgroundColor: Colors.background }}>
          <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1 }}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Initiate Fund Transfer</Text>
              <TouchableOpacity onPress={() => setTransferModalOpen(false)}>
                <Ionicons name="close" size={24} color={Colors.text} />
              </TouchableOpacity>
            </View>
            
            <ScrollView contentContainerStyle={styles.formContent} keyboardShouldPersistTaps="handled">
              
              {/* Inline Error Alert Banner */}
              {modalErr ? (
                <View style={styles.alertError}>
                  <Ionicons name="alert-circle" size={20} color={Colors.error} style={{ marginRight: 8 }} />
                  <Text style={styles.alertErrorText}>{modalErr}</Text>
                </View>
              ) : null}

              {/* Transfer From */}
              <View style={styles.field}>
                <Text style={styles.fieldLabel}>Transfer From</Text>
                <View style={styles.endpointCard}>
                  <Text style={styles.endpointLevel}>{LEVEL_LABEL[activeLevel] || activeLevel}</Text>
                  <Text style={styles.endpointName}>{unitDisplayName}</Text>
                </View>
              </View>

              {/* Choose Destination */}
              <View style={styles.field}>
                <Text style={styles.fieldLabel}>Choose Destination (from Tree)</Text>
                <View style={{ height: 320 }}>
                  <OrgTree 
                    selectedId={picked?.id} 
                    disabledId={resolvedUnitId} 
                    source={{ level: activeLevel, unitId: resolvedUnitId }}
                    onSelect={(node) => setPicked(node)}
                  />
                </View>
              </View>

              {/* Selected Destination Card */}
              <View style={styles.field}>
                <Text style={styles.fieldLabel}>Selected Destination</Text>
                {!picked ? (
                  <View style={[styles.endpointCard, { backgroundColor: '#f8fafc', borderColor: '#e2e8f0' }]}>
                    <Text style={{ color: Colors.textMuted, fontStyle: 'italic', fontSize: FontSize.sm }}>
                      Nothing selected yet — pick a unit from the organization tree above.
                    </Text>
                  </View>
                ) : previewLoading ? (
                  <View style={[styles.endpointCard, { flexDirection: 'row', alignItems: 'center', gap: 8 }]}>
                    <ActivityIndicator size="small" color={Colors.primary} />
                    <Text style={{ color: Colors.textMuted }}>Checking destination validity...</Text>
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
                      <Text style={{ fontSize: 11, color: '#166534', marginTop: 6 }}>
                        Path: {preview.path.map(p => p.name).join(' → ')}
                      </Text>
                    )}
                    <Text style={{ fontSize: 11, color: '#15803d', marginTop: 6, fontStyle: 'italic' }}>
                      The {preview.destination.levelLabel || preview.destination.level} Finance Secretary of {preview.destination.name} acknowledges this transfer.
                    </Text>
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
                  value={form.amount}
                  onChangeText={(val) => setForm({ ...form, amount: val })}
                />
              </View>

              {/* Mode */}
              <View style={styles.field}>
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

              {/* Reference */}
              <View style={styles.field}>
                <Text style={styles.fieldLabel}>Reference / Cheque No.</Text>
                <TextInput 
                  style={styles.fieldInput} 
                  placeholder="Optional reference number"
                  value={form.reference}
                  onChangeText={(val) => setForm({ ...form, reference: val })}
                />
              </View>

              {/* Notes */}
              <View style={styles.field}>
                <Text style={styles.fieldLabel}>Notes</Text>
                <TextInput 
                  style={[styles.fieldInput, { height: 60 }]} 
                  placeholder="Optional transfer note"
                  multiline
                  value={form.note}
                  onChangeText={(val) => setForm({ ...form, note: val })}
                />
              </View>

              {/* Receipt upload */}
              <View style={styles.field}>
                <Text style={styles.fieldLabel}>Receipt / Proof of Payment <Text style={{ color: Colors.error }}>*</Text></Text>
                <TouchableOpacity style={styles.uploadBtn} onPress={pickImage}>
                  <Ionicons name="cloud-upload-outline" size={20} color={Colors.primary} style={{ marginRight: 8 }} />
                  <Text style={styles.uploadBtnText}>{receipt ? 'Change Receipt Image' : 'Select Receipt Image (PNG / JPG)'}</Text>
                </TouchableOpacity>
                {receipt && (
                  <View style={styles.receiptPreview}>
                    <Image source={{ uri: receipt.uri }} style={styles.receiptThumb} />
                    <Text style={styles.receiptName} numberOfLines={1}>{receipt.name || 'receipt.jpg'}</Text>
                  </View>
                )}
                <Text style={{ fontSize: FontSize.xs, color: Colors.textMuted, marginTop: 4 }}>
                  JPEG / PNG / WebP. The receiving Finance Secretary will verify this image before acknowledging.
                </Text>
              </View>

              {/* Submit / Proceed */}
              <View style={{ marginTop: 24, marginBottom: 40, flexDirection: 'row', gap: 12 }}>
                <TouchableOpacity 
                  style={[styles.btnSecondary, { flex: 1, paddingVertical: 14, alignItems: 'center' }]} 
                  onPress={() => setTransferModalOpen(false)}
                >
                  <Text style={styles.btnSecondaryText}>Cancel</Text>
                </TouchableOpacity>
                
                <TouchableOpacity 
                  style={[styles.btnPrimary, { flex: 1, paddingVertical: 14, alignItems: 'center' }]} 
                  onPress={handleProceedToConfirm}
                >
                  <Text style={styles.btnPrimaryText}>Transfer</Text>
                </TouchableOpacity>
              </View>

            </ScrollView>
          </KeyboardAvoidingView>
        </SafeAreaView>
      </Modal>

      {/* Confirmation Modal */}
      {confirmOpen && preview && (
        <Modal visible={confirmOpen} transparent animationType="fade" onRequestClose={() => setConfirmOpen(false)}>
          <View style={styles.modalBackdrop}>
            <View style={styles.confirmModal}>
              <Text style={styles.confirmTitle}>Transfer Summary</Text>
              <Text style={styles.confirmSubtitle}>You are about to transfer funds.</Text>

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
                  <Text style={[styles.summaryVal, { fontWeight: '700', color: Colors.primary }]}>
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
                  <Text style={styles.btnSecondaryText}>Cancel</Text>
                </TouchableOpacity>
                <TouchableOpacity 
                  style={[styles.btnPrimary, { paddingHorizontal: 18, paddingVertical: 10, flexDirection: 'row', alignItems: 'center', gap: 6 }]} 
                  disabled={submitting} 
                  onPress={initiate}
                >
                  {submitting && <ActivityIndicator size="small" color="#fff" />}
                  <Text style={styles.btnPrimaryText}>{submitting ? 'Transferring…' : 'Confirm Transfer'}</Text>
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
            <View style={[styles.confirmModal, { maxWidth: 500 }]}>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
                <Text style={styles.confirmTitle}>Receipt / Proof of Payment</Text>
                <TouchableOpacity onPress={() => setPreviewUrl(null)}>
                  <Ionicons name="close" size={24} color={Colors.text} />
                </TouchableOpacity>
              </View>
              <Image source={{ uri: previewUrl }} style={{ width: '100%', height: 350, borderRadius: 8 }} resizeMode="contain" />
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
  header: { paddingHorizontal: Spacing.lg, paddingTop: Spacing.md, paddingBottom: Spacing.sm },
  pageTitle: { fontSize: FontSize.xl, fontWeight: '700', color: Colors.text, marginBottom: 8 },
  actionsRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 4 },
  btnPrimary: { backgroundColor: Colors.primary, paddingHorizontal: 14, paddingVertical: 8, borderRadius: Radius.sm },
  btnPrimaryText: { color: '#fff', fontWeight: '600', fontSize: FontSize.sm },
  btnSecondary: { backgroundColor: Colors.surface, borderWidth: 1, borderColor: Colors.border, paddingHorizontal: 12, paddingVertical: 8, borderRadius: Radius.sm },
  btnSecondaryText: { color: Colors.text, fontSize: FontSize.sm, fontWeight: '500' },
  btnSmall: { paddingHorizontal: 8, paddingVertical: 4, borderRadius: 4 },
  
  banner: { marginHorizontal: Spacing.lg, marginVertical: 8, padding: 12, backgroundColor: '#f8fafc', borderRadius: Radius.md, borderWidth: 1, borderColor: Colors.border },
  bannerText: { fontSize: FontSize.xs, color: Colors.textMuted, lineHeight: 18 },

  tabRow: { flexDirection: 'row', paddingHorizontal: Spacing.lg, borderBottomWidth: 1, borderBottomColor: Colors.border, backgroundColor: Colors.surface, marginTop: 4 },
  tab: { paddingVertical: 12, paddingHorizontal: 16, borderBottomWidth: 2, borderBottomColor: 'transparent' },
  tabActive: { borderBottomColor: Colors.primary },
  tabText: { fontSize: FontSize.sm, fontWeight: '500', color: Colors.textMuted },
  tabTextActive: { color: Colors.primary, fontWeight: '700' },

  tableScroll: { flex: 1, backgroundColor: Colors.surface },
  thRow: { flexDirection: 'row', backgroundColor: '#f8fafc', borderBottomWidth: 1, borderBottomColor: Colors.border, paddingVertical: 10, paddingHorizontal: Spacing.md },
  th: { fontSize: FontSize.xs, fontWeight: '700', color: Colors.textMuted, textTransform: 'uppercase' },
  tr: { flexDirection: 'row', borderBottomWidth: 1, borderBottomColor: Colors.border, paddingVertical: 10, paddingHorizontal: Spacing.md, alignItems: 'center' },
  td: { fontSize: FontSize.sm, color: Colors.text },
  emptyText: { textAlign: 'center', padding: Spacing.xl, color: Colors.textMuted, fontStyle: 'italic' },

  modalHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: Spacing.lg, borderBottomWidth: 1, borderBottomColor: Colors.border, backgroundColor: Colors.surface },
  modalTitle: { fontSize: FontSize.lg, fontWeight: '700', color: Colors.text },
  formContent: { padding: Spacing.lg },
  field: { marginBottom: 16 },
  fieldLabel: { fontSize: FontSize.sm, fontWeight: '600', color: Colors.text, marginBottom: 6 },
  fieldInput: { borderWidth: 1, borderColor: Colors.border, borderRadius: Radius.sm, paddingHorizontal: 12, paddingVertical: 8, fontSize: FontSize.base, backgroundColor: Colors.surface, color: Colors.text },
  pickerWrapper: { borderWidth: 1, borderColor: Colors.border, borderRadius: Radius.sm, backgroundColor: Colors.surface, overflow: 'hidden' },

  endpointCard: { padding: 12, borderRadius: Radius.sm, borderWidth: 1, borderColor: Colors.border, backgroundColor: Colors.surface },
  endpointLevel: { fontSize: FontSize.xs, fontWeight: '700', color: Colors.textMuted, textTransform: 'uppercase' },
  endpointName: { fontSize: FontSize.base, fontWeight: '600', color: Colors.text, marginTop: 2 },

  uploadBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: Colors.primary, borderStyle: 'dashed', borderRadius: Radius.sm, padding: 12, backgroundColor: '#f0f9ff' },
  uploadBtnText: { color: Colors.primary, fontWeight: '600', fontSize: FontSize.sm },
  receiptPreview: { flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 8, padding: 8, backgroundColor: Colors.surface, borderWidth: 1, borderColor: Colors.border, borderRadius: Radius.sm },
  receiptThumb: { width: 44, height: 44, borderRadius: 4 },
  receiptName: { fontSize: FontSize.xs, color: Colors.text, flex: 1 },

  modalBackdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'center', alignItems: 'center', padding: 20 },
  confirmModal: { width: '100%', maxWidth: 520, backgroundColor: Colors.surface, borderRadius: Radius.lg, padding: 20, shadowColor: '#000', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.2, shadowRadius: 8, elevation: 5 },
  confirmTitle: { fontSize: FontSize.lg, fontWeight: '700', color: Colors.text },
  confirmSubtitle: { fontSize: FontSize.xs, color: Colors.textMuted, marginTop: 2, marginBottom: 16 },
  alertError: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#fef2f2', borderWidth: 1, borderColor: '#fecaca', borderRadius: Radius.sm, padding: 12, marginBottom: 16 },
  alertErrorText: { color: Colors.error, fontSize: FontSize.sm, fontWeight: '600', flex: 1 },
  summaryTable: { backgroundColor: '#f8fafc', borderRadius: Radius.md, borderWidth: 1, borderColor: Colors.border, padding: 12 },
  summaryRow: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 6, borderBottomWidth: 1, borderBottomColor: '#f1f5f9' },
  summaryKey: { fontSize: FontSize.xs, fontWeight: '600', color: Colors.textMuted, width: 120 },
  summaryVal: { fontSize: FontSize.xs, color: Colors.text, flex: 1, textAlign: 'right' },
});
