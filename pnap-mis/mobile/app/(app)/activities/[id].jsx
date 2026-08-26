import { useEffect, useState } from 'react';
import { ActivityIndicator, SafeAreaView, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useLocalSearchParams } from 'expo-router';
import { api } from '../../../src/api/client';
import Card from '../../../src/components/Card';
import Badge from '../../../src/components/Badge';
import EmptyState from '../../../src/components/EmptyState';
import { Colors, FontSize, Spacing } from '../../../src/constants/colors';
import { shortDate, ACTIVITY_TYPE_LABEL } from '../../../src/utils/formatters';

function InfoRow({ label, value }) {
  if (!value) return null;
  return (
    <View style={styles.row}>
      <Text style={styles.rowLabel}>{label}</Text>
      <Text style={styles.rowValue}>{value}</Text>
    </View>
  );
}

export default function ActivityDetailScreen() {
  const { id } = useLocalSearchParams();
  const [activity, setActivity] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api.get(`/activities/${id}`)
      .then((r) => setActivity(r.data.data))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [id]);

  if (loading) return <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}><ActivityIndicator size="large" color={Colors.primary} /></View>;
  if (!activity) return <EmptyState icon="❌" title="Activity not found" />;

  const a = activity;

  return (
    <SafeAreaView style={styles.safe}>
      <ScrollView contentContainerStyle={styles.content}>
        <Card>
          <Text style={styles.aTitle}>{a.title || ACTIVITY_TYPE_LABEL[a.typeCode] || a.typeCode}</Text>
          <Badge label={ACTIVITY_TYPE_LABEL[a.typeCode] || a.typeCode} color={Colors.primary} bg="#eff6ff" />
        </Card>
        <Card>
          <Text style={styles.sectionTitle}>Details</Text>
          <InfoRow label="Start" value={a.startAt ? new Date(a.startAt).toLocaleString('en-PK') : undefined} />
          <InfoRow label="End" value={a.endAt ? new Date(a.endAt).toLocaleString('en-PK') : undefined} />
          <InfoRow label="Venue" value={a.venue} />
          <InfoRow label="Unit" value={a.unitId?.name || a.unitName} />
        </Card>
        {a.description ? (
          <Card>
            <Text style={styles.sectionTitle}>Description</Text>
            <Text style={styles.bodyText}>{a.description}</Text>
          </Card>
        ) : null}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: Colors.background },
  content: { padding: Spacing.lg, paddingBottom: 32 },
  aTitle: { fontSize: FontSize.xl, fontWeight: '700', color: Colors.text, marginBottom: Spacing.sm },
  sectionTitle: { fontSize: FontSize.base, fontWeight: '700', color: Colors.text, marginBottom: Spacing.md },
  row: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 6, borderBottomWidth: 1, borderBottomColor: Colors.borderLight },
  rowLabel: { fontSize: FontSize.sm, color: Colors.textMuted },
  rowValue: { fontSize: FontSize.sm, color: Colors.text, fontWeight: '500', flex: 1, textAlign: 'right' },
  bodyText: { fontSize: FontSize.base, color: Colors.text, lineHeight: 22 },
});
