import React, { useEffect, useState } from 'react';
import { View, Text, ScrollView, TouchableOpacity, StyleSheet, TextInput } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { api, errorMessage } from '../../../../src/api/client';
import { useLanguage } from '../../../../src/context/LanguageContext';
import { useAuth } from '../../../../src/context/AuthContext';
import { hasPermission } from '../../../../src/utils/permissions';
import { useToast } from '../../../../src/components/Toast';
import { Colors, FontSize, Radius, Spacing } from '../../../../src/constants/colors';

const CARD_STYLES = [
  { value: 'SOLID', label: 'SOLID', description: 'Opaque card with sharp edges' },
  { value: 'GLASS', label: 'GLASS', description: 'Translucent card with backdrop blur' },
];

export default function LoginCustomizationScreen() {
  const { t, isRTL } = useLanguage();
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
      toast.success(t('admin.settings.loginSaved', 'Login customization saved.'));
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
        <Text style={styles.loadingText}>{t('common.loading', 'Loading login customization...')}</Text>
      </View>
    );
  }

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <View style={[styles.hero, isRTL && { flexDirection: 'row-reverse' }]}>
        <View style={[styles.heroHeader, isRTL && { flexDirection: 'row-reverse' }]}>
          <View style={[styles.heroIconBg, isRTL ? { marginLeft: Spacing.md, marginRight: 0 } : { marginRight: Spacing.md }]}>
            <Ionicons name="log-in" size={24} color={Colors.primary} />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={[styles.heroTitle, isRTL && { textAlign: 'right' }]}>{t('admin.settings.loginCustomization', 'Login Customization')}</Text>
            <Text style={[styles.heroSub, isRTL && { textAlign: 'right' }]}>
              {t('admin.settings.loginCustomizationSub', 'Customize the title, welcome message, slogan, and card style. Visible immediately on the login page.')}
            </Text>
          </View>
        </View>
        <View style={[styles.heroActions, isRTL && { flexDirection: 'row-reverse' }]}>
          <TouchableOpacity style={[styles.btnOutline, isRTL && { flexDirection: 'row-reverse' }]} onPress={() => router.back()} disabled={saving}>
            <Ionicons name={isRTL ? "arrow-forward" : "arrow-back"} size={16} color={Colors.text} style={isRTL ? { marginLeft: 6 } : { marginRight: 6 }} />
            <Text style={styles.btnOutlineText}>{t('admin.settings.backToSettings', 'Back')}</Text>
          </TouchableOpacity>
          <TouchableOpacity style={[styles.btnOutline, isRTL && { flexDirection: 'row-reverse' }]} onPress={load} disabled={saving}>
            <Ionicons name="refresh" size={16} color={Colors.text} style={isRTL ? { marginLeft: 6 } : { marginRight: 6 }} />
            <Text style={styles.btnOutlineText}>{t('common.refresh', 'Refresh')}</Text>
          </TouchableOpacity>
        </View>
      </View>

      {err ? <Text style={styles.errorText}>{err}</Text> : null}

      {form && (
        <>
          <View style={styles.card}>
            <View style={[styles.cardHeader, isRTL && { flexDirection: 'row-reverse' }]}>
              <Ionicons name="image-outline" size={18} color={Colors.textLight} style={isRTL ? { marginLeft: Spacing.sm } : { marginRight: Spacing.sm }} />
              <Text style={[styles.cardTitle, isRTL && { textAlign: 'right' }]}>{t('admin.settings.hero', 'Hero')}</Text>
            </View>
            <View style={styles.cardBody}>
              
              <Text style={[styles.fieldLabel, isRTL && { textAlign: 'right' }]}>{t('admin.settings.heroText', 'Hero text')}</Text>
              <TextInput
                style={[styles.input, isRTL && { textAlign: 'right' }]}
                value={form.heroText}
                onChangeText={(val) => setForm(p => ({ ...p, heroText: val }))}
                placeholder={t('admin.settings.heroTextPlaceholder', 'e.g., Manage your organization with confidence')}
                editable={canWrite}
                maxLength={300}
              />
              <Text style={[styles.hint, isRTL && { textAlign: 'right' }]}>{t('admin.settings.heroTextHelp', 'Shown above the login form. Leave blank to hide.')}</Text>

              <Text style={[styles.fieldLabel, { marginTop: Spacing.md }, isRTL && { textAlign: 'right' }]}>{t('admin.settings.welcomeMessage', 'Welcome message')}</Text>
              <TextInput
                style={[styles.input, isRTL && { textAlign: 'right' }]}
                value={form.welcomeMessage}
                onChangeText={(val) => setForm(p => ({ ...p, welcomeMessage: val }))}
                placeholder={t('admin.settings.welcomeMessagePlaceholder', 'Sign in to continue')}
                editable={canWrite}
                maxLength={200}
              />
              <Text style={[styles.hint, isRTL && { textAlign: 'right' }]}>{t('admin.settings.welcomeMessage', 'Welcome message')}</Text>

              <Text style={[styles.fieldLabel, { marginTop: Spacing.md }, isRTL && { textAlign: 'right' }]}>{t('admin.settings.slogan', 'Slogan / tagline')}</Text>
              <TextInput
                style={[styles.input, isRTL && { textAlign: 'right' }]}
                value={form.slogan}
                onChangeText={(val) => setForm(p => ({ ...p, slogan: val }))}
                placeholder={t('admin.settings.sloganPlaceholder', "Your organization's slogan")}
                editable={canWrite}
                maxLength={200}
              />
              <Text style={[styles.hint, isRTL && { textAlign: 'right' }]}>{t('admin.settings.slogan', 'Slogan / tagline')}</Text>

              <Text style={[styles.fieldLabel, { marginTop: Spacing.md }, isRTL && { textAlign: 'right' }]}>{t('admin.settings.backgroundUrl', 'Background image URL (optional)')}</Text>
              <TextInput
                style={[styles.input, isRTL && { textAlign: 'right' }]}
                value={form.backgroundUrl}
                onChangeText={(val) => setForm(p => ({ ...p, backgroundUrl: val }))}
                placeholder={t('admin.settings.backgroundUrlPlaceholder', 'https://...')}
                editable={canWrite}
                maxLength={500}
                autoCapitalize="none"
              />
              <Text style={[styles.hint, isRTL && { textAlign: 'right' }]}>{t('admin.settings.backgroundUrlHelp', 'Until the upload pipeline ships, paste a CDN URL here.')}</Text>

            </View>
          </View>

          <View style={styles.card}>
            <View style={[styles.cardHeader, isRTL && { flexDirection: 'row-reverse' }]}>
              <Ionicons name="options-outline" size={18} color={Colors.textLight} style={isRTL ? { marginLeft: Spacing.sm } : { marginRight: Spacing.sm }} />
              <Text style={[styles.cardTitle, isRTL && { textAlign: 'right' }]}>{t('admin.settings.cardStyle', 'Card style')}</Text>
            </View>
            <View style={styles.cardBody}>
              {CARD_STYLES.map((s, idx) => {
                const on = form.cardStyle === s.value;
                const labelText = s.value === 'SOLID'
                  ? t('admin.settings.cardStyleSolid', 'SOLID — opaque card with sharp edges')
                  : t('admin.settings.cardStyleGlass', 'GLASS — translucent card with backdrop blur');
                return (
                  <TouchableOpacity
                    key={s.value}
                    style={[
                      styles.radioCard,
                      isRTL && { flexDirection: 'row-reverse' },
                      on && styles.radioCardActive,
                      !canWrite && { opacity: 0.5 },
                      idx > 0 && { marginTop: Spacing.sm }
                    ]}
                    onPress={() => setForm(p => ({ ...p, cardStyle: s.value }))}
                    disabled={!canWrite}
                  >
                    <View style={[styles.radioDot, on && styles.radioDotActive, isRTL ? { marginLeft: Spacing.md, marginRight: 0 } : { marginRight: Spacing.md }]} />
                    <View style={styles.radioInfo}>
                      <Text style={[styles.radioLabel, on && styles.radioLabelActive, isRTL && { textAlign: 'right' }]}>{s.label}</Text>
                      <Text style={[styles.radioDesc, isRTL && { textAlign: 'right' }]}>{labelText}</Text>
                    </View>
                  </TouchableOpacity>
                );
              })}
            </View>
          </View>

          {canWrite && (
            <View style={[styles.footer, isRTL && { flexDirection: 'row-reverse' }]}>
              <TouchableOpacity style={[styles.cancelBtn, isRTL && { flexDirection: 'row-reverse' }]} onPress={() => router.push('/admin/settings')} disabled={saving}>
                <Text style={styles.cancelBtnText}>{t('common.cancel', 'Cancel')}</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[styles.saveBtn, saving && styles.saveBtnDisabled, isRTL && { flexDirection: 'row-reverse' }]} onPress={save} disabled={saving}>
                <Text style={styles.saveBtnText}>{saving ? t('common.saving', 'Saving...') : `✓ ${t('admin.settings.saveLogin', 'Save changes')}`}</Text>
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
  hero: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: Spacing.xl, flexWrap: 'wrap', gap: Spacing.md },
  heroHeader: { flexDirection: 'row', flex: 1, minWidth: 250 },
  heroIconBg: { width: 48, height: 48, borderRadius: Radius.md, backgroundColor: `${Colors.primary}15`, alignItems: 'center', justifyContent: 'center', marginRight: Spacing.md },
  heroTitle: { fontSize: FontSize.xl, fontWeight: '700', color: Colors.text, marginBottom: 4 },
  heroSub: { fontSize: FontSize.sm, color: Colors.textMuted, lineHeight: 20 },
  heroActions: { flexDirection: 'row', gap: Spacing.sm },
  btnOutline: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: Spacing.md, paddingVertical: Spacing.sm, borderRadius: Radius.sm, borderWidth: 1, borderColor: Colors.border, backgroundColor: '#fff' },
  btnOutlineText: { color: Colors.text, fontWeight: '600', fontSize: FontSize.sm },
  errorText: { color: Colors.error, backgroundColor: '#fee2e2', padding: Spacing.md, borderRadius: Radius.sm, marginBottom: Spacing.md, overflow: 'hidden' },
  loadingContainer: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  loadingText: { color: Colors.textMuted, fontSize: FontSize.md },

  card: { backgroundColor: '#fff', borderRadius: Radius.md, borderWidth: 1, borderColor: Colors.border, marginBottom: Spacing.md, overflow: 'hidden' },
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
  cancelBtn: { paddingVertical: Spacing.sm, paddingHorizontal: Spacing.md, borderRadius: Radius.sm, borderWidth: 1, borderColor: Colors.border, backgroundColor: '#fff' },
  cancelBtnText: { color: Colors.text, fontWeight: '600' },
  saveBtn: { backgroundColor: Colors.primary, paddingVertical: Spacing.sm, paddingHorizontal: Spacing.lg, borderRadius: Radius.sm },
  saveBtnDisabled: { opacity: 0.7 },
  saveBtnText: { color: '#fff', fontWeight: '600' },
});
