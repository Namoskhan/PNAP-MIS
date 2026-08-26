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
import EmptyState from '../../../src/components/EmptyState';
import Avatar from '../../../src/components/Avatar';
import { Colors, FontSize, Spacing } from '../../../src/constants/colors';
import { shortDate, MEETING_TYPE_LABEL } from '../../../src/utils/formatters';

function InfoRow({ label, value }) {
  if (!value) return null;
  return (
    <View style={styles.row}>
      <Text style={styles.rowLabel}>{label}</Text>
      <Text style={styles.rowValue}>{value}</Text>
    </View>
  );
}

export default function MeetingDetailScreen() {
  const { id } = useLocalSearchParams();
  const [meeting, setMeeting] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api.get(`/meetings/${id}`)
      .then((r) => setMeeting(r.data.data))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [id]);

  if (loading) return <View style={styles.center}><ActivityIndicator size="large" color={Colors.primary} /></View>;
  if (!meeting) return <EmptyState icon="❌" title="Meeting not found" />;

  const m = meeting;
  const attendees = m.attendees || [];
  const chairperson = m.chairpersonId;

  return (
    <SafeAreaView style={styles.safe}>
      <ScrollView contentContainerStyle={styles.content}>
        {/* Header */}
        <Card style={styles.headerCard}>
          <Text style={styles.meetingTitle}>{m.title || MEETING_TYPE_LABEL[m.typeCode] || m.typeCode}</Text>
          <View style={styles.badges}>
            <Badge label={MEETING_TYPE_LABEL[m.typeCode] || m.typeCode} color={Colors.primary} bg="#eff6ff" />
            <Badge label={m.body || 'EXECUTIVE'} color={Colors.info} bg={Colors.infoBg} />
          </View>
        </Card>

        {/* Details */}
        <Card>
          <Text style={styles.sectionTitle}>Details</Text>
          <InfoRow label="Start" value={m.startAt ? new Date(m.startAt).toLocaleString('en-PK') : undefined} />
          <InfoRow label="End" value={m.endAt ? new Date(m.endAt).toLocaleString('en-PK') : undefined} />
          <InfoRow label="Venue" value={m.venue} />
          <InfoRow label="Chairperson" value={chairperson?.fullName} />
          <InfoRow label="Unit" value={m.unitId?.name || m.unitName} />
        </Card>

        {m.agenda ? (
          <Card>
            <Text style={styles.sectionTitle}>Agenda</Text>
            <Text style={styles.bodyText}>{m.agenda}</Text>
          </Card>
        ) : null}

        {m.description ? (
          <Card>
            <Text style={styles.sectionTitle}>Description</Text>
            <Text style={styles.bodyText}>{m.description}</Text>
          </Card>
        ) : null}

        {/* Attendance */}
        {attendees.length > 0 && (
          <Card>
            <Text style={styles.sectionTitle}>Attendance ({attendees.length})</Text>
            {attendees.map((a, i) => (
              <View key={i} style={styles.attendeeRow}>
                <Avatar name={a.memberId?.fullName || a.name || '?'} size={32} />
                <Text style={styles.attendeeName} numberOfLines={1}>{a.memberId?.fullName || a.name || '—'}</Text>
                <Badge
                  label={a.present ? 'Present' : 'Absent'}
                  color={a.present ? Colors.success : Colors.error}
                  bg={a.present ? Colors.successBg : Colors.errorBg}
                />
              </View>
            ))}
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
  headerCard: { marginBottom: Spacing.md },
  meetingTitle: { fontSize: FontSize.xl, fontWeight: '700', color: Colors.text, marginBottom: Spacing.sm },
  badges: { flexDirection: 'row', gap: 8 },
  sectionTitle: { fontSize: FontSize.base, fontWeight: '700', color: Colors.text, marginBottom: Spacing.md },
  row: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 6, borderBottomWidth: 1, borderBottomColor: Colors.borderLight },
  rowLabel: { fontSize: FontSize.sm, color: Colors.textMuted, fontWeight: '500' },
  rowValue: { fontSize: FontSize.sm, color: Colors.text, fontWeight: '500', flex: 1, textAlign: 'right' },
  bodyText: { fontSize: FontSize.base, color: Colors.text, lineHeight: 22 },
  attendeeRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.md, paddingVertical: 6, borderBottomWidth: 1, borderBottomColor: Colors.borderLight },
  attendeeName: { flex: 1, fontSize: FontSize.sm, color: Colors.text, fontWeight: '500' },
});
