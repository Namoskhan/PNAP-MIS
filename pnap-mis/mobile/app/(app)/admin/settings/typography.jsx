import React, { useEffect, useState } from 'react';
import { View, Text, ScrollView, TouchableOpacity, StyleSheet, Platform, TextInput } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { Picker } from '@react-native-picker/picker';
import { api, errorMessage } from '../../../../src/api/client';
import { useAuth } from '../../../../src/context/AuthContext';
import { hasPermission } from '../../../../src/utils/permissions';
import { useToast } from '../../../../src/components/Toast';
import { Colors, FontSize, Radius, Spacing } from '../../../../src/constants/colors';

const FONT_FAMILY_PRESETS = [
  { value: 'Inter, system-ui, sans-serif',         label: 'Inter (default)' },
  { value: 'system-ui, sans-serif',                label: 'System UI' },
  { value: 'Roboto, system-ui, sans-serif',        label: 'Roboto' },
  { value: '"Open Sans", system-ui, sans-serif',   label: 'Open Sans' },
  { value: 'Poppins, system-ui, sans-serif',       label: 'Poppins' },
  { value: 'Nunito, system-ui, sans-serif',        label: 'Nunito' },
  { value: 'Georgia, serif',                       label: 'Georgia (serif)' },
];

function Stepper({ label, value, onChange, min, max, step = 1, format = (v) => v, disabled }) {
  const decrease = () => { if (!disabled && value > min) onChange(Math.max(min, value - step)); };
  const increase = () => { if (!disabled && value < max) onChange(Math.min(max, value + step)); };
  
  return (
    <View style={styles.stepperContainer}>
      <Text style={styles.fieldLabel}>{label}</Text>
      <View style={styles.stepperControls}>
        <TouchableOpacity style={styles.stepperBtn} onPress={decrease} disabled={disabled || value <= min}>
          <Ionicons name="remove" size={16} color={disabled || value <= min ? Colors.textLight : Colors.text} />
        </TouchableOpacity>
        <Text style={styles.stepperValue}>{format(value)}</Text>
        <TouchableOpacity style={styles.stepperBtn} onPress={increase} disabled={disabled || value >= max}>
          <Ionicons name="add" size={16} color={disabled || value >= max ? Colors.textLight : Colors.text} />
        </TouchableOpacity>
      </View>
    </View>
  );
}

export default function TypographyManagerScreen() {
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
      const t = res.data?.data?.typography || {};
      setForm({
        fontFamily:        t.fontFamily        || 'Inter, system-ui, sans-serif',
        headingFontFamily: t.headingFontFamily || t.fontFamily || 'Inter, system-ui, sans-serif',
        baseFontSize:      typeof t.baseFontSize === 'number' ? t.baseFontSize : 14,
        headingScale:      typeof t.headingScale === 'number' ? t.headingScale : 1.2,
        borderRadius:      typeof t.borderRadius === 'number' ? t.borderRadius : 8,
        spacingScale:      typeof t.spacingScale === 'number' ? t.spacingScale : 1.0,
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
      await api.patch('/settings', { typography: form, changeNote: 'Typography updated' });
      toast.success('Typography saved.');
      // Triggers root refresh on native, full reload on web to apply typography globally
      if (Platform.OS === 'web') {
        window.location.reload();
      }
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
        <Text style={styles.loadingText}>Loading typography...</Text>
      </View>
    );
  }

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <View style={styles.header}>
        <View style={styles.headerTitleRow}>
          <Ionicons name="text" size={24} color={Colors.primary} style={{ marginRight: Spacing.sm }} />
          <Text style={styles.title}>Typography</Text>
        </View>
        <Text style={styles.subtitle}>Font family, base size, border radius, and spacing scale. Applied globally on save.</Text>
      </View>

      {err ? <Text style={styles.errorText}>{err}</Text> : null}

      {form && (
        <>
          <View style={styles.card}>
            <View style={styles.cardHeader}>
              <Ionicons name="eye" size={16} color={Colors.textLight} style={{ marginRight: Spacing.sm }} />
              <Text style={styles.cardTitle}>Preview</Text>
            </View>
            <View style={styles.cardBody}>
              {/* Note: In React Native, font-family must match exactly registered fonts, but for web testing standard web fonts work. */}
              <Text style={{
                fontFamily: Platform.OS === 'web' ? form.headingFontFamily : undefined,
                fontSize: form.baseFontSize * form.headingScale,
                fontWeight: '700',
                marginBottom: 4,
                color: Colors.text
              }}>
                Heading sample
              </Text>
              <Text style={{
                fontFamily: Platform.OS === 'web' ? form.fontFamily : undefined,
                fontSize: form.baseFontSize,
                marginBottom: 8,
                color: Colors.text
              }}>
                The quick brown fox jumps over the lazy dog. 1234567890.
              </Text>
              <TouchableOpacity style={{
                backgroundColor: Colors.primary,
                paddingVertical: 6 * form.spacingScale,
                paddingHorizontal: 14 * form.spacingScale,
                borderRadius: form.borderRadius,
                alignSelf: 'flex-start'
              }}>
                <Text style={{
                  color: Colors.textInverse,
                  fontSize: form.baseFontSize,
                  fontWeight: '600'
                }}>Sample button</Text>
              </TouchableOpacity>
            </View>
          </View>

          <View style={styles.card}>
            <View style={styles.cardHeader}>
              <Text style={styles.cardTitle}>Fonts</Text>
            </View>
            <View style={styles.cardBody}>
              <Text style={styles.fieldLabel}>Body font family</Text>
              <View style={styles.pickerWrapper}>
                <Picker
                  selectedValue={form.fontFamily}
                  onValueChange={(val) => setForm(p => ({ ...p, fontFamily: val }))}
                  enabled={canWrite}
                  style={styles.picker}
                >
                  {FONT_FAMILY_PRESETS.map(p => <Picker.Item key={p.value} label={p.label} value={p.value} />)}
                </Picker>
              </View>
              <Text style={styles.hint}>Curated list. Custom-uploaded fonts aren't supported (legal/security).</Text>

              <Text style={[styles.fieldLabel, { marginTop: Spacing.md }]}>Heading font family</Text>
              <View style={styles.pickerWrapper}>
                <Picker
                  selectedValue={form.headingFontFamily}
                  onValueChange={(val) => setForm(p => ({ ...p, headingFontFamily: val }))}
                  enabled={canWrite}
                  style={styles.picker}
                >
                  {FONT_FAMILY_PRESETS.map(p => <Picker.Item key={p.value} label={p.label} value={p.value} />)}
                </Picker>
              </View>
              <Text style={styles.hint}>Pair with the body font or pick a contrasting display face for headings.</Text>
            </View>
          </View>

          <View style={styles.card}>
            <View style={styles.cardHeader}>
              <Text style={styles.cardTitle}>Sizing</Text>
            </View>
            <View style={styles.cardBody}>
              <Stepper
                label="Base font size"
                value={form.baseFontSize}
                onChange={(val) => setForm(p => ({ ...p, baseFontSize: val }))}
                min={12} max={18} step={1} format={(v) => `${v}px`}
                disabled={!canWrite}
              />
              <Text style={styles.hint}>Default 14px. Affects every body-text style.</Text>
              
              <Stepper
                label="Heading scale"
                value={form.headingScale}
                onChange={(val) => setForm(p => ({ ...p, headingScale: val }))}
                min={1} max={1.5} step={0.05} format={(v) => `${v.toFixed(2)}×`}
                disabled={!canWrite}
              />
              <Text style={styles.hint}>Multiplier applied to base size for headings.</Text>
              
              <Stepper
                label="Border radius"
                value={form.borderRadius}
                onChange={(val) => setForm(p => ({ ...p, borderRadius: val }))}
                min={0} max={24} step={1} format={(v) => `${v}px`}
                disabled={!canWrite}
              />
              <Text style={styles.hint}>0 = square corners. 24 = very rounded.</Text>
              
              <Stepper
                label="Spacing scale"
                value={form.spacingScale}
                onChange={(val) => setForm(p => ({ ...p, spacingScale: val }))}
                min={0.8} max={1.5} step={0.05} format={(v) => `${v.toFixed(2)}×`}
                disabled={!canWrite}
              />
              <Text style={styles.hint}>Compresses or expands global spacing.</Text>
            </View>
          </View>
        </>
      )}

      {canWrite && (
        <View style={styles.footer}>
          <TouchableOpacity style={styles.cancelBtn} onPress={() => router.push('/admin/settings')} disabled={saving}>
            <Text style={styles.cancelBtnText}>Cancel</Text>
          </TouchableOpacity>
          <TouchableOpacity style={[styles.saveBtn, saving && styles.saveBtnDisabled]} onPress={save} disabled={saving}>
            <Text style={styles.saveBtnText}>{saving ? 'Saving...' : 'Save Typography'}</Text>
          </TouchableOpacity>
        </View>
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
  pickerWrapper: { borderWidth: 1, borderColor: Colors.border, borderRadius: Radius.sm, overflow: 'hidden', backgroundColor: '#fff' },
  picker: { height: 40, ...Platform.select({ web: { outlineStyle: 'none' } }) },
  hint: { fontSize: 11, color: Colors.textLight, marginTop: 4, marginBottom: Spacing.md },

  stepperContainer: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: Spacing.sm },
  stepperControls: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#f1f5f9', borderRadius: Radius.sm, padding: 2 },
  stepperBtn: { padding: 6, backgroundColor: '#fff', borderRadius: 4, borderWidth: 1, borderColor: Colors.border },
  stepperValue: { width: 44, textAlign: 'center', fontSize: FontSize.sm, fontWeight: '600', color: Colors.text },

  footer: { flexDirection: 'row', justifyContent: 'flex-end', marginTop: Spacing.md, gap: Spacing.sm },
  cancelBtn: { paddingVertical: Spacing.sm, paddingHorizontal: Spacing.md, borderRadius: Radius.sm, borderWidth: 1, borderColor: Colors.border },
  cancelBtnText: { color: Colors.text, fontWeight: '600' },
  saveBtn: { backgroundColor: Colors.primary, paddingVertical: Spacing.sm, paddingHorizontal: Spacing.lg, borderRadius: Radius.sm },
  saveBtnDisabled: { opacity: 0.7 },
  saveBtnText: { color: '#fff', fontWeight: '600' },
});
