import React, { useEffect, useMemo, useState } from 'react';
import { View, Text, ScrollView, TouchableOpacity, StyleSheet, TextInput, Alert, Platform } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { api, errorMessage } from '../../../../src/api/client';
import { useLanguage } from '../../../../src/context/LanguageContext';
import { useAuth } from '../../../../src/context/AuthContext';
import { hasPermission } from '../../../../src/utils/permissions';
import { useToast } from '../../../../src/components/Toast';
import { Colors, FontSize, Radius, Spacing } from '../../../../src/constants/colors';

const TOKEN_GROUPS = [
  { titleKey: 'admin.settings.groupBrand', title: 'Brand', tokens: [
    { key: 'primary',     labelKey: 'admin.settings.tokenPrimary',     label: 'Primary',     contrastWith: 'textInverse', contrastLabelKey: 'admin.settings.contrastButtonLabel', contrastLabel: 'button label' },
    { key: 'primaryDark', labelKey: 'admin.settings.tokenPrimaryDark', label: 'Primary dark' },
    { key: 'secondary',   labelKey: 'admin.settings.tokenSecondary',   label: 'Secondary' },
    { key: 'accent',      labelKey: 'admin.settings.tokenAccent',      label: 'Accent' },
  ]},
  { titleKey: 'admin.settings.groupSurfaces', title: 'Surfaces', tokens: [
    { key: 'background', labelKey: 'admin.settings.tokenBackground', label: 'Page background' },
    { key: 'surface',    labelKey: 'admin.settings.tokenSurface',    label: 'Card surface',       contrastWith: 'textPrimary', contrastLabelKey: 'admin.settings.contrastBodyText',    contrastLabel: 'body text' },
    { key: 'sidebarBg',  labelKey: 'admin.settings.tokenSidebarBg',  label: 'Sidebar background', contrastWith: 'sidebarFg',   contrastLabelKey: 'admin.settings.contrastSidebarText', contrastLabel: 'sidebar text' },
    { key: 'sidebarFg',  labelKey: 'admin.settings.tokenSidebarFg',  label: 'Sidebar text' },
    { key: 'navbarBg',   labelKey: 'admin.settings.tokenNavbarBg',   label: 'Top-bar background' },
  ]},
  { titleKey: 'admin.settings.groupText', title: 'Text', tokens: [
    { key: 'textPrimary', labelKey: 'admin.settings.tokenTextPrimary', label: 'Primary text', contrastWith: 'background', contrastLabelKey: 'admin.settings.contrastBodyOnBg',    contrastLabel: 'body on bg' },
    { key: 'textMuted',   labelKey: 'admin.settings.tokenTextMuted',   label: 'Muted text',   contrastWith: 'background', contrastLabelKey: 'admin.settings.contrastMutedOnBg',   contrastLabel: 'muted on bg', contrastTarget: 3 },
    { key: 'textInverse', labelKey: 'admin.settings.tokenTextInverse', label: 'Inverse text', contrastWith: 'primary',    contrastLabelKey: 'admin.settings.contrastButtonLabel', contrastLabel: 'button label' },
  ]},
  { titleKey: 'admin.settings.groupBorders', title: 'Borders', tokens: [
    { key: 'borderSoft',   labelKey: 'admin.settings.tokenBorderSoft',   label: 'Soft border' },
    { key: 'borderStrong', labelKey: 'admin.settings.tokenBorderStrong', label: 'Strong border' },
  ]},
  { titleKey: 'admin.settings.groupStatus', title: 'Status', tokens: [
    { key: 'success', labelKey: 'admin.settings.tokenSuccess', label: 'Success' },
    { key: 'warning', labelKey: 'admin.settings.tokenWarning', label: 'Warning' },
    { key: 'danger',  labelKey: 'admin.settings.tokenDanger',  label: 'Danger' },
    { key: 'info',    labelKey: 'admin.settings.tokenInfo',    label: 'Info' },
  ]},
  { titleKey: 'admin.settings.groupTiers', title: 'Tier badges', tokens: [
    { key: 'tierCentral',   labelKey: 'admin.settings.tokenTierCentral',   label: 'Central' },
    { key: 'tierProvince',  labelKey: 'admin.settings.tokenTierProvince',  label: 'Province' },
    { key: 'tierDistrict',  labelKey: 'admin.settings.tokenTierDistrict',  label: 'District' },
    { key: 'tierArea',      labelKey: 'admin.settings.tokenTierArea',      label: 'Area' },
    { key: 'tierBasicUnit', labelKey: 'admin.settings.tokenTierBasicUnit', label: 'Basic Unit' },
  ]},
];

const EMPTY_THEME = { activeMode: 'LIGHT', presetName: 'PKNAP_DEFAULT', light: {}, dark: {} };

function themeFromResponse(res) {
  return res?.settings?.theme || res?.theme || null;
}

export default function ThemeManagerScreen() {
  const { t, isRTL } = useLanguage();
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
      Alert.alert(
        t('admin.settings.themeSaved', 'Theme Saved'),
        t('admin.settings.restartAppPrompt', 'Please restart the app to see the updated theme colors.')
      );
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
      toast.success(t('admin.settings.presetApplied', { code, defaultValue: `Preset "${code}" applied.` }));
      setTimeout(triggerGlobalRefresh, 500);
    } catch (e) {
      const details = e?.response?.data?.error?.details;
      if (details?.errors) {
        setServerErrors(details.errors);
        toast.error(t('admin.settings.presetValidationFailed', { code, count: details.errors.length, defaultValue: `Preset "${code}" failed validation — ${details.errors.length} issue(s)` }));
      } else {
        toast.error(errorMessage(e));
      }
    } finally {
      setSaving(false);
    }
  }

  async function applyPresetByCode(code) {
    const msg = t('admin.settings.applyPresetConfirm', { code, defaultValue: `Apply preset "${code}"? This overwrites the current theme.` });
    if (Platform.OS === 'web') {
      if (window.confirm(msg)) {
        await executeApplyPreset(code);
      }
    } else {
      Alert.alert(
        t('admin.settings.presets', 'Presets'),
        msg,
        [
          { text: t('common.cancel', 'Cancel'), style: 'cancel' },
          { text: t('common.apply', 'Apply'), style: 'destructive', onPress: () => executeApplyPreset(code) }
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
      toast.success(t('admin.settings.themeSaved', 'Theme saved.'));
      setTimeout(triggerGlobalRefresh, 500);
    } catch (e) {
      const details = e?.response?.data?.error?.details;
      if (details?.errors) {
        setServerErrors(details.errors);
        toast.error(t('admin.settings.themeValidationFailed', { count: details.errors.length, defaultValue: `Theme failed validation — ${details.errors.length} issue(s)` }));
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
        <View style={[styles.hero, isRTL && { flexDirection: 'row-reverse' }]}>
          <View style={[styles.heroHeader, isRTL && { flexDirection: 'row-reverse' }]}>
            <View style={[styles.heroIconBg, isRTL ? { marginLeft: Spacing.md, marginRight: 0 } : { marginRight: Spacing.md }]}>
              <Ionicons name="color-palette" size={24} color={Colors.primary} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={[styles.heroTitle, isRTL && { textAlign: 'right' }]}>{t('admin.settings.themeManager', 'Theme Manager')}</Text>
              <Text style={[styles.heroSub, isRTL && { textAlign: 'right' }]}>{t('admin.settings.themeManagerSub', 'Edit color palettes for light + dark modes.')}</Text>
            </View>
          </View>
          <View style={[styles.heroActions, isRTL && { flexDirection: 'row-reverse' }]}>
            <TouchableOpacity style={[styles.btnOutline, isRTL && { flexDirection: 'row-reverse' }]} onPress={() => router.back()} disabled={busy}>
              <Ionicons name="arrow-back" size={16} color={Colors.text} style={isRTL ? { marginLeft: 6 } : { marginRight: 6 }} />
              <Text style={styles.btnOutlineText}>{t('common.back', 'Back')}</Text>
            </TouchableOpacity>
            <TouchableOpacity style={[styles.btnOutline, isRTL && { flexDirection: 'row-reverse' }]} onPress={load} disabled={busy}>
              <Ionicons name="refresh" size={16} color={Colors.text} style={isRTL ? { marginLeft: 6 } : { marginRight: 6 }} />
              <Text style={styles.btnOutlineText}>{t('common.refresh', 'Refresh')}</Text>
            </TouchableOpacity>
          </View>
        </View>

        {err ? <Text style={[styles.errorText, isRTL && { textAlign: 'right' }]}>{err}</Text> : null}
        
        {serverErrors.length > 0 && (
          <View style={[styles.errorText, { marginBottom: Spacing.md }]}>
            <Text style={[{ color: Colors.error, fontWeight: '700', marginBottom: 4 }, isRTL && { textAlign: 'right' }]}>{t('admin.settings.themeValidationFailed', 'Theme failed validation.')}</Text>
            {serverErrors.slice(0, 3).map((e, i) => (
              <Text key={i} style={[{ color: Colors.error, fontSize: FontSize.sm }, isRTL && { textAlign: 'right' }]}>• {e.path}: {e.message}</Text>
            ))}
            {serverErrors.length > 3 && <Text style={[{ color: Colors.error, fontSize: FontSize.sm }, isRTL && { textAlign: 'right' }]}>...and {serverErrors.length - 3} more</Text>}
          </View>
        )}

        {!busy && theme && (
          <>
            <View style={styles.card}>
              <View style={[styles.cardHeader, isRTL && { flexDirection: 'row-reverse' }]}>
                <Ionicons name="moon" size={16} color={Colors.textLight} style={isRTL ? { marginLeft: Spacing.sm } : { marginRight: Spacing.sm }} />
                <Text style={[styles.cardTitle, isRTL && { textAlign: 'right' }]}>{t('admin.settings.activeMode', 'Active Mode')}</Text>
              </View>
              <View style={styles.cardBody}>
                <View style={[styles.modeTabs, isRTL && { flexDirection: 'row-reverse' }]}>
                  {['LIGHT', 'DARK', 'AUTO'].map(m => {
                    const label = m === 'LIGHT' ? t('admin.settings.modeLightShort', 'LIGHT') : m === 'DARK' ? t('admin.settings.modeDarkShort', 'DARK') : t('admin.settings.modeAutoShort', 'AUTO');
                    return (
                      <TouchableOpacity 
                        key={m} 
                        style={[styles.modeTab, theme.activeMode === m && styles.modeTabActive, !canWrite && { opacity: 0.5 }]} 
                        onPress={() => setActiveMode(m)}
                        disabled={!canWrite}
                      >
                        <Text style={[styles.modeTabText, theme.activeMode === m && styles.modeTabTextActive]}>{label}</Text>
                      </TouchableOpacity>
                    );
                  })}
                </View>
              </View>
            </View>

            <View style={styles.card}>
              <View style={[styles.cardHeader, isRTL && { flexDirection: 'row-reverse' }]}>
                <Ionicons name="color-palette" size={16} color={Colors.textLight} style={isRTL ? { marginLeft: Spacing.sm } : { marginRight: Spacing.sm }} />
                <Text style={[styles.cardTitle, isRTL && { textAlign: 'right' }]}>{t('admin.settings.presets', 'Presets')}</Text>
                <View style={styles.badge}><Text style={styles.badgeText}>{theme.presetName}</Text></View>
              </View>
              <View style={styles.cardBody}>
                <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={[{ gap: Spacing.md }, isRTL && { flexDirection: 'row-reverse' }]}>
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
                  {presets.length === 0 && <Text style={[{ color: Colors.textMuted, fontSize: FontSize.sm }, isRTL && { textAlign: 'right' }]}>{t('admin.settings.noPresets', 'No presets available.')}</Text>}
                </ScrollView>
              </View>
            </View>

            <View style={[styles.sectionHeader, isRTL && { flexDirection: 'row-reverse' }]}>
              <Text style={[styles.sectionTitle, isRTL && { textAlign: 'right' }]}>{t('admin.settings.editingPalette', 'Editing Palette')}</Text>
              <View style={[styles.paletteToggle, isRTL && { flexDirection: 'row-reverse' }]}>
                <TouchableOpacity 
                  style={[styles.paletteBtn, editingMode === 'LIGHT' && styles.paletteBtnActive]} 
                  onPress={() => setEditingMode('LIGHT')}
                >
                  <Text style={[styles.paletteBtnText, editingMode === 'LIGHT' && styles.paletteBtnTextActive]}>{t('admin.settings.modeLightShort', 'LIGHT')}</Text>
                </TouchableOpacity>
                <TouchableOpacity 
                  style={[styles.paletteBtn, editingMode === 'DARK' && styles.paletteBtnActive]} 
                  onPress={() => setEditingMode('DARK')}
                >
                  <Text style={[styles.paletteBtnText, editingMode === 'DARK' && styles.paletteBtnTextActive]}>{t('admin.settings.modeDarkShort', 'DARK')}</Text>
                </TouchableOpacity>
              </View>
            </View>

            {TOKEN_GROUPS.map(group => (
              <View key={group.title} style={styles.card}>
                <View style={[styles.cardHeader, isRTL && { flexDirection: 'row-reverse' }]}>
                  <Text style={[styles.cardTitle, isRTL && { textAlign: 'right' }]}>{t(group.titleKey, group.title)}</Text>
                </View>
                <View style={styles.cardBody}>
                  {group.tokens.map(token => {
                    const errKey = `${editingMode}::${token.key}`;
                    const tokenErrors = errorsByToken[errKey] || [];
                    const val = editingPalette[token.key] || '';
                    return (
                      <View key={token.key} style={[styles.tokenRow, isRTL && { flexDirection: 'row-reverse' }]}>
                        <View style={[styles.tokenLabelCol, isRTL ? { paddingLeft: Spacing.sm, paddingRight: 0 } : { paddingRight: Spacing.sm }]}>
                          <Text style={[styles.tokenLabel, isRTL && { textAlign: 'right' }]}>{t(token.labelKey, token.label)}</Text>
                          <Text style={[styles.tokenCode, isRTL && { textAlign: 'right' }]}>{token.key}</Text>
                        </View>
                        <View style={styles.tokenInputCol}>
                          <View style={[styles.colorInputWrapper, isRTL && { flexDirection: 'row-reverse' }]}>
                            <View style={[styles.colorSwatch, isRTL ? { borderLeftWidth: 1, borderLeftColor: Colors.border, borderRightWidth: 0 } : { borderRightWidth: 1, borderRightColor: Colors.border }, { backgroundColor: val || '#00000000' }]} />
                            <TextInput
                              style={[styles.colorInput, !canWrite && { color: Colors.textMuted }, isRTL && { textAlign: 'right' }]}
                              value={val}
                              onChangeText={v => setToken(token.key, v)}
                              placeholder="#000000"
                              editable={canWrite}
                              autoCapitalize="none"
                            />
                          </View>
                          {tokenErrors.length > 0 && (
                            <View style={{ marginTop: 4 }}>
                              {tokenErrors.map((m, i) => (
                                <Text key={i} style={[styles.tokenError, isRTL && { textAlign: 'right' }]}>⚠ {m}</Text>
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
        <View style={[styles.footer, isRTL && { flexDirection: 'row-reverse' }]}>
          <Text style={styles.dirtyText}>{dirty ? t('admin.settings.unsavedChanges', 'Unsaved changes') : t('admin.settings.allChangesSaved', 'All changes saved')}</Text>
          <TouchableOpacity style={[styles.saveBtn, (!dirty || saving) && { opacity: 0.5 }]} onPress={save} disabled={!dirty || saving}>
            <Text style={styles.saveBtnText}>{saving ? t('admin.settings.saving', 'Saving...') : t('admin.settings.saveTheme', 'Save Theme')}</Text>
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
  modeTabActive: {
    backgroundColor: '#fff',
    ...Platform.select({
      web: {
        boxShadow: '0 1px 2px rgba(0, 0, 0, 0.1)',
      },
      default: {
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 1 },
        shadowOpacity: 0.1,
        shadowRadius: 2,
        elevation: 1,
      },
    }),
  },
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

  footer: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    padding: Spacing.md,
    backgroundColor: '#fff',
    borderTopWidth: 1,
    borderTopColor: Colors.border,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    ...Platform.select({
      web: {
        boxShadow: '0 -2px 8px rgba(0, 0, 0, 0.05)',
      },
      default: {
        shadowColor: '#000',
        shadowOffset: { width: 0, height: -2 },
        shadowOpacity: 0.05,
        shadowRadius: 8,
        elevation: 10,
      },
    }),
  },
  dirtyText: { fontSize: FontSize.sm, color: Colors.textMuted, fontWeight: '500' },
  saveBtn: { backgroundColor: Colors.primary, paddingHorizontal: Spacing.lg, paddingVertical: 10, borderRadius: Radius.sm },
  saveBtnText: { color: '#fff', fontSize: FontSize.sm, fontWeight: '600' },
});
