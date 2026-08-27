import { useEffect, useMemo, useState } from 'react';
import {
  Modal,
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  ActivityIndicator,
} from 'react-native';
import { useUnit } from '../context/UnitContext';
import { useAuth } from '../context/AuthContext';
import { homeTierOf } from '../utils/unitTier';
import { api } from '../api/client';
import { Colors, FontSize, Radius, Spacing } from '../constants/colors';

const LEVELS = [
  { code: 'CENTRAL', label: 'Central' },
  { code: 'PROVINCE', label: 'Province' },
  { code: 'DISTRICT', label: 'District' },
  { code: 'AREA', label: 'Area' },
  { code: 'BASIC_UNIT', label: 'Basic Unit' },
];

export default function UnitSwitcherModal({ visible, onClose }) {
  const u = useUnit();
  const { user } = useAuth();

  const home = useMemo(() => homeTierOf(user), [user]);
  const allowedLevels = useMemo(() => {
    const start = LEVELS.findIndex((l) => l.code === home.level);
    return LEVELS.slice(start < 0 ? 0 : start);
  }, [home.level]);

  const [level, setLevel] = useState(u.ctx?.unitLevel || home.level);
  const [provinceId, setProvinceId] = useState(home.fixed.provinceId || '');
  const [districtId, setDistrictId] = useState(home.fixed.districtId || '');
  const [areaId, setAreaId] = useState(home.fixed.areaId || '');
  const [unitId, setUnitId] = useState('');
  const [err, setErr] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (visible) {
      setLevel(u.ctx?.unitLevel || home.level);
      setProvinceId(home.fixed.provinceId || (u.ctx?.unitLevel === 'PROVINCE' ? u.ctx.unitId : ''));
      setDistrictId(home.fixed.districtId || (u.ctx?.unitLevel === 'DISTRICT' ? u.ctx.unitId : ''));
      setAreaId(home.fixed.areaId || (u.ctx?.unitLevel === 'AREA' ? u.ctx.unitId : ''));
      setUnitId(u.ctx?.unitLevel === 'BASIC_UNIT' ? u.ctx.unitId : '');
      setErr('');
    }
  }, [visible, u.ctx]);

  useEffect(() => {
    if (provinceId) u.loadDistricts(provinceId);
    if (!home.fixed.districtId) { setDistrictId(''); setAreaId(''); setUnitId(''); }
  }, [provinceId]);

  useEffect(() => {
    if (districtId) u.loadAreas(districtId);
    if (!home.fixed.areaId) { setAreaId(''); setUnitId(''); }
  }, [districtId]);

  useEffect(() => {
    if (areaId) u.loadUnits(areaId);
    setUnitId('');
  }, [areaId]);

  async function handleApply() {
    setErr('');
    setSaving(true);
    try {
      if (level === 'CENTRAL') {
        const r = await api.get('/org/central');
        await u.setCtx({
          unitLevel: 'CENTRAL',
          unitId: r.data.data._id,
          unitName: r.data.data.name || 'PKNAP Central',
        });
        onClose();
        return;
      }

      let id = null, name = '';
      if (level === 'PROVINCE') {
        id = provinceId;
        name = (u.provinces || []).find((p) => String(p._id) === String(id))?.name;
      } else if (level === 'DISTRICT') {
        id = districtId;
        name = (u.districts || []).find((d) => String(d._id) === String(id))?.name;
      } else if (level === 'AREA') {
        id = areaId;
        name = (u.areas || []).find((a) => String(a._id) === String(id))?.name;
      } else if (level === 'BASIC_UNIT') {
        id = unitId;
        name = (u.units || []).find((b) => String(b._id) === String(id))?.name;
      }

      if (!id) {
        setErr('Please select a unit to proceed.');
        return;
      }

      await u.setCtx({ unitLevel: level, unitId: id, unitName: name || 'Selected Unit' });
      onClose();
    } catch {
      setErr('Could not switch unit context.');
    } finally {
      setSaving(false);
    }
  }

  const lock = {
    province: Boolean(home.fixed.provinceId),
    district: Boolean(home.fixed.districtId),
    area: Boolean(home.fixed.areaId),
  };

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <View style={styles.overlay}>
        <View style={styles.modalCard}>
          <View style={styles.header}>
            <View>
              <Text style={styles.title}>Unit Context</Text>
              <Text style={styles.subtitle}>Select active organizational unit</Text>
            </View>
            <TouchableOpacity onPress={onClose} style={styles.closeBtn}>
              <Text style={styles.closeText}>✕</Text>
            </TouchableOpacity>
          </View>

          {err ? <Text style={styles.errorBanner}>{err}</Text> : null}

          <ScrollView style={styles.scroll} showsVerticalScrollIndicator={false}>
            {/* Level selection chips */}
            <Text style={styles.sectionLabel}>HIERARCHY LEVEL</Text>
            <View style={styles.chipsRow}>
              {allowedLevels.map((l) => (
                <TouchableOpacity
                  key={l.code}
                  style={[styles.chip, level === l.code && styles.chipActive]}
                  onPress={() => { setLevel(l.code); setErr(''); }}
                >
                  <Text style={[styles.chipText, level === l.code && styles.chipTextActive]}>
                    {l.label}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>

            {/* Province selection */}
            {['PROVINCE', 'DISTRICT', 'AREA', 'BASIC_UNIT'].includes(level) && (
              <View style={styles.fieldGroup}>
                <Text style={styles.fieldLabel}>PROVINCE {lock.province ? '(Fixed)' : ''}</Text>
                <View style={styles.pickerBox}>
                  {(u.provinces || []).map((p) => {
                    const isSelected = String(provinceId) === String(p._id);
                    return (
                      <TouchableOpacity
                        key={p._id}
                        disabled={lock.province}
                        style={[styles.optionItem, isSelected && styles.optionItemSelected]}
                        onPress={() => setProvinceId(p._id)}
                      >
                        <Text style={[styles.optionText, isSelected && styles.optionTextSelected]}>
                          {p.name} ({p.code || 'PRV'})
                        </Text>
                        {isSelected && <Text style={styles.check}>✓</Text>}
                      </TouchableOpacity>
                    );
                  })}
                </View>
              </View>
            )}

            {/* District selection */}
            {['DISTRICT', 'AREA', 'BASIC_UNIT'].includes(level) && (
              <View style={styles.fieldGroup}>
                <Text style={styles.fieldLabel}>DISTRICT {lock.district ? '(Fixed)' : ''}</Text>
                <View style={styles.pickerBox}>
                  {(u.districts || []).length === 0 ? (
                    <Text style={styles.mutedPlaceholder}>No districts loaded for this province.</Text>
                  ) : (
                    (u.districts || []).map((d) => {
                      const isSelected = String(districtId) === String(d._id);
                      return (
                        <TouchableOpacity
                          key={d._id}
                          disabled={lock.district}
                          style={[styles.optionItem, isSelected && styles.optionItemSelected]}
                          onPress={() => setDistrictId(d._id)}
                        >
                          <Text style={[styles.optionText, isSelected && styles.optionTextSelected]}>
                            {d.name}
                          </Text>
                          {isSelected && <Text style={styles.check}>✓</Text>}
                        </TouchableOpacity>
                      );
                    })
                  )}
                </View>
              </View>
            )}

            {/* Area selection */}
            {['AREA', 'BASIC_UNIT'].includes(level) && (
              <View style={styles.fieldGroup}>
                <Text style={styles.fieldLabel}>AREA {lock.area ? '(Fixed)' : ''}</Text>
                <View style={styles.pickerBox}>
                  {(u.areas || []).length === 0 ? (
                    <Text style={styles.mutedPlaceholder}>No areas loaded for this district.</Text>
                  ) : (
                    (u.areas || []).map((a) => {
                      const isSelected = String(areaId) === String(a._id);
                      return (
                        <TouchableOpacity
                          key={a._id}
                          disabled={lock.area}
                          style={[styles.optionItem, isSelected && styles.optionItemSelected]}
                          onPress={() => setAreaId(a._id)}
                        >
                          <Text style={[styles.optionText, isSelected && styles.optionTextSelected]}>
                            {a.name}
                          </Text>
                          {isSelected && <Text style={styles.check}>✓</Text>}
                        </TouchableOpacity>
                      );
                    })
                  )}
                </View>
              </View>
            )}

            {/* Basic Unit selection */}
            {level === 'BASIC_UNIT' && (
              <View style={styles.fieldGroup}>
                <Text style={styles.fieldLabel}>BASIC UNIT</Text>
                <View style={styles.pickerBox}>
                  {(u.units || []).length === 0 ? (
                    <Text style={styles.mutedPlaceholder}>Select an area first to view basic units.</Text>
                  ) : (
                    (u.units || []).map((b) => {
                      const isSelected = String(unitId) === String(b._id);
                      return (
                        <TouchableOpacity
                          key={b._id}
                          style={[styles.optionItem, isSelected && styles.optionItemSelected]}
                          onPress={() => setUnitId(b._id)}
                        >
                          <Text style={[styles.optionText, isSelected && styles.optionTextSelected]}>
                            {b.name}
                          </Text>
                          {isSelected && <Text style={styles.check}>✓</Text>}
                        </TouchableOpacity>
                      );
                    })
                  )}
                </View>
              </View>
            )}
          </ScrollView>

          {/* Action buttons */}
          <View style={styles.actions}>
            <TouchableOpacity style={styles.cancelBtn} onPress={onClose}>
              <Text style={styles.cancelText}>Cancel</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.applyBtn} onPress={handleApply} disabled={saving}>
              {saving ? (
                <ActivityIndicator size="small" color="#fff" />
              ) : (
                <Text style={styles.applyText}>Switch Context</Text>
              )}
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'center',
    padding: Spacing.lg,
  },
  modalCard: {
    backgroundColor: Colors.surface,
    borderRadius: Radius.xl,
    padding: Spacing.lg,
    maxHeight: '85%',
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: Spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
    paddingBottom: Spacing.sm,
  },
  title: {
    fontSize: FontSize.lg,
    fontWeight: '800',
    color: Colors.text,
  },
  subtitle: {
    fontSize: FontSize.xs,
    color: Colors.textMuted,
    marginTop: 2,
  },
  closeBtn: {
    padding: 6,
    borderRadius: Radius.full,
    backgroundColor: Colors.surfaceAlt,
  },
  closeText: {
    fontSize: 14,
    color: Colors.textMuted,
    fontWeight: '700',
  },
  errorBanner: {
    backgroundColor: '#fee2e2',
    color: '#991b1b',
    padding: 8,
    borderRadius: Radius.md,
    fontSize: FontSize.xs,
    fontWeight: '600',
    marginBottom: Spacing.sm,
  },
  scroll: {
    marginBottom: Spacing.md,
  },
  sectionLabel: {
    fontSize: 10,
    fontWeight: '700',
    color: Colors.textMuted,
    letterSpacing: 0.8,
    marginBottom: 8,
  },
  chipsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
    marginBottom: Spacing.md,
  },
  chip: {
    paddingVertical: 6,
    paddingHorizontal: 12,
    borderRadius: Radius.pill,
    backgroundColor: Colors.surfaceAlt,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  chipActive: {
    backgroundColor: Colors.primary,
    borderColor: Colors.primary,
  },
  chipText: {
    fontSize: FontSize.xs,
    fontWeight: '600',
    color: Colors.text,
  },
  chipTextActive: {
    color: '#fff',
  },
  fieldGroup: {
    marginBottom: Spacing.md,
  },
  fieldLabel: {
    fontSize: 10,
    fontWeight: '700',
    color: Colors.textMuted,
    letterSpacing: 0.8,
    marginBottom: 6,
  },
  pickerBox: {
    backgroundColor: Colors.surfaceAlt,
    borderRadius: Radius.md,
    padding: 4,
    borderWidth: 1,
    borderColor: Colors.border,
    maxHeight: 140,
  },
  optionItem: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 8,
    paddingHorizontal: 10,
    borderRadius: Radius.sm,
  },
  optionItemSelected: {
    backgroundColor: Colors.surface,
  },
  optionText: {
    fontSize: FontSize.sm,
    color: Colors.text,
  },
  optionTextSelected: {
    fontWeight: '700',
    color: Colors.primary,
  },
  check: {
    color: Colors.primary,
    fontWeight: '800',
    fontSize: 12,
  },
  mutedPlaceholder: {
    fontSize: FontSize.xs,
    color: Colors.textMuted,
    padding: 8,
    fontStyle: 'italic',
  },
  actions: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: Spacing.sm,
    paddingTop: Spacing.sm,
    borderTopWidth: 1,
    borderTopColor: Colors.border,
  },
  cancelBtn: {
    paddingVertical: 10,
    paddingHorizontal: 16,
    borderRadius: Radius.md,
  },
  cancelText: {
    fontSize: FontSize.sm,
    fontWeight: '600',
    color: Colors.textMuted,
  },
  applyBtn: {
    backgroundColor: Colors.primary,
    paddingVertical: 10,
    paddingHorizontal: 20,
    borderRadius: Radius.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
  applyText: {
    color: '#fff',
    fontSize: FontSize.sm,
    fontWeight: '700',
  },
});
