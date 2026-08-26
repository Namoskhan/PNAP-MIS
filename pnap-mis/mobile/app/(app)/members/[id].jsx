import { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useLocalSearchParams } from 'expo-router';
import { api } from '../../../src/api/client';
import Card from '../../../src/components/Card';
import Badge from '../../../src/components/Badge';
import Avatar from '../../../src/components/Avatar';
import EmptyState from '../../../src/components/EmptyState';
import { Colors, FontSize, Spacing } from '../../../src/constants/colors';
import { shortDate, formatCnic } from '../../../src/utils/formatters';

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
  const [member, setMember] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    api.get(`/members/${id}`)
      .then((r) => setMember(r.data.data))
      .catch(() => setError('Could not load member.'))
      .finally(() => setLoading(false));
  }, [id]);

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
});
