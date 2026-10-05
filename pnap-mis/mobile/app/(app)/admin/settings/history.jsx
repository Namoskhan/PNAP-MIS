import React, { useEffect, useState } from 'react';
import { View, Text, ScrollView, TouchableOpacity, StyleSheet, Platform, Alert } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { api, errorMessage } from '../../../../src/api/client';
import { useLanguage } from '../../../../src/context/LanguageContext';
import { useAuth } from '../../../../src/context/AuthContext';
import { hasPermission } from '../../../../src/utils/permissions';
import { useToast } from '../../../../src/components/Toast';
import { Colors, FontSize, Radius, Spacing } from '../../../../src/constants/colors';

const KIND_BADGES = {
  UPDATE:  { label: 'edit',    color: '#0284c7' },
  RESET:   { label: 'reset',   color: Colors.primary },
  IMPORT:  { label: 'import',  color: '#16a34a' },
  RESTORE: { label: 'rollback', color: Colors.error },
};

function DiffRow({ d }) {
  const fmt = (v) => {
    if (v === undefined) return <Text style={styles.diffMuted}>(unset)</Text>;
    if (v === null) return <Text style={styles.diffMuted}>null</Text>;
    if (typeof v === 'object') {
      const s = JSON.stringify(v);
      return <Text>{s.length > 80 ? s.slice(0, 80) + '...' : s}</Text>;
    }
    return <Text>{String(v)}</Text>;
  };
  return (
    <View style={styles.diffRow}>
      <Text style={[styles.diffCell, { flex: 1 }]}>{d.path}</Text>
      <Text style={[styles.diffCell, { flex: 1 }]}>{fmt(d.before)}</Text>
      <Text style={[styles.diffCell, { flex: 1 }]}>{fmt(d.after)}</Text>
    </View>
  );
}

export default function SettingsHistoryScreen() {
  const { t, isRTL } = useLanguage();
  const router = useRouter();
  const { user } = useAuth();
  const toast = useToast();
  const canWrite = hasPermission(user, 'MANAGE_SYSTEM_BRANDING');

  const [items, setItems] = useState([]);
  const [busy, setBusy] = useState(true);
  const [err, setErr] = useState('');
  const [expanded, setExpanded] = useState(null); // versionNumber

  async function load() {
    setBusy(true); setErr('');
    try {
      const res = await api.get('/settings/versions', { params: { limit: 50 } });
      setItems(res.data?.data || []);
    } catch (e) {
      setErr(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }

  useEffect(() => { load(); }, []);

  async function performRestore(v) {
    try {
      await api.post(`/settings/versions/${v.versionNumber}/restore`, {
        changeNote: `Manual rollback to v${v.versionNumber}`
      });
      toast.success(t('admin.settings.restoredFrom', 'Restored from v{{version}}.', { version: v.versionNumber }));
      if (Platform.OS === 'web') {
        window.location.reload();
      } else {
        load();
      }
    } catch (e) {
      toast.error(errorMessage(e));
    }
  }

  async function doRestore(v) {
    const confirmText = t('admin.settings.restoreConfirm', 'Restore branding to version v{{version}}?\n\nThis creates a NEW version (history is preserved). The current theme + identity will be replaced with the snapshot from this point in time.', { version: v.versionNumber });
    
    if (Platform.OS === 'web') {
      if (window.confirm(confirmText)) {
        performRestore(v);
      }
    } else {
      Alert.alert(
        t('admin.settings.rollback', 'Restore Version'),
        confirmText,
        [
          { text: t('common.cancel', 'Cancel'), style: 'cancel' },
          { text: t('admin.settings.rollback', 'Restore'), style: 'destructive', onPress: () => performRestore(v) },
        ]
      );
    }
  }

  if (busy && items.length === 0) {
    return (
      <View style={styles.loadingContainer}>
        <Text style={styles.loadingText}>{t('common.loading', 'Loading history...')}</Text>
      </View>
    );
  }

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <View style={styles.header}>
        <View style={[styles.headerTitleRow, isRTL && { flexDirection: 'row-reverse' }]}>
          <Ionicons name="time" size={24} color={Colors.primary} style={isRTL ? { marginLeft: Spacing.sm } : { marginRight: Spacing.sm }} />
          <Text style={[styles.title, isRTL && { textAlign: 'right' }]}>{t('admin.settings.settingsHistory', 'Settings History')}</Text>
        </View>
        <Text style={[styles.subtitle, isRTL && { textAlign: 'right' }]}>
          {t('admin.settings.settingsHistorySub', 'Append-only timeline of every branding change. Tap any row to inspect the diff; tap Restore to roll back. Restoring creates a new version — history is never lost.')}
        </Text>
      </View>

      {err ? <Text style={styles.errorText}>{err}</Text> : null}

      {!busy && items.length === 0 && (
        <View style={styles.card}>
          <Text style={[styles.emptyText, isRTL && { textAlign: 'right' }]}>{t('admin.settings.noChangesYet', 'No branding changes yet.')}</Text>
        </View>
      )}

      {items.map((v) => {
        const isOpen = expanded === v.versionNumber;
        const kind = KIND_BADGES[v.kind] || KIND_BADGES.UPDATE;
        const diffCount = (v.diff || []).length;
        const kindKey = `admin.settings.kind_${(v.kind || 'edit').toLowerCase()}`;
        
        return (
          <View key={v.versionNumber} style={styles.card}>
            <TouchableOpacity 
              style={styles.cardHeaderBtn} 
              onPress={() => setExpanded(isOpen ? null : v.versionNumber)}
              activeOpacity={0.7}
            >
              <View style={[styles.headerTopLine, isRTL && { flexDirection: 'row-reverse' }]}>
                <Text style={styles.versionLabel}>v{v.versionNumber}</Text>
                <View style={[styles.badge, { backgroundColor: `${kind.color}1a` }]}>
                  <Text style={[styles.badgeText, { color: kind.color }]}>
                    {t(kindKey, kind.label)}
                    {v.kind === 'RESTORE' && v.restoredFrom ? ` ← v${v.restoredFrom}` : ''}
                  </Text>
                </View>
                <View style={{ flex: 1 }} />
                <Text style={styles.dateText}>{v.changedAt ? new Date(v.changedAt).toLocaleString() : '—'}</Text>
                <Ionicons name={isOpen ? "chevron-down" : (isRTL ? "chevron-back" : "chevron-forward")} size={16} color={Colors.textLight} style={isRTL ? { marginRight: Spacing.sm } : { marginLeft: Spacing.sm }} />
              </View>
              
              <View style={[styles.headerBottomLine, isRTL && { flexDirection: 'row-reverse' }]}>
                <Text style={[styles.noteText, isRTL && { textAlign: 'right' }]} numberOfLines={1}>
                  {v.changeNote || <Text style={{ color: Colors.textLight }}>{t('admin.settings.noNote', 'no note')}</Text>}
                </Text>
                <Text style={styles.diffCountText}>
                  {t('admin.settings.changesCount', '{{count}} change', { count: diffCount })}
                </Text>
              </View>
            </TouchableOpacity>

            {isOpen && (
              <View style={styles.cardBody}>
                {diffCount === 0 ? (
                  <Text style={[styles.emptyDiffText, isRTL && { textAlign: 'right' }]}>{t('admin.settings.noLeafChanges', 'No leaf-level changes captured (likely a snapshot reset / import).')}</Text>
                ) : (
                  <View style={styles.diffTable}>
                    <View style={[styles.diffHeaderRow, isRTL && { flexDirection: 'row-reverse' }]}>
                      <Text style={[styles.diffHeaderCell, { flex: 1 }, isRTL && { textAlign: 'right' }]}>{t('admin.settings.path', 'Path')}</Text>
                      <Text style={[styles.diffHeaderCell, { flex: 1 }, isRTL && { textAlign: 'right' }]}>{t('admin.settings.before', 'Before')}</Text>
                      <Text style={[styles.diffHeaderCell, { flex: 1 }, isRTL && { textAlign: 'right' }]}>{t('admin.settings.after', 'After')}</Text>
                    </View>
                    {(v.diff || []).slice(0, 30).map((d, i) => (
                      <DiffRow key={i} d={d} />
                    ))}
                    {diffCount > 30 && (
                      <Text style={[styles.moreDiffsText, isRTL && { textAlign: 'right' }]}>{t('admin.settings.andMoreChanges', '… and {{count}} more', { count: diffCount - 30 })}</Text>
                    )}
                  </View>
                )}

                {canWrite && v.versionNumber > 0 && (
                  <View style={[styles.restoreRow, isRTL && { flexDirection: 'row-reverse' }]}>
                    <TouchableOpacity style={[styles.restoreBtn, isRTL && { flexDirection: 'row-reverse' }]} onPress={() => doRestore(v)}>
                      <Ionicons name="refresh" size={16} color={Colors.error} style={isRTL ? { marginLeft: 6 } : { marginRight: 6 }} />
                      <Text style={styles.restoreBtnText}>{t('admin.settings.restoreThisVersion', 'Restore this version')}</Text>
                    </TouchableOpacity>
                  </View>
                )}
              </View>
            )}
          </View>
        );
      })}
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

  card: { backgroundColor: '#fff', borderRadius: Radius.md, borderWidth: 1, borderColor: Colors.border, marginBottom: Spacing.sm, overflow: 'hidden' },
  emptyText: { padding: Spacing.md, color: Colors.textMuted, textAlign: 'center' },
  
  cardHeaderBtn: { padding: Spacing.md, backgroundColor: '#fff' },
  headerTopLine: { flexDirection: 'row', alignItems: 'center', marginBottom: 4 },
  versionLabel: { fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace', fontSize: 13, fontWeight: '700', color: Colors.text, minWidth: 40 },
  badge: { paddingVertical: 2, paddingHorizontal: 8, borderRadius: 999, marginLeft: Spacing.sm },
  badgeText: { fontSize: 11, fontWeight: '600' },
  dateText: { fontSize: 12, color: Colors.textLight },
  
  headerBottomLine: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingLeft: 48 },
  noteText: { flex: 1, fontSize: 13, color: Colors.text, marginRight: Spacing.sm },
  diffCountText: { fontSize: 12, color: Colors.textLight },

  cardBody: { padding: Spacing.md, borderTopWidth: 1, borderTopColor: Colors.borderLight, backgroundColor: '#fafafa' },
  emptyDiffText: { fontSize: 13, color: Colors.textLight },
  
  diffTable: { backgroundColor: '#fff', borderWidth: 1, borderColor: Colors.borderLight, borderRadius: Radius.sm },
  diffHeaderRow: { flexDirection: 'row', padding: Spacing.sm, borderBottomWidth: 1, borderBottomColor: Colors.borderLight, backgroundColor: '#f1f5f9' },
  diffHeaderCell: { fontSize: 12, fontWeight: '700', color: Colors.textMuted },
  diffRow: { flexDirection: 'row', padding: Spacing.sm, borderBottomWidth: 1, borderBottomColor: Colors.borderLight },
  diffCell: { fontSize: 12, color: Colors.text, fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace' },
  diffMuted: { color: Colors.textLight, fontStyle: 'italic' },
  moreDiffsText: { textAlign: 'center', padding: Spacing.sm, color: Colors.textLight, fontSize: 12 },

  restoreRow: { flexDirection: 'row', justifyContent: 'flex-end', marginTop: Spacing.md },
  restoreBtn: { flexDirection: 'row', alignItems: 'center', paddingVertical: Spacing.sm, paddingHorizontal: Spacing.md, backgroundColor: '#fef2f2', borderWidth: 1, borderColor: '#fca5a5', borderRadius: Radius.sm },
  restoreBtnText: { color: Colors.error, fontWeight: '600', fontSize: FontSize.sm },
});
