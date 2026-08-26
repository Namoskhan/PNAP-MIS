import { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  View,
  TouchableOpacity,
  Alert,
} from 'react-native';
import { useLocalSearchParams, router } from 'expo-router';
import { api } from '../../../src/api/client';
import Card from '../../../src/components/Card';
import Badge from '../../../src/components/Badge';
import Avatar from '../../../src/components/Avatar';
import EmptyState from '../../../src/components/EmptyState';
import { Colors, FontSize, Spacing } from '../../../src/constants/colors';
import { shortDate, formatCnic } from '../../../src/utils/formatters';
import { useAuth } from '../../../src/context/AuthContext';
import { useToast } from '../../../src/components/Toast';
import { isHigherAdmin, isAreaAdmin } from '../../../src/utils/permissions';

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

  function load() {
    api.get(`/members/${id}`)
      .then((r) => setMember(r.data.data))
      .catch(() => setError('Could not load member.'))
      .finally(() => setLoading(false));
  }

  useEffect(() => {
    load();
  }, [id]);

  async function handleApprove() {
    setBusy(true);
    try {
      await api.post(`/members/${id}/approve`);
      toast.success('Member approved successfully.');
      load();
    } catch (e) {
      toast.error('Could not approve member: ' + e.message);
    } finally {
      setBusy(false);
    }
  }

  function handleReject() {
    Alert.prompt(
      'Reject Member',
      'Reason for rejection:',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Reject',
          style: 'destructive',
          onPress: async (reason) => {
            if (!reason) return;
            setBusy(true);
            try {
              await api.post(`/members/${id}/reject`, { reason });
              toast.success('Member rejected.');
              load();
            } catch (e) {
              toast.error('Could not reject member: ' + e.message);
            } finally {
              setBusy(false);
            }
          },
        },
      ],
      'plain-text'
    );
  }

  if (loading) {
    return <View style={styles.center}><ActivityIndicator size="large" color={Colors.primary} /></View>;
  }

  if (error || !member) {
    return <EmptyState icon="❌" title="Member not found" subtitle={error} />;
  }

  const m = member;

  return (
    <SafeAreaView style={styles.safe}>
      <ScrollView contentContainerStyle={styles.content}>
        {/* Profile Header */}
        <Card style={styles.profileCard}>
          <View style={styles.profileHeader}>
            <Avatar name={m.fullName} size={72} />
            <View style={styles.profileInfo}>
              <Text style={styles.profileName}>{m.fullName}</Text>
              {m.memberId && <Text style={styles.profileId}>ID: {m.memberId}</Text>}
              <Badge label={m.status?.replace(/_/g, ' ') || '—'} status={m.status} />
            </View>
          </View>
          
          {m.status === 'PENDING_APPROVAL' && (isHigherAdmin(user) || isAreaAdmin(user)) && (
            <View style={styles.approvalActions}>
              <TouchableOpacity style={[styles.actionBtn, styles.approveBtn]} onPress={handleApprove} disabled={busy}>
                {busy ? <ActivityIndicator color="#fff" /> : <Text style={styles.approveText}>Approve Member</Text>}
              </TouchableOpacity>
              <TouchableOpacity style={[styles.actionBtn, styles.rejectBtn]} onPress={handleReject} disabled={busy}>
                <Text style={styles.rejectText}>Reject</Text>
              </TouchableOpacity>
            </View>
          )}
        </Card>

        {/* Personal Info */}
        <Card>
          <Text style={styles.sectionTitle}>Personal Information</Text>
          <Row label="CNIC" value={m.cnic ? formatCnic(m.cnic) : undefined} />
          <Row label="Phone" value={m.phone} />
          <Row label="Email" value={m.email} />
          <Row label="Date of Birth" value={m.dob ? shortDate(m.dob) : undefined} />
          <Row label="Gender" value={m.gender} />
          <Row label="Father's Name" value={m.fatherName} />
          <Row label="Address" value={m.address} />
        </Card>

        {/* Unit Info */}
        <Card>
          <Text style={styles.sectionTitle}>Unit Information</Text>
          <Row label="Basic Unit" value={m.basicUnitId?.name} />
          <Row label="Area" value={m.areaId?.name} />
          <Row label="District" value={m.districtId?.name} />
          <Row label="Province" value={m.provinceId?.name} />
          <Row label="Joined" value={m.joinedAt ? shortDate(m.joinedAt) : undefined} />
        </Card>

        {/* Roles */}
        {m.roles?.length > 0 && (
          <Card>
            <Text style={styles.sectionTitle}>Roles</Text>
            <View style={styles.rolePills}>
              {m.roles.map((r, i) => (
                <Badge key={i} label={r.replace(/_/g, ' ')} color={Colors.primaryLight} bg="#eff6ff" />
              ))}
            </View>
          </Card>
        )}

        {/* Education / Occupation */}
        {(m.education || m.occupation) && (
          <Card>
            <Text style={styles.sectionTitle}>Background</Text>
            <Row label="Education" value={m.education} />
            <Row label="Occupation" value={m.occupation} />
          </Card>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: Colors.background },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  content: { padding: Spacing.lg, paddingBottom: 32 },
  profileCard: { marginBottom: Spacing.md },
  profileHeader: { flexDirection: 'row', alignItems: 'center', gap: Spacing.lg },
  profileInfo: { flex: 1, gap: 4 },
  profileName: { fontSize: FontSize.xl, fontWeight: '700', color: Colors.text },
  profileId: { fontSize: FontSize.sm, color: Colors.textMuted },
  sectionTitle: { fontSize: FontSize.base, fontWeight: '700', color: Colors.text, marginBottom: Spacing.md },
  infoRow: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 6, borderBottomWidth: 1, borderBottomColor: Colors.borderLight },
  infoLabel: { fontSize: FontSize.sm, color: Colors.textMuted, fontWeight: '500' },
  infoValue: { fontSize: FontSize.sm, color: Colors.text, fontWeight: '500', flex: 1, textAlign: 'right' },
  rolePills: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  approvalActions: { flexDirection: 'row', gap: Spacing.md, marginTop: Spacing.md, paddingTop: Spacing.md, borderTopWidth: 1, borderTopColor: Colors.borderLight },
  actionBtn: { flex: 1, borderRadius: 8, paddingVertical: 12, alignItems: 'center', justifyContent: 'center' },
  approveBtn: { backgroundColor: Colors.success },
  approveText: { color: '#fff', fontWeight: '700', fontSize: FontSize.sm },
  rejectBtn: { backgroundColor: Colors.background, borderWidth: 1, borderColor: Colors.error },
  rejectText: { color: Colors.error, fontWeight: '600', fontSize: FontSize.sm },
});
