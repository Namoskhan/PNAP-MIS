import React, { useEffect, useMemo, useRef, useState } from 'react';
import { View, Text, ScrollView, TouchableOpacity, StyleSheet, ActivityIndicator, Alert, Modal, TextInput } from 'react-native';
import { Picker } from '@react-native-picker/picker';
import { Ionicons } from '@expo/vector-icons';
import { useUnit } from '../../../src/context/UnitContext';
import { api, errorMessage } from '../../../src/api/client';
import { useToast } from '../../../src/components/Toast';
import Card from '../../../src/components/Card';
import Badge from '../../../src/components/Badge';
import Avatar from '../../../src/components/Avatar';
import EmptyState from '../../../src/components/EmptyState';
import { Colors, FontSize, Radius, Spacing } from '../../../src/constants/colors';

const ROLE_OPTIONS = [
  { value: 'ALL', label: 'All Roles' },
  { value: 'GENERAL_SECRETARY', label: 'General Secretary' },
  { value: 'PRESIDENT', label: 'President' },
  { value: 'SECRETARY', label: 'Secretary' },
  { value: 'SENIOR_MAWIN', label: 'Senior Mawin Secretary' },
  { value: 'FINANCE_SECRETARY', label: 'Finance Secretary' },
  { value: 'SR_VICE_PRESIDENT', label: 'Sr. Vice President' },
  { value: 'VICE_PRESIDENT', label: 'Vice President' },
  { value: 'CHAIRMAN', label: 'Chairman' },
  { value: 'CO_CHAIRMAN', label: 'Co-Chairman' },
  { value: 'FIRST_SECRETARY', label: 'First Secretary' },
  { value: 'OTHER', label: 'Other' },
  { value: 'NO_ROLE', label: 'No Role' },
];

export default function CongressScreen() {
  const { ctx } = useUnit();
  const toast = useToast();

  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState('');

  // Roster filters
  const [rosterSearch, setRosterSearch] = useState('');
  const [rosterRoleFilter, setRosterRoleFilter] = useState('ALL');
  const [rosterProvFilter, setRosterProvFilter] = useState('ALL');

  // Assign modal
  const [assignOpen, setAssignOpen] = useState(false);
  const [candidates, setCandidates] = useState([]);
  const [candidatesLoading, setCandidatesLoading] = useState(false);
  const [candidateSearch, setCandidateSearch] = useState('');
  const [selectedMember, setSelectedMember] = useState(null);
  const [assigning, setAssigning] = useState(false);

  const fetchIdRef = useRef(0);

  async function getResolvedUnitId() {
    if (ctx?.unitLevel === 'CENTRAL' && ctx?.unitId === 'CENTRAL') {
      const res = await api.get('/org/central');
      return res.data?.data?._id;
    }
    return ctx?.unitId;
  }

  async function reload() {
    const myId = ++fetchIdRef.current;
    setLoading(true);
    setErr('');
    try {
      const resolvedUnitId = await getResolvedUnitId();
      const res = await api.get('/congress/composition', {
        params: { unitLevel: 'CENTRAL', unitId: resolvedUnitId },
      });
      if (myId === fetchIdRef.current) {
        setData(res.data.data);
      }
    } catch (e) {
      if (myId === fetchIdRef.current) {
        setErr(errorMessage(e));
      }
    } finally {
      if (myId === fetchIdRef.current) {
        setLoading(false);
      }
    }
  }

  useEffect(() => {
    reload();
  }, [ctx?.unitLevel, ctx?.unitId]);

  useEffect(() => {
    if (!assignOpen) return;
    let active = true;
    setCandidatesLoading(true);
    
    getResolvedUnitId().then((resolvedUnitId) => {
      if (!active) return;
      const params = {
        unitLevel: 'CENTRAL',
        unitId: resolvedUnitId,
        search: candidateSearch.trim() || undefined,
        limit: 50,
      };
      return api.get('/congress/eligible-members', { params });
    })
    .then((res) => {
      if (active) setCandidates(res?.data?.data?.candidates || []);
    })
    .catch((e) => {
      if (active) toast.error(errorMessage(e));
    })
    .finally(() => {
      if (active) setCandidatesLoading(false);
    });

    return () => { active = false; };
  }, [assignOpen, candidateSearch, ctx?.unitLevel, ctx?.unitId]);

  const [nominationNote, setNominationNote] = useState('');

  async function handleAssign() {
    if (!selectedMember) {
      toast.error('Please select a member.');
      return;
    }
    setAssigning(true);
    try {
      const resolvedUnitId = await getResolvedUnitId();
      await api.post('/congress/members', {
        unitLevel: 'CENTRAL',
        unitId: data?.unit?.unitId || resolvedUnitId,
        memberId: selectedMember._id,
        nominationNote: nominationNote.trim() || undefined,
      });
      toast.success(`${selectedMember.fullName} assigned to Congress.`);
      setSelectedMember(null);
      setNominationNote('');
      setAssignOpen(false);
      reload();
    } catch (e) {
      toast.error(errorMessage(e));
    } finally {
      setAssigning(false);
    }
  }

  function handleRemove(recordId, memberName) {
    Alert.alert(
      'Remove Member',
      `Are you sure you want to remove ${memberName || 'this member'} from Congress?`,
      [
        { text: 'Cancel', style: 'cancel' },
        { 
          text: 'Remove', 
          style: 'destructive', 
          onPress: async () => {
            try {
              await api.post(`/congress/members/${recordId}/remove`);
              toast.success('Member removed from Congress.');
              reload();
            } catch (e) {
              toast.error(errorMessage(e));
            }
          }
        },
      ]
    );
  }

  const filteredRoster = useMemo(() => {
    if (!data?.members) return [];
    return data.members.filter((m) => {
      if (rosterSearch.trim()) {
        const q = rosterSearch.trim().toLowerCase();
        const matchName = m.fullName?.toLowerCase().includes(q);
        const matchCnic = m.cnic?.toLowerCase().includes(q);
        const matchPhone = m.phone?.toLowerCase().includes(q);
        const matchId = m.memberId?.toLowerCase().includes(q);
        if (!matchName && !matchCnic && !matchPhone && !matchId) return false;
      }
      if (rosterRoleFilter !== 'ALL') {
        if (rosterRoleFilter === 'NO_ROLE') {
          if (m.activeRoles && m.activeRoles.length > 0) return false;
        } else {
          const hasRole = m.activeRoles?.some((r) => r.roleCode === rosterRoleFilter);
          if (!hasRole) return false;
        }
      }
      if (rosterProvFilter !== 'ALL') {
        if (m.homeUnit?.provinceName !== rosterProvFilter) return false;
      }
      return true;
    });
  }, [data?.members, rosterSearch, rosterRoleFilter, rosterProvFilter]);

  const stats = useMemo(() => {
    if (!data?.members) return { total: 0, officeHolders: 0, workers: 0, provinces: 0 };
    const total = data.members.length;
    let officeHolders = 0;
    let workers = 0;
    const provSet = new Set();
    data.members.forEach((m) => {
      if (m.activeRoles && m.activeRoles.length > 0) officeHolders++;
      else workers++;
      if (m.homeUnit?.provinceName) provSet.add(m.homeUnit.provinceName);
    });
    return { total, officeHolders, workers, provinces: provSet.size };
  }, [data?.members]);

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.headerTitle}>National Congress · قومي کانګرس</Text>
        <Text style={styles.headerSub}>Central Supreme Consultative & Representative Assembly</Text>
      </View>

      <ScrollView contentContainerStyle={styles.content}>
        {err ? <Text style={styles.errorText}>{err}</Text> : null}

        <View style={styles.kpiGrid}>
          <Card style={styles.kpiCard}>
            <Text style={styles.kpiLabel}>Total Members</Text>
            <Text style={styles.kpiValue}>{loading ? '…' : stats.total}</Text>
          </Card>
          <Card style={styles.kpiCard}>
            <Text style={styles.kpiLabel}>Office Holders</Text>
            <Text style={styles.kpiValue}>{loading ? '…' : stats.officeHolders}</Text>
          </Card>
          <Card style={styles.kpiCard}>
            <Text style={styles.kpiLabel}>General Workers</Text>
            <Text style={styles.kpiValue}>{loading ? '…' : stats.workers}</Text>
          </Card>
          <Card style={styles.kpiCard}>
            <Text style={styles.kpiLabel}>Provinces Represented</Text>
            <Text style={styles.kpiValue}>{loading ? '…' : stats.provinces}</Text>
          </Card>
        </View>

        {loading ? (
          <ActivityIndicator style={{ marginTop: Spacing.lg }} color={Colors.primary} />
        ) : (
          <>
            <View style={styles.toolbarRow}>
              <TextInput
                style={styles.searchInput}
                placeholder="Search member, CNIC, phone..."
                value={rosterSearch}
                onChangeText={setRosterSearch}
                clearButtonMode="while-editing"
              />
              <TouchableOpacity style={styles.addBtn} onPress={() => { setCandidateSearch(''); setSelectedMember(null); setAssignOpen(true); }}>
                <Ionicons name="add" size={20} color="#fff" />
              </TouchableOpacity>
            </View>

            <View style={styles.pickerRow}>
              <View style={styles.pickerContainer}>
                <Picker
                  selectedValue={rosterProvFilter}
                  onValueChange={(v) => setRosterProvFilter(v)}
                  style={styles.picker}
                >
                  <Picker.Item label="All Provinces" value="ALL" />
                  {Array.from(new Set((data?.members || []).map(m => m.homeUnit?.provinceName).filter(Boolean))).map((prov) => (
                    <Picker.Item key={prov} label={prov} value={prov} />
                  ))}
                </Picker>
              </View>

              <View style={styles.pickerContainer}>
                <Picker
                  selectedValue={rosterRoleFilter}
                  onValueChange={(v) => setRosterRoleFilter(v)}
                  style={styles.picker}
                >
                  {ROLE_OPTIONS.map((opt) => (
                    <Picker.Item key={opt.value} label={opt.label} value={opt.value} />
                  ))}
                </Picker>
              </View>
            </View>

            <View style={styles.rosterList}>
              {filteredRoster.length === 0 ? (
                <EmptyState icon="👥" title="No members found" subtitle="No Congress members match your search or filters." />
              ) : (
                filteredRoster.map((m) => {
                  const roles = m.activeRoles || [];
                  const recordId = m.congressRecordId;
                  return (
                    <Card key={m._id} style={styles.memberCard}>
                      <View style={styles.memberHeaderRow}>
                        <Avatar name={m.fullName} size={42} color={Colors.primary} />
                        <View style={styles.memberMeta}>
                          <Text style={styles.memberName}>{m.fullName}</Text>
                          <Text style={styles.memberSub}>
                            {m.memberId || 'ID —'} · {m.cnic} · {m.phone || 'No phone'}
                          </Text>
                        </View>
                        <TouchableOpacity style={styles.removeBtn} onPress={() => handleRemove(recordId, m.fullName)}>
                          <Ionicons name="trash-outline" size={18} color={Colors.error} />
                        </TouchableOpacity>
                      </View>

                      <View style={styles.detailsBlock}>
                        {/* Active Roles */}
                        <View style={styles.detailRow}>
                          <Text style={styles.detailLabel}>Role:</Text>
                          <View style={styles.detailValue}>
                            {roles.length > 0 ? (
                              roles.map((r, idx) => (
                                <View key={r._id} style={{ flexDirection: 'row', alignItems: 'center', marginBottom: idx !== roles.length - 1 ? 4 : 0 }}>
                                  <Badge label={r.customRoleName || r.roleCode.replace(/_/g, ' ')} color="#166534" bg="#dcfce7" />
                                  <Text style={styles.unitText}>· {r.unitName}</Text>
                                </View>
                              ))
                            ) : m.assignedRoleSnapshot?.roleCode ? (
                              <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                                <Badge label={m.assignedRoleSnapshot.customRoleName || m.assignedRoleSnapshot.roleCode.replace(/_/g, ' ')} color="#166534" bg="#dcfce7" />
                                <Text style={styles.unitText}>· {m.assignedRoleSnapshot.unitName}</Text>
                              </View>
                            ) : (
                              <Text style={styles.noRoleText}>General Party Worker</Text>
                            )}
                          </View>
                        </View>

                        {/* Hierarchy */}
                        <View style={styles.detailRow}>
                          <Text style={styles.detailLabel}>Home:</Text>
                          <View style={styles.detailValue}>
                            <Text style={styles.hierarchyText}>
                              {[
                                m.homeUnit?.provinceName && `Prov: ${m.homeUnit.provinceName}`,
                                m.homeUnit?.districtName && `Dist: ${m.homeUnit.districtName}`,
                                m.homeUnit?.areaName && `Area: ${m.homeUnit.areaName}`,
                                m.homeUnit?.basicUnitName && `BU: ${m.homeUnit.basicUnitName}`
                              ].filter(Boolean).join(', ') || '—'}
                            </Text>
                          </View>
                        </View>

                        {/* Appointed Date */}
                        <View style={styles.detailRow}>
                          <Text style={styles.detailLabel}>Appointed:</Text>
                          <View style={styles.detailValue}>
                            <Text style={styles.footerLabel}>
                              {m.assignedAt ? new Date(m.assignedAt).toLocaleDateString() : '—'}
                            </Text>
                          </View>
                        </View>
                      </View>
                    </Card>
                  );
                })
              )}
            </View>
          </>
        )}
      </ScrollView>

      {/* Assign Modal */}
      <Modal visible={assignOpen} animationType="slide" presentationStyle="pageSheet">
        <View style={styles.modal}>
          <View style={styles.modalHeader}>
            <Text style={styles.modalTitle}>Add to Congress</Text>
            <TouchableOpacity onPress={() => setAssignOpen(false)} style={styles.modalClose}>
              <Ionicons name="close" size={24} color={Colors.textMuted} />
            </TouchableOpacity>
          </View>
          
          <View style={styles.modalBody}>
            <TextInput
              style={styles.searchInput}
              placeholder="Search eligible members..."
              value={candidateSearch}
              onChangeText={setCandidateSearch}
              clearButtonMode="while-editing"
            />
            
            {candidatesLoading ? (
              <ActivityIndicator style={{ marginTop: 20 }} color={Colors.primary} />
            ) : (
              <ScrollView style={styles.candidatesList}>
                {candidates.length === 0 ? (
                  <Text style={styles.noCandidatesText}>No eligible members found. Search by name, phone, or CNIC.</Text>
                ) : (
                  candidates.map((m) => (
                    <TouchableOpacity 
                      key={m._id} 
                      style={[styles.candidateRow, selectedMember?._id === m._id && styles.candidateRowActive]}
                      onPress={() => setSelectedMember(m)}
                    >
                      <Avatar name={m.fullName} size={36} color={selectedMember?._id === m._id ? Colors.primary : Colors.textMuted} />
                      <View style={styles.candidateMeta}>
                        <Text style={styles.candidateName}>{m.fullName}</Text>
                        <Text style={styles.candidateSub}>{m.memberId || m.cnic}</Text>
                      </View>
                      {selectedMember?._id === m._id && <Ionicons name="checkmark-circle" size={24} color={Colors.primary} />}
                    </TouchableOpacity>
                  ))
                )}
              </ScrollView>
            )}

            {selectedMember && (
              <View style={{ marginTop: Spacing.md }}>
                <Text style={{ fontSize: FontSize.xs, fontWeight: '700', color: Colors.text, marginBottom: 4 }}>
                  Nomination Remarks / Notes:
                </Text>
                <TextInput
                  style={[styles.searchInput, { height: 44 }]}
                  placeholder="Optional nomination remarks or notes..."
                  value={nominationNote}
                  onChangeText={setNominationNote}
                />
              </View>
            )}
          </View>
          
          <View style={styles.modalFooter}>
            <TouchableOpacity style={styles.cancelBtn} onPress={() => setAssignOpen(false)}>
              <Text style={styles.cancelText}>Cancel</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.saveBtn} onPress={handleAssign} disabled={assigning || !selectedMember}>
              {assigning ? <ActivityIndicator color="#fff" /> : <Text style={styles.saveText}>Add Member</Text>}
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },
  header: { padding: Spacing.lg, backgroundColor: Colors.surface, borderBottomWidth: 1, borderBottomColor: Colors.border },
  headerTitle: { fontSize: FontSize.lg, fontWeight: '800', color: Colors.text },
  headerSub: { fontSize: FontSize.sm, color: Colors.textMuted, marginTop: 2 },
  content: { padding: Spacing.md, paddingBottom: 60 },
  errorText: { color: Colors.error, marginBottom: Spacing.md },
  
  kpiGrid: { flexDirection: 'row', gap: Spacing.sm, marginBottom: Spacing.md, flexWrap: 'wrap' },
  kpiCard: { flex: 1, minWidth: '45%', padding: Spacing.md, backgroundColor: '#fff', alignItems: 'center' },
  kpiLabel: { fontSize: FontSize.xs, color: Colors.textMuted, textAlign: 'center', marginBottom: 4 },
  kpiValue: { fontSize: FontSize.xl, fontWeight: '700', color: Colors.primary },

  toolbarRow: { flexDirection: 'row', gap: Spacing.sm, marginBottom: Spacing.md },
  searchInput: { flex: 1, backgroundColor: Colors.surface, borderWidth: 1, borderColor: Colors.border, borderRadius: 10, paddingHorizontal: Spacing.md, paddingVertical: 10, fontSize: FontSize.sm },
  addBtn: { width: 44, height: 44, alignItems: 'center', backgroundColor: Colors.primary, borderRadius: 10, justifyContent: 'center' },
  
  pickerRow: { flexDirection: 'row', gap: Spacing.sm, marginBottom: Spacing.md },
  pickerContainer: { flex: 1, backgroundColor: Colors.surface, borderWidth: 1, borderColor: Colors.border, borderRadius: 10, overflow: 'hidden' },
  picker: { height: 44 },
  
  rosterList: { gap: Spacing.sm },
  memberCard: { padding: Spacing.md },
  memberHeaderRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.md, marginBottom: Spacing.sm },
  memberMeta: { flex: 1, gap: 2 },
  memberName: { fontSize: FontSize.base, fontWeight: '700', color: Colors.text },
  memberSub: { fontSize: FontSize.xs, color: Colors.textMuted },
  removeBtn: { padding: 8 },

  detailsBlock: { marginTop: Spacing.sm, paddingTop: Spacing.sm, borderTopWidth: 1, borderTopColor: Colors.border, gap: 6 },
  detailRow: { flexDirection: 'row', alignItems: 'flex-start' },
  detailLabel: { width: 75, fontSize: FontSize.xs, fontWeight: '600', color: Colors.textMuted, marginTop: 2 },
  detailValue: { flex: 1, justifyContent: 'center' },
  rolesRow: { gap: 4 },
  unitText: { fontSize: FontSize.xs, color: Colors.text, marginLeft: 4 },
  noRoleText: { fontSize: FontSize.xs, color: Colors.textLight, fontStyle: 'italic', marginTop: 2 },
  hierarchyText: { fontSize: FontSize.xs, color: Colors.text, lineHeight: 18, marginTop: 2 },
  footerLabel: { fontSize: FontSize.xs, color: Colors.text, marginTop: 2 },

  modal: { flex: 1, backgroundColor: Colors.background },
  modalHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: Spacing.lg, backgroundColor: Colors.surface, borderBottomWidth: 1, borderBottomColor: Colors.border },
  modalTitle: { fontSize: FontSize.lg, fontWeight: '700', color: Colors.text },
  modalClose: { padding: 4 },
  modalBody: { flex: 1, padding: Spacing.lg },
  candidatesList: { marginTop: Spacing.md },
  noCandidatesText: { color: Colors.textMuted, textAlign: 'center', marginTop: Spacing.xl },
  candidateRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.md, padding: Spacing.md, backgroundColor: Colors.surface, borderRadius: Radius.md, borderWidth: 1, borderColor: Colors.border, marginBottom: Spacing.sm },
  candidateRowActive: { borderColor: Colors.primary, backgroundColor: '#eff6ff' },
  candidateMeta: { flex: 1 },
  candidateName: { fontSize: FontSize.sm, fontWeight: '700', color: Colors.text },
  candidateSub: { fontSize: FontSize.xs, color: Colors.textMuted },
  
  modalFooter: { flexDirection: 'row', gap: Spacing.md, padding: Spacing.lg, backgroundColor: Colors.surface, borderTopWidth: 1, borderTopColor: Colors.border },
  cancelBtn: { flex: 1, paddingVertical: 12, alignItems: 'center', backgroundColor: Colors.surfaceAlt, borderRadius: 10, borderWidth: 1, borderColor: Colors.border },
  cancelText: { color: Colors.text, fontWeight: '600' },
  saveBtn: { flex: 2, paddingVertical: 12, alignItems: 'center', backgroundColor: Colors.primary, borderRadius: 10 },
  saveText: { color: '#fff', fontWeight: '700', fontSize: FontSize.base },
});
