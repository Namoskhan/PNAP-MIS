import React, { useEffect, useMemo, useState } from 'react';
import { View, Text, ScrollView, TouchableOpacity, StyleSheet, TextInput, Alert, Platform } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { api, errorMessage } from '../../../../src/api/client';
import { useAuth } from '../../../../src/context/AuthContext';
import { hasPermission } from '../../../../src/utils/permissions';
import { useToast } from '../../../../src/components/Toast';
import { Colors, FontSize, Radius, Spacing } from '../../../../src/constants/colors';

const TOKEN_GROUPS = [
  { title: 'Brand', tokens: [
    { key: 'primary',     label: 'Primary',     contrastWith: 'textInverse', contrastLabel: 'button label' },
    { key: 'primaryDark', label: 'Primary dark' },
    { key: 'secondary',   label: 'Secondary' },
    { key: 'accent',      label: 'Accent' },
  ]},
  { title: 'Surfaces', tokens: [
    { key: 'background', label: 'Page background' },
    { key: 'surface',    label: 'Card surface',     contrastWith: 'textPrimary', contrastLabel: 'body text' },
    { key: 'sidebarBg',  label: 'Sidebar background', contrastWith: 'sidebarFg', contrastLabel: 'sidebar text' },
    { key: 'sidebarFg',  label: 'Sidebar text' },
    { key: 'navbarBg',   label: 'Top-bar background' },
  ]},
  { title: 'Text', tokens: [
    { key: 'textPrimary', label: 'Primary text', contrastWith: 'background', contrastLabel: 'body on bg' },
    { key: 'textMuted',   label: 'Muted text',   contrastWith: 'background', contrastLabel: 'muted on bg', contrastTarget: 3 },
    { key: 'textInverse', label: 'Inverse text', contrastWith: 'primary',    contrastLabel: 'button label' },
  ]},
  { title: 'Borders', tokens: [
    { key: 'borderSoft',   label: 'Soft border' },
    { key: 'borderStrong', label: 'Strong border' },
  ]},
  { title: 'Status', tokens: [
    { key: 'success', label: 'Success' },
    { key: 'warning', label: 'Warning' },
    { key: 'danger',  label: 'Danger' },
    { key: 'info',    label: 'Info' },
  ]},
  { title: 'Tier badges', tokens: [
    { key: 'tierCentral',   label: 'Central' },
    { key: 'tierProvince',  label: 'Province' },
    { key: 'tierDistrict',  label: 'District' },
    { key: 'tierArea',      label: 'Area' },
    { key: 'tierBasicUnit', label: 'Basic Unit' },
  ]},
];

const EMPTY_THEME = { activeMode: 'LIGHT', presetName: 'PKNAP_DEFAULT', light: {}, dark: {} };

function themeFromResponse(res) {
  return res?.settings?.theme || res?.theme || null;
}

export default function ThemeManagerScreen() {
  const router = useRouter();
  const { user } = useAuth();
  const toast = useToast();
  const canWrite = hasPermission(user, 'MANAGE_SYSTEM_BRANDING');

  const [theme, setTheme] = useState(null);
  const [savedTheme, setSavedTheme] = useState(null);
  const [presets, setPresets] = useState([]);
  const [editingMode, setEditingMode] = useState('LIGHT');
  const [busy, setBusy] = useState(true);
  const [saving, setSaving] = useState(false);
  const [serverErrors, setServerErrors] = useState([]);
  const [err, setErr] = useState('');

  async function load() {
    setBusy(true); setErr(''); setServerErrors([]);
    try {
      const [res, pRes] = await Promise.all([
        api.get('/settings'),
        api.get('/settings/theme/presets')
      ]);
      const t = res.data?.data?.theme || EMPTY_THEME;
      setTheme(t);
      setSavedTheme(t);
      setPresets(pRes.data?.data || []);
    } catch (e) {
      setErr(errorMessage(e));
      setTheme(prev => prev || EMPTY_THEME);
    } finally {
      setBusy(false);
    }
  }
  useEffect(() => { load(); }, []);

  const dirty = useMemo(() => {
    return Boolean(theme && savedTheme) && JSON.stringify(theme) !== JSON.stringify(savedTheme);
  }, [theme, savedTheme]);

  const errorsByToken = useMemo(() => {
    const out = {};
    for (const e of serverErrors) {
      const m = String(e.path || '').match(/^(light|dark)\.([a-zA-Z]+)/);
      if (!m) continue;
      const mode = m[1].toUpperCase();
      const token = m[2];
      const key = `${mode}::${token}`;
      (out[key] = out[key] || []).push(e.message);
    }
    return out;
  }, [serverErrors]);

  function setToken(key, value) {
    setTheme((prev) => {
      const slot = editingMode === 'DARK' ? 'dark' : 'light';
      return {
        ...prev,
        presetName: 'CUSTOM',
        [slot]: { ...prev[slot], [key]: value },
      };
    });
  }

  function setActiveMode(mode) {
    setTheme(prev => ({ ...prev, activeMode: mode }));
  }

  function triggerGlobalRefresh() {
    if (Platform.OS === 'web') {
      window.location.reload();
    } else {
      Alert.alert('Theme Saved', 'Please restart the app to see the updated theme colors.');
    }
  }

  async function executeApplyPreset(code) {
    setSaving(true); setServerErrors([]);
    try {
      const updated = await api.post(`/settings/theme/apply-preset/${code}`).then(r => r.data?.data);
      const nextTheme = themeFromResponse(updated);
      if (nextTheme) {
        setTheme(nextTheme);
        setSavedTheme(nextTheme);
      }
      toast.success(`Preset "${code}" applied.`);
      setTimeout(triggerGlobalRefresh, 500);
    } catch (e) {
      const details = e?.response?.data?.error?.details;
      if (details?.errors) {
        setServerErrors(details.errors);
        toast.error(`Preset "${code}" failed validation — ${details.errors.length} issue(s)`);
      } else {
        toast.error(errorMessage(e));
      }
    } finally {
      setSaving(false);
    }
  }

  async function applyPresetByCode(code) {
    const msg = `Apply preset "${code}"? This overwrites the current theme.`;
    if (Platform.OS === 'web') {
      if (window.confirm(msg)) {
        await executeApplyPreset(code);
      }
    } else {
      Alert.alert(
        'Apply Preset',
        msg,
        [
          { text: 'Cancel', style: 'cancel' },
          { text: 'Apply', style: 'destructive', onPress: () => executeApplyPreset(code) }
        ]
      );
    }
  }

  async function save() {
    setSaving(true); setErr(''); setServerErrors([]);
    try {
      const updated = await api.patch('/settings', {
        theme: {
          activeMode: theme.activeMode,
          presetName: theme.presetName,
          light: theme.light,
          dark: theme.dark,
        },
        changeNote: 'Theme updated from mobile app',
      }).then(r => r.data?.data);

      const nextTheme = themeFromResponse(updated);
      if (nextTheme) {
        setTheme(nextTheme);
        setSavedTheme(nextTheme);
      }
      toast.success('Theme saved.');
      setTimeout(triggerGlobalRefresh, 500);
    } catch (e) {
      const details = e?.response?.data?.error?.details;
      if (details?.errors) {
        setServerErrors(details.errors);
        toast.error(`Theme failed validation — ${details.errors.length} issue(s)`);
      } else {
        setErr(errorMessage(e));
        toast.error(errorMessage(e));
      }
    } finally {
      setSaving(false);
    }
  }

  const editingPalette = editingMode === 'DARK' ? (theme?.dark || {}) : (theme?.light || {});

  return (
    <View style={styles.container}>
      <ScrollView contentContainerStyle={styles.content}>
        <View style={styles.hero}>
          <View style={styles.heroHeader}>
            <View style={styles.heroIconBg}>
              <Ionicons name="color-palette" size={24} color={Colors.primary} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.heroTitle}>Theme Manager</Text>
              <Text style={styles.heroSub}>Edit color palettes for light + dark modes.</Text>
            </View>
          </View>
          <View style={styles.heroActions}>
            <TouchableOpacity style={styles.btnOutline} onPress={() => router.back()} disabled={busy}>
              <Ionicons name="arrow-back" size={16} color={Colors.text} style={{ marginRight: 6 }} />
              <Text style={styles.btnOutlineText}>Back</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.btnOutline} onPress={load} disabled={busy}>
              <Ionicons name="refresh" size={16} color={Colors.text} style={{ marginRight: 6 }} />
              <Text style={styles.btnOutlineText}>Refresh</Text>
            </TouchableOpacity>
          </View>
        </View>

        {err ? <Text style={styles.errorText}>{err}</Text> : null}
        
        {serverErrors.length > 0 && (
          <View style={[styles.errorText, { marginBottom: Spacing.md }]}>
            <Text style={{ color: Colors.error, fontWeight: '700', marginBottom: 4 }}>Theme failed validation.</Text>
            {serverErrors.slice(0, 3).map((e, i) => (
              <Text key={i} style={{ color: Colors.error, fontSize: FontSize.sm }}>• {e.path}: {e.message}</Text>
            ))}
            {serverErrors.length > 3 && <Text style={{ color: Colors.error, fontSize: FontSize.sm }}>...and {serverErrors.length - 3} more</Text>}
          </View>
        )}

        {!busy && theme && (
          <>
            <View style={styles.card}>
              <View style={styles.cardHeader}>
                <Ionicons name="moon" size={16} color={Colors.textLight} style={{ marginRight: Spacing.sm }} />
                <Text style={styles.cardTitle}>Active Mode</Text>
              </View>
              <View style={styles.cardBody}>
                <View style={styles.modeTabs}>
                  {['LIGHT', 'DARK', 'AUTO'].map(m => (
                    <TouchableOpacity 
                      key={m} 
                      style={[styles.modeTab, theme.activeMode === m && styles.modeTabActive, !canWrite && { opacity: 0.5 }]} 
                      onPress={() => setActiveMode(m)}
                      disabled={!canWrite}
                    >
                      <Text style={[styles.modeTabText, theme.activeMode === m && styles.modeTabTextActive]}>{m}</Text>
                    </TouchableOpacity>
                  ))}
                </View>
              </View>
            </View>

            <View style={styles.card}>
              <View style={styles.cardHeader}>
                <Ionicons name="color-palette" size={16} color={Colors.textLight} style={{ marginRight: Spacing.sm }} />
                <Text style={styles.cardTitle}>Presets</Text>
                <View style={styles.badge}><Text style={styles.badgeText}>{theme.presetName}</Text></View>
              </View>
              <View style={styles.cardBody}>
                <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: Spacing.md }}>
                  {presets.map((p) => (
                    <TouchableOpacity
                      key={p.code}
                      style={[styles.presetCard, theme.presetName === p.code && styles.presetCardActive, !canWrite && { opacity: 0.5 }]}
                      onPress={() => applyPresetByCode(p.code)}
                      disabled={!canWrite || saving}
                    >
                      <View style={[styles.presetPreview, { backgroundColor: p.light?.primary || Colors.primary }]} />
                      <Text style={styles.presetTitle}>{p.name}</Text>
                    </TouchableOpacity>
                  ))}
                  {presets.length === 0 && <Text style={{ color: Colors.textMuted, fontSize: FontSize.sm }}>No presets available.</Text>}
                </ScrollView>
              </View>
            </View>

            <View style={styles.sectionHeader}>
              <Text style={styles.sectionTitle}>Editing Palette</Text>
              <View style={styles.paletteToggle}>
                <TouchableOpacity 
                  style={[styles.paletteBtn, editingMode === 'LIGHT' && styles.paletteBtnActive]} 
                  onPress={() => setEditingMode('LIGHT')}
                >
                  <Text style={[styles.paletteBtnText, editingMode === 'LIGHT' && styles.paletteBtnTextActive]}>LIGHT</Text>
                </TouchableOpacity>
                <TouchableOpacity 
                  style={[styles.paletteBtn, editingMode === 'DARK' && styles.paletteBtnActive]} 
                  onPress={() => setEditingMode('DARK')}
                >
                  <Text style={[styles.paletteBtnText, editingMode === 'DARK' && styles.paletteBtnTextActive]}>DARK</Text>
                </TouchableOpacity>
              </View>
            </View>

            {TOKEN_GROUPS.map(group => (
              <View key={group.title} style={styles.card}>
                <View style={styles.cardHeader}>
                  <Text style={styles.cardTitle}>{group.title}</Text>
                </View>
                <View style={styles.cardBody}>
                  {group.tokens.map(t => {
                    const errKey = `${editingMode}::${t.key}`;
                    const tokenErrors = errorsByToken[errKey] || [];
                    const val = editingPalette[t.key] || '';
                    return (
                      <View key={t.key} style={styles.tokenRow}>
                        <View style={styles.tokenLabelCol}>
                          <Text style={styles.tokenLabel}>{t.label}</Text>
                          <Text style={styles.tokenCode}>{t.key}</Text>
                        </View>
                        <View style={styles.tokenInputCol}>
                          <View style={styles.colorInputWrapper}>
                            <View style={[styles.colorSwatch, { backgroundColor: val || '#00000000' }]} />
                            <TextInput
                              style={[styles.colorInput, !canWrite && { color: Colors.textMuted }]}
                              value={val}
                              onChangeText={v => setToken(t.key, v)}
                              placeholder="#000000"
                              editable={canWrite}
                              autoCapitalize="none"
                            />
                          </View>
                          {tokenErrors.length > 0 && (
                            <View style={{ marginTop: 4 }}>
                              {tokenErrors.map((m, i) => (
                                <Text key={i} style={styles.tokenError}>⚠ {m}</Text>
                              ))}
                            </View>
                          )}
                        </View>
                      </View>
                    );
                  })}
                </View>
              </View>
            ))}
          </>
        )}
        <View style={{ height: 100 }} />
      </ScrollView>
      
      {canWrite && (
        <View style={styles.footer}>
          <Text style={styles.dirtyText}>{dirty ? 'Unsaved changes' : 'All changes saved'}</Text>
          <TouchableOpacity style={[styles.saveBtn, (!dirty || saving) && { opacity: 0.5 }]} onPress={save} disabled={!dirty || saving}>
            <Text style={styles.saveBtnText}>{saving ? 'Saving...' : 'Save Theme'}</Text>
          </TouchableOpacity>
        </View>
      )}
    </View>
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
  errorText: { color: Colors.error, backgroundColor: '#fee2e2', padding: Spacing.md, borderRadius: Radius.sm, marginBottom: Spacing.md, overflow: 'hidden' },

  card: { backgroundColor: '#fff', borderRadius: Radius.md, borderWidth: 1, borderColor: Colors.border, marginBottom: Spacing.lg, overflow: 'hidden' },
  cardHeader: { flexDirection: 'row', alignItems: 'center', padding: Spacing.md, borderBottomWidth: 1, borderBottomColor: Colors.border, backgroundColor: '#f9fafb' },
  cardTitle: { fontSize: FontSize.md, fontWeight: '600', color: Colors.text, flex: 1 },
  badge: { backgroundColor: `${Colors.primary}15`, paddingHorizontal: 8, paddingVertical: 2, borderRadius: 12 },
  badgeText: { fontSize: FontSize.xs, fontWeight: '600', color: Colors.primary },
  cardBody: { padding: Spacing.md },

  modeTabs: { flexDirection: 'row', gap: Spacing.sm, backgroundColor: '#f1f5f9', padding: 4, borderRadius: Radius.sm },
  modeTab: { flex: 1, alignItems: 'center', paddingVertical: 8, borderRadius: Radius.sm },
  modeTabActive: { backgroundColor: '#fff', shadowColor: '#000', shadowOffset: {width:0, height:1}, shadowOpacity: 0.1, shadowRadius: 2, elevation: 1 },
  modeTabText: { fontSize: FontSize.sm, color: Colors.textMuted, fontWeight: '600' },
  modeTabTextActive: { color: Colors.primary },

  presetCard: { borderWidth: 1, borderColor: Colors.border, borderRadius: Radius.sm, padding: Spacing.sm, width: 120, alignItems: 'center', backgroundColor: '#fff' },
  presetCardActive: { borderColor: Colors.primary, backgroundColor: `${Colors.primary}05` },
  presetPreview: { width: 40, height: 40, borderRadius: 20, marginBottom: Spacing.sm },
  presetTitle: { fontSize: FontSize.sm, color: Colors.text, fontWeight: '600', textAlign: 'center' },

  sectionHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: Spacing.sm, marginTop: Spacing.sm },
  sectionTitle: { fontSize: FontSize.lg, fontWeight: '700', color: Colors.text },
  paletteToggle: { flexDirection: 'row', gap: 4 },
  paletteBtn: { paddingHorizontal: 12, paddingVertical: 6, borderRadius: Radius.sm, borderWidth: 1, borderColor: Colors.border },
  paletteBtnActive: { borderColor: Colors.primary, backgroundColor: `${Colors.primary}10` },
  paletteBtnText: { fontSize: FontSize.xs, fontWeight: '600', color: Colors.textMuted },
  paletteBtnTextActive: { color: Colors.primary },

  tokenRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: Spacing.sm, borderBottomWidth: 1, borderBottomColor: Colors.borderLight },
  tokenLabelCol: { flex: 1, paddingRight: Spacing.sm },
  tokenLabel: { fontSize: FontSize.sm, color: Colors.text, fontWeight: '500' },
  tokenCode: { fontSize: FontSize.xs, color: Colors.textMuted, fontFamily: 'monospace' },
  tokenInputCol: { width: 140 },
  colorInputWrapper: { flexDirection: 'row', alignItems: 'center', borderWidth: 1, borderColor: Colors.border, borderRadius: Radius.sm, overflow: 'hidden' },
  colorSwatch: { width: 28, height: 28, borderRightWidth: 1, borderRightColor: Colors.border },
  colorInput: { flex: 1, paddingHorizontal: 8, paddingVertical: 6, fontSize: FontSize.sm, fontFamily: 'monospace', color: Colors.text },
  tokenError: { fontSize: FontSize.xs, color: Colors.error },

  footer: { position: 'absolute', bottom: 0, left: 0, right: 0, padding: Spacing.md, backgroundColor: '#fff', borderTopWidth: 1, borderTopColor: Colors.border, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', shadowColor: '#000', shadowOffset: {width:0, height:-2}, shadowOpacity: 0.05, shadowRadius: 8, elevation: 10 },
  dirtyText: { fontSize: FontSize.sm, color: Colors.textMuted, fontWeight: '500' },
  saveBtn: { backgroundColor: Colors.primary, paddingHorizontal: Spacing.lg, paddingVertical: 10, borderRadius: Radius.sm },
  saveBtnText: { color: '#fff', fontSize: FontSize.sm, fontWeight: '600' },
});
