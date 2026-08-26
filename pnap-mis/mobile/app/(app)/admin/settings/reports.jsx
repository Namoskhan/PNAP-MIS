import React, { useEffect, useState } from 'react';
import { View, Text, ScrollView, TouchableOpacity, StyleSheet, Switch, TextInput, Image } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { api, errorMessage } from '../../../../src/api/client';
import { useAuth } from '../../../../src/context/AuthContext';
import { hasPermission } from '../../../../src/utils/permissions';
import { useToast } from '../../../../src/components/Toast';
import { Colors, FontSize, Radius, Spacing } from '../../../../src/constants/colors';

export default function ReportsBrandingScreen() {
  const router = useRouter();
  const { user } = useAuth();
  const toast = useToast();
  const canWrite = hasPermission(user, 'MANAGE_SYSTEM_BRANDING');

  const [form, setForm] = useState(null);
  const [printLogo, setPrintLogo] = useState(null);
  const [themePrimary, setThemePrimary] = useState('#1e40af');
  const [busy, setBusy] = useState(true);
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState('');

  async function load() {
    setBusy(true); setErr('');
    try {
      const res = await api.get('/settings');
      const s = res.data?.data || {};
      const rb = s.reportBranding || {};
      
      setForm({
        showLogoOnPdf: rb.showLogoOnPdf !== false,
        showLogoOnXlsx: rb.showLogoOnXlsx !== false,
        pdfFooterText: rb.pdfFooterText || '',
        pdfHeaderColor: rb.pdfHeaderColor || '',
      });
      setPrintLogo(s.logos?.print?.url || null);
      setThemePrimary(s.theme?.light?.primary || '#1e40af');
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
      await api.patch('/settings', {
        reportBranding: {
          showLogoOnPdf: !!form.showLogoOnPdf,
          showLogoOnXlsx: !!form.showLogoOnXlsx,
          pdfFooterText: form.pdfFooterText || '',
          pdfHeaderColor: form.pdfHeaderColor || '',
        },
        changeNote: 'Updated report branding',
      });
      toast.success('Report branding saved.');
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
        <Text style={styles.loadingText}>Loading report branding...</Text>
      </View>
    );
  }

  const effectiveHeaderColor = form?.pdfHeaderColor || themePrimary;

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <View style={styles.header}>
        <View style={styles.headerTitleRow}>
          <Ionicons name="document-text" size={24} color={Colors.primary} style={{ marginRight: Spacing.sm }} />
          <Text style={styles.title}>Exports & Reports</Text>
        </View>
        <Text style={styles.subtitle}>Header logo, footer text, and accent color for PDF / XLSX exports. Changes apply to the next export.</Text>
      </View>

      {err ? <Text style={styles.errorText}>{err}</Text> : null}

      {form && (
        <>
          <View style={styles.card}>
            <View style={styles.cardHeader}>
              <Ionicons name="image" size={16} color={Colors.textLight} style={{ marginRight: Spacing.sm }} />
              <Text style={styles.cardTitle}>Export logo</Text>
            </View>
            <View style={styles.cardBody}>
              <View style={styles.toggleRow}>
                <View style={styles.toggleInfo}>
                  <Text style={styles.toggleLabel}>Show logo on PDF exports</Text>
                </View>
                <Switch
                  value={form.showLogoOnPdf}
                  onValueChange={(val) => setForm(p => ({ ...p, showLogoOnPdf: val }))}
                  disabled={!canWrite}
                  trackColor={{ false: Colors.border, true: Colors.primary }}
                />
              </View>
              <View style={[styles.toggleRow, { borderBottomWidth: 0 }]}>
                <View style={styles.toggleInfo}>
                  <Text style={styles.toggleLabel}>Show logo on Excel exports</Text>
                </View>
                <Switch
                  value={form.showLogoOnXlsx}
                  onValueChange={(val) => setForm(p => ({ ...p, showLogoOnXlsx: val }))}
                  disabled={!canWrite}
                  trackColor={{ false: Colors.border, true: Colors.primary }}
                />
              </View>

              <View style={styles.logoPreviewContainer}>
                {printLogo ? (
                  <View style={styles.logoPreviewRow}>
                    <Image source={{ uri: printLogo }} style={styles.logoImage} resizeMode="contain" />
                    <Text style={styles.hint}>Current print logo. Replace it in the Logo Manager ("Print" slot).</Text>
                  </View>
                ) : (
                  <Text style={styles.hint}>No print logo uploaded yet — exports render text-only headers. Upload one in the Logo Manager ("Print" slot).</Text>
                )}
              </View>
            </View>
          </View>

          <View style={styles.card}>
            <View style={styles.cardHeader}>
              <Ionicons name="document" size={16} color={Colors.textLight} style={{ marginRight: Spacing.sm }} />
              <Text style={styles.cardTitle}>PDF header & footer</Text>
            </View>
            <View style={styles.cardBody}>
              <Text style={styles.fieldLabel}>Header accent color</Text>
              <View style={styles.colorInputRow}>
                <View style={[styles.colorSwatch, { backgroundColor: effectiveHeaderColor }]} />
                <TextInput
                  style={styles.input}
                  value={form.pdfHeaderColor}
                  onChangeText={(val) => setForm(p => ({ ...p, pdfHeaderColor: val.trim() }))}
                  placeholder={`Theme primary (${themePrimary})`}
                  editable={canWrite}
                  maxLength={7}
                  autoCapitalize="none"
                />
                {(form.pdfHeaderColor && canWrite) ? (
                  <TouchableOpacity style={styles.clearBtn} onPress={() => setForm(p => ({ ...p, pdfHeaderColor: '' }))}>
                    <Text style={styles.clearBtnText}>Clear</Text>
                  </TouchableOpacity>
                ) : null}
              </View>
              <Text style={styles.hint}>The separator bar under PDF headers. Leave empty to follow the theme's primary color.</Text>

              <Text style={[styles.fieldLabel, { marginTop: Spacing.md }]}>PDF footer text</Text>
              <TextInput
                style={styles.input}
                value={form.pdfFooterText}
                onChangeText={(val) => setForm(p => ({ ...p, pdfFooterText: val }))}
                placeholder="e.g. © PKNAP — internal use only"
                editable={canWrite}
                maxLength={300}
              />
              <Text style={styles.hint}>Shown at the bottom of every PDF page. Empty falls back to the copyright text from System Identity.</Text>

              {/* Live Preview */}
              <View style={styles.previewBox}>
                <View style={styles.previewHeaderRow}>
                  {form.showLogoOnPdf && printLogo && (
                    <Image source={{ uri: printLogo }} style={styles.previewLogo} resizeMode="contain" />
                  )}
                  <View style={styles.previewTitles}>
                    <Text style={styles.previewTitleText}>Organization Report Title</Text>
                    <Text style={styles.previewSubtitleText}>Period subtitle</Text>
                  </View>
                </View>
                <View style={[styles.previewSeparator, { backgroundColor: effectiveHeaderColor }]} />
                <Text style={styles.previewFooterText}>
                  {form.pdfFooterText || 'Footer falls back to copyright / footer text from System Identity'}
                </Text>
              </View>
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

  toggleRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: Spacing.md, borderBottomWidth: 1, borderBottomColor: Colors.borderLight },
  toggleInfo: { flex: 1, paddingRight: Spacing.md },
  toggleLabel: { fontSize: FontSize.md, fontWeight: '500', color: Colors.text },

  logoPreviewContainer: { marginTop: Spacing.md, paddingTop: Spacing.md, borderTopWidth: 1, borderTopColor: Colors.borderLight },
  logoPreviewRow: { flexDirection: 'row', alignItems: 'center' },
  logoImage: { width: 60, height: 48, borderRadius: 6, borderWidth: 1, borderColor: Colors.border, marginRight: Spacing.md },
  
  fieldLabel: { fontSize: FontSize.sm, fontWeight: '600', color: Colors.text, marginBottom: 4 },
  input: { flex: 1, borderWidth: 1, borderColor: Colors.border, borderRadius: Radius.sm, padding: Spacing.sm, fontSize: FontSize.md, backgroundColor: '#fff' },
  colorInputRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm },
  colorSwatch: { width: 34, height: 34, borderRadius: Radius.sm, borderWidth: 1, borderColor: Colors.border },
  clearBtn: { padding: Spacing.sm, backgroundColor: '#f1f5f9', borderRadius: Radius.sm },
  clearBtnText: { fontSize: FontSize.sm, color: Colors.text, fontWeight: '500' },
  hint: { fontSize: 11, color: Colors.textLight, marginTop: 4, flex: 1 },

  previewBox: { marginTop: Spacing.lg, borderWidth: 1, borderColor: Colors.border, borderRadius: Radius.sm, padding: Spacing.md, backgroundColor: '#fff' },
  previewHeaderRow: { flexDirection: 'row', alignItems: 'center' },
  previewLogo: { width: 40, height: 34, marginRight: Spacing.md },
  previewTitles: { flex: 1, alignItems: 'center' },
  previewTitleText: { fontWeight: '700', fontSize: 15, color: '#1a1a1a' },
  previewSubtitleText: { fontSize: 12, color: '#374151' },
  previewSeparator: { height: 2, marginTop: 10 },
  previewFooterText: { marginTop: 10, textAlign: 'center', fontSize: 10, color: '#9aa3af', fontStyle: 'italic' },

  footer: { flexDirection: 'row', justifyContent: 'flex-end', marginTop: Spacing.sm, gap: Spacing.sm },
  cancelBtn: { paddingVertical: Spacing.sm, paddingHorizontal: Spacing.md, borderRadius: Radius.sm, borderWidth: 1, borderColor: Colors.border },
  cancelBtnText: { color: Colors.text, fontWeight: '600' },
  saveBtn: { backgroundColor: Colors.primary, paddingVertical: Spacing.sm, paddingHorizontal: Spacing.lg, borderRadius: Radius.sm },
  saveBtnDisabled: { opacity: 0.7 },
  saveBtnText: { color: '#fff', fontWeight: '600' },
});
