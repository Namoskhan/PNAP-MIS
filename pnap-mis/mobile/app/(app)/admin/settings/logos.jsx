import React, { useEffect, useState } from 'react';
import { View, Text, ScrollView, TouchableOpacity, StyleSheet, Image, Alert } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import * as ImagePicker from 'expo-image-picker';
import { api, errorMessage } from '../../../../src/api/client';
import { useAuth } from '../../../../src/context/AuthContext';
import { hasPermission } from '../../../../src/utils/permissions';
import { useToast } from '../../../../src/components/Toast';
import { Colors, FontSize, Radius, Spacing } from '../../../../src/constants/colors';

const SLOTS = [
  { slot: 'sidebar', label: 'Sidebar logo', description: 'Shown at the top of the sidebar in light mode.', recommended: '256×64 PNG, ≤100 KB' },
  { slot: 'sidebarDark', label: 'Sidebar logo (dark mode)', description: 'Variant used when the dark theme is active.', recommended: '256×64 PNG, ≤100 KB' },
  { slot: 'login', label: 'Login page logo', description: 'Logo above the login form.', recommended: '512×512 PNG, ≤200 KB' },
  { slot: 'favicon', label: 'Browser tab favicon', description: 'Browser tab icon.', recommended: '32×32 to 64×64 PNG, ≤50 KB' },
  { slot: 'print', label: 'Print / export logo', description: 'High-DPI version embedded in PDF / XLSX exports.', recommended: '1024×256 PNG, ≤500 KB' },
];

const MAX_BYTES = 5 * 1024 * 1024; // 5 MB

export default function LogoManagerScreen() {
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
      <View style={styles.hero}>
        <View style={styles.heroHeader}>
          <View style={styles.heroIconBg}>
            <Ionicons name="images" size={24} color={Colors.primary} />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={styles.heroTitle}>Logo Manager</Text>
            <Text style={styles.heroSub}>
              Upload, replace, or reset the five branding logo slots.
            </Text>
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

      {!busy && logos && (
        <>
          <View style={styles.infoAlert}>
            <Text style={styles.infoAlertText}>
              <Text style={{ fontWeight: '700' }}>Format:</Text> JPEG, PNG, or WebP up to 5 MB.
            </Text>
          </View>
          {SLOTS.map((s) => (
            <LogoUploader
              key={s.slot}
              slot={s.slot}
              label={s.label}
              description={s.description}
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
  const toast = useToast();
  const [busy, setBusy] = useState(false);
  const [previewUri, setPreviewUri] = useState(null);

  async function pickImage() {
    try {
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        allowsEditing: true,
        quality: 1,
      });

      if (result.canceled) return;
      
      const asset = result.assets[0];
      
      // We don't have file size readily available from image picker in all cases,
      // but we'll try to fetch it if fileSize exists or let the server reject it.
      if (asset.fileSize && asset.fileSize > MAX_BYTES) {
        toast.error(`File is over the 5 MB limit.`);
        return;
      }

      setPreviewUri(asset.uri);
      setBusy(true);

      const fd = new FormData();
      fd.append('logo', {
        uri: asset.uri,
        name: asset.fileName || `${slot}.jpg`,
        type: asset.mimeType || 'image/jpeg'
      });

      // We need to use fetch directly or ensure api.post handles FormData correctly in RN
      const token = await api.getToken?.() || null;
      const headers = { 'Content-Type': 'multipart/form-data' };
      if (token) headers['Authorization'] = `Bearer ${token}`;
      
      const res = await fetch(`${api.defaults.baseURL || 'http://localhost:8000'}/api/settings/logos/${slot}`, {
        method: 'POST',
        headers,
        body: fd
      });

      if (!res.ok) {
        const errBody = await res.json().catch(() => ({}));
        throw new Error(errBody?.error?.message || `Upload failed (${res.status})`);
      }
      
      toast.success(`${label} uploaded.`);
      onChanged();
    } catch (e) {
      toast.error(errorMessage(e));
    } finally {
      setBusy(false);
      setPreviewUri(null);
    }
  }

  function resetImage() {
    Alert.alert(
      'Confirm Reset',
      `Reset ${label}? The current image will be removed.`,
      [
        { text: 'Cancel', style: 'cancel' },
        { 
          text: 'Reset', 
          style: 'destructive',
          onPress: async () => {
            setBusy(true);
            try {
              await api.post(`/settings/logos/${slot}/reset`);
              toast.success(`${label} reset to default.`);
              onChanged();
            } catch (e) {
              toast.error(errorMessage(e));
            } finally {
              setBusy(false);
            }
          }
        }
      ]
    );
  }

  const displayUrl = previewUri || (currentUrl ? `${api.defaults.baseURL || 'http://localhost:8000'}${currentUrl}` : null);

  return (
    <View style={styles.card}>
      <View style={styles.cardHeader}>
        <Ionicons name="image-outline" size={18} color={Colors.textLight} />
        <Text style={styles.cardTitle}>{label}</Text>
        {currentUrl ? (
          <View style={styles.badge}><Text style={styles.badgeText}>configured</Text></View>
        ) : null}
      </View>
      <View style={styles.cardBody}>
        <View style={styles.uploaderLayout}>
          <View style={styles.thumbnailContainer}>
            {displayUrl ? (
              <Image source={{ uri: displayUrl }} style={styles.thumbnail} resizeMode="contain" />
            ) : (
              <Text style={styles.thumbnailPlaceholder}>No image — using default</Text>
            )}
          </View>

          <View style={styles.uploaderInfo}>
            <Text style={styles.descriptionText}>{description}</Text>
            {recommended && (
              <Text style={styles.recommendedText}>
                <Text style={{ fontWeight: '600' }}>Recommended:</Text> {recommended}
              </Text>
            )}
            
            <View style={styles.uploaderActions}>
              <TouchableOpacity style={[styles.actionBtn, (disabled || busy) && styles.btnDisabled]} onPress={pickImage} disabled={disabled || busy}>
                <Ionicons name="cloud-upload" size={14} color={Colors.primary} style={{ marginRight: 4 }} />
                <Text style={styles.actionBtnText}>{busy ? 'Uploading...' : (currentUrl ? 'Replace' : 'Upload')}</Text>
              </TouchableOpacity>
              {currentUrl && !disabled && (
                <TouchableOpacity style={[styles.actionBtn, busy && styles.btnDisabled]} onPress={resetImage} disabled={busy}>
                  <Ionicons name="refresh" size={14} color={Colors.danger} style={{ marginRight: 4 }} />
                  <Text style={[styles.actionBtnText, { color: Colors.danger }]}>Reset</Text>
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
  errorText: { color: Colors.danger, backgroundColor: '#fee2e2', padding: Spacing.md, borderRadius: Radius.sm, marginBottom: Spacing.md, overflow: 'hidden' },
  
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
