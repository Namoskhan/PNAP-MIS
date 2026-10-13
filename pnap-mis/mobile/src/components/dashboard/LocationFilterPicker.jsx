import React, { useState, useEffect, useMemo, useCallback } from 'react';
import {
  ActivityIndicator,
  Modal,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { api } from '../../api/client';
import { useLanguage } from '../../context/LanguageContext';
import { Colors, FontSize, Radius, Spacing } from '../../constants/colors';
import Card from '../Card';

/**
 * LocationFilterPicker
 *
 * Cascading geographic filter supporting:
 * 1. Registered provinces horizontal chips (All + individual provinces) — always persistent.
 * 2. Searchable dropdown for Districts (appears when a Province is chosen).
 * 3. Searchable dropdown for Areas (appears when a District is chosen).
 */
export default function LocationFilterPicker({
  selectedProvinceId,
  selectedDistrictId,
  selectedAreaId,
  onSelectProvince,
  onSelectDistrict,
  onSelectArea,
  onReset,
}) {
  const { t, isRTL } = useLanguage();

  // ─── Data State ─────────────────────────────────────────────────────────────
  const [provinces, setProvinces] = useState([]);
  const [districts, setDistricts] = useState([]);
  const [areas, setAreas] = useState([]);

  const [loadingProvinces, setLoadingProvinces] = useState(false);
  const [loadingDistricts, setLoadingDistricts] = useState(false);
  const [loadingAreas, setLoadingAreas] = useState(false);

  // Modal search picker state: { type: 'district' | 'area', title: string, items: Array, selectedId: string }
  const [pickerModal, setPickerModal] = useState(null);
  const [searchQuery, setSearchQuery] = useState('');

  // ─── Fetch Provinces on Mount ──────────────────────────────────────────────
  useEffect(() => {
    let mounted = true;
    setLoadingProvinces(true);
    api.get('/org/provinces')
      .then((res) => {
        if (mounted) {
          setProvinces(res.data?.data || []);
        }
      })
      .catch(() => {
        // Fallback to public provinces endpoint if needed
        api.get('/public/provinces')
          .then((res) => {
            if (mounted) setProvinces(res.data?.data || []);
          })
          .catch(() => {});
      })
      .finally(() => {
        if (mounted) setLoadingProvinces(false);
      });
    return () => { mounted = false; };
  }, []);

  // ─── Fetch Districts when Province changes ─────────────────────────────────
  useEffect(() => {
    if (!selectedProvinceId) {
      setDistricts([]);
      return;
    }
    let mounted = true;
    setLoadingDistricts(true);
    api.get('/org/districts', { params: { provinceId: selectedProvinceId } })
      .then((res) => {
        if (mounted) setDistricts(res.data?.data || []);
      })
      .catch(() => {
        if (mounted) setDistricts([]);
      })
      .finally(() => {
        if (mounted) setLoadingDistricts(false);
      });
    return () => { mounted = false; };
  }, [selectedProvinceId]);

  // ─── Fetch Areas when District changes ─────────────────────────────────────
  useEffect(() => {
    if (!selectedDistrictId) {
      setAreas([]);
      return;
    }
    let mounted = true;
    setLoadingAreas(true);
    api.get('/org/areas', { params: { districtId: selectedDistrictId } })
      .then((res) => {
        if (mounted) setAreas(res.data?.data || []);
      })
      .catch(() => {
        if (mounted) setAreas([]);
      })
      .finally(() => {
        if (mounted) setLoadingAreas(false);
      });
    return () => { mounted = false; };
  }, [selectedDistrictId]);

  // ─── Active entity names ───────────────────────────────────────────────────
  const activeProvince = useMemo(
    () => provinces.find((p) => String(p._id) === String(selectedProvinceId)),
    [provinces, selectedProvinceId]
  );
  const activeDistrict = useMemo(
    () => districts.find((d) => String(d._id) === String(selectedDistrictId)),
    [districts, selectedDistrictId]
  );
  const activeArea = useMemo(
    () => areas.find((a) => String(a._id) === String(selectedAreaId)),
    [areas, selectedAreaId]
  );

  const isFiltered = Boolean(selectedProvinceId || selectedDistrictId || selectedAreaId);

  // ─── Handlers ──────────────────────────────────────────────────────────────
  const handleSelectProvince = (provId) => {
    onSelectProvince(provId);
  };

  const handleOpenPicker = (type) => {
    setSearchQuery('');
    if (type === 'district') {
      setPickerModal({
        type: 'district',
        title: `Districts in ${activeProvince?.name || 'Province'}`,
        items: districts,
        selectedId: selectedDistrictId,
        allLabel: `All Districts in ${activeProvince?.name || 'Province'}`,
      });
    } else if (type === 'area') {
      setPickerModal({
        type: 'area',
        title: `Areas in ${activeDistrict?.name || 'District'}`,
        items: areas,
        selectedId: selectedAreaId,
        allLabel: `All Areas in ${activeDistrict?.name || 'District'}`,
      });
    }
  };

  const handlePickItem = (item) => {
    if (pickerModal?.type === 'district') {
      onSelectDistrict(item ? item._id : null);
    } else if (pickerModal?.type === 'area') {
      onSelectArea(item ? item._id : null);
    }
    setPickerModal(null);
  };

  // Filtered items in the modal search
  const filteredModalItems = useMemo(() => {
    if (!pickerModal) return [];
    if (!searchQuery.trim()) return pickerModal.items;
    const q = searchQuery.toLowerCase().trim();
    return pickerModal.items.filter((item) =>
      (item.name || '').toLowerCase().includes(q)
    );
  }, [pickerModal, searchQuery]);

  return (
    <Card style={styles.card}>
      {/* Header with Title and Clear Action */}
      <View style={[styles.headerRow, isRTL && { flexDirection: 'row-reverse' }]}>
        <View style={[styles.headerLeft, isRTL && { flexDirection: 'row-reverse' }]}>
          <Ionicons name="location-outline" size={16} color={Colors.primary} />
          <Text style={styles.title}>{t('filters.location', 'Location Filters')}</Text>
          {(loadingProvinces || loadingDistricts || loadingAreas) && (
            <ActivityIndicator size="small" color={Colors.primary} style={{ marginLeft: 6 }} />
          )}
        </View>

        {isFiltered && (
          <TouchableOpacity
            style={[styles.resetBtn, isRTL && { flexDirection: 'row-reverse' }]}
            onPress={onReset}
            activeOpacity={0.7}
          >
            <Ionicons name="close-circle" size={14} color={Colors.error} />
            <Text style={styles.resetBtnText}>{t('common.reset', 'Reset')}</Text>
          </TouchableOpacity>
        )}
      </View>

      {/* ── 1. Province Chips (Persistent) ── */}
      <View style={styles.filterSection}>
        <Text style={[styles.sectionLabel, isRTL && { textAlign: 'right' }]}>
          {t('profile.province', 'Province')}
        </Text>
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={[styles.chipsScroll, isRTL && { flexDirection: 'row-reverse' }]}
        >
          {/* "All" Chip */}
          <TouchableOpacity
            style={[
              styles.chip,
              !selectedProvinceId && styles.chipActive,
            ]}
            onPress={() => handleSelectProvince(null)}
            activeOpacity={0.75}
          >
            <Text
              style={[
                styles.chipText,
                !selectedProvinceId && styles.chipTextActive,
              ]}
            >
              {t('common.all', 'All')}
            </Text>
          </TouchableOpacity>

          {/* Registered Provinces */}
          {provinces.map((prov) => {
            const isSelected = String(prov._id) === String(selectedProvinceId);
            return (
              <TouchableOpacity
                key={String(prov._id)}
                style={[styles.chip, isSelected && styles.chipActive]}
                onPress={() => handleSelectProvince(isSelected ? null : prov._id)}
                activeOpacity={0.75}
              >
                <Text style={[styles.chipText, isSelected && styles.chipTextActive]}>
                  {prov.name}
                </Text>
              </TouchableOpacity>
            );
          })}
        </ScrollView>
      </View>

      {/* ── 2. District Dropdown (Visible when Province is chosen) ── */}
      {selectedProvinceId && (
        <View style={styles.filterSection}>
          <Text style={[styles.sectionLabel, isRTL && { textAlign: 'right' }]}>
            {t('profile.district', 'District')}
          </Text>

          <TouchableOpacity
            style={[
              styles.dropdownButton,
              activeDistrict && styles.dropdownButtonActive,
              isRTL && { flexDirection: 'row-reverse' },
            ]}
            onPress={() => handleOpenPicker('district')}
            activeOpacity={0.75}
          >
            <View style={[styles.dropdownLeft, isRTL && { flexDirection: 'row-reverse' }]}>
              <Ionicons
                name="business-outline"
                size={16}
                color={activeDistrict ? Colors.primary : Colors.textMuted}
              />
              <Text
                style={[
                  styles.dropdownText,
                  activeDistrict && styles.dropdownTextActive,
                  isRTL && { textAlign: 'right' },
                ]}
                numberOfLines={1}
              >
                {activeDistrict
                  ? activeDistrict.name
                  : `${t('filters.selectDistrict', 'Select District')} (${districts.length} available)`}
              </Text>
            </View>

            <View style={[styles.dropdownRight, isRTL && { flexDirection: 'row-reverse' }]}>
              {activeDistrict && (
                <TouchableOpacity
                  onPress={(e) => {
                    e.stopPropagation();
                    onSelectDistrict(null);
                  }}
                  hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                  style={{ marginRight: 6 }}
                >
                  <Ionicons name="close-circle" size={16} color={Colors.textMuted} />
                </TouchableOpacity>
              )}
              <Ionicons
                name="chevron-down"
                size={16}
                color={activeDistrict ? Colors.primary : Colors.textMuted}
              />
            </View>
          </TouchableOpacity>
        </View>
      )}

      {/* ── 3. Area Dropdown (Visible when District is chosen) ── */}
      {selectedDistrictId && (
        <View style={styles.filterSection}>
          <Text style={[styles.sectionLabel, isRTL && { textAlign: 'right' }]}>
            {t('profile.area', 'Area')}
          </Text>

          <TouchableOpacity
            style={[
              styles.dropdownButton,
              activeArea && styles.dropdownButtonActive,
              isRTL && { flexDirection: 'row-reverse' },
            ]}
            onPress={() => handleOpenPicker('area')}
            activeOpacity={0.75}
          >
            <View style={[styles.dropdownLeft, isRTL && { flexDirection: 'row-reverse' }]}>
              <Ionicons
                name="pin-outline"
                size={16}
                color={activeArea ? Colors.primary : Colors.textMuted}
              />
              <Text
                style={[
                  styles.dropdownText,
                  activeArea && styles.dropdownTextActive,
                  isRTL && { textAlign: 'right' },
                ]}
                numberOfLines={1}
              >
                {activeArea
                  ? activeArea.name
                  : `${t('filters.selectArea', 'Select Area')} (${areas.length} available)`}
              </Text>
            </View>

            <View style={[styles.dropdownRight, isRTL && { flexDirection: 'row-reverse' }]}>
              {activeArea && (
                <TouchableOpacity
                  onPress={(e) => {
                    e.stopPropagation();
                    onSelectArea(null);
                  }}
                  hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                  style={{ marginRight: 6 }}
                >
                  <Ionicons name="close-circle" size={16} color={Colors.textMuted} />
                </TouchableOpacity>
              )}
              <Ionicons
                name="chevron-down"
                size={16}
                color={activeArea ? Colors.primary : Colors.textMuted}
              />
            </View>
          </TouchableOpacity>
        </View>
      )}

      {/* Active Scope Summary Breadcrumb */}
      {isFiltered && (
        <View style={[styles.activeScopeBar, isRTL && { flexDirection: 'row-reverse' }]}>
          <Text style={styles.activeScopeLabel}>Filtered to:</Text>
          <Text style={styles.activeScopeText} numberOfLines={1}>
            {activeProvince?.name || 'All'}
            {activeDistrict ? ` → ${activeDistrict.name}` : ''}
            {activeArea ? ` → ${activeArea.name}` : ''}
          </Text>
        </View>
      )}

      {/* ── Searchable Picker Modal ── */}
      <Modal
        visible={!!pickerModal}
        transparent
        animationType="fade"
        onRequestClose={() => setPickerModal(null)}
      >
        <SafeAreaView style={styles.modalOverlay}>
          <View style={styles.modalCard}>
            {/* Modal Header */}
            <View style={[styles.modalHeader, isRTL && { flexDirection: 'row-reverse' }]}>
              <Text style={styles.modalTitle}>{pickerModal?.title}</Text>
              <TouchableOpacity
                onPress={() => setPickerModal(null)}
                style={styles.modalCloseBtn}
              >
                <Ionicons name="close" size={20} color={Colors.text} />
              </TouchableOpacity>
            </View>

            {/* Type/Search Input */}
            <View style={[styles.searchBox, isRTL && { flexDirection: 'row-reverse' }]}>
              <Ionicons name="search" size={18} color={Colors.textMuted} />
              <TextInput
                style={[styles.searchInput, isRTL && { textAlign: 'right' }]}
                placeholder={`Type to search ${pickerModal?.type === 'district' ? 'districts' : 'areas'}…`}
                placeholderTextColor={Colors.textMuted}
                value={searchQuery}
                onChangeText={setSearchQuery}
                autoCorrect={false}
                autoCapitalize="none"
                clearButtonMode="while-editing"
              />
              {searchQuery.length > 0 && (
                <TouchableOpacity onPress={() => setSearchQuery('')}>
                  <Ionicons name="close-circle" size={16} color={Colors.textMuted} />
                </TouchableOpacity>
              )}
            </View>

            {/* List */}
            <ScrollView
              style={styles.modalList}
              keyboardShouldPersistTaps="handled"
              showsVerticalScrollIndicator={true}
            >
              {/* Option to clear / select all */}
              <TouchableOpacity
                style={[
                  styles.modalItem,
                  !pickerModal?.selectedId && styles.modalItemActive,
                  isRTL && { flexDirection: 'row-reverse' },
                ]}
                onPress={() => handlePickItem(null)}
              >
                <View style={{ flex: 1 }}>
                  <Text
                    style={[
                      styles.modalItemText,
                      !pickerModal?.selectedId && styles.modalItemTextActive,
                    ]}
                  >
                    {pickerModal?.allLabel || 'All'}
                  </Text>
                  <Text style={styles.modalItemSub}>Show aggregated statistics</Text>
                </View>
                {!pickerModal?.selectedId && (
                  <Ionicons name="checkmark-circle" size={18} color={Colors.primary} />
                )}
              </TouchableOpacity>

              {/* Filtered items */}
              {filteredModalItems.map((item) => {
                const isSelected = String(item._id) === String(pickerModal?.selectedId);
                return (
                  <TouchableOpacity
                    key={String(item._id)}
                    style={[
                      styles.modalItem,
                      isSelected && styles.modalItemActive,
                      isRTL && { flexDirection: 'row-reverse' },
                    ]}
                    onPress={() => handlePickItem(item)}
                  >
                    <Text
                      style={[
                        styles.modalItemText,
                        isSelected && styles.modalItemTextActive,
                        isRTL && { textAlign: 'right' },
                      ]}
                    >
                      {item.name}
                    </Text>
                    {isSelected && (
                      <Ionicons name="checkmark-circle" size={18} color={Colors.primary} />
                    )}
                  </TouchableOpacity>
                );
              })}

              {filteredModalItems.length === 0 && (
                <View style={styles.emptyContainer}>
                  <Text style={styles.emptyText}>
                    No matches found for "{searchQuery}"
                  </Text>
                </View>
              )}
            </ScrollView>
          </View>
        </SafeAreaView>
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
  headerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  title: {
    fontSize: FontSize.sm,
    fontWeight: '700',
    color: Colors.text,
  },
  resetBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  resetBtnText: {
    fontSize: FontSize.xs,
    fontWeight: '600',
    color: Colors.error,
  },
  filterSection: {
    gap: 6,
  },
  sectionLabel: {
    fontSize: 11,
    fontWeight: '700',
    color: Colors.textMuted,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  chipsScroll: {
    flexDirection: 'row',
    gap: 8,
    paddingVertical: 2,
  },
  chip: {
    paddingHorizontal: 14,
    paddingVertical: 7,
    borderRadius: Radius.full || 20,
    backgroundColor: Colors.surfaceAlt || '#f1f5f9',
    borderWidth: 1,
    borderColor: Colors.border || '#e2e8f0',
  },
  chipActive: {
    backgroundColor: Colors.primary,
    borderColor: Colors.primary,
  },
  chipText: {
    fontSize: FontSize.xs,
    fontWeight: '600',
    color: Colors.textMuted || '#64748b',
  },
  chipTextActive: {
    color: '#ffffff',
    fontWeight: '700',
  },
  dropdownButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: Spacing.sm,
    paddingVertical: 10,
    borderRadius: Radius.md,
    backgroundColor: Colors.surfaceAlt || '#f8fafc',
    borderWidth: 1,
    borderColor: Colors.border || '#cbd5e1',
  },
  dropdownButtonActive: {
    borderColor: Colors.primary,
    backgroundColor: 'rgba(30, 64, 175, 0.04)',
  },
  dropdownLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    flex: 1,
  },
  dropdownRight: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  dropdownText: {
    fontSize: FontSize.sm,
    color: Colors.textMuted,
    flex: 1,
  },
  dropdownTextActive: {
    color: Colors.text,
    fontWeight: '600',
  },
  activeScopeBar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: 'rgba(30, 64, 175, 0.06)',
    paddingVertical: 6,
    paddingHorizontal: 10,
    borderRadius: Radius.sm,
    marginTop: 4,
  },
  activeScopeLabel: {
    fontSize: 11,
    fontWeight: '600',
    color: Colors.primary,
  },
  activeScopeText: {
    fontSize: 11,
    fontWeight: '700',
    color: Colors.primary,
    flex: 1,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.45)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: Spacing.md,
  },
  modalCard: {
    width: '100%',
    maxHeight: '80%',
    backgroundColor: Colors.surface || '#ffffff',
    borderRadius: Radius.lg,
    padding: Spacing.md,
    gap: Spacing.sm,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.25,
    shadowRadius: 10,
    elevation: 8,
  },
  modalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingBottom: Spacing.xs,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
  },
  modalTitle: {
    fontSize: FontSize.md,
    fontWeight: '700',
    color: Colors.text,
    flex: 1,
  },
  modalCloseBtn: {
    padding: 4,
  },
  searchBox: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.surfaceAlt || '#f1f5f9',
    borderRadius: Radius.md,
    paddingHorizontal: Spacing.sm,
    paddingVertical: 8,
    gap: 8,
  },
  searchInput: {
    flex: 1,
    fontSize: FontSize.sm,
    color: Colors.text,
    padding: 0,
  },
  modalList: {
    maxHeight: 320,
  },
  modalItem: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 12,
    paddingHorizontal: Spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border || '#f1f5f9',
  },
  modalItemActive: {
    backgroundColor: 'rgba(30, 64, 175, 0.05)',
  },
  modalItemText: {
    fontSize: FontSize.sm,
    color: Colors.text,
    fontWeight: '500',
  },
  modalItemTextActive: {
    color: Colors.primary,
    fontWeight: '700',
  },
  modalItemSub: {
    fontSize: 11,
    color: Colors.textMuted,
    marginTop: 2,
  },
  emptyContainer: {
    paddingVertical: Spacing.lg,
    alignItems: 'center',
  },
  emptyText: {
    fontSize: FontSize.sm,
    color: Colors.textMuted,
  },
});
