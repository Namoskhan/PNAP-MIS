import { useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator, SafeAreaView, ScrollView,
  StyleSheet, Switch, Text, TouchableOpacity, View,
} from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { api, errorMessage } from '../../../../src/api/client';
import { useAuth } from '../../../../src/context/AuthContext';
import { isSuperAdmin } from '../../../../src/utils/permissions';
import { useToast } from '../../../../src/components/Toast';
import { Colors, FontSize, Spacing } from '../../../../src/constants/colors';

const CATEGORY_ORDER = [
  'Members', 'Finance', 'Meetings', 'Roles', 'Communication', 'Org Structure', 'System',
];

const CATEGORY_ICONS = {
  Members: '👥', Finance: '💰', Meetings: '📅',
  Roles: '🛡️', Communication: '📢', 'Org Structure': '🏢', System: '⚙️',
};

export default function RolePermissionsScreen() {
  const { id } = useLocalSearchParams();
  const { user, refreshMe } = useAuth();
  const toast = useToast();
  const router = useRouter();
  const canWrite = isSuperAdmin(user);

  const [role, setRole] = useState(null);
  const [catalog, setCatalog] = useState([]);
  const [selected, setSelected] = useState(new Set());
  const [original, setOriginal] = useState(new Set());
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  async function load() {
    setLoading(true);
    try {
      const r = await api.get('/admin/roles');
      const data = r.data.data;
      const roles = Array.isArray(data) ? data : (data?.roles || []);
      const perms = Array.isArray(data) ? [] : (data?.permissions || []);
      const found = roles.find((x) => String(x._id) === String(id));
      if (found) {
        setRole(found);
        const set = new Set(found.permissions || []);
        setSelected(set);
        setOriginal(new Set(set));
      }
      setCatalog(perms.filter((x) => !x.superOnly));
    } catch (e) { toast.error(errorMessage(e)); }
    finally { setLoading(false); }
  }

  useEffect(() => { load(); }, [id]);

  const grouped = useMemo(() => {
    const out = {};
    for (const p of catalog) {
      (out[p.category] = out[p.category] || []).push(p);
    }
    const ordered = [];
    for (const c of CATEGORY_ORDER) if (out[c]) ordered.push([c, out[c]]);
    for (const [c, list] of Object.entries(out)) {
      if (!CATEGORY_ORDER.includes(c)) ordered.push([c, list]);
    }
    return ordered;
  }, [catalog]);

  function togglePerm(code) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(code)) next.delete(code); else next.add(code);
      return next;
    });
  }

  function toggleCategory(perms, on) {
    setSelected((prev) => {
      const next = new Set(prev);
      for (const p of perms) {
        if (on) next.add(p.code); else next.delete(p.code);
      }
      return next;
    });
  }

  const hasChanges = useMemo(() => {
    if (selected.size !== original.size) return true;
    for (const code of selected) if (!original.has(code)) return true;
    return false;
  }, [selected, original]);

  async function handleSave() {
    setSaving(true);
    try {
      await api.patch(`/admin/roles/${id}`, { permissions: [...selected] });
      toast.success('Permissions saved.');
      await refreshMe();
      setOriginal(new Set(selected));
    } catch (e) { toast.error(errorMessage(e)); }
    finally { setSaving(false); }
  }

  if (loading) {
    return <View style={styles.center}><ActivityIndicator size="large" color={Colors.primary} /></View>;
  }

  if (!role) {
    return <View style={styles.center}><Text style={styles.errText}>Role not found.</Text></View>;
  }

  return (
    <SafeAreaView style={styles.safe}>
      {/* Role info banner */}
      <View style={styles.banner}>
        <Text style={styles.bannerTitle}>{role.label}</Text>
        <Text style={styles.bannerCode}>{role.code}</Text>
        {!canWrite && (
          <View style={styles.readOnlyBadge}>
            <Text style={styles.readOnlyText}>Read-only — SUPER_ADMIN required to save</Text>
          </View>
        )}
      </View>

      <ScrollView contentContainerStyle={styles.content}>
        {grouped.map(([category, perms]) => {
          const allSelected = perms.every((p) => selected.has(p.code));
          const someSelected = perms.some((p) => selected.has(p.code));
          return (
            <View key={category} style={styles.group}>
              <View style={styles.groupHeader}>
                <Text style={styles.groupIcon}>{CATEGORY_ICONS[category] || '📁'}</Text>
                <Text style={styles.groupTitle}>{category}</Text>
                {canWrite && (
                  <TouchableOpacity
                    style={styles.selectAllBtn}
                    onPress={() => toggleCategory(perms, !allSelected)}
                  >
                    <Text style={styles.selectAllText}>
                      {allSelected ? 'Deselect all' : 'Select all'}
                    </Text>
                  </TouchableOpacity>
                )}
              </View>
              {perms.map((p) => (
                <TouchableOpacity
                  key={p.code}
                  style={styles.permRow}
                  onPress={() => canWrite && togglePerm(p.code)}
                  activeOpacity={canWrite ? 0.7 : 1}
                >
                  <View style={[styles.checkbox, selected.has(p.code) && styles.checkboxOn]}>
                    {selected.has(p.code) && <Text style={styles.checkmark}>✓</Text>}
                  </View>
                  <View style={styles.permInfo}>
                    <Text style={styles.permLabel}>{p.label || p.code}</Text>
                    {p.description && (
                      <Text style={styles.permDesc} numberOfLines={2}>{p.description}</Text>
                    )}
                  </View>
                </TouchableOpacity>
              ))}
            </View>
          );
        })}

        {catalog.length === 0 && (
          <View style={styles.emptyPerms}>
            <Text style={styles.emptyText}>No permissions in the catalogue yet.</Text>
          </View>
        )}
      </ScrollView>

      {canWrite && (
        <View style={styles.footer}>
          <TouchableOpacity
            style={[styles.saveBtn, (!hasChanges || saving) && styles.saveBtnDisabled]}
            onPress={handleSave}
            disabled={!hasChanges || saving}
          >
            {saving
              ? <ActivityIndicator color="#fff" />
              : <Text style={styles.saveText}>{hasChanges ? 'Save Permissions' : 'No Changes'}</Text>}
          </TouchableOpacity>
        </View>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: Colors.background },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  errText: { color: Colors.error, fontSize: FontSize.base },
  banner: { backgroundColor: Colors.primary, padding: Spacing.lg },
  bannerTitle: { fontSize: FontSize.xl, fontWeight: '800', color: '#fff' },
  bannerCode: { fontSize: FontSize.sm, color: 'rgba(255,255,255,0.7)', marginTop: 2, fontFamily: 'monospace' },
  readOnlyBadge: { marginTop: Spacing.sm, backgroundColor: 'rgba(255,255,255,0.15)', borderRadius: 6, paddingHorizontal: 10, paddingVertical: 4, alignSelf: 'flex-start' },
  readOnlyText: { color: '#fff', fontSize: FontSize.xs },
  content: { padding: Spacing.md, paddingBottom: 100 },
  group: { backgroundColor: Colors.surface, borderRadius: 12, marginBottom: Spacing.md, overflow: 'hidden', borderWidth: 1, borderColor: Colors.border },
  groupHeader: { flexDirection: 'row', alignItems: 'center', padding: Spacing.md, backgroundColor: Colors.background, gap: Spacing.sm },
  groupIcon: { fontSize: 16 },
  groupTitle: { flex: 1, fontSize: FontSize.base, fontWeight: '700', color: Colors.text },
  selectAllBtn: { paddingHorizontal: 8, paddingVertical: 4 },
  selectAllText: { fontSize: FontSize.xs, color: Colors.primary, fontWeight: '600' },
  permRow: { flexDirection: 'row', alignItems: 'flex-start', gap: Spacing.sm, padding: Spacing.md, borderTopWidth: 1, borderTopColor: Colors.borderLight },
  checkbox: { width: 20, height: 20, borderRadius: 4, borderWidth: 2, borderColor: Colors.border, alignItems: 'center', justifyContent: 'center', marginTop: 1 },
  checkboxOn: { borderColor: Colors.primary, backgroundColor: Colors.primary },
  checkmark: { color: '#fff', fontSize: 12, fontWeight: '700' },
  permInfo: { flex: 1 },
  permLabel: { fontSize: FontSize.sm, fontWeight: '600', color: Colors.text },
  permDesc: { fontSize: FontSize.xs, color: Colors.textMuted, marginTop: 2, lineHeight: 16 },
  emptyPerms: { alignItems: 'center', paddingVertical: 40 },
  emptyText: { color: Colors.textMuted, fontSize: FontSize.sm },
  footer: { padding: Spacing.lg, borderTopWidth: 1, borderTopColor: Colors.border, backgroundColor: Colors.surface },
  saveBtn: { backgroundColor: Colors.primary, borderRadius: 12, paddingVertical: 14, alignItems: 'center' },
  saveBtnDisabled: { opacity: 0.5 },
  saveText: { color: '#fff', fontWeight: '700', fontSize: FontSize.base },
});
