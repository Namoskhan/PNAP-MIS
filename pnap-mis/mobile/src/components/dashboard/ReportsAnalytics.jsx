import { useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Modal,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import useAnalytics from '../../hooks/useAnalytics';
import { api } from '../../api/client';
import { useToast } from '../Toast';
import { Colors, FontSize, Radius, Spacing } from '../../constants/colors';
import Card from '../Card';
import { Donut, SmartKpi, StackedHBar } from '../charts';
import { downloadAndShare } from '../../utils/export';

const LEVEL_NOUN = {
  PROVINCE: 'Province',
  DISTRICT: 'District',
  AREA: 'Area',
  BASIC_UNIT: 'Basic Unit',
};

const LEVELS = ['CENTRAL', 'PROVINCE', 'DISTRICT', 'AREA', 'BASIC_UNIT'];
const LEVEL_LABEL = {
  CENTRAL: 'Central',
  PROVINCE: 'Province',
  DISTRICT: 'District',
  AREA: 'Area',
  BASIC_UNIT: 'Basic Unit',
};
const KEY_OF = {
  PROVINCE: 'provinceId',
  DISTRICT: 'districtId',
  AREA: 'areaId',
  BASIC_UNIT: 'basicUnitId',
};
const EMPTY = { provinceId: '', districtId: '', areaId: '', basicUnitId: '' };

export default function ReportsAnalytics({ params, periodFrom, scope }) {
  const toast = useToast();
  const { data, loading, error } = useAnalytics('/dashboard/reports', params);

  // Unit Report Downloads State
  const [sel, setSel] = useState(EMPTY);
  const [target, setTarget] = useState('CENTRAL');
  const [provinces, setProvinces] = useState([]);
  const [districts, setDistricts] = useState([]);
  const [areas, setAreas] = useState([]);
  const [units, setUnits] = useState([]);
  const [busyExport, setBusyExport] = useState('');
  const [pickerModal, setPickerModal] = useState(null);

  // Sync scope to report downloads
  useEffect(() => {
    setSel({
      provinceId: scope?.provinceId || '',
      districtId: scope?.districtId || '',
      areaId: scope?.areaId || '',
      basicUnitId: scope?.basicUnitId || '',
    });
  }, [scope]);

  // Fetch cascading options for report downloads
  useEffect(() => {
    api.get('/org/provinces')
      .then((r) => setProvinces(r.data?.data || []))
      .catch(() => {});
  }, []);

  useEffect(() => {
    if (!sel.provinceId) { setDistricts([]); return; }
    api.get('/org/districts', { params: { provinceId: sel.provinceId } })
      .then((r) => setDistricts(r.data?.data || []))
      .catch(() => {});
  }, [sel.provinceId]);

  useEffect(() => {
    if (!sel.districtId) { setAreas([]); return; }
    api.get('/org/areas', { params: { districtId: sel.districtId } })
      .then((r) => setAreas(r.data?.data || []))
      .catch(() => {});
  }, [sel.districtId]);

  useEffect(() => {
    if (!sel.areaId) { setUnits([]); return; }
    api.get('/org/basic-units', { params: { areaId: sel.areaId } })
      .then((r) => setUnits(r.data?.data || []))
      .catch(() => {});
  }, [sel.areaId]);

  const deepest = useMemo(() => {
    if (sel.basicUnitId) return 'BASIC_UNIT';
    if (sel.areaId) return 'AREA';
    if (sel.districtId) return 'DISTRICT';
    if (sel.provinceId) return 'PROVINCE';
    return 'CENTRAL';
  }, [sel]);

  useEffect(() => { setTarget(deepest); }, [deepest]);

  const nameAt = useMemo(() => ({
    CENTRAL: 'Central (National)',
    PROVINCE: provinces.find((p) => String(p._id) === String(sel.provinceId))?.name,
    DISTRICT: districts.find((d) => String(d._id) === String(sel.districtId))?.name,
    AREA: areas.find((a) => String(a._id) === String(sel.areaId))?.name,
    BASIC_UNIT: units.find((u) => String(u._id) === String(sel.basicUnitId))?.name,
  }), [provinces, districts, areas, units, sel]);

  const chain = LEVELS.slice(0, LEVELS.indexOf(deepest) + 1);

  function pick(level, value) {
    const idx = LEVELS.indexOf(level);
    const next = { ...sel, [KEY_OF[level]]: value };
    for (const deeper of LEVELS.slice(idx + 1)) {
      if (KEY_OF[deeper]) next[KEY_OF[deeper]] = '';
    }
    setSel(next);
  }

  async function handleDownload(kind, format) {
    const tag = `${kind}-${format}`;
    setBusyExport(tag);
    try {
      const qParams = { unitLevel: target };
      if (target !== 'CENTRAL' && sel[KEY_OF[target]]) {
        qParams.unitId = sel[KEY_OF[target]];
      }
      if (periodFrom) qParams.from = periodFrom;

      const safe = (nameAt[target] || 'unit').replace(/[^a-z0-9]+/gi, '-').toLowerCase();
      const filename = `${safe}-${kind}-report.${format === 'pdf' ? 'pdf' : 'xlsx'}`;

      await downloadAndShare(`/exports/unit/${kind}/${format}`, filename, qParams);
      toast.success(`Export ready: ${filename}`);
    } catch (e) {
      toast.error(e.message || 'Export failed');
    } finally {
      setBusyExport('');
    }
  }

  if (loading && !data) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color={Colors.primary} />
      </View>
    );
  }

  if (error) {
    return (
      <Card style={styles.errorCard}>
        <Text style={styles.errorText}>{error}</Text>
      </Card>
    );
  }

  if (!data) return null;

  const t = data.totals || {};
  const rows = data.rows || [];
  const noun = data.level ? LEVEL_NOUN[data.level] : null;

  return (
    <View style={styles.container}>
      {/* 3 KPIs */}
      <View style={styles.kpiGrid}>
        <SmartKpi
          label="Reports Filed"
          value={t.filed}
          icon="✅"
          iconBg="rgba(22, 163, 74, 0.12)"
          iconColor={Colors.success}
        />
        <SmartKpi
          label="Outstanding"
          value={t.outstanding}
          icon="⚠️"
          iconBg="rgba(239, 68, 68, 0.12)"
          iconColor={Colors.error}
        />
      </View>

      <SmartKpi
        label="Overall Filing Rate"
        value={t.filingRate ?? 0}
        format={(v) => `${v}%`}
        icon="📄"
        iconBg="rgba(30, 64, 175, 0.12)"
        iconColor={Colors.primary}
        subLabel="Outstanding counts ignore date filter"
      />

      {/* Filing Rate Donut + Filing Status by Level */}
      {noun && rows.length > 0 && (
        <Card style={styles.card}>
          <View style={styles.cardHeader}>
            <Text style={styles.cardTitle}>Filing status by {noun.toLowerCase()}</Text>
            <Text style={styles.cardSub}>Most outstanding first</Text>
          </View>

          <View style={styles.donutGaugeRow}>
            <Donut
              percent={t.filingRate ?? 0}
              label="FILING RATE"
              size={94}
              stroke={10}
              color={(t.filingRate ?? 0) >= 60 ? Colors.success : Colors.warning}
              trackColor={Colors.surfaceAlt}
            />
            <View style={{ flex: 1, gap: 4 }}>
              <Text style={styles.donutNoteTitle}>Filing Efficiency</Text>
              <Text style={styles.donutNote}>
                {(t.filed || 0).toLocaleString()} reports filed vs {(t.outstanding || 0).toLocaleString()} still owed across all units in scope.
              </Text>
            </View>
          </View>

          <StackedHBar
            rows={rows.slice(0, 10).map((r) => ({
              label: r.name,
              values: { filed: r.filed, outstanding: r.outstanding },
            }))}
            series={[
              { key: 'filed', label: 'Filed', color: Colors.success },
              { key: 'outstanding', label: 'Outstanding', color: Colors.error },
            ]}
            emptyLabel="Nothing on record."
          />
        </Card>
      )}

      {/* Unit Report Downloads Picker */}
      <Card style={styles.card}>
        <View style={styles.cardHeader}>
          <View style={{ flex: 1 }}>
            <Text style={styles.cardTitle}>Unit report downloads</Text>
            <Text style={styles.cardSub}>
              Generate full meeting & finance reports for any unit
            </Text>
          </View>
          {deepest !== 'CENTRAL' && (
            <TouchableOpacity onPress={() => setSel(EMPTY)}>
              <Text style={styles.resetText}>Reset</Text>
            </TouchableOpacity>
          )}
        </View>

        {/* Cascading Picker Buttons */}
        <View style={styles.pickerRow}>
          <TouchableOpacity
            style={styles.selectBtn}
            onPress={() =>
              setPickerModal({
                title: 'Select Province',
                items: [{ _id: '', name: 'All Provinces (Central)' }, ...provinces],
                selected: sel.provinceId,
                onSelect: (v) => pick('PROVINCE', v),
              })
            }
          >
            <Text style={styles.selectBtnText} numberOfLines={1}>
              {nameAt.PROVINCE || 'All Provinces'}
            </Text>
            <Text style={styles.arrow}>▼</Text>
          </TouchableOpacity>

          <TouchableOpacity
            disabled={!sel.provinceId}
            style={[styles.selectBtn, !sel.provinceId && styles.disabledBtn]}
            onPress={() =>
              setPickerModal({
                title: 'Select District',
                items: [{ _id: '', name: 'All Districts' }, ...districts],
                selected: sel.districtId,
                onSelect: (v) => pick('DISTRICT', v),
              })
            }
          >
            <Text style={styles.selectBtnText} numberOfLines={1}>
              {nameAt.DISTRICT || 'All Districts'}
            </Text>
            <Text style={styles.arrow}>▼</Text>
          </TouchableOpacity>
        </View>

        <View style={styles.pickerRow}>
          <TouchableOpacity
            disabled={!sel.districtId}
            style={[styles.selectBtn, !sel.districtId && styles.disabledBtn]}
            onPress={() =>
              setPickerModal({
                title: 'Select Area',
                items: [{ _id: '', name: 'All Areas' }, ...areas],
                selected: sel.areaId,
                onSelect: (v) => pick('AREA', v),
              })
            }
          >
            <Text style={styles.selectBtnText} numberOfLines={1}>
              {nameAt.AREA || 'All Areas'}
            </Text>
            <Text style={styles.arrow}>▼</Text>
          </TouchableOpacity>

          <TouchableOpacity
            disabled={!sel.areaId}
            style={[styles.selectBtn, !sel.areaId && styles.disabledBtn]}
            onPress={() =>
              setPickerModal({
                title: 'Select Basic Unit',
                items: [{ _id: '', name: 'All Basic Units' }, ...units],
                selected: sel.basicUnitId,
                onSelect: (v) => pick('BASIC_UNIT', v),
              })
            }
          >
            <Text style={styles.selectBtnText} numberOfLines={1}>
              {nameAt.BASIC_UNIT || 'All Basic Units'}
            </Text>
            <Text style={styles.arrow}>▼</Text>
          </TouchableOpacity>
        </View>

        {/* Reporting Target Switcher */}
        <View style={styles.targetRow}>
          <Text style={styles.targetLabel}>Report on:</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 6 }}>
            {chain.map((lvl) => {
              const active = target === lvl;
              return (
                <TouchableOpacity
                  key={lvl}
                  style={[styles.targetChip, active && styles.targetChipActive]}
                  onPress={() => setTarget(lvl)}
                >
                  <Text style={[styles.targetChipText, active && styles.targetChipTextActive]}>
                    {nameAt[lvl] || LEVEL_LABEL[lvl]} ({LEVEL_LABEL[lvl]})
                  </Text>
                </TouchableOpacity>
              );
            })}
          </ScrollView>
        </View>

        {/* Download Action Cards */}
        <View style={styles.downloadGrid}>
          {/* Meetings & Activities Download */}
          <View style={styles.downloadCard}>
            <Text style={styles.downloadTitle}>📋 Meetings & Activities</Text>
            <Text style={styles.downloadSub}>Roster, attendance, activities & responsibilities.</Text>
            <View style={styles.downloadBtns}>
              <TouchableOpacity
                style={[styles.actionBtn, styles.primaryBtn]}
                disabled={!!busyExport}
                onPress={() => handleDownload('meetings', 'pdf')}
              >
                {busyExport === 'meetings-pdf' ? (
                  <ActivityIndicator size="small" color="#fff" />
                ) : (
                  <Text style={styles.primaryBtnText}>PDF</Text>
                )}
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.actionBtn, styles.secondaryBtn]}
                disabled={!!busyExport}
                onPress={() => handleDownload('meetings', 'xlsx')}
              >
                {busyExport === 'meetings-xlsx' ? (
                  <ActivityIndicator size="small" color={Colors.text} />
                ) : (
                  <Text style={styles.secondaryBtnText}>Excel</Text>
                )}
              </TouchableOpacity>
            </View>
          </View>

          {/* Finance Download */}
          <View style={styles.downloadCard}>
            <Text style={styles.downloadTitle}>💰 Finance</Text>
            <Text style={styles.downloadSub}>Donations, expenses and unit net balance.</Text>
            <View style={styles.downloadBtns}>
              <TouchableOpacity
                style={[styles.actionBtn, styles.primaryBtn]}
                disabled={!!busyExport}
                onPress={() => handleDownload('finance', 'pdf')}
              >
                {busyExport === 'finance-pdf' ? (
                  <ActivityIndicator size="small" color="#fff" />
                ) : (
                  <Text style={styles.primaryBtnText}>PDF</Text>
                )}
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.actionBtn, styles.secondaryBtn]}
                disabled={!!busyExport}
                onPress={() => handleDownload('finance', 'xlsx')}
              >
                {busyExport === 'finance-xlsx' ? (
                  <ActivityIndicator size="small" color={Colors.text} />
                ) : (
                  <Text style={styles.secondaryBtnText}>Excel</Text>
                )}
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Card>

      {/* Selector Modal */}
      <Modal visible={!!pickerModal} transparent animationType="fade">
        <View style={styles.modalOverlay}>
          <View style={styles.modalCard}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>{pickerModal?.title}</Text>
              <TouchableOpacity onPress={() => setPickerModal(null)}>
                <Text style={styles.modalClose}>✕</Text>
              </TouchableOpacity>
            </View>
            <ScrollView style={{ maxHeight: 350 }}>
              {pickerModal?.items.map((it) => {
                const isSelected = String(pickerModal.selected || '') === String(it._id || '');
                return (
                  <TouchableOpacity
                    key={String(it._id || 'all')}
                    style={[styles.modalItem, isSelected && styles.modalItemActive]}
                    onPress={() => {
                      pickerModal.onSelect(it._id);
                      setPickerModal(null);
                    }}
                  >
                    <Text style={[styles.modalItemText, isSelected && styles.modalItemTextActive]}>
                      {it.name}
                    </Text>
                    {isSelected && <Text style={{ color: Colors.primary, fontWeight: '700' }}>✓</Text>}
                  </TouchableOpacity>
                );
              })}
            </ScrollView>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    gap: Spacing.md,
  },
  center: {
    padding: Spacing.xl,
    alignItems: 'center',
    justifyContent: 'center',
  },
  errorCard: {
    padding: Spacing.md,
    backgroundColor: '#fef2f2',
    borderColor: '#fecaca',
  },
  errorText: {
    color: Colors.error,
    fontSize: FontSize.xs,
    fontWeight: '600',
  },
  kpiGrid: {
    flexDirection: 'row',
    gap: Spacing.sm,
  },
  card: {
    padding: Spacing.md,
    gap: Spacing.sm,
  },
  cardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 4,
    gap: 8,
  },
  cardTitle: {
    fontSize: FontSize.sm,
    fontWeight: '700',
    color: Colors.text,
  },
  cardSub: {
    fontSize: 11,
    color: Colors.textMuted,
    marginTop: 1,
  },
  resetText: {
    fontSize: FontSize.xs,
    color: Colors.primary,
    fontWeight: '600',
  },
  donutGaugeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.surfaceAlt,
    padding: Spacing.md,
    borderRadius: Radius.md,
    gap: Spacing.md,
  },
  donutNoteTitle: {
    fontSize: FontSize.xs,
    fontWeight: '700',
    color: Colors.text,
  },
  donutNote: {
    fontSize: 11,
    color: Colors.textMuted,
    lineHeight: 16,
  },
  pickerRow: {
    flexDirection: 'row',
    gap: 6,
  },
  selectBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: Colors.surfaceAlt,
    paddingVertical: 7,
    paddingHorizontal: 8,
    borderRadius: Radius.sm,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  disabledBtn: {
    opacity: 0.45,
  },
  selectBtnText: {
    fontSize: 11,
    fontWeight: '600',
    color: Colors.text,
    flex: 1,
  },
  arrow: {
    fontSize: 8,
    color: Colors.textMuted,
    marginLeft: 4,
  },
  targetRow: {
    gap: 4,
    marginTop: 4,
  },
  targetLabel: {
    fontSize: 10,
    fontWeight: '700',
    color: Colors.textMuted,
    textTransform: 'uppercase',
  },
  targetChip: {
    paddingVertical: 4,
    paddingHorizontal: 10,
    borderRadius: Radius.pill,
    backgroundColor: Colors.surfaceAlt,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  targetChipActive: {
    backgroundColor: Colors.primary,
    borderColor: Colors.primary,
  },
  targetChipText: {
    fontSize: 11,
    color: Colors.text,
    fontWeight: '600',
  },
  targetChipTextActive: {
    color: '#fff',
    fontWeight: '700',
  },
  downloadGrid: {
    gap: Spacing.sm,
    marginTop: 4,
  },
  downloadCard: {
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: Radius.md,
    padding: Spacing.sm,
    gap: 4,
  },
  downloadTitle: {
    fontSize: FontSize.xs,
    fontWeight: '700',
    color: Colors.text,
  },
  downloadSub: {
    fontSize: 10,
    color: Colors.textMuted,
  },
  downloadBtns: {
    flexDirection: 'row',
    gap: 6,
    marginTop: 4,
  },
  actionBtn: {
    paddingVertical: 6,
    paddingHorizontal: 14,
    borderRadius: Radius.sm,
    alignItems: 'center',
    justifyContent: 'center',
  },
  primaryBtn: {
    backgroundColor: Colors.primary,
  },
  primaryBtnText: {
    color: '#fff',
    fontSize: FontSize.xs,
    fontWeight: '700',
  },
  secondaryBtn: {
    backgroundColor: Colors.surfaceAlt,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  secondaryBtnText: {
    color: Colors.text,
    fontSize: FontSize.xs,
    fontWeight: '600',
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
});
