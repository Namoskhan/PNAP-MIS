import React, { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Image,
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
import { useLocalSearchParams, router } from 'expo-router';
import * as ImagePicker from 'expo-image-picker';
import { api, errorMessage } from '../../../src/api/client';
import Card from '../../../src/components/Card';
import Badge from '../../../src/components/Badge';
import Avatar from '../../../src/components/Avatar';
import EmptyState from '../../../src/components/EmptyState';
import DatePicker from '../../../src/components/DatePicker';
import { Colors, FontSize, Radius, Spacing } from '../../../src/constants/colors';
import { shortDate, formatCnic } from '../../../src/utils/formatters';
import { useAuth } from '../../../src/context/AuthContext';
import { useToast } from '../../../src/components/Toast';
import { isSuperAdmin, isHigherAdmin, isAreaAdmin } from '../../../src/utils/permissions';
import { Ionicons } from '@expo/vector-icons';

const GENDERS = [
  { label: 'Male', value: 'MALE' },
  { label: 'Female', value: 'FEMALE' },
  { label: 'Prefer not to say', value: 'PREFER_NOT_TO_SAY' },
];

const BLOOD_GROUPS = ['A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-'];

function Row({ label, value }) {
  if (!value) return null;
  return (
    <View style={styles.infoRow}>
      <Text style={styles.infoLabel}>{label}</Text>
      <Text style={styles.infoValue}>{value}</Text>
    </View>
  );
}

export default function MemberDetailScreen() {
  const { id } = useLocalSearchParams();
  const { user } = useAuth();
  const toast = useToast();

  const [member, setMember] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  // Edit Modal State
  const [showEdit, setShowEdit] = useState(false);
  const [editForm, setEditForm] = useState({
    phone: '',
    email: '',
    address: '',
    dateOfBirth: '',
    gender: 'MALE',
    bloodGroup: '',
    education: '',
    occupation: '',
  });
  const [editPhoto, setEditPhoto] = useState(null);
  const [editErr, setEditErr] = useState('');

  // Reject Modal State
  const [showReject, setShowReject] = useState(false);
  const [rejectReason, setRejectReason] = useState('');
  const [rejectErr, setRejectErr] = useState('');

  // Super Admin Action Modals State
  const [showResetPw, setShowResetPw] = useState(false);
  const [newPassword, setNewPassword] = useState('');
  const [resetPwErr, setResetPwErr] = useState('');

  const [showRemove, setShowRemove] = useState(false);
  const [removeReason, setRemoveReason] = useState('');
  const [removeErr, setRemoveErr] = useState('');

  const isOwner = user?.memberId && String(user.memberId) === String(id);
  const isSuper = isSuperAdmin(user);
  const isAdmin = (user?.roles || []).some((r) =>
    ['SUPER_ADMIN', 'CENTRAL_ADMIN', 'PROVINCE_ADMIN', 'DISTRICT_ADMIN', 'AREA_ADMIN'].includes(r)
  );
  const canEdit = isOwner || isAdmin;
  const canDecide = isHigherAdmin(user) || isAreaAdmin(user);

  function load() {
    setError('');
    api.get(`/members/${id}`)
      .then((r) => setMember(r.data.data))
      .catch((e) => setError(errorMessage(e) || 'Could not load member.'))
      .finally(() => setLoading(false));
  }

  useEffect(() => {
    load();
  }, [id]);

  // Photo picker for edit
  async function pickEditPhoto() {
    try {
      const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!perm.granted) {
        toast.error('Permission is required to access your photo gallery.');
        return;
      }
      const res = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ['images'],
        allowsEditing: true,
        aspect: [1, 1],
        quality: 0.85,
      });
      if (!res.canceled && res.assets?.[0]) {
        setEditPhoto(res.assets[0]);
      }
    } catch (e) {
      toast.error('Could not pick photo: ' + errorMessage(e));
    }
  }

  // Handle Approve
  async function handleApprove() {
    setBusy(true);
    try {
      await api.post(`/members/${id}/approve`);
      toast.success(`${member?.fullName || 'Member'} approved successfully.`);
      load();
    } catch (e) {
      toast.error('Could not approve member: ' + errorMessage(e));
    } finally {
      setBusy(false);
    }
  }

  // Handle Reject
  async function handleRejectSubmit() {
    if (!rejectReason.trim()) {
      setRejectErr('Reason for rejection is required.');
      return;
    }
    setRejectErr('');
    setBusy(true);
    try {
      await api.post(`/members/${id}/reject`, { reason: rejectReason.trim() });
      toast.success(`${member?.fullName || 'Member'}'s application was rejected.`);
      setShowReject(false);
      setRejectReason('');
      load();
    } catch (e) {
      setRejectErr(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }

  // Open Edit Modal
  function openEditModal() {
    setEditForm({
      phone: member.phone || '',
      email: member.email || '',
      address: member.address || '',
      dateOfBirth: member.dateOfBirth
        ? new Date(member.dateOfBirth).toISOString().split('T')[0]
        : (member.dob ? new Date(member.dob).toISOString().split('T')[0] : ''),
      gender: member.gender || 'MALE',
      bloodGroup: member.bloodGroup || '',
      education: member.education || '',
      occupation: member.occupation || '',
    });
    setEditPhoto(null);
    setEditErr('');
    setShowEdit(true);
  }

  // Save Edit Profile
  async function handleSaveEdit() {
    setEditErr('');
    if (!editForm.phone.trim()) {
      setEditErr('Phone number is required.');
      return;
    }
    if (!editForm.email.trim()) {
      setEditErr('Email address is required.');
      return;
    }
    if (!editForm.address.trim() || editForm.address.trim().length < 5) {
      setEditErr('Residential address must be at least 5 characters.');
      return;
    }

    setBusy(true);
    try {
      const fd = new FormData();
      fd.append('phone', editForm.phone.trim());
      fd.append('email', editForm.email.trim());
      fd.append('address', editForm.address.trim());
      fd.append('gender', editForm.gender);
      if (editForm.dateOfBirth) fd.append('dateOfBirth', editForm.dateOfBirth);
      if (editForm.bloodGroup) fd.append('bloodGroup', editForm.bloodGroup);
      if (editForm.education) fd.append('education', editForm.education.trim());
      if (editForm.occupation) fd.append('occupation', editForm.occupation.trim());

      if (editPhoto) {
        if (Platform.OS === 'web' && editPhoto.file) {
          fd.append('photo', editPhoto.file);
        } else {
          const uri = editPhoto.uri;
          const name = editPhoto.fileName || uri.split('/').pop() || 'photo.jpg';
          const match = /\.(\w+)$/.exec(name);
          const type = editPhoto.mimeType || (match ? `image/${match[1]}` : 'image/jpeg');
          fd.append('photo', { uri, name, type });
        }
      }

      await api.patch(`/members/${id}`, fd, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });
      toast.success('Member profile updated successfully.');
      setShowEdit(false);
      load();
    } catch (e) {
      setEditErr(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }

  // Reset Password (Super Admin)
  async function handleResetPassword() {
    if (!newPassword || newPassword.length < 6) {
      setResetPwErr('Password must be at least 6 characters.');
      return;
    }
    setResetPwErr('');
    setBusy(true);
    try {
      await api.post(`/admin/members/${id}/reset-password`, { newPassword });
      toast.success(`Password reset for ${member.fullName}.`);
      setShowResetPw(false);
      setNewPassword('');
    } catch (e) {
      setResetPwErr(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }

  // Remove Member (Super Admin)
  async function handleRemoveMember() {
    if (!removeReason.trim()) {
      setRemoveErr('Reason for removal is required.');
      return;
    }
    setRemoveErr('');
    setBusy(true);
    try {
      const res = await api.post(`/admin/members/${id}/remove`, { reason: removeReason.trim() });
      const ended = res.data?.data?.cascadedRoles || 0;
      toast.success(`${member.fullName} removed — ${ended} role(s) ended and login deactivated.`);
      setShowRemove(false);
      setRemoveReason('');
      load();
    } catch (e) {
      setRemoveErr(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color={Colors.primary} />
      </View>
    );
  }

  if (error || !member) {
    return <EmptyState icon="❌" title="Member not found" subtitle={error} />;
  }

  const m = member;
  const isPending = m.status === 'PENDING_APPROVAL';
  const isExpelled = m.status === 'EXPELLED';

  return (
    <SafeAreaView style={styles.safe}>
      <ScrollView contentContainerStyle={styles.content}>
        {/* Profile Header */}
        <Card style={styles.profileCard}>
          <View style={styles.profileHeader}>
            <Avatar name={m.fullName} photoUrl={m.photoUrl} size={72} />
            <View style={styles.profileInfo}>
              <Text style={styles.profileName}>{m.fullName}</Text>
              {m.memberId ? (
                <Text style={styles.profileId}>ID: {m.memberId}</Text>
              ) : (
                <Text style={styles.profileId}>ID: (Issued upon approval)</Text>
              )}
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 4 }}>
                <Badge label={m.status?.replace(/_/g, ' ') || '—'} status={m.status} />
                {m.bloodGroup && (
                  <Badge label={`Blood: ${m.bloodGroup}`} color="#b91c1c" bg="#fef2f2" />
                )}
              </View>
            </View>
          </View>

          {/* Action Row: Edit Profile */}
          <View style={styles.headerButtonsRow}>
            {canEdit && (
              <TouchableOpacity style={styles.editBtn} onPress={openEditModal}>
                <Ionicons name="create-outline" size={16} color={Colors.primary} />
                <Text style={styles.editBtnText}>Edit Profile</Text>
              </TouchableOpacity>
            )}
          </View>

          {/* Pending Approval Decisions */}
          {isPending && canDecide && (
            <View style={styles.approvalActions}>
              <TouchableOpacity
                style={[styles.actionBtn, styles.approveBtn]}
                onPress={handleApprove}
                disabled={busy}
              >
                {busy ? <ActivityIndicator color="#fff" size="small" /> : <Text style={styles.approveText}>Approve Member</Text>}
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.actionBtn, styles.rejectBtn]}
                onPress={() => {
                  setRejectReason('');
                  setRejectErr('');
                  setShowReject(true);
                }}
                disabled={busy}
              >
                <Text style={styles.rejectText}>Reject Application</Text>
              </TouchableOpacity>
            </View>
          )}

          {/* Status Reasons */}
          {m.statusReason && (
            <View style={[styles.reasonBox, m.status === 'REJECTED' ? styles.rejectReasonBox : styles.expelledReasonBox]}>
              <Text style={styles.reasonTitle}>
                {m.status === 'REJECTED' ? 'Rejection Reason:' : 'Status Note:'}
              </Text>
              <Text style={styles.reasonText}>{m.statusReason}</Text>
            </View>
          )}
        </Card>

        {/* Personal Info */}
        <Card style={styles.sectionCard}>
          <Text style={styles.sectionTitle}>Personal Information</Text>
          <Row label="Full Name" value={m.fullName} />
          <Row label="Father / Husband" value={m.fatherOrHusbandName || m.fatherName} />
          <Row label="CNIC" value={m.cnic ? formatCnic(m.cnic) : undefined} />
          <Row label="Phone" value={m.phone} />
          <Row label="Email" value={m.email} />
          <Row label="Date of Birth" value={m.dateOfBirth ? shortDate(m.dateOfBirth) : (m.dob ? shortDate(m.dob) : undefined)} />
          <Row label="Gender" value={m.gender} />
          <Row label="Blood Group" value={m.bloodGroup} />
          <Row label="Address" value={m.address} />
        </Card>

        {/* Unit Info */}
        <Card style={styles.sectionCard}>
          <Text style={styles.sectionTitle}>Unit Hierarchy</Text>
          <Row label="Basic Unit" value={m.basicUnitId?.name || (typeof m.basicUnitId === 'string' ? m.basicUnitId : undefined)} />
          <Row label="Area" value={m.areaId?.name || (typeof m.areaId === 'string' ? m.areaId : undefined)} />
          <Row label="District" value={m.districtId?.name || (typeof m.districtId === 'string' ? m.districtId : undefined)} />
          <Row label="Province" value={m.provinceId?.name || (typeof m.provinceId === 'string' ? m.provinceId : undefined)} />
          <Row label="Registered" value={m.createdAt ? shortDate(m.createdAt) : undefined} />
          <Row label="Joined Date" value={m.joinedAt || m.dateJoined ? shortDate(m.joinedAt || m.dateJoined) : undefined} />
        </Card>

        {/* Roles */}
        {m.roles?.length > 0 && (
          <Card style={styles.sectionCard}>
            <Text style={styles.sectionTitle}>Assigned Roles</Text>
            <View style={styles.rolePills}>
              {m.roles.map((r, i) => (
                <Badge key={i} label={r.replace(/_/g, ' ')} color={Colors.primary} bg="#eff6ff" />
              ))}
            </View>
          </Card>
        )}

        {/* Background / Education / Occupation */}
        {(m.education || m.occupation) && (
          <Card style={styles.sectionCard}>
            <Text style={styles.sectionTitle}>Background & Professional</Text>
            <Row label="Education" value={m.education} />
            <Row label="Occupation" value={m.occupation} />
          </Card>
        )}

        {/* Super Admin Privileged Tools */}
        {isSuper && (
          <Card style={[styles.sectionCard, styles.superCard]}>
            <View style={styles.superHeader}>
              <Ionicons name="shield-outline" size={20} color={Colors.error} />
              <Text style={styles.superTitle}>Super Admin Controls</Text>
            </View>
            <Text style={styles.superSub}>
              Privileged actions with audit logging.
            </Text>

            <View style={styles.superButtonsRow}>
              <TouchableOpacity
                style={styles.resetPwBtn}
                onPress={() => {
                  setNewPassword('');
                  setResetPwErr('');
                  setShowResetPw(true);
                }}
                disabled={busy}
              >
                <Ionicons name="key-outline" size={16} color={Colors.text} />
                <Text style={styles.resetPwBtnText}>Reset Password</Text>
              </TouchableOpacity>

              {!isExpelled && (
                <TouchableOpacity
                  style={styles.removeMemberBtn}
                  onPress={() => {
                    setRemoveReason('');
                    setRemoveErr('');
                    setShowRemove(true);
                  }}
                  disabled={busy}
                >
                  <Ionicons name="trash-outline" size={16} color={Colors.error} />
                  <Text style={styles.removeMemberBtnText}>Remove Member</Text>
                </TouchableOpacity>
              )}
            </View>
          </Card>
        )}
      </ScrollView>

      {/* ─── 1. EDIT PROFILE MODAL ─── */}
      <Modal visible={showEdit} animationType="slide" transparent>
        <SafeAreaView style={styles.modalOverlay}>
          <View style={styles.modalContainer}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Edit Profile</Text>
              <TouchableOpacity onPress={() => !busy && setShowEdit(false)} disabled={busy}>
                <Ionicons name="close" size={24} color={Colors.text} />
              </TouchableOpacity>
            </View>

            <ScrollView contentContainerStyle={styles.modalBody}>
              {editErr ? (
                <View style={styles.errorBanner}>
                  <Ionicons name="alert-circle" size={18} color={Colors.error} style={{ marginRight: 6 }} />
                  <Text style={styles.errorText}>{editErr}</Text>
                </View>
              ) : null}

              <Text style={styles.lockedNote}>
                Note: Locked identity fields (Full Name, Father Name, CNIC, and Basic Unit) cannot be edited directly.
              </Text>

              {/* Photo Upload Section */}
              <View style={styles.photoUploadRow}>
                {editPhoto ? (
                  <Image source={{ uri: editPhoto.uri }} style={styles.editAvatarPreview} />
                ) : (
                  <Avatar name={member?.fullName || 'M'} photoUrl={member?.photoUrl} size={68} />
                )}
                <View style={{ flex: 1, marginLeft: Spacing.md }}>
                  <Text style={styles.photoHeading}>Profile Picture</Text>
                  <Text style={styles.photoSub}>Square photo recommended (max 5 MB)</Text>
                  <TouchableOpacity style={styles.pickPhotoBtn} onPress={pickEditPhoto}>
                    <Ionicons name="camera-outline" size={16} color={Colors.primary} style={{ marginRight: 5 }} />
                    <Text style={styles.pickPhotoBtnText}>
                      {editPhoto || member?.photoUrl ? 'Change Photo' : 'Upload Photo'}
                    </Text>
                  </TouchableOpacity>
                </View>
              </View>

              <View style={styles.field}>
                <Text style={styles.label}>Phone Number *</Text>
                <TextInput
                  style={styles.input}
                  value={editForm.phone}
                  onChangeText={(v) => setEditForm((f) => ({ ...f, phone: v }))}
                  placeholder="03XX-XXXXXXX"
                  placeholderTextColor={Colors.textMuted}
                  keyboardType="phone-pad"
                />
              </View>

              <View style={styles.field}>
                <Text style={styles.label}>Email Address *</Text>
                <TextInput
                  style={styles.input}
                  value={editForm.email}
                  onChangeText={(v) => setEditForm((f) => ({ ...f, email: v }))}
                  placeholder="member@example.com"
                  placeholderTextColor={Colors.textMuted}
                  keyboardType="email-address"
                  autoCapitalize="none"
                />
              </View>

              <DatePicker
                label="Date of Birth"
                value={editForm.dateOfBirth}
                onChange={(v) => setEditForm((f) => ({ ...f, dateOfBirth: v }))}
                placeholder="Select birth date"
                maxDate={new Date().toISOString().split('T')[0]}
              />

              <View style={styles.field}>
                <Text style={styles.label}>Gender</Text>
                <View style={styles.chipRow}>
                  {GENDERS.map((g) => (
                    <TouchableOpacity
                      key={g.value}
                      style={[styles.chip, editForm.gender === g.value && styles.chipActive]}
                      onPress={() => setEditForm((f) => ({ ...f, gender: g.value }))}
                    >
                      <Text style={[styles.chipText, editForm.gender === g.value && styles.chipTextActive]}>
                        {g.label}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </View>
              </View>

              <View style={styles.field}>
                <Text style={styles.label}>Blood Group</Text>
                <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.chipScroll}>
                  {BLOOD_GROUPS.map((bg) => (
                    <TouchableOpacity
                      key={bg}
                      style={[styles.chip, editForm.bloodGroup === bg && styles.chipActive]}
                      onPress={() => setEditForm((f) => ({ ...f, bloodGroup: f.bloodGroup === bg ? '' : bg }))}
                    >
                      <Text style={[styles.chipText, editForm.bloodGroup === bg && styles.chipTextActive]}>
                        {bg}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </ScrollView>
              </View>

              <View style={styles.field}>
                <Text style={styles.label}>Residential Address *</Text>
                <TextInput
                  style={[styles.input, styles.multiline]}
                  value={editForm.address}
                  onChangeText={(v) => setEditForm((f) => ({ ...f, address: v }))}
                  placeholder="Street address, city/village"
                  placeholderTextColor={Colors.textMuted}
                  multiline
                  numberOfLines={2}
                />
              </View>

              <View style={styles.field}>
                <Text style={styles.label}>Education</Text>
                <TextInput
                  style={styles.input}
                  value={editForm.education}
                  onChangeText={(v) => setEditForm((f) => ({ ...f, education: v }))}
                  placeholder="e.g. Master's in Political Science"
                  placeholderTextColor={Colors.textMuted}
                />
              </View>

              <View style={styles.field}>
                <Text style={styles.label}>Occupation</Text>
                <TextInput
                  style={styles.input}
                  value={editForm.occupation}
                  onChangeText={(v) => setEditForm((f) => ({ ...f, occupation: v }))}
                  placeholder="e.g. Teacher, Advocate, Business"
                  placeholderTextColor={Colors.textMuted}
                />
              </View>
            </ScrollView>

            <View style={styles.modalFooter}>
              <TouchableOpacity
                style={styles.modalCancelBtn}
                onPress={() => setShowEdit(false)}
                disabled={busy}
              >
                <Text style={styles.modalCancelText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.modalSaveBtn, busy && { opacity: 0.7 }]}
                onPress={handleSaveEdit}
                disabled={busy}
              >
                {busy ? <ActivityIndicator color="#fff" size="small" /> : <Text style={styles.modalSaveText}>Save Changes</Text>}
              </TouchableOpacity>
            </View>
          </View>
        </SafeAreaView>
      </Modal>

      {/* ─── 2. REJECT APPLICATION MODAL ─── */}
      <Modal visible={showReject} animationType="fade" transparent>
        <SafeAreaView style={styles.promptOverlay}>
          <View style={styles.promptCard}>
            <Text style={styles.promptTitle}>Reject Member Application</Text>
            <Text style={styles.promptSub}>
              Please state the reason for rejecting {member?.fullName}'s application:
            </Text>

            {rejectErr ? (
              <View style={styles.errorBanner}>
                <Text style={styles.errorText}>{rejectErr}</Text>
              </View>
            ) : null}

            <TextInput
              style={[styles.input, styles.multiline, { marginTop: Spacing.sm }]}
              value={rejectReason}
              onChangeText={setRejectReason}
              placeholder="e.g. Incomplete documentation, outside jurisdiction..."
              placeholderTextColor={Colors.textMuted}
              multiline
              numberOfLines={3}
            />

            <View style={styles.promptFooter}>
              <TouchableOpacity
                style={styles.promptCancelBtn}
                onPress={() => setShowReject(false)}
                disabled={busy}
              >
                <Text style={styles.promptCancelText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.promptDangerBtn, busy && { opacity: 0.7 }]}
                onPress={handleRejectSubmit}
                disabled={busy}
              >
                {busy ? <ActivityIndicator color="#fff" size="small" /> : <Text style={styles.promptDangerText}>Confirm Reject</Text>}
              </TouchableOpacity>
            </View>
          </View>
        </SafeAreaView>
      </Modal>

      {/* ─── 3. RESET PASSWORD MODAL (SUPER ADMIN) ─── */}
      <Modal visible={showResetPw} animationType="fade" transparent>
        <SafeAreaView style={styles.promptOverlay}>
          <View style={styles.promptCard}>
            <Text style={styles.promptTitle}>Reset Login Password</Text>
            <Text style={styles.promptSub}>
              Set a new login password for {member?.fullName}:
            </Text>

            {resetPwErr ? (
              <View style={styles.errorBanner}>
                <Text style={styles.errorText}>{resetPwErr}</Text>
              </View>
            ) : null}

            <TextInput
              style={[styles.input, { marginTop: Spacing.sm }]}
              value={newPassword}
              onChangeText={setNewPassword}
              placeholder="Minimum 6 characters"
              placeholderTextColor={Colors.textMuted}
              secureTextEntry
              autoCapitalize="none"
            />

            <View style={styles.promptFooter}>
              <TouchableOpacity
                style={styles.promptCancelBtn}
                onPress={() => setShowResetPw(false)}
                disabled={busy}
              >
                <Text style={styles.promptCancelText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.promptPrimaryBtn, busy && { opacity: 0.7 }]}
                onPress={handleResetPassword}
                disabled={busy}
              >
                {busy ? <ActivityIndicator color="#fff" size="small" /> : <Text style={styles.promptPrimaryText}>Update Password</Text>}
              </TouchableOpacity>
            </View>
          </View>
        </SafeAreaView>
      </Modal>

      {/* ─── 4. REMOVE MEMBER MODAL (SUPER ADMIN) ─── */}
      <Modal visible={showRemove} animationType="fade" transparent>
        <SafeAreaView style={styles.promptOverlay}>
          <View style={styles.promptCard}>
            <Text style={[styles.promptTitle, { color: Colors.error }]}>Remove Member Account</Text>
            <Text style={styles.promptSub}>
              This will mark {member?.fullName} as EXPELLED, terminate all cabinet & responsibility roles, and deactivate login credentials.
            </Text>

            {removeErr ? (
              <View style={styles.errorBanner}>
                <Text style={styles.errorText}>{removeErr}</Text>
              </View>
            ) : null}

            <TextInput
              style={[styles.input, styles.multiline, { marginTop: Spacing.sm }]}
              value={removeReason}
              onChangeText={setRemoveReason}
              placeholder="Reason for removal..."
              placeholderTextColor={Colors.textMuted}
              multiline
              numberOfLines={3}
            />

            <View style={styles.promptFooter}>
              <TouchableOpacity
                style={styles.promptCancelBtn}
                onPress={() => setShowRemove(false)}
                disabled={busy}
              >
                <Text style={styles.promptCancelText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.promptDangerBtn, busy && { opacity: 0.7 }]}
                onPress={handleRemoveMember}
                disabled={busy}
              >
                {busy ? <ActivityIndicator color="#fff" size="small" /> : <Text style={styles.promptDangerText}>Confirm Removal</Text>}
              </TouchableOpacity>
            </View>
          </View>
        </SafeAreaView>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: Colors.background },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  content: { padding: Spacing.lg, paddingBottom: 40 },
  profileCard: { marginBottom: Spacing.md },
  profileHeader: { flexDirection: 'row', alignItems: 'center', gap: Spacing.lg },
  profileInfo: { flex: 1, gap: 4 },
  profileName: { fontSize: FontSize.xl, fontWeight: '800', color: Colors.text },
  profileId: { fontSize: FontSize.sm, color: Colors.textMuted, fontWeight: '500' },
  avatarImg: {
    width: 72,
    height: 72,
    borderRadius: 36,
    borderWidth: 2,
    borderColor: Colors.border,
    backgroundColor: '#f1f5f9',
  },
  headerButtonsRow: {
    flexDirection: 'row',
    gap: Spacing.sm,
    marginTop: Spacing.md,
    paddingTop: Spacing.sm,
    borderTopWidth: 1,
    borderTopColor: Colors.borderLight || '#f1f5f9',
  },
  editBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 14,
    paddingVertical: 9,
    borderRadius: Radius.md,
    backgroundColor: '#eff6ff',
    borderWidth: 1,
    borderColor: '#bfdbfe',
  },
  editBtnText: {
    fontSize: FontSize.sm,
    fontWeight: '700',
    color: Colors.primary,
  },
  sectionCard: {
    marginBottom: Spacing.md,
  },
  sectionTitle: {
    fontSize: FontSize.base,
    fontWeight: '700',
    color: Colors.text,
    marginBottom: Spacing.md,
  },
  infoRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: Colors.borderLight || '#f1f5f9',
  },
  infoLabel: {
    fontSize: FontSize.sm,
    color: Colors.textMuted,
    fontWeight: '600',
  },
  infoValue: {
    fontSize: FontSize.sm,
    color: Colors.text,
    fontWeight: '500',
    flex: 1,
    textAlign: 'right',
    marginLeft: Spacing.md,
  },
  rolePills: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
  },
  approvalActions: {
    flexDirection: 'row',
    gap: Spacing.md,
    marginTop: Spacing.md,
    paddingTop: Spacing.md,
    borderTopWidth: 1,
    borderTopColor: Colors.borderLight || '#f1f5f9',
  },
  actionBtn: {
    flex: 1,
    borderRadius: Radius.md,
    paddingVertical: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  approveBtn: {
    backgroundColor: Colors.success,
  },
  approveText: {
    color: '#fff',
    fontWeight: '700',
    fontSize: FontSize.sm,
  },
  rejectBtn: {
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: Colors.error,
  },
  rejectText: {
    color: Colors.error,
    fontWeight: '700',
    fontSize: FontSize.sm,
  },
  reasonBox: {
    marginTop: Spacing.md,
    padding: Spacing.md,
    borderRadius: Radius.md,
    borderWidth: 1,
  },
  rejectReasonBox: {
    backgroundColor: '#fef2f2',
    borderColor: '#fecaca',
  },
  expelledReasonBox: {
    backgroundColor: '#fff7ed',
    borderColor: '#fed7aa',
  },
  reasonTitle: {
    fontSize: FontSize.xs,
    fontWeight: '700',
    color: Colors.text,
    marginBottom: 4,
  },
  reasonText: {
    fontSize: FontSize.sm,
    color: Colors.text,
  },

  // Super Admin section
  superCard: {
    borderTopWidth: 3,
    borderTopColor: Colors.error,
  },
  superHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  superTitle: {
    fontSize: FontSize.base,
    fontWeight: '700',
    color: Colors.error,
  },
  superSub: {
    fontSize: FontSize.xs,
    color: Colors.textMuted,
    marginTop: 2,
    marginBottom: Spacing.md,
  },
  superButtonsRow: {
    flexDirection: 'row',
    gap: Spacing.md,
    flexWrap: 'wrap',
  },
  resetPwBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: Radius.md,
    borderWidth: 1,
    borderColor: Colors.border,
    backgroundColor: Colors.surface,
  },
  resetPwBtnText: {
    fontSize: FontSize.sm,
    fontWeight: '600',
    color: Colors.text,
  },
  removeMemberBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: Radius.md,
    borderWidth: 1,
    borderColor: Colors.error,
    backgroundColor: '#fef2f2',
  },
  removeMemberBtnText: {
    fontSize: FontSize.sm,
    fontWeight: '700',
    color: Colors.error,
  },

  // Photo row in edit modal
  photoUploadRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.surfaceAlt || '#f8fafc',
    padding: Spacing.md,
    borderRadius: Radius.md,
    borderWidth: 1,
    borderColor: Colors.border,
    marginBottom: Spacing.md,
  },
  editAvatarPreview: {
    width: 68,
    height: 68,
    borderRadius: 34,
    borderWidth: 2,
    borderColor: Colors.primary,
  },
  photoHeading: {
    fontSize: FontSize.sm,
    fontWeight: '700',
    color: Colors.text,
  },
  photoSub: {
    fontSize: FontSize.xs,
    color: Colors.textMuted,
    marginTop: 2,
    marginBottom: 6,
  },
  pickPhotoBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    backgroundColor: '#eff6ff',
    borderWidth: 1,
    borderColor: '#bfdbfe',
    borderRadius: Radius.sm,
    paddingHorizontal: 10,
    paddingVertical: 5,
  },
  pickPhotoBtnText: {
    fontSize: FontSize.xs,
    fontWeight: '700',
    color: Colors.primary,
  },

  // Modals
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: Platform.OS === 'web' ? 'center' : 'flex-end',
    alignItems: Platform.OS === 'web' ? 'center' : 'stretch',
    padding: Platform.OS === 'web' ? Spacing.lg : 0,
  },
  modalContainer: {
    backgroundColor: Colors.surface,
    borderTopLeftRadius: Radius.xl,
    borderTopRightRadius: Radius.xl,
    ...(Platform.OS === 'web' ? {
      borderRadius: Radius.xl,
      width: '100%',
      maxWidth: 580,
      boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.2), 0 8px 10px -6px rgba(0, 0, 0, 0.2)',
    } : {}),
    maxHeight: '90%',
    display: 'flex',
    flexDirection: 'column',
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: Spacing.lg,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
  },
  modalTitle: {
    fontSize: FontSize.lg,
    fontWeight: '700',
    color: Colors.text,
  },
  modalBody: {
    padding: Spacing.lg,
  },
  lockedNote: {
    fontSize: FontSize.xs,
    color: Colors.textMuted,
    backgroundColor: Colors.surfaceAlt || '#f8fafc',
    padding: Spacing.sm,
    borderRadius: Radius.sm,
    marginBottom: Spacing.md,
  },
  field: {
    marginBottom: Spacing.md,
  },
  label: {
    fontSize: FontSize.xs,
    fontWeight: '700',
    color: Colors.text,
    marginBottom: 6,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  input: {
    backgroundColor: Colors.surface,
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: Radius.md,
    paddingHorizontal: Spacing.md,
    paddingVertical: 10,
    fontSize: FontSize.sm,
    color: Colors.text,
  },
  multiline: {
    height: 70,
    textAlignVertical: 'top',
  },
  chipRow: {
    flexDirection: 'row',
    gap: 8,
  },
  chipScroll: {
    flexDirection: 'row',
  },
  chip: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: Radius.pill,
    borderWidth: 1,
    borderColor: Colors.border,
    backgroundColor: Colors.surface,
    marginRight: 8,
  },
  chipActive: {
    borderColor: Colors.primary,
    backgroundColor: Colors.primary,
  },
  chipText: {
    fontSize: FontSize.xs,
    color: Colors.textMuted,
    fontWeight: '600',
  },
  chipTextActive: {
    color: '#fff',
    fontWeight: '700',
  },
  modalFooter: {
    flexDirection: 'row',
    gap: Spacing.md,
    padding: Spacing.lg,
    borderTopWidth: 1,
    borderTopColor: Colors.border,
  },
  modalCancelBtn: {
    flex: 1,
    borderRadius: Radius.md,
    paddingVertical: 12,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: Colors.border,
  },
  modalCancelText: {
    color: Colors.text,
    fontWeight: '600',
    fontSize: FontSize.sm,
  },
  modalSaveBtn: {
    flex: 2,
    borderRadius: Radius.md,
    paddingVertical: 12,
    alignItems: 'center',
    backgroundColor: Colors.primary,
  },
  modalSaveText: {
    color: '#fff',
    fontWeight: '700',
    fontSize: FontSize.sm,
  },

  // Alert / Prompt dialogs
  promptOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: Spacing.lg,
  },
  promptCard: {
    width: '100%',
    maxWidth: 440,
    backgroundColor: Colors.surface,
    borderRadius: Radius.lg,
    padding: Spacing.lg,
    ...Platform.select({
      ios: {
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.15,
        shadowRadius: 8,
      },
      android: {
        elevation: 6,
      },
      web: {
        boxShadow: '0 10px 25px -5px rgba(0, 0, 0, 0.15)',
      },
    }),
  },
  promptTitle: {
    fontSize: FontSize.base,
    fontWeight: '700',
    color: Colors.text,
  },
  promptSub: {
    fontSize: FontSize.xs,
    color: Colors.textMuted,
    marginTop: 4,
    marginBottom: Spacing.sm,
  },
  promptFooter: {
    flexDirection: 'row',
    gap: Spacing.md,
    marginTop: Spacing.lg,
  },
  promptCancelBtn: {
    flex: 1,
    borderRadius: Radius.md,
    paddingVertical: 10,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: Colors.border,
  },
  promptCancelText: {
    color: Colors.text,
    fontWeight: '600',
    fontSize: FontSize.sm,
  },
  promptPrimaryBtn: {
    flex: 1,
    borderRadius: Radius.md,
    paddingVertical: 10,
    alignItems: 'center',
    backgroundColor: Colors.primary,
  },
  promptPrimaryText: {
    color: '#fff',
    fontWeight: '700',
    fontSize: FontSize.sm,
  },
  promptDangerBtn: {
    flex: 1,
    borderRadius: Radius.md,
    paddingVertical: 10,
    alignItems: 'center',
    backgroundColor: Colors.error,
  },
  promptDangerText: {
    color: '#fff',
    fontWeight: '700',
    fontSize: FontSize.sm,
  },
  errorBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#fef2f2',
    borderRadius: Radius.md,
    padding: Spacing.md,
    marginBottom: Spacing.sm,
    borderWidth: 1,
    borderColor: '#fecaca',
  },
  errorText: {
    color: Colors.error,
    fontSize: FontSize.xs,
    fontWeight: '500',
    flex: 1,
  },
});
