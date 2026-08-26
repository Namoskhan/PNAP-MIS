import React, { useEffect, useState } from 'react';
import { View, Text, ScrollView, TouchableOpacity, StyleSheet, Switch } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { api, errorMessage } from '../../../../src/api/client';
import { useAuth } from '../../../../src/context/AuthContext';
import { hasPermission } from '../../../../src/utils/permissions';
import { useToast } from '../../../../src/components/Toast';
import { Colors, FontSize, Radius, Spacing } from '../../../../src/constants/colors';

const TOGGLES = [
  { key: 'enableAnimations',
    label: 'Animations',
    description: 'Page transitions, modal slide-ins, hover effects, count-up tweens.' },
  { key: 'enableCountUpKpis',
    label: 'KPI count-up',
    description: 'Animated number counters on dashboards. Disable for instant rendering.' },
  { key: 'compactMode',
    label: 'Compact mode',
    description: 'Tighter padding + smaller row heights across tables and cards.' },
  { key: 'glassmorphism',
    label: 'Glassmorphism',
    description: 'Translucent cards with backdrop blur. Looks modern but heavier on low-end devices.' },
  { key: 'sidebarDefaultCollapsed',
    label: 'Sidebar collapsed by default',
    description: 'New sessions start with the sidebar collapsed. Per-user preference still wins.' },
];

const CHART_STYLES = [
  { value: 'MODERN',  label: 'Modern',  description: 'Soft gradients, rounded bars, generous spacing.' },
  { value: 'CLASSIC', label: 'Classic', description: 'Flat fills, sharper bars, denser layout.' },
];

export default function DashboardConfigScreen() {
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
      const d = res.data?.data?.dashboard || {};
      setForm({
        enableAnimations:        d.enableAnimations !== false,
        enableCountUpKpis:       d.enableCountUpKpis !== false,
        chartStyle:              d.chartStyle || 'MODERN',
        compactMode:             !!d.compactMode,
        glassmorphism:           !!d.glassmorphism,
        sidebarDefaultCollapsed: !!d.sidebarDefaultCollapsed,
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
      await api.patch('/settings', { dashboard: form, changeNote: 'Dashboard appearance updated' });
      toast.success('Dashboard preferences saved.');
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
        <Text style={styles.loadingText}>Loading preferences...</Text>
      </View>
    );
  }

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <View style={styles.header}>
        <View style={styles.headerTitleRow}>
          <Ionicons name="options" size={24} color={Colors.primary} style={{ marginRight: Spacing.sm }} />
          <Text style={styles.title}>UI Preferences</Text>
        </View>
        <Text style={styles.subtitle}>Dashboard-level toggles for animations, density, chart style, and glassmorphism. Settings persist + audit; component cutover lands incrementally.</Text>
      </View>

      {err ? <Text style={styles.errorText}>{err}</Text> : null}

      {form && (
        <>
          <View style={styles.card}>
            <View style={styles.cardHeader}>
              <Text style={styles.cardTitle}>Toggles</Text>
            </View>
            <View style={styles.cardBody}>
              {TOGGLES.map((t, idx) => (
                <View key={t.key} style={[styles.toggleRow, idx === TOGGLES.length - 1 && { borderBottomWidth: 0 }]}>
                  <View style={styles.toggleInfo}>
                    <Text style={styles.toggleLabel}>{t.label}</Text>
                    <Text style={styles.toggleDesc}>{t.description}</Text>
                  </View>
                  <Switch
                    value={form[t.key]}
                    onValueChange={(val) => setForm(p => ({ ...p, [t.key]: val }))}
                    disabled={!canWrite}
                    trackColor={{ false: Colors.border, true: Colors.primary }}
                  />
                </View>
              ))}
            </View>
          </View>

          <View style={styles.card}>
            <View style={styles.cardHeader}>
              <Text style={styles.cardTitle}>Chart style</Text>
            </View>
            <View style={styles.cardBody}>
              {CHART_STYLES.map((s, idx) => {
                const on = form.chartStyle === s.value;
                return (
                  <TouchableOpacity
                    key={s.value}
                    style={[
                      styles.radioCard,
                      on && styles.radioCardActive,
                      !canWrite && { opacity: 0.5 },
                      idx > 0 && { marginTop: Spacing.sm }
                    ]}
                    onPress={() => setForm(p => ({ ...p, chartStyle: s.value }))}
                    disabled={!canWrite}
                  >
                    <View style={[styles.radioDot, on && styles.radioDotActive]} />
                    <View style={styles.radioInfo}>
                      <Text style={[styles.radioLabel, on && styles.radioLabelActive]}>{s.label}</Text>
                      <Text style={styles.toggleDesc}>{s.description}</Text>
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
                <Text style={styles.saveBtnText}>{saving ? 'Saving...' : 'Save preferences'}</Text>
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
  cardHeader: { padding: Spacing.md, borderBottomWidth: 1, borderBottomColor: Colors.border, backgroundColor: '#f9fafb' },
  cardTitle: { fontSize: FontSize.md, fontWeight: '600', color: Colors.text },
  cardBody: { padding: 0 },

  toggleRow: { flexDirection: 'row', alignItems: 'center', padding: Spacing.md, borderBottomWidth: 1, borderBottomColor: Colors.borderLight },
  toggleInfo: { flex: 1, paddingRight: Spacing.md },
  toggleLabel: { fontSize: FontSize.md, fontWeight: '600', color: Colors.text, marginBottom: 2 },
  toggleDesc: { fontSize: FontSize.sm, color: Colors.textMuted },

  radioCard: { flexDirection: 'row', alignItems: 'flex-start', padding: Spacing.md, borderWidth: 1, borderColor: Colors.border, borderRadius: Radius.sm, marginHorizontal: Spacing.md, marginBottom: Spacing.md },
  radioCardActive: { borderColor: Colors.primary, backgroundColor: `${Colors.primary}05` },
  radioDot: { width: 18, height: 18, borderRadius: 9, borderWidth: 2, borderColor: Colors.textLight, marginRight: Spacing.md, marginTop: 2 },
  radioDotActive: { borderColor: Colors.primary, backgroundColor: Colors.primary },
  radioInfo: { flex: 1 },
  radioLabel: { fontSize: FontSize.md, fontWeight: '600', color: Colors.text, marginBottom: 2 },
  radioLabelActive: { color: Colors.primary },

  footer: { flexDirection: 'row', justifyContent: 'flex-end', marginTop: Spacing.sm, gap: Spacing.sm },
  cancelBtn: { paddingVertical: Spacing.sm, paddingHorizontal: Spacing.md, borderRadius: Radius.sm, borderWidth: 1, borderColor: Colors.border },
  cancelBtnText: { color: Colors.text, fontWeight: '600' },
  saveBtn: { backgroundColor: Colors.primary, paddingVertical: Spacing.sm, paddingHorizontal: Spacing.lg, borderRadius: Radius.sm },
  saveBtnDisabled: { opacity: 0.7 },
  saveBtnText: { color: '#fff', fontWeight: '600' },
});
