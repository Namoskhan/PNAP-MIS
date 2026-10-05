import React, { useEffect, useState } from 'react';
import { View, Text, ScrollView, TouchableOpacity, StyleSheet, Image, Platform } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import * as ImagePicker from 'expo-image-picker';
import { api, errorMessage, SERVER_BASE } from '../../../../src/api/client';
import { useLanguage } from '../../../../src/context/LanguageContext';
import { useAuth } from '../../../../src/context/AuthContext';
import { hasPermission } from '../../../../src/utils/permissions';
import { useToast } from '../../../../src/components/Toast';
import { confirmAction } from '../../../../src/utils/dialog';
import { Colors, FontSize, Radius, Spacing } from '../../../../src/constants/colors';

const SLOTS = [
  { slot: 'sidebar', labelKey: 'admin.settings.sidebarLogo', label: 'Sidebar logo', descKey: 'admin.settings.sidebarLogoDesc', description: 'Shown at the top of the sidebar in light mode.', recommended: '256×64 PNG, ≤100 KB' },
  { slot: 'sidebarDark', labelKey: 'admin.settings.sidebarDarkLogo', label: 'Sidebar logo (dark mode)', descKey: 'admin.settings.sidebarDarkLogoDesc', description: 'Variant used when the dark theme is active.', recommended: '256×64 PNG, ≤100 KB' },
  { slot: 'login', labelKey: 'admin.settings.loginLogo', label: 'Login page logo', descKey: 'admin.settings.loginLogoDesc', description: 'Logo above the login form.', recommended: '512×512 PNG, ≤200 KB' },
  { slot: 'favicon', labelKey: 'admin.settings.faviconLogo', label: 'Browser tab favicon', descKey: 'admin.settings.faviconLogoDesc', description: 'Browser tab icon.', recommended: '32×32 to 64×64 PNG, ≤50 KB' },
  { slot: 'print', labelKey: 'admin.settings.printLogo', label: 'Print / export logo', descKey: 'admin.settings.printLogoDesc', description: 'High-DPI version embedded in PDF / XLSX exports.', recommended: '1024×256 PNG, ≤500 KB' },
];

const MAX_BYTES = 5 * 1024 * 1024; // 5 MB

export default function LogoManagerScreen() {
  const { t, isRTL } = useLanguage();
  const router = useRouter();
  const { user } = useAuth();
  const toast = useToast();
  const canWrite = hasPermission(user, 'MANAGE_SYSTEM_BRANDING');

  const [logos, setLogos] = useState(null);
  const [busy, setBusy] = useState(true);
  const [err, setErr] = useState('');

  async function load() {
    setBusy(true); setErr('');
    try {
      const s = await api.get('/settings').then(r => r.data?.data || null);
      setLogos(s?.logos || {});
    } catch (e) {
      setErr(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }
  useEffect(() => { load(); }, []);

  function onChanged() {
    load();
  }

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <View style={[styles.hero, isRTL && { flexDirection: 'row-reverse' }]}>
        <View style={[styles.heroHeader, isRTL && { flexDirection: 'row-reverse' }]}>
          <View style={[styles.heroIconBg, isRTL ? { marginLeft: Spacing.md, marginRight: 0 } : { marginRight: Spacing.md }]}>
            <Ionicons name="images" size={24} color={Colors.primary} />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={[styles.heroTitle, isRTL && { textAlign: 'right' }]}>{t('admin.settings.logoManager', 'Logo Manager')}</Text>
            <Text style={[styles.heroSub, isRTL && { textAlign: 'right' }]}>
              {t('admin.settings.logoManagerSub', 'Upload, replace, or reset the five branding logo slots.')}
            </Text>
          </View>
        </View>
        <View style={[styles.heroActions, isRTL && { flexDirection: 'row-reverse' }]}>
          <TouchableOpacity style={[styles.btnOutline, isRTL && { flexDirection: 'row-reverse' }]} onPress={() => router.back()} disabled={busy}>
            <Ionicons name={isRTL ? "arrow-forward" : "arrow-back"} size={16} color={Colors.text} style={isRTL ? { marginLeft: 6 } : { marginRight: 6 }} />
            <Text style={styles.btnOutlineText}>{t('admin.settings.backToSettings', 'Back')}</Text>
          </TouchableOpacity>
          <TouchableOpacity style={[styles.btnOutline, isRTL && { flexDirection: 'row-reverse' }]} onPress={load} disabled={busy}>
            <Ionicons name="refresh" size={16} color={Colors.text} style={isRTL ? { marginLeft: 6 } : { marginRight: 6 }} />
            <Text style={styles.btnOutlineText}>{t('common.refresh', 'Refresh')}</Text>
          </TouchableOpacity>
        </View>
      </View>

      {err ? <Text style={styles.errorText}>{err}</Text> : null}

      {!busy && logos && (
        <>
          <View style={styles.infoAlert}>
            <Text style={[styles.infoAlertText, isRTL && { textAlign: 'right' }]}>
              {t('admin.settings.logoFormatNotice', 'Format: JPEG, PNG, or WebP up to 5 MB. SVG is not supported.')}
            </Text>
          </View>
          {SLOTS.map((s) => (
            <LogoUploader
              key={s.slot}
              slot={s.slot}
              label={t(s.labelKey, s.label)}
              description={t(s.descKey, s.description)}
              recommended={s.recommended}
              currentUrl={logos[s.slot]?.url || ''}
              onChanged={onChanged}
              disabled={!canWrite}
            />
          ))}
        </>
      )}
      <View style={{ height: 40 }} />
    </ScrollView>
  );
}

function LogoUploader({ slot, label, description, currentUrl, recommended, onChanged, disabled }) {
  const { t, isRTL } = useLanguage();
  const toast = useToast();
  const [busy, setBusy] = useState(false);
  const [previewUri, setPreviewUri] = useState(null);

  async function pickImage() {
    try {
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ['images'],
        allowsEditing: true,
        quality: 1,
      });

      if (result.canceled || !result.assets?.[0]) return;
      
      const asset = result.assets[0];
      
      if (asset.fileSize && asset.fileSize > MAX_BYTES) {
        toast.error(t('admin.settings.fileOverLimit', 'File is over the 5 MB limit.'));
        return;
      }

      setPreviewUri(asset.uri);
      setBusy(true);

      const fd = new FormData();
      if (Platform.OS === 'web') {
        let fileObj = asset.file;
        if (!fileObj && asset.uri) {
          const r = await fetch(asset.uri);
          const blob = await r.blob();
          fileObj = new File([blob], asset.fileName || `${slot}.jpg`, {
            type: asset.mimeType || blob.type || 'image/jpeg',
          });
        }
        fd.append('logo', fileObj);
        await api.post(`/settings/logos/${slot}`, fd);
      } else {
        fd.append('logo', {
          uri: asset.uri,
          name: asset.fileName || `${slot}.jpg`,
          type: asset.mimeType || 'image/jpeg',
        });
        await api.post(`/settings/logos/${slot}`, fd, {
          headers: { 'Content-Type': 'multipart/form-data' },
        });
      }
      
      toast.success(t('admin.settings.logoUploaded', '{{label}} uploaded.', { label }));
      onChanged();
    } catch (e) {
      toast.error(errorMessage(e));
    } finally {
      setBusy(false);
      setPreviewUri(null);
    }
  }

  function resetImage() {
    confirmAction(
      t('common.confirm', 'Confirm Reset'),
      t('admin.settings.resetLogoConfirm', 'Reset {{label}}? The current image will be removed.', { label }),
      async () => {
        setBusy(true);
        try {
          await api.post(`/settings/logos/${slot}/reset`);
          toast.success(t('admin.settings.logoReset', '{{label}} reset to default.', { label }));
          onChanged();
        } catch (e) {
          toast.error(errorMessage(e));
        } finally {
          setBusy(false);
        }
      },
      { destructive: true, confirmText: t('admin.settings.reset', 'Reset') }
    );
  }

  const displayUrl = previewUri || (currentUrl ? (currentUrl.startsWith('http') ? currentUrl : `${SERVER_BASE}${currentUrl}`) : null);

  return (
    <View style={styles.card}>
      <View style={[styles.cardHeader, isRTL && { flexDirection: 'row-reverse' }]}>
        <Ionicons name="image-outline" size={18} color={Colors.textLight} />
        <Text style={[styles.cardTitle, isRTL && { textAlign: 'right', marginRight: Spacing.sm, marginLeft: 0 }]}>{label}</Text>
        {currentUrl ? (
          <View style={styles.badge}><Text style={styles.badgeText}>{t('admin.settings.logoConfigured', 'configured')}</Text></View>
        ) : null}
      </View>
      <View style={styles.cardBody}>
        <View style={[styles.uploaderLayout, isRTL && { flexDirection: 'row-reverse' }]}>
          <View style={styles.thumbnailContainer}>
            {displayUrl ? (
              <Image source={{ uri: displayUrl }} style={styles.thumbnail} resizeMode="contain" />
            ) : (
              <Text style={styles.thumbnailPlaceholder}>{t('admin.settings.noImageDefault', 'No image — using default')}</Text>
            )}
          </View>

          <View style={styles.uploaderInfo}>
            <Text style={[styles.descriptionText, isRTL && { textAlign: 'right' }]}>{description}</Text>
            {Boolean(recommended) && (
              <Text style={[styles.recommendedText, isRTL && { textAlign: 'right' }]}>
                <Text style={{ fontWeight: '600' }}>{t('admin.settings.recommended', 'Recommended')}:</Text> {recommended}
              </Text>
            )}
            
            <View style={[styles.uploaderActions, isRTL && { flexDirection: 'row-reverse' }]}>
              <TouchableOpacity style={[styles.actionBtn, (disabled || busy) && styles.btnDisabled, isRTL && { flexDirection: 'row-reverse' }]} onPress={pickImage} disabled={disabled || busy}>
                <Ionicons name="cloud-upload" size={14} color={Colors.primary} style={isRTL ? { marginLeft: 4 } : { marginRight: 4 }} />
                <Text style={styles.actionBtnText}>{busy ? t('common.uploading', 'Uploading...') : (currentUrl ? t('admin.settings.replace', 'Replace') : t('common.upload', 'Upload'))}</Text>
              </TouchableOpacity>
              {Boolean(currentUrl) && !disabled && (
                <TouchableOpacity style={[styles.actionBtn, busy && styles.btnDisabled, isRTL && { flexDirection: 'row-reverse' }]} onPress={resetImage} disabled={busy}>
                  <Ionicons name="refresh" size={14} color={Colors.error} style={isRTL ? { marginLeft: 4 } : { marginRight: 4 }} />
                  <Text style={[styles.actionBtnText, { color: Colors.error }]}>{t('admin.settings.reset', 'Reset')}</Text>
                </TouchableOpacity>
              )}
            </View>
          </View>
        </View>
      </View>
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
  
  infoAlert: { backgroundColor: 'rgba(2, 132, 199, 0.06)', borderWidth: 1, borderColor: 'rgba(2, 132, 199, 0.2)', padding: Spacing.md, borderRadius: Radius.md, marginBottom: Spacing.md },
  infoAlertText: { color: '#0369a1', fontSize: FontSize.sm },

  card: { backgroundColor: '#fff', borderRadius: Radius.md, borderWidth: 1, borderColor: Colors.border, marginBottom: Spacing.md, overflow: 'hidden' },
  cardHeader: { flexDirection: 'row', alignItems: 'center', padding: Spacing.md, borderBottomWidth: 1, borderBottomColor: Colors.border, backgroundColor: '#f9fafb' },
  cardTitle: { fontSize: FontSize.md, fontWeight: '600', color: Colors.text, marginLeft: Spacing.sm, flex: 1 },
  badge: { backgroundColor: `${Colors.primary}15`, paddingHorizontal: 8, paddingVertical: 2, borderRadius: 12 },
  badgeText: { fontSize: FontSize.xs, fontWeight: '600', color: Colors.primary },
  cardBody: { padding: Spacing.md },
  
  uploaderLayout: { flexDirection: 'row', gap: Spacing.md, alignItems: 'flex-start' },
  thumbnailContainer: { width: 100, height: 100, borderRadius: 8, borderWidth: 1, borderColor: Colors.border, borderStyle: 'dashed', backgroundColor: '#f9fafb', overflow: 'hidden', justifyContent: 'center', alignItems: 'center' },
  thumbnail: { width: '100%', height: '100%' },
  thumbnailPlaceholder: { fontSize: FontSize.xs, color: Colors.textMuted, textAlign: 'center', padding: 8 },
  
  uploaderInfo: { flex: 1 },
  descriptionText: { fontSize: FontSize.sm, color: Colors.textMuted, marginBottom: 4 },
  recommendedText: { fontSize: FontSize.xs, color: Colors.textMuted, marginBottom: 8 },
  uploaderActions: { flexDirection: 'row', gap: Spacing.sm, flexWrap: 'wrap' },
  actionBtn: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 12, paddingVertical: 8, borderRadius: Radius.sm, backgroundColor: `${Colors.primary}10` },
  actionBtnText: { color: Colors.primary, fontSize: FontSize.sm, fontWeight: '600' },
  btnDisabled: { opacity: 0.5 },
});
