import { useEffect, useState, useMemo } from 'react';
import {
  ActivityIndicator,
  Alert,
  Platform,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { useLocalSearchParams } from 'expo-router';
import { useAuth } from '../../../src/context/AuthContext';
import { useUnit } from '../../../src/context/UnitContext';
import { useLanguage } from '../../../src/context/LanguageContext';
import { isHigherAdmin, isAreaAdmin, hasRole } from '../../../src/utils/permissions';
import { api, errorMessage } from '../../../src/api/client';
import { useNetwork } from '../../../src/context/NetworkContext';
import { Colors, FontSize, Spacing, Radius } from '../../../src/constants/colors';
import Card from '../../../src/components/Card';
import Badge from '../../../src/components/Badge';
import UnitSwitcherModal from '../../../src/components/UnitSwitcherModal';
import { downloadAndShare } from '../../../src/utils/export';
import { Ionicons } from '@expo/vector-icons';
import MobileProformaEditorModal from '../../../src/components/MobileProformaEditorModal';

export const PROFORMA_FORMS = [
  {
    id: 'form1',
    icon: '📋',
    shortName: 'Form 1 (علاقائي راپور)',
    fullName: 'Form 1: Area Unit Report (علاقائي يونټ)',
    desc: 'Official monthly activity report for Area Executive and Subordinate Units',
    targetLevel: 'AREA',
    tiers: ['AREA', 'DISTRICT', 'PROVINCE', 'CENTRAL'],
  },
  {
    id: 'form2',
    icon: '📑',
    shortName: 'Form 2 (ماتحت يونټونه)',
    fullName: 'Form 2: Subordinate Basic Units Report (ماتحت بنسټيز يونټونه)',
    desc: 'Official monthly report for subordinate basic units under Area Unit',
    targetLevel: 'AREA',
    tiers: ['AREA', 'DISTRICT', 'PROVINCE', 'CENTRAL'],
  },
  {
    id: 'form3',
    icon: '📑',
    shortName: 'Form 3 (علاقائي تفصيلي)',
    fullName: 'Form 3: Area Detailed Report (علاقائي يونټ تفصيلي)',
    desc: 'Official detailed monthly work and activity report for Area Unit',
    targetLevel: 'AREA',
    tiers: ['AREA', 'DISTRICT', 'PROVINCE', 'CENTRAL'],
  },
  {
    id: 'form4',
    icon: '📄',
    shortName: 'Form 4 (بنسټيز يونټ)',
    fullName: 'Form 4: Basic Unit Report (بنسټيز يونټ)',
    desc: 'Official monthly work & activity report for Basic Unit Executive',
    targetLevel: 'BASIC_UNIT',
    tiers: ['BASIC_UNIT', 'AREA', 'DISTRICT', 'PROVINCE', 'CENTRAL'],
  },
  {
    id: 'form5',
    icon: '🏛️',
    shortName: 'Form 5 (صوبائي ايګزيکټيو)',
    fullName: 'Form 5: Provincial Executive Report (صوبائي ايګزيکټيو)',
    desc: 'Official individual work & activity report for Provincial Executive leadership',
    targetLevel: 'PROVINCE',
    tiers: ['PROVINCE', 'CENTRAL'],
  },
  {
    id: 'form6',
    icon: '🏛️',
    shortName: 'Form 6 (ضلعي يونټ)',
    fullName: 'Form 6: District Report (ضلعي يونټ)',
    desc: 'Official monthly report for District Executive and Subordinate Units',
    targetLevel: 'DISTRICT',
    tiers: ['DISTRICT', 'PROVINCE', 'CENTRAL'],
  },
  {
    id: 'form7',
    icon: '📑',
    shortName: 'Form 7 (ضلع کښي علاقائي)',
    fullName: 'Form 7: District Subordinate Area Units (ضلع کښي علاقائي يونټونه)',
    desc: 'Official monthly report for subordinate Area Units under District',
    targetLevel: 'DISTRICT',
    tiers: ['DISTRICT', 'PROVINCE', 'CENTRAL'],
  },
  {
    id: 'form8',
    icon: '📑',
    shortName: 'Form 8 (ضلع کښي کميټي)',
    fullName: 'Form 8: Central & Provincial Committee in District (ضلع کښي مرکزي، صوبائي کميټي)',
    desc: 'Official monthly report for Central & Provincial Committee members in District',
    targetLevel: 'DISTRICT',
    tiers: ['DISTRICT', 'PROVINCE', 'CENTRAL'],
  },
  {
    id: 'form9',
    icon: '📑',
    shortName: 'Form 9 (ضلع کښي ادارې)',
    fullName: 'Form 9: Central & Provincial Organs in District (ضلع کښي مرکزي، صوبائي ادارې)',
    desc: 'Official monthly report for Central & Provincial Organs members in District',
    targetLevel: 'DISTRICT',
    tiers: ['DISTRICT', 'PROVINCE', 'CENTRAL'],
  },
];

const MONTHS_LIST = [
  { val: 1, name: '1 - جنوري (January)' },
  { val: 2, name: '2 - فبروري (February)' },
  { val: 3, name: '3 - مارچ (March)' },
  { val: 4, name: '4 - اپريل (April)' },
  { val: 5, name: '5 - مۍ (May)' },
  { val: 6, name: '6 - جون (June)' },
  { val: 7, name: '7 - جولای (July)' },
  { val: 8, name: '8 - اګست (August)' },
  { val: 9, name: '9 - سپټمبر (September)' },
  { val: 10, name: '10 - اکتوبر (October)' },
  { val: 11, name: '11 - نومبر (November)' },
  { val: 12, name: '12 - دسمبر (December)' },
];

export default function ProformaScreen() {
  const { user } = useAuth();
  const { ctx, setCtx } = useUnit();
  const { t, isRTL } = useLanguage();
  const { isOnline } = useNetwork();
  const params = useLocalSearchParams();

  const [unitSwitcherVisible, setUnitSwitcherVisible] = useState(false);
  const [editorVisible, setEditorVisible] = useState(false);
  const [busyKey, setBusyKey] = useState(null);
  const [error, setError] = useState('');

  // Year & Month state (defaults to current date)
  const [year, setYear] = useState(String(new Date().getFullYear()));
  const [month, setMonth] = useState(String(new Date().getMonth() + 1));

  // Default form based on role & context
  const defaultFormType = useMemo(() => {
    if (params.formType && PROFORMA_FORMS.some((f) => f.id === params.formType)) {
      return params.formType;
    }
    if (ctx?.unitLevel === 'BASIC_UNIT') return 'form4';
    if (ctx?.unitLevel === 'DISTRICT') return 'form6';
    if (ctx?.unitLevel === 'PROVINCE') return 'form5';
    // For Area cabinet members or area admins, default to Form 2 (or Form 1)
    if (ctx?.unitLevel === 'AREA' || user?.scope?.areaId) return 'form2';
    return 'form2';
  }, [params.formType, ctx?.unitLevel, user?.scope?.areaId]);

  const [formType, setFormType] = useState(defaultFormType);
  const [formFilterMode, setFormFilterMode] = useState('ALL'); // 'ALL' | 'TIER'

  // Lists for dropdown selections if user is at higher level
  const [areasList, setAreasList] = useState([]);
  const [selectedAreaId, setSelectedAreaId] = useState('');
  const [districtsList, setDistrictsList] = useState([]);
  const [selectedDistrictId, setSelectedDistrictId] = useState('');
  const [provincesList, setProvincesList] = useState([]);
  const [selectedProvinceId, setSelectedProvinceId] = useState('');
  const [basicUnitsList, setBasicUnitsList] = useState([]);
  const [selectedBasicUnitId, setSelectedBasicUnitId] = useState('');

  // Proforma entry status and live summary data
  const [entryDoc, setEntryDoc] = useState(null);
  const [loadingEntry, setLoadingEntry] = useState(false);

  // Load auxiliary lists for higher-level navigation
  useEffect(() => {
    if (!user) return;
    if (ctx?.unitLevel === 'CENTRAL' || isHigherAdmin(user)) {
      api.get('/org/provinces').then((r) => setProvincesList(r.data?.data || [])).catch(() => {});
      api.get('/org/districts').then((r) => setDistrictsList(r.data?.data || [])).catch(() => {});
    } else if (ctx?.unitLevel === 'PROVINCE') {
      const p = ctx.unitId ? { provinceId: ctx.unitId } : {};
      api.get('/org/districts', { params: p }).then((r) => setDistrictsList(r.data?.data || [])).catch(() => {});
    }
    if (ctx?.unitLevel === 'CENTRAL' || ctx?.unitLevel === 'PROVINCE' || ctx?.unitLevel === 'DISTRICT' || isHigherAdmin(user)) {
      api.get('/org/areas').then((r) => setAreasList(r.data?.data || [])).catch(() => {});
    }
  }, [user, ctx?.unitLevel, ctx?.unitId]);

  // Resolve effective areaId
  const effectiveAreaId = useMemo(() => {
    if (selectedAreaId) return selectedAreaId;
    if (ctx?.unitLevel === 'AREA' && ctx?.unitId) return ctx.unitId;
    if (user?.scope?.areaId) return user.scope.areaId;
    if (ctx?.areaId) return ctx.areaId;
    return areasList[0]?._id ? String(areasList[0]._id) : '';
  }, [selectedAreaId, ctx, user, areasList]);

  // Load basic units under effective area for Form 4
  useEffect(() => {
    if (!effectiveAreaId) return;
    api.get('/org/basic-units', { params: { areaId: effectiveAreaId } })
      .then((r) => {
        const units = r.data?.data || [];
        setBasicUnitsList(units);
        if (units.length > 0 && !selectedBasicUnitId) {
          setSelectedBasicUnitId(String(units[0]._id));
        }
      })
      .catch(() => {});
  }, [effectiveAreaId]);

  // Resolve effective districtId
  const effectiveDistrictId = useMemo(() => {
    if (selectedDistrictId) return selectedDistrictId;
    if (ctx?.unitLevel === 'DISTRICT' && ctx?.unitId) return ctx.unitId;
    if (user?.scope?.districtId) return user.scope.districtId;
    if (ctx?.districtId) return ctx.districtId;
    return districtsList[0]?._id ? String(districtsList[0]._id) : '';
  }, [selectedDistrictId, ctx, user, districtsList]);

  // Resolve effective provinceId
  const effectiveProvinceId = useMemo(() => {
    if (selectedProvinceId) return selectedProvinceId;
    if (ctx?.unitLevel === 'PROVINCE' && ctx?.unitId) return ctx.unitId;
    if (user?.scope?.provinceId) return user.scope.provinceId;
    if (ctx?.provinceId) return ctx.provinceId;
    return provincesList[0]?._id ? String(provincesList[0]._id) : '';
  }, [selectedProvinceId, ctx, user, provincesList]);

  // Resolve effective targetId & unitLevel
  const { targetId, activeTargetLevel, displayUnitName } = useMemo(() => {
    if (['form1', 'form2', 'form3'].includes(formType)) {
      const area = areasList.find((a) => String(a._id) === String(effectiveAreaId));
      return {
        targetId: effectiveAreaId,
        activeTargetLevel: 'AREA',
        displayUnitName: area?.name || (ctx?.unitLevel === 'AREA' ? ctx.unitName : user?.scope?.areaName) || 'Area Unit',
      };
    }
    if (formType === 'form4') {
      const bId = ctx?.unitLevel === 'BASIC_UNIT' ? ctx.unitId : (selectedBasicUnitId || basicUnitsList[0]?._id);
      const bu = basicUnitsList.find((b) => String(b._id) === String(bId));
      return {
        targetId: bId,
        activeTargetLevel: 'BASIC_UNIT',
        displayUnitName: bu?.name || (ctx?.unitLevel === 'BASIC_UNIT' ? ctx.unitName : user?.scope?.basicUnitName) || 'Basic Unit',
      };
    }
    if (formType === 'form5') {
      const prov = provincesList.find((p) => String(p._id) === String(effectiveProvinceId));
      return {
        targetId: effectiveProvinceId,
        activeTargetLevel: 'PROVINCE',
        displayUnitName: prov?.name || (ctx?.unitLevel === 'PROVINCE' ? ctx.unitName : user?.scope?.provinceName) || 'Province',
      };
    }
    if (['form6', 'form7', 'form8'].includes(formType)) {
      const dist = districtsList.find((d) => String(d._id) === String(effectiveDistrictId));
      return {
        targetId: effectiveDistrictId,
        activeTargetLevel: 'DISTRICT',
        displayUnitName: dist?.name || (ctx?.unitLevel === 'DISTRICT' ? ctx.unitName : user?.scope?.districtName) || 'District',
      };
    }
    if (formType === 'form9') {
      const dist = districtsList.find((d) => String(d._id) === String(effectiveDistrictId));
      return {
        targetId: effectiveDistrictId || effectiveAreaId,
        activeTargetLevel: effectiveDistrictId ? 'DISTRICT' : 'AREA',
        displayUnitName: dist?.name || (ctx?.unitLevel === 'DISTRICT' ? ctx.unitName : user?.scope?.districtName) || (ctx?.unitLevel === 'AREA' ? ctx.unitName : user?.scope?.areaName) || 'District / Area',
      };
    }
    return {
      targetId: effectiveAreaId,
      activeTargetLevel: 'AREA',
      displayUnitName: ctx?.unitName || 'Unit',
    };
  }, [
    formType,
    effectiveAreaId,
    effectiveDistrictId,
    effectiveProvinceId,
    selectedBasicUnitId,
    basicUnitsList,
    areasList,
    districtsList,
    provincesList,
    ctx,
    user,
  ]);

  // Load entry & baseline data from API
  async function loadEntryData() {
    if (!targetId) return;
    setLoadingEntry(true);
    setError('');
    try {
      const p = {
        formType,
        year,
        month,
        unitId: targetId,
      };
      if (['form1', 'form2', 'form3'].includes(formType)) {
        p.areaId = effectiveAreaId;
      } else if (formType === 'form4') {
        p.unitId = targetId;
      } else if (formType === 'form5') {
        p.provinceId = effectiveProvinceId;
      } else if (['form6', 'form7', 'form8'].includes(formType)) {
        p.districtId = effectiveDistrictId;
      } else if (formType === 'form9') {
        p.districtId = effectiveDistrictId || undefined;
        p.areaId = effectiveAreaId || undefined;
      }

      const res = await api.get('/proforma/entry', { params: p });
      setEntryDoc(res.data);
    } catch (e) {
      setError(errorMessage(e));
      setEntryDoc(null);
    } finally {
      setLoadingEntry(false);
    }
  }

  useEffect(() => {
    loadEntryData();
  }, [formType, targetId, year, month]);

  // Download PDF or Excel handler
  async function handleDownload(format) {
    if (!isOnline) {
      setError(t('reports.offlineMsg', 'Report generation and exports require an active internet connection.'));
      return;
    }
    if (!targetId) {
      setError(t('proforma.noTargetId', 'Please select a valid unit to generate this proforma report.'));
      return;
    }
    setError('');
    const busyId = `${formType}-${format}`;
    setBusyKey(busyId);

    try {
      const params = {
        year: String(year),
        month: String(month),
      };

      const docData = entryDoc?.data || {};
      if (['form1', 'form2', 'form3'].includes(formType)) {
        params.areaId = effectiveAreaId;
      } else if (formType === 'form4') {
        params.unitId = targetId;
      } else if (formType === 'form5') {
        params.provinceId = effectiveProvinceId;
        if (docData.fromDate) params.fromDate = docData.fromDate;
        if (docData.toDate) params.toDate = docData.toDate;
      } else if (formType === 'form6') {
        params.districtId = effectiveDistrictId;
        if (docData.m1) params.m1 = docData.m1;
        if (docData.m2) params.m2 = docData.m2;
        if (docData.m3) params.m3 = docData.m3;
      } else if (['form7', 'form8'].includes(formType)) {
        params.districtId = effectiveDistrictId;
      } else if (formType === 'form9') {
        if (effectiveDistrictId) params.districtId = effectiveDistrictId;
        if (effectiveAreaId) params.areaId = effectiveAreaId;
      }

      const filename = `proforma-${formType}-${year}-${month}.${format}`;
      await downloadAndShare(
        `/exports/proforma/${formType}/${format}`,
        filename,
        params
      );
    } catch (e) {
      Alert.alert('Export failed', e.message || 'Network error');
      setError(e.message || 'Export failed');
    } finally {
      setBusyKey(null);
    }
  }

  const curConfig = PROFORMA_FORMS.find((f) => f.id === formType) || PROFORMA_FORMS[0];
  const formData = entryDoc?.data || {};

  return (
    <SafeAreaView style={styles.safe}>
      <ScrollView contentContainerStyle={styles.content}>
        {/* Screen Header Banner */}
        <View style={styles.header}>
          <View style={[{ flexDirection: 'row', alignItems: 'center', gap: 6, flexWrap: 'wrap' }, isRTL && { flexDirection: 'row-reverse' }]}>
            <Text style={[styles.pageTitle, isRTL && { textAlign: 'right' }]}>
              📋 {t('proforma.headerTitle', 'Official Party Proforma Reports')}
            </Text>
            {!isOnline && (
              <View style={styles.offlineBadge}>
                <Text style={styles.offlineBadgeText}>{t('common.offlineMode', 'Offline Mode')}</Text>
              </View>
            )}
          </View>
          <Text style={[styles.pageSubTitle, isRTL && { textAlign: 'right' }]}>
            {t('proforma.headerSubTitle', 'Standardized party proformas (Forms 1–9) with live baseline integration, database persistence, and bilingual exports.')}
          </Text>
        </View>

        {error ? <Text style={[styles.errorBanner, isRTL && { textAlign: 'right' }]}>{error}</Text> : null}

        {/* 1. Form Type Selector Carousel */}
        <Card style={styles.card}>
          <View style={[{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }, isRTL && { flexDirection: 'row-reverse' }]}>
            <Text style={[styles.cardTitle, isRTL && { textAlign: 'right' }]}>
              {t('proforma.selectForm', 'Select Proforma Form (د فارم انتخاب)')}
            </Text>
            <View style={{ flexDirection: 'row', gap: 6 }}>
              <TouchableOpacity
                style={[styles.filterPill, formFilterMode === 'ALL' && styles.filterPillActive]}
                onPress={() => setFormFilterMode('ALL')}
              >
                <Text style={[styles.filterPillText, formFilterMode === 'ALL' && styles.filterPillTextActive]}>
                  All (1–9)
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.filterPill, formFilterMode === 'TIER' && styles.filterPillActive]}
                onPress={() => setFormFilterMode('TIER')}
              >
                <Text style={[styles.filterPillText, formFilterMode === 'TIER' && styles.filterPillTextActive]}>
                  {ctx?.unitLevel || 'My Tier'}
                </Text>
              </TouchableOpacity>
            </View>
          </View>

          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8, paddingVertical: 4 }}>
            {(formFilterMode === 'ALL' || isHigherAdmin(user) || ctx?.unitLevel === 'CENTRAL'
              ? PROFORMA_FORMS
              : PROFORMA_FORMS.filter((f) => f.tiers.includes(ctx?.unitLevel || 'AREA'))
            ).map((f) => {
              const isSelected = formType === f.id;
              return (
                <TouchableOpacity
                  key={f.id}
                  style={[styles.formSelectBtn, isSelected && styles.formSelectBtnActive]}
                  onPress={() => setFormType(f.id)}
                >
                  <Text style={{ fontSize: 16 }}>{f.icon}</Text>
                  <Text style={[styles.formSelectBtnText, isSelected && styles.formSelectBtnTextActive]}>
                    {f.shortName}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </ScrollView>

          {/* Active Form Info Box */}
          <View style={styles.activeFormBox}>
            <View style={[{ flexDirection: 'row', alignItems: 'center', gap: 6 }, isRTL && { flexDirection: 'row-reverse' }]}>
              <Text style={{ fontSize: 18 }}>{curConfig.icon}</Text>
              <Text style={styles.activeFormTitle}>{curConfig.fullName}</Text>
            </View>
            <Text style={[styles.activeFormDesc, isRTL && { textAlign: 'right' }]}>{curConfig.desc}</Text>
          </View>
        </Card>

        {/* 2. Unit Context & Navigation Card */}
        <Card style={styles.card}>
          <View style={[styles.unitRow, isRTL && { flexDirection: 'row-reverse' }]}>
            <View style={styles.unitIconBox}>
              <Ionicons name="business" size={22} color={Colors.primary} />
            </View>
            <View style={[{ flex: 1 }, isRTL && { alignItems: 'flex-end' }]}>
              <Text style={[styles.unitSub, isRTL && { textAlign: 'right' }]}>
                {t('proforma.targetUnit', 'REPORT TARGET UNIT')} ({activeTargetLevel})
              </Text>
              <Text style={[styles.unitName, isRTL && { textAlign: 'right' }]}>
                {displayUnitName}
              </Text>
              <Text style={[styles.unitTier, isRTL && { textAlign: 'right' }]}>
                {t('units.' + (ctx?.unitLevel || 'area').toLowerCase(), ctx?.unitLevel || 'AREA')}
              </Text>
            </View>
            <TouchableOpacity
              style={[styles.switchBtn, isRTL && { flexDirection: 'row-reverse' }]}
              onPress={() => setUnitSwitcherVisible(true)}
            >
              <Ionicons name="swap-horizontal" size={16} color={Colors.primary} style={{ marginHorizontal: 4 }} />
              <Text style={styles.switchBtnText}>{t('reports.switch', 'Switch')}</Text>
            </TouchableOpacity>
          </View>

          {/* Auxiliary Area Picker if viewing Forms 1-3 from Higher Level */}
          {['form1', 'form2', 'form3'].includes(formType) && (ctx?.unitLevel === 'CENTRAL' || ctx?.unitLevel === 'PROVINCE' || ctx?.unitLevel === 'DISTRICT') && areasList.length > 0 && (
            <View style={{ marginTop: Spacing.sm }}>
              <Text style={[styles.label, isRTL && { textAlign: 'right' }]}>Select Area Unit (علاقائي يونټ):</Text>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 6, paddingVertical: 2 }}>
                {areasList.map((a) => (
                  <TouchableOpacity
                    key={a._id}
                    style={[styles.pillBtn, String(effectiveAreaId) === String(a._id) && styles.pillBtnActive]}
                    onPress={() => setSelectedAreaId(String(a._id))}
                  >
                    <Text style={[styles.pillBtnText, String(effectiveAreaId) === String(a._id) && styles.pillBtnTextActive]}>
                      {a.name}
                    </Text>
                  </TouchableOpacity>
                ))}
              </ScrollView>
            </View>
          )}

          {/* Auxiliary Basic Unit Picker for Form 4 */}
          {formType === 'form4' && basicUnitsList.length > 0 && (
            <View style={{ marginTop: Spacing.sm }}>
              <Text style={[styles.label, isRTL && { textAlign: 'right' }]}>Select Basic Unit (بنسټيز يونټ):</Text>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 6, paddingVertical: 2 }}>
                {basicUnitsList.map((b) => (
                  <TouchableOpacity
                    key={b._id}
                    style={[styles.pillBtn, String(targetId) === String(b._id) && styles.pillBtnActive]}
                    onPress={() => setSelectedBasicUnitId(String(b._id))}
                  >
                    <Text style={[styles.pillBtnText, String(targetId) === String(b._id) && styles.pillBtnTextActive]}>
                      {b.name}
                    </Text>
                  </TouchableOpacity>
                ))}
              </ScrollView>
            </View>
          )}

          {/* Auxiliary Province Picker for Form 5 */}
          {formType === 'form5' && (ctx?.unitLevel === 'CENTRAL' || isHigherAdmin(user)) && provincesList.length > 0 && (
            <View style={{ marginTop: Spacing.sm }}>
              <Text style={[styles.label, isRTL && { textAlign: 'right' }]}>Select Province (صوبائي يونټ):</Text>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 6, paddingVertical: 2 }}>
                {provincesList.map((p) => (
                  <TouchableOpacity
                    key={p._id}
                    style={[styles.pillBtn, String(effectiveProvinceId) === String(p._id) && styles.pillBtnActive]}
                    onPress={() => setSelectedProvinceId(String(p._id))}
                  >
                    <Text style={[styles.pillBtnText, String(effectiveProvinceId) === String(p._id) && styles.pillBtnTextActive]}>
                      {p.name}
                    </Text>
                  </TouchableOpacity>
                ))}
              </ScrollView>
            </View>
          )}

          {/* Auxiliary District Picker for Forms 6-9 */}
          {['form6', 'form7', 'form8', 'form9'].includes(formType) && (ctx?.unitLevel === 'CENTRAL' || ctx?.unitLevel === 'PROVINCE' || isHigherAdmin(user)) && districtsList.length > 0 && (
            <View style={{ marginTop: Spacing.sm }}>
              <Text style={[styles.label, isRTL && { textAlign: 'right' }]}>Select District (ضلعي يونټ):</Text>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 6, paddingVertical: 2 }}>
                {districtsList.map((d) => (
                  <TouchableOpacity
                    key={d._id}
                    style={[styles.pillBtn, String(effectiveDistrictId) === String(d._id) && styles.pillBtnActive]}
                    onPress={() => setSelectedDistrictId(String(d._id))}
                  >
                    <Text style={[styles.pillBtnText, String(effectiveDistrictId) === String(d._id) && styles.pillBtnTextActive]}>
                      {d.name}
                    </Text>
                  </TouchableOpacity>
                ))}
              </ScrollView>
            </View>
          )}
        </Card>

        {/* 3. Reporting Period (Month & Year) Card */}
        <Card style={styles.card}>
          <View style={[{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }, isRTL && { flexDirection: 'row-reverse' }]}>
            <Text style={[styles.cardTitle, isRTL && { textAlign: 'right' }]}>
              📅 {t('proforma.period', 'Reporting Month & Year (مياشت او کال)')}
            </Text>
            {/* Year Stepper */}
            <View style={{ flexDirection: 'row', gap: 6, alignItems: 'center' }}>
              <TouchableOpacity
                style={styles.yearBtn}
                onPress={() => setYear(String(parseInt(year, 10) - 1))}
              >
                <Text style={styles.yearBtnText}>◀</Text>
              </TouchableOpacity>
              <Text style={styles.yearText}>{year}</Text>
              <TouchableOpacity
                style={styles.yearBtn}
                onPress={() => setYear(String(parseInt(year, 10) + 1))}
              >
                <Text style={styles.yearBtnText}>▶</Text>
              </TouchableOpacity>
            </View>
          </View>

          {/* Months Scroll */}
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 6, paddingVertical: 4 }}>
            {MONTHS_LIST.map((m) => {
              const isSelected = month === String(m.val);
              return (
                <TouchableOpacity
                  key={m.val}
                  style={[styles.monthBtn, isSelected && styles.monthBtnActive]}
                  onPress={() => setMonth(String(m.val))}
                >
                  <Text style={[styles.monthBtnText, isSelected && styles.monthBtnTextActive]}>
                    {m.name}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </ScrollView>
        </Card>

        {/* 4. Live Proforma Status & Data Highlights Card */}
        <Card style={[styles.card, { borderColor: entryDoc?.exists ? '#22c55e' : '#eab308', borderWidth: 1.5 }]}>
          <View style={[{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }, isRTL && { flexDirection: 'row-reverse' }]}>
            <View style={[{ flexDirection: 'row', alignItems: 'center', gap: 6 }, isRTL && { flexDirection: 'row-reverse' }]}>
              <Text style={{ fontSize: 16 }}>{entryDoc?.exists ? '✅' : '📝'}</Text>
              <Text style={styles.cardTitle}>
                {entryDoc?.exists
                  ? t('proforma.recordStored', 'Official Record Stored in Database')
                  : t('proforma.draftBaseline', 'Fresh / Draft Mode (Live System Baseline)')}
              </Text>
            </View>
            {loadingEntry && <ActivityIndicator size="small" color={Colors.primary} />}
          </View>

          {entryDoc?.metadata?.submittedByName ? (
            <Text style={[{ fontSize: 12, color: '#64748b', marginBottom: 10 }, isRTL && { textAlign: 'right' }]}>
              {t('proforma.submittedBy', 'Submitted by')}: <Text style={{ fontWeight: '700', color: Colors.text }}>{entryDoc.metadata.submittedByName}</Text> ({entryDoc.metadata.submittedByRole || 'Leader'})
              {entryDoc.metadata.submittedAt ? ` • ${new Date(entryDoc.metadata.submittedAt).toLocaleDateString()}` : ''}
            </Text>
          ) : null}

          {/* Form-specific quick preview highlights */}
          {formType === 'form2' && (
            <View style={styles.dataPreviewBox}>
              <Text style={styles.dataPreviewTitle}>
                🏛️ {t('proforma.subordinateUnitsList', 'Subordinate Basic Units (ماتحت بنسټيز يونټونه)')}:
              </Text>
              {Array.isArray(formData.rows) && formData.rows.length > 0 ? (
                <View style={{ gap: 6, marginTop: 6 }}>
                  {formData.rows.map((r, i) => (
                    <View key={i} style={styles.previewRow}>
                      <View style={{ flex: 1 }}>
                        <Text style={styles.previewRowTitle}>
                          {i + 1}. {r.unitName || `Unit #${i + 1}`}
                        </Text>
                        <Text style={styles.previewRowSub}>
                          Exec Mtgs: {r.execMeetingsHeld || 0}/{r.execMeetings || 1} • GB Present: {r.gbPresent || 0}/{r.gbTotalMembers || 0}
                        </Text>
                      </View>
                      <View style={{ alignItems: 'flex-end' }}>
                        <Text style={styles.previewRowVal}>
                          Dues: {r.unitDonations || 0} Rs
                        </Text>
                        <Text style={styles.previewRowSub}>
                          Emg: {r.emergencyDonations || 0} Rs
                        </Text>
                      </View>
                    </View>
                  ))}
                </View>
              ) : (
                <Text style={styles.noDataText}>
                  {loadingEntry ? 'Loading subordinate units...' : 'No unit rows found. Click "Enter & Edit Data" to auto-populate from system or add basic units.'}
                </Text>
              )}
            </View>
          )}

          {/* Form 1: Area Unit Overview */}
          {formType === 'form1' && (
            <View style={styles.dataPreviewBox}>
              <Text style={styles.dataPreviewTitle}>📊 Area Overview Metrics:</Text>
              <View style={styles.metricGrid}>
                <View style={styles.metricItem}>
                  <Text style={styles.metricVal}>
                    {(formData.upper?.execPresent ?? formData.execPresent ?? 0)} / {(formData.upper?.execSlots ?? formData.execSlots ?? 0)}
                  </Text>
                  <Text style={styles.metricLabel}>Exec Attendance</Text>
                </View>
                <View style={styles.metricItem}>
                  <Text style={styles.metricVal}>
                    {(formData.upper?.commPresent ?? formData.commPresent ?? 0)} / {(formData.upper?.commTotal ?? formData.commTotal ?? 0)}
                  </Text>
                  <Text style={styles.metricLabel}>Comm Attendance</Text>
                </View>
                <View style={styles.metricItem}>
                  <Text style={styles.metricVal}>
                    {(formData.upper?.totalDonations ?? formData.totalDuesCollected ?? 0)} Rs
                  </Text>
                  <Text style={styles.metricLabel}>Total Donations</Text>
                </View>
              </View>
              <Text style={[styles.previewRowSub, { marginTop: 8 }]}>
                👥 Area Executive Comrades in Roster: {Array.isArray(formData.rows) ? formData.rows.length : 0}
              </Text>
            </View>
          )}

          {/* Form 2: Subordinate Basic Units */}
          {formType === 'form2' && (
            <View style={styles.dataPreviewBox}>
              <Text style={styles.dataPreviewTitle}>
                🏛️ {t('proforma.subordinateUnitsList', 'Subordinate Basic Units (ماتحت بنسټيز يونټونه)')}:
              </Text>
              {Array.isArray(formData.rows) && formData.rows.length > 0 ? (
                <View style={{ gap: 6, marginTop: 6 }}>
                  {formData.rows.map((r, i) => (
                    <View key={i} style={styles.previewRow}>
                      <View style={{ flex: 1 }}>
                        <Text style={styles.previewRowTitle}>
                          {i + 1}. {r.unitName || `Unit #${i + 1}`}
                        </Text>
                        <Text style={styles.previewRowSub}>
                          Exec Mtgs: {r.execMeetingsHeld || r.execMeetings || 0} • GB Present: {r.gbPresent || 0}/{r.totalMembers || r.gbTotalMembers || 0}
                        </Text>
                      </View>
                      <View style={{ alignItems: 'flex-end' }}>
                        <Text style={styles.previewRowVal}>
                          Dues: {r.duesCollected || r.unitDonations || 0} Rs
                        </Text>
                        <Text style={styles.previewRowSub}>
                          Emg: {r.emergencyDonations || 0} Rs
                        </Text>
                      </View>
                    </View>
                  ))}
                </View>
              ) : (
                <Text style={styles.noDataText}>
                  {loadingEntry ? 'Loading subordinate units...' : 'No unit rows found. Click "Enter & Edit Data" to auto-populate from system or add basic units.'}
                </Text>
              )}
            </View>
          )}

          {/* Form 3: Area Detailed Activity Proforma */}
          {formType === 'form3' && (
            <View style={styles.dataPreviewBox}>
              <Text style={styles.dataPreviewTitle}>📊 Area Detailed Proforma Metrics:</Text>
              <View style={styles.metricGrid}>
                <View style={styles.metricItem}>
                  <Text style={styles.metricVal}>{formData.totalUnitsCount ?? formData.upper?.totalUnitsCount ?? 0}</Text>
                  <Text style={styles.metricLabel}>Total Units</Text>
                </View>
                <View style={styles.metricItem}>
                  <Text style={styles.metricVal}>{formData.inactiveUnitsCount ?? 0}</Text>
                  <Text style={styles.metricLabel}>Inactive Units</Text>
                </View>
                <View style={styles.metricItem}>
                  <Text style={styles.metricVal}>{formData.ralliesAndProtests ?? 0}</Text>
                  <Text style={styles.metricLabel}>Rallies/Protests</Text>
                </View>
              </View>
              <Text style={[styles.previewRowSub, { marginTop: 8 }]}>
                👥 Area Committee / Executive Comrades: {Array.isArray(formData.rows) ? formData.rows.length : 0} • Dues: {formData.totalDuesCollected ?? formData.totalDonations ?? 0} Rs
              </Text>
            </View>
          )}

          {/* Form 4: Basic Unit */}
          {formType === 'form4' && (
            <View style={styles.dataPreviewBox}>
              <Text style={styles.dataPreviewTitle}>📊 Basic Unit Metrics:</Text>
              <View style={styles.metricGrid}>
                <View style={styles.metricItem}>
                  <Text style={styles.metricVal}>
                    {(formData.upper?.execPresent ?? formData.executivePresent ?? 0)} / {(formData.upper?.execSlots ?? formData.executiveSlots ?? 0)}
                  </Text>
                  <Text style={styles.metricLabel}>Exec Present</Text>
                </View>
                <View style={styles.metricItem}>
                  <Text style={styles.metricVal}>
                    {(formData.upper?.gbPresent ?? formData.generalBodyPresent ?? 0)} / {(formData.upper?.gbMembers ?? formData.totalMembers ?? 0)}
                  </Text>
                  <Text style={styles.metricLabel}>GB Members</Text>
                </View>
                <View style={styles.metricItem}>
                  <Text style={styles.metricVal}>
                    {(formData.upper?.unitDonations ?? formData.totalDuesCollected ?? 0)} Rs
                  </Text>
                  <Text style={styles.metricLabel}>Unit Dues</Text>
                </View>
              </View>
              <Text style={[styles.previewRowSub, { marginTop: 8 }]}>
                👥 Basic Unit Executive Comrades: {Array.isArray(formData.rows) ? formData.rows.length : 0}
              </Text>
            </View>
          )}

          {/* Form 5: Provincial Executive */}
          {formType === 'form5' && (
            <View style={styles.dataPreviewBox}>
              <Text style={styles.dataPreviewTitle}>🏛️ Provincial Executive Overview:</Text>
              <View style={styles.metricGrid}>
                <View style={styles.metricItem}>
                  <Text style={styles.metricVal}>{Array.isArray(formData.rows) ? formData.rows.length : 0}</Text>
                  <Text style={styles.metricLabel}>Comrades</Text>
                </View>
                <View style={styles.metricItem}>
                  <Text style={styles.metricVal}>
                    {Array.isArray(formData.rows) ? formData.rows.reduce((s, r) => s + (parseInt(r.provincialCabinetMeetings, 10) || 0), 0) : 0}
                  </Text>
                  <Text style={styles.metricLabel}>Exec Mtgs</Text>
                </View>
                <View style={styles.metricItem}>
                  <Text style={styles.metricVal}>{formData.totalDuesCollected ?? 0} Rs</Text>
                  <Text style={styles.metricLabel}>Dues Collected</Text>
                </View>
              </View>
              <Text style={[styles.previewRowSub, { marginTop: 8 }]}>
                📅 Reporting Range: {formData.fromDate || `01/${String(month).padStart(2, '0')}`} → {formData.toDate || `30/${String(month).padStart(2, '0')}`}
              </Text>
            </View>
          )}

          {/* Form 6: District Unit */}
          {formType === 'form6' && (
            <View style={styles.dataPreviewBox}>
              <Text style={styles.dataPreviewTitle}>🏛️ District Unit Summary & Metrics:</Text>
              <View style={styles.metricGrid}>
                <View style={styles.metricItem}>
                  <Text style={styles.metricVal}>{formData.areasCount ?? formData.upper?.areasCount ?? 0}</Text>
                  <Text style={styles.metricLabel}>Area Units</Text>
                </View>
                <View style={styles.metricItem}>
                  <Text style={styles.metricVal}>{formData.buCount ?? formData.upper?.buCount ?? 0}</Text>
                  <Text style={styles.metricLabel}>Basic Units</Text>
                </View>
                <View style={styles.metricItem}>
                  <Text style={styles.metricVal}>{formData.dues ?? formData.upper?.dues ?? 0} Rs</Text>
                  <Text style={styles.metricLabel}>District Dues</Text>
                </View>
              </View>
              <Text style={[styles.previewRowSub, { marginTop: 8 }]}>
                👥 District Executive Comrades in Roster: {Array.isArray(formData.rows) ? formData.rows.length : 0} • Rallies: {formData.ralliesAndProtests ?? 0} • Jirgas: {formData.jirgasAndCornerMeetings ?? 0}
              </Text>
            </View>
          )}

          {/* Form 7: District Subordinate Areas */}
          {formType === 'form7' && (
            <View style={styles.dataPreviewBox}>
              <Text style={styles.dataPreviewTitle}>📑 District Subordinate Area Units ({Array.isArray(formData.rows) ? formData.rows.length : 0}):</Text>
              {Array.isArray(formData.rows) && formData.rows.length > 0 ? (
                <View style={{ gap: 6, marginTop: 6 }}>
                  {formData.rows.slice(0, 5).map((r, i) => (
                    <View key={i} style={styles.previewRow}>
                      <View style={{ flex: 1 }}>
                        <Text style={styles.previewRowTitle}>
                          {i + 1}. {r.areaName || `Area #${i + 1}`}
                        </Text>
                        <Text style={styles.previewRowSub}>
                          BUs: {r.buCount || 0} • Members: {r.membershipTotal || 0} • Mtgs: {r.execHeld || 0}/{r.commHeld || 0}
                        </Text>
                      </View>
                      <View style={{ alignItems: 'flex-end' }}>
                        <Text style={styles.previewRowVal}>
                          {r.duesMonthly || 0} Rs
                        </Text>
                      </View>
                    </View>
                  ))}
                  {formData.rows.length > 5 && (
                    <Text style={{ fontSize: 11, color: '#64748b', fontStyle: 'italic', textAlign: 'center' }}>
                      + {formData.rows.length - 5} more area units in database...
                    </Text>
                  )}
                </View>
              ) : (
                <Text style={styles.noDataText}>No subordinate area units logged for this period.</Text>
              )}
            </View>
          )}

          {/* Form 8: District Committee Comrades */}
          {formType === 'form8' && (
            <View style={styles.dataPreviewBox}>
              <Text style={styles.dataPreviewTitle}>📑 Central & Provincial Committee in District ({Array.isArray(formData.rows) ? formData.rows.length : 0}):</Text>
              <View style={styles.metricGrid}>
                <View style={styles.metricItem}>
                  <Text style={styles.metricVal}>{Array.isArray(formData.rows) ? formData.rows.length : 0}</Text>
                  <Text style={styles.metricLabel}>Committee Members</Text>
                </View>
                <View style={styles.metricItem}>
                  <Text style={styles.metricVal}>
                    {Array.isArray(formData.rows) ? formData.rows.reduce((s, r) => s + (parseInt(r.totalMeetings, 10) || 0), 0) : 0}
                  </Text>
                  <Text style={styles.metricLabel}>Total Mtgs</Text>
                </View>
                <View style={styles.metricItem}>
                  <Text style={styles.metricVal}>
                    {formData.monthlyDues ?? (Array.isArray(formData.rows) ? formData.rows.reduce((s, r) => s + (parseInt(r.monthlyDues, 10) || 0), 0) : 0)} Rs
                  </Text>
                  <Text style={styles.metricLabel}>Total Dues</Text>
                </View>
              </View>
            </View>
          )}

          {/* Form 9: Central & Provincial Organs */}
          {formType === 'form9' && (
            <View style={styles.dataPreviewBox}>
              <Text style={styles.dataPreviewTitle}>📑 Central & Provincial Organs in District:</Text>
              <View style={styles.metricGrid}>
                <View style={styles.metricItem}>
                  <Text style={styles.metricVal}>
                    {Array.isArray(formData.rows || formData.sec1Members) ? (formData.rows || formData.sec1Members).length : 0}
                  </Text>
                  <Text style={styles.metricLabel}>Organ Members</Text>
                </View>
                <View style={styles.metricItem}>
                  <Text style={styles.metricVal}>
                    {Array.isArray(formData.sec2PublicGatherings) ? formData.sec2PublicGatherings.length : (formData.publicGatherings ?? 0)}
                  </Text>
                  <Text style={styles.metricLabel}>Gatherings</Text>
                </View>
                <View style={styles.metricItem}>
                  <Text style={styles.metricVal}>
                    {formData.sec4BloodBank?.totalCashDonations ?? formData.bloodCash ?? 0} Rs
                  </Text>
                  <Text style={styles.metricLabel}>Blood Bank Fund</Text>
                </View>
              </View>
            </View>
          )}

          {/* Action Buttons */}
          <View style={{ gap: 10, marginTop: Spacing.md }}>
            <TouchableOpacity
              style={styles.editActionBtn}
              onPress={() => setEditorVisible(true)}
            >
              <Ionicons name="create-outline" size={20} color="#fff" />
              <Text style={styles.editActionBtnText}>
                ✏️ {t('proforma.editReportBtn', 'Enter & Edit Report Data (د ډاټا ليکل او سمول)')}
              </Text>
            </TouchableOpacity>

            <View style={[styles.downloadRow, isRTL && { flexDirection: 'row-reverse' }]}>
              <TouchableOpacity
                style={[styles.downloadBtn, styles.downloadPdfBtn]}
                onPress={() => handleDownload('pdf')}
                disabled={!!busyKey}
              >
                {busyKey === `${formType}-pdf` ? (
                  <ActivityIndicator size="small" color="#fff" />
                ) : (
                  <>
                    <Ionicons name="document-text" size={18} color="#fff" />
                    <Text style={styles.downloadPdfText}>{t('common.downloadPdf', 'Download PDF')}</Text>
                  </>
                )}
              </TouchableOpacity>

              <TouchableOpacity
                style={[styles.downloadBtn, styles.downloadXlsxBtn]}
                onPress={() => handleDownload('xlsx')}
                disabled={!!busyKey}
              >
                {busyKey === `${formType}-xlsx` ? (
                  <ActivityIndicator size="small" color="#166534" />
                ) : (
                  <>
                    <Ionicons name="grid-outline" size={18} color="#166534" />
                    <Text style={styles.downloadXlsxText}>{t('common.downloadExcel', 'Download Excel')}</Text>
                  </>
                )}
              </TouchableOpacity>
            </View>
          </View>
        </Card>
      </ScrollView>

      {/* Unit Switcher Modal */}
      <UnitSwitcherModal
        visible={unitSwitcherVisible}
        onClose={() => setUnitSwitcherVisible(false)}
      />

      {/* Comprehensive Proforma Editor Modal */}
      <MobileProformaEditorModal
        visible={editorVisible}
        onClose={() => setEditorVisible(false)}
        formType={formType}
        year={year}
        month={month}
        unitId={targetId}
        areaId={effectiveAreaId}
        districtId={effectiveDistrictId}
        provinceId={effectiveProvinceId}
        unitLevel={activeTargetLevel}
        unitName={displayUnitName}
        onSaved={() => {
          loadEntryData();
        }}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: {
    flex: 1,
    backgroundColor: Colors.background,
  },
  content: {
    padding: Spacing.md,
    gap: Spacing.md,
    paddingBottom: 40,
  },
  header: {
    marginBottom: Spacing.xs,
  },
  pageTitle: {
    fontSize: FontSize.lg,
    fontWeight: '800',
    color: Colors.text,
  },
  pageSubTitle: {
    fontSize: FontSize.xs,
    color: '#64748b',
    marginTop: 4,
    lineHeight: 18,
  },
  offlineBadge: {
    backgroundColor: '#FEE2E2',
    borderColor: '#FCA5A5',
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: 8,
    paddingVertical: 2,
  },
  offlineBadgeText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#DC2626',
  },
  errorBanner: {
    backgroundColor: '#FEF2F2',
    borderColor: '#FECACA',
    borderWidth: 1,
    borderRadius: Radius.sm,
    padding: 10,
    color: '#DC2626',
    fontSize: 12,
  },
  card: {
    backgroundColor: Colors.surface,
    borderRadius: Radius.md,
    padding: Spacing.md,
    ...Platform.select({
      ios: { shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.08, shadowRadius: 4 },
      android: { elevation: 2 },
    }),
  },
  cardTitle: {
    fontSize: FontSize.sm,
    fontWeight: '700',
    color: Colors.text,
  },
  filterPill: {
    backgroundColor: '#f1f5f9',
    borderRadius: Radius.sm,
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  filterPillActive: {
    backgroundColor: Colors.primary,
  },
  filterPillText: {
    fontSize: 11,
    fontWeight: '600',
    color: '#475569',
  },
  filterPillTextActive: {
    color: '#fff',
    fontWeight: '700',
  },
  formSelectBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: '#f8fafc',
    borderColor: '#cbd5e1',
    borderWidth: 1,
    borderRadius: 20,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  formSelectBtnActive: {
    backgroundColor: '#0284c7',
    borderColor: '#0284c7',
  },
  formSelectBtnText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#334155',
  },
  formSelectBtnTextActive: {
    color: '#fff',
    fontWeight: '700',
  },
  activeFormBox: {
    backgroundColor: '#f0f9ff',
    borderColor: '#bae6fd',
    borderWidth: 1,
    borderRadius: Radius.sm,
    padding: 10,
    marginTop: Spacing.sm,
  },
  activeFormTitle: {
    fontSize: 13,
    fontWeight: '700',
    color: '#0369a1',
  },
  activeFormDesc: {
    fontSize: 11,
    color: '#0284c7',
    marginTop: 4,
    lineHeight: 16,
  },
  unitRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  unitIconBox: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: '#eff6ff',
    alignItems: 'center',
    justifyContent: 'center',
  },
  unitSub: {
    fontSize: 10,
    fontWeight: '800',
    color: '#64748b',
    letterSpacing: 0.5,
  },
  unitName: {
    fontSize: 16,
    fontWeight: '800',
    color: Colors.text,
    marginTop: 1,
  },
  unitTier: {
    fontSize: 11,
    fontWeight: '600',
    color: Colors.primary,
    marginTop: 1,
  },
  switchBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: Radius.sm,
    backgroundColor: '#f1f5f9',
    borderWidth: 1,
    borderColor: '#cbd5e1',
  },
  switchBtnText: {
    fontSize: 12,
    fontWeight: '700',
    color: Colors.primary,
  },
  label: {
    fontSize: 11,
    fontWeight: '700',
    color: '#475569',
    marginBottom: 4,
  },
  pillBtn: {
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: Radius.sm,
    backgroundColor: '#f1f5f9',
    borderWidth: 1,
    borderColor: '#cbd5e1',
  },
  pillBtnActive: {
    backgroundColor: Colors.primary,
    borderColor: Colors.primary,
  },
  pillBtnText: {
    fontSize: 11,
    color: '#334155',
    fontWeight: '600',
  },
  pillBtnTextActive: {
    color: '#fff',
    fontWeight: '700',
  },
  yearBtn: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    backgroundColor: '#f1f5f9',
    borderRadius: 6,
    borderWidth: 1,
    borderColor: '#cbd5e1',
  },
  yearBtnText: {
    fontSize: 12,
    fontWeight: '700',
    color: Colors.text,
  },
  yearText: {
    fontSize: 14,
    fontWeight: '800',
    color: Colors.text,
    paddingHorizontal: 4,
  },
  monthBtn: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 8,
    backgroundColor: '#f8fafc',
    borderWidth: 1,
    borderColor: '#cbd5e1',
  },
  monthBtnActive: {
    backgroundColor: '#0284c7',
    borderColor: '#0284c7',
  },
  monthBtnText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#334155',
  },
  monthBtnTextActive: {
    color: '#fff',
    fontWeight: '700',
  },
  dataPreviewBox: {
    backgroundColor: '#f8fafc',
    borderColor: '#e2e8f0',
    borderWidth: 1,
    borderRadius: Radius.sm,
    padding: 10,
    marginTop: Spacing.xs,
  },
  dataPreviewTitle: {
    fontSize: 12,
    fontWeight: '700',
    color: '#334155',
  },
  previewRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    backgroundColor: '#fff',
    padding: 8,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: '#e2e8f0',
  },
  previewRowTitle: {
    fontSize: 12,
    fontWeight: '700',
    color: Colors.text,
  },
  previewRowSub: {
    fontSize: 10,
    color: '#64748b',
    marginTop: 2,
  },
  previewRowVal: {
    fontSize: 12,
    fontWeight: '700',
    color: '#166534',
  },
  metricGrid: {
    flexDirection: 'row',
    gap: 8,
    marginTop: 6,
  },
  metricItem: {
    flex: 1,
    backgroundColor: '#fff',
    padding: 8,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: '#e2e8f0',
    alignItems: 'center',
  },
  metricVal: {
    fontSize: 13,
    fontWeight: '800',
    color: Colors.primary,
  },
  metricLabel: {
    fontSize: 9,
    color: '#64748b',
    marginTop: 2,
    textAlign: 'center',
  },
  noDataText: {
    fontSize: 11,
    color: '#94a3b8',
    fontStyle: 'italic',
    marginTop: 4,
  },
  editActionBtn: {
    backgroundColor: '#16a34a',
    borderRadius: Radius.sm,
    paddingVertical: 12,
    paddingHorizontal: 16,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    ...Platform.select({
      ios: { shadowColor: '#16a34a', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.2, shadowRadius: 3 },
      android: { elevation: 2 },
    }),
  },
  editActionBtnText: {
    color: '#fff',
    fontSize: 13,
    fontWeight: '700',
  },
  downloadRow: {
    flexDirection: 'row',
    gap: 10,
  },
  downloadBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 10,
    borderRadius: Radius.sm,
    borderWidth: 1,
  },
  downloadPdfBtn: {
    backgroundColor: '#0284c7',
    borderColor: '#0284c7',
  },
  downloadPdfText: {
    color: '#fff',
    fontSize: 12,
    fontWeight: '700',
  },
  downloadXlsxBtn: {
    backgroundColor: '#dcfce7',
    borderColor: '#86efac',
  },
  downloadXlsxText: {
    color: '#166534',
    fontSize: 12,
    fontWeight: '700',
  },
});
