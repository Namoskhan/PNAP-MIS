import React, { useEffect, useState } from 'react';
import { View, Text, ScrollView, TouchableOpacity, StyleSheet, TextInput } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { api, errorMessage } from '../../../../src/api/client';
import { useAuth } from '../../../../src/context/AuthContext';
import { hasPermission } from '../../../../src/utils/permissions';
import { useToast } from '../../../../src/components/Toast';
import { Colors, FontSize, Radius, Spacing } from '../../../../src/constants/colors';

const CARD_STYLES = [
  { value: 'SOLID', label: 'SOLID', description: 'Opaque card with sharp edges' },
  { value: 'GLASS', label: 'GLASS', description: 'Translucent card with backdrop blur' },
];

export default function LoginCustomizationScreen() {
  const router = useRouter();
  const { user } = useAuth();
  const toast = useToast();
  const canWrite = hasPermission(user, 'MANAGE_SYSTEM_BRANDING');

  const [form, setForm] = useState(null);
  const [busy, setBusy] = useState(true);
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState('');

  async function load() {
    setBusy(true); setErr('');
    try {
      const res = await api.get('/settings');
      const lp = res.data?.data?.loginPage || {};
      setForm({
        backgroundUrl: lp.backgroundUrl || '',
        heroText: lp.heroText || '',
        welcomeMessage: lp.welcomeMessage || '',
        slogan: lp.slogan || '',
        cardStyle: lp.cardStyle || 'SOLID',
      });
    } catch (e) {
      setErr(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }

  useEffect(() => { load(); }, []);

  async function save() {
    setSaving(true); setErr('');
    try {
      await api.patch('/settings', { loginPage: form, changeNote: 'Updated login customization' });
      toast.success('Login customization saved.');
    } catch (e) {
      setErr(errorMessage(e));
      toast.error(errorMessage(e));
    } finally {
      setSaving(false);
    }
  }

  if (busy) {
    return (
      <View style={styles.loadingContainer}>
        <Text style={styles.loadingText}>Loading login customization...</Text>
      </View>
    );
  }

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <View style={styles.header}>
        <View style={styles.headerTitleRow}>
          <Ionicons name="log-in" size={24} color={Colors.primary} style={{ marginRight: Spacing.sm }} />
          <Text style={styles.title}>Login Customization</Text>
        </View>
        <Text style={styles.subtitle}>Customize the title, welcome message, slogan, and card style. Visible immediately on the login page.</Text>
      </View>

      {err ? <Text style={styles.errorText}>{err}</Text> : null}

      {form && (
        <>
          <View style={styles.card}>
            <View style={styles.cardHeader}>
              <Ionicons name="image" size={16} color={Colors.textLight} style={{ marginRight: Spacing.sm }} />
              <Text style={styles.cardTitle}>Hero</Text>
            </View>
            <View style={styles.cardBody}>
              
              <Text style={styles.fieldLabel}>Hero text</Text>
              <TextInput
                style={styles.input}
                value={form.heroText}
                onChangeText={(val) => setForm(p => ({ ...p, heroText: val }))}
                placeholder="e.g., Manage your organization with confidence"
                editable={canWrite}
                maxLength={300}
              />
              <Text style={styles.hint}>Shown above the login form. Leave blank to hide.</Text>

              <Text style={[styles.fieldLabel, { marginTop: Spacing.sm }]}>Welcome message</Text>
              <TextInput
                style={styles.input}
                value={form.welcomeMessage}
                onChangeText={(val) => setForm(p => ({ ...p, welcomeMessage: val }))}
                placeholder="Sign in to continue"
                editable={canWrite}
                maxLength={200}
              />
              <Text style={styles.hint}>Greeting displayed above the credentials input.</Text>

              <Text style={[styles.fieldLabel, { marginTop: Spacing.sm }]}>Slogan / tagline</Text>
              <TextInput
                style={styles.input}
                value={form.slogan}
                onChangeText={(val) => setForm(p => ({ ...p, slogan: val }))}
                placeholder="Your organization's slogan"
                editable={canWrite}
                maxLength={200}
              />
              <Text style={styles.hint}>Secondary text displayed under the welcome message.</Text>

              <Text style={[styles.fieldLabel, { marginTop: Spacing.sm }]}>Background image URL (optional)</Text>
              <TextInput
                style={styles.input}
                value={form.backgroundUrl}
                onChangeText={(val) => setForm(p => ({ ...p, backgroundUrl: val }))}
                placeholder="https://..."
                editable={canWrite}
                maxLength={500}
                autoCapitalize="none"
              />
              <Text style={styles.hint}>Until the upload pipeline ships, paste a CDN URL here.</Text>

            </View>
          </View>

          <View style={styles.card}>
            <View style={styles.cardHeader}>
              <Ionicons name="options" size={16} color={Colors.textLight} style={{ marginRight: Spacing.sm }} />
              <Text style={styles.cardTitle}>Card style</Text>
            </View>
            <View style={styles.cardBody}>
              {CARD_STYLES.map((s, idx) => {
                const on = form.cardStyle === s.value;
                return (
                  <TouchableOpacity
                    key={s.value}
                    style={[
                      styles.radioCard,
                      on && styles.radioCardActive,
                      !canWrite && { opacity: 0.5 },
                      idx > 0 && { marginTop: Spacing.sm }
                    ]}
                    onPress={() => setForm(p => ({ ...p, cardStyle: s.value }))}
                    disabled={!canWrite}
                  >
                    <View style={[styles.radioDot, on && styles.radioDotActive]} />
                    <View style={styles.radioInfo}>
                      <Text style={[styles.radioLabel, on && styles.radioLabelActive]}>{s.label}</Text>
                      <Text style={styles.radioDesc}>{s.description}</Text>
                    </View>
                  </TouchableOpacity>
                );
              })}
            </View>
          </View>

          {canWrite && (
            <View style={styles.footer}>
              <TouchableOpacity style={styles.cancelBtn} onPress={() => router.push('/admin/settings')} disabled={saving}>
                <Text style={styles.cancelBtnText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[styles.saveBtn, saving && styles.saveBtnDisabled]} onPress={save} disabled={saving}>
                <Text style={styles.saveBtnText}>{saving ? 'Saving...' : 'Save changes'}</Text>
              </TouchableOpacity>
            </View>
          )}
        </>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },
  content: { padding: Spacing.md, paddingBottom: 60 },
  header: { marginBottom: Spacing.lg },
  headerTitleRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 4 },
  title: { fontSize: FontSize.xxl, fontWeight: '700', color: Colors.text },
  subtitle: { fontSize: FontSize.sm, color: Colors.textMuted },
  errorText: { color: Colors.error, marginBottom: Spacing.md },
  loadingContainer: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  loadingText: { color: Colors.textMuted, fontSize: FontSize.md },

  card: { backgroundColor: '#fff', borderRadius: Radius.md, borderWidth: 1, borderColor: Colors.border, marginBottom: Spacing.lg, overflow: 'hidden' },
  cardHeader: { flexDirection: 'row', alignItems: 'center', padding: Spacing.md, borderBottomWidth: 1, borderBottomColor: Colors.border, backgroundColor: '#f9fafb' },
  cardTitle: { fontSize: FontSize.md, fontWeight: '600', color: Colors.text, flex: 1 },
  cardBody: { padding: Spacing.md },

  fieldLabel: { fontSize: FontSize.sm, fontWeight: '600', color: Colors.text, marginBottom: 4 },
  input: { borderWidth: 1, borderColor: Colors.border, borderRadius: Radius.sm, padding: Spacing.sm, fontSize: FontSize.md, backgroundColor: '#fff' },
  hint: { fontSize: 11, color: Colors.textLight, marginTop: 4, marginBottom: Spacing.xs },

  radioCard: { flexDirection: 'row', alignItems: 'flex-start', padding: Spacing.md, borderWidth: 1, borderColor: Colors.border, borderRadius: Radius.sm },
  radioCardActive: { borderColor: Colors.primary, backgroundColor: `${Colors.primary}05` },
  radioDot: { width: 18, height: 18, borderRadius: 9, borderWidth: 2, borderColor: Colors.textLight, marginRight: Spacing.md, marginTop: 2 },
  radioDotActive: { borderColor: Colors.primary, backgroundColor: Colors.primary },
  radioInfo: { flex: 1 },
  radioLabel: { fontSize: FontSize.md, fontWeight: '600', color: Colors.text, marginBottom: 2 },
  radioLabelActive: { color: Colors.primary },
  radioDesc: { fontSize: FontSize.sm, color: Colors.textMuted },

  footer: { flexDirection: 'row', justifyContent: 'flex-end', marginTop: Spacing.sm, gap: Spacing.sm },
  cancelBtn: { paddingVertical: Spacing.sm, paddingHorizontal: Spacing.md, borderRadius: Radius.sm, borderWidth: 1, borderColor: Colors.border },
  cancelBtnText: { color: Colors.text, fontWeight: '600' },
  saveBtn: { backgroundColor: Colors.primary, paddingVertical: Spacing.sm, paddingHorizontal: Spacing.lg, borderRadius: Radius.sm },
  saveBtnDisabled: { opacity: 0.7 },
  saveBtnText: { color: '#fff', fontWeight: '600' },
});
