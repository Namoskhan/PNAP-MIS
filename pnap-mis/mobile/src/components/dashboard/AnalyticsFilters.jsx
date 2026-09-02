import { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Modal,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { api } from '../../api/client';
import { Colors, FontSize, Radius, Spacing } from '../../constants/colors';
import Card from '../Card';

const PRESETS = [
  { days: 30, label: '30d' },
  { days: 90, label: '90d' },
  { days: 180, label: '6m' },
  { days: 365, label: '1yr' },
];

const MEMBER_STATUSES = [
  { key: '', label: 'All Member Statuses' },
  { key: 'ACTIVE', label: 'Active' },
  { key: 'PENDING_APPROVAL', label: 'Pending Approval' },
  { key: 'INACTIVE', label: 'Inactive' },
  { key: 'SUSPENDED', label: 'Suspended' },
  { key: 'REJECTED', label: 'Rejected' },
  { key: 'EXPELLED', label: 'Expelled' },
  { key: 'DECEASED', label: 'Deceased' },
];

const ORG_STATUSES = [
  { key: '', label: 'All Org Statuses' },
  { key: 'ACTIVE', label: 'Working / Active Units' },
  { key: 'INACTIVE', label: 'Dormant / Silent Units' },
];

export default function AnalyticsFilters({
  scope,
  filters,
  onScope,
  onFilters,
  busy,
  lockScope = false,
}) {
  const [provinces, setProvinces] = useState([]);
  const [districts, setDistricts] = useState([]);
  const [areas, setAreas] = useState([]);
  const [units, setUnits] = useState([]);

  const [pickerModal, setPickerModal] = useState(null); // { title, items, selected, onSelect }

  useEffect(() => {
    api.get('/org/provinces')
      .then((r) => setProvinces(r.data?.data || []))
      .catch(() => {});
  }, []);

  useEffect(() => {
    if (!scope.provinceId) {
      setDistricts([]);
      return;
    }
    api.get('/org/districts', { params: { provinceId: scope.provinceId } })
      .then((r) => setDistricts(r.data?.data || []))
      .catch(() => setDistricts([]));
  }, [scope.provinceId]);

  useEffect(() => {
    if (!scope.districtId) {
      setAreas([]);
      return;
    }
    api.get('/org/areas', { params: { districtId: scope.districtId } })
      .then((r) => setAreas(r.data?.data || []))
      .catch(() => setAreas([]));
  }, [scope.districtId]);

  useEffect(() => {
    if (!scope.areaId) {
      setUnits([]);
      return;
    }
    api.get('/org/basic-units', { params: { areaId: scope.areaId } })
      .then((r) => setUnits(r.data?.data || []))
      .catch(() => setUnits([]));
  }, [scope.areaId]);

  const isFiltered = Boolean(
    scope.provinceId ||
    scope.districtId ||
    scope.areaId ||
    scope.basicUnitId ||
    filters.memberStatus ||
    filters.orgStatus ||
    filters.days !== 365
  );

  const activeProvince = provinces.find((p) => String(p._id) === String(scope.provinceId));
  const activeDistrict = districts.find((d) => String(d._id) === String(scope.districtId));
  const activeArea = areas.find((a) => String(a._id) === String(scope.areaId));
  const activeUnit = units.find((u) => String(u._id) === String(scope.basicUnitId));

  const memberStatusLabel = MEMBER_STATUSES.find((s) => s.key === filters.memberStatus)?.label || 'Member Status';
  const orgStatusLabel = ORG_STATUSES.find((s) => s.key === filters.orgStatus)?.label || 'Org Status';

  function openPicker(title, items, selected, onSelect) {
    setPickerModal({ title, items, selected, onSelect });
  }

  return (
    <Card style={styles.card}>
      <View style={styles.headerRow}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
          <Text style={styles.title}>Filters & Scope</Text>
          {busy && <ActivityIndicator size="small" color={Colors.primary} />}
        </View>
        {isFiltered && (
          <TouchableOpacity
            onPress={() => {
              if (!lockScope) onScope({ provinceId: '', districtId: '', areaId: '', basicUnitId: '' });
              onFilters({ days: 365, memberStatus: '', orgStatus: '' });
            }}
          >
            <Text style={styles.resetBtnText}>Reset All</Text>
          </TouchableOpacity>
        )}
      </View>

      {/* Date Range Selector */}
      <View style={styles.filterSection}>
        <Text style={styles.sectionLabel}>Time Span:</Text>
        <View style={styles.pillRow}>
          {PRESETS.map((p) => {
            const active = filters.days === p.days;
            return (
              <TouchableOpacity
                key={p.days}
                style={[styles.pill, active && styles.pillActive]}
                onPress={() => onFilters({ ...filters, days: p.days })}
              >
                <Text style={[styles.pillText, active && styles.pillTextActive]}>
                  {p.label}
                </Text>
              </TouchableOpacity>
            );
          })}
        </View>
      </View>

      {/* Scope Cascading Filters */}
      {!lockScope && (
        <View style={styles.filterSection}>
          <Text style={styles.sectionLabel}>Territorial Scope:</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.scopeRow}>
            {/* Province selector */}
            <TouchableOpacity
              style={[styles.selectBtn, scope.provinceId && styles.selectBtnActive]}
              onPress={() =>
                openPicker(
                  'Select Province',
                  [{ _id: '', name: 'All Provinces (National)' }, ...provinces],
                  scope.provinceId,
                  (val) => onScope({ provinceId: val, districtId: '', areaId: '', basicUnitId: '' })
                )
              }
            >
              <Text style={[styles.selectBtnText, scope.provinceId && styles.selectBtnTextActive]} numberOfLines={1}>
                {activeProvince ? activeProvince.name : 'All Provinces'}
              </Text>
              <Text style={styles.selectBtnArrow}>▼</Text>
            </TouchableOpacity>

            {/* District selector */}
            <TouchableOpacity
              disabled={!scope.provinceId}
              style={[styles.selectBtn, !scope.provinceId && styles.selectBtnDisabled, scope.districtId && styles.selectBtnActive]}
              onPress={() =>
                openPicker(
                  'Select District',
                  [{ _id: '', name: 'All Districts' }, ...districts],
                  scope.districtId,
                  (val) => onScope({ ...scope, districtId: val, areaId: '', basicUnitId: '' })
                )
              }
            >
              <Text style={[styles.selectBtnText, scope.districtId && styles.selectBtnTextActive]} numberOfLines={1}>
                {activeDistrict ? activeDistrict.name : 'All Districts'}
              </Text>
              <Text style={styles.selectBtnArrow}>▼</Text>
            </TouchableOpacity>

            {/* Area selector */}
            <TouchableOpacity
              disabled={!scope.districtId}
              style={[styles.selectBtn, !scope.districtId && styles.selectBtnDisabled, scope.areaId && styles.selectBtnActive]}
              onPress={() =>
                openPicker(
                  'Select Area',
                  [{ _id: '', name: 'All Areas' }, ...areas],
                  scope.areaId,
                  (val) => onScope({ ...scope, areaId: val, basicUnitId: '' })
                )
              }
            >
              <Text style={[styles.selectBtnText, scope.areaId && styles.selectBtnTextActive]} numberOfLines={1}>
                {activeArea ? activeArea.name : 'All Areas'}
              </Text>
              <Text style={styles.selectBtnArrow}>▼</Text>
            </TouchableOpacity>

            {/* Basic Unit selector */}
            <TouchableOpacity
              disabled={!scope.areaId}
              style={[styles.selectBtn, !scope.areaId && styles.selectBtnDisabled, scope.basicUnitId && styles.selectBtnActive]}
              onPress={() =>
                openPicker(
                  'Select Basic Unit',
                  [{ _id: '', name: 'All Basic Units' }, ...units],
                  scope.basicUnitId,
                  (val) => onScope({ ...scope, basicUnitId: val })
                )
              }
            >
              <Text style={[styles.selectBtnText, scope.basicUnitId && styles.selectBtnTextActive]} numberOfLines={1}>
                {activeUnit ? activeUnit.name : 'All Basic Units'}
              </Text>
              <Text style={styles.selectBtnArrow}>▼</Text>
            </TouchableOpacity>
          </ScrollView>
        </View>
      )}

      {/* Member & Org Status Filters */}
      <View style={styles.filterSection}>
        <Text style={styles.sectionLabel}>Status Filters:</Text>
        <View style={styles.statusRow}>
          <TouchableOpacity
            style={[styles.selectBtn, { flex: 1 }, filters.memberStatus && styles.selectBtnActive]}
            onPress={() =>
              openPicker(
                'Select Member Status',
                MEMBER_STATUSES.map((s) => ({ _id: s.key, name: s.label })),
                filters.memberStatus,
                (val) => onFilters({ ...filters, memberStatus: val })
              )
            }
          >
            <Text style={[styles.selectBtnText, filters.memberStatus && styles.selectBtnTextActive]} numberOfLines={1}>
              {memberStatusLabel}
            </Text>
            <Text style={styles.selectBtnArrow}>▼</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.selectBtn, { flex: 1 }, filters.orgStatus && styles.selectBtnActive]}
            onPress={() =>
              openPicker(
                'Select Org Status',
                ORG_STATUSES.map((s) => ({ _id: s.key, name: s.label })),
                filters.orgStatus,
                (val) => onFilters({ ...filters, orgStatus: val })
              )
            }
          >
            <Text style={[styles.selectBtnText, filters.orgStatus && styles.selectBtnTextActive]} numberOfLines={1}>
              {orgStatusLabel}
            </Text>
            <Text style={styles.selectBtnArrow}>▼</Text>
          </TouchableOpacity>
        </View>
      </View>

      {/* Selection Modal */}
      <Modal visible={!!pickerModal} transparent animationType="fade">
        <View style={styles.modalOverlay}>
          <View style={styles.modalCard}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>{pickerModal?.title}</Text>
              <TouchableOpacity onPress={() => setPickerModal(null)}>
                <Text style={styles.modalClose}>✕</Text>
              </TouchableOpacity>
            </View>

            <ScrollView style={styles.modalList}>
              {pickerModal?.items.map((item) => {
                const isSelected = String(pickerModal.selected || '') === String(item._id || '');
                return (
                  <TouchableOpacity
                    key={String(item._id || 'all')}
                    style={[styles.modalItem, isSelected && styles.modalItemActive]}
                    onPress={() => {
                      pickerModal.onSelect(item._id);
                      setPickerModal(null);
                    }}
                  >
                    <Text style={[styles.modalItemText, isSelected && styles.modalItemTextActive]}>
                      {item.name}
                    </Text>
                    {isSelected && <Text style={styles.modalCheck}>✓</Text>}
                  </TouchableOpacity>
                );
              })}
            </ScrollView>
          </View>
        </View>
      </Modal>
    </Card>
  );
}

const styles = StyleSheet.create({
  card: {
    padding: Spacing.md,
    marginBottom: Spacing.md,
    gap: Spacing.sm,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
    paddingBottom: Spacing.xs,
  },
  title: {
    fontSize: FontSize.sm,
    fontWeight: '700',
    color: Colors.text,
  },
  resetBtnText: {
    fontSize: FontSize.xs,
    fontWeight: '600',
    color: Colors.error,
  },
  filterSection: {
    gap: 4,
  },
  sectionLabel: {
    fontSize: 10,
    fontWeight: '700',
    color: Colors.textMuted,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  pillRow: {
    flexDirection: 'row',
    gap: 6,
  },
  pill: {
    flex: 1,
    paddingVertical: 6,
    borderRadius: Radius.sm,
    backgroundColor: Colors.surfaceAlt,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: Colors.border,
  },
  pillActive: {
    backgroundColor: Colors.primary,
    borderColor: Colors.primary,
  },
  pillText: {
    fontSize: FontSize.xs,
    fontWeight: '600',
    color: Colors.textMuted,
  },
  pillTextActive: {
    color: '#fff',
    fontWeight: '700',
  },
  scopeRow: {
    flexDirection: 'row',
    gap: 6,
    paddingVertical: 2,
  },
  statusRow: {
    flexDirection: 'row',
    gap: 6,
  },
  selectBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: Colors.surfaceAlt,
    paddingVertical: 7,
    paddingHorizontal: 10,
    borderRadius: Radius.sm,
    borderWidth: 1,
    borderColor: Colors.border,
    minWidth: 120,
    gap: 6,
  },
  selectBtnActive: {
    backgroundColor: 'rgba(30, 64, 175, 0.08)',
    borderColor: Colors.primary,
  },
  selectBtnDisabled: {
    opacity: 0.45,
  },
  selectBtnText: {
    fontSize: FontSize.xs,
    fontWeight: '600',
    color: Colors.text,
    flex: 1,
  },
  selectBtnTextActive: {
    color: Colors.primary,
    fontWeight: '700',
  },
  selectBtnArrow: {
    fontSize: 8,
    color: Colors.textMuted,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: Spacing.lg,
  },
  modalCard: {
    backgroundColor: Colors.surface,
    borderRadius: Radius.lg,
    width: '100%',
    maxHeight: '75%',
    padding: Spacing.md,
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
    paddingBottom: Spacing.sm,
    marginBottom: Spacing.xs,
  },
  modalTitle: {
    fontSize: FontSize.md,
    fontWeight: '700',
    color: Colors.text,
  },
  modalClose: {
    fontSize: 18,
    color: Colors.textMuted,
    fontWeight: '700',
    paddingHorizontal: 4,
  },
  modalList: {
    maxHeight: 350,
  },
  modalItem: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 12,
    paddingHorizontal: 10,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
  },
  modalItemActive: {
    backgroundColor: 'rgba(30, 64, 175, 0.08)',
  },
  modalItemText: {
    fontSize: FontSize.sm,
    fontWeight: '600',
    color: Colors.text,
  },
  modalItemTextActive: {
    color: Colors.primary,
    fontWeight: '700',
  },
  modalCheck: {
    fontSize: FontSize.sm,
    color: Colors.primary,
    fontWeight: '800',
  },
});
