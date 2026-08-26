import { useEffect, useState } from 'react';
import {
  ActivityIndicator, SafeAreaView, ScrollView,
  StyleSheet, Switch, Text, TextInput, TouchableOpacity, View,
} from 'react-native';
import { useLocalSearchParams } from 'expo-router';
import { api, errorMessage } from '../../../../src/api/client';
import { useAuth } from '../../../../src/context/AuthContext';
import { hasPermission } from '../../../../src/utils/permissions';
import { useToast } from '../../../../src/components/Toast';
import Card from '../../../../src/components/Card';
import { Colors, FontSize, Spacing } from '../../../../src/constants/colors';

export default function EventTypeEditorScreen() {
  const { id } = useLocalSearchParams();
  const { user } = useAuth();
  const toast = useToast();
  const canWrite = hasPermission(user, 'MANAGE_EVENT_CONFIG');

  const [doc, setDoc] = useState(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  // Editable fields
  const [label, setLabel] = useState('');
  const [description, setDescription] = useState('');
  const [isActive, setIsActive] = useState(true);
  const [sortOrder, setSortOrder] = useState('100');
  const [appliesToExec, setAppliesToExec] = useState(true);
  const [appliesToComm, setAppliesToComm] = useState(true);

  async function load() {
    setLoading(true);
    try {
      const r = await api.get(`/admin/events/types/${id}`);
      const td = r.data?.data;
      setDoc(td);
      setLabel(td.label || '');
      setDescription(td.description || '');
      setIsActive(td.isActive !== false);
      setSortOrder(String(td.sortOrder ?? 100));
      setAppliesToExec(td.appliesTo?.executive !== false);
      setAppliesToComm(td.appliesTo?.committee !== false);
    } catch (e) { toast.error(errorMessage(e)); }
    finally { setLoading(false); }
  }

  useEffect(() => { load(); }, [id]);

  async function handleSave() {
    if (!label.trim()) { toast.error('Label is required.'); return; }
    setSaving(true);
    try {
      await api.patch(`/admin/events/types/${id}`, {
        label: label.trim(),
        description: description.trim(),
        isActive,
        sortOrder: parseInt(sortOrder, 10) || 100,
        appliesTo: { executive: appliesToExec, committee: appliesToComm },
      });
      toast.success('Event type updated.');
      load();
    } catch (e) { toast.error(errorMessage(e)); }
    finally { setSaving(false); }
  }

  if (loading) {
    return <View style={styles.center}><ActivityIndicator size="large" color={Colors.primary} /></View>;
  }
  if (!doc) {
    return <View style={styles.center}><Text style={styles.errText}>Type not found.</Text></View>;
  }

  return (
    <SafeAreaView style={styles.safe}>
      {/* Banner */}
      <View style={styles.banner}>
        <Text style={styles.bannerTitle}>{doc.label}</Text>
        <Text style={styles.bannerCode}>{doc.code} · {doc.entity}</Text>
        {doc.isSystem && <Text style={styles.systemBadge}>System type</Text>}
      </View>

      <ScrollView contentContainerStyle={styles.content}>
        {!canWrite && (
          <View style={styles.readOnlyBar}>
            <Text style={styles.readOnlyText}>🔒 Read-only — MANAGE_EVENT_CONFIG required to edit</Text>
          </View>
        )}

        <Card style={styles.section}>
          <Text style={styles.sectionTitle}>Basic Info</Text>
          <Text style={styles.fieldLabel}>Display Label *</Text>
          <TextInput
            style={[styles.input, !canWrite && styles.inputDisabled]}
            value={label}
            onChangeText={setLabel}
            editable={canWrite}
            placeholder="e.g. Emergency Meeting"
          />
          <Text style={styles.fieldLabel}>Description</Text>
          <TextInput
            style={[styles.input, styles.multiline, !canWrite && styles.inputDisabled]}
            value={description}
            onChangeText={setDescription}
            editable={canWrite}
            placeholder="Optional description"
            multiline
            numberOfLines={3}
          />
          <Text style={styles.fieldLabel}>Sort Order</Text>
          <TextInput
            style={[styles.input, !canWrite && styles.inputDisabled]}
            value={sortOrder}
            onChangeText={setSortOrder}
            editable={canWrite}
            keyboardType="numeric"
            placeholder="100"
          />
        </Card>

        <Card style={styles.section}>
          <Text style={styles.sectionTitle}>Status</Text>
          <View style={styles.switchRow}>
            <View style={{ flex: 1 }}>
              <Text style={styles.switchLabel}>Active</Text>
              <Text style={styles.switchHint}>Inactive types cannot be selected for new records.</Text>
            </View>
            <Switch
              value={isActive}
              onValueChange={setIsActive}
              disabled={!canWrite}
              trackColor={{ true: Colors.primary }}
            />
          </View>
        </Card>

        <Card style={styles.section}>
          <Text style={styles.sectionTitle}>Applies To</Text>
          <View style={styles.switchRow}>
            <View style={{ flex: 1 }}>
              <Text style={styles.switchLabel}>Executive Body</Text>
              <Text style={styles.switchHint}>This type appears in Executive meeting/activity lists.</Text>
            </View>
            <Switch
              value={appliesToExec}
              onValueChange={setAppliesToExec}
              disabled={!canWrite}
              trackColor={{ true: Colors.primary }}
            />
          </View>
          <View style={[styles.switchRow, { borderTopWidth: 1, borderTopColor: Colors.borderLight, marginTop: Spacing.sm, paddingTop: Spacing.sm }]}>
            <View style={{ flex: 1 }}>
              <Text style={styles.switchLabel}>Committee Body</Text>
              <Text style={styles.switchHint}>This type appears in Committee meeting/activity lists.</Text>
            </View>
            <Switch
              value={appliesToComm}
              onValueChange={setAppliesToComm}
              disabled={!canWrite}
              trackColor={{ true: Colors.primary }}
            />
          </View>
        </Card>
      </ScrollView>

      {canWrite && (
        <View style={styles.footer}>
          <TouchableOpacity style={styles.saveBtn} onPress={handleSave} disabled={saving}>
            {saving ? <ActivityIndicator color="#fff" /> : <Text style={styles.saveText}>Save Changes</Text>}
          </TouchableOpacity>
        </View>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: Colors.background },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  errText: { color: Colors.error, fontSize: FontSize.base },
  banner: { backgroundColor: Colors.primary, padding: Spacing.lg },
  bannerTitle: { fontSize: FontSize.xl, fontWeight: '800', color: '#fff' },
  bannerCode: { fontSize: FontSize.sm, color: 'rgba(255,255,255,0.7)', marginTop: 2, fontFamily: 'monospace' },
  systemBadge: { marginTop: 6, fontSize: FontSize.xs, color: 'rgba(255,255,255,0.9)', backgroundColor: 'rgba(255,255,255,0.15)', alignSelf: 'flex-start', paddingHorizontal: 8, paddingVertical: 3, borderRadius: 6 },
  readOnlyBar: { backgroundColor: '#fef9c3', borderRadius: 10, padding: Spacing.md, marginBottom: Spacing.md, borderWidth: 1, borderColor: '#fde68a' },
  readOnlyText: { fontSize: FontSize.sm, color: '#92400e' },
  content: { padding: Spacing.md, paddingBottom: 100 },
  section: { marginBottom: Spacing.md },
  sectionTitle: { fontSize: FontSize.base, fontWeight: '700', color: Colors.text, marginBottom: Spacing.md },
  fieldLabel: { fontSize: FontSize.sm, fontWeight: '600', color: Colors.text, marginBottom: 6, marginTop: Spacing.sm },
  input: { backgroundColor: Colors.background, borderWidth: 1, borderColor: Colors.border, borderRadius: 10, paddingHorizontal: Spacing.md, paddingVertical: 10, fontSize: FontSize.sm, color: Colors.text },
  inputDisabled: { opacity: 0.6 },
  multiline: { height: 80, textAlignVertical: 'top' },
  switchRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.md },
  switchLabel: { fontSize: FontSize.base, fontWeight: '600', color: Colors.text },
  switchHint: { fontSize: FontSize.xs, color: Colors.textMuted, marginTop: 2 },
  footer: { padding: Spacing.lg, borderTopWidth: 1, borderTopColor: Colors.border, backgroundColor: Colors.surface },
  saveBtn: { backgroundColor: Colors.primary, borderRadius: 12, paddingVertical: 14, alignItems: 'center' },
  saveText: { color: '#fff', fontWeight: '700', fontSize: FontSize.base },
});
