import React, { useEffect, useState } from 'react';
import { View, Text, ScrollView, TouchableOpacity, StyleSheet, TextInput } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { api, errorMessage } from '../../../../src/api/client';
import { useAuth } from '../../../../src/context/AuthContext';
import { hasPermission } from '../../../../src/utils/permissions';
import { useToast } from '../../../../src/components/Toast';
import { Colors, FontSize, Radius, Spacing } from '../../../../src/constants/colors';

const FIELDS = [
  { key: 'systemName', label: 'System name', help: 'The full product name. Shown wherever you brand the product itself.', max: 80 },
  { key: 'shortName', label: 'Short name / abbreviation', help: 'Sidebar header + compact UI surfaces.', max: 40 },
  { key: 'organizationName', label: 'Organization name', help: 'The organization that owns this deployment.', max: 120 },
  { key: 'loginTitle', label: 'Login page title', help: 'Heading on the login screen.', max: 120 },
  { key: 'browserTabTitle', label: 'Browser tab title', help: 'Sets <title> on every page.', max: 80 },
  { key: 'metaDescription', label: 'Meta description', help: 'SEO / link-preview blurb.', max: 300 },
  { key: 'footerText', label: 'Footer text', help: 'Shown at the bottom of dashboards.', max: 300 },
  { key: 'copyrightText', label: 'Copyright text', help: 'Shown on PDF / XLSX exports.', max: 120 },
];

export default function SystemIdentityScreen() {
  const router = useRouter();
  const { user } = useAuth();
  const toast = useToast();
  const canWrite = hasPermission(user, 'MANAGE_SYSTEM_BRANDING');

  const [form, setForm] = useState(null);
  const [busy, setBusy] = useState(false);
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState('');

  async function load() {
    setBusy(true); setErr('');
    try {
      const r = await api.get('/settings');
      const s = r.data?.data || null;
      const out = {};
      for (const f of FIELDS) out[f.key] = s?.identity?.[f.key] || '';
      setForm(out);
    } catch (e) { setErr(errorMessage(e)); }
    finally { setBusy(false); }
  }
  useEffect(() => { load(); }, []);

  async function save() {
    setSaving(true); setErr('');
    try {
      const identity = {};
      for (const f of FIELDS) {
        if (form[f.key] !== undefined) identity[f.key] = form[f.key];
      }
      await api.patch('/settings', { identity, changeNote: 'Updated system identity via mobile' });
      toast.success('Identity saved.');
      load();
    } catch (e) {
      setErr(errorMessage(e));
      toast.error(errorMessage(e));
    } finally {
      setSaving(false);
    }
  }

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <View style={styles.hero}>
        <View style={styles.heroHeader}>
          <View style={styles.heroIconBg}>
            <Ionicons name="pricetag" size={24} color={Colors.primary} />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={styles.heroTitle}>System Identity</Text>
            <Text style={styles.heroSub}>
              System name, short name, organization, footer, browser tab title.
            </Text>
          </View>
        </View>
        <View style={styles.heroActions}>
          <TouchableOpacity style={styles.btnOutline} onPress={() => router.back()} disabled={busy || saving}>
            <Ionicons name="arrow-back" size={16} color={Colors.text} style={{ marginRight: 6 }} />
            <Text style={styles.btnOutlineText}>Back</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.btnOutline} onPress={load} disabled={busy || saving}>
            <Ionicons name="refresh" size={16} color={Colors.text} style={{ marginRight: 6 }} />
            <Text style={styles.btnOutlineText}>Refresh</Text>
          </TouchableOpacity>
        </View>
      </View>

      {err ? <Text style={styles.errorText}>{err}</Text> : null}

      {!busy && form && (
        <>
          <View style={styles.card}>
            <View style={styles.cardHeader}>
              <Ionicons name="clipboard" size={18} color={Colors.textLight} />
              <Text style={styles.cardTitle}>Strings</Text>
            </View>
            <View style={styles.cardBody}>
              {FIELDS.map((f) => (
                <View style={styles.field} key={f.key}>
                  <Text style={styles.label}>{f.label}</Text>
                  <TextInput
                    style={[styles.input, !canWrite && styles.inputDisabled]}
                    value={form[f.key] || ''}
                    maxLength={f.max}
                    onChangeText={(v) => setForm((p) => ({ ...p, [f.key]: v }))}
                    editable={canWrite}
                  />
                  <Text style={styles.hintText}>{f.help}</Text>
                </View>
              ))}
            </View>
          </View>

          {canWrite && (
            <View style={styles.footer}>
              <TouchableOpacity style={styles.btnOutline} onPress={() => router.back()} disabled={saving}>
                <Ionicons name="close" size={16} color={Colors.text} style={{ marginRight: 6 }} />
                <Text style={styles.btnOutlineText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[styles.btnSolid, saving && styles.btnDisabled]} onPress={save} disabled={saving}>
                <Ionicons name="checkmark" size={16} color="#fff" style={{ marginRight: 6 }} />
                <Text style={styles.btnSolidText}>{saving ? 'Saving...' : 'Save changes'}</Text>
              </TouchableOpacity>
            </View>
          )}
        </>
      )}
      <View style={{ height: 40 }} />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },
  content: { padding: Spacing.md },
  hero: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: Spacing.xl, flexWrap: 'wrap', gap: Spacing.md },
  heroHeader: { flexDirection: 'row', flex: 1, minWidth: 250 },
  heroIconBg: { width: 48, height: 48, borderRadius: Radius.md, backgroundColor: `${Colors.primary}15`, alignItems: 'center', justifyContent: 'center', marginRight: Spacing.md },
  heroTitle: { fontSize: FontSize.xl, fontWeight: '700', color: Colors.text, marginBottom: 4 },
  heroSub: { fontSize: FontSize.sm, color: Colors.textMuted, lineHeight: 20 },
  heroActions: { flexDirection: 'row', gap: Spacing.sm },
  btnOutline: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: Spacing.md, paddingVertical: Spacing.sm, borderRadius: Radius.sm, borderWidth: 1, borderColor: Colors.border, backgroundColor: '#fff' },
  btnOutlineText: { color: Colors.text, fontWeight: '600', fontSize: FontSize.sm },
  btnSolid: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: Spacing.md, paddingVertical: Spacing.sm, borderRadius: Radius.sm, backgroundColor: Colors.primary },
  btnSolidText: { color: '#fff', fontWeight: '600', fontSize: FontSize.sm },
  btnDisabled: { opacity: 0.5 },
  errorText: { color: Colors.danger, backgroundColor: '#fee2e2', padding: Spacing.md, borderRadius: Radius.sm, marginBottom: Spacing.md, overflow: 'hidden' },
  
  card: { backgroundColor: '#fff', borderRadius: Radius.md, borderWidth: 1, borderColor: Colors.border, marginBottom: Spacing.md, overflow: 'hidden' },
  cardHeader: { flexDirection: 'row', alignItems: 'center', padding: Spacing.md, borderBottomWidth: 1, borderBottomColor: Colors.border, backgroundColor: '#f9fafb' },
  cardTitle: { fontSize: FontSize.md, fontWeight: '600', color: Colors.text, marginLeft: Spacing.sm, flex: 1 },
  cardBody: { padding: Spacing.md },
  
  field: { marginBottom: Spacing.lg },
  label: { fontSize: FontSize.sm, fontWeight: '600', color: Colors.text, marginBottom: 6 },
  input: { borderWidth: 1, borderColor: Colors.border, borderRadius: Radius.sm, padding: 10, fontSize: FontSize.sm, backgroundColor: '#fff', color: Colors.text },
  inputDisabled: { backgroundColor: '#f9fafb', color: Colors.textMuted },
  hintText: { fontSize: FontSize.xs, color: Colors.textMuted, marginTop: 4 },

  footer: { flexDirection: 'row', justifyContent: 'flex-end', gap: Spacing.md, marginTop: Spacing.md }
});
