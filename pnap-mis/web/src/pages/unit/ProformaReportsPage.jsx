import React, { useEffect, useState, useRef, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { useUnit } from '../../context/UnitContext';
import { useAuth } from '../../context/AuthContext';
import { api, errorMessage } from '../../api/client';
import UnitSwitcher from '../../components/UnitSwitcher';
import PashtoKeyboardHelper from '../../components/PashtoKeyboardHelper';
import { homeTierOf, isLevelAllowed } from '../../utils/unitTier';
import Form7Workspace from './proforma/Form7Workspace';

import Form8Workspace from './proforma/Form8Workspace';
import Form9Workspace from './proforma/Form9Workspace';

function downloadAuthed(path, filename) {
  const token = localStorage.getItem('pnap_token');
  const headers = token ? { Authorization: `Bearer ${token}` } : {};
  return fetch(path, { headers })
    .then(async (res) => {
      if (!res.ok) {
        let msg = `Server returned ${res.status}`;
        try {
          const j = await res.json();
          if (j?.error?.message) msg = j.error.message;
        } catch (_) {}
        throw new Error(msg);
      }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    });
}

// Interactive Number Stepper Component
function NumberStepper({ value, onChange, min = 0, max = Infinity, step = 1, placeholder = '0', style = {} }) {
  const numVal = parseInt(value, 10) || 0;
  return (
    <div
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        border: '1px solid var(--border)',
        borderRadius: 6,
        overflow: 'hidden',
        background: 'var(--surface-alt)',
        whiteSpace: 'nowrap',
        minWidth: 96,
        ...style,
      }}
    >
      <button
        type="button"
        onClick={() => onChange(Math.max(min, numVal - step))}
        style={{
          border: 'none',
          background: 'transparent',
          padding: '4px 8px',
          cursor: 'pointer',
          color: 'var(--text-soft)',
          fontWeight: 'bold',
          fontSize: 14,
          userSelect: 'none',
          lineHeight: 1,
        }}
      >
        −
      </button>
      <input
        type="number"
        value={value ?? ''}
        min={min}
        max={max !== Infinity ? max : undefined}
        onChange={(e) => {
          if (e.target.value === '') return onChange('');
          const parsed = parseInt(e.target.value, 10);
          if (isNaN(parsed)) return onChange(min);
          const clamped = Math.max(min, Math.min(max, parsed));
          onChange(clamped);
        }}
        placeholder={placeholder}
        style={{
          width: '100%',
          maxWidth: 44,
          minWidth: 24,
          flex: 1,
          textAlign: 'center',
          border: 'none',
          background: 'transparent',
          color: 'inherit',
          fontWeight: 'bold',
          fontSize: 13,
          outline: 'none',
          padding: '3px 0',
        }}
      />
      <button
        type="button"
        onClick={() => onChange(Math.min(max, numVal + step))}
        disabled={numVal >= max}
        style={{
          border: 'none',
          background: 'transparent',
          padding: '4px 8px',
          cursor: numVal >= max ? 'not-allowed' : 'pointer',
          color: numVal >= max ? 'var(--border)' : 'var(--text-soft)',
          fontWeight: 'bold',
          fontSize: 14,
          userSelect: 'none',
          lineHeight: 1,
        }}
      >
        +
      </button>
    </div>
  );
}

export const PROFORMA_FORMS = [
  {
    id: 'form1',
    targetLevel: 'AREA',
    icon: '📋',
    defaultTab: 'upper',
    btnKey: 'proforma.form1Btn',
    defaultBtnLabel: 'Form 1: Area Unit Report (علاقائي يونټ)',
    titleKey: 'proforma.form1Title',
    defaultTitle: 'Area Unit Monthly Work & Activity Report (Form 1)',
    descKey: 'proforma.form1Desc',
    defaultDesc: 'Official party monthly work and activity report for Area Executive and Subordinate Units',
    previewTitleKey: 'proforma.previewModalTitleForm1',
    defaultPreviewTitle: 'Area Unit Monthly Work & Activity Report (A4 Landscape Preview)',
  },
  {
    id: 'form2',
    targetLevel: 'AREA',
    icon: '📑',
    defaultTab: 'upper',
    btnKey: 'proforma.form2Btn',
    defaultBtnLabel: 'Form 2: Subordinate Basic Units Report (ماتحت بنسټيز يونټونه)',
    titleKey: 'proforma.form2Title',
    defaultTitle: 'Subordinate Basic Units Monthly Work & Activity Report (Form 2)',
    descKey: 'proforma.form2Desc',
    defaultDesc: 'Official monthly work and activity report for subordinate basic units under Area Unit',
    previewTitleKey: 'proforma.previewModalTitleForm2',
    defaultPreviewTitle: 'Subordinate Basic Units Monthly Work & Activity Report (A4 Landscape Preview)',
  },
  {
    id: 'form3',
    targetLevel: 'AREA',
    icon: '📑',
    defaultTab: 'form3_tab1',
    btnKey: 'proforma.form3Btn',
    defaultBtnLabel: 'Form 3: Area Detailed Report (علاقائي يونټ تفصيلي)',
    titleKey: 'proforma.form3Title',
    defaultTitle: 'Area Unit Detailed Activity Proforma (Form 3)',
    descKey: 'proforma.form3Desc',
    defaultDesc: 'Official monthly detailed work and activity report for Area Unit',
    previewTitleKey: 'proforma.previewModalTitleForm3',
    defaultPreviewTitle: 'Area Unit Monthly Detailed Work & Activity Report (A4 Portrait Preview)',
  },
  {
    id: 'form4',
    targetLevel: 'BASIC_UNIT',
    icon: '📄',
    defaultTab: 'upper',
    btnKey: 'proforma.form4Btn',
    defaultBtnLabel: 'Form 4: Basic Unit Report (بنسټيز يونټ)',
    titleKey: 'proforma.form4Title',
    defaultTitle: 'Basic Unit Monthly Work & Activity Report (Form 4)',
    descKey: 'proforma.form4Desc',
    defaultDesc: 'Official party monthly work & activity report for Basic Unit Executive',
    previewTitleKey: 'proforma.previewModalTitleForm4',
    defaultPreviewTitle: 'Basic Unit Monthly Work & Activity Report (A4 Landscape Preview)',
  },
  {
    id: 'form5',
    targetLevel: 'PROVINCE',
    icon: '🏛️',
    defaultTab: 'upper',
    btnKey: 'proforma.form5Btn',
    defaultBtnLabel: 'Form 5: Provincial Executive Report (صوبائي ايګزيکټيو)',
    titleKey: 'proforma.form5Title',
    defaultTitle: 'Provincial Executive Individual Work & Activity Report (Form 5)',
    descKey: 'proforma.form5Desc',
    defaultDesc: 'Official party individual work and activity report for Provincial Executive leadership',
    previewTitleKey: 'proforma.previewModalTitleForm5',
    defaultPreviewTitle: 'Provincial Executive Individual Work & Activity Report (Form 5) - A4 Landscape Preview',
  },
  {
    id: 'form6',
    targetLevel: 'DISTRICT',
    icon: '🏛️',
    defaultTab: 'upper',
    btnKey: 'proforma.form6Btn',
    defaultBtnLabel: 'Form 6: District Report (ضلعي يونټ)',
    titleKey: 'proforma.form6Title',
    defaultTitle: 'District Work & Activity Monthly Report (Form 6)',
    descKey: 'proforma.form6Desc',
    defaultDesc: 'Official party monthly work & activity report for District Executive and Subordinate Units',
    previewTitleKey: 'proforma.previewModalTitleForm6',
    defaultPreviewTitle: 'District Monthly Work & Activity Report (Form 6) - A4 Landscape Preview',
  },
  {
    id: 'form7',
    targetLevel: 'DISTRICT',
    icon: '📑',
    defaultTab: 'upper',
    btnKey: 'proforma.form7Btn',
    defaultBtnLabel: 'Form 7: District Subordinate Area Units (ضلع کښي علاقائي يونټونه)',
    titleKey: 'proforma.form7Title',
    defaultTitle: 'District Subordinate Area Units Monthly Work & Activity Report (Form 7)',
    descKey: 'proforma.form7Desc',
    defaultDesc: 'Official party monthly work & activity report for subordinate Area Units under District',
    previewTitleKey: 'proforma.previewModalTitleForm7',
    defaultPreviewTitle: 'District Subordinate Area Units Monthly Work & Activity Report (Form 7) - A4 Landscape Preview',
  },
  {
    id: 'form8',
    targetLevel: 'DISTRICT',
    icon: '📑',
    defaultTab: 'upper',
    btnKey: 'proforma.form8Btn',
    defaultBtnLabel: 'Form 8: Central & Provincial Committee in District (ضلع کښي مرکزي، صوبائي کميټي)',
    titleKey: 'proforma.form8Title',
    defaultTitle: 'District Central & Provincial Committee Monthly Work & Activity Report (Form 8)',
    descKey: 'proforma.form8Desc',
    defaultDesc: 'Official party monthly work & activity report for Central and Provincial Committee Members residing/working in the District',
    previewTitleKey: 'proforma.previewModalTitleForm8',
    defaultPreviewTitle: 'District Central & Provincial Committee Monthly Work & Activity Report (Form 8) - A4 Landscape Preview',
  },
  {
    id: 'form9',
    targetLevel: 'DISTRICT',
    icon: '📑',
    defaultTab: 'upper',
    btnKey: 'proforma.form9Btn',
    defaultBtnLabel: 'Form 9: Central & Provincial Organs in District (ضلع کښي مرکزي، صوبائي ادارې)',
    titleKey: 'proforma.form9Title',
    defaultTitle: 'District Central & Provincial Organs Members Monthly Work & Activity Report (Form 9)',
    descKey: 'proforma.form9Desc',
    defaultDesc: 'Official party monthly work & activity report for Central and Provincial Organs members in the District',
    previewTitleKey: 'proforma.previewModalTitleForm9',
    defaultPreviewTitle: 'District Central & Provincial Organs Monthly Report (Form 9) - A4 Portrait Preview',
  },
];

export default function ProformaReportsPage() {
  const { t, i18n } = useTranslation();
  const { user } = useAuth();
  const { ctx } = useUnit();

  const isRtl = i18n.language === 'ps' || i18n.language === 'ur';

  const homeTier = useMemo(() => homeTierOf(user)?.level || 'CENTRAL', [user]);

  // Compute allowed forms strictly according to the user's home tier (lower tier cannot access higher)
  const allowedForms = useMemo(() => {
    return PROFORMA_FORMS.filter((f) => isLevelAllowed(user, f.targetLevel));
  }, [user]);

  // Default to the first allowed form for user's tier
  const [formType, setFormType] = useState(() => {
    const allowed = PROFORMA_FORMS.filter((f) => isLevelAllowed(user, f.targetLevel));
    if (ctx?.unitLevel === 'BASIC_UNIT' && allowed.some((f) => f.id === 'form4')) return 'form4';
    if (ctx?.unitLevel === 'DISTRICT' && allowed.some((f) => f.id === 'form6')) return 'form6';
    if (ctx?.unitLevel === 'PROVINCE' && allowed.some((f) => f.id === 'form5')) return 'form5';
    return allowed[0]?.id || 'form1';
  });

  // Guard: if formType is somehow set to a disallowed higher-level form, reset to an allowed one
  useEffect(() => {
    if (allowedForms.length > 0 && !allowedForms.some((f) => f.id === formType)) {
      setFormType(allowedForms[0].id);
    }
  }, [allowedForms, formType]);

  const currentFormConfig = PROFORMA_FORMS.find((f) => f.id === formType) || PROFORMA_FORMS[0];
  const [year, setYear] = useState(new Date().getFullYear());
  const [month, setMonth] = useState(new Date().getMonth() + 1);

  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [statusDoc, setStatusDoc] = useState(null);
  const [formData, setFormData] = useState({});
  const [feedback, setFeedback] = useState({ text: '', type: '' });
  const [previewOpen, setPreviewOpen] = useState(false);
  const [previewHtml, setPreviewHtml] = useState('');
  const [previewLoading, setPreviewLoading] = useState(false);
  const [showUnitSwitcher, setShowUnitSwitcher] = useState(false);
  const [showAutofillModal, setShowAutofillModal] = useState(false);
  const [resetting, setResetting] = useState(false);

  // Basic Units list for Form 4 dropdown selection
  const [basicUnitsList, setBasicUnitsList] = useState([]);
  const [selectedUnitId, setSelectedUnitId] = useState(() => (ctx?.unitLevel === 'BASIC_UNIT' ? ctx?.unitId : ''));
  const [areasList, setAreasList] = useState([]);
  const [selectedAreaId, setSelectedAreaId] = useState('');
  const [provincesList, setProvincesList] = useState([]);
  const [selectedProvinceId, setSelectedProvinceId] = useState(() => (ctx?.provinceId || user?.scope?.provinceId || ''));

  // Active Tab: 'upper' (Overview & Upper Table), 'roster' (Executive Members), 'notes' (Remarks)
  const [activeTab, setActiveTab] = useState('upper');
  // Roster View Mode: 'cards' (interactive cards) or 'table' (dense spreadsheet table)
  const [rosterViewMode, setRosterViewMode] = useState('cards');
  // Form 2 View Mode: 'cards' or 'table'
  const [form2ViewMode, setForm2ViewMode] = useState('cards');
  const [form2Search, setForm2Search] = useState('');
  // Form 5 View Mode: 'cards' or 'table'
  const [form5ViewMode, setForm5ViewMode] = useState('cards');
  const [form5Search, setForm5Search] = useState('');
  // Form 6 View Mode: 'cards' or 'table'
  const [form6ViewMode, setForm6ViewMode] = useState('cards');
  const [form6Search, setForm6Search] = useState('');
  // Form 7 View Mode: 'cards' or 'table'
  const [form7ViewMode, setForm7ViewMode] = useState('cards');
  const [form7Search, setForm7Search] = useState('');
  // Form 8 View Mode: 'cards' or 'table'
  const [form8ViewMode, setForm8ViewMode] = useState('cards');
  const [form8Search, setForm8Search] = useState('');
  // Form 9 View Mode: 'cards' or 'table' & activeSection
  const [form9ActiveSection, setForm9ActiveSection] = useState('sec1');
  const [form9ViewMode, setForm9ViewMode] = useState('cards');
  const [form9Search, setForm9Search] = useState('');
  const [districtsList, setDistrictsList] = useState([]);
  const [selectedDistrictId, setSelectedDistrictId] = useState(() => (ctx?.districtId || user?.scope?.districtId || ''));

  const activeInputRef = useRef(null);

  useEffect(() => {
    const handleFocus = (e) => {
      if (e.target && (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA')) {
        activeInputRef.current = e.target;
      }
    };
    document.addEventListener('focusin', handleFocus);
    return () => document.removeEventListener('focusin', handleFocus);
  }, []);

  // Load districts list for Form 6-9
  useEffect(() => {
    const params = {};
    if (effectiveProvinceId && homeTier === 'PROVINCE') {
      params.provinceId = effectiveProvinceId;
    }
    api.get('/org/districts', { params })
      .then((res) => {
        const list = res.data?.data || [];
        setDistrictsList(list);
        if (list.length > 0) {
          setSelectedDistrictId((prev) => {
            if (prev && list.some((d) => String(d._id) === String(prev))) return prev;
            const defaultDist = (user?.scope?.districtId && list.some((d) => String(d._id) === String(user.scope.districtId)))
              ? String(user.scope.districtId)
              : String(list[0]._id);
            return defaultDist;
          });
        }
      })
      .catch((err) => console.error('Failed to load districts:', err));
  }, [user?.scope?.districtId, effectiveProvinceId, homeTier]);

  // Resolve effective districtId
  const effectiveDistrictId = useMemo(() => {
    if (selectedDistrictId) return selectedDistrictId;
    if (ctx?.unitLevel === 'DISTRICT') return ctx.unitId;
    if (ctx?.districtId) return ctx.districtId;
    if (user?.scope?.districtId) return user.scope.districtId;
    return districtsList[0]?._id ? String(districtsList[0]._id) : '';
  }, [selectedDistrictId, ctx, user, districtsList]);

  // Load provinces list for Form 5
  useEffect(() => {
    api.get('/org/provinces')
      .then((res) => {
        const list = res.data?.data || [];
        setProvincesList(list);
        if (list.length > 0 && !selectedProvinceId) {
          const defaultProv = (user?.scope?.provinceId && list.some((p) => String(p._id) === String(user.scope.provinceId)))
            ? String(user.scope.provinceId)
            : String(list[0]._id);
          setSelectedProvinceId(defaultProv);
        }
      })
      .catch((err) => console.error('Failed to load provinces:', err));
  }, [user?.scope?.provinceId]);

  // Resolve effective provinceId
  const effectiveProvinceId = useMemo(() => {
    if (selectedProvinceId) return selectedProvinceId;
    if (ctx?.unitLevel === 'PROVINCE') return ctx.unitId;
    if (ctx?.provinceId) return ctx.provinceId;
    if (user?.scope?.provinceId) return user.scope.provinceId;
    return provincesList[0]?._id ? String(provincesList[0]._id) : '';
  }, [selectedProvinceId, ctx, user, provincesList]);

  // Load areas if user is at higher level (District, Province, Central)
  useEffect(() => {
    if (ctx?.unitLevel === 'AREA' || ctx?.unitLevel === 'BASIC_UNIT') return;
    const params = {};
    if (effectiveDistrictId) params.districtId = effectiveDistrictId;
    api.get('/org/areas', { params })
      .then((res) => {
        const list = res.data?.data || [];
        setAreasList(list);
        if (list.length > 0) {
          setSelectedAreaId((prev) => {
            if (prev && list.some((a) => String(a._id) === String(prev))) return prev;
            return String(list[0]._id);
          });
        } else {
          setSelectedAreaId('');
        }
      })
      .catch((err) => console.error('Failed to load areas:', err));
  }, [effectiveDistrictId, ctx?.unitLevel]);

  // Resolve effective areaId
  const effectiveAreaId = useMemo(() => {
    if (selectedAreaId) return selectedAreaId;
    if (ctx?.unitLevel === 'AREA') return ctx.unitId;
    if (ctx?.areaId) return ctx.areaId;
    if (user?.scope?.areaId) return user.scope.areaId;
    return areasList[0]?._id ? String(areasList[0]._id) : '';
  }, [selectedAreaId, ctx, user, areasList]);


  // Load basic units under the effective area for Form 4 selection
  useEffect(() => {
    if (ctx?.unitLevel === 'BASIC_UNIT') {
      setSelectedUnitId(ctx.unitId);
      return;
    }

    const currentArea = ctx?.unitLevel === 'AREA' ? ctx.unitId : (selectedAreaId || (effectiveAreaId && ctx?.unitLevel !== 'CENTRAL' ? effectiveAreaId : ''));
    const params = {};
    if (currentArea) {
      params.areaId = currentArea;
    }

    api.get('/org/basic-units', { params })
      .then((res) => {
        const units = res.data?.data || [];
        setBasicUnitsList(units);
        if (units.length > 0) {
          setSelectedUnitId((prev) => {
            if (prev && units.some((u) => String(u._id) === String(prev))) return prev;
            return String(units[0]._id);
          });
        }
      })
      .catch((err) => console.error('Failed to load basic units:', err));
  }, [effectiveAreaId, selectedAreaId, ctx?.unitLevel, ctx?.unitId]);

  // Resolve target unit ID based on current formType
  const targetId = useMemo(() => {
    if (formType === 'form6' || formType === 'form7' || formType === 'form8') {
      return effectiveDistrictId;
    }
    if (formType === 'form9') {
      return effectiveDistrictId || effectiveAreaId;
    }
    if (formType === 'form5') {
      return effectiveProvinceId;
    }
    if (formType === 'form4') {
      if (ctx?.unitLevel === 'BASIC_UNIT') return ctx.unitId;
      return selectedUnitId || (basicUnitsList[0]?._id) || '';
    }
    return effectiveAreaId;
  }, [formType, effectiveDistrictId, effectiveAreaId, effectiveProvinceId, ctx, selectedUnitId, basicUnitsList]);

  // Resolve active unit display name
  const activeUnitDisplayName = useMemo(() => {
    if (formType === 'form6' || formType === 'form7' || formType === 'form8' || formType === 'form9') {
      if (ctx?.unitLevel === 'DISTRICT') return ctx.unitName;
      const found = districtsList.find((d) => String(d._id) === String(targetId));
      if (found?.name) return found.name;
      if (ctx?.unitLevel === 'AREA') return ctx.unitName;
      return formData.districtName || formData.areaName || 'District';
    }
    if (formType === 'form5') {
      if (ctx?.unitLevel === 'PROVINCE') return ctx.unitName;
      const found = provincesList.find((p) => String(p._id) === String(targetId));
      return found?.name || formData.provinceName || 'Province';
    }
    if (formType === 'form4') {
      if (ctx?.unitLevel === 'BASIC_UNIT') return ctx.unitName;
      const found = basicUnitsList.find((b) => String(b._id) === String(targetId));
      return found?.name || formData.unitName || 'Basic Unit';
    }
    const foundArea = areasList.find((a) => String(a._id) === String(targetId));
    if (foundArea?.name) return foundArea.name;
    return ctx?.unitName || formData.areaName || 'Area Unit';
  }, [formType, ctx, targetId, districtsList, provincesList, basicUnitsList, areasList, formData]);

  // Sanitize data removing legacy dashes or placeholders
  function sanitizeReportData(raw) {
    if (!raw || typeof raw !== 'object') return raw || {};
    const cleaned = { ...raw };
    if (cleaned.upper && typeof cleaned.upper === 'object') {
      const u = { ...cleaned.upper };
      for (const [k, v] of Object.entries(u)) {
        if (typeof v === 'string') {
          const tr = v.trim();
          if (tr === '—' || tr === '-' || tr === '__' || tr === '---') {
            u[k] = '';
          } else if (tr.startsWith('—')) {
            u[k] = tr.replace(/^—+\s*/, '');
          }
        }
      }
      cleaned.upper = u;
    }
    const cleanRowsList = (list) => {
      if (!Array.isArray(list)) return list;
      return list.map((r) => {
        const cr = { ...r };
        for (const [k, v] of Object.entries(cr)) {
          if (typeof v === 'string') {
            const tr = v.trim();
            if (tr === '—' || tr === '-' || tr === '__' || tr === '---') cr[k] = '';
            else if (tr.startsWith('—')) cr[k] = tr.replace(/^—+\s*/, '');
          }
        }
        return cr;
      });
    };
    if (cleaned.rows) cleaned.rows = cleanRowsList(cleaned.rows);
    if (cleaned.execRows) cleaned.execRows = cleanRowsList(cleaned.execRows);
    if (cleaned.inactiveUnits) cleaned.inactiveUnits = cleanRowsList(cleaned.inactiveUnits);
    if (cleaned.committeeMembers) cleaned.committeeMembers = cleanRowsList(cleaned.committeeMembers);
    if (cleaned.publicActivities) cleaned.publicActivities = cleanRowsList(cleaned.publicActivities);
    if (cleaned.educationalActivities) cleaned.educationalActivities = cleanRowsList(cleaned.educationalActivities);
    if (cleaned.sec1Members) cleaned.sec1Members = cleanRowsList(cleaned.sec1Members);
    if (cleaned.sec2PublicGatherings) cleaned.sec2PublicGatherings = cleanRowsList(cleaned.sec2PublicGatherings);
    if (cleaned.sec3Conferences) cleaned.sec3Conferences = cleanRowsList(cleaned.sec3Conferences);
    if (cleaned.sec5Discipline) cleaned.sec5Discipline = cleanRowsList(cleaned.sec5Discipline);
    return cleaned;
  }

  // Load proforma report data from DB or system baseline
  async function loadData(prefillFromSystem = false) {
    if (!targetId) {
      setStatusDoc(null);
      return;
    }
    setLoading(true);
    setStatusDoc(null);
    setFeedback({ text: '', type: '' });
    try {
      const params = {
        formType,
        year,
        month,
        unitId: targetId,
        areaId: (formType === 'form5' || formType === 'form6' || formType === 'form7' || formType === 'form8') ? undefined : effectiveAreaId,
        provinceId: formType === 'form5' ? effectiveProvinceId : undefined,
        districtId: (formType === 'form6' || formType === 'form7' || formType === 'form8' || formType === 'form9') ? effectiveDistrictId : undefined,
        prefill: prefillFromSystem ? 'true' : undefined,
      };

      const res = await api.get('/proforma/entry', { params });
      setStatusDoc(res.data);
      setFormData(sanitizeReportData(res.data.data || {}));

      if (prefillFromSystem) {
        setFeedback({ text: t('proforma.autofillSuccess', 'Data auto-filled from live system records. Remember to Save & Submit.'), type: 'info' });
      }
    } catch (e) {
      setFeedback({ text: errorMessage(e), type: 'error' });
    } finally {
      setLoading(false);
    }
  }

  // Interactive Autofill: mode can be 'emptyOnly' (keeps manual edits) or 'full' (overwrites)
  async function executeAutofill(mode = 'emptyOnly') {
    setShowAutofillModal(false);
    if (!targetId) return;
    setLoading(true);
    setFeedback({ text: '', type: '' });
    try {
      const params = {
        formType,
        year,
        month,
        unitId: targetId,
        areaId: (formType === 'form5' || formType === 'form6' || formType === 'form7' || formType === 'form8') ? undefined : effectiveAreaId,
        provinceId: formType === 'form5' ? effectiveProvinceId : undefined,
        districtId: (formType === 'form6' || formType === 'form7' || formType === 'form8' || formType === 'form9') ? effectiveDistrictId : undefined,
        prefill: 'true',
      };
      const res = await api.get('/proforma/entry', { params });
      const sysDoc = res.data;
      const sysData = sanitizeReportData(sysDoc.data || {});

      if (mode === 'full') {
        setStatusDoc(sysDoc);
        setFormData(sysData);
        setFeedback({ text: t('proforma.autofillSuccess', 'Full sync complete: all fields populated from system records.'), type: 'info' });
      } else {
        // Smart merge: only populate missing or empty fields
        setFormData((prev) => {
          if (formType === 'form9') {
            const hasExistingMembers = Array.isArray(prev.sec1Members) && prev.sec1Members.some((r) => r.name && r.name.trim());
            const hasExistingSec2 = Array.isArray(prev.sec2PublicGatherings) && prev.sec2PublicGatherings.some((r) => r.topic && r.topic.trim());
            const hasExistingSec3 = Array.isArray(prev.sec3Conferences) && prev.sec3Conferences.some((r) => r.topic && r.topic.trim());
            const hasExistingSec5 = Array.isArray(prev.sec5Discipline) && prev.sec5Discipline.some((r) => r.comradeName && r.comradeName.trim());

            return {
              ...prev,
              districtName: prev.districtName || sysData.districtName,
              areaName: prev.areaName || sysData.areaName,
              sec1Members: hasExistingMembers ? prev.sec1Members : (sysData.sec1Members || []),
              sec2PublicGatherings: hasExistingSec2 ? prev.sec2PublicGatherings : (sysData.sec2PublicGatherings || []),
              sec3Conferences: hasExistingSec3 ? prev.sec3Conferences : (sysData.sec3Conferences || []),
              sec4BloodBank: { ...(sysData.sec4BloodBank || {}), ...(prev.sec4BloodBank || {}) },
              sec5Discipline: hasExistingSec5 ? prev.sec5Discipline : (sysData.sec5Discipline || []),
              sec6Proposals: {
                political: { ...(sysData.sec6Proposals?.political || {}), ...(prev.sec6Proposals?.political || {}) },
                organizational: { ...(sysData.sec6Proposals?.organizational || {}), ...(prev.sec6Proposals?.organizational || {}) },
                social: { ...(sysData.sec6Proposals?.social || {}), ...(prev.sec6Proposals?.social || {}) },
              },
              sec7Notes: {
                socialWorkReport: prev.sec7Notes?.socialWorkReport || sysData.sec7Notes?.socialWorkReport || '',
                miscellaneousNotes: prev.sec7Notes?.miscellaneousNotes || sysData.sec7Notes?.miscellaneousNotes || '',
                areaSecSignature: prev.sec7Notes?.areaSecSignature || sysData.sec7Notes?.areaSecSignature || '',
                areaSeniorDeputySignature: prev.sec7Notes?.areaSeniorDeputySignature || sysData.sec7Notes?.areaSeniorDeputySignature || '',
                signatureDate: prev.sec7Notes?.signatureDate || sysData.sec7Notes?.signatureDate || '',
              },
            };
          }

          if (formType === 'form8') {
            let mergedRows = prev.rows || [];
            const sysRows = sysData.rows || [];
            if (!mergedRows || mergedRows.length === 0) {
              mergedRows = sysRows;
            } else if (sysRows && sysRows.length > 0) {
              mergedRows = mergedRows.map((r, i) => {
                const sr = sysRows.find((x) => (x.name && x.name === r.name) || (x.srNo && x.srNo === r.srNo)) || sysRows[i] || {};
                const updatedR = { ...r };
                for (const [rk, rv] of Object.entries(sr)) {
                  if (updatedR[rk] === undefined || updatedR[rk] === '' || updatedR[rk] === null) {
                    updatedR[rk] = rv;
                  }
                }
                return updatedR;
              });
            }

            return {
              ...prev,
              districtName: prev.districtName || sysData.districtName,
              year: prev.year || sysData.year,
              month: prev.month || sysData.month,
              rows: mergedRows,
            };
          }

          if (formType === 'form7') {
            let mergedRows = prev.rows || [];
            const sysRows = sysData.rows || [];
            if (!mergedRows || mergedRows.length === 0) {
              mergedRows = sysRows;
            } else if (sysRows && sysRows.length > 0) {
              mergedRows = mergedRows.map((r, i) => {
                const sr = sysRows.find((x) => x.unitId && String(x.unitId) === String(r.unitId)) || sysRows[i] || {};
                const updatedR = { ...r };
                for (const [rk, rv] of Object.entries(sr)) {
                  if (updatedR[rk] === undefined || updatedR[rk] === '' || updatedR[rk] === null) {
                    updatedR[rk] = rv;
                  }
                }
                return updatedR;
              });
            }

            return {
              ...prev,
              districtName: prev.districtName || sysData.districtName,
              year: prev.year || sysData.year,
              month: prev.month || sysData.month,
              rows: mergedRows,
            };
          }

          if (formType === 'form6') {
            const mergedUpper = { ...(prev.upper || {}) };
            const sysUpper = sysData.upper || {};
            for (const [k, v] of Object.entries(sysUpper)) {
              if (mergedUpper[k] === undefined || mergedUpper[k] === '' || mergedUpper[k] === null) {
                mergedUpper[k] = v;
              }
            }

            let mergedRows = prev.rows || [];
            const sysRows = sysData.rows || [];
            if (!mergedRows || mergedRows.length === 0) {
              mergedRows = sysRows;
            } else if (sysRows && sysRows.length > 0) {
              mergedRows = mergedRows.map((r, i) => {
                const sr = sysRows[i] || {};
                const updatedR = { ...r };
                for (const [rk, rv] of Object.entries(sr)) {
                  if (updatedR[rk] === undefined || updatedR[rk] === '' || updatedR[rk] === null) {
                    updatedR[rk] = rv;
                  }
                }
                return updatedR;
              });
            }

            return {
              ...prev,
              districtName: prev.districtName || sysData.districtName,
              m1: prev.m1 !== undefined ? prev.m1 : (sysData.m1 || ''),
              m2: prev.m2 !== undefined ? prev.m2 : (sysData.m2 || ''),
              m3: prev.m3 !== undefined ? prev.m3 : (sysData.m3 || ''),
              year: prev.year || sysData.year,
              upper: mergedUpper,
              rows: mergedRows,
            };
          }

          if (formType === 'form5') {
            let mergedRows = prev.rows || [];
            const sysRows = sysData.rows || [];
            if (!mergedRows || mergedRows.length === 0) {
              mergedRows = sysRows;
            } else if (sysRows && sysRows.length > 0) {
              mergedRows = mergedRows.map((r, i) => {
                const sr = sysRows[i] || {};
                const updatedR = { ...r };
                for (const [rk, rv] of Object.entries(sr)) {
                  if (updatedR[rk] === undefined || updatedR[rk] === '' || updatedR[rk] === null) {
                    updatedR[rk] = rv;
                  }
                }
                return updatedR;
              });
            }
            return {
              ...prev,
              provinceName: prev.provinceName || sysData.provinceName,
              fromDate: prev.fromDate || sysData.fromDate,
              toDate: prev.toDate || sysData.toDate,
              year: prev.year || sysData.year,
              rows: mergedRows,
            };
          }

          if (formType === 'form3') {
            return {
              ...prev,
              areaName: prev.areaName || sysData.areaName,
              inactiveUnits: (prev.inactiveUnits && prev.inactiveUnits.length > 0) ? prev.inactiveUnits : (sysData.inactiveUnits || []),
              committeeMembers: (prev.committeeMembers && prev.committeeMembers.length > 0) ? prev.committeeMembers : (sysData.committeeMembers || []),
              publicActivities: (prev.publicActivities && prev.publicActivities.length > 0) ? prev.publicActivities : (sysData.publicActivities || []),
              educationalActivities: (prev.educationalActivities && prev.educationalActivities.length > 0) ? prev.educationalActivities : (sysData.educationalActivities || []),
              disciplinaryActions: (prev.disciplinaryActions && prev.disciplinaryActions.length > 0) ? prev.disciplinaryActions : (sysData.disciplinaryActions || []),
              bloodBank: {
                ...(sysData.bloodBank || {}),
                ...(prev.bloodBank || {}),
              },
              proposals: {
                ...(sysData.proposals || {}),
                ...(prev.proposals || {}),
              },
              officeActivity: prev.officeActivity || sysData.officeActivity || '',
              socialReport: prev.socialReport || sysData.socialReport || '',
              misc: prev.misc || sysData.misc || '',
              secSignature: prev.secSignature || sysData.secSignature || '',
              seniorSecSignature: prev.seniorSecSignature || sysData.seniorSecSignature || '',
            };
          }

          const mergedUpper = { ...(prev.upper || {}) };
          const sysUpper = sysData.upper || {};
          for (const [k, v] of Object.entries(sysUpper)) {
            if (mergedUpper[k] === undefined || mergedUpper[k] === '' || mergedUpper[k] === null) {
              mergedUpper[k] = v;
            }
          }

          let mergedRows = prev.rows || prev.execRows || [];
          const sysRows = sysData.rows || sysData.execRows || [];
          if (!mergedRows || mergedRows.length === 0) {
            mergedRows = sysRows;
          } else if (sysRows && sysRows.length > 0) {
            mergedRows = mergedRows.map((r, i) => {
              const sr = sysRows[i] || {};
              const updatedR = { ...r };
              for (const [rk, rv] of Object.entries(sr)) {
                if (updatedR[rk] === undefined || updatedR[rk] === '' || updatedR[rk] === null) {
                  updatedR[rk] = rv;
                }
              }
              return updatedR;
            });
          }

          return {
            ...prev,
            unitName: prev.unitName || sysData.unitName,
            upper: mergedUpper,
            rows: mergedRows,
            execRows: mergedRows,
          };
        });
        setFeedback({ text: t('proforma.autofillSuccessMerged', 'Smart fill complete: missing fields populated while keeping your manual edits!'), type: 'success' });
      }
    } catch (e) {
      setFeedback({ text: errorMessage(e), type: 'error' });
    } finally {
      setLoading(false);
    }
  }

  // 1-Click Auto-Balance helpers (Total = Present + Absent + Leave)
  function handleAutoBalanceExec() {
    setFormData((prev) => {
      const u = { ...(prev.upper || {}) };
      const slots = parseInt(u.execSlots, 10) || 0;
      const pres = parseInt(u.execPresent, 10) || 0;
      const leave = parseInt(u.execLeave, 10) || 0;
      const balancedAbs = Math.max(0, slots - pres - leave);
      u.execAbsent = balancedAbs;
      if (slots > 0) u.execPct = `${Math.round((pres / slots) * 100)}%`;
      return { ...prev, upper: u };
    });
  }

  function handleAutoBalanceGb() {
    setFormData((prev) => {
      const u = { ...(prev.upper || {}) };
      const members = parseInt(u.gbMembers, 10) || 0;
      const pres = parseInt(u.gbPresent, 10) || 0;
      const leave = parseInt(u.gbLeave, 10) || 0;
      const balancedAbs = Math.max(0, members - pres - leave);
      u.gbAbsent = balancedAbs;
      if (members > 0) u.gbPct = `${Math.round((pres / members) * 100)}%`;
      return { ...prev, upper: u };
    });
  }

  function handleAutoBalanceAreaExec() {
    setFormData((prev) => {
      const u = { ...(prev.upper || {}) };
      const total = parseInt(u.execSlots, 10) || 0;
      const pres = parseInt(u.execPresent, 10) || 0;
      const leave = parseInt(u.execLeave, 10) || 0;
      const balancedAbs = Math.max(0, total - pres - leave);
      u.execAbsent = balancedAbs;
      if (total > 0) u.execPct = `${Math.round((pres / total) * 100)}%`;
      return { ...prev, upper: u };
    });
  }

  function handleAutoBalanceAreaComm() {
    setFormData((prev) => {
      const u = { ...(prev.upper || {}) };
      const total = parseInt(u.commTotal, 10) || 0;
      const pres = parseInt(u.commPresent, 10) || 0;
      const leave = parseInt(u.commLeave, 10) || 0;
      const balancedAbs = Math.max(0, total - pres - leave);
      u.commAbsent = balancedAbs;
      if (total > 0) u.commPct = `${Math.round((pres / total) * 100)}%`;
      return { ...prev, upper: u };
    });
  }

  function handleAutoBalanceDistrictExec() {
    setFormData((prev) => {
      const u = { ...(prev.upper || {}) };
      const slots = parseInt(u.distExecSlots, 10) || 0;
      const pres = parseInt(u.distExecPresent, 10) || 0;
      const leave = parseInt(u.distExecLeave, 10) || 0;
      const balancedAbs = Math.max(0, slots - pres - leave);
      u.distExecAbsent = balancedAbs;
      if (slots > 0) u.distExecPct = `${Math.round((pres / slots) * 100)}%`;
      return { ...prev, upper: u };
    });
  }

  function handleAutoBalanceDistrictComm() {
    setFormData((prev) => {
      const u = { ...(prev.upper || {}) };
      const total = parseInt(u.distCommTotal, 10) || 0;
      const pres = parseInt(u.distCommPresent, 10) || 0;
      const leave = parseInt(u.distCommLeave, 10) || 0;
      const balancedAbs = Math.max(0, total - pres - leave);
      u.distCommAbsent = balancedAbs;
      if (total > 0) u.distCommPct = `${Math.round((pres / total) * 100)}%`;
      return { ...prev, upper: u };
    });
  }

  useEffect(() => {
    loadData(false);
  }, [formType, targetId, year, month]);

  // Update a top-level field in formData
  function updateField(k, v) {
    setFormData((prev) => ({ ...prev, [k]: v }));
  }

  // Update upper summary field and auto-calculate formulas
  function updateUpper(k, v) {
    setFormData((prev) => {
      const u = { ...(prev.upper || {}), [k]: v };

      if (formType === 'form4') {
        // Form 4 calculations & attendance validations
        if (k === 'execPresent' || k === 'execSlots' || k === 'execAbsent' || k === 'execLeave') {
          const slots = parseInt(k === 'execSlots' ? v : u.execSlots, 10) || 0;
          let pres = parseInt(k === 'execPresent' ? v : u.execPresent, 10) || 0;
          let abs = parseInt(k === 'execAbsent' ? v : u.execAbsent, 10) || 0;
          let leave = parseInt(k === 'execLeave' ? v : u.execLeave, 10) || 0;

          // Strict rule: if Present === Slots (e.g. 10 of 10), Absent and Leave become 0!
          if (k === 'execPresent' && slots > 0 && pres === slots) {
            abs = 0;
            leave = 0;
            u.execAbsent = 0;
            u.execLeave = 0;
          } else if (k === 'execPresent' && slots > 0 && pres + abs + leave > slots) {
            // Auto-adjust absent and leave if present exceeds total
            const remaining = Math.max(0, slots - pres);
            if (abs > remaining) {
              abs = remaining;
              leave = 0;
            } else {
              leave = Math.max(0, remaining - abs);
            }
            u.execAbsent = abs;
            u.execLeave = leave;
          }

          const total = slots || (pres + abs + leave);
          if (total > 0) u.execPct = `${Math.round((pres / total) * 100)}%`;
        }

        if (k === 'gbPresent' || k === 'gbMembers' || k === 'gbAbsent' || k === 'gbLeave') {
          const members = parseInt(k === 'gbMembers' ? v : u.gbMembers, 10) || 0;
          let pres = parseInt(k === 'gbPresent' ? v : u.gbPresent, 10) || 0;
          let abs = parseInt(k === 'gbAbsent' ? v : u.gbAbsent, 10) || 0;
          let leave = parseInt(k === 'gbLeave' ? v : u.gbLeave, 10) || 0;

          // Strict rule: if Present === Members (e.g. 10 of 10), Absent and Leave become 0!
          if (k === 'gbPresent' && members > 0 && pres === members) {
            abs = 0;
            leave = 0;
            u.gbAbsent = 0;
            u.gbLeave = 0;
          } else if (k === 'gbPresent' && members > 0 && pres + abs + leave > members) {
            const remaining = Math.max(0, members - pres);
            if (abs > remaining) {
              abs = remaining;
              leave = 0;
            } else {
              leave = Math.max(0, remaining - abs);
            }
            u.gbAbsent = abs;
            u.gbLeave = leave;
          }

          const total = members || (pres + abs + leave);
          if (total > 0) u.gbPct = `${Math.round((pres / total) * 100)}%`;
        }

        if (k === 'psoPresent' || k === 'psoMembers') {
          const members = parseInt(k === 'psoMembers' ? v : u.psoMembers, 10) || 0;
          let pres = parseInt(k === 'psoPresent' ? v : u.psoPresent, 10) || 0;
          if (k === 'psoPresent' && members > 0 && pres > members) {
            pres = members;
            u.psoPresent = members;
          }
          if (members > 0) u.psoPct = `${Math.round((pres / members) * 100)}%`;
        }
      } else {
        // Form 1 calculations & attendance validations
        if (k === 'execPresent' || k === 'execSlots' || k === 'execAbsent' || k === 'execLeave') {
          const total = parseInt(k === 'execSlots' ? v : u.execSlots, 10) || 0;
          let pres = parseInt(k === 'execPresent' ? v : u.execPresent, 10) || 0;
          let abs = parseInt(k === 'execAbsent' ? v : u.execAbsent, 10) || 0;
          let leave = parseInt(k === 'execLeave' ? v : u.execLeave, 10) || 0;

          if (k === 'execPresent' && total > 0 && pres === total) {
            abs = 0;
            leave = 0;
            u.execAbsent = 0;
            u.execLeave = 0;
          } else if (k === 'execPresent' && total > 0 && pres + abs + leave > total) {
            const remaining = Math.max(0, total - pres);
            if (abs > remaining) {
              abs = remaining;
              leave = 0;
            } else {
              leave = Math.max(0, remaining - abs);
            }
            u.execAbsent = abs;
            u.execLeave = leave;
          }

          if (total > 0) u.execPct = `${Math.round((pres / total) * 100)}%`;
        }

        if (k === 'commPresent' || k === 'commTotal' || k === 'commAbsent' || k === 'commLeave') {
          const total = parseInt(k === 'commTotal' ? v : u.commTotal, 10) || 0;
          let pres = parseInt(k === 'commPresent' ? v : u.commPresent, 10) || 0;
          let abs = parseInt(k === 'commAbsent' ? v : u.commAbsent, 10) || 0;
          let leave = parseInt(k === 'commLeave' ? v : u.commLeave, 10) || 0;

          if (k === 'commPresent' && total > 0 && pres === total) {
            abs = 0;
            leave = 0;
            u.commAbsent = 0;
            u.commLeave = 0;
          } else if (k === 'commPresent' && total > 0 && pres + abs + leave > total) {
            const remaining = Math.max(0, total - pres);
            if (abs > remaining) {
              abs = remaining;
              leave = 0;
            } else {
              leave = Math.max(0, remaining - abs);
            }
            u.commAbsent = abs;
            u.commLeave = leave;
          }

          if (total > 0) u.commPct = `${Math.round((pres / total) * 100)}%`;
        }

        if (k === 'buExecPresent' || k === 'buExecCount') {
          const pres = parseInt(k === 'buExecPresent' ? v : u.buExecPresent, 10) || 0;
          const total = parseInt(k === 'buExecCount' ? v : u.buExecCount, 10) || 0;
          if (total > 0) u.buExecPct = `${Math.round((pres / total) * 100)}%`;
        }

        if (k === 'buGbPresent' || k === 'buGbCount') {
          const pres = parseInt(k === 'buGbPresent' ? v : u.buGbPresent, 10) || 0;
          const total = parseInt(k === 'buGbCount' ? v : u.buGbCount, 10) || 0;
          if (total > 0) u.buGbPct = `${Math.round((pres / total) * 100)}%`;
        }

        if (k === 'activeMembers' || k === 'totalMembers') {
          const active = parseInt(k === 'activeMembers' ? v : u.activeMembers, 10) || 0;
          const total = parseInt(k === 'totalMembers' ? v : u.totalMembers, 10) || 0;
          if (total > 0) u.memberPct = `${Math.round((active / total) * 100)}%`;
        }

        if (k === 'studyUnitsCount' || k === 'buExecCount' || k === 'studyAreaComm') {
          const units = parseInt(k === 'studyUnitsCount' ? v : u.studyUnitsCount, 10) || 0;
          const total = parseInt(u.buExecCount || 1, 10) || 1;
          if (total > 0 && units > 0) {
            u.studyPct = `${Math.min(100, Math.round((units / total) * 100))}%`;
          } else if (parseInt(k === 'studyAreaComm' ? v : u.studyAreaComm, 10) > 0) {
            u.studyPct = '100%';
          }
        }

        if (k === 'unitDonations' || k === 'areaDonations' || k === 'emergencyDonations') {
          const bu = parseInt(k === 'unitDonations' ? v : (u.unitDonations || 0), 10) || 0;
          const ar = parseInt(k === 'areaDonations' ? v : (u.areaDonations || 0), 10) || 0;
          const em = parseInt(k === 'emergencyDonations' ? v : (u.emergencyDonations || 0), 10) || 0;
          u.totalDonations = bu + ar + em;
        }
      }

      return {
        ...prev,
        upper: u,
        [k]: v,
      };
    });
  }

  // Update row in rows array
  function updateRow(idx, field, val) {
    setFormData((prev) => {
      const rows = [...(prev.rows || prev.execRows || [])];
      if (!rows[idx]) rows[idx] = {};
      const updated = { ...rows[idx], [field]: val };

      // Auto-sum total meetings for Form 4
      if (formType === 'form4' && (field === 'unitExecMeeting' || field === 'unitGbMeeting' || field === 'psoMeeting')) {
        const uExec = parseInt(field === 'unitExecMeeting' ? val : updated.unitExecMeeting, 10) || 0;
        const uGb = parseInt(field === 'unitGbMeeting' ? val : updated.unitGbMeeting, 10) || 0;
        const pso = parseInt(field === 'psoMeeting' ? val : updated.psoMeeting, 10) || 0;
        updated.totalMeetings = uExec + uGb + pso;
      }

      rows[idx] = updated;
      return { ...prev, rows, execRows: rows };
    });
  }

  // Add new cabinet member row
  function addRow() {
    setFormData((prev) => {
      const rows = [...(prev.rows || prev.execRows || [])];
      if (formType === 'form4') {
        rows.push({
          srNo: rows.length + 1,
          name: '',
          unitExecMeeting: 1,
          unitGbMeeting: 1,
          psoMeeting: 0,
          seminar: 0,
          studyCircle: 0,
          induction: 0,
          ralliesAndJirgas: 0,
          alliedMeetings: 0,
          partyConference: 0,
          totalMeetings: 2,
          inactiveContact: 0,
          publicOutreach: 1,
          monthlyDues: 500,
          reading: 0,
          districtOrAreaAttendance: 0,
          activeStatus: 'فعاله',
          bloodPostsAndZakat: '',
        });
      } else {
        rows.push({
          srNo: rows.length + 1,
          name: '',
          role: '',
          meetingDate: '',
          areaExecMeetings: 1,
          areaCommMeetings: 1,
          ownBuMeetings: 1,
          buExecMeetings: 1,
          buMeetings: 1,
          psoMeetings: 1,
          conferences: 0,
          seminars: 0,
          studyCircles: 1,
          inductions: 0,
          alliedMeetings: 0,
          ralliesAndJirgas: 0,
          monthlyDues: 1000,
          unitMeetings: 1,
          tours: 0,
          publicOutreach: 1,
          orgOutreach: 1,
          officeAttendance: 'حاضر',
          activeStatus: 'فعاله',
          bloodPostsAndZakat: 'O+',
          ideologicalReading: 'Matric / Intermediate',
        });
      }
      return { ...prev, rows, execRows: rows };
    });
  }

  // Remove row
  function removeRow(idx) {
    setFormData((prev) => {
      const rows = (prev.rows || prev.execRows || []).filter((_, i) => i !== idx);
      return { ...prev, rows, execRows: rows };
    });
  }

  // Form 2: Update row in Subordinate Basic Units table
  function updateForm2Row(idx, field, val) {
    setFormData((prev) => {
      const rows = [...(prev.rows || [])];
      if (!rows[idx]) rows[idx] = {};
      const updated = { ...rows[idx], [field]: val };

      // Auto-calculate Executive attendance percentage & auto-adjust
      if (field === 'execPresent' || field === 'execTotal' || field === 'execAbsent' || field === 'execLeave') {
        const total = parseInt(field === 'execTotal' ? val : updated.execTotal, 10) || 0;
        let pres = parseInt(field === 'execPresent' ? val : updated.execPresent, 10) || 0;
        let abs = parseInt(field === 'execAbsent' ? val : updated.execAbsent, 10) || 0;
        let leave = parseInt(field === 'execLeave' ? val : updated.execLeave, 10) || 0;

        if (field === 'execPresent' && total > 0 && pres === total) {
          abs = 0;
          leave = 0;
          updated.execAbsent = 0;
          updated.execLeave = 0;
        } else if (field === 'execPresent' && total > 0 && pres + abs + leave > total) {
          const remaining = Math.max(0, total - pres);
          if (abs > remaining) {
            abs = remaining;
            leave = 0;
          } else {
            leave = Math.max(0, remaining - abs);
          }
          updated.execAbsent = abs;
          updated.execLeave = leave;
        }

        if (total > 0) updated.execPct = `${Math.round((pres / total) * 100)}%`;
      }

      // Auto-calculate General Body attendance percentage & auto-adjust
      if (field === 'gbPresent' || field === 'gbTotalMembers' || field === 'gbAbsent' || field === 'gbLeave') {
        const total = parseInt(field === 'gbTotalMembers' ? val : updated.gbTotalMembers, 10) || 0;
        let pres = parseInt(field === 'gbPresent' ? val : updated.gbPresent, 10) || 0;
        let abs = parseInt(field === 'gbAbsent' ? val : updated.gbAbsent, 10) || 0;
        let leave = parseInt(field === 'gbLeave' ? val : updated.gbLeave, 10) || 0;

        if (field === 'gbPresent' && total > 0 && pres === total) {
          abs = 0;
          leave = 0;
          updated.gbAbsent = 0;
          updated.gbLeave = 0;
        } else if (field === 'gbPresent' && total > 0 && pres + abs + leave > total) {
          const remaining = Math.max(0, total - pres);
          if (abs > remaining) {
            abs = remaining;
            leave = 0;
          } else {
            leave = Math.max(0, remaining - abs);
          }
          updated.gbAbsent = abs;
          updated.gbLeave = leave;
        }

        if (total > 0) updated.gbPct = `${Math.round((pres / total) * 100)}%`;
      }

      // Auto-calculate PSO attendance percentage
      if (field === 'psoAttendees' || field === 'psoMembership') {
        const mem = parseInt(field === 'psoMembership' ? val : updated.psoMembership, 10) || 0;
        let att = parseInt(field === 'psoAttendees' ? val : updated.psoAttendees, 10) || 0;
        if (field === 'psoAttendees' && mem > 0 && att > mem) {
          att = mem;
          updated.psoAttendees = mem;
        }
        if (mem > 0) updated.psoPct = `${Math.round((att / mem) * 100)}%`;
      }

      rows[idx] = updated;
      return { ...prev, rows };
    });
  }

  // Form 2: Auto-balance attendance for a single unit row
  function handleAutoBalanceForm2Row(idx, type) {
    setFormData((prev) => {
      const rows = [...(prev.rows || [])];
      if (!rows[idx]) return prev;
      const r = { ...rows[idx] };
      if (type === 'exec') {
        const total = parseInt(r.execTotal, 10) || 0;
        const pres = parseInt(r.execPresent, 10) || 0;
        const leave = parseInt(r.execLeave, 10) || 0;
        r.execAbsent = Math.max(0, total - pres - leave);
        if (total > 0) r.execPct = `${Math.round((pres / total) * 100)}%`;
      } else if (type === 'gb') {
        const total = parseInt(r.gbTotalMembers, 10) || 0;
        const pres = parseInt(r.gbPresent, 10) || 0;
        const leave = parseInt(r.gbLeave, 10) || 0;
        r.gbAbsent = Math.max(0, total - pres - leave);
        if (total > 0) r.gbPct = `${Math.round((pres / total) * 100)}%`;
      }
      rows[idx] = r;
      return { ...prev, rows };
    });
  }

  // Form 2: Auto-balance attendance for all units in one click
  function handleAutoBalanceAllForm2Rows() {
    setFormData((prev) => {
      const rawRows = prev.rows || [];
      const balanced = rawRows.map((r) => {
        const updated = { ...r };
        const eTot = parseInt(updated.execTotal, 10) || 0;
        const ePres = parseInt(updated.execPresent, 10) || 0;
        const eLeave = parseInt(updated.execLeave, 10) || 0;
        if (eTot > 0) {
          updated.execAbsent = Math.max(0, eTot - ePres - eLeave);
          updated.execPct = `${Math.round((ePres / eTot) * 100)}%`;
        }

        const gTot = parseInt(updated.gbTotalMembers, 10) || 0;
        const gPres = parseInt(updated.gbPresent, 10) || 0;
        const gLeave = parseInt(updated.gbLeave, 10) || 0;
        if (gTot > 0) {
          updated.gbAbsent = Math.max(0, gTot - gPres - gLeave);
          updated.gbPct = `${Math.round((gPres / gTot) * 100)}%`;
        }
        return updated;
      });
      return { ...prev, rows: balanced };
    });
    setFeedback({ text: t('proforma.autoBalanceSuccess', 'All basic units attendance auto-balanced successfully!'), type: 'success' });
  }

  // Form 2: Add new basic unit row
  function addForm2Row() {
    setFormData((prev) => {
      const rows = [...(prev.rows || [])];
      rows.push({
        srNo: rows.length + 1,
        unitName: '',
        execMeetingDate: '',
        execTotal: 6,
        execPresent: 6,
        execAbsent: 0,
        execLeave: 0,
        execPct: '100%',
        gbMeetingDate: '',
        gbTotalMembers: 20,
        gbPresent: 20,
        gbAbsent: 0,
        gbLeave: 0,
        gbPct: '100%',
        studyReading: 1,
        seminarCount: 0,
        studyCircleCount: 1,
        newMembers: 0,
        psoMembership: 5,
        psoAttendees: 5,
        psoPct: '100%',
        publicEventsCount: 0,
        inductionPrograms: 0,
        publicOutreach: 1,
        inactiveContact: 0,
        orgOutreach: 1,
        unitDonations: 1000,
        emergencyDonations: 0,
        totalExpenses: 500,
        disciplinaryAction: '',
        bloodPosts: '',
        bloodCash: '',
        bloodTotalCash: '',
        zakat: '',
        unitStatus: 'فعاله',
      });
      return { ...prev, rows };
    });
  }

  // Form 2: Remove a basic unit row
  function removeForm2Row(idx) {
    setFormData((prev) => {
      const rows = (prev.rows || []).filter((_, i) => i !== idx);
      return { ...prev, rows };
    });
  }

  // Comprehensive validation function for Form 2 rows
  function validateForm2Rows(form2Rows = []) {
    const errors = [];
    const rowErrors = {};

    form2Rows.forEach((r, i) => {
      const idx = i;
      const rowNum = i + 1;
      const unitName = (r.unitName || '').trim();
      const rErr = {
        name: null,
        exec: null,
        gb: null,
        pso: null,
        finance: null,
        hasError: false,
      };

      // 1. Basic Unit Name Validation
      if (!unitName) {
        const msg = t('proforma.form2.validation.unitNameRequired', `Basic unit name is required for row #${rowNum}`, { row: rowNum });
        rErr.name = msg;
        errors.push(msg);
      }

      // 2. Executive Attendance Validation
      const eTot = parseInt(r.execTotal, 10);
      const ePres = parseInt(r.execPresent, 10);
      const eAbs = parseInt(r.execAbsent, 10);
      const eLeave = parseInt(r.execLeave, 10);

      if ((!isNaN(eTot) && eTot < 0) || (!isNaN(ePres) && ePres < 0) || (!isNaN(eAbs) && eAbs < 0) || (!isNaN(eLeave) && eLeave < 0)) {
        const msg = t('proforma.form2.validation.negativeValue', `Unit '${unitName || rowNum}': Negative attendance numbers are not allowed`, { unit: unitName || rowNum, field: t('proforma.form2.execMeeting', 'Executive Meeting') });
        rErr.exec = msg;
        errors.push(msg);
      } else if (!isNaN(eTot) && eTot > 0) {
        const p = isNaN(ePres) ? 0 : ePres;
        const a = isNaN(eAbs) ? 0 : eAbs;
        const l = isNaN(eLeave) ? 0 : eLeave;
        const sum = p + a + l;
        if (p > eTot) {
          const msg = t('proforma.form2.validation.execMismatch', `Unit '${unitName || rowNum}': Executive present (${p}) exceeds total slots (${eTot})`, { unit: unitName || rowNum, sum: p, total: eTot });
          rErr.exec = msg;
          errors.push(msg);
        } else if (sum > eTot) {
          const msg = t('proforma.form2.validation.execMismatch', `Unit '${unitName || rowNum}': Executive attendance (${sum}) exceeds total slots (${eTot})`, { unit: unitName || rowNum, sum, total: eTot });
          rErr.exec = msg;
          errors.push(msg);
        }
      }

      // 3. General Body Attendance Validation
      const gTot = parseInt(r.gbTotalMembers, 10);
      const gPres = parseInt(r.gbPresent, 10);
      const gAbs = parseInt(r.gbAbsent, 10);
      const gLeave = parseInt(r.gbLeave, 10);

      if ((!isNaN(gTot) && gTot < 0) || (!isNaN(gPres) && gPres < 0) || (!isNaN(gAbs) && gAbs < 0) || (!isNaN(gLeave) && gLeave < 0)) {
        const msg = t('proforma.form2.validation.negativeValue', `Unit '${unitName || rowNum}': Negative attendance numbers are not allowed`, { unit: unitName || rowNum, field: t('proforma.form2.gbMeeting', 'General Body Meeting') });
        rErr.gb = msg;
        errors.push(msg);
      } else if (!isNaN(gTot) && gTot > 0) {
        const p = isNaN(gPres) ? 0 : gPres;
        const a = isNaN(gAbs) ? 0 : gAbs;
        const l = isNaN(gLeave) ? 0 : gLeave;
        const sum = p + a + l;
        if (p > gTot) {
          const msg = t('proforma.form2.validation.gbMismatch', `Unit '${unitName || rowNum}': General body present (${p}) exceeds membership (${gTot})`, { unit: unitName || rowNum, sum: p, total: gTot });
          rErr.gb = msg;
          errors.push(msg);
        } else if (sum > gTot) {
          const msg = t('proforma.form2.validation.gbMismatch', `Unit '${unitName || rowNum}': General body attendance (${sum}) exceeds membership (${gTot})`, { unit: unitName || rowNum, sum, total: gTot });
          rErr.gb = msg;
          errors.push(msg);
        }
      }

      // 4. PSO Validation
      const psoMem = parseInt(r.psoMembership, 10);
      const psoAtt = parseInt(r.psoAttendees, 10);
      if ((!isNaN(psoMem) && psoMem < 0) || (!isNaN(psoAtt) && psoAtt < 0)) {
        const msg = t('proforma.form2.validation.negativeValue', `Unit '${unitName || rowNum}': Negative PSO numbers are not allowed`, { unit: unitName || rowNum, field: 'PSO' });
        rErr.pso = msg;
        errors.push(msg);
      } else if (!isNaN(psoMem) && psoMem > 0 && !isNaN(psoAtt) && psoAtt > psoMem) {
        const msg = t('proforma.form2.validation.psoExceeded', `Unit '${unitName || rowNum}': PSO attendees (${psoAtt}) cannot exceed PSO membership (${psoMem})`, { unit: unitName || rowNum, att: psoAtt, mem: psoMem });
        rErr.pso = msg;
        errors.push(msg);
      }

      // 5. Financials Non-negative check
      const dues = parseInt(r.unitDonations, 10);
      const emg = parseInt(r.emergencyDonations, 10);
      const exp = parseInt(r.totalExpenses, 10);
      const bCash = parseInt(r.bloodCash, 10);
      const zakat = parseInt(r.zakat, 10);

      if ((!isNaN(dues) && dues < 0) || (!isNaN(emg) && emg < 0) || (!isNaN(exp) && exp < 0) || (!isNaN(bCash) && bCash < 0) || (!isNaN(zakat) && zakat < 0)) {
        const msg = t('proforma.form2.validation.negativeValue', `Unit '${unitName || rowNum}': Financial amounts cannot be negative`, { unit: unitName || rowNum, field: t('proforma.form2.dues', 'Finances') });
        rErr.finance = msg;
        errors.push(msg);
      }

      if (rErr.name || rErr.exec || rErr.gb || rErr.pso || rErr.finance) {
        rErr.hasError = true;
      }

      rowErrors[idx] = rErr;
    });

    return { errors, rowErrors, isValid: errors.length === 0 };
  }

  // Form 3 Helper Functions
  function updateForm3Field(field, val) {
    setFormData((prev) => ({ ...prev, [field]: val }));
  }

  // 1. Inactive Units
  function addInactiveUnitRow() {
    setFormData((prev) => {
      const list = [...(prev.inactiveUnits || [])];
      list.push({
        srNo: list.length + 1,
        unitName: '',
        reason: '',
        suggestion: '',
      });
      return { ...prev, inactiveUnits: list };
    });
  }

  function updateInactiveUnitRow(idx, field, val) {
    setFormData((prev) => {
      const list = [...(prev.inactiveUnits || [])];
      if (!list[idx]) list[idx] = {};
      list[idx] = { ...list[idx], [field]: val };
      return { ...prev, inactiveUnits: list };
    });
  }

  function removeInactiveUnitRow(idx) {
    setFormData((prev) => {
      const list = (prev.inactiveUnits || []).filter((_, i) => i !== idx);
      return { ...prev, inactiveUnits: list };
    });
  }

  // 2. Committee Members
  function addCommitteeMemberRow() {
    setFormData((prev) => {
      const list = [...(prev.committeeMembers || [])];
      list.push({
        srNo: list.length + 1,
        name: '',
        role: '',
        date: '',
        areaExec: '',
        areaComm: '',
        unitExec: '',
        unitGb: '',
        pso: '',
        conf: '',
        seminar: '',
        studyCircle: '',
        induction: '',
        rally: '',
        reading: '',
        inactiveContact: '',
        dues: '',
        tour: '',
      });
      return { ...prev, committeeMembers: list };
    });
  }

  function updateCommitteeMemberRow(idx, field, val) {
    setFormData((prev) => {
      const list = [...(prev.committeeMembers || [])];
      if (!list[idx]) list[idx] = {};
      list[idx] = { ...list[idx], [field]: val };
      return { ...prev, committeeMembers: list };
    });
  }

  function removeCommitteeMemberRow(idx) {
    setFormData((prev) => {
      const list = (prev.committeeMembers || []).filter((_, i) => i !== idx);
      return { ...prev, committeeMembers: list };
    });
  }

  // 3. Public Gatherings
  function addPublicActivityRow() {
    setFormData((prev) => {
      const list = [...(prev.publicActivities || [])];
      list.push({
        srNo: list.length + 1,
        orgName: activeUnitDisplayName,
        date: '',
        location: '',
        topic: '',
        programType: '',
        speakers: '',
        memberCount: '',
        publicCount: '',
      });
      return { ...prev, publicActivities: list };
    });
  }

  function updatePublicActivityRow(idx, field, val) {
    setFormData((prev) => {
      const list = [...(prev.publicActivities || [])];
      if (!list[idx]) list[idx] = {};
      list[idx] = { ...list[idx], [field]: val };
      return { ...prev, publicActivities: list };
    });
  }

  function removePublicActivityRow(idx) {
    setFormData((prev) => {
      const list = (prev.publicActivities || []).filter((_, i) => i !== idx);
      return { ...prev, publicActivities: list };
    });
  }

  // 4. Educational Activities
  function addEducationalActivityRow() {
    setFormData((prev) => {
      const list = [...(prev.educationalActivities || [])];
      list.push({
        srNo: list.length + 1,
        orgName: activeUnitDisplayName,
        date: '',
        location: '',
        topic: '',
        programType: '',
        speakers: '',
        memberCount: '',
      });
      return { ...prev, educationalActivities: list };
    });
  }

  function updateEducationalActivityRow(idx, field, val) {
    setFormData((prev) => {
      const list = [...(prev.educationalActivities || [])];
      if (!list[idx]) list[idx] = {};
      list[idx] = { ...list[idx], [field]: val };
      return { ...prev, educationalActivities: list };
    });
  }

  function removeEducationalActivityRow(idx) {
    setFormData((prev) => {
      const list = (prev.educationalActivities || []).filter((_, i) => i !== idx);
      return { ...prev, educationalActivities: list };
    });
  }

  // 5. Disciplinary Actions
  function addDisciplinaryRow() {
    setFormData((prev) => {
      const list = [...(prev.disciplinaryActions || [])];
      list.push({ name: '', role: '', violation: '', action: '' });
      return { ...prev, disciplinaryActions: list };
    });
  }

  function updateDisciplinaryRow(idx, field, val) {
    setFormData((prev) => {
      const list = [...(prev.disciplinaryActions || [])];
      if (!list[idx]) list[idx] = {};
      list[idx] = { ...list[idx], [field]: val };
      return { ...prev, disciplinaryActions: list };
    });
  }

  function removeDisciplinaryRow(idx) {
    setFormData((prev) => {
      const list = (prev.disciplinaryActions || []).filter((_, i) => i !== idx);
      return { ...prev, disciplinaryActions: list };
    });
  }

  // 6. Blood Bank & Zakat
  function updateBloodBank(field, val) {
    setFormData((prev) => {
      const bb = { ...(prev.bloodBank || {}) };
      bb[field] = val;
      if (field === 'bloodCash' && (bb.bloodTotalCash === undefined || bb.bloodTotalCash === '' || bb.bloodTotalCash === prev.bloodBank?.bloodCash)) {
        bb.bloodTotalCash = val;
      }
      return { ...prev, bloodBank: bb };
    });
  }

  // 7. Proposals & Demands Matrix
  function updateProposal(cat, col, val) {
    setFormData((prev) => {
      const p = { ...(prev.proposals || {}) };
      p[cat] = { ...(p[cat] || {}), [col]: val };
      return { ...prev, proposals: p };
    });
  }

  function updateDemands(val) {
    setFormData((prev) => {
      const p = { ...(prev.proposals || {}) };
      p.demands = val;
      return { ...prev, proposals: p };
    });
  }

  // Validation function for Form 3
  function validateForm3Data(data = {}) {
    const errors = [];

    // Inactive Units validation
    const inactives = data.inactiveUnits || [];
    inactives.forEach((u, i) => {
      if ((u.reason?.trim() || u.suggestion?.trim()) && !u.unitName?.trim()) {
        const msg = t('proforma.form3.validation.unitNameRequired', `Inactive Unit row #${i + 1}: Unit name is required`, { row: i + 1 });
        errors.push(msg);
      }
    });

    // Committee Members validation
    const members = data.committeeMembers || [];
    members.forEach((m, i) => {
      const numKeys = ['areaExec', 'areaComm', 'unitExec', 'unitGb', 'pso', 'conf', 'seminar', 'studyCircle', 'induction', 'rally', 'reading', 'inactiveContact', 'dues', 'tour'];
      for (const k of numKeys) {
        const v = parseInt(m[k], 10);
        if (!isNaN(v) && v < 0) {
          const msg = t('proforma.form3.validation.negativeValue', `Committee Member '${m.name || `#${i + 1}`}': Negative count for ${k} is not allowed`);
          errors.push(msg);
          break;
        }
      }
    });

    // Blood Bank & Zakat validation
    const bb = data.bloodBank || {};
    const bCash = parseInt(bb.bloodCash, 10);
    const bTot = parseInt(bb.bloodTotalCash, 10);
    const zakat = parseInt(bb.zakat, 10);
    const posts = parseInt(bb.bloodPosts, 10);
    if ((!isNaN(bCash) && bCash < 0) || (!isNaN(bTot) && bTot < 0) || (!isNaN(zakat) && zakat < 0) || (!isNaN(posts) && posts < 0)) {
      const msg = t('proforma.form3.validation.bloodBankNegative', 'Blood Bank figures and Zakat amounts cannot be negative');
      errors.push(msg);
    }

    return { errors, isValid: errors.length === 0 };
  }

  // Form 5 Helper Functions
  function addForm5Row() {
    setFormData((prev) => {
      const rows = [...(prev.rows || [])];
      rows.push({
        srNo: rows.length + 1,
        name: '',
        centralComm: 0,
        provincialJirga: 0,
        provincialExec: 1,
        provincialComm: 1,
        districtExec: 0,
        districtComm: 0,
        areaExec: 0,
        areaComm: 0,
        basicUnitsExec: 0,
        basicUnitsGb: 0,
        ownBasicUnit: 1,
        psoMeetings: 0,
        partyConferences: 0,
        seminars: 0,
        studyCircles: 1,
        inductions: 0,
        ralliesAndProtests: 0,
        jirgasAndCornerMeetings: 0,
        pressConferences: 0,
        alliedMeetings: 0,
        totalMeetings: 3,
        dues: 1000,
        tours: 0,
        reading: 1,
        bloodBankPosts: '',
      });
      return { ...prev, rows };
    });
  }

  function updateForm5Row(idx, field, val) {
    setFormData((prev) => {
      const rows = [...(prev.rows || [])];
      if (!rows[idx]) rows[idx] = {};
      const updated = { ...rows[idx], [field]: val };

      const meetingFields = [
        'centralComm', 'provincialJirga', 'provincialExec', 'provincialComm',
        'districtExec', 'districtComm', 'areaExec', 'areaComm',
        'basicUnitsExec', 'basicUnitsGb', 'ownBasicUnit', 'psoMeetings'
      ];
      if (meetingFields.includes(field)) {
        const sum = meetingFields.reduce((acc, f) => {
          const v = parseInt(f === field ? val : updated[f], 10) || 0;
          return acc + v;
        }, 0);
        updated.totalMeetings = sum;
      }

      rows[idx] = updated;
      return { ...prev, rows };
    });
  }

  function removeForm5Row(idx) {
    setFormData((prev) => {
      const rows = (prev.rows || []).filter((_, i) => i !== idx);
      return { ...prev, rows };
    });
  }

  function handleAutoSumForm5Row(idx) {
    setFormData((prev) => {
      const rows = [...(prev.rows || [])];
      if (!rows[idx]) return prev;
      const r = { ...rows[idx] };
      const meetingFields = [
        'centralComm', 'provincialJirga', 'provincialExec', 'provincialComm',
        'districtExec', 'districtComm', 'areaExec', 'areaComm',
        'basicUnitsExec', 'basicUnitsGb', 'ownBasicUnit', 'psoMeetings'
      ];
      r.totalMeetings = meetingFields.reduce((sum, f) => sum + (parseInt(r[f], 10) || 0), 0);
      rows[idx] = r;
      return { ...prev, rows };
    });
  }

  function handleAutoSumAllForm5Rows() {
    setFormData((prev) => {
      const meetingFields = [
        'centralComm', 'provincialJirga', 'provincialExec', 'provincialComm',
        'districtExec', 'districtComm', 'areaExec', 'areaComm',
        'basicUnitsExec', 'basicUnitsGb', 'ownBasicUnit', 'psoMeetings'
      ];
      const rows = (prev.rows || []).map((r) => ({
        ...r,
        totalMeetings: meetingFields.reduce((sum, f) => sum + (parseInt(r[f], 10) || 0), 0),
      }));
      return { ...prev, rows };
    });
    setFeedback({ text: t('proforma.form5.autoSumAllSuccess', 'Total meetings auto-calculated for all executive comrades!'), type: 'success' });
  }

  function validateForm5Rows(form5Rows = []) {
    const errors = [];
    const rowErrors = {};

    form5Rows.forEach((r, i) => {
      const idx = i;
      const rowNum = i + 1;
      const name = (r.name || '').trim();
      const rErr = {
        name: null,
        negative: null,
        hasError: false,
      };

      const hasAnyData = Object.entries(r).some(([k, v]) => k !== 'srNo' && k !== 'name' && String(v || '').trim() !== '');
      if (hasAnyData && !name) {
        const msg = t('proforma.form5.validation.nameRequired', `Row #${rowNum}: Executive comrade name is required`, { row: rowNum });
        rErr.name = msg;
        errors.push(msg);
      }

      const numKeys = [
        'centralComm', 'provincialJirga', 'provincialExec', 'provincialComm',
        'districtExec', 'districtComm', 'areaExec', 'areaComm',
        'basicUnitsExec', 'basicUnitsGb', 'ownBasicUnit', 'psoMeetings',
        'partyConferences', 'seminars', 'studyCircles', 'inductions',
        'ralliesAndProtests', 'jirgasAndCornerMeetings', 'pressConferences',
        'alliedMeetings', 'totalMeetings', 'dues', 'tours', 'reading'
      ];
      for (const k of numKeys) {
        const val = parseInt(r[k], 10);
        if (!isNaN(val) && val < 0) {
          const msg = t('proforma.form5.validation.negativeValue', `Row #${rowNum} (${name || 'Unnamed'}): Negative value for ${k} is not allowed`, { row: rowNum, name: name || 'Unnamed', field: k });
          rErr.negative = msg;
          errors.push(msg);
          break;
        }
      }

      if (rErr.name || rErr.negative) {
        rErr.hasError = true;
      }
      rowErrors[idx] = rErr;
    });

    return { errors, rowErrors, isValid: errors.length === 0 };
  }

  // Form 6: Update upper summary fields with calculations
  function updateForm6Upper(k, v) {
    setFormData((prev) => {
      const u = { ...(prev.upper || {}), [k]: v };

      const upperAliasMap = {
        areaUnitsCount: 'areasCount',
        areasCount: 'areaUnitsCount',
        newAreaUnitsCount: 'newAreasCount',
        newAreasCount: 'newAreaUnitsCount',
        newPsoUnitsCount: 'psoNewUnitsCount',
        psoNewUnitsCount: 'newPsoUnitsCount',
        conferencesCount: 'conferences',
        conferences: 'conferencesCount',
        studyCirclesCount: 'studyCircles',
        studyCircles: 'studyCirclesCount',
        inductionsCount: 'inductions',
        inductions: 'inductionsCount',
        ralliesCount: 'ralliesAndProtests',
        ralliesAndProtests: 'ralliesCount',
        jirgasCount: 'jirgasAndCornerMeetings',
        jirgasAndCornerMeetings: 'jirgasCount',
        alliedMeetingsCount: 'alliedMeetings',
        alliedMeetings: 'alliedMeetingsCount',
        districtOfficeActivity: 'officeActivity',
        officeActivity: 'districtOfficeActivity',
        duesMonthly: 'dues',
        dues: 'duesMonthly',
        duesEmergency: 'emergencyDues',
        emergencyDues: 'duesEmergency',
        duesExpenses: 'expenses',
        expenses: 'duesExpenses',
        villagesWithoutUnitCount: 'villagesWithoutUnit',
        villagesWithoutUnit: 'villagesWithoutUnitCount',
        disciplinaryActionsCount: 'disciplinaryActions',
        disciplinaryActions: 'disciplinaryActionsCount',
      };
      if (upperAliasMap[k]) {
        u[upperAliasMap[k]] = v;
      }

      if (k === 'distExecPresent' || k === 'distExecSlots' || k === 'distExecAbsent' || k === 'distExecLeave') {
        const slots = parseInt(k === 'distExecSlots' ? v : u.distExecSlots, 10) || 0;
        let pres = parseInt(k === 'distExecPresent' ? v : u.distExecPresent, 10) || 0;
        let abs = parseInt(k === 'distExecAbsent' ? v : u.distExecAbsent, 10) || 0;
        let leave = parseInt(k === 'distExecLeave' ? v : u.distExecLeave, 10) || 0;

        if (k === 'distExecPresent' && slots > 0 && pres === slots) {
          abs = 0;
          leave = 0;
          u.distExecAbsent = 0;
          u.distExecLeave = 0;
        } else if (k === 'distExecPresent' && slots > 0 && pres + abs + leave > slots) {
          const rem = Math.max(0, slots - pres);
          if (abs > rem) {
            abs = rem;
            leave = 0;
          } else {
            leave = Math.max(0, rem - abs);
          }
          u.distExecAbsent = abs;
          u.distExecLeave = leave;
        }
        if (slots > 0) u.distExecPct = `${Math.round((pres / slots) * 100)}%`;
      }

      if (k === 'distCommPresent' || k === 'distCommTotal' || k === 'distCommAbsent' || k === 'distCommLeave') {
        const total = parseInt(k === 'distCommTotal' ? v : u.distCommTotal, 10) || 0;
        let pres = parseInt(k === 'distCommPresent' ? v : u.distCommPresent, 10) || 0;
        let abs = parseInt(k === 'distCommAbsent' ? v : u.distCommAbsent, 10) || 0;
        let leave = parseInt(k === 'distCommLeave' ? v : u.distCommLeave, 10) || 0;

        if (k === 'distCommPresent' && total > 0 && pres === total) {
          abs = 0;
          leave = 0;
          u.distCommAbsent = 0;
          u.distCommLeave = 0;
        } else if (k === 'distCommPresent' && total > 0 && pres + abs + leave > total) {
          const rem = Math.max(0, total - pres);
          if (abs > rem) {
            abs = rem;
            leave = 0;
          } else {
            leave = Math.max(0, rem - abs);
          }
          u.distCommAbsent = abs;
          u.distCommLeave = leave;
        }
        if (total > 0) u.distCommPct = `${Math.round((pres / total) * 100)}%`;
      }

      if (k === 'areaExecCount' || k === 'areaUnitsCount' || k === 'areasCount') {
        const c = parseInt(k === 'areaExecCount' ? v : u.areaExecCount, 10) || 0;
        const tot = parseInt(u.areaUnitsCount || u.areasCount, 10) || 0;
        if (tot > 0) u.areaExecPct = `${Math.round((c / tot) * 100)}%`;
      }

      if (k === 'areaCommCount' || k === 'areaUnitsCount' || k === 'areasCount') {
        const c = parseInt(k === 'areaCommCount' ? v : u.areaCommCount, 10) || 0;
        const tot = parseInt(u.areaUnitsCount || u.areasCount, 10) || 0;
        if (tot > 0) u.areaCommPct = `${Math.round((c / tot) * 100)}%`;
      }

      if (k === 'buExecCount' || k === 'buCount') {
        const c = parseInt(k === 'buExecCount' ? v : u.buExecCount, 10) || 0;
        const tot = parseInt(u.buCount, 10) || 0;
        if (tot > 0) u.buExecPct = `${Math.round((c / tot) * 100)}%`;
      }

      if (k === 'buGbCount' || k === 'buCount') {
        const c = parseInt(k === 'buGbCount' ? v : u.buGbCount, 10) || 0;
        const tot = parseInt(u.buCount, 10) || 0;
        if (tot > 0) u.buGbPct = `${Math.round((c / tot) * 100)}%`;
      }

      return { ...prev, upper: u };
    });
  }

  // Form 6: Update comrade row in District Executive Roster
  function updateForm6Row(idx, field, val) {
    setFormData((prev) => {
      const rows = [...(prev.rows || [])];
      if (!rows[idx]) rows[idx] = {};

      const aliasMap = {
        distExecMeeting: 'distExec',
        distExec: 'distExecMeeting',
        distCommMeeting: 'distComm',
        distComm: 'distCommMeeting',
        areaExecMeeting: 'areaExec',
        areaExec: 'areaExecMeeting',
        areaCommMeeting: 'areaComm',
        areaComm: 'areaCommMeeting',
        ownBuMeeting: 'ownBu',
        ownBu: 'ownBuMeeting',
        buExecMeeting: 'buExec',
        buExec: 'buExecMeeting',
        buGbMeeting: 'buGb',
        buGb: 'buGbMeeting',
        psoMeeting: 'pso',
        pso: 'psoMeeting',
        conferenceMeeting: 'conf',
        conf: 'conferenceMeeting',
        seminarMeeting: 'seminar',
        seminar: 'seminarMeeting',
        studyCircleMeeting: 'studyCircle',
        studyCircle: 'studyCircleMeeting',
        inductionMeeting: 'induction',
        induction: 'inductionMeeting',
        alliedMeeting: 'allied',
        allied: 'alliedMeeting',
        rallyMeeting: 'rallies',
        rallies: 'rallyMeeting',
        jirgaMeeting: 'jirgas',
        jirgas: 'jirgaMeeting',
        monthlyDues: 'dues',
        dues: 'monthlyDues',
        bloodBankPosts: 'bloodZakat',
        bloodZakat: 'bloodBankPosts',
        ideologicalReading: 'reading',
        reading: 'ideologicalReading',
      };

      const updated = { ...rows[idx], [field]: val };
      if (aliasMap[field]) {
        updated[aliasMap[field]] = val;
      }

      const meetingFields = [
        'distExecMeeting', 'distCommMeeting', 'areaExecMeeting', 'areaCommMeeting',
        'ownBuMeeting', 'buExecMeeting', 'buGbMeeting', 'psoMeeting',
        'conferenceMeeting', 'seminarMeeting', 'studyCircleMeeting',
        'inductionMeeting', 'alliedMeeting', 'rallyMeeting', 'jirgaMeeting',
      ];

      if (meetingFields.includes(field) || (aliasMap[field] && meetingFields.includes(aliasMap[field]))) {
        const sum = meetingFields.reduce((acc, f) => {
          const raw = f === field ? val : (aliasMap[field] === f ? val : updated[f]);
          const v = parseInt(raw, 10) || 0;
          return acc + v;
        }, 0);
        updated.totalMeetings = sum;
      }

      rows[idx] = updated;
      return { ...prev, rows };
    });
  }

  // Form 6: Add comrade row to Roster
  function addForm6Row() {
    setFormData((prev) => {
      const rows = [...(prev.rows || [])];
      rows.push({
        srNo: rows.length + 1,
        name: '',
        distExecMeeting: 1,
        distCommMeeting: 1,
        areaExecMeeting: 0,
        areaCommMeeting: 0,
        ownBuMeeting: 1,
        buExecMeeting: 0,
        buGbMeeting: 0,
        psoMeeting: 0,
        conferenceMeeting: 0,
        seminarMeeting: 0,
        studyCircleMeeting: 1,
        inductionMeeting: 0,
        alliedMeeting: 0,
        rallyMeeting: 0,
        jirgaMeeting: 0,
        totalMeetings: 3,
        monthlyDues: 1000,
        tours: 0,
        publicOutreach: 1,
        inactiveContact: 0,
        officeAttendance: 'حاضر',
        bloodBankPosts: '',
        activeStatus: 'فعاله',
        ideologicalReading: '1',
      });
      return { ...prev, rows };
    });
  }

  // Form 6: Remove comrade row
  function removeForm6Row(idx) {
    setFormData((prev) => {
      const rows = (prev.rows || []).filter((_, i) => i !== idx);
      return { ...prev, rows };
    });
  }

  // Form 6: Auto-Sum All Roster Rows
  function handleAutoSumAllForm6Rows() {
    setFormData((prev) => {
      const meetingFields = [
        'distExecMeeting', 'distCommMeeting', 'areaExecMeeting', 'areaCommMeeting',
        'ownBuMeeting', 'buExecMeeting', 'buGbMeeting', 'psoMeeting',
        'conferenceMeeting', 'seminarMeeting', 'studyCircleMeeting',
        'inductionMeeting', 'alliedMeeting', 'rallyMeeting', 'jirgaMeeting',
      ];
      const rows = (prev.rows || []).map((r) => ({
        ...r,
        totalMeetings: meetingFields.reduce((sum, f) => sum + (parseInt(r[f], 10) || 0), 0),
      }));
      return { ...prev, rows };
    });
    setFeedback({ text: t('proforma.form6.autoSumAllSuccess', 'Total meetings auto-calculated for all district executive comrades!'), type: 'success' });
  }

  // Form 6 Validation
  function validateForm6Data(data = {}) {
    const errors = [];
    const u = data.upper || {};
    const dSlots = parseInt(u.distExecSlots, 10) || 0;
    const dPres = parseInt(u.distExecPresent, 10) || 0;
    const dAbs = parseInt(u.distExecAbsent, 10) || 0;
    const dLeave = parseInt(u.distExecLeave, 10) || 0;
    const dSum = dPres + dAbs + dLeave;
    if (dSlots > 0 && dSum > dSlots) {
      errors.push(`District Exec Meeting: Present (${dPres}) + Absent (${dAbs}) + Leave (${dLeave}) = ${dSum} exceeds slots (${dSlots})`);
    }

    const cTotal = parseInt(u.distCommTotal, 10) || 0;
    const cPres = parseInt(u.distCommPresent, 10) || 0;
    const cAbs = parseInt(u.distCommAbsent, 10) || 0;
    const cLeave = parseInt(u.distCommLeave, 10) || 0;
    const cSum = cPres + cAbs + cLeave;
    if (cTotal > 0 && cSum > cTotal) {
      errors.push(`District Committee Meeting: Present (${cPres}) + Absent (${cAbs}) + Leave (${cLeave}) = ${cSum} exceeds total (${cTotal})`);
    }

    const rows = data.rows || [];
    rows.forEach((r, i) => {
      const hasAnyData = Object.entries(r).some(([k, v]) => k !== 'srNo' && k !== 'name' && String(v || '').trim() !== '');
      if (hasAnyData && !r.name?.trim()) {
        errors.push(`Comrade Row #${i + 1}: Name is required`);
      }
    });

    return { errors, isValid: errors.length === 0 };
  }

  // Form 7: Update Area Unit row
  function updateForm7Row(idx, field, val) {
    setFormData((prev) => {
      const rows = [...(prev.rows || [])];
      const r = { ...rows[idx], [field]: val };

      // Auto-compute percentages accurately
      if (['execHeld', 'execMeetings', 'execPresent', 'execTotalMembers'].includes(field)) {
        const memTot = parseInt(field === 'execTotalMembers' ? val : r.execTotalMembers, 10) || 0;
        const memPres = parseInt(field === 'execPresent' ? val : r.execPresent, 10) || 0;
        const mtgTot = parseInt(field === 'execMeetings' ? val : r.execMeetings, 10) || 0;
        const mtgHeld = parseInt(field === 'execHeld' ? val : r.execHeld, 10) || 0;
        if (memTot > 0) {
          r.execPct = `${Math.min(100, Math.round((memPres / memTot) * 100))}%`;
        } else if (mtgTot > 0) {
          r.execPct = `${Math.min(100, Math.round((mtgHeld / mtgTot) * 100))}%`;
        }
      }
      if (['commHeld', 'commMeetings', 'commPresent', 'commTotalMembers'].includes(field)) {
        const memTot = parseInt(field === 'commTotalMembers' ? val : r.commTotalMembers, 10) || 0;
        const memPres = parseInt(field === 'commPresent' ? val : r.commPresent, 10) || 0;
        const mtgTot = parseInt(field === 'commMeetings' ? val : r.commMeetings, 10) || 0;
        const mtgHeld = parseInt(field === 'commHeld' ? val : r.commHeld, 10) || 0;
        if (memTot > 0) {
          r.commPct = `${Math.min(100, Math.round((memPres / memTot) * 100))}%`;
        } else if (mtgTot > 0) {
          r.commPct = `${Math.min(100, Math.round((mtgHeld / mtgTot) * 100))}%`;
        }
      }
      if (field === 'buExecMeetingsHeld' || field === 'buExecMeetingsTotal') {
        const total = parseInt(field === 'buExecMeetingsTotal' ? val : r.buExecMeetingsTotal, 10) || 0;
        const held = parseInt(field === 'buExecMeetingsHeld' ? val : r.buExecMeetingsHeld, 10) || 0;
        if (total > 0) r.buExecPct = `${Math.min(100, Math.round((held / total) * 100))}%`;
      }
      if (field === 'buGbMeetingsHeld' || field === 'buGbMeetingsTotal') {
        const total = parseInt(field === 'buGbMeetingsTotal' ? val : r.buGbMeetingsTotal, 10) || 0;
        const held = parseInt(field === 'buGbMeetingsHeld' ? val : r.buGbMeetingsHeld, 10) || 0;
        if (total > 0) r.buGbPct = `${Math.min(100, Math.round((held / total) * 100))}%`;
      }
      if (field === 'membershipPresent' || field === 'membershipTotal') {
        const total = parseInt(field === 'membershipTotal' ? val : r.membershipTotal, 10) || 0;
        const pres = parseInt(field === 'membershipPresent' ? val : r.membershipPresent, 10) || 0;
        if (total > 0) r.membershipPct = `${Math.min(100, Math.round((pres / total) * 100))}%`;
      }
      if (field === 'studyUnitsCount' || field === 'studyUnitsComm') {
        const total = parseInt(field === 'studyUnitsComm' ? val : r.studyUnitsComm, 10) || 0;
        const count = parseInt(field === 'studyUnitsCount' ? val : r.studyUnitsCount, 10) || 0;
        if (total > 0) r.studyPct = `${Math.min(100, Math.round((count / total) * 100))}%`;
      }

      rows[idx] = r;
      return { ...prev, rows };
    });
  }

  // Form 7: Add Area Unit row
  function addForm7Row() {
    setFormData((prev) => {
      const rows = [...(prev.rows || [])];
      rows.push({
        srNo: rows.length + 1,
        unitName: '',
        execMeetings: 1, execTotalMembers: 0, execPresent: 0, execHeld: 1, execPct: '100%',
        commMeetings: 1, commTotalMembers: 0, commPresent: 0, commHeld: 1, commPct: '100%',
        buCount: 0, newBuCount: 0,
        buExecUnitsTotal: 0, buExecUnitsPresent: 0, buExecMeetingsTotal: 0, buExecMeetingsHeld: 0, buExecPct: '',
        buGbMeetingsTotal: 0, buGbMeetingsHeld: 0, buGbPct: '', inactiveBuCount: 0,
        membershipTotal: 0, membershipPresent: 0, membershipPct: '',
        studyAreaComm: 0, studyUnitsComm: 0, studyUnitsCount: 0, studyPct: '',
        programsCount: 0, inductionPrograms: 0, newInductions: 0,
        psoUnitsCount: 0,
        ralliesCount: 0, jirgasCount: 0, unitGatherings: 0,
        villagesWithoutUnit: 0, officeActivity: 'فعاله',
        duesMonthly: 0, duesOrg: 0, duesEmergency: 0,
        bloodPosts: 0, bloodCash: 0, bloodZakat: 0,
      });
      return { ...prev, rows };
    });
  }

  // Form 7: Remove Area Unit row
  function removeForm7Row(idx) {
    setFormData((prev) => {
      const rows = (prev.rows || []).filter((_, i) => i !== idx).map((r, i) => ({ ...r, srNo: i + 1 }));
      return { ...prev, rows };
    });
  }

  // Form 7: Auto-Calculate All Percentages Across All Rows
  function handleAutoCalcAllForm7Rows() {
    setFormData((prev) => {
      const rows = (prev.rows || []).map((r) => {
        const updated = { ...r };
        const memTot = parseInt(r.execTotalMembers, 10) || 0;
        const memPres = parseInt(r.execPresent, 10) || 0;
        const eTot = parseInt(r.execMeetings, 10) || 0;
        const eHeld = parseInt(r.execHeld, 10) || 0;
        if (memTot > 0) {
          updated.execPct = `${Math.min(100, Math.round((memPres / memTot) * 100))}%`;
        } else if (eTot > 0) {
          updated.execPct = `${Math.min(100, Math.round((eHeld / eTot) * 100))}%`;
        }

        const cMemTot = parseInt(r.commTotalMembers, 10) || 0;
        const cMemPres = parseInt(r.commPresent, 10) || 0;
        const cTot = parseInt(r.commMeetings, 10) || 0;
        const cHeld = parseInt(r.commHeld, 10) || 0;
        if (cMemTot > 0) {
          updated.commPct = `${Math.min(100, Math.round((cMemPres / cMemTot) * 100))}%`;
        } else if (cTot > 0) {
          updated.commPct = `${Math.min(100, Math.round((cHeld / cTot) * 100))}%`;
        }

        const beTot = parseInt(r.buExecMeetingsTotal, 10) || 0;
        const beHeld = parseInt(r.buExecMeetingsHeld, 10) || 0;
        if (beTot > 0) updated.buExecPct = `${Math.min(100, Math.round((beHeld / beTot) * 100))}%`;

        const bgTot = parseInt(r.buGbMeetingsTotal, 10) || 0;
        const bgHeld = parseInt(r.buGbMeetingsHeld, 10) || 0;
        if (bgTot > 0) updated.buGbPct = `${Math.min(100, Math.round((bgHeld / bgTot) * 100))}%`;

        const mTot = parseInt(r.membershipTotal, 10) || 0;
        const mPres = parseInt(r.membershipPresent, 10) || 0;
        if (mTot > 0) updated.membershipPct = `${Math.min(100, Math.round((mPres / mTot) * 100))}%`;

        const sTot = parseInt(r.studyUnitsComm, 10) || 0;
        const sCount = parseInt(r.studyUnitsCount, 10) || 0;
        if (sTot > 0) updated.studyPct = `${Math.min(100, Math.round((sCount / sTot) * 100))}%`;

        return updated;
      });
      return { ...prev, rows };
    });
    setFeedback({ text: t('proforma.form7.autoCalcSuccess', 'Percentages and metrics auto-calculated successfully!'), type: 'success' });
  }

  // Form 7: Auto-Fix Inconsistencies & Balance Ratios
  function handleAutoFixForm7Inconsistencies() {
    setFormData((prev) => {
      const rows = (prev.rows || []).map((r) => {
        const u = { ...r };
        // Exec
        const eTotMem = parseInt(u.execTotalMembers, 10) || 0;
        const ePres = parseInt(u.execPresent, 10) || 0;
        const eMtgs = parseInt(u.execMeetings, 10) || 0;
        const eHeld = parseInt(u.execHeld, 10) || 0;
        if (eTotMem > 0 && ePres > eTotMem) u.execPresent = eTotMem;
        if (eMtgs > 0 && eHeld > eMtgs) u.execHeld = eMtgs;
        if (eTotMem > 0) u.execPct = `${Math.min(100, Math.round(((parseInt(u.execPresent, 10) || 0) / eTotMem) * 100))}%`;
        else if (eMtgs > 0) u.execPct = `${Math.min(100, Math.round(((parseInt(u.execHeld, 10) || 0) / eMtgs) * 100))}%`;

        // Comm
        const cTotMem = parseInt(u.commTotalMembers, 10) || 0;
        const cPres = parseInt(u.commPresent, 10) || 0;
        const cMtgs = parseInt(u.commMeetings, 10) || 0;
        const cHeld = parseInt(u.commHeld, 10) || 0;
        if (cTotMem > 0 && cPres > cTotMem) u.commPresent = cTotMem;
        if (cMtgs > 0 && cHeld > cMtgs) u.commHeld = cMtgs;
        if (cTotMem > 0) u.commPct = `${Math.min(100, Math.round(((parseInt(u.commPresent, 10) || 0) / cTotMem) * 100))}%`;
        else if (cMtgs > 0) u.commPct = `${Math.min(100, Math.round(((parseInt(u.commHeld, 10) || 0) / cMtgs) * 100))}%`;

        // BU Count
        const buTot = parseInt(u.buCount, 10) || 0;
        if (buTot > 0) {
          if ((parseInt(u.newBuCount, 10) || 0) > buTot) u.newBuCount = buTot;
          if ((parseInt(u.inactiveBuCount, 10) || 0) > buTot) u.inactiveBuCount = buTot;
        }

        // BU Exec
        const beTotMem = parseInt(u.buExecUnitsTotal, 10) || 0;
        if (beTotMem > 0 && (parseInt(u.buExecUnitsPresent, 10) || 0) > beTotMem) u.buExecUnitsPresent = beTotMem;
        const beMtgs = parseInt(u.buExecMeetingsTotal, 10) || 0;
        if (beMtgs > 0 && (parseInt(u.buExecMeetingsHeld, 10) || 0) > beMtgs) u.buExecMeetingsHeld = beMtgs;
        if (beMtgs > 0) u.buExecPct = `${Math.min(100, Math.round(((parseInt(u.buExecMeetingsHeld, 10) || 0) / beMtgs) * 100))}%`;

        // BU GB
        const bgMtgs = parseInt(u.buGbMeetingsTotal, 10) || 0;
        if (bgMtgs > 0 && (parseInt(u.buGbMeetingsHeld, 10) || 0) > bgMtgs) u.buGbMeetingsHeld = bgMtgs;
        if (bgMtgs > 0) u.buGbPct = `${Math.min(100, Math.round(((parseInt(u.buGbMeetingsHeld, 10) || 0) / bgMtgs) * 100))}%`;

        // Membership
        const memTot = parseInt(u.membershipTotal, 10) || 0;
        if (memTot > 0 && (parseInt(u.membershipPresent, 10) || 0) > memTot) u.membershipPresent = memTot;
        if (memTot > 0) u.membershipPct = `${Math.min(100, Math.round(((parseInt(u.membershipPresent, 10) || 0) / memTot) * 100))}%`;

        // Study
        const sTot = parseInt(u.studyUnitsComm, 10) || 0;
        if (sTot > 0 && (parseInt(u.studyUnitsCount, 10) || 0) > sTot) u.studyUnitsCount = sTot;
        if (sTot > 0) u.studyPct = `${Math.min(100, Math.round(((parseInt(u.studyUnitsCount, 10) || 0) / sTot) * 100))}%`;

        // Non-negative sanitization
        const numKeys = [
          'execMeetings', 'execTotalMembers', 'execPresent', 'execHeld',
          'commMeetings', 'commTotalMembers', 'commPresent', 'commHeld',
          'buCount', 'newBuCount',
          'buExecUnitsTotal', 'buExecUnitsPresent', 'buExecMeetingsTotal', 'buExecMeetingsHeld',
          'buGbMeetingsTotal', 'buGbMeetingsHeld', 'inactiveBuCount',
          'membershipTotal', 'membershipPresent',
          'studyAreaComm', 'studyUnitsComm', 'studyUnitsCount',
          'programsCount', 'inductionPrograms', 'newInductions',
          'psoUnitsCount',
          'ralliesCount', 'jirgasCount', 'unitGatherings',
          'villagesWithoutUnit',
          'duesMonthly', 'duesOrg', 'duesEmergency',
          'bloodPosts', 'bloodCash', 'bloodZakat'
        ];
        numKeys.forEach((k) => {
          const v = parseInt(u[k], 10);
          if (!isNaN(v) && v < 0) u[k] = 0;
        });

        return u;
      });
      return { ...prev, rows };
    });
    setFeedback({ text: t('proforma.form7.autoFixSuccess', 'Inconsistencies auto-corrected and percentages synchronized successfully!'), type: 'success' });
  }

  // Form 7 Validation
  function validateForm7Data(data = {}) {
    const errors = [];
    const rowErrors = {};
    const rows = data.rows || [];

    rows.forEach((r, i) => {
      const rErr = {};
      const uName = (r.unitName || '').trim();
      const label = uName ? `'${uName}'` : `Row #${i + 1}`;

      const hasAnyData = Object.entries(r).some(([k, v]) => k !== 'srNo' && k !== 'unitName' && String(v ?? '').trim() !== '');
      if (hasAnyData && !uName) {
        const msg = t('proforma.form7.validation.unitNameRequired', `Row #${i + 1}: Area Unit name is required`, { row: i + 1 });
        rErr.unitName = msg;
        errors.push(msg);
      }

      const checkNonNeg = (k, fName) => {
        const v = parseInt(r[k], 10);
        if (!isNaN(v) && v < 0) {
          const msg = t('proforma.form7.validation.negativeValue', `${label}: Negative value for ${fName} is not allowed`, { unit: label, field: fName });
          rErr[k] = msg;
          errors.push(msg);
        }
      };

      // 1. Exec
      const eTot = parseInt(r.execTotalMembers, 10) || 0;
      const ePres = parseInt(r.execPresent, 10) || 0;
      const eMtgs = parseInt(r.execMeetings, 10) || 0;
      const eHeld = parseInt(r.execHeld, 10) || 0;
      checkNonNeg('execTotalMembers', 'Executive Members');
      checkNonNeg('execPresent', 'Executive Present');
      checkNonNeg('execMeetings', 'Executive Meetings');
      checkNonNeg('execHeld', 'Executive Held');
      if (eTot > 0 && ePres > eTot) {
        const msg = t('proforma.form7.validation.execPresentExceeded', `${label}: Present executive members (${ePres}) cannot exceed total members (${eTot})`, { unit: label, present: ePres, total: eTot });
        rErr.execPresent = msg;
        errors.push(msg);
      }
      if (eMtgs > 0 && eHeld > eMtgs) {
        const msg = t('proforma.form7.validation.execHeldExceeded', `${label}: Held executive meetings (${eHeld}) cannot exceed scheduled meetings (${eMtgs})`, { unit: label, held: eHeld, total: eMtgs });
        rErr.execHeld = msg;
        errors.push(msg);
      }

      // 2. Comm
      const cTot = parseInt(r.commTotalMembers, 10) || 0;
      const cPres = parseInt(r.commPresent, 10) || 0;
      const cMtgs = parseInt(r.commMeetings, 10) || 0;
      const cHeld = parseInt(r.commHeld, 10) || 0;
      checkNonNeg('commTotalMembers', 'Committee Members');
      checkNonNeg('commPresent', 'Committee Present');
      checkNonNeg('commMeetings', 'Committee Meetings');
      checkNonNeg('commHeld', 'Committee Held');
      if (cTot > 0 && cPres > cTot) {
        const msg = t('proforma.form7.validation.commPresentExceeded', `${label}: Present committee members (${cPres}) cannot exceed total members (${cTot})`, { unit: label, present: cPres, total: cTot });
        rErr.commPresent = msg;
        errors.push(msg);
      }
      if (cMtgs > 0 && cHeld > cMtgs) {
        const msg = t('proforma.form7.validation.commHeldExceeded', `${label}: Held committee meetings (${cHeld}) cannot exceed scheduled meetings (${cMtgs})`, { unit: label, held: cHeld, total: cMtgs });
        rErr.commHeld = msg;
        errors.push(msg);
      }

      // 3. BU Count
      const buTot = parseInt(r.buCount, 10) || 0;
      const newBu = parseInt(r.newBuCount, 10) || 0;
      const inactBu = parseInt(r.inactiveBuCount, 10) || 0;
      checkNonNeg('buCount', 'Basic Units Total');
      checkNonNeg('newBuCount', 'New Basic Units');
      checkNonNeg('inactiveBuCount', 'Inactive Basic Units');
      if (buTot > 0 && newBu > buTot) {
        const msg = t('proforma.form7.validation.newBuExceeded', `${label}: New basic units (${newBu}) cannot exceed total basic units (${buTot})`, { unit: label, count: newBu, total: buTot });
        rErr.newBuCount = msg;
        errors.push(msg);
      }
      if (buTot > 0 && inactBu > buTot) {
        const msg = t('proforma.form7.validation.inactiveBuExceeded', `${label}: Inactive basic units (${inactBu}) cannot exceed total basic units (${buTot})`, { unit: label, count: inactBu, total: buTot });
        rErr.inactiveBuCount = msg;
        errors.push(msg);
      }

      // 4. BU Exec
      const beTotMem = parseInt(r.buExecUnitsTotal, 10) || 0;
      const bePres = parseInt(r.buExecUnitsPresent, 10) || 0;
      const beMtgs = parseInt(r.buExecMeetingsTotal, 10) || 0;
      const beHeld = parseInt(r.buExecMeetingsHeld, 10) || 0;
      checkNonNeg('buExecUnitsTotal', 'BU Exec Total Members');
      checkNonNeg('buExecUnitsPresent', 'BU Exec Present Members');
      checkNonNeg('buExecMeetingsTotal', 'BU Exec Meetings');
      checkNonNeg('buExecMeetingsHeld', 'BU Exec Held');
      if (beTotMem > 0 && bePres > beTotMem) {
        const msg = t('proforma.form7.validation.buExecPresExceeded', `${label}: BU Exec present members (${bePres}) cannot exceed total (${beTotMem})`, { unit: label, present: bePres, total: beTotMem });
        rErr.buExecUnitsPresent = msg;
        errors.push(msg);
      }
      if (beMtgs > 0 && beHeld > beMtgs) {
        const msg = t('proforma.form7.validation.buExecHeldExceeded', `${label}: BU Exec held meetings (${beHeld}) cannot exceed total scheduled (${beMtgs})`, { unit: label, held: beHeld, total: beMtgs });
        rErr.buExecMeetingsHeld = msg;
        errors.push(msg);
      }

      // 5. BU GB
      const bgMtgs = parseInt(r.buGbMeetingsTotal, 10) || 0;
      const bgHeld = parseInt(r.buGbMeetingsHeld, 10) || 0;
      checkNonNeg('buGbMeetingsTotal', 'BU GB Meetings');
      checkNonNeg('buGbMeetingsHeld', 'BU GB Held');
      if (bgMtgs > 0 && bgHeld > bgMtgs) {
        const msg = t('proforma.form7.validation.buGbHeldExceeded', `${label}: BU GB held meetings (${bgHeld}) cannot exceed total scheduled (${bgMtgs})`, { unit: label, held: bgHeld, total: bgMtgs });
        rErr.buGbMeetingsHeld = msg;
        errors.push(msg);
      }

      // 6. Membership
      const memTot = parseInt(r.membershipTotal, 10) || 0;
      const memPres = parseInt(r.membershipPresent, 10) || 0;
      checkNonNeg('membershipTotal', 'Membership Total');
      checkNonNeg('membershipPresent', 'Membership Present');
      if (memTot > 0 && memPres > memTot) {
        const msg = t('proforma.form7.validation.memPresExceeded', `${label}: Present members (${memPres}) cannot exceed total membership (${memTot})`, { unit: label, present: memPres, total: memTot });
        rErr.membershipPresent = msg;
        errors.push(msg);
      }

      // 7. Study
      const sTot = parseInt(r.studyUnitsComm, 10) || 0;
      const sCount = parseInt(r.studyUnitsCount, 10) || 0;
      checkNonNeg('studyAreaComm', 'Area Comm Study');
      checkNonNeg('studyUnitsComm', 'Units Comm Study');
      checkNonNeg('studyUnitsCount', 'Units Study Count');
      if (sTot > 0 && sCount > sTot) {
        const msg = t('proforma.form7.validation.studyCountExceeded', `${label}: Units conducting study circles (${sCount}) cannot exceed total (${sTot})`, { unit: label, count: sCount, total: sTot });
        rErr.studyUnitsCount = msg;
        errors.push(msg);
      }

      // 8. Other numeric
      ['programsCount', 'inductionPrograms', 'newInductions', 'psoUnitsCount',
       'ralliesCount', 'jirgasCount', 'unitGatherings', 'villagesWithoutUnit',
       'duesMonthly', 'duesOrg', 'duesEmergency', 'bloodPosts', 'bloodCash', 'bloodZakat'
      ].forEach((k) => checkNonNeg(k, k));

      if (Object.keys(rErr).length > 0) {
        rowErrors[i] = rErr;
      }
    });

    return { errors, rowErrors, isValid: errors.length === 0 };
  }

  // Form 8: Update Comrade row
  function updateForm8Row(idx, field, val) {
    setFormData((prev) => {
      const rows = [...(prev.rows || [])];
      const r = { ...rows[idx], [field]: val };

      const meetingFields = [
        'distCommMeeting', 'areaExecMeeting', 'areaCommMeeting', 'ownBuMeeting',
        'buExecMeeting', 'buMeeting', 'psoMeeting', 'conferences', 'seminars',
        'studyCircles', 'inductions', 'publicGatherings'
      ];

      if (meetingFields.includes(field)) {
        const sum = meetingFields.reduce((acc, f) => {
          const v = f === field ? val : r[f];
          return acc + (parseInt(v, 10) || 0);
        }, 0);
        r.totalMeetings = sum;
      }

      rows[idx] = r;
      return { ...prev, rows };
    });
  }

  // Form 8: Add Comrade row
  function addForm8Row() {
    setFormData((prev) => {
      const rows = [...(prev.rows || [])];
      rows.push({
        srNo: rows.length + 1,
        name: '',
        distCommMeeting: 0,
        areaExecMeeting: 0,
        areaCommMeeting: 0,
        ownBuMeeting: 0,
        buExecMeeting: 0,
        buMeeting: 0,
        psoMeeting: 0,
        conferences: 0,
        seminars: 0,
        studyCircles: 0,
        inductions: 0,
        publicGatherings: 0,
        totalMeetings: 0,
        monthlyDues: 0,
        tours: 0,
        contacts: 0,
        officeAttendance: 0,
        activeStatus: 'فعاله',
        ideologicalReading: '',
        bloodBank: 0,
      });
      return { ...prev, rows };
    });
  }

  // Form 8: Remove Comrade row
  function removeForm8Row(idx) {
    setFormData((prev) => {
      const rows = (prev.rows || []).filter((_, i) => i !== idx).map((r, i) => ({ ...r, srNo: i + 1 }));
      return { ...prev, rows };
    });
  }

  // Form 8: Auto calculate total meetings for all rows
  function handleAutoCalcAllForm8Rows() {
    setFormData((prev) => {
      const rows = (prev.rows || []).map((r) => {
        const meetingFields = [
          'distCommMeeting', 'areaExecMeeting', 'areaCommMeeting', 'ownBuMeeting',
          'buExecMeeting', 'buMeeting', 'psoMeeting', 'conferences', 'seminars',
          'studyCircles', 'inductions', 'publicGatherings'
        ];
        const sum = meetingFields.reduce((acc, f) => acc + (parseInt(r[f], 10) || 0), 0);
        return {
          ...r,
          totalMeetings: sum,
        };
      });
      return { ...prev, rows };
    });

    setFeedback({
      text: t('proforma.form8.autoCalcSuccess', 'Total meetings auto-calculated for all members successfully.'),
      type: 'success',
    });
  }

  // Form 8: Auto correct inconsistencies
  function handleAutoFixForm8Inconsistencies() {
    setFormData((prev) => {
      const rows = (prev.rows || []).map((r, i) => {
        const fixed = { ...r };
        const meetingFields = [
          'distCommMeeting', 'areaExecMeeting', 'areaCommMeeting', 'ownBuMeeting',
          'buExecMeeting', 'buMeeting', 'psoMeeting', 'conferences', 'seminars',
          'studyCircles', 'inductions', 'publicGatherings'
        ];
        const numericFields = [
          ...meetingFields, 'monthlyDues', 'tours', 'contacts', 'officeAttendance', 'bloodBank'
        ];

        numericFields.forEach((f) => {
          const val = parseInt(fixed[f], 10) || 0;
          fixed[f] = Math.max(0, val);
        });

        // Recalculate total meetings
        fixed.totalMeetings = meetingFields.reduce((acc, f) => acc + (fixed[f] || 0), 0);

        if (!fixed.activeStatus || (fixed.activeStatus !== 'فعاله' && fixed.activeStatus !== 'غير فعاله')) {
          fixed.activeStatus = 'فعاله';
        }

        fixed.srNo = i + 1;
        return fixed;
      });

      return { ...prev, rows };
    });

    setFeedback({
      text: t('proforma.form8.autoFixSuccess', 'Inconsistencies auto-corrected and total meetings recalculated successfully.'),
      type: 'success',
    });
  }

  // Form 8: Validation
  function validateForm8Data(data = {}) {
    const rows = data.rows || [];
    const errors = [];
    const rowErrors = {};

    rows.forEach((r, i) => {
      const rErr = {};
      const label = `Row #${i + 1}`;

      const meetingFields = [
        'distCommMeeting', 'areaExecMeeting', 'areaCommMeeting', 'ownBuMeeting',
        'buExecMeeting', 'buMeeting', 'psoMeeting', 'conferences', 'seminars',
        'studyCircles', 'inductions', 'publicGatherings'
      ];
      const numericFields = [
        ...meetingFields, 'monthlyDues', 'tours', 'contacts', 'officeAttendance', 'bloodBank'
      ];

      const hasAnyData = numericFields.some((f) => (parseInt(r[f], 10) || 0) > 0)
        || (r.name && r.name.trim())
        || (r.ideologicalReading && r.ideologicalReading.trim());

      if (hasAnyData && (!r.name || !r.name.trim())) {
        const msg = t('proforma.form8.validation.nameRequired', `${label}: Comrade name is required`);
        rErr.name = msg;
        errors.push(msg);
      }

      numericFields.forEach((f) => {
        const val = parseInt(r[f], 10) || 0;
        if (val < 0) {
          const msg = t('proforma.form8.validation.negativeValue', `${label}: Negative values are not permitted for ${f}`);
          rErr[f] = msg;
          errors.push(msg);
        }
      });

      if (Object.keys(rErr).length > 0) {
        rowErrors[i] = rErr;
      }
    });

    return { errors, rowErrors, isValid: errors.length === 0 };
  }

  // Form 9: Section 1 Helpers
  function updateForm9Sec1Row(idx, field, val) {
    setFormData((prev) => {
      const sec1Members = [...(prev.sec1Members || [])];
      const r = { ...sec1Members[idx], [field]: val };

      const meetingFields = [
        'distExecMeeting', 'distCommMeeting', 'areaExecMeeting', 'areaCommMeeting',
        'buExecMeeting', 'buGbMeeting', 'psoMeeting', 'conferences', 'seminars',
        'studyCircles', 'inductions', 'alliesMeeting', 'publicGatherings'
      ];

      if (meetingFields.includes(field)) {
        const sum = meetingFields.reduce((acc, f) => {
          const v = f === field ? val : r[f];
          return acc + (parseInt(v, 10) || 0);
        }, 0);
        r.totalMeetings = sum;
      }

      sec1Members[idx] = r;
      return { ...prev, sec1Members };
    });
  }

  function addForm9Sec1Row() {
    setFormData((prev) => {
      const sec1Members = [...(prev.sec1Members || [])];
      sec1Members.push({
        srNo: sec1Members.length + 1,
        name: '',
        designation: '',
        date: '',
        distExecMeeting: 0,
        distCommMeeting: 0,
        areaExecMeeting: 0,
        areaCommMeeting: 0,
        buExecMeeting: 0,
        buGbMeeting: 0,
        psoMeeting: 0,
        conferences: 0,
        seminars: 0,
        studyCircles: 0,
        inductions: 0,
        alliesMeeting: 0,
        publicGatherings: 0,
        totalMeetings: 0,
        ideologicalReading: '',
        dues: 0,
        tours: 0,
      });
      return { ...prev, sec1Members };
    });
  }

  function removeForm9Sec1Row(idx) {
    setFormData((prev) => {
      const sec1Members = (prev.sec1Members || []).filter((_, i) => i !== idx).map((r, i) => ({ ...r, srNo: i + 1 }));
      return { ...prev, sec1Members };
    });
  }

  function handleAutoCalcForm9() {
    setFormData((prev) => {
      const meetingFields = [
        'distExecMeeting', 'distCommMeeting', 'areaExecMeeting', 'areaCommMeeting',
        'buExecMeeting', 'buGbMeeting', 'psoMeeting', 'conferences', 'seminars',
        'studyCircles', 'inductions', 'alliesMeeting', 'publicGatherings'
      ];
      const sec1Members = (prev.sec1Members || []).map((r) => {
        const sum = meetingFields.reduce((acc, f) => acc + (parseInt(r[f], 10) || 0), 0);
        return { ...r, totalMeetings: sum };
      });
      return { ...prev, sec1Members };
    });
    setFeedback({
      text: t('proforma.form9.autoCalcSuccess', 'Total meetings auto-calculated for all members successfully.'),
      type: 'info',
    });
  }

  // Form 9: Section 2 Helpers (Public Gatherings)
  function updateForm9Sec2Row(idx, field, val) {
    setFormData((prev) => {
      const sec2PublicGatherings = [...(prev.sec2PublicGatherings || [])];
      sec2PublicGatherings[idx] = { ...sec2PublicGatherings[idx], [field]: val };
      return { ...prev, sec2PublicGatherings };
    });
  }

  function addForm9Sec2Row() {
    setFormData((prev) => {
      const sec2PublicGatherings = [...(prev.sec2PublicGatherings || [])];
      sec2PublicGatherings.push({
        srNo: sec2PublicGatherings.length + 1,
        organName: '',
        date: '',
        venue: '',
        topic: '',
        programType: '',
        speakers: '',
        comradesCount: 0,
        peopleCount: 0,
      });
      return { ...prev, sec2PublicGatherings };
    });
  }

  function removeForm9Sec2Row(idx) {
    setFormData((prev) => {
      const sec2PublicGatherings = (prev.sec2PublicGatherings || []).filter((_, i) => i !== idx).map((r, i) => ({ ...r, srNo: i + 1 }));
      return { ...prev, sec2PublicGatherings };
    });
  }

  // Form 9: Section 3 Helpers (Conferences & Seminars)
  function updateForm9Sec3Row(idx, field, val) {
    setFormData((prev) => {
      const sec3Conferences = [...(prev.sec3Conferences || [])];
      sec3Conferences[idx] = { ...sec3Conferences[idx], [field]: val };
      return { ...prev, sec3Conferences };
    });
  }

  function addForm9Sec3Row() {
    setFormData((prev) => {
      const sec3Conferences = [...(prev.sec3Conferences || [])];
      sec3Conferences.push({
        srNo: sec3Conferences.length + 1,
        organName: '',
        date: '',
        venue: '',
        topic: '',
        programType: '',
        speakers: '',
        comradesCount: 0,
      });
      return { ...prev, sec3Conferences };
    });
  }

  function removeForm9Sec3Row(idx) {
    setFormData((prev) => {
      const sec3Conferences = (prev.sec3Conferences || []).filter((_, i) => i !== idx).map((r, i) => ({ ...r, srNo: i + 1 }));
      return { ...prev, sec3Conferences };
    });
  }

  // Form 9: Section 4 Helpers (Blood Bank & Zakat)
  function updateForm9Sec4(field, val) {
    setFormData((prev) => {
      const b = { ...(prev.sec4BloodBank || {}), [field]: val };
      if (field === 'cash' || field === 'zakat') {
        const c = parseInt(field === 'cash' ? val : (b.cash ?? 0), 10) || 0;
        const z = parseInt(field === 'zakat' ? val : (b.zakat ?? 0), 10) || 0;
        b.totalCash = c + z;
      }
      return { ...prev, sec4BloodBank: b };
    });
  }

  // Form 9: Section 5 Helpers (Disciplinary Actions)
  function updateForm9Sec5Row(idx, field, val) {
    setFormData((prev) => {
      const sec5Discipline = [...(prev.sec5Discipline || [])];
      sec5Discipline[idx] = { ...sec5Discipline[idx], [field]: val };
      return { ...prev, sec5Discipline };
    });
  }

  function addForm9Sec5Row() {
    setFormData((prev) => {
      const sec5Discipline = [...(prev.sec5Discipline || [])];
      sec5Discipline.push({
        comradeName: '',
        designation: '',
        violation: '',
        actionTaken: '',
      });
      return { ...prev, sec5Discipline };
    });
  }

  function removeForm9Sec5Row(idx) {
    setFormData((prev) => {
      const sec5Discipline = (prev.sec5Discipline || []).filter((_, i) => i !== idx);
      return { ...prev, sec5Discipline };
    });
  }

  // Form 9: Section 6 Helpers (Proposals & Demands Matrix)
  function updateForm9Sec6(category, field, val) {
    setFormData((prev) => ({
      ...prev,
      sec6Proposals: {
        ...(prev.sec6Proposals || {}),
        [category]: {
          ...(prev.sec6Proposals?.[category] || {}),
          [field]: val,
        },
      },
    }));
  }

  // Form 9: Section 7 Helpers (Social Work, Misc & Signatures)
  function updateForm9Sec7(field, val) {
    setFormData((prev) => ({
      ...prev,
      sec7Notes: {
        ...(prev.sec7Notes || {}),
        [field]: val,
      },
    }));
  }

  // Form 9: Validation
  function validateForm9Data(data = {}) {
    const sec1 = data.sec1Members || [];
    const errors = [];
    const rowErrors = {};

    sec1.forEach((r, i) => {
      const rErr = {};
      const label = `Row #${i + 1}`;

      const meetingFields = [
        'distExecMeeting', 'distCommMeeting', 'areaExecMeeting', 'areaCommMeeting',
        'buExecMeeting', 'buGbMeeting', 'psoMeeting', 'conferences', 'seminars',
        'studyCircles', 'inductions', 'alliesMeeting', 'publicGatherings'
      ];
      const numericFields = [...meetingFields, 'dues', 'tours'];

      const hasAnyData = numericFields.some((f) => (parseInt(r[f], 10) || 0) > 0)
        || (r.name && r.name.trim())
        || (r.ideologicalReading && r.ideologicalReading.trim());

      if (hasAnyData && (!r.name || !r.name.trim())) {
        const msg = `${label}: Comrade name is required`;
        rErr.name = msg;
        errors.push(msg);
      }

      numericFields.forEach((f) => {
        const val = parseInt(r[f], 10) || 0;
        if (val < 0) {
          const msg = `${label}: Negative values are not permitted for ${f}`;
          rErr[f] = msg;
          errors.push(msg);
        }
      });

      if (Object.keys(rErr).length > 0) {
        rowErrors[i] = rErr;
      }
    });

    if (data.sec4BloodBank) {
      const b = data.sec4BloodBank;
      ['eidHidesCount', 'cash', 'totalCash', 'zakat'].forEach((f) => {
        const val = parseInt(b[f], 10) || 0;
        if (val < 0) {
          errors.push(`Blood Bank: ${f} cannot be negative`);
        }
      });
    }

    return { errors, rowErrors, isValid: errors.length === 0 };
  }

  const rows = formData.rows || formData.execRows || [];
  const form2Validation = useMemo(() => validateForm2Rows(formData.rows || []), [formData.rows]);
  const form3Validation = useMemo(() => validateForm3Data(formData), [formData]);
  const form5Validation = useMemo(() => validateForm5Rows(formData.rows || []), [formData.rows]);
  const form6Validation = useMemo(() => validateForm6Data(formData), [formData]);
  const form7Validation = useMemo(() => validateForm7Data(formData), [formData]);
  const form8Validation = useMemo(() => validateForm8Data(formData), [formData]);
  const form9Validation = useMemo(() => validateForm9Data(formData), [formData]);
  const upper = formData.upper || formData;

  // Real-time calculations for Form 4
  const calcForm4ExecPct = useMemo(() => {
    if (upper.execPct) return upper.execPct;
    const p = parseInt(upper.execPresent, 10) || 0;
    const t = parseInt(upper.execSlots, 10) || (p + (parseInt(upper.execAbsent, 10) || 0) + (parseInt(upper.execLeave, 10) || 0));
    return t > 0 ? `${Math.round((p / t) * 100)}%` : '0%';
  }, [upper.execPresent, upper.execSlots, upper.execAbsent, upper.execLeave, upper.execPct]);

  const calcForm4GbPct = useMemo(() => {
    if (upper.gbPct) return upper.gbPct;
    const p = parseInt(upper.gbPresent, 10) || 0;
    const t = parseInt(upper.gbMembers, 10) || (p + (parseInt(upper.gbAbsent, 10) || 0) + (parseInt(upper.gbLeave, 10) || 0));
    return t > 0 ? `${Math.round((p / t) * 100)}%` : '0%';
  }, [upper.gbPresent, upper.gbMembers, upper.gbAbsent, upper.gbLeave, upper.gbPct]);

  const calcForm4PsoPct = useMemo(() => {
    if (upper.psoPct) return upper.psoPct;
    const p = parseInt(upper.psoPresent, 10) || 0;
    const t = parseInt(upper.psoMembers, 10) || 0;
    return t > 0 ? `${Math.round((p / t) * 100)}%` : '0%';
  }, [upper.psoPresent, upper.psoMembers, upper.psoPct]);

  const calcForm4NetFinance = useMemo(() => {
    const org = parseInt(upper.orgDonations, 10) || 0;
    const emg = parseInt(upper.emergencyDonations, 10) || 0;
    const exp = parseInt(upper.expenses, 10) || 0;
    return (org + emg) - exp;
  }, [upper.orgDonations, upper.emergencyDonations, upper.expenses]);

  // Real-time calculations for Form 1
  const calcExecPct = useMemo(() => {
    if (upper.execPct) return upper.execPct;
    const p = parseInt(upper.execPresent, 10) || 0;
    const t = parseInt(upper.execSlots, 10) || 0;
    return t > 0 ? `${Math.round((p / t) * 100)}%` : '0%';
  }, [upper.execPresent, upper.execSlots, upper.execPct]);

  const calcCommPct = useMemo(() => {
    if (upper.commPct) return upper.commPct;
    const p = parseInt(upper.commPresent, 10) || 0;
    const t = parseInt(upper.commTotal, 10) || 0;
    return t > 0 ? `${Math.round((p / t) * 100)}%` : '0%';
  }, [upper.commPresent, upper.commTotal, upper.commPct]);

  const calcBuExecPct = useMemo(() => {
    if (upper.buExecPct) return upper.buExecPct;
    const p = parseInt(upper.buExecPresent, 10) || 0;
    const t = parseInt(upper.buExecCount, 10) || 0;
    return t > 0 ? `${Math.round((p / t) * 100)}%` : '0%';
  }, [upper.buExecPresent, upper.buExecCount, upper.buExecPct]);

  const calcBuGbPct = useMemo(() => {
    if (upper.buGbPct) return upper.buGbPct;
    const p = parseInt(upper.buGbPresent, 10) || 0;
    const t = parseInt(upper.buGbCount, 10) || 0;
    return t > 0 ? `${Math.round((p / t) * 100)}%` : '0%';
  }, [upper.buGbPresent, upper.buGbCount, upper.buGbPct]);

  const calcMemberPct = useMemo(() => {
    if (upper.memberPct) return upper.memberPct;
    const a = parseInt(upper.activeMembers, 10) || 0;
    const t = parseInt(upper.totalMembers, 10) || 0;
    return t > 0 ? `${Math.round((a / t) * 100)}%` : '0%';
  }, [upper.activeMembers, upper.totalMembers, upper.memberPct]);

  const calcStudyPct = useMemo(() => {
    if (upper.studyPct) return upper.studyPct;
    const u = parseInt(upper.studyUnitsCount, 10) || 0;
    const t = parseInt(upper.buExecCount || 1, 10) || 1;
    if (u > 0) return `${Math.min(100, Math.round((u / t) * 100))}%`;
    if (parseInt(upper.studyAreaComm, 10) > 0) return '100%';
    return '';
  }, [upper.studyUnitsCount, upper.buExecCount, upper.studyAreaComm, upper.studyPct]);

  const calcTotalDues = useMemo(() => {
    const u = parseInt(upper.unitDonations, 10) || 0;
    const a = parseInt(upper.areaDonations, 10) || 0;
    const e = parseInt(upper.emergencyDonations, 10) || 0;
    return u + a + e;
  }, [upper.unitDonations, upper.areaDonations, upper.emergencyDonations]);

  const calcNetFinance = useMemo(() => {
    const exp = parseInt(upper.totalExpenses, 10) || 0;
    return calcTotalDues - exp;
  }, [calcTotalDues, upper.totalExpenses]);

  // Validation checks for Form 4
  const form4ExecSlots = parseInt(upper.execSlots, 10) || 0;
  const form4ExecPres = parseInt(upper.execPresent, 10) || 0;
  const form4ExecAbs = parseInt(upper.execAbsent, 10) || 0;
  const form4ExecLeave = parseInt(upper.execLeave, 10) || 0;
  const form4ExecSum = form4ExecPres + form4ExecAbs + form4ExecLeave;
  const form4ExecInvalid = form4ExecSlots > 0 && form4ExecSum !== form4ExecSlots;

  const form4GbMembers = parseInt(upper.gbMembers, 10) || 0;
  const form4GbPres = parseInt(upper.gbPresent, 10) || 0;
  const form4GbAbs = parseInt(upper.gbAbsent, 10) || 0;
  const form4GbLeave = parseInt(upper.gbLeave, 10) || 0;
  const form4GbSum = form4GbPres + form4GbAbs + form4GbLeave;
  const form4GbInvalid = form4GbMembers > 0 && form4GbSum !== form4GbMembers;

  const form4PsoMembers = parseInt(upper.psoMembers, 10) || 0;
  const form4PsoPres = parseInt(upper.psoPresent, 10) || 0;
  const form4PsoInvalid = form4PsoMembers > 0 && form4PsoPres > form4PsoMembers;

  // Validation checks for Form 1
  const execTotal = parseInt(upper.execSlots, 10) || 0;
  const execPres = parseInt(upper.execPresent, 10) || 0;
  const execAbs = parseInt(upper.execAbsent, 10) || 0;
  const execLeave = parseInt(upper.execLeave, 10) || 0;
  const execSum = execPres + execAbs + execLeave;
  const execAttendanceInvalid = execTotal > 0 && execSum > execTotal;

  const commTotal = parseInt(upper.commTotal, 10) || 0;
  const commPres = parseInt(upper.commPresent, 10) || 0;
  const commAbs = parseInt(upper.commAbsent, 10) || 0;
  const commLeave = parseInt(upper.commLeave, 10) || 0;
  const commSum = commPres + commAbs + commLeave;
  const commAttendanceInvalid = commTotal > 0 && commSum > commTotal;

  // Validation and finance calculations for Form 6
  const form6DistExecSlots = parseInt(upper.distExecSlots, 10) || 0;
  const form6DistExecPres = parseInt(upper.distExecPresent, 10) || 0;
  const form6DistExecAbs = parseInt(upper.distExecAbsent, 10) || 0;
  const form6DistExecLeave = parseInt(upper.distExecLeave, 10) || 0;
  const form6DistExecSum = form6DistExecPres + form6DistExecAbs + form6DistExecLeave;

  const form6DistCommTotal = parseInt(upper.distCommTotal, 10) || 0;
  const form6DistCommPres = parseInt(upper.distCommPresent, 10) || 0;
  const form6DistCommAbs = parseInt(upper.distCommAbsent, 10) || 0;
  const form6DistCommLeave = parseInt(upper.distCommLeave, 10) || 0;
  const form6DistCommSum = form6DistCommPres + form6DistCommAbs + form6DistCommLeave;

  const form6NetFinance = useMemo(() => {
    const m = parseInt(upper.duesMonthly, 10) || 0;
    const e = parseInt(upper.duesEmergency, 10) || 0;
    const exp = parseInt(upper.duesExpenses, 10) || 0;
    return (m + e) - exp;
  }, [upper.duesMonthly, upper.duesEmergency, upper.duesExpenses]);

  // Save silently and return the saved document
  async function saveReportData(targetStatus = 'DRAFT') {
    if (!targetId) throw new Error((formType === 'form6' || formType === 'form7' || formType === 'form8' || formType === 'form9') ? 'No district or unit selected' : (formType === 'form5' ? 'No province selected' : (formType === 'form4' ? 'No basic unit selected' : 'No area context available')));

    if (formType === 'form9') {
      const payload = {
        formType: 'form9',
        unitLevel: effectiveDistrictId ? 'DISTRICT' : 'AREA',
        unitId: targetId,
        districtId: effectiveDistrictId || undefined,
        areaId: effectiveAreaId || undefined,
        unitName: activeUnitDisplayName,
        year: parseInt(year, 10),
        month: parseInt(month, 10),
        status: targetStatus,
        data: sanitizeReportData({
          ...formData,
          districtName: formData.districtName || activeUnitDisplayName,
          areaName: formData.areaName || '',
          year: String(year),
          month: String(month),
          sec1Members: formData.sec1Members || [],
          sec2PublicGatherings: formData.sec2PublicGatherings || [],
          sec3Conferences: formData.sec3Conferences || [],
          sec4BloodBank: formData.sec4BloodBank || {},
          sec5Discipline: formData.sec5Discipline || [],
          sec6Proposals: formData.sec6Proposals || {},
          sec7Notes: formData.sec7Notes || {},
        }),
        notes: formData.sec7Notes?.miscellaneousNotes || '',
      };
      const res = await api.post('/proforma/save', payload);
      setStatusDoc(res.data);
      return res.data;
    }

    if (formType === 'form7' || formType === 'form8') {
      const payload = {
        formType: formType,
        unitLevel: 'DISTRICT',
        unitId: effectiveDistrictId,
        districtId: effectiveDistrictId,
        unitName: activeUnitDisplayName,
        year: parseInt(year, 10),
        month: parseInt(month, 10),
        status: targetStatus,
        data: sanitizeReportData({
          ...formData,
          districtName: activeUnitDisplayName,
          year: String(year),
          month: String(month),
          rows: formData.rows || [],
        }),
        notes: formData.notes || '',
      };
      const res = await api.post('/proforma/save', payload);
      setStatusDoc(res.data);
      return res.data;
    }

    if (formType === 'form6') {
      const payload = {
        formType: 'form6',
        unitLevel: 'DISTRICT',
        unitId: effectiveDistrictId,
        districtId: effectiveDistrictId,
        unitName: activeUnitDisplayName,
        year: parseInt(year, 10),
        month: parseInt(month, 10),
        status: targetStatus,
        data: sanitizeReportData({
          ...formData,
          districtName: activeUnitDisplayName,
          year: String(year),
          month: String(month),
          m1: formData.m1 !== undefined ? formData.m1 : '',
          m2: formData.m2 !== undefined ? formData.m2 : '',
          m3: formData.m3 !== undefined ? formData.m3 : '',
          upper: formData.upper || {},
          rows: formData.rows || [],
        }),
        notes: formData.notes || '',
      };
      const res = await api.post('/proforma/save', payload);
      setStatusDoc(res.data);
      return res.data;
    }

    if (formType === 'form5') {
      const payload = {
        formType: 'form5',
        unitLevel: 'PROVINCE',
        unitId: effectiveProvinceId,
        provinceId: effectiveProvinceId,
        unitName: activeUnitDisplayName,
        year: parseInt(year, 10),
        month: parseInt(month, 10),
        status: targetStatus,
        data: sanitizeReportData({
          ...formData,
          provinceName: activeUnitDisplayName,
          year: String(year),
          month: String(month),
          fromDate: formData.fromDate || `01/${String(month).padStart(2, '0')}`,
          toDate: formData.toDate || `${new Date(parseInt(year, 10), parseInt(month, 10), 0).getDate()}/${String(month).padStart(2, '0')}`,
          rows: formData.rows || [],
        }),
        notes: formData.notes || '',
      };
      const res = await api.post('/proforma/save', payload);
      setStatusDoc(res.data);
      return res.data;
    }

    if (formType === 'form3') {
      const payload = {
        formType: 'form3',
        unitLevel: 'AREA',
        unitId: effectiveAreaId,
        areaId: effectiveAreaId,
        unitName: activeUnitDisplayName,
        year: parseInt(year, 10),
        month: parseInt(month, 10),
        status: targetStatus,
        data: sanitizeReportData({
          ...formData,
          areaName: activeUnitDisplayName,
          month: String(month),
          year: String(year),
          inactiveUnits: formData.inactiveUnits || [],
          committeeMembers: formData.committeeMembers || [],
          publicActivities: formData.publicActivities || [],
          educationalActivities: formData.educationalActivities || [],
          disciplinaryActions: formData.disciplinaryActions || [],
          bloodBank: formData.bloodBank || { bloodPosts: '', bloodCash: '', bloodTotalCash: '', zakat: '' },
          proposals: formData.proposals || {
            political: { exec: '', comm: '', ind: '' },
            organizational: { exec: '', comm: '', ind: '' },
            social: { exec: '', comm: '', ind: '' },
            demands: '',
          },
          officeActivity: formData.officeActivity || '',
          socialReport: formData.socialReport || '',
          misc: formData.misc || '',
          secSignature: formData.secSignature || '',
          seniorSecSignature: formData.seniorSecSignature || '',
        }),
        notes: formData.notes || '',
      };
      const res = await api.post('/proforma/save', payload);
      setStatusDoc(res.data);
      return res.data;
    }

    if (formType === 'form2') {
      const payload = {
        formType: 'form2',
        unitLevel: 'AREA',
        unitId: effectiveAreaId,
        areaId: effectiveAreaId,
        unitName: activeUnitDisplayName,
        year: parseInt(year, 10),
        month: parseInt(month, 10),
        status: targetStatus,
        data: sanitizeReportData({
          ...formData,
          areaName: activeUnitDisplayName,
          month: String(month),
          year: String(year),
          rows: formData.rows || [],
        }),
        notes: formData.notes || '',
      };
      const res = await api.post('/proforma/save', payload);
      setStatusDoc(res.data);
      return res.data;
    }

    let preparedUpper;
    if (formType === 'form4') {
      preparedUpper = {
        ...(formData.upper || {}),
        execPct: upper.execPct || calcForm4ExecPct,
        gbPct: upper.gbPct || calcForm4GbPct,
        psoPct: upper.psoPct || calcForm4PsoPct,
      };
    } else {
      preparedUpper = {
        ...(formData.upper || {}),
        execPct: upper.execPct || calcExecPct,
        commPct: upper.commPct || calcCommPct,
        buExecPct: upper.buExecPct || calcBuExecPct,
        buGbPct: upper.buGbPct || calcBuGbPct,
        memberPct: upper.memberPct || calcMemberPct,
        studyPct: upper.studyPct || calcStudyPct || ((parseInt(upper.studyUnitsCount, 10) > 0 || parseInt(upper.studyAreaComm, 10) > 0) ? '100%' : ''),
        totalDonations: upper.totalDonations || calcTotalDues,
      };
    }

    const payload = {
      formType,
      unitLevel: formType === 'form4' ? 'BASIC_UNIT' : 'AREA',
      unitId: targetId,
      areaId: effectiveAreaId,
      unitName: activeUnitDisplayName,
      year: parseInt(year, 10),
      month: parseInt(month, 10),
      status: targetStatus,
      data: sanitizeReportData({
        ...formData,
        unitName: activeUnitDisplayName,
        upper: preparedUpper,
      }),
      notes: formData.notes || '',
    };

    const res = await api.post('/proforma/save', payload);
    setStatusDoc(res.data);
    return res.data;
  }

  // Handle explicit Save & Submit button
  async function handleSave() {
    setSaving(true);
    setFeedback({ text: '', type: '' });

    if (formType === 'form9') {
      if (!form9Validation.isValid) {
        setFeedback({
          text: `⚠️ ${form9Validation.errors[0]}`,
          type: 'error',
        });
        setSaving(false);
        return;
      }
    } else if (formType === 'form8') {
      if (!form8Validation.isValid) {
        setFeedback({
          text: `⚠️ ${form8Validation.errors[0]}`,
          type: 'error',
        });
        setSaving(false);
        return;
      }
    } else if (formType === 'form7') {
      if (!form7Validation.isValid) {
        setFeedback({
          text: `⚠️ ${form7Validation.errors[0]}`,
          type: 'error',
        });
        setSaving(false);
        return;
      }
    } else if (formType === 'form6') {
      if (!form6Validation.isValid) {
        setFeedback({
          text: `⚠️ ${form6Validation.errors[0]}`,
          type: 'error',
        });
        setSaving(false);
        return;
      }
    } else if (formType === 'form5') {
      if (!form5Validation.isValid) {
        setFeedback({
          text: `⚠️ ${form5Validation.errors[0]}`,
          type: 'error',
        });
        setSaving(false);
        return;
      }
    } else if (formType === 'form3') {
      if (!form3Validation.isValid) {
        setFeedback({
          text: `⚠️ ${form3Validation.errors[0]}`,
          type: 'error',
        });
        setSaving(false);
        return;
      }
    } else if (formType === 'form2') {
      if (!form2Validation.isValid) {
        setFeedback({
          text: `⚠️ ${form2Validation.errors[0]}. ${t('proforma.form2.validation.fixNotice', "Please correct highlighted fields or click 'Auto-Balance All Units' before saving.")}`,
          type: 'error',
        });
        setSaving(false);
        return;
      }
    } else if (formType === 'form4') {
      if (form4ExecInvalid) {
        setFeedback({
          text: `⚠️ Executive Meeting Error: Total Slots (${form4ExecSlots}) ≠ Present (${form4ExecPres}) + Absent (${form4ExecAbs}) + Leave (${form4ExecLeave}) = ${form4ExecSum}. Please click '⚡ Auto-Balance' or adjust numbers.`,
          type: 'error',
        });
        setSaving(false);
        return;
      }
      if (form4GbInvalid) {
        setFeedback({
          text: `⚠️ General Body Meeting Error: Total Membership (${form4GbMembers}) ≠ Present (${form4GbPres}) + Absent (${form4GbAbs}) + Leave (${form4GbLeave}) = ${form4GbSum}. Please click '⚡ Auto-Balance' or adjust numbers.`,
          type: 'error',
        });
        setSaving(false);
        return;
      }
      if (form4PsoInvalid) {
        setFeedback({
          text: `⚠️ PSO Attendance Error: Present (${form4PsoPres}) cannot exceed PSO Membership (${form4PsoMembers}).`,
          type: 'error',
        });
        setSaving(false);
        return;
      }
    } else {
      if (execAttendanceInvalid) {
        setFeedback({
          text: `⚠️ Executive Meeting Error: Present (${execPres}) + Absent (${execAbs}) + Leave (${execLeave}) = ${execSum}, which exceeds Total Members (${execTotal}). Please correct before saving.`,
          type: 'error',
        });
        setSaving(false);
        return;
      }
      if (commAttendanceInvalid) {
        setFeedback({
          text: `⚠️ Committee Meeting Error: Present (${commPres}) + Absent (${commAbs}) + Leave (${commLeave}) = ${commSum}, which exceeds Total Members (${commTotal}). Please correct before saving.`,
          type: 'error',
        });
        setSaving(false);
        return;
      }
    }

    try {
      await saveReportData('SUBMITTED');
      setFeedback({ text: t('proforma.savedSuccess', 'Report officially saved & stored in database successfully!'), type: 'success' });
      setTimeout(() => setFeedback((prev) => (prev.type === 'success' ? { text: '', type: '' } : prev)), 4000);
    } catch (e) {
      setFeedback({ text: errorMessage(e), type: 'error' });
    } finally {
      setSaving(false);
    }
  }

  // Revert / Reset current month's report back to baseline
  async function handleResetReport() {
    if (!targetId) return;
    const confirmed = window.confirm(
      t('proforma.confirmReset', 'Are you sure you want to revert this report to a fresh draft? Any saved edits will be removed.')
    );
    if (!confirmed) return;

    setResetting(true);
    try {
      await api.post('/proforma/reset', {
        formType,
        year: parseInt(year, 10),
        month: parseInt(month, 10),
        unitId: targetId,
        areaId: (formType === 'form5' || formType === 'form6' || formType === 'form7' || formType === 'form8') ? undefined : effectiveAreaId,
        provinceId: formType === 'form5' ? effectiveProvinceId : undefined,
        districtId: (formType === 'form6' || formType === 'form7' || formType === 'form8') ? effectiveDistrictId : undefined,
      });
      setFeedback({
        text: t('proforma.resetSuccess', 'Report reverted to draft successfully.'),
        type: 'info',
      });
      await loadData(false);
    } catch (err) {
      setFeedback({ text: errorMessage(err), type: 'error' });
    } finally {
      setResetting(false);
    }
  }

  // Live Print Preview: Saves latest in-memory data as DRAFT so preview matches without marking as officially submitted
  async function handleOpenPreview() {
    setPreviewLoading(true);
    setPreviewOpen(true);
    try {
      try {
        const isAlreadySubmitted = Boolean(statusDoc?.exists && statusDoc?.metadata?.status === 'SUBMITTED');
        await saveReportData(isAlreadySubmitted ? 'SUBMITTED' : 'DRAFT');
      } catch (saveErr) {
        console.warn('Auto-save before preview notice:', saveErr);
      }

      const q = new URLSearchParams({
        year: String(year),
        month: String(month),
        ...(formType === 'form9'
          ? { districtId: effectiveDistrictId || undefined, areaId: effectiveAreaId || undefined }
          : (formType === 'form8' || formType === 'form7')
          ? { districtId: effectiveDistrictId }
          : formType === 'form6'
          ? { districtId: effectiveDistrictId, m1: formData.m1 || '', m2: formData.m2 || '', m3: formData.m3 || '' }
          : formType === 'form5'
          ? { provinceId: effectiveProvinceId, fromDate: formData.fromDate || '', toDate: formData.toDate || '' }
          : (formType === 'form4' ? { unitId: targetId } : { areaId: effectiveAreaId })),
      });

      const endpoint = formType === 'form9'
        ? '/api/exports/proforma/form9/html'
        : formType === 'form8'
        ? '/api/exports/proforma/form8/html'
        : formType === 'form7'
        ? '/api/exports/proforma/form7/html'
        : formType === 'form6'
        ? '/api/exports/proforma/form6/html'
        : formType === 'form5'
        ? '/api/exports/proforma/form5/html'
        : (formType === 'form4'
          ? '/api/exports/proforma/form4/html'
          : (formType === 'form3'
            ? '/api/exports/proforma/form3/html'
            : (formType === 'form2' ? '/api/exports/proforma/form2/html' : '/api/exports/proforma/form1/html')));

      const res = await fetch(`${endpoint}?${q.toString()}`, {
        headers: { Authorization: `Bearer ${localStorage.getItem('pnap_token')}` },
      });
      if (!res.ok) {
        let errDetail = '';
        try {
          const errJson = await res.json();
          if (errJson.error && typeof errJson.error === 'object') {
            errDetail = errJson.error.message || errJson.error.code || '';
          } else if (typeof errJson.error === 'string') {
            errDetail = errJson.error;
          } else if (typeof errJson.message === 'string') {
            errDetail = errJson.message;
          }
        } catch {
          try {
            errDetail = await res.text();
          } catch {
            errDetail = '';
          }
        }
        throw new Error(errDetail || `Preview request failed with status ${res.status}`);
      }
      const html = await res.text();
      setPreviewHtml(html);
    } catch (e) {
      setPreviewHtml(`<div style="color:red;padding:20px;">${e.message}</div>`);
    } finally {
      setPreviewLoading(false);
    }
  }

  // Export Downloads: Saves latest in-memory data as DRAFT so PDF/Excel matches without submitting
  async function handleDownload(format) {
    try {
      setFeedback({ text: t('proforma.preparingExport', 'Saving and preparing export...'), type: 'info' });
      try {
        const isAlreadySubmitted = Boolean(statusDoc?.exists && statusDoc?.metadata?.status === 'SUBMITTED');
        await saveReportData(isAlreadySubmitted ? 'SUBMITTED' : 'DRAFT');
      } catch (saveErr) {
        console.warn('Auto-save before download notice:', saveErr);
      }

      const q = new URLSearchParams({
        year: String(year),
        month: String(month),
        ...(formType === 'form9'
          ? { districtId: effectiveDistrictId || undefined, areaId: effectiveAreaId || undefined }
          : (formType === 'form8' || formType === 'form7')
          ? { districtId: effectiveDistrictId }
          : formType === 'form6'
          ? { districtId: effectiveDistrictId, m1: formData.m1 || '', m2: formData.m2 || '', m3: formData.m3 || '' }
          : formType === 'form5'
          ? { provinceId: effectiveProvinceId, fromDate: formData.fromDate || '', toDate: formData.toDate || '' }
          : (formType === 'form4' ? { unitId: targetId } : { areaId: effectiveAreaId })),
      });

      const endpoint = formType === 'form9'
        ? `/api/exports/proforma/form9/${format}`
        : formType === 'form8'
        ? `/api/exports/proforma/form8/${format}`
        : formType === 'form7'
        ? `/api/exports/proforma/form7/${format}`
        : formType === 'form6'
        ? `/api/exports/proforma/form6/${format}`
        : formType === 'form5'
        ? `/api/exports/proforma/form5/${format}`
        : (formType === 'form4'
          ? `/api/exports/proforma/form4/${format}`
          : (formType === 'form3'
            ? `/api/exports/proforma/form3/${format}`
            : (formType === 'form2' ? `/api/exports/proforma/form2/${format}` : `/api/exports/proforma/form1/${format}`)));

      const filename = `proforma-${formType}-${year}-${month}.${format}`;
      await downloadAuthed(`${endpoint}?${q.toString()}`, filename);
      setFeedback({ text: t('proforma.downloadSuccess', 'Download complete!'), type: 'success' });
    } catch (e) {
      alert(`Export failed: ${e.message}`);
      setFeedback({ text: e.message, type: 'error' });
    }
  }

  const monthsList = [
    { val: 1, name: '1 - January (جنوري)' },
    { val: 2, name: '2 - February (فبروري)' },
    { val: 3, name: '3 - March (مارچ)' },
    { val: 4, name: '4 - April (اپريل)' },
    { val: 5, name: '5 - May (مۍ)' },
    { val: 6, name: '6 - June (جون)' },
    { val: 7, name: '7 - July (جولای)' },
    { val: 8, name: '8 - August (اګست)' },
    { val: 9, name: '9 - September (سپتمبر)' },
    { val: 10, name: '10 - October (اکتوبر)' },
    { val: 11, name: '11 - November (نومبر)' },
    { val: 12, name: '12 - December (دسمبر)' },
  ];

  return (
    <div className="proforma-page" style={{ maxWidth: 1280, margin: '0 auto', paddingBottom: 40 }}>
      <style>{`
        /* Responsive Proforma Layout */
        .proforma-page {
          width: 100%;
          max-width: 1280px;
          margin: 0 auto;
          box-sizing: border-box;
        }
        .proforma-form-tabs {
          display: flex;
          gap: 8px;
          overflow-x: auto;
          flex-wrap: nowrap;
          -webkit-overflow-scrolling: touch;
          padding: 4px 2px 14px;
          margin-bottom: 16px;
          border-bottom: 1px solid var(--border);
          scrollbar-width: thin;
        }
        .proforma-form-tabs::-webkit-scrollbar {
          height: 6px;
        }
        .proforma-form-tabs::-webkit-scrollbar-track {
          background: var(--surface-alt, #f1f5f9);
          border-radius: 4px;
        }
        .proforma-form-tabs::-webkit-scrollbar-thumb {
          background: var(--border-strong, #cbd5e1);
          border-radius: 4px;
        }
        .proforma-form-tab-btn {
          display: inline-flex;
          align-items: center;
          gap: 8px;
          padding: 8px 14px;
          border-radius: var(--radius, 10px);
          font-size: 13px;
          font-weight: 600;
          white-space: nowrap;
          flex-shrink: 0;
          transition: all var(--t, 0.2s ease);
          cursor: pointer;
          border: 1px solid var(--border, #e2e8f0);
          background: var(--surface, #ffffff);
          color: var(--text-soft, #334155);
          box-shadow: 0 1px 2px rgba(0, 0, 0, 0.04);
        }
        .proforma-form-tab-btn:hover {
          background: var(--surface-alt, #f1f5f9);
          color: var(--text, #0f172a);
          border-color: var(--border-strong, #cbd5e1);
          transform: translateY(-1px);
        }
        .proforma-form-tab-btn.active {
          background: var(--primary, #1e40af);
          color: #ffffff;
          border-color: var(--primary, #1e40af);
          box-shadow: 0 3px 8px rgba(30, 64, 175, 0.28);
          font-weight: 700;
        }
        .proforma-tab-icon {
          font-size: 15px;
          line-height: 1;
          display: inline-flex;
          align-items: center;
          justify-content: center;
        }
        .proforma-tab-label {
          display: inline-flex;
          align-items: center;
          line-height: 1.4;
        }
        .proforma-subtabs-bar {
          display: flex;
          gap: 8px;
          overflow-x: auto;
          flex-wrap: nowrap;
          -webkit-overflow-scrolling: touch;
          border-bottom: 2px solid var(--border);
          margin-bottom: 16px;
          padding-bottom: 2px;
          scrollbar-width: thin;
        }
        .proforma-subtabs-bar::-webkit-scrollbar {
          height: 4px;
        }
        .proforma-subtabs-bar::-webkit-scrollbar-thumb {
          background: var(--border);
          border-radius: 4px;
        }
        .proforma-subtabs-bar button {
          flex-shrink: 0;
          white-space: nowrap;
        }
        .proforma-filter-row {
          display: flex;
          justify-content: space-between;
          align-items: center;
          flex-wrap: wrap;
          gap: 14px;
        }
        .proforma-period-group {
          display: flex;
          align-items: center;
          gap: 12px;
          flex-wrap: wrap;
        }
        .proforma-action-buttons {
          display: flex;
          align-items: center;
          gap: 8px;
          flex-wrap: wrap;
        }
        .proforma-kpi-grid {
          display: grid;
          grid-template-columns: repeat(auto-fit, minmax(min(170px, 100%), 1fr));
          gap: 12px;
        }
        .proforma-card-subgrid {
          display: grid;
          grid-template-columns: repeat(auto-fit, minmax(min(280px, 100%), 1fr));
          gap: 12px;
        }
        @media (max-width: 900px) {
          .proforma-filter-row {
            flex-direction: column;
            align-items: stretch;
          }
          .proforma-period-group {
            width: 100%;
          }
          .proforma-action-buttons {
            width: 100%;
          }
          .proforma-action-buttons button {
            flex: 1 1 calc(33.333% - 8px);
            justify-content: center;
            text-align: center;
          }
        }
        @media (max-width: 768px) {
          .proforma-page {
            padding-left: 8px;
            padding-right: 8px;
          }
          .proforma-period-group {
            display: grid !important;
            grid-template-columns: 1fr 1fr;
            gap: 10px;
          }
          .proforma-period-group select,
          .proforma-period-group input {
            width: 100% !important;
            min-width: 0 !important;
            box-sizing: border-box;
          }
          .proforma-action-buttons {
            display: grid !important;
            grid-template-columns: 1fr 1fr;
            gap: 8px;
          }
          .proforma-action-buttons button {
            width: 100% !important;
            font-size: 12px !important;
            padding: 8px 6px !important;
          }
          .proforma-kpi-grid {
            grid-template-columns: repeat(2, 1fr) !important;
          }
          .proforma-form5-toolbar {
            flex-direction: column !important;
            align-items: stretch !important;
          }
          .proforma-form5-toolbar > div {
            width: 100% !important;
            flex-direction: column !important;
            align-items: stretch !important;
          }
          .proforma-form5-toolbar input {
            width: 100% !important;
            min-width: 0 !important;
            box-sizing: border-box;
          }
          .proforma-form5-toolbar-actions {
            display: grid !important;
            grid-template-columns: 1fr 1fr;
            gap: 8px;
            width: 100%;
          }
          .proforma-card-subgrid {
            grid-template-columns: 1fr !important;
          }
        }
        @media (max-width: 480px) {
          .proforma-period-group {
            grid-template-columns: 1fr !important;
          }
          .proforma-action-buttons {
            grid-template-columns: 1fr !important;
          }
          .proforma-kpi-grid {
            grid-template-columns: 1fr !important;
          }
          .proforma-form5-toolbar-actions {
            grid-template-columns: 1fr !important;
          }
        }
      `}</style>
      {/* Standard Page Header */}
      <div className="page-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: 12, marginBottom: 16 }}>
        <div>
          <h2 style={{ margin: 0, display: 'flex', alignItems: 'center', gap: 8 }}>
            <span>{currentFormConfig.icon}</span>
            <span>{t(currentFormConfig.titleKey, currentFormConfig.defaultTitle)}</span>
          </h2>
          <p className="muted" style={{ margin: '4px 0 0' }}>
            {t(currentFormConfig.descKey, currentFormConfig.defaultDesc)} · <strong>{activeUnitDisplayName}</strong>
          </p>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <button
            type="button"
            className="btn secondary"
            style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13 }}
            onClick={() => setShowUnitSwitcher((v) => !v)}
          >
            <span>🔄</span>
            <span>{showUnitSwitcher ? t('reports.hideUnitSwitcher', 'Hide Unit Switcher') : t('reports.switchUnitContext', 'Switch Unit Context')}</span>
          </button>
        </div>
      </div>

      {/* Unit Switcher Collapsible Card */}
      {showUnitSwitcher && (
        <div style={{ marginBottom: 16 }}>
          <UnitSwitcher onClose={() => setShowUnitSwitcher(false)} />
        </div>
      )}

      {/* Scope, Month & Year Filter Card */}
      <div className="card" style={{ marginBottom: 16 }}>
        {/* Form Selector Tabs */}
        <div className="proforma-form-tabs" role="tablist">
          {allowedForms.map((form) => {
            const isActive = formType === form.id;
            return (
              <button
                key={form.id}
                type="button"
                role="tab"
                aria-selected={isActive}
                onClick={() => {
                  setFormType(form.id);
                  setActiveTab(form.defaultTab);
                }}
                className={`proforma-form-tab-btn ${isActive ? 'active' : ''}`}
              >
                <span className="proforma-tab-icon">{form.icon}</span>
                <span className="proforma-tab-label">{t(form.btnKey, form.defaultBtnLabel)}</span>
              </button>
            );
          })}
        </div>

        <div className="proforma-filter-row">
          {/* Period Selectors */}
          <div className="proforma-period-group">
            <div>
              <label style={{ display: 'block', fontWeight: 600, marginBottom: 4, fontSize: 13 }}>
                {t('proforma.month', 'Month')}
              </label>
              <select
                value={month}
                onChange={(e) => setMonth(parseInt(e.target.value, 10))}
                style={{ minWidth: 180, fontWeight: 600 }}
              >
                {monthsList.map((m) => (
                  <option key={m.val} value={m.val}>{m.name}</option>
                ))}
              </select>
            </div>

            <div>
              <label style={{ display: 'block', fontWeight: 600, marginBottom: 4, fontSize: 13 }}>
                {t('proforma.year', 'Year')}
              </label>
              <select
                value={year}
                onChange={(e) => setYear(parseInt(e.target.value, 10))}
                style={{ minWidth: 100, fontWeight: 600 }}
              >
                {[2024, 2025, 2026, 2027, 2028].map((y) => (
                  <option key={y} value={y}>{y}</option>
                ))}
              </select>
            </div>

            {/* Target Unit Context Selector */}
            {formType === 'form7' || formType === 'form8' || formType === 'form9' ? (
              <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
                <div>
                  <label style={{ display: 'block', fontWeight: 600, marginBottom: 4, fontSize: 13 }}>
                    {t('proforma.district', 'District')}
                  </label>
                  {ctx?.unitLevel === 'DISTRICT' ? (
                    <div style={{ padding: '7px 14px', background: 'var(--surface-alt)', border: '1px solid var(--border)', borderRadius: 'var(--radius)', fontWeight: 600, fontSize: 13 }}>
                      🏛️ {ctx?.unitName || 'Current District'}
                    </div>
                  ) : (
                    <select
                      value={selectedDistrictId}
                      onChange={(e) => setSelectedDistrictId(e.target.value)}
                      style={{ minWidth: 180, fontWeight: 600 }}
                    >
                      {districtsList.length === 0 ? (
                        <option value="">{t('proforma.noDistrictsFound', '(No Districts Found)')}</option>
                      ) : (
                        districtsList.map((d) => (
                          <option key={d._id} value={d._id}>{d.name}</option>
                        ))
                      )}
                    </select>
                  )}
                </div>
              </div>
            ) : formType === 'form6' ? (
              <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
                <div>
                  <label style={{ display: 'block', fontWeight: 600, marginBottom: 4, fontSize: 13 }}>
                    {t('proforma.district', 'District')}
                  </label>
                  {ctx?.unitLevel === 'DISTRICT' ? (
                    <div style={{ padding: '7px 14px', background: 'var(--surface-alt)', border: '1px solid var(--border)', borderRadius: 'var(--radius)', fontWeight: 600, fontSize: 13 }}>
                      🏛️ {ctx?.unitName || 'Current District'}
                    </div>
                  ) : (
                    <select
                      value={selectedDistrictId}
                      onChange={(e) => setSelectedDistrictId(e.target.value)}
                      style={{ minWidth: 180, fontWeight: 600 }}
                    >
                      {districtsList.length === 0 ? (
                        <option value="">{t('proforma.noDistrictsFound', '(No Districts Found)')}</option>
                      ) : (
                        districtsList.map((d) => (
                          <option key={d._id} value={d._id}>{d.name}</option>
                        ))
                      )}
                    </select>
                  )}
                </div>
                <div>
                  <label
                    style={{ display: 'block', fontWeight: 600, marginBottom: 4, fontSize: 13 }}
                    title="Official printed paper header: دريومياشتو رپورټ: ۱: [...] ۲: [...] ۳: [...]"
                  >
                    📅 {t('proforma.form6.quarterlyCycle', '3-Month Quarterly Report (د دريو مياشتو رپورټ)')}
                  </label>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6, background: 'var(--surface-alt)', padding: '4px 8px', borderRadius: 'var(--radius)', border: '1px solid var(--border)' }}>
                    <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-soft)' }}>۱:</span>
                    <input
                      type="text"
                      value={formData.m1 !== undefined ? formData.m1 : ''}
                      onChange={(e) => updateField('m1', e.target.value)}
                      placeholder={t('proforma.form6.month1Placeholder', 'Month 1')}
                      title="Month 1 (د دريو مياشتو لومړۍ مياشت)"
                      style={{ width: 80, padding: '5px 8px', fontSize: 12, borderRadius: 'var(--radius)', fontWeight: 600, textAlign: 'center' }}
                    />
                    <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-soft)' }}>۲:</span>
                    <input
                      type="text"
                      value={formData.m2 !== undefined ? formData.m2 : ''}
                      onChange={(e) => updateField('m2', e.target.value)}
                      placeholder={t('proforma.form6.month2Placeholder', 'Month 2')}
                      title="Month 2 (دويمه مياشت)"
                      style={{ width: 80, padding: '5px 8px', fontSize: 12, borderRadius: 'var(--radius)', fontWeight: 600, textAlign: 'center' }}
                    />
                    <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-soft)' }}>۳:</span>
                    <input
                      type="text"
                      value={formData.m3 !== undefined ? formData.m3 : ''}
                      onChange={(e) => updateField('m3', e.target.value)}
                      placeholder={t('proforma.form6.month3Placeholder', 'Month 3')}
                      title="Month 3 (دريمه مياشت)"
                      style={{ width: 80, padding: '5px 8px', fontSize: 12, borderRadius: 'var(--radius)', fontWeight: 600, textAlign: 'center' }}
                    />
                  </div>
                </div>
              </div>
            ) : formType === 'form5' ? (
              <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
                <div>
                  <label style={{ display: 'block', fontWeight: 600, marginBottom: 4, fontSize: 13 }}>
                    {t('proforma.province', 'Province')}
                  </label>
                  {ctx?.unitLevel === 'PROVINCE' ? (
                    <div style={{ padding: '7px 14px', background: 'var(--surface-alt)', border: '1px solid var(--border)', borderRadius: 'var(--radius)', fontWeight: 600, fontSize: 13 }}>
                      🏛️ {ctx?.unitName || 'Current Province'}
                    </div>
                  ) : (
                    <select
                      value={selectedProvinceId}
                      onChange={(e) => setSelectedProvinceId(e.target.value)}
                      style={{ minWidth: 180, fontWeight: 600 }}
                    >
                      {provincesList.length === 0 ? (
                        <option value="">{t('proforma.noProvincesFound', '(No Provinces Found)')}</option>
                      ) : (
                        provincesList.map((p) => (
                          <option key={p._id} value={p._id}>{p.name}</option>
                        ))
                      )}
                    </select>
                  )}
                </div>
                <div>
                  <label style={{ display: 'block', fontWeight: 600, marginBottom: 4, fontSize: 13 }}>
                    {t('proforma.form5.fromDate', 'From Date')}
                  </label>
                  <input
                    type="text"
                    value={formData.fromDate || `01/${String(month).padStart(2, '0')}`}
                    onChange={(e) => updateField('fromDate', e.target.value)}
                    placeholder="DD/MM"
                    style={{ width: 100, padding: '7px 10px', fontSize: 13, borderRadius: 'var(--radius)', fontWeight: 600, textAlign: 'center' }}
                  />
                </div>
                <div>
                  <label style={{ display: 'block', fontWeight: 600, marginBottom: 4, fontSize: 13 }}>
                    {t('proforma.form5.toDate', 'To Date')}
                  </label>
                  <input
                    type="text"
                    value={formData.toDate || `${new Date(parseInt(year, 10), parseInt(month, 10), 0).getDate()}/${String(month).padStart(2, '0')}`}
                    onChange={(e) => updateField('toDate', e.target.value)}
                    placeholder="DD/MM"
                    style={{ width: 100, padding: '7px 10px', fontSize: 13, borderRadius: 'var(--radius)', fontWeight: 600, textAlign: 'center' }}
                  />
                </div>
              </div>
            ) : formType === 'form4' ? (
              ctx?.unitLevel === 'BASIC_UNIT' ? (
                <div>
                  <label style={{ display: 'block', fontWeight: 600, marginBottom: 4, fontSize: 13 }}>
                    {t('proforma.basicUnit', 'Basic Unit')}
                  </label>
                  <div style={{ padding: '7px 14px', background: 'var(--surface-alt)', border: '1px solid var(--border)', borderRadius: 'var(--radius)', fontWeight: 600, fontSize: 13 }}>
                    🏢 {ctx?.unitName || 'Current Unit'}
                  </div>
                </div>
              ) : (
                <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
                  {ctx?.unitLevel !== 'AREA' && areasList.length > 0 && (
                    <div>
                      <label style={{ display: 'block', fontWeight: 600, marginBottom: 4, fontSize: 13 }}>
                        {t('proforma.areaUnit', 'Area Unit')}
                      </label>
                      <select
                        value={selectedAreaId}
                        onChange={(e) => setSelectedAreaId(e.target.value)}
                        style={{ minWidth: 160, fontWeight: 600 }}
                      >
                        {areasList.map((a) => (
                          <option key={a._id} value={a._id}>{a.name}</option>
                        ))}
                      </select>
                    </div>
                  )}
                  <div>
                    <label style={{ display: 'block', fontWeight: 600, marginBottom: 4, fontSize: 13 }}>
                      {t('proforma.selectBasicUnit', 'Select Basic Unit')}
                    </label>
                    <select
                      value={selectedUnitId}
                      onChange={(e) => setSelectedUnitId(e.target.value)}
                      style={{ minWidth: 190, fontWeight: 600 }}
                    >
                      {basicUnitsList.length === 0 ? (
                        <option value="">{t('proforma.noBasicUnitsFound', '(No Basic Units in Area)')}</option>
                      ) : (
                        basicUnitsList.map((bu) => (
                          <option key={bu._id} value={bu._id}>{bu.name}</option>
                        ))
                      )}
                    </select>
                  </div>
                </div>
              )
            ) : (
              /* Forms 1, 2, 3 (Area Unit Reports) */
              <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
                {ctx?.unitLevel !== 'AREA' && ctx?.unitLevel !== 'BASIC_UNIT' ? (
                  <>
                    {(homeTier === 'CENTRAL' || homeTier === 'PROVINCE') && (
                      <div>
                        <label style={{ display: 'block', fontWeight: 600, marginBottom: 4, fontSize: 13 }}>
                          {t('proforma.district', 'District')}
                        </label>
                        <select
                          value={selectedDistrictId}
                          onChange={(e) => setSelectedDistrictId(e.target.value)}
                          style={{ minWidth: 160, fontWeight: 600 }}
                        >
                          {districtsList.map((d) => (
                            <option key={d._id} value={d._id}>{d.name}</option>
                          ))}
                        </select>
                      </div>
                    )}
                    {(homeTier === 'DISTRICT' || ctx?.unitLevel === 'DISTRICT') && (
                      <div>
                        <label style={{ display: 'block', fontWeight: 600, marginBottom: 4, fontSize: 13 }}>
                          {t('proforma.district', 'District')}
                        </label>
                        <div style={{ padding: '7px 14px', background: 'var(--surface-alt)', border: '1px solid var(--border)', borderRadius: 'var(--radius)', fontWeight: 600, fontSize: 13 }}>
                          🏛️ {ctx?.unitName || 'Current District'}
                        </div>
                      </div>
                    )}
                    <div>
                      <label style={{ display: 'block', fontWeight: 600, marginBottom: 4, fontSize: 13 }}>
                        {t('proforma.areaUnit', 'Area Unit')}
                      </label>
                      <select
                        value={selectedAreaId}
                        onChange={(e) => setSelectedAreaId(e.target.value)}
                        style={{ minWidth: 180, fontWeight: 600 }}
                      >
                        {areasList.length === 0 ? (
                          <option value="">{t('proforma.noAreasFound', '(No Areas Found in District)')}</option>
                        ) : (
                          areasList.map((a) => (
                            <option key={a._id} value={a._id}>{a.name}</option>
                          ))
                        )}
                      </select>
                    </div>
                  </>
                ) : (
                  <div>
                    <label style={{ display: 'block', fontWeight: 600, marginBottom: 4, fontSize: 13 }}>
                      {t('proforma.areaUnit', 'Area Unit')}
                    </label>
                    <div style={{ padding: '7px 14px', background: 'var(--surface-alt)', border: '1px solid var(--border)', borderRadius: 'var(--radius)', fontWeight: 600, fontSize: 13 }}>
                      🏢 {ctx?.unitName || 'Current Area'}
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>


          {/* Action Buttons */}
          <div className="proforma-action-buttons">
            <button
              type="button"
              className="btn"
              onClick={handleSave}
              disabled={saving}
              style={{ background: '#16a34a', borderColor: '#16a34a', fontWeight: 700 }}
            >
              {saving ? t('proforma.saving', 'Saving...') : `💾 ${t('proforma.saveSubmit', 'Save to Database')}`}
            </button>

            <button
              type="button"
              className="btn secondary"
              onClick={() => setShowAutofillModal(true)}
              disabled={loading}
              title={t('proforma.autofillBtn', 'Auto-fill from System')}
            >
              🔄 {t('proforma.autofillBtn', 'Auto-fill from System')}
            </button>

            <button
              type="button"
              className="btn secondary"
              onClick={handleOpenPreview}
              style={{ borderColor: '#0284c7', color: '#38bdf8' }}
            >
              🖨️ {t('proforma.previewBtn', 'Print / Preview')}
            </button>

            <button
              type="button"
              className="btn secondary"
              onClick={() => handleDownload('pdf')}
            >
              📄 {t('proforma.downloadPdf', 'Download PDF')}
            </button>

            <button
              type="button"
              className="btn secondary"
              onClick={() => handleDownload('xlsx')}
            >
              📊 {t('proforma.downloadExcel', 'Download Excel')}
            </button>
          </div>
        </div>

        {/* Database Stored Status Banner */}
        {(() => {
          const isSubmitted = Boolean(statusDoc?.exists && statusDoc?.metadata?.status === 'SUBMITTED');
          const isDraftSaved = Boolean(statusDoc?.report && statusDoc?.metadata?.status === 'DRAFT');

          return (
            <div
              className="proforma-status-banner"
              style={{
                marginTop: 14,
                padding: '10px 14px',
                borderRadius: 8,
                background: isSubmitted ? 'rgba(34, 197, 94, 0.1)' : (isDraftSaved ? 'rgba(56, 189, 248, 0.1)' : 'rgba(234, 179, 8, 0.1)'),
                border: `1.5px solid ${isSubmitted ? '#22c55e' : (isDraftSaved ? '#38bdf8' : '#eab308')}`,
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                flexWrap: 'wrap',
                gap: 10,
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <span style={{ fontSize: 20 }}>{isSubmitted ? '✅' : (isDraftSaved ? '💾' : '📝')}</span>
                <div>
                  <div style={{ fontWeight: 700, fontSize: 13, color: isSubmitted ? '#22c55e' : (isDraftSaved ? '#38bdf8' : '#eab308') }}>
                    {isSubmitted
                      ? t('proforma.statusSaved', 'Report Officially Stored in Database')
                      : (isDraftSaved
                        ? t('proforma.statusDraftSaved', 'Draft Saved (Not Officially Submitted Yet)')
                        : t('proforma.statusDraft', 'Draft - Not Submitted Yet'))}
                  </div>
                  {isSubmitted && statusDoc?.metadata?.submittedByName && (
                    <div style={{ fontSize: 12, color: 'var(--text-soft)', marginTop: 2 }}>
                      {t('proforma.submittedBy', 'Submitted by')}: <strong>{statusDoc.metadata.submittedByName}</strong> ({statusDoc.metadata.submittedByRole}) · {statusDoc.metadata.submittedAt ? new Date(statusDoc.metadata.submittedAt).toLocaleDateString() : ''}
                    </div>
                  )}
                  {isDraftSaved && (
                    <div style={{ fontSize: 12, color: 'var(--text-soft)', marginTop: 2 }}>
                      {t('proforma.draftNotice', 'Unsubmitted working draft. Click "Save to Database" to officially file.')}
                    </div>
                  )}
                </div>
              </div>

              <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
                {(isSubmitted || isDraftSaved) && (
                  <button
                    type="button"
                    onClick={handleResetReport}
                    disabled={resetting}
                    style={{
                      padding: '4px 10px',
                      fontSize: 12,
                      fontWeight: 600,
                      borderRadius: 6,
                      background: 'rgba(239, 68, 68, 0.12)',
                      color: '#ef4444',
                      border: '1px solid rgba(239, 68, 68, 0.3)',
                      cursor: resetting ? 'not-allowed' : 'pointer',
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: 4,
                    }}
                    title={t('proforma.revertToDraft', 'Revert to Draft')}
                  >
                    ↺ {resetting ? t('proforma.resetting', 'Reverting...') : t('proforma.revertToDraft', 'Revert to Draft')}
                  </button>
                )}

                <div style={{ fontSize: 12, color: 'var(--text-soft)' }}>
                  {t(currentFormConfig.titleKey, currentFormConfig.defaultTitle)}
                </div>
              </div>
            </div>
          );
        })()}

        {feedback.text && (!statusDoc?.exists || feedback.type !== 'success') && (
          <div className={`alert ${feedback.type === 'success' ? 'good' : (feedback.type === 'error' ? 'error' : 'info')}`} style={{ marginTop: 12 }}>
            {feedback.text}
          </div>
        )}
      </div>

      {/* Tabs Navigation */}
      {formType === 'form3' ? (
        <div className="proforma-subtabs-bar">
          <button
            type="button"
            onClick={() => setActiveTab('form3_tab1')}
            className={`btn ${activeTab === 'form3_tab1' ? '' : 'secondary'}`}
            style={{
              borderRadius: '8px 8px 0 0',
              padding: '10px 18px',
              fontWeight: 700,
              whiteSpace: 'nowrap',
              borderBottom: activeTab === 'form3_tab1' ? '2px solid var(--primary, #38bdf8)' : 'none',
            }}
          >
            🏢 {t('proforma.form3.tab1', '1. Inactive Units & Committee Members')}
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('form3_tab2')}
            className={`btn ${activeTab === 'form3_tab2' ? '' : 'secondary'}`}
            style={{
              borderRadius: '8px 8px 0 0',
              padding: '10px 18px',
              fontWeight: 700,
              whiteSpace: 'nowrap',
              borderBottom: activeTab === 'form3_tab2' ? '2px solid var(--primary, #38bdf8)' : 'none',
            }}
          >
            📢 {t('proforma.form3.tab2', '2. Public Gatherings & Education')}
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('form3_tab3')}
            className={`btn ${activeTab === 'form3_tab3' ? '' : 'secondary'}`}
            style={{
              borderRadius: '8px 8px 0 0',
              padding: '10px 18px',
              fontWeight: 700,
              whiteSpace: 'nowrap',
              borderBottom: activeTab === 'form3_tab3' ? '2px solid var(--primary, #38bdf8)' : 'none',
            }}
          >
            ⚖️ {t('proforma.form3.tab3', '3. Discipline, Blood Bank & Proposals')}
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('form3_tab4')}
            className={`btn ${activeTab === 'form3_tab4' ? '' : 'secondary'}`}
            style={{
              borderRadius: '8px 8px 0 0',
              padding: '10px 18px',
              fontWeight: 700,
              whiteSpace: 'nowrap',
              borderBottom: activeTab === 'form3_tab4' ? '2px solid var(--primary, #38bdf8)' : 'none',
            }}
          >
            ✍️ {t('proforma.form3.tab4', '4. Office Activity & Signatures')}
          </button>
        </div>
      ) : (
        <div className="proforma-subtabs-bar">
          <button
            type="button"
            onClick={() => setActiveTab('upper')}
            className={`btn ${activeTab === 'upper' ? '' : 'secondary'}`}
            style={{
              borderRadius: '8px 8px 0 0',
              padding: '10px 18px',
              fontWeight: 700,
              borderBottom: activeTab === 'upper' ? '2px solid var(--primary, #38bdf8)' : 'none',
            }}
          >
            📊 {formType === 'form9'
              ? t('proforma.form9.tabSec1', '1. Members Activity Roster')
              : formType === 'form8'
              ? t('proforma.form8.tabRoster', '1. Committee Members Activity Roster')
              : formType === 'form7'
              ? t('proforma.form7.tabUnits', '1. Area Units Performance & Activity')
              : formType === 'form6'
              ? t('proforma.form6.tabUpper', '1. District Summary & Subordinate Metrics')
              : formType === 'form5'
              ? t('proforma.form5.tabRoster', '1. Provincial Executive Comrades Activity')
              : formType === 'form2'
              ? t('proforma.tabUnitsForm2', '1. Subordinate Basic Units Work & Activity')
              : formType === 'form4'
              ? t('proforma.tabOverviewForm4', '1. Basic Unit Summary & Metrics')
              : t('proforma.tabOverview', '1. Area Summary & Metrics')}
          </button>
          {formType !== 'form2' && formType !== 'form5' && formType !== 'form7' && formType !== 'form8' && formType !== 'form9' && (
            <button
              type="button"
              onClick={() => setActiveTab('roster')}
              className={`btn ${activeTab === 'roster' ? '' : 'secondary'}`}
              style={{
                borderRadius: '8px 8px 0 0',
                padding: '10px 18px',
                fontWeight: 700,
                borderBottom: activeTab === 'roster' ? '2px solid var(--primary, #38bdf8)' : 'none',
              }}
            >
              👥 {formType === 'form6'
                ? t('proforma.form6.tabRoster', '2. District Executive Comrades Activity')
                : formType === 'form4'
                ? t('proforma.tabRosterForm4', '2. Basic Unit Executive Activity')
                : t('proforma.tabRoster', '2. Executive Members Activity')} ({rows.length})
            </button>
          )}
          <button
            type="button"
            onClick={() => setActiveTab('notes')}
            className={`btn ${activeTab === 'notes' ? '' : 'secondary'}`}
            style={{
              borderRadius: '8px 8px 0 0',
              padding: '10px 18px',
              fontWeight: 700,
              borderBottom: activeTab === 'notes' ? '2px solid var(--primary, #38bdf8)' : 'none',
            }}
          >
            📝 {['form2', 'form5', 'form7', 'form8', 'form9'].includes(formType) ? t('proforma.tabNotes2', '2. Remarks & Observations') : t('proforma.tabNotes', '3. Remarks & Observations')}
          </button>
        </div>
      )}

      {/* ────────────────────────────────────────────────────────────────────────── */}
      {/* TAB 1: UPPER / SUMMARY METRICS & FORM WORKSPACES */}
      {/* ────────────────────────────────────────────────────────────────────────── */}
      {activeTab === 'upper' && (
        formType === 'form9' ? (
          /* FORM 9 DISTRICT CENTRAL & PROVINCIAL ORGANS MEMBERS WORKSPACE */
          <Form9Workspace
            formData={formData}
            sec1Members={formData.sec1Members || []}
            sec2PublicGatherings={formData.sec2PublicGatherings || []}
            sec3Conferences={formData.sec3Conferences || []}
            sec4BloodBank={formData.sec4BloodBank || {}}
            sec5Discipline={formData.sec5Discipline || []}
            sec6Proposals={formData.sec6Proposals || {}}
            sec7Notes={formData.sec7Notes || {}}
            activeSection={form9ActiveSection}
            setActiveSection={setForm9ActiveSection}
            form9ViewMode={form9ViewMode}
            setForm9ViewMode={setForm9ViewMode}
            form9Search={form9Search}
            setForm9Search={setForm9Search}
            updateForm9Sec1Row={updateForm9Sec1Row}
            addForm9Sec1Row={addForm9Sec1Row}
            removeForm9Sec1Row={removeForm9Sec1Row}
            handleAutoCalcForm9={handleAutoCalcForm9}
            updateForm9Sec2Row={updateForm9Sec2Row}
            addForm9Sec2Row={addForm9Sec2Row}
            removeForm9Sec2Row={removeForm9Sec2Row}
            updateForm9Sec3Row={updateForm9Sec3Row}
            addForm9Sec3Row={addForm9Sec3Row}
            removeForm9Sec3Row={removeForm9Sec3Row}
            updateForm9Sec4={updateForm9Sec4}
            updateForm9Sec5Row={updateForm9Sec5Row}
            addForm9Sec5Row={addForm9Sec5Row}
            removeForm9Sec5Row={removeForm9Sec5Row}
            updateForm9Sec6={updateForm9Sec6}
            updateForm9Sec7={updateForm9Sec7}
            isRtl={isRtl}
            t={t}
          />
        ) : formType === 'form8' ? (
          /* FORM 8 DISTRICT CENTRAL & PROVINCIAL COMMITTEE MEMBERS WORKSPACE */
          <Form8Workspace
            formData={formData}
            rows={formData.rows || []}
            form8ViewMode={form8ViewMode}
            setForm8ViewMode={setForm8ViewMode}
            form8Search={form8Search}
            setForm8Search={setForm8Search}
            updateForm8Row={updateForm8Row}
            addForm8Row={addForm8Row}
            removeForm8Row={removeForm8Row}
            handleAutoCalcAllForm8Rows={handleAutoCalcAllForm8Rows}
            handleAutoFixForm8Inconsistencies={handleAutoFixForm8Inconsistencies}
            form8Validation={form8Validation}
            isRtl={isRtl}
            t={t}
            updateField={updateField}
          />
        ) : formType === 'form7' ? (
          /* FORM 7 DISTRICT AREA UNITS MONTHLY WORKSPACE */
          <Form7Workspace
            formData={formData}
            rows={formData.rows || []}
            form7ViewMode={form7ViewMode}
            setForm7ViewMode={setForm7ViewMode}
            form7Search={form7Search}
            setForm7Search={setForm7Search}
            updateForm7Row={updateForm7Row}
            addForm7Row={addForm7Row}
            removeForm7Row={removeForm7Row}
            handleAutoCalcAllForm7Rows={handleAutoCalcAllForm7Rows}
            handleAutoFixForm7Inconsistencies={handleAutoFixForm7Inconsistencies}
            form7Validation={form7Validation}
            isRtl={isRtl}
            t={t}
            updateField={updateField}
          />
        ) : formType === 'form6' ? (
          /* FORM 6 DISTRICT SUMMARY & SUBORDINATE METRICS WORKSPACE */
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            {/* KPI Summary Cards */}
            <div className="proforma-kpi-grid">
              <div className="card" style={{ padding: '12px 16px', background: 'var(--surface-alt)', border: '1px solid var(--border)', borderRight: isRtl ? '4px solid #0284c7' : '1px solid var(--border)', borderLeft: !isRtl ? '4px solid #0284c7' : '1px solid var(--border)' }}>
                <div style={{ fontSize: 12, color: 'var(--text-soft)', fontWeight: 600 }}>{t('proforma.form6.kpiDistExec', 'District Exec Mtgs')}</div>
                <div style={{ fontSize: 22, fontWeight: 'bold', marginTop: 4 }}>
                  🏛️ {upper.distExecSlots || 0}
                </div>
              </div>

              <div className="card" style={{ padding: '12px 16px', background: 'var(--surface-alt)', border: '1px solid var(--border)', borderRight: isRtl ? '4px solid #10b981' : '1px solid var(--border)', borderLeft: !isRtl ? '4px solid #10b981' : '1px solid var(--border)' }}>
                <div style={{ fontSize: 12, color: 'var(--text-soft)', fontWeight: 600 }}>{t('proforma.form6.kpiDistComm', 'District Committee Members')}</div>
                <div style={{ fontSize: 22, fontWeight: 'bold', marginTop: 4 }}>
                  👥 {upper.distCommTotal || 0}
                </div>
              </div>

              <div className="card" style={{ padding: '12px 16px', background: 'var(--surface-alt)', border: '1px solid var(--border)', borderRight: isRtl ? '4px solid #8b5cf6' : '1px solid var(--border)', borderLeft: !isRtl ? '4px solid #8b5cf6' : '1px solid var(--border)' }}>
                <div style={{ fontSize: 12, color: 'var(--text-soft)', fontWeight: 600 }}>{t('proforma.form6.kpiAreaUnits', 'Area Units (Total / New)')}</div>
                <div style={{ fontSize: 22, fontWeight: 'bold', marginTop: 4 }}>
                  🏢 {upper.areaUnitsCount || 0} {parseInt(upper.newAreaUnitsCount, 10) > 0 ? `(+${upper.newAreaUnitsCount})` : ''}
                </div>
              </div>

              <div className="card" style={{ padding: '12px 16px', background: 'var(--surface-alt)', border: '1px solid var(--border)', borderRight: isRtl ? '4px solid #f59e0b' : '1px solid var(--border)', borderLeft: !isRtl ? '4px solid #f59e0b' : '1px solid var(--border)' }}>
                <div style={{ fontSize: 12, color: 'var(--text-soft)', fontWeight: 600 }}>{t('proforma.form6.kpiBasicUnits', 'Basic Units (Total / New)')}</div>
                <div style={{ fontSize: 22, fontWeight: 'bold', marginTop: 4 }}>
                  🏘️ {upper.buCount || 0} {parseInt(upper.newBuCount, 10) > 0 ? `(+${upper.newBuCount})` : ''}
                </div>
              </div>

              <div className="card" style={{ padding: '12px 16px', background: 'var(--surface-alt)', border: '1px solid var(--border)', borderRight: isRtl ? '4px solid #ec4899' : '1px solid var(--border)', borderLeft: !isRtl ? '4px solid #ec4899' : '1px solid var(--border)' }}>
                <div style={{ fontSize: 12, color: 'var(--text-soft)', fontWeight: 600 }}>{t('proforma.form6.kpiPublicEvents', 'Rallies, Jirgas & Circles')}</div>
                <div style={{ fontSize: 22, fontWeight: 'bold', marginTop: 4 }}>
                  📢 {(parseInt(upper.ralliesCount, 10) || 0) + (parseInt(upper.jirgasCount, 10) || 0) + (parseInt(upper.studyCirclesCount, 10) || 0)}
                </div>
              </div>

              <div className="card" style={{ padding: '12px 16px', background: 'var(--surface-alt)', border: '1px solid var(--border)', borderRight: isRtl ? '4px solid #14b8a6' : '1px solid var(--border)', borderLeft: !isRtl ? '4px solid #14b8a6' : '1px solid var(--border)' }}>
                <div style={{ fontSize: 12, color: 'var(--text-soft)', fontWeight: 600 }}>{t('proforma.form6.kpiNetDues', 'Net Finance (PKR)')}</div>
                <div style={{ fontSize: 22, fontWeight: 'bold', marginTop: 4, color: form6NetFinance >= 0 ? '#10b981' : '#ef4444' }}>
                  💰 PKR {form6NetFinance.toLocaleString()}
                </div>
              </div>
            </div>

            {/* Validation Alert */}
            {!form6Validation.isValid && (
              <div
                style={{
                  padding: '10px 16px',
                  borderRadius: 8,
                  background: 'rgba(239, 68, 68, 0.1)',
                  border: '1.5px solid #ef4444',
                  color: '#ef4444',
                  display: 'flex',
                  alignItems: 'center',
                  gap: 10,
                  fontSize: 13,
                  fontWeight: 600,
                }}
              >
                <span style={{ fontSize: 18 }}>⚠️</span>
                <span>{form6Validation.errors[0]}</span>
              </div>
            )}

            {/* Row 1: District Executive & District Committee Meetings */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(360px, 1fr))', gap: 16 }}>
              {/* District Executive Meeting */}
              <div className="card" style={{ padding: 16 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12, flexWrap: 'wrap', gap: 8 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                    <strong style={{ fontSize: 14 }}>🏛️ {t('proforma.form6.distExecTitle', 'ضلعي ايګزيکټيو غونډي (District Executive)')}</strong>
                    {form6DistExecSlots > 0 && (
                      form6DistExecSum === form6DistExecSlots ? (
                        <span style={{ fontSize: 11, padding: '2px 8px', borderRadius: 4, background: 'rgba(34, 197, 94, 0.15)', color: '#22c55e', border: '1px solid #22c55e', fontWeight: 600 }}>
                          ✓ {t('proforma.balanced', 'Balanced')}: {form6DistExecSum}/{form6DistExecSlots}
                        </span>
                      ) : (
                        <span style={{ fontSize: 11, padding: '2px 8px', borderRadius: 4, background: 'rgba(234, 179, 8, 0.15)', color: '#eab308', border: '1px solid #eab308', fontWeight: 600 }}>
                          ⚠️ {form6DistExecSum}/{form6DistExecSlots}
                        </span>
                      )
                    )}
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <button
                      type="button"
                      onClick={handleAutoBalanceDistrictExec}
                      className="btn secondary"
                      style={{ padding: '3px 8px', fontSize: 11, fontWeight: 600, borderColor: '#0284c7', color: '#38bdf8' }}
                      title={t('proforma.autoBalance', 'Auto-Balance attendance to match Total Slots')}
                    >
                      ⚡ {t('proforma.autoBalance', 'Auto-Balance')}
                    </button>
                    <span className="badge ACTIVE" style={{ fontSize: 13, fontWeight: 'bold' }}>
                      {upper.distExecPct || '0%'}
                    </span>
                  </div>
                </div>

                <div className="form-grid" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(130px, 1fr))', gap: 10 }}>
                  <div className="field">
                    <label style={{ fontSize: 12 }}>{t('proforma.meetingDate', 'نيټه (Date)')}</label>
                    <input
                      type="text"
                      value={upper.distExecDate || ''}
                      onChange={(e) => updateForm6Upper('distExecDate', e.target.value)}
                      placeholder="DD/MM"
                      style={{ padding: '5px 8px', fontSize: 13, textAlign: 'center' }}
                    />
                  </div>
                  <div className="field">
                    <label style={{ fontSize: 12 }}>{t('proforma.totalMembers', 'غړو شمير (Total)')}</label>
                    <NumberStepper
                      value={upper.distExecSlots ?? ''}
                      onChange={(val) => updateForm6Upper('distExecSlots', val)}
                    />
                  </div>
                  <div className="field">
                    <label style={{ fontSize: 12, color: '#22c55e' }}>{t('proforma.present', 'حاضر (Present)')}</label>
                    <NumberStepper
                      value={upper.distExecPresent ?? ''}
                      max={form6DistExecSlots > 0 ? form6DistExecSlots : Infinity}
                      onChange={(val) => updateForm6Upper('distExecPresent', val)}
                    />
                  </div>
                  <div className="field">
                    <label style={{ fontSize: 12, color: '#ef4444' }}>{t('proforma.absent', 'غير حاضر (Absent)')}</label>
                    <NumberStepper
                      value={upper.distExecAbsent ?? ''}
                      onChange={(val) => updateForm6Upper('distExecAbsent', val)}
                    />
                  </div>
                  <div className="field">
                    <label style={{ fontSize: 12, color: '#eab308' }}>{t('proforma.leave', 'رخصت (Leave)')}</label>
                    <NumberStepper
                      value={upper.distExecLeave ?? ''}
                      onChange={(val) => updateForm6Upper('distExecLeave', val)}
                    />
                  </div>
                  <div className="field">
                    <label style={{ fontSize: 12 }}>{t('proforma.attendancePct', 'حاضري فيصدي (%)')}</label>
                    <input
                      type="text"
                      value={upper.distExecPct || '0%'}
                      onChange={(e) => updateForm6Upper('distExecPct', e.target.value)}
                      style={{ textAlign: 'center', fontWeight: 'bold' }}
                    />
                  </div>
                </div>
              </div>

              {/* District Committee Meeting */}
              <div className="card" style={{ padding: 16 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12, flexWrap: 'wrap', gap: 8 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                    <strong style={{ fontSize: 14 }}>👥 {t('proforma.form6.distCommTitle', 'ضلعي کميټي غونډي (District Committee)')}</strong>
                    {form6DistCommTotal > 0 && (
                      form6DistCommSum === form6DistCommTotal ? (
                        <span style={{ fontSize: 11, padding: '2px 8px', borderRadius: 4, background: 'rgba(34, 197, 94, 0.15)', color: '#22c55e', border: '1px solid #22c55e', fontWeight: 600 }}>
                          ✓ {t('proforma.balanced', 'Balanced')}: {form6DistCommSum}/{form6DistCommTotal}
                        </span>
                      ) : (
                        <span style={{ fontSize: 11, padding: '2px 8px', borderRadius: 4, background: 'rgba(234, 179, 8, 0.15)', color: '#eab308', border: '1px solid #eab308', fontWeight: 600 }}>
                          ⚠️ {form6DistCommSum}/{form6DistCommTotal}
                        </span>
                      )
                    )}
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <button
                      type="button"
                      onClick={handleAutoBalanceDistrictComm}
                      className="btn secondary"
                      style={{ padding: '3px 8px', fontSize: 11, fontWeight: 600, borderColor: '#0284c7', color: '#38bdf8' }}
                      title={t('proforma.autoBalance', 'Auto-Balance attendance to match Total Members')}
                    >
                      ⚡ {t('proforma.autoBalance', 'Auto-Balance')}
                    </button>
                    <span className="badge ACTIVE" style={{ fontSize: 13, fontWeight: 'bold' }}>
                      {upper.distCommPct || '0%'}
                    </span>
                  </div>
                </div>

                <div className="form-grid" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(130px, 1fr))', gap: 10 }}>
                  <div className="field">
                    <label style={{ fontSize: 12 }}>{t('proforma.meetingDate', 'نيټه (Date)')}</label>
                    <input
                      type="text"
                      value={upper.distCommDate || ''}
                      onChange={(e) => updateForm6Upper('distCommDate', e.target.value)}
                      placeholder="DD/MM"
                      style={{ padding: '5px 8px', fontSize: 13, textAlign: 'center' }}
                    />
                  </div>
                  <div className="field">
                    <label style={{ fontSize: 12 }}>{t('proforma.totalMembers', 'غړو شمير (Total)')}</label>
                    <NumberStepper
                      value={upper.distCommTotal ?? ''}
                      onChange={(val) => updateForm6Upper('distCommTotal', val)}
                    />
                  </div>
                  <div className="field">
                    <label style={{ fontSize: 12, color: '#22c55e' }}>{t('proforma.present', 'حاضر (Present)')}</label>
                    <NumberStepper
                      value={upper.distCommPresent ?? ''}
                      max={form6DistCommTotal > 0 ? form6DistCommTotal : Infinity}
                      onChange={(val) => updateForm6Upper('distCommPresent', val)}
                    />
                  </div>
                  <div className="field">
                    <label style={{ fontSize: 12, color: '#ef4444' }}>{t('proforma.absent', 'غير حاضر (Absent)')}</label>
                    <NumberStepper
                      value={upper.distCommAbsent ?? ''}
                      onChange={(val) => updateForm6Upper('distCommAbsent', val)}
                    />
                  </div>
                  <div className="field">
                    <label style={{ fontSize: 12, color: '#eab308' }}>{t('proforma.leave', 'رخصت (Leave)')}</label>
                    <NumberStepper
                      value={upper.distCommLeave ?? ''}
                      onChange={(val) => updateForm6Upper('distCommLeave', val)}
                    />
                  </div>
                  <div className="field">
                    <label style={{ fontSize: 12 }}>{t('proforma.attendancePct', 'حاضري فيصدي (%)')}</label>
                    <input
                      type="text"
                      value={upper.distCommPct || '0%'}
                      onChange={(e) => updateForm6Upper('distCommPct', e.target.value)}
                      style={{ textAlign: 'center', fontWeight: 'bold' }}
                    />
                  </div>
                </div>
              </div>
            </div>

            {/* Row 2: Subordinate Area Units & Basic Units Metrics */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(360px, 1fr))', gap: 16 }}>
              {/* Subordinate Area Units */}
              <div className="card" style={{ padding: 16 }}>
                <strong style={{ fontSize: 14, display: 'block', marginBottom: 12 }}>🏢 {t('proforma.form6.areaUnitsSec', 'علاقائي يونټونه (Area Units Metrics)')}</strong>
                <div className="form-grid" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: 10 }}>
                  <div className="field">
                    <label style={{ fontSize: 12 }}>{t('proforma.form6.areaUnitsCount', 'علاقائي يونټانو شمير (Total)')}</label>
                    <NumberStepper
                      value={upper.areaUnitsCount ?? ''}
                      onChange={(val) => updateForm6Upper('areaUnitsCount', val)}
                    />
                  </div>
                  <div className="field">
                    <label style={{ fontSize: 12 }}>{t('proforma.form6.newAreaUnitsCount', 'نوي علاقائي يونټانو شمير (New)')}</label>
                    <NumberStepper
                      value={upper.newAreaUnitsCount ?? ''}
                      onChange={(val) => updateForm6Upper('newAreaUnitsCount', val)}
                    />
                  </div>
                  <div className="field">
                    <label style={{ fontSize: 12 }}>{t('proforma.form6.areaExecCount', 'علاقائي ايګزيکټيو غونډو شمير')}</label>
                    <NumberStepper
                      value={upper.areaExecCount ?? ''}
                      onChange={(val) => updateForm6Upper('areaExecCount', val)}
                    />
                  </div>
                  <div className="field">
                    <label style={{ fontSize: 12 }}>{t('proforma.form6.areaExecPct', 'غونډو فيصدي (%)')}</label>
                    <input
                      type="text"
                      value={upper.areaExecPct || '0%'}
                      onChange={(e) => updateForm6Upper('areaExecPct', e.target.value)}
                      style={{ textAlign: 'center', fontWeight: 'bold' }}
                    />
                  </div>
                  <div className="field">
                    <label style={{ fontSize: 12 }}>{t('proforma.form6.areaCommCount', 'علاقائي کميټي غونډو شمير')}</label>
                    <NumberStepper
                      value={upper.areaCommCount ?? ''}
                      onChange={(val) => updateForm6Upper('areaCommCount', val)}
                    />
                  </div>
                  <div className="field">
                    <label style={{ fontSize: 12 }}>{t('proforma.form6.areaCommPct', 'غونډو فيصدي (%)')}</label>
                    <input
                      type="text"
                      value={upper.areaCommPct || '0%'}
                      onChange={(e) => updateForm6Upper('areaCommPct', e.target.value)}
                      style={{ textAlign: 'center', fontWeight: 'bold' }}
                    />
                  </div>
                </div>
              </div>

              {/* Subordinate Basic Units */}
              <div className="card" style={{ padding: 16 }}>
                <strong style={{ fontSize: 14, display: 'block', marginBottom: 12 }}>🏘️ {t('proforma.form6.basicUnitsSec', 'ابتدائي يونټونه (Basic Units Metrics)')}</strong>
                <div className="form-grid" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: 10 }}>
                  <div className="field">
                    <label style={{ fontSize: 12 }}>{t('proforma.form6.buCount', 'ابتدائي يونټانو شمير (Total)')}</label>
                    <NumberStepper
                      value={upper.buCount ?? ''}
                      onChange={(val) => updateForm6Upper('buCount', val)}
                    />
                  </div>
                  <div className="field">
                    <label style={{ fontSize: 12 }}>{t('proforma.form6.newBuCount', 'نوي يونټانو شمير (New)')}</label>
                    <NumberStepper
                      value={upper.newBuCount ?? ''}
                      onChange={(val) => updateForm6Upper('newBuCount', val)}
                    />
                  </div>
                  <div className="field">
                    <label style={{ fontSize: 12 }}>{t('proforma.form6.buExecCount', 'يونټانو ايګزيکټيو غونډو شمير')}</label>
                    <NumberStepper
                      value={upper.buExecCount ?? ''}
                      onChange={(val) => updateForm6Upper('buExecCount', val)}
                    />
                  </div>
                  <div className="field">
                    <label style={{ fontSize: 12 }}>{t('proforma.form6.buExecPct', 'غونډو فيصدي (%)')}</label>
                    <input
                      type="text"
                      value={upper.buExecPct || '0%'}
                      onChange={(e) => updateForm6Upper('buExecPct', e.target.value)}
                      style={{ textAlign: 'center', fontWeight: 'bold' }}
                    />
                  </div>
                  <div className="field">
                    <label style={{ fontSize: 12 }}>{t('proforma.form6.buGbCount', 'يونټانو General Body غونډي')}</label>
                    <NumberStepper
                      value={upper.buGbCount ?? ''}
                      onChange={(val) => updateForm6Upper('buGbCount', val)}
                    />
                  </div>
                  <div className="field">
                    <label style={{ fontSize: 12 }}>{t('proforma.form6.buGbPct', 'غونډو فيصدي (%)')}</label>
                    <input
                      type="text"
                      value={upper.buGbPct || '0%'}
                      onChange={(e) => updateForm6Upper('buGbPct', e.target.value)}
                      style={{ textAlign: 'center', fontWeight: 'bold' }}
                    />
                  </div>
                </div>
              </div>
            </div>

            {/* Row 3: Political Reading & Student Wing (PSO) */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(360px, 1fr))', gap: 16 }}>
              {/* Political Reading */}
              <div className="card" style={{ padding: 16 }}>
                <strong style={{ fontSize: 14, display: 'block', marginBottom: 12 }}>📖 {t('proforma.form6.studySec', 'لوستنه / مطالعه (Ideological Political Study)')}</strong>
                <div className="form-grid" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(110px, 1fr))', gap: 10 }}>
                  <div className="field">
                    <label style={{ fontSize: 12 }}>{t('proforma.form6.studyDistComm', 'ضلعي کميټي')}</label>
                    <NumberStepper
                      value={upper.studyDistComm ?? ''}
                      onChange={(val) => updateForm6Upper('studyDistComm', val)}
                    />
                  </div>
                  <div className="field">
                    <label style={{ fontSize: 12 }}>{t('proforma.form6.studyAreaComm', 'علاقائي کميټي')}</label>
                    <NumberStepper
                      value={upper.studyAreaComm ?? ''}
                      onChange={(val) => updateForm6Upper('studyAreaComm', val)}
                    />
                  </div>
                  <div className="field">
                    <label style={{ fontSize: 12 }}>{t('proforma.form6.studyUnitsCount', 'يونټانو شمير')}</label>
                    <NumberStepper
                      value={upper.studyUnitsCount ?? ''}
                      onChange={(val) => updateForm6Upper('studyUnitsCount', val)}
                    />
                  </div>
                </div>
              </div>

              {/* Student Wing (PSO) */}
              <div className="card" style={{ padding: 16 }}>
                <strong style={{ fontSize: 14, display: 'block', marginBottom: 12 }}>🎓 {t('proforma.form6.psoSec', 'پي ايس او - PSO (Pashtun Students Org)')}</strong>
                <div className="form-grid" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: 10 }}>
                  <div className="field">
                    <label style={{ fontSize: 12 }}>{t('proforma.form6.psoUnitsCount', 'يونټانو شمير (PSO Units)')}</label>
                    <NumberStepper
                      value={upper.psoUnitsCount ?? ''}
                      onChange={(val) => updateForm6Upper('psoUnitsCount', val)}
                    />
                  </div>
                  <div className="field">
                    <label style={{ fontSize: 12 }}>{t('proforma.form6.newPsoUnitsCount', 'نوي يونټانو شمير (New PSO Units)')}</label>
                    <NumberStepper
                      value={upper.newPsoUnitsCount ?? ''}
                      onChange={(val) => updateForm6Upper('newPsoUnitsCount', val)}
                    />
                  </div>
                </div>
              </div>
            </div>

            {/* Row 4: Programs, Inductions & Public Gatherings */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(360px, 1fr))', gap: 16 }}>
              {/* Programs & Seminars */}
              <div className="card" style={{ padding: 16 }}>
                <strong style={{ fontSize: 14, display: 'block', marginBottom: 12 }}>📚 {t('proforma.form6.programsSec', 'پروګرامونه، سټډي سرکل او شموليت')}</strong>
                <div className="form-grid" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(110px, 1fr))', gap: 10 }}>
                  <div className="field">
                    <label style={{ fontSize: 12 }}>{t('proforma.form6.conferencesCount', 'کانفرنس / سيمينار')}</label>
                    <NumberStepper
                      value={upper.conferencesCount ?? ''}
                      onChange={(val) => updateForm6Upper('conferencesCount', val)}
                    />
                  </div>
                  <div className="field">
                    <label style={{ fontSize: 12 }}>{t('proforma.form6.studyCirclesCount', 'سټډي سرکل')}</label>
                    <NumberStepper
                      value={upper.studyCirclesCount ?? ''}
                      onChange={(val) => updateForm6Upper('studyCirclesCount', val)}
                    />
                  </div>
                  <div className="field">
                    <label style={{ fontSize: 12 }}>{t('proforma.form6.inductionsCount', 'نوي شموليت')}</label>
                    <NumberStepper
                      value={upper.inductionsCount ?? ''}
                      onChange={(val) => updateForm6Upper('inductionsCount', val)}
                    />
                  </div>
                </div>
              </div>

              {/* Public Gatherings & Allied Parties */}
              <div className="card" style={{ padding: 16 }}>
                <strong style={{ fontSize: 14, display: 'block', marginBottom: 12 }}>📢 {t('proforma.form6.gatheringsSec', 'اولسي غونډي او اتحاديانو سره رابطے')}</strong>
                <div className="form-grid" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(110px, 1fr))', gap: 10 }}>
                  <div className="field">
                    <label style={{ fontSize: 12 }}>{t('proforma.form6.ralliesCount', 'جلسے مظاهرے')}</label>
                    <NumberStepper
                      value={upper.ralliesCount ?? ''}
                      onChange={(val) => updateForm6Upper('ralliesCount', val)}
                    />
                  </div>
                  <div className="field">
                    <label style={{ fontSize: 12 }}>{t('proforma.form6.jirgasCount', 'جرګے / اولسي غونډي')}</label>
                    <NumberStepper
                      value={upper.jirgasCount ?? ''}
                      onChange={(val) => updateForm6Upper('jirgasCount', val)}
                    />
                  </div>
                  <div className="field">
                    <label style={{ fontSize: 12 }}>{t('proforma.form6.alliedMeetingsCount', 'اتحاديانو پارټيانو سره غونډي')}</label>
                    <NumberStepper
                      value={upper.alliedMeetingsCount ?? ''}
                      onChange={(val) => updateForm6Upper('alliedMeetingsCount', val)}
                    />
                  </div>
                </div>
              </div>
            </div>

            {/* Row 5: Operations, Villages Without Unit & Disciplinary Actions */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(360px, 1fr))', gap: 16 }}>
              {/* Operations & Villages */}
              <div className="card" style={{ padding: 16 }}>
                <strong style={{ fontSize: 14, display: 'block', marginBottom: 12 }}>🏢 {t('proforma.form6.operationsSec', 'دفتر، کلي او تاديبي کاروائي')}</strong>
                <div className="form-grid" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: 10 }}>
                  <div className="field">
                    <label style={{ fontSize: 12 }}>{t('proforma.form6.districtOfficeActivity', 'ضلعي دفتر ته فعاليت')}</label>
                    <input
                      type="text"
                      value={upper.districtOfficeActivity || ''}
                      onChange={(e) => updateForm6Upper('districtOfficeActivity', e.target.value)}
                      placeholder="e.g. منظم فعاليت / Weekly hours"
                      style={{ padding: '6px 10px', fontSize: 13 }}
                    />
                  </div>
                  <div className="field">
                    <label style={{ fontSize: 12 }}>{t('proforma.form6.villagesWithoutUnitCount', 'هغه کليو شمير چي يونټ نسته')}</label>
                    <NumberStepper
                      value={upper.villagesWithoutUnitCount ?? ''}
                      onChange={(val) => updateForm6Upper('villagesWithoutUnitCount', val)}
                    />
                  </div>
                  <div className="field">
                    <label style={{ fontSize: 12 }}>{t('proforma.form6.disciplinaryActionsCount', 'تاديبي کاروائي (Disciplinary)')}</label>
                    <input
                      type="text"
                      value={upper.disciplinaryActionsCount ?? ''}
                      onChange={(e) => updateForm6Upper('disciplinaryActionsCount', e.target.value)}
                      placeholder="0 or details"
                      style={{ padding: '6px 10px', fontSize: 13 }}
                    />
                  </div>
                </div>
              </div>

              {/* Dues & Finances */}
              <div className="card" style={{ padding: 16 }}>
                <strong style={{ fontSize: 14, display: 'block', marginBottom: 12 }}>💰 {t('proforma.form6.financesSec', 'چنده او مالي چارې (Dues & Expenses)')}</strong>
                <div className="form-grid" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(110px, 1fr))', gap: 10 }}>
                  <div className="field">
                    <label style={{ fontSize: 12 }}>{t('proforma.form6.duesMonthly', 'مياشتنۍ چنده (PKR)')}</label>
                    <input
                      type="number"
                      value={upper.duesMonthly ?? ''}
                      onChange={(e) => updateForm6Upper('duesMonthly', e.target.value)}
                      placeholder="0"
                      style={{ padding: '6px 8px', fontSize: 13, textAlign: 'center', fontWeight: 'bold' }}
                    />
                  </div>
                  <div className="field">
                    <label style={{ fontSize: 12 }}>{t('proforma.form6.duesEmergency', 'هنګامي چنده (PKR)')}</label>
                    <input
                      type="number"
                      value={upper.duesEmergency ?? ''}
                      onChange={(e) => updateForm6Upper('duesEmergency', e.target.value)}
                      placeholder="0"
                      style={{ padding: '6px 8px', fontSize: 13, textAlign: 'center', fontWeight: 'bold' }}
                    />
                  </div>
                  <div className="field">
                    <label style={{ fontSize: 12, color: '#ef4444' }}>{t('proforma.form6.duesExpenses', 'خرڅ (Expenses)')}</label>
                    <input
                      type="number"
                      value={upper.duesExpenses ?? ''}
                      onChange={(e) => updateForm6Upper('duesExpenses', e.target.value)}
                      placeholder="0"
                      style={{ padding: '6px 8px', fontSize: 13, textAlign: 'center', fontWeight: 'bold' }}
                    />
                  </div>
                  <div className="field">
                    <label style={{ fontSize: 12, color: form6NetFinance >= 0 ? '#10b981' : '#ef4444' }}>{t('proforma.netBalance', 'Net Balance')}</label>
                    <div style={{ padding: '7px 10px', fontWeight: 'bold', fontSize: 14, color: form6NetFinance >= 0 ? '#10b981' : '#ef4444', textAlign: 'center' }}>
                      PKR {form6NetFinance.toLocaleString()}
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        ) : formType === 'form5' ? (
          /* FORM 5 PROVINCIAL EXECUTIVE WORKSPACE */
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            {/* KPI Summary Cards */}
            <div className="proforma-kpi-grid">
              <div className="card" style={{ padding: '12px 16px', background: 'var(--surface-alt)', border: '1px solid var(--border)', borderRight: isRtl ? '4px solid #0284c7' : '1px solid var(--border)', borderLeft: !isRtl ? '4px solid #0284c7' : '1px solid var(--border)' }}>
                <div style={{ fontSize: 12, color: 'var(--text-soft)', fontWeight: 600 }}>{t('proforma.form5.kpiTotalComrades', 'Executive Comrades')}</div>
                <div style={{ fontSize: 22, fontWeight: 'bold', marginTop: 4, display: 'flex', alignItems: 'center', gap: 8 }}>
                  <span>🏛️ {rows.length}</span>
                </div>
              </div>

              <div className="card" style={{ padding: '12px 16px', background: 'var(--surface-alt)', border: '1px solid var(--border)', borderRight: isRtl ? '4px solid #10b981' : '1px solid var(--border)', borderLeft: !isRtl ? '4px solid #10b981' : '1px solid var(--border)' }}>
                <div style={{ fontSize: 12, color: 'var(--text-soft)', fontWeight: 600 }}>{t('proforma.form5.kpiTotalMeetings', 'Total Mtgs Attended')}</div>
                <div style={{ fontSize: 22, fontWeight: 'bold', marginTop: 4 }}>
                  🤝 {rows.reduce((sum, r) => sum + (parseInt(r.totalMeetings, 10) || 0), 0)}
                </div>
              </div>

              <div className="card" style={{ padding: '12px 16px', background: 'var(--surface-alt)', border: '1px solid var(--border)', borderRight: isRtl ? '4px solid #8b5cf6' : '1px solid var(--border)', borderLeft: !isRtl ? '4px solid #8b5cf6' : '1px solid var(--border)' }}>
                <div style={{ fontSize: 12, color: 'var(--text-soft)', fontWeight: 600 }}>{t('proforma.form5.provincialExec', 'Provincial Exec Mtgs')}</div>
                <div style={{ fontSize: 22, fontWeight: 'bold', marginTop: 4 }}>
                  👥 {rows.reduce((sum, r) => sum + (parseInt(r.provincialExec, 10) || 0), 0)}
                </div>
              </div>

              <div className="card" style={{ padding: '12px 16px', background: 'var(--surface-alt)', border: '1px solid var(--border)', borderRight: isRtl ? '4px solid #f59e0b' : '1px solid var(--border)', borderLeft: !isRtl ? '4px solid #f59e0b' : '1px solid var(--border)' }}>
                <div style={{ fontSize: 12, color: 'var(--text-soft)', fontWeight: 600 }}>{t('proforma.form5.provincialJirga', 'Provincial Jirga Mtgs')}</div>
                <div style={{ fontSize: 22, fontWeight: 'bold', marginTop: 4 }}>
                  🏛️ {rows.reduce((sum, r) => sum + (parseInt(r.provincialJirga, 10) || 0), 0)}
                </div>
              </div>

              <div className="card" style={{ padding: '12px 16px', background: 'var(--surface-alt)', border: '1px solid var(--border)', borderRight: isRtl ? '4px solid #ec4899' : '1px solid var(--border)', borderLeft: !isRtl ? '4px solid #ec4899' : '1px solid var(--border)' }}>
                <div style={{ fontSize: 12, color: 'var(--text-soft)', fontWeight: 600 }}>{t('proforma.form5.publicGatherings', 'Public Events / Jirgas')}</div>
                <div style={{ fontSize: 22, fontWeight: 'bold', marginTop: 4 }}>
                  📢 {rows.reduce((sum, r) => sum + (parseInt(r.ralliesAndProtests, 10) || 0) + (parseInt(r.jirgasAndCornerMeetings, 10) || 0), 0)}
                </div>
              </div>

              <div className="card" style={{ padding: '12px 16px', background: 'var(--surface-alt)', border: '1px solid var(--border)', borderRight: isRtl ? '4px solid #14b8a6' : '1px solid var(--border)', borderLeft: !isRtl ? '4px solid #14b8a6' : '1px solid var(--border)' }}>
                <div style={{ fontSize: 12, color: 'var(--text-soft)', fontWeight: 600 }}>{t('proforma.form5.dues', 'Total Dues (PKR)')}</div>
                <div style={{ fontSize: 22, fontWeight: 'bold', marginTop: 4 }}>
                  💰 PKR {rows.reduce((sum, r) => sum + (parseInt(r.dues, 10) || 0), 0).toLocaleString()}
                </div>
              </div>
            </div>

            {/* Form 5 Validation Alert */}
            {!form5Validation.isValid && (
              <div
                style={{
                  padding: '10px 16px',
                  borderRadius: 8,
                  background: 'rgba(239, 68, 68, 0.1)',
                  border: '1.5px solid #ef4444',
                  color: '#ef4444',
                  display: 'flex',
                  alignItems: 'center',
                  gap: 10,
                  fontSize: 13,
                  fontWeight: 600,
                }}
              >
                <span style={{ fontSize: 18 }}>⚠️</span>
                <span>
                  {form5Validation.errors[0]}
                </span>
              </div>
            )}

            {/* Action Bar: Search, View Mode Toggle, Auto-Sum All, Add Member */}
            <div
              className="proforma-form5-toolbar"
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                flexWrap: 'wrap',
                gap: 10,
                padding: '10px 14px',
                background: 'var(--surface)',
                borderRadius: 8,
                border: '1px solid var(--border)',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
                <input
                  type="text"
                  value={form5Search}
                  onChange={(e) => setForm5Search(e.target.value)}
                  placeholder={t('proforma.form5.searchPlaceholder', 'Search executive comrade by name...')}
                  style={{
                    padding: '6px 12px',
                    fontSize: 13,
                    borderRadius: 6,
                    border: '1px solid var(--border)',
                    minWidth: 240,
                  }}
                />

                {/* View Mode Toggle: Cards vs Table */}
                <div style={{ display: 'flex', borderRadius: 6, overflow: 'hidden', border: '1px solid var(--border)' }}>
                  <button
                    type="button"
                    onClick={() => setForm5ViewMode('cards')}
                    style={{
                      padding: '6px 12px',
                      fontSize: 12,
                      fontWeight: 600,
                      border: 'none',
                      background: form5ViewMode === 'cards' ? 'var(--primary, #38bdf8)' : 'var(--surface-alt)',
                      color: form5ViewMode === 'cards' ? '#fff' : 'var(--text-main)',
                      cursor: 'pointer',
                    }}
                  >
                    🗂️ {t('proforma.viewCards', 'Cards')}
                  </button>
                  <button
                    type="button"
                    onClick={() => setForm5ViewMode('table')}
                    style={{
                      padding: '6px 12px',
                      fontSize: 12,
                      fontWeight: 600,
                      border: 'none',
                      background: form5ViewMode === 'table' ? 'var(--primary, #38bdf8)' : 'var(--surface-alt)',
                      color: form5ViewMode === 'table' ? '#fff' : 'var(--text-main)',
                      cursor: 'pointer',
                    }}
                  >
                    📊 {t('proforma.viewTable', 'Spreadsheet Table')}
                  </button>
                </div>
              </div>

              <div className="proforma-form5-toolbar-actions" style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <button
                  type="button"
                  onClick={handleAutoSumAllForm5Rows}
                  className="btn secondary"
                  style={{ fontSize: 12, borderColor: '#10b981', color: '#10b981', fontWeight: 600 }}
                  title={t('proforma.form5.autoSumAll', 'Auto-Sum All Total Meetings')}
                >
                  ⚡ {t('proforma.form5.autoSumAll', 'Auto-Sum All Total Meetings')}
                </button>

                <button
                  type="button"
                  onClick={addForm5Row}
                  className="btn"
                  style={{ fontSize: 12, background: '#0284c7', borderColor: '#0284c7', fontWeight: 700 }}
                >
                  ➕ {t('proforma.form5.addMember', '+ Add Executive Comrade')}
                </button>
              </div>
            </div>

            {/* CARDS VIEW */}
            {form5ViewMode === 'cards' && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                {rows
                  .filter((r) => {
                    if (!form5Search.trim()) return true;
                    return (r.name || '').toLowerCase().includes(form5Search.toLowerCase());
                  })
                  .map((r, idx) => {
                    const rErr = form5Validation.rowErrors[idx] || {};
                    return (
                      <div
                        key={idx}
                        className="card"
                        style={{
                          position: 'relative',
                          border: rErr.hasError ? '2px solid #ef4444' : '1px solid var(--border)',
                          padding: 14,
                        }}
                      >
                        {/* Header */}
                        <div
                          style={{
                            display: 'flex',
                            justifyContent: 'space-between',
                            alignItems: 'center',
                            borderBottom: '1px solid var(--border)',
                            paddingBottom: 10,
                            marginBottom: 12,
                            flexWrap: 'wrap',
                            gap: 8,
                          }}
                        >
                          <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
                            <span
                              style={{
                                background: '#0284c7',
                                color: '#fff',
                                borderRadius: '50%',
                                width: 26,
                                height: 26,
                                display: 'inline-flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                fontSize: 13,
                                fontWeight: 'bold',
                              }}
                            >
                              {r.srNo || idx + 1}
                            </span>
                            <input
                              type="text"
                              value={r.name || ''}
                              onChange={(e) => updateForm5Row(idx, 'name', e.target.value)}
                              placeholder={t('proforma.form5.name', 'ايګزيکټيو نوم (Executive Comrade Name)')}
                              style={{
                                fontWeight: 'bold',
                                fontSize: 14,
                                padding: '4px 10px',
                                minWidth: 220,
                                borderColor: rErr.name ? '#ef4444' : undefined,
                                background: rErr.name ? 'rgba(239, 68, 68, 0.08)' : undefined,
                              }}
                            />
                            {rErr.name && (
                              <span style={{ fontSize: 12, color: '#ef4444', fontWeight: 600 }}>
                                ⚠️ {rErr.name}
                              </span>
                            )}
                          </div>

                          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                            <button
                              type="button"
                              onClick={() => handleAutoSumForm5Row(idx)}
                              className="btn secondary"
                              style={{ padding: '3px 8px', fontSize: 11, borderColor: '#10b981', color: '#10b981', fontWeight: 600 }}
                              title="Auto-calculate total meetings for this member"
                            >
                              ⚡ {t('proforma.form5.autoSumRow', 'Sum')}: {r.totalMeetings || 0}
                            </button>
                            <button
                              type="button"
                              onClick={() => removeForm5Row(idx)}
                              style={{ background: 'none', border: 'none', color: '#ef4444', cursor: 'pointer', fontSize: 16 }}
                              title="Remove Member"
                            >
                              ✕
                            </button>
                          </div>
                        </div>

                        {/* 6 Sub-sections matching all columns */}
                        <div className="proforma-card-subgrid">
                          {/* 1. Central & Provincial Meetings */}
                          <div style={{ background: 'var(--surface-alt)', padding: 10, borderRadius: 6, border: '1px solid var(--border)' }}>
                            <div style={{ fontWeight: 700, fontSize: 12, color: 'var(--primary, #38bdf8)', marginBottom: 8 }}>
                              🏛️ {t('proforma.form5.highMeetingsSection', '1. Central & Provincial Meetings (مرکزي او صوبائي غونډي)')}
                            </div>
                            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 8 }}>
                              <div>
                                <label style={{ fontSize: 11, display: 'block', color: 'var(--text-soft)' }}>{t('proforma.form5.centralComm', 'مرکزي کميټي')}</label>
                                <NumberStepper value={r.centralComm} onChange={(v) => updateForm5Row(idx, 'centralComm', v)} />
                              </div>
                              <div>
                                <label style={{ fontSize: 11, display: 'block', color: 'var(--text-soft)' }}>{t('proforma.form5.provincialJirga', 'صوبائي جرګے')}</label>
                                <NumberStepper value={r.provincialJirga} onChange={(v) => updateForm5Row(idx, 'provincialJirga', v)} />
                              </div>
                              <div>
                                <label style={{ fontSize: 11, display: 'block', color: 'var(--text-soft)' }}>{t('proforma.form5.provincialExec', 'صوبائي ايګزيکټيو')}</label>
                                <NumberStepper value={r.provincialExec} onChange={(v) => updateForm5Row(idx, 'provincialExec', v)} />
                              </div>
                              <div>
                                <label style={{ fontSize: 11, display: 'block', color: 'var(--text-soft)' }}>{t('proforma.form5.provincialComm', 'صوبائي کميټي')}</label>
                                <NumberStepper value={r.provincialComm} onChange={(v) => updateForm5Row(idx, 'provincialComm', v)} />
                              </div>
                            </div>
                          </div>

                          {/* 2. District & Area Meetings */}
                          <div style={{ background: 'var(--surface-alt)', padding: 10, borderRadius: 6, border: '1px solid var(--border)' }}>
                            <div style={{ fontWeight: 700, fontSize: 12, color: '#10b981', marginBottom: 8 }}>
                              🏢 {t('proforma.form5.districtAreaMeetingsSection', '2. District & Area Meetings (ضلع او علاقه غونډي)')}
                            </div>
                            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 8 }}>
                              <div>
                                <label style={{ fontSize: 11, display: 'block', color: 'var(--text-soft)' }}>{t('proforma.form5.districtExec', 'ضلع ايګزيکټيو')}</label>
                                <NumberStepper value={r.districtExec} onChange={(v) => updateForm5Row(idx, 'districtExec', v)} />
                              </div>
                              <div>
                                <label style={{ fontSize: 11, display: 'block', color: 'var(--text-soft)' }}>{t('proforma.form5.districtComm', 'ضلعي کميټي')}</label>
                                <NumberStepper value={r.districtComm} onChange={(v) => updateForm5Row(idx, 'districtComm', v)} />
                              </div>
                              <div>
                                <label style={{ fontSize: 11, display: 'block', color: 'var(--text-soft)' }}>{t('proforma.form5.areaExec', 'علاقائي ايګزيکټيو')}</label>
                                <NumberStepper value={r.areaExec} onChange={(v) => updateForm5Row(idx, 'areaExec', v)} />
                              </div>
                              <div>
                                <label style={{ fontSize: 11, display: 'block', color: 'var(--text-soft)' }}>{t('proforma.form5.areaComm', 'علاقائي کميټي')}</label>
                                <NumberStepper value={r.areaComm} onChange={(v) => updateForm5Row(idx, 'areaComm', v)} />
                              </div>
                            </div>
                          </div>

                          {/* 3. Basic Units & PSO Meetings */}
                          <div style={{ background: 'var(--surface-alt)', padding: 10, borderRadius: 6, border: '1px solid var(--border)' }}>
                            <div style={{ fontWeight: 700, fontSize: 12, color: '#8b5cf6', marginBottom: 8 }}>
                              🤝 {t('proforma.form5.basicUnitsPsoSection', '3. Basic Units & PSO Meetings (ابتدائي يونټونه او PSO)')}
                            </div>
                            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 8 }}>
                              <div>
                                <label style={{ fontSize: 11, display: 'block', color: 'var(--text-soft)' }}>{t('proforma.form5.basicUnitsExec', 'ابتدائي يونټانو ايګزيکټيو')}</label>
                                <NumberStepper value={r.basicUnitsExec} onChange={(v) => updateForm5Row(idx, 'basicUnitsExec', v)} />
                              </div>
                              <div>
                                <label style={{ fontSize: 11, display: 'block', color: 'var(--text-soft)' }}>{t('proforma.form5.basicUnitsGb', 'ابتدائي يونټانو غونډي')}</label>
                                <NumberStepper value={r.basicUnitsGb} onChange={(v) => updateForm5Row(idx, 'basicUnitsGb', v)} />
                              </div>
                              <div>
                                <label style={{ fontSize: 11, display: 'block', color: 'var(--text-soft)' }}>{t('proforma.form5.ownBasicUnit', 'خپل ابتدائي يونټ')}</label>
                                <NumberStepper value={r.ownBasicUnit} onChange={(v) => updateForm5Row(idx, 'ownBasicUnit', v)} />
                              </div>
                              <div>
                                <label style={{ fontSize: 11, display: 'block', color: 'var(--text-soft)' }}>{t('proforma.form5.psoMeetings', 'PSO غونډي')}</label>
                                <NumberStepper value={r.psoMeetings} onChange={(v) => updateForm5Row(idx, 'psoMeetings', v)} />
                              </div>
                            </div>
                          </div>

                          {/* 4. Education & Conferences */}
                          <div style={{ background: 'var(--surface-alt)', padding: 10, borderRadius: 6, border: '1px solid var(--border)' }}>
                            <div style={{ fontWeight: 700, fontSize: 12, color: '#f59e0b', marginBottom: 8 }}>
                              📚 {t('proforma.form5.educationIdeologySection', '4. Education & Conferences (کانفرنسونه او سټډي سرکل)')}
                            </div>
                            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 8 }}>
                              <div>
                                <label style={{ fontSize: 11, display: 'block', color: 'var(--text-soft)' }}>{t('proforma.form5.partyConferences', 'پارټي کانفرنسونه')}</label>
                                <NumberStepper value={r.partyConferences} onChange={(v) => updateForm5Row(idx, 'partyConferences', v)} />
                              </div>
                              <div>
                                <label style={{ fontSize: 11, display: 'block', color: 'var(--text-soft)' }}>{t('proforma.form5.seminars', 'سيمينارونه')}</label>
                                <NumberStepper value={r.seminars} onChange={(v) => updateForm5Row(idx, 'seminars', v)} />
                              </div>
                              <div>
                                <label style={{ fontSize: 11, display: 'block', color: 'var(--text-soft)' }}>{t('proforma.form5.studyCircles', 'سټډي سرکل')}</label>
                                <NumberStepper value={r.studyCircles} onChange={(v) => updateForm5Row(idx, 'studyCircles', v)} />
                              </div>
                              <div>
                                <label style={{ fontSize: 11, display: 'block', color: 'var(--text-soft)' }}>{t('proforma.form5.inductions', 'نوي شموليت')}</label>
                                <NumberStepper value={r.inductions} onChange={(v) => updateForm5Row(idx, 'inductions', v)} />
                              </div>
                            </div>
                          </div>

                          {/* 5. Public Events & Allies */}
                          <div style={{ background: 'var(--surface-alt)', padding: 10, borderRadius: 6, border: '1px solid var(--border)' }}>
                            <div style={{ fontWeight: 700, fontSize: 12, color: '#ec4899', marginBottom: 8 }}>
                              📢 {t('proforma.form5.publicOutreachSection', '5. Public Events & Allies (جلسے، جرګے او اتحاديان)')}
                            </div>
                            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 8 }}>
                              <div>
                                <label style={{ fontSize: 11, display: 'block', color: 'var(--text-soft)' }}>{t('proforma.form5.ralliesAndProtests', 'جلسے مظاهرے')}</label>
                                <NumberStepper value={r.ralliesAndProtests} onChange={(v) => updateForm5Row(idx, 'ralliesAndProtests', v)} />
                              </div>
                              <div>
                                <label style={{ fontSize: 11, display: 'block', color: 'var(--text-soft)' }}>{t('proforma.form5.jirgasAndCornerMeetings', 'جرګے کارنر ميټنګ')}</label>
                                <NumberStepper value={r.jirgasAndCornerMeetings} onChange={(v) => updateForm5Row(idx, 'jirgasAndCornerMeetings', v)} />
                              </div>
                              <div>
                                <label style={{ fontSize: 11, display: 'block', color: 'var(--text-soft)' }}>{t('proforma.form5.pressConferences', 'پريس کانفرنسونه')}</label>
                                <NumberStepper value={r.pressConferences} onChange={(v) => updateForm5Row(idx, 'pressConferences', v)} />
                              </div>
                              <div>
                                <label style={{ fontSize: 11, display: 'block', color: 'var(--text-soft)' }}>{t('proforma.form5.alliedMeetings', 'اتحاديانو سره غونډي')}</label>
                                <NumberStepper value={r.alliedMeetings} onChange={(v) => updateForm5Row(idx, 'alliedMeetings', v)} />
                              </div>
                            </div>
                          </div>

                          {/* 6. Totals, Dues, Tours, Reading & Blood Bank */}
                          <div style={{ background: 'var(--surface-alt)', padding: 10, borderRadius: 6, border: '1px solid var(--border)' }}>
                            <div style={{ fontWeight: 700, fontSize: 12, color: '#14b8a6', marginBottom: 8 }}>
                              💰 {t('proforma.form5.financeOutreachSection', '6. Totals, Dues & Blood Bank (ټولي غونډي، چنده او مطالعه)')}
                            </div>
                            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 8 }}>
                              <div>
                                <label style={{ fontSize: 11, display: 'block', color: '#22c55e', fontWeight: 700 }}>{t('proforma.form5.totalMeetings', 'ټولي غونډي')}</label>
                                <NumberStepper value={r.totalMeetings} onChange={(v) => updateForm5Row(idx, 'totalMeetings', v)} />
                              </div>
                              <div>
                                <label style={{ fontSize: 11, display: 'block', color: 'var(--text-soft)' }}>{t('proforma.form5.dues', 'چنده (PKR)')}</label>
                                <NumberStepper value={r.dues} step={500} onChange={(v) => updateForm5Row(idx, 'dues', v)} />
                              </div>
                              <div>
                                <label style={{ fontSize: 11, display: 'block', color: 'var(--text-soft)' }}>{t('proforma.form5.tours', 'دوره')}</label>
                                <NumberStepper value={r.tours} onChange={(v) => updateForm5Row(idx, 'tours', v)} />
                              </div>
                              <div>
                                <label style={{ fontSize: 11, display: 'block', color: 'var(--text-soft)' }}>{t('proforma.form5.reading', 'لوستنه (مطالعه)')}</label>
                                <NumberStepper value={r.reading} onChange={(v) => updateForm5Row(idx, 'reading', v)} />
                              </div>
                              <div style={{ gridColumn: 'span 2' }}>
                                <label style={{ fontSize: 11, display: 'block', color: 'var(--text-soft)' }}>{t('proforma.form5.bloodBankPosts', 'بلډ بينک پوسټ')}</label>
                                <input
                                  type="text"
                                  value={r.bloodBankPosts || ''}
                                  onChange={(e) => updateForm5Row(idx, 'bloodBankPosts', e.target.value)}
                                  placeholder="e.g. O+ / 2 posts"
                                  style={{ width: '100%', padding: '4px 8px', fontSize: 12, borderRadius: 4 }}
                                />
                              </div>
                            </div>
                          </div>
                        </div>
                      </div>
                    );
                  })}
              </div>
            )}

            {/* SPREADSHEET TABLE VIEW */}
            {form5ViewMode === 'table' && (
              <div style={{ overflowX: 'auto', border: '1px solid var(--border)', borderRadius: 8, background: 'var(--surface)' }}>
                <table
                  className="table"
                  style={{
                    width: '100%',
                    minWidth: 1650,
                    fontSize: 12,
                    borderCollapse: 'collapse',
                    textAlign: 'center',
                    direction: 'rtl',
                  }}
                >
                  <thead>
                    <tr style={{ background: 'var(--surface-alt)', borderBottom: '1px solid var(--border)' }}>
                      <th rowSpan="2" style={{ padding: '6px 4px', width: 35 }}>{t('proforma.form5.srNo', 'شمير')}</th>
                      <th rowSpan="2" style={{ padding: '6px 8px', minWidth: 130 }}>{t('proforma.form5.name', 'ايګزيکټيو نوم')}</th>
                      <th rowSpan="2" style={{ padding: '6px 4px', width: 45 }}>{t('proforma.form5.centralComm', 'مرکزي کميټي')}</th>
                      <th rowSpan="2" style={{ padding: '6px 4px', width: 45 }}>{t('proforma.form5.provincialJirga', 'صوبائي جرګے')}</th>
                      <th rowSpan="2" style={{ padding: '6px 4px', width: 45 }}>{t('proforma.form5.provincialExec', 'صوبائي ايګزيکټيو')}</th>
                      <th rowSpan="2" style={{ padding: '6px 4px', width: 45 }}>{t('proforma.form5.provincialComm', 'صوبائي کميټي')}</th>
                      <th rowSpan="2" style={{ padding: '6px 4px', width: 45 }}>{t('proforma.form5.districtExec', 'ضلع ايګزيکټيو')}</th>
                      <th rowSpan="2" style={{ padding: '6px 4px', width: 45 }}>{t('proforma.form5.districtComm', 'ضلعي کميټي')}</th>
                      <th rowSpan="2" style={{ padding: '6px 4px', width: 45 }}>{t('proforma.form5.areaExec', 'علاقائي ايګزيکټيو')}</th>
                      <th rowSpan="2" style={{ padding: '6px 4px', width: 45 }}>{t('proforma.form5.areaComm', 'علاقائي کميټي')}</th>
                      <th rowSpan="2" style={{ padding: '6px 4px', width: 55 }}>{t('proforma.form5.basicUnitsExec', 'ابتدائي يونټانو ايګزيکټيو')}</th>
                      <th rowSpan="2" style={{ padding: '6px 4px', width: 50 }}>{t('proforma.form5.basicUnitsGb', 'ابتدائي يونټانو غونډي')}</th>
                      <th rowSpan="2" style={{ padding: '6px 4px', width: 50 }}>{t('proforma.form5.ownBasicUnit', 'خپل ابتدائي يونټ')}</th>
                      <th rowSpan="2" style={{ padding: '6px 4px', width: 45 }}>{t('proforma.form5.psoMeetings', 'PSO غونډي')}</th>
                      <th rowSpan="2" style={{ padding: '6px 4px', width: 50 }}>{t('proforma.form5.partyConferences', 'پارټي کانفرنسونه')}</th>
                      <th rowSpan="2" style={{ padding: '6px 4px', width: 45 }}>{t('proforma.form5.seminars', 'سيمينارونه')}</th>
                      <th rowSpan="2" style={{ padding: '6px 4px', width: 45 }}>{t('proforma.form5.studyCircles', 'سټډي سرکل')}</th>
                      <th rowSpan="2" style={{ padding: '6px 4px', width: 50 }}>{t('proforma.form5.inductions', 'نوي شموليت')}</th>
                      <th colSpan="2" style={{ padding: '4px 6px', background: 'rgba(236, 72, 153, 0.1)', color: '#ec4899' }}>{t('proforma.form5.publicGatherings', 'اولسي غونډي')}</th>
                      <th rowSpan="2" style={{ padding: '6px 4px', width: 50 }}>{t('proforma.form5.pressConferences', 'پريس کانفرنس')}</th>
                      <th rowSpan="2" style={{ padding: '6px 4px', width: 65 }}>{t('proforma.form5.alliedMeetings', 'اتحاديانو سره غونډي')}</th>
                      <th rowSpan="2" style={{ padding: '6px 4px', width: 50, color: '#22c55e' }}>{t('proforma.form5.totalMeetings', 'ټولي غونډي')}</th>
                      <th rowSpan="2" style={{ padding: '6px 4px', width: 55 }}>{t('proforma.form5.dues', 'چنده')}</th>
                      <th rowSpan="2" style={{ padding: '6px 4px', width: 40 }}>{t('proforma.form5.tours', 'دوره')}</th>
                      <th rowSpan="2" style={{ padding: '6px 4px', width: 50 }}>{t('proforma.form5.reading', 'لوستنه (مطالعه)')}</th>
                      <th rowSpan="2" style={{ padding: '6px 4px', width: 55 }}>{t('proforma.form5.bloodBankPosts', 'بلډ بينک')}</th>
                      <th rowSpan="2" style={{ padding: '6px 4px', width: 35 }}>✕</th>
                    </tr>
                    <tr style={{ background: 'var(--surface-alt)', borderBottom: '1px solid var(--border)' }}>
                      <th style={{ padding: '4px 4px', width: 45 }}>{t('proforma.form5.ralliesAndProtests', 'جلسے مظاهرے')}</th>
                      <th style={{ padding: '4px 4px', width: 55 }}>{t('proforma.form5.jirgasAndCornerMeetings', 'جرګے کارنر')}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {rows.length === 0 ? (
                      <tr>
                        <td colSpan="28" style={{ padding: 24, textAlign: 'center', color: 'var(--text-soft)' }}>
                          {t('proforma.form5.noMembers', 'No provincial executive comrades added yet.')}
                        </td>
                      </tr>
                    ) : (
                      rows
                        .filter((r) => {
                          if (!form5Search.trim()) return true;
                          return (r.name || '').toLowerCase().includes(form5Search.toLowerCase());
                        })
                        .map((r, idx) => {
                          const rErr = form5Validation.rowErrors[idx] || {};
                          return (
                            <tr key={idx} style={{ borderBottom: '1px solid var(--border)' }}>
                              <td style={{ padding: 3, fontWeight: 'bold' }}>{r.srNo || idx + 1}</td>
                              <td style={{ padding: 3 }}>
                                <input
                                  type="text"
                                  value={r.name || ''}
                                  onChange={(e) => updateForm5Row(idx, 'name', e.target.value)}
                                  placeholder={t('proforma.form5.name', 'Comrade name')}
                                  style={{
                                    width: '100%',
                                    padding: '3px 6px',
                                    fontWeight: 600,
                                    fontSize: 12,
                                    borderColor: rErr.name ? '#ef4444' : undefined,
                                    background: rErr.name ? 'rgba(239, 68, 68, 0.08)' : undefined,
                                  }}
                                />
                              </td>
                              <td style={{ padding: 2 }}><input type="text" value={r.centralComm ?? ''} onChange={(e) => updateForm5Row(idx, 'centralComm', e.target.value)} style={{ width: 38, textAlign: 'center', fontSize: 12 }} /></td>
                              <td style={{ padding: 2 }}><input type="text" value={r.provincialJirga ?? ''} onChange={(e) => updateForm5Row(idx, 'provincialJirga', e.target.value)} style={{ width: 38, textAlign: 'center', fontSize: 12 }} /></td>
                              <td style={{ padding: 2 }}><input type="text" value={r.provincialExec ?? ''} onChange={(e) => updateForm5Row(idx, 'provincialExec', e.target.value)} style={{ width: 38, textAlign: 'center', fontSize: 12 }} /></td>
                              <td style={{ padding: 2 }}><input type="text" value={r.provincialComm ?? ''} onChange={(e) => updateForm5Row(idx, 'provincialComm', e.target.value)} style={{ width: 38, textAlign: 'center', fontSize: 12 }} /></td>
                              <td style={{ padding: 2 }}><input type="text" value={r.districtExec ?? ''} onChange={(e) => updateForm5Row(idx, 'districtExec', e.target.value)} style={{ width: 38, textAlign: 'center', fontSize: 12 }} /></td>
                              <td style={{ padding: 2 }}><input type="text" value={r.districtComm ?? ''} onChange={(e) => updateForm5Row(idx, 'districtComm', e.target.value)} style={{ width: 38, textAlign: 'center', fontSize: 12 }} /></td>
                              <td style={{ padding: 2 }}><input type="text" value={r.areaExec ?? ''} onChange={(e) => updateForm5Row(idx, 'areaExec', e.target.value)} style={{ width: 38, textAlign: 'center', fontSize: 12 }} /></td>
                              <td style={{ padding: 2 }}><input type="text" value={r.areaComm ?? ''} onChange={(e) => updateForm5Row(idx, 'areaComm', e.target.value)} style={{ width: 38, textAlign: 'center', fontSize: 12 }} /></td>
                              <td style={{ padding: 2 }}><input type="text" value={r.basicUnitsExec ?? ''} onChange={(e) => updateForm5Row(idx, 'basicUnitsExec', e.target.value)} style={{ width: 38, textAlign: 'center', fontSize: 12 }} /></td>
                              <td style={{ padding: 2 }}><input type="text" value={r.basicUnitsGb ?? ''} onChange={(e) => updateForm5Row(idx, 'basicUnitsGb', e.target.value)} style={{ width: 38, textAlign: 'center', fontSize: 12 }} /></td>
                              <td style={{ padding: 2 }}><input type="text" value={r.ownBasicUnit ?? ''} onChange={(e) => updateForm5Row(idx, 'ownBasicUnit', e.target.value)} style={{ width: 38, textAlign: 'center', fontSize: 12 }} /></td>
                              <td style={{ padding: 2 }}><input type="text" value={r.psoMeetings ?? ''} onChange={(e) => updateForm5Row(idx, 'psoMeetings', e.target.value)} style={{ width: 38, textAlign: 'center', fontSize: 12 }} /></td>
                              <td style={{ padding: 2 }}><input type="text" value={r.partyConferences ?? ''} onChange={(e) => updateForm5Row(idx, 'partyConferences', e.target.value)} style={{ width: 38, textAlign: 'center', fontSize: 12 }} /></td>
                              <td style={{ padding: 2 }}><input type="text" value={r.seminars ?? ''} onChange={(e) => updateForm5Row(idx, 'seminars', e.target.value)} style={{ width: 38, textAlign: 'center', fontSize: 12 }} /></td>
                              <td style={{ padding: 2 }}><input type="text" value={r.studyCircles ?? ''} onChange={(e) => updateForm5Row(idx, 'studyCircles', e.target.value)} style={{ width: 38, textAlign: 'center', fontSize: 12 }} /></td>
                              <td style={{ padding: 2 }}><input type="text" value={r.inductions ?? ''} onChange={(e) => updateForm5Row(idx, 'inductions', e.target.value)} style={{ width: 38, textAlign: 'center', fontSize: 12 }} /></td>
                              <td style={{ padding: 2 }}><input type="text" value={r.ralliesAndProtests ?? ''} onChange={(e) => updateForm5Row(idx, 'ralliesAndProtests', e.target.value)} style={{ width: 38, textAlign: 'center', fontSize: 12 }} /></td>
                              <td style={{ padding: 2 }}><input type="text" value={r.jirgasAndCornerMeetings ?? ''} onChange={(e) => updateForm5Row(idx, 'jirgasAndCornerMeetings', e.target.value)} style={{ width: 38, textAlign: 'center', fontSize: 12 }} /></td>
                              <td style={{ padding: 2 }}><input type="text" value={r.pressConferences ?? ''} onChange={(e) => updateForm5Row(idx, 'pressConferences', e.target.value)} style={{ width: 38, textAlign: 'center', fontSize: 12 }} /></td>
                              <td style={{ padding: 2 }}><input type="text" value={r.alliedMeetings ?? ''} onChange={(e) => updateForm5Row(idx, 'alliedMeetings', e.target.value)} style={{ width: 45, textAlign: 'center', fontSize: 12 }} /></td>
                              <td style={{ padding: 2 }}>
                                <input
                                  type="text"
                                  value={r.totalMeetings ?? ''}
                                  onChange={(e) => updateForm5Row(idx, 'totalMeetings', e.target.value)}
                                  style={{ width: 42, textAlign: 'center', fontSize: 12, fontWeight: 'bold', color: '#22c55e' }}
                                />
                              </td>
                              <td style={{ padding: 2 }}><input type="text" value={r.dues ?? ''} onChange={(e) => updateForm5Row(idx, 'dues', e.target.value)} style={{ width: 55, textAlign: 'center', fontSize: 12, fontWeight: 600 }} /></td>
                              <td style={{ padding: 2 }}><input type="text" value={r.tours ?? ''} onChange={(e) => updateForm5Row(idx, 'tours', e.target.value)} style={{ width: 35, textAlign: 'center', fontSize: 12 }} /></td>
                              <td style={{ padding: 2 }}><input type="text" value={r.reading ?? ''} onChange={(e) => updateForm5Row(idx, 'reading', e.target.value)} style={{ width: 42, textAlign: 'center', fontSize: 12 }} /></td>
                              <td style={{ padding: 2 }}><input type="text" value={r.bloodBankPosts || ''} onChange={(e) => updateForm5Row(idx, 'bloodBankPosts', e.target.value)} style={{ width: 55, textAlign: 'center', fontSize: 11 }} /></td>
                              <td style={{ padding: 2 }}>
                                <button
                                  type="button"
                                  onClick={() => removeForm5Row(idx)}
                                  style={{ background: 'none', border: 'none', color: '#ef4444', cursor: 'pointer', fontSize: 14 }}
                                  title="Remove Member"
                                >
                                  ✕
                                </button>
                              </td>
                            </tr>
                          );
                        })
                    )}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        ) : formType === 'form2' ? (
          /* FORM 2 SUBORDINATE BASIC UNITS WORKSPACE */
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            {/* KPI Summary Cards */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 12 }}>
              <div className="card" style={{ padding: '12px 16px', background: 'var(--surface-alt)', border: '1px solid var(--border)', borderRight: isRtl ? '4px solid #0284c7' : '1px solid var(--border)', borderLeft: !isRtl ? '4px solid #0284c7' : '1px solid var(--border)' }}>
                <div style={{ fontSize: 12, color: 'var(--text-soft)', fontWeight: 600 }}>{t('proforma.kpiTotalUnits', 'Total Units')}</div>
                <div style={{ fontSize: 22, fontWeight: 'bold', marginTop: 4, display: 'flex', alignItems: 'center', gap: 8 }}>
                  <span>🏢 {rows.length}</span>
                  <span style={{ fontSize: 11, padding: '2px 6px', borderRadius: 4, background: 'rgba(34, 197, 94, 0.15)', color: '#22c55e', fontWeight: 600 }}>
                    {rows.filter(r => r.unitStatus !== 'غير فعاله').length} {t('proforma.active', 'Active')}
                  </span>
                </div>
              </div>

              <div className="card" style={{ padding: '12px 16px', background: 'var(--surface-alt)', border: '1px solid var(--border)', borderRight: isRtl ? '4px solid #10b981' : '1px solid var(--border)', borderLeft: !isRtl ? '4px solid #10b981' : '1px solid var(--border)' }}>
                <div style={{ fontSize: 12, color: 'var(--text-soft)', fontWeight: 600 }}>{t('proforma.kpiExecMeetings', 'Exec Mtgs Held')}</div>
                <div style={{ fontSize: 22, fontWeight: 'bold', marginTop: 4 }}>
                  🤝 {rows.filter(r => r.execMeetingDate || (parseInt(r.execPresent, 10) || 0) > 0).length} / {rows.length}
                </div>
              </div>

              <div className="card" style={{ padding: '12px 16px', background: 'var(--surface-alt)', border: '1px solid var(--border)', borderRight: isRtl ? '4px solid #8b5cf6' : '1px solid var(--border)', borderLeft: !isRtl ? '4px solid #8b5cf6' : '1px solid var(--border)' }}>
                <div style={{ fontSize: 12, color: 'var(--text-soft)', fontWeight: 600 }}>{t('proforma.kpiGbMeetings', 'GB Mtgs Held')}</div>
                <div style={{ fontSize: 22, fontWeight: 'bold', marginTop: 4 }}>
                  👥 {rows.filter(r => r.gbMeetingDate || (parseInt(r.gbPresent, 10) || 0) > 0).length} / {rows.length}
                </div>
              </div>

              <div className="card" style={{ padding: '12px 16px', background: 'var(--surface-alt)', border: '1px solid var(--border)', borderRight: isRtl ? '4px solid #f59e0b' : '1px solid var(--border)', borderLeft: !isRtl ? '4px solid #f59e0b' : '1px solid var(--border)' }}>
                <div style={{ fontSize: 12, color: 'var(--text-soft)', fontWeight: 600 }}>{t('proforma.kpiTotalDues', 'Total Dues')}</div>
                <div style={{ fontSize: 20, fontWeight: 'bold', marginTop: 4, color: '#10b981' }}>
                  PKR {rows.reduce((sum, r) => sum + (parseInt(r.unitDonations, 10) || 0) + (parseInt(r.emergencyDonations, 10) || 0), 0).toLocaleString()}
                </div>
              </div>

              <div className="card" style={{ padding: '12px 16px', background: 'var(--surface-alt)', border: '1px solid var(--border)', borderRight: isRtl ? '4px solid #ef4444' : '1px solid var(--border)', borderLeft: !isRtl ? '4px solid #ef4444' : '1px solid var(--border)' }}>
                <div style={{ fontSize: 12, color: 'var(--text-soft)', fontWeight: 600 }}>{t('proforma.kpiTotalExpenses', 'Total Expenses')}</div>
                <div style={{ fontSize: 20, fontWeight: 'bold', marginTop: 4, color: '#ef4444' }}>
                  PKR {rows.reduce((sum, r) => sum + (parseInt(r.totalExpenses, 10) || 0), 0).toLocaleString()}
                </div>
              </div>
            </div>

            {/* Controls Toolbar: View Mode, Search, Add Row, Auto-Balance All */}
            <div className="card" style={{ padding: '12px 16px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 12 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
                <div style={{ display: 'flex', borderRadius: 8, overflow: 'hidden', border: '1px solid var(--border)' }}>
                  <button
                    type="button"
                    onClick={() => setForm2ViewMode('cards')}
                    style={{
                      padding: '7px 14px',
                      fontSize: 13,
                      fontWeight: 600,
                      border: 'none',
                      background: form2ViewMode === 'cards' ? '#0284c7' : 'var(--surface-alt)',
                      color: form2ViewMode === 'cards' ? '#fff' : 'inherit',
                      cursor: 'pointer',
                    }}
                  >
                    🗂️ {t('proforma.viewCards', 'Cards View')}
                  </button>
                  <button
                    type="button"
                    onClick={() => setForm2ViewMode('table')}
                    style={{
                      padding: '7px 14px',
                      fontSize: 13,
                      fontWeight: 600,
                      border: 'none',
                      background: form2ViewMode === 'table' ? '#0284c7' : 'var(--surface-alt)',
                      color: form2ViewMode === 'table' ? '#fff' : 'inherit',
                      cursor: 'pointer',
                    }}
                  >
                    📊 {t('proforma.viewTable', 'Official Table View (35 Columns)')}
                  </button>
                </div>

                <div style={{ position: 'relative' }}>
                  <input
                    type="text"
                    value={form2Search}
                    onChange={(e) => setForm2Search(e.target.value)}
                    placeholder={t('proforma.searchUnitPlaceholder', 'Search basic unit by name...')}
                    style={{
                      padding: '7px 12px',
                      fontSize: 13,
                      minWidth: 240,
                      borderRadius: 6,
                      border: '1px solid var(--border)',
                      background: 'var(--surface-alt)',
                    }}
                  />
                  {form2Search && (
                    <button
                      type="button"
                      onClick={() => setForm2Search('')}
                      style={{
                        position: 'absolute',
                        right: isRtl ? 'auto' : 8,
                        left: isRtl ? 8 : 'auto',
                        top: '50%',
                        transform: 'translateY(-50%)',
                        border: 'none',
                        background: 'transparent',
                        cursor: 'pointer',
                        color: 'var(--text-soft)',
                      }}
                    >
                      ✕
                    </button>
                  )}
                </div>
              </div>

              <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
                <button
                  type="button"
                  onClick={handleAutoBalanceAllForm2Rows}
                  className="btn secondary"
                  style={{ fontSize: 12, padding: '7px 12px', borderColor: '#0284c7', color: '#38bdf8', fontWeight: 600 }}
                  title="Auto-balances attendance for all units where Present + Leave + Absent doesn't match Total"
                >
                  ⚡ {t('proforma.autoBalanceAll', 'Auto-Balance All Units')}
                </button>

                <button
                  type="button"
                  onClick={addForm2Row}
                  className="btn"
                  style={{ fontSize: 13, padding: '7px 14px', background: '#0284c7', borderColor: '#0284c7', fontWeight: 600 }}
                >
                  ➕ {t('proforma.addUnitRow', '+ Add Basic Unit')}
                </button>
              </div>
            </div>

            {/* Top Validation Warning Banner if any row is invalid */}
            {!form2Validation.isValid && (
              <div
                style={{
                  padding: '10px 16px',
                  borderRadius: 8,
                  background: 'rgba(239, 68, 68, 0.1)',
                  border: '1px solid #ef4444',
                  color: '#ef4444',
                  fontSize: 13,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  flexWrap: 'wrap',
                  gap: 10,
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                  <span style={{ fontSize: 16 }}>⚠️</span>
                  <strong>
                    {t('proforma.form2.validation.issuesFound', '{{count}} validation issue(s) detected in subordinate units', { count: form2Validation.errors.length })}:
                  </strong>
                  <span>{form2Validation.errors.slice(0, 2).join('; ')}{form2Validation.errors.length > 2 ? ` (+${form2Validation.errors.length - 2} more)` : ''}</span>
                </div>
                <button
                  type="button"
                  onClick={handleAutoBalanceAllForm2Rows}
                  className="btn"
                  style={{ padding: '4px 12px', fontSize: 12, background: '#ef4444', borderColor: '#ef4444', color: '#fff', fontWeight: 600 }}
                >
                  ⚡ {t('proforma.autoBalanceAll', 'Auto-Balance All Units')}
                </button>
              </div>
            )}

            {/* FORM 2: CARDS VIEW */}
            {form2ViewMode === 'cards' && (
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(420px, 1fr))', gap: 16 }}>
                {rows.length === 0 ? (
                  <div className="card" style={{ textAlign: 'center', padding: 40, color: 'var(--text-soft)', gridColumn: '1 / -1' }}>
                    <p style={{ fontSize: 15, marginBottom: 12 }}>{t('proforma.noUnits', 'No subordinate basic units added yet.')}</p>
                    <button type="button" className="btn" onClick={addForm2Row} style={{ background: '#0284c7', borderColor: '#0284c7' }}>
                      ➕ {t('proforma.addUnitRow', '+ Add Basic Unit')}
                    </button>
                  </div>
                ) : (
                  rows
                    .map((r, originalIdx) => ({ ...r, _origIdx: originalIdx }))
                    .filter((r) => !form2Search.trim() || (r.unitName || '').toLowerCase().includes(form2Search.trim().toLowerCase()))
                    .map((r) => {
                      const idx = r._origIdx;
                      const rErr = form2Validation.rowErrors[idx] || {};
                      const hasRowError = rErr.hasError;

                      const execTotal = parseInt(r.execTotal, 10) || 0;
                      const execPres = parseInt(r.execPresent, 10) || 0;
                      const execAbs = parseInt(r.execAbsent, 10) || 0;
                      const execLeave = parseInt(r.execLeave, 10) || 0;
                      const execSum = execPres + execAbs + execLeave;
                      const execBalanced = execTotal === 0 || execSum === execTotal;

                      const gbTotal = parseInt(r.gbTotalMembers, 10) || 0;
                      const gbPres = parseInt(r.gbPresent, 10) || 0;
                      const gbAbs = parseInt(r.gbAbsent, 10) || 0;
                      const gbLeave = parseInt(r.gbLeave, 10) || 0;
                      const gbSum = gbPres + gbAbs + gbLeave;
                      const gbBalanced = gbTotal === 0 || gbSum === gbTotal;

                      const netFin = ((parseInt(r.unitDonations, 10) || 0) + (parseInt(r.emergencyDonations, 10) || 0)) - (parseInt(r.totalExpenses, 10) || 0);

                      return (
                        <div
                          key={idx}
                          className="card"
                          style={{
                            border: hasRowError ? '1.5px solid #ef4444' : '1px solid var(--border)',
                            boxShadow: hasRowError ? '0 0 0 1px rgba(239, 68, 68, 0.15)' : 'none',
                            display: 'flex',
                            flexDirection: 'column',
                            gap: 12,
                          }}
                        >
                          {/* Unit Card Header */}
                          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid var(--border)', paddingBottom: 10 }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 8, flex: 1 }}>
                              <span style={{ background: hasRowError ? '#ef4444' : '#0284c7', color: '#fff', borderRadius: '50%', width: 26, height: 26, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', fontSize: 12, fontWeight: 'bold' }}>
                                {r.srNo || idx + 1}
                              </span>
                              <input
                                type="text"
                                value={r.unitName || ''}
                                onChange={(e) => updateForm2Row(idx, 'unitName', e.target.value)}
                                placeholder={t('proforma.form2.unitName', 'Basic Unit Name / د يونټ نوم')}
                                style={{
                                  fontWeight: 'bold',
                                  fontSize: 15,
                                  padding: '4px 8px',
                                  flex: 1,
                                  maxWidth: 260,
                                  border: rErr.name ? '1.5px solid #ef4444' : undefined,
                                  background: rErr.name ? 'rgba(239, 68, 68, 0.08)' : undefined,
                                }}
                              />
                            </div>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                              <button
                                type="button"
                                onClick={() => updateForm2Row(idx, 'unitStatus', r.unitStatus === 'فعاله' ? 'غير فعاله' : 'فعاله')}
                                style={{
                                  padding: '3px 8px',
                                  borderRadius: 4,
                                  fontSize: 12,
                                  fontWeight: 600,
                                  cursor: 'pointer',
                                  border: 'none',
                                  background: r.unitStatus === 'غير فعاله' ? 'rgba(234, 179, 8, 0.15)' : 'rgba(34, 197, 94, 0.15)',
                                  color: r.unitStatus === 'غير فعاله' ? '#eab308' : '#22c55e',
                                }}
                              >
                                {r.unitStatus === 'غير فعاله' ? t('proforma.inactive', 'غير فعاله') : t('proforma.active', 'فعاله')}
                              </button>
                              <button
                                type="button"
                                onClick={() => removeForm2Row(idx)}
                                style={{ background: 'none', border: 'none', color: '#ef4444', cursor: 'pointer', fontSize: 16 }}
                                title={t('proforma.form2.remove', 'Remove Unit')}
                              >
                                ✕
                              </button>
                            </div>
                          </div>

                          {/* Row Error Banner if present */}
                          {hasRowError && (
                            <div
                              style={{
                                padding: '6px 10px',
                                borderRadius: 6,
                                background: 'rgba(239, 68, 68, 0.1)',
                                border: '1px solid rgba(239, 68, 68, 0.25)',
                                color: '#ef4444',
                                fontSize: 12,
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'space-between',
                                flexWrap: 'wrap',
                                gap: 6,
                              }}
                            >
                              <span>⚠️ {[rErr.name, rErr.exec, rErr.gb, rErr.pso, rErr.finance].filter(Boolean).join(' • ')}</span>
                              {(rErr.exec || rErr.gb) && (
                                <button
                                  type="button"
                                  onClick={() => {
                                    if (rErr.exec) handleAutoBalanceForm2Row(idx, 'exec');
                                    if (rErr.gb) handleAutoBalanceForm2Row(idx, 'gb');
                                  }}
                                  className="btn secondary"
                                  style={{ padding: '2px 8px', fontSize: 11, borderColor: '#ef4444', color: '#ef4444', background: 'transparent' }}
                                >
                                  ⚡ {t('proforma.autoBalance', 'Auto-Balance')}
                                </button>
                              )}
                            </div>
                          )}

                          {/* 1. Unit Executive Meeting */}
                          <div style={{ background: 'var(--surface-alt)', padding: 10, borderRadius: 6, border: rErr.exec ? '1.5px solid #ef4444' : '1px solid var(--border)' }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                              <span style={{ fontWeight: 600, fontSize: 13, color: '#0284c7' }}>
                                🤝 {t('proforma.form2.execMeetingsSection', '1. Unit Executive Meetings')}
                              </span>
                              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                                {!execBalanced && (
                                  <button
                                    type="button"
                                    onClick={() => handleAutoBalanceForm2Row(idx, 'exec')}
                                    className="btn secondary"
                                    style={{ padding: '2px 6px', fontSize: 11, borderColor: '#0284c7', color: '#38bdf8' }}
                                  >
                                    ⚡ {t('proforma.form2.balanceExec', 'Balance')}
                                  </button>
                                )}
                                <span className="badge ACTIVE" style={{ fontSize: 11, fontWeight: 'bold' }}>
                                  {r.execPct ? (String(r.execPct).includes('%') ? r.execPct : `${r.execPct}%`) : '0%'}
                                </span>
                              </div>
                            </div>
                            <div style={{ display: 'grid', gridTemplateColumns: '1.2fr 1fr 1fr 1fr 1fr', gap: 6 }}>
                              <div>
                                <label style={{ fontSize: 11, display: 'block', color: 'var(--text-soft)' }}>{t('proforma.form2.date', 'Date')}</label>
                                <input
                                  type="text"
                                  value={r.execMeetingDate || ''}
                                  onChange={(e) => updateForm2Row(idx, 'execMeetingDate', e.target.value)}
                                  placeholder="12/10"
                                  style={{ width: '100%', fontSize: 12, padding: '3px 6px', textAlign: 'center' }}
                                />
                              </div>
                              <div>
                                <label style={{ fontSize: 11, display: 'block', color: 'var(--text-soft)' }}>{t('proforma.form2.totalSlots', 'Total')}</label>
                                <NumberStepper value={r.execTotal} onChange={(val) => updateForm2Row(idx, 'execTotal', val)} style={{ minWidth: 70 }} />
                              </div>
                              <div>
                                <label style={{ fontSize: 11, display: 'block', color: '#22c55e' }}>{t('proforma.form2.present', 'Present')}</label>
                                <NumberStepper value={r.execPresent} onChange={(val) => updateForm2Row(idx, 'execPresent', val)} style={{ minWidth: 70 }} />
                              </div>
                              <div>
                                <label style={{ fontSize: 11, display: 'block', color: '#ef4444' }}>{t('proforma.form2.absent', 'Absent')}</label>
                                <NumberStepper value={r.execAbsent} onChange={(val) => updateForm2Row(idx, 'execAbsent', val)} style={{ minWidth: 70 }} />
                              </div>
                              <div>
                                <label style={{ fontSize: 11, display: 'block', color: '#eab308' }}>{t('proforma.form2.leave', 'Leave')}</label>
                                <NumberStepper value={r.execLeave} onChange={(val) => updateForm2Row(idx, 'execLeave', val)} style={{ minWidth: 70 }} />
                              </div>
                            </div>
                          </div>

                          {/* 2. Unit General Body Meeting */}
                          <div style={{ background: 'var(--surface-alt)', padding: 10, borderRadius: 6, border: rErr.gb ? '1.5px solid #ef4444' : '1px solid var(--border)' }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                              <span style={{ fontWeight: 600, fontSize: 13, color: '#10b981' }}>
                                👥 {t('proforma.form2.gbMeetingsSection', '2. Unit General Body Meetings')}
                              </span>
                              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                                {!gbBalanced && (
                                  <button
                                    type="button"
                                    onClick={() => handleAutoBalanceForm2Row(idx, 'gb')}
                                    className="btn secondary"
                                    style={{ padding: '2px 6px', fontSize: 11, borderColor: '#10b981', color: '#10b981' }}
                                  >
                                    ⚡ {t('proforma.form2.balanceGb', 'Balance')}
                                  </button>
                                )}
                                <span className="badge ACTIVE" style={{ fontSize: 11, fontWeight: 'bold', background: '#10b981' }}>
                                  {r.gbPct ? (String(r.gbPct).includes('%') ? r.gbPct : `${r.gbPct}%`) : '0%'}
                                </span>
                              </div>
                            </div>
                            <div style={{ display: 'grid', gridTemplateColumns: '1.2fr 1fr 1fr 1fr 1fr', gap: 6 }}>
                              <div>
                                <label style={{ fontSize: 11, display: 'block', color: 'var(--text-soft)' }}>{t('proforma.form2.date', 'Date')}</label>
                                <input
                                  type="text"
                                  value={r.gbMeetingDate || ''}
                                  onChange={(e) => updateForm2Row(idx, 'gbMeetingDate', e.target.value)}
                                  placeholder="14/10"
                                  style={{ width: '100%', fontSize: 12, padding: '3px 6px', textAlign: 'center' }}
                                />
                              </div>
                              <div>
                                <label style={{ fontSize: 11, display: 'block', color: 'var(--text-soft)' }}>{t('proforma.form2.membership', 'Membership')}</label>
                                <NumberStepper value={r.gbTotalMembers} onChange={(val) => updateForm2Row(idx, 'gbTotalMembers', val)} style={{ minWidth: 70 }} />
                              </div>
                              <div>
                                <label style={{ fontSize: 11, display: 'block', color: '#22c55e' }}>{t('proforma.form2.present', 'Present')}</label>
                                <NumberStepper value={r.gbPresent} onChange={(val) => updateForm2Row(idx, 'gbPresent', val)} style={{ minWidth: 70 }} />
                              </div>
                              <div>
                                <label style={{ fontSize: 11, display: 'block', color: '#ef4444' }}>{t('proforma.form2.absent', 'Absent')}</label>
                                <NumberStepper value={r.gbAbsent} onChange={(val) => updateForm2Row(idx, 'gbAbsent', val)} style={{ minWidth: 70 }} />
                              </div>
                              <div>
                                <label style={{ fontSize: 11, display: 'block', color: '#eab308' }}>{t('proforma.form2.leave', 'Leave')}</label>
                                <NumberStepper value={r.gbLeave} onChange={(val) => updateForm2Row(idx, 'gbLeave', val)} style={{ minWidth: 70 }} />
                              </div>
                            </div>
                          </div>

                          {/* 3. Study, Education & PSO */}
                          <div style={{ background: 'var(--surface-alt)', padding: 10, borderRadius: 6, border: rErr.pso ? '1.5px solid #ef4444' : '1px solid var(--border)' }}>
                            <div style={{ fontWeight: 600, fontSize: 13, color: '#8b5cf6', marginBottom: 8 }}>
                              📚 {t('proforma.form2.studyPsoSection', '3. Study, Education & PSO')}
                            </div>
                            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(85px, 1fr))', gap: 8 }}>
                              <div>
                                <label style={{ fontSize: 11, display: 'block', color: 'var(--text-soft)' }}>{t('proforma.form2.studyReading', 'Reading (Study)')}</label>
                                <NumberStepper value={r.studyReading} onChange={(val) => updateForm2Row(idx, 'studyReading', val)} style={{ minWidth: 70 }} />
                              </div>
                              <div>
                                <label style={{ fontSize: 11, display: 'block', color: 'var(--text-soft)' }}>{t('proforma.form2.seminar', 'Seminar')}</label>
                                <NumberStepper value={r.seminarCount} onChange={(val) => updateForm2Row(idx, 'seminarCount', val)} style={{ minWidth: 70 }} />
                              </div>
                              <div>
                                <label style={{ fontSize: 11, display: 'block', color: 'var(--text-soft)' }}>{t('proforma.form2.studyCircle', 'Study Circle')}</label>
                                <NumberStepper value={r.studyCircleCount} onChange={(val) => updateForm2Row(idx, 'studyCircleCount', val)} style={{ minWidth: 70 }} />
                              </div>
                              <div>
                                <label style={{ fontSize: 11, display: 'block', color: 'var(--text-soft)' }}>{t('proforma.form2.newMembers', 'New Joinees')}</label>
                                <NumberStepper value={r.newMembers} onChange={(val) => updateForm2Row(idx, 'newMembers', val)} style={{ minWidth: 70 }} />
                              </div>
                              <div>
                                <label style={{ fontSize: 11, display: 'block', color: 'var(--text-soft)' }}>{t('proforma.form2.psoMembership', 'PSO Membership')}</label>
                                <NumberStepper value={r.psoMembership} onChange={(val) => updateForm2Row(idx, 'psoMembership', val)} style={{ minWidth: 70 }} />
                              </div>
                              <div>
                                <label style={{ fontSize: 11, display: 'block', color: '#22c55e' }}>{t('proforma.form2.psoAttendees', 'Meeting Attendees')}</label>
                                <NumberStepper value={r.psoAttendees} onChange={(val) => updateForm2Row(idx, 'psoAttendees', val)} style={{ minWidth: 70 }} />
                              </div>
                            </div>
                          </div>

                          {/* 4. Public Gatherings & Outreach */}
                          <div style={{ background: 'var(--surface-alt)', padding: 10, borderRadius: 6, border: '1px solid var(--border)' }}>
                            <div style={{ fontWeight: 600, fontSize: 13, color: '#f59e0b', marginBottom: 8 }}>
                              📢 {t('proforma.form2.eventsOutreachSection', '4. Events, Inductions & Outreach')}
                            </div>
                            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(85px, 1fr))', gap: 8 }}>
                              <div>
                                <label style={{ fontSize: 11, display: 'block', color: 'var(--text-soft)' }}>{t('proforma.form2.publicEvents', 'Public Rallies / Jirgas')}</label>
                                <NumberStepper value={r.publicEventsCount} onChange={(val) => updateForm2Row(idx, 'publicEventsCount', val)} style={{ minWidth: 70 }} />
                              </div>
                              <div>
                                <label style={{ fontSize: 11, display: 'block', color: 'var(--text-soft)' }}>{t('proforma.form2.inductionProgram', 'Induction Program')}</label>
                                <NumberStepper value={r.inductionPrograms} onChange={(val) => updateForm2Row(idx, 'inductionPrograms', val)} style={{ minWidth: 70 }} />
                              </div>
                              <div>
                                <label style={{ fontSize: 11, display: 'block', color: 'var(--text-soft)' }}>{t('proforma.form2.publicOutreach', 'Public Contacts')}</label>
                                <NumberStepper value={r.publicOutreach} onChange={(val) => updateForm2Row(idx, 'publicOutreach', val)} style={{ minWidth: 70 }} />
                              </div>
                              <div>
                                <label style={{ fontSize: 11, display: 'block', color: 'var(--text-soft)' }}>{t('proforma.form2.inactiveContact', 'Inactive Comrades')}</label>
                                <NumberStepper value={r.inactiveContact} onChange={(val) => updateForm2Row(idx, 'inactiveContact', val)} style={{ minWidth: 70 }} />
                              </div>
                              <div>
                                <label style={{ fontSize: 11, display: 'block', color: 'var(--text-soft)' }}>{t('proforma.form2.orgOutreach', 'Organizational Contacts')}</label>
                                <NumberStepper value={r.orgOutreach} onChange={(val) => updateForm2Row(idx, 'orgOutreach', val)} style={{ minWidth: 70 }} />
                              </div>
                            </div>
                          </div>

                          {/* 5. Finances & Dues */}
                          <div style={{ background: 'var(--surface-alt)', padding: 10, borderRadius: 6, border: rErr.finance ? '1.5px solid #ef4444' : '1px solid var(--border)' }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                              <span style={{ fontWeight: 600, fontSize: 13, color: '#10b981' }}>
                                💰 {t('proforma.form2.financesSection', '5. Finances & Dues (PKR)')}
                              </span>
                              <span style={{ fontSize: 12, fontWeight: 'bold', color: netFin >= 0 ? '#10b981' : '#ef4444' }}>
                                {t('proforma.form2.netFinance', 'Net')}: PKR {netFin.toLocaleString()}
                              </span>
                            </div>
                            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(100px, 1fr))', gap: 8 }}>
                              <div>
                                <label style={{ fontSize: 11, display: 'block', color: 'var(--text-soft)' }}>{t('proforma.form2.unitDues', 'Unit Dues')}</label>
                                <NumberStepper value={r.unitDonations} step={100} onChange={(val) => updateForm2Row(idx, 'unitDonations', val)} style={{ minWidth: 85 }} />
                              </div>
                              <div>
                                <label style={{ fontSize: 11, display: 'block', color: 'var(--text-soft)' }}>{t('proforma.form2.emergencyDues', 'Emergency Fund')}</label>
                                <NumberStepper value={r.emergencyDonations} step={100} onChange={(val) => updateForm2Row(idx, 'emergencyDonations', val)} style={{ minWidth: 85 }} />
                              </div>
                              <div>
                                <label style={{ fontSize: 11, display: 'block', color: '#ef4444' }}>{t('proforma.form2.expenses', 'Expenses')}</label>
                                <NumberStepper value={r.totalExpenses} step={100} onChange={(val) => updateForm2Row(idx, 'totalExpenses', val)} style={{ minWidth: 85 }} />
                              </div>
                            </div>
                          </div>

                          {/* 6. Discipline & Blood Bank */}
                          <div style={{ background: 'var(--surface-alt)', padding: 10, borderRadius: 6, border: '1px solid var(--border)' }}>
                            <div style={{ fontWeight: 600, fontSize: 13, color: '#ec4899', marginBottom: 8 }}>
                              🩸 {t('proforma.form2.bloodDisciplineSection', '6. Discipline & Blood Bank')}
                            </div>
                            <div style={{ display: 'grid', gridTemplateColumns: '1.2fr repeat(4, 1fr)', gap: 8 }}>
                              <div>
                                <label style={{ fontSize: 11, display: 'block', color: 'var(--text-soft)' }}>{t('proforma.form2.disciplinaryAction', 'Disciplinary Action')}</label>
                                <input
                                  type="text"
                                  value={r.disciplinaryAction || ''}
                                  onChange={(e) => updateForm2Row(idx, 'disciplinaryAction', e.target.value)}
                                  placeholder="none / اخطار"
                                  style={{ width: '100%', fontSize: 12, padding: '3px 6px' }}
                                />
                              </div>
                              <div>
                                <label style={{ fontSize: 11, display: 'block', color: 'var(--text-soft)' }}>{t('proforma.form2.bloodPosts', 'Posts')}</label>
                                <NumberStepper value={r.bloodPosts} onChange={(val) => updateForm2Row(idx, 'bloodPosts', val)} style={{ minWidth: 70 }} />
                              </div>
                              <div>
                                <label style={{ fontSize: 11, display: 'block', color: 'var(--text-soft)' }}>{t('proforma.form2.bloodCash', 'Cash')}</label>
                                <NumberStepper value={r.bloodCash} step={100} onChange={(val) => updateForm2Row(idx, 'bloodCash', val)} style={{ minWidth: 70 }} />
                              </div>
                              <div>
                                <label style={{ fontSize: 11, display: 'block', color: 'var(--text-soft)' }}>{t('proforma.form2.bloodTotalCash', 'Total Cash')}</label>
                                <NumberStepper value={r.bloodTotalCash} step={100} onChange={(val) => updateForm2Row(idx, 'bloodTotalCash', val)} style={{ minWidth: 70 }} />
                              </div>
                              <div>
                                <label style={{ fontSize: 11, display: 'block', color: 'var(--text-soft)' }}>{t('proforma.form2.zakat', 'Zakat')}</label>
                                <NumberStepper value={r.zakat} step={100} onChange={(val) => updateForm2Row(idx, 'zakat', val)} style={{ minWidth: 70 }} />
                              </div>
                            </div>
                          </div>
                        </div>
                      );
                    })
                )}
              </div>
            )}

            {/* FORM 2: OFFICIAL 35-COLUMN TABLE VIEW */}
            {form2ViewMode === 'table' && (
              <div style={{ overflowX: 'auto', maxHeight: '680px', border: '1px solid var(--border)', borderRadius: 8, background: 'var(--surface)' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12, minWidth: 2600, textAlign: 'center' }}>
                  <thead style={{ background: 'var(--surface-alt)', position: 'sticky', top: 0, zIndex: 10 }}>
                    <tr style={{ borderBottom: '1px solid var(--border)', fontSize: 11 }}>
                      <th rowSpan={2} style={{ padding: '8px 4px', width: 40, position: 'sticky', [isRtl ? 'right' : 'left']: 0, background: 'var(--surface-alt)', zIndex: 12 }}>{t('proforma.form2.srNo', 'شمير')}</th>
                      <th rowSpan={2} style={{ padding: '8px 6px', minWidth: 160, position: 'sticky', [isRtl ? 'right' : 'left']: 40, background: 'var(--surface-alt)', zIndex: 12 }}>{t('proforma.form2.unitName', 'يونټ نوم')}</th>
                      <th colSpan={6} style={{ padding: '6px 4px', borderRight: '1px solid var(--border)', borderLeft: '1px solid var(--border)', background: 'rgba(2, 132, 199, 0.08)' }}>{t('proforma.form2.execMeeting', 'يونټ ايګزيکټيو غونډي')}</th>
                      <th colSpan={6} style={{ padding: '6px 4px', borderRight: '1px solid var(--border)', borderLeft: '1px solid var(--border)', background: 'rgba(16, 185, 129, 0.08)' }}>{t('proforma.form2.gbMeeting', 'يونټ جنرل باډي غونډي')}</th>
                      <th rowSpan={2} style={{ padding: '6px 4px', width: 65, whiteSpace: 'nowrap' }}>{t('proforma.form2.studyReading', 'لوستنه (مطالعه)')}</th>
                      <th rowSpan={2} style={{ padding: '6px 4px', width: 55 }}>{t('proforma.form2.seminar', 'سيمينار')}</th>
                      <th rowSpan={2} style={{ padding: '6px 4px', width: 55 }}>{t('proforma.form2.studyCircle', 'سټډي سرکل')}</th>
                      <th rowSpan={2} style={{ padding: '6px 4px', width: 65 }}>{t('proforma.form2.newMembers', 'نوي شموليتونه')}</th>
                      <th colSpan={3} style={{ padding: '6px 4px', borderRight: '1px solid var(--border)', borderLeft: '1px solid var(--border)', background: 'rgba(139, 92, 246, 0.08)' }}>{t('proforma.form2.pso', 'پي ايس او')}</th>
                      <th rowSpan={2} style={{ padding: '6px 4px', width: 85 }}>{t('proforma.form2.publicEvents', 'جلسے اولسي غونډي جرګے')}</th>
                      <th rowSpan={2} style={{ padding: '6px 4px', width: 65 }}>{t('proforma.form2.inductionProgram', 'شموليت پروګرام')}</th>
                      <th colSpan={3} style={{ padding: '6px 4px', borderRight: '1px solid var(--border)', borderLeft: '1px solid var(--border)', background: 'rgba(245, 158, 11, 0.08)' }}>{t('proforma.form2.contacts', 'رابطے')}</th>
                      <th colSpan={3} style={{ padding: '6px 4px', borderRight: '1px solid var(--border)', borderLeft: '1px solid var(--border)', background: 'rgba(239, 68, 68, 0.08)' }}>{t('proforma.form2.dues', 'چنده')}</th>
                      <th rowSpan={2} style={{ padding: '6px 4px', width: 75 }}>{t('proforma.form2.disciplinaryAction', 'تاديبي کاروائي')}</th>
                      <th colSpan={4} style={{ padding: '6px 4px', borderRight: '1px solid var(--border)', borderLeft: '1px solid var(--border)', background: 'rgba(236, 72, 153, 0.08)' }}>{t('proforma.form2.bloodBank', 'بلډ بينک')}</th>
                      <th rowSpan={2} style={{ padding: '6px 4px', width: 80 }}>{t('proforma.form2.status', 'فعاله / غير فعاله')}</th>
                      <th rowSpan={2} style={{ padding: '6px 4px', width: 36 }}>✕</th>
                    </tr>
                    <tr style={{ borderBottom: '2px solid var(--border)', fontSize: 10 }}>
                      {/* Exec */}
                      <th style={{ width: 65 }}>{t('proforma.form2.date', 'نيټه')}</th>
                      <th style={{ width: 50 }}>{t('proforma.form2.totalSlots', 'شمير')}</th>
                      <th style={{ width: 45 }}>{t('proforma.form2.present', 'حاضر')}</th>
                      <th style={{ width: 45 }}>{t('proforma.form2.absent', 'غير')}</th>
                      <th style={{ width: 45 }}>{t('proforma.form2.leave', 'رخصت')}</th>
                      <th style={{ width: 55 }}>{t('proforma.form2.pct', 'فيصدي')}</th>
                      {/* GB */}
                      <th style={{ width: 65 }}>{t('proforma.form2.date', 'نيټه')}</th>
                      <th style={{ width: 55 }}>{t('proforma.form2.membership', 'ممبرشپ')}</th>
                      <th style={{ width: 45 }}>{t('proforma.form2.present', 'حاضر')}</th>
                      <th style={{ width: 45 }}>{t('proforma.form2.absent', 'غير')}</th>
                      <th style={{ width: 45 }}>{t('proforma.form2.leave', 'رخصت')}</th>
                      <th style={{ width: 55 }}>{t('proforma.form2.pct', 'فيصدي')}</th>
                      {/* PSO */}
                      <th style={{ width: 55 }}>{t('proforma.form2.psoMembership', 'ممبر شپ')}</th>
                      <th style={{ width: 55 }}>{t('proforma.form2.psoAttendees', 'حاضر شمير')}</th>
                      <th style={{ width: 55 }}>{t('proforma.form2.psoPct', 'فيصدي')}</th>
                      {/* Outreach */}
                      <th style={{ width: 55 }}>{t('proforma.form2.publicOutreach', 'اولسي')}</th>
                      <th style={{ width: 85 }}>{t('proforma.form2.inactiveContact', 'غير فعاله ملګرو')}</th>
                      <th style={{ width: 55 }}>{t('proforma.form2.orgOutreach', 'تنظيمي')}</th>
                      {/* Dues */}
                      <th style={{ width: 70 }}>{t('proforma.form2.unitDues', 'يونټ چنده')}</th>
                      <th style={{ width: 65 }}>{t('proforma.form2.emergencyDues', 'هنګامي')}</th>
                      <th style={{ width: 65 }}>{t('proforma.form2.expenses', 'خرڅ')}</th>
                      {/* Blood Bank */}
                      <th style={{ width: 50 }}>{t('proforma.form2.bloodPosts', 'پوستونه')}</th>
                      <th style={{ width: 65 }}>{t('proforma.form2.bloodCash', 'نغدي')}</th>
                      <th style={{ width: 65 }}>{t('proforma.form2.bloodTotalCash', 'ټولي نغدي')}</th>
                      <th style={{ width: 60 }}>{t('proforma.form2.zakat', 'زکات')}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {rows.length === 0 ? (
                      <tr>
                        <td colSpan={36} style={{ padding: 40, color: 'var(--text-soft)' }}>
                          {t('proforma.noUnits', 'No subordinate basic units registered yet.')}
                        </td>
                      </tr>
                    ) : (
                      rows
                        .map((r, originalIdx) => ({ ...r, _origIdx: originalIdx }))
                        .filter((r) => !form2Search.trim() || (r.unitName || '').toLowerCase().includes(form2Search.trim().toLowerCase()))
                        .map((r) => {
                          const idx = r._origIdx;
                          const rErr = form2Validation.rowErrors[idx] || {};
                          const hasRowError = rErr.hasError;

                          return (
                            <tr key={idx} style={{ borderBottom: '1px solid var(--border)', background: hasRowError ? 'rgba(239, 68, 68, 0.03)' : undefined }}>
                              <td
                                style={{
                                  padding: 4,
                                  position: 'sticky',
                                  [isRtl ? 'right' : 'left']: 0,
                                  background: 'var(--surface)',
                                  zIndex: 5,
                                  fontWeight: 'bold',
                                  color: hasRowError ? '#ef4444' : 'inherit',
                                }}
                                title={hasRowError ? [rErr.name, rErr.exec, rErr.gb, rErr.pso, rErr.finance].filter(Boolean).join(' | ') : undefined}
                              >
                                {hasRowError ? `⚠️ ${r.srNo || idx + 1}` : (r.srNo || idx + 1)}
                              </td>
                              <td style={{ padding: 4, position: 'sticky', [isRtl ? 'right' : 'left']: 40, background: 'var(--surface)', zIndex: 5 }}>
                                <input
                                  type="text"
                                  value={r.unitName || ''}
                                  onChange={(e) => updateForm2Row(idx, 'unitName', e.target.value)}
                                  placeholder={t('proforma.form2.unitName', 'Unit Name')}
                                  style={{
                                    width: '100%',
                                    padding: '3px 6px',
                                    fontWeight: 600,
                                    fontSize: 12,
                                    borderColor: rErr.name ? '#ef4444' : undefined,
                                    background: rErr.name ? 'rgba(239, 68, 68, 0.08)' : undefined,
                                  }}
                                />
                              </td>
                              {/* Exec */}
                              <td style={{ padding: 3 }}><input type="text" value={r.execMeetingDate || ''} onChange={(e) => updateForm2Row(idx, 'execMeetingDate', e.target.value)} placeholder="12/10" style={{ width: 55, textAlign: 'center', fontSize: 11 }} /></td>
                              <td style={{ padding: 3 }}><input type="text" value={r.execTotal ?? ''} onChange={(e) => updateForm2Row(idx, 'execTotal', e.target.value)} style={{ width: 40, textAlign: 'center', fontSize: 12, borderColor: rErr.exec ? '#ef4444' : undefined, background: rErr.exec ? 'rgba(239, 68, 68, 0.08)' : undefined }} /></td>
                              <td style={{ padding: 3 }}><input type="text" value={r.execPresent ?? ''} onChange={(e) => updateForm2Row(idx, 'execPresent', e.target.value)} style={{ width: 40, textAlign: 'center', fontSize: 12, color: '#22c55e', fontWeight: 'bold', borderColor: rErr.exec ? '#ef4444' : undefined, background: rErr.exec ? 'rgba(239, 68, 68, 0.08)' : undefined }} /></td>
                              <td style={{ padding: 3 }}><input type="text" value={r.execAbsent ?? ''} onChange={(e) => updateForm2Row(idx, 'execAbsent', e.target.value)} style={{ width: 40, textAlign: 'center', fontSize: 12, color: '#ef4444', borderColor: rErr.exec ? '#ef4444' : undefined, background: rErr.exec ? 'rgba(239, 68, 68, 0.08)' : undefined }} /></td>
                              <td style={{ padding: 3 }}><input type="text" value={r.execLeave ?? ''} onChange={(e) => updateForm2Row(idx, 'execLeave', e.target.value)} style={{ width: 40, textAlign: 'center', fontSize: 12, color: '#eab308', borderColor: rErr.exec ? '#ef4444' : undefined, background: rErr.exec ? 'rgba(239, 68, 68, 0.08)' : undefined }} /></td>
                              <td style={{ padding: 3, fontWeight: 'bold', fontSize: 11, color: '#0284c7' }}>{r.execPct ? (String(r.execPct).includes('%') ? r.execPct : `${r.execPct}%`) : ''}</td>
                              {/* GB */}
                              <td style={{ padding: 3 }}><input type="text" value={r.gbMeetingDate || ''} onChange={(e) => updateForm2Row(idx, 'gbMeetingDate', e.target.value)} placeholder="14/10" style={{ width: 55, textAlign: 'center', fontSize: 11 }} /></td>
                              <td style={{ padding: 3 }}><input type="text" value={r.gbTotalMembers ?? ''} onChange={(e) => updateForm2Row(idx, 'gbTotalMembers', e.target.value)} style={{ width: 45, textAlign: 'center', fontSize: 12, borderColor: rErr.gb ? '#ef4444' : undefined, background: rErr.gb ? 'rgba(239, 68, 68, 0.08)' : undefined }} /></td>
                              <td style={{ padding: 3 }}><input type="text" value={r.gbPresent ?? ''} onChange={(e) => updateForm2Row(idx, 'gbPresent', e.target.value)} style={{ width: 40, textAlign: 'center', fontSize: 12, color: '#22c55e', fontWeight: 'bold', borderColor: rErr.gb ? '#ef4444' : undefined, background: rErr.gb ? 'rgba(239, 68, 68, 0.08)' : undefined }} /></td>
                              <td style={{ padding: 3 }}><input type="text" value={r.gbAbsent ?? ''} onChange={(e) => updateForm2Row(idx, 'gbAbsent', e.target.value)} style={{ width: 40, textAlign: 'center', fontSize: 12, color: '#ef4444', borderColor: rErr.gb ? '#ef4444' : undefined, background: rErr.gb ? 'rgba(239, 68, 68, 0.08)' : undefined }} /></td>
                              <td style={{ padding: 3 }}><input type="text" value={r.gbLeave ?? ''} onChange={(e) => updateForm2Row(idx, 'gbLeave', e.target.value)} style={{ width: 40, textAlign: 'center', fontSize: 12, color: '#eab308', borderColor: rErr.gb ? '#ef4444' : undefined, background: rErr.gb ? 'rgba(239, 68, 68, 0.08)' : undefined }} /></td>
                              <td style={{ padding: 3, fontWeight: 'bold', fontSize: 11, color: '#10b981' }}>{r.gbPct ? (String(r.gbPct).includes('%') ? r.gbPct : `${r.gbPct}%`) : ''}</td>
                              {/* Education & PSO */}
                              <td style={{ padding: 3 }}><input type="text" value={r.studyReading ?? ''} onChange={(e) => updateForm2Row(idx, 'studyReading', e.target.value)} style={{ width: 45, textAlign: 'center' }} /></td>
                              <td style={{ padding: 3 }}><input type="text" value={r.seminarCount ?? ''} onChange={(e) => updateForm2Row(idx, 'seminarCount', e.target.value)} style={{ width: 40, textAlign: 'center' }} /></td>
                              <td style={{ padding: 3 }}><input type="text" value={r.studyCircleCount ?? ''} onChange={(e) => updateForm2Row(idx, 'studyCircleCount', e.target.value)} style={{ width: 40, textAlign: 'center' }} /></td>
                              <td style={{ padding: 3 }}><input type="text" value={r.newMembers ?? ''} onChange={(e) => updateForm2Row(idx, 'newMembers', e.target.value)} style={{ width: 45, textAlign: 'center' }} /></td>
                              <td style={{ padding: 3 }}><input type="text" value={r.psoMembership ?? ''} onChange={(e) => updateForm2Row(idx, 'psoMembership', e.target.value)} style={{ width: 45, textAlign: 'center', borderColor: rErr.pso ? '#ef4444' : undefined, background: rErr.pso ? 'rgba(239, 68, 68, 0.08)' : undefined }} /></td>
                              <td style={{ padding: 3 }}><input type="text" value={r.psoAttendees ?? ''} onChange={(e) => updateForm2Row(idx, 'psoAttendees', e.target.value)} style={{ width: 45, textAlign: 'center', borderColor: rErr.pso ? '#ef4444' : undefined, background: rErr.pso ? 'rgba(239, 68, 68, 0.08)' : undefined }} /></td>
                              <td style={{ padding: 3, fontWeight: 'bold', fontSize: 11, color: '#8b5cf6' }}>{r.psoPct ? (String(r.psoPct).includes('%') ? r.psoPct : `${r.psoPct}%`) : ''}</td>
                              {/* Gatherings & Outreach */}
                              <td style={{ padding: 3 }}><input type="text" value={r.publicEventsCount ?? ''} onChange={(e) => updateForm2Row(idx, 'publicEventsCount', e.target.value)} style={{ width: 50, textAlign: 'center' }} /></td>
                              <td style={{ padding: 3 }}><input type="text" value={r.inductionPrograms ?? ''} onChange={(e) => updateForm2Row(idx, 'inductionPrograms', e.target.value)} style={{ width: 45, textAlign: 'center' }} /></td>
                              <td style={{ padding: 3 }}><input type="text" value={r.publicOutreach ?? ''} onChange={(e) => updateForm2Row(idx, 'publicOutreach', e.target.value)} style={{ width: 45, textAlign: 'center' }} /></td>
                              <td style={{ padding: 3 }}><input type="text" value={r.inactiveContact ?? ''} onChange={(e) => updateForm2Row(idx, 'inactiveContact', e.target.value)} style={{ width: 55, textAlign: 'center' }} /></td>
                              <td style={{ padding: 3 }}><input type="text" value={r.orgOutreach ?? ''} onChange={(e) => updateForm2Row(idx, 'orgOutreach', e.target.value)} style={{ width: 45, textAlign: 'center' }} /></td>
                              {/* Finances */}
                              <td style={{ padding: 3 }}><input type="text" value={r.unitDonations ?? ''} onChange={(e) => updateForm2Row(idx, 'unitDonations', e.target.value)} style={{ width: 60, textAlign: 'center', borderColor: rErr.finance ? '#ef4444' : undefined, background: rErr.finance ? 'rgba(239, 68, 68, 0.08)' : undefined }} /></td>
                              <td style={{ padding: 3 }}><input type="text" value={r.emergencyDonations ?? ''} onChange={(e) => updateForm2Row(idx, 'emergencyDonations', e.target.value)} style={{ width: 55, textAlign: 'center', borderColor: rErr.finance ? '#ef4444' : undefined, background: rErr.finance ? 'rgba(239, 68, 68, 0.08)' : undefined }} /></td>
                              <td style={{ padding: 3 }}><input type="text" value={r.totalExpenses ?? ''} onChange={(e) => updateForm2Row(idx, 'totalExpenses', e.target.value)} style={{ width: 55, textAlign: 'center', borderColor: rErr.finance ? '#ef4444' : undefined, background: rErr.finance ? 'rgba(239, 68, 68, 0.08)' : undefined }} /></td>
                              {/* Discipline & Blood Bank */}
                              <td style={{ padding: 3 }}><input type="text" value={r.disciplinaryAction || ''} onChange={(e) => updateForm2Row(idx, 'disciplinaryAction', e.target.value)} style={{ width: 65, textAlign: 'center' }} /></td>
                              <td style={{ padding: 3 }}><input type="text" value={r.bloodPosts ?? ''} onChange={(e) => updateForm2Row(idx, 'bloodPosts', e.target.value)} style={{ width: 45, textAlign: 'center' }} /></td>
                              <td style={{ padding: 3 }}><input type="text" value={r.bloodCash ?? ''} onChange={(e) => updateForm2Row(idx, 'bloodCash', e.target.value)} style={{ width: 55, textAlign: 'center', borderColor: rErr.finance ? '#ef4444' : undefined, background: rErr.finance ? 'rgba(239, 68, 68, 0.08)' : undefined }} /></td>
                              <td style={{ padding: 3 }}><input type="text" value={r.bloodTotalCash ?? ''} onChange={(e) => updateForm2Row(idx, 'bloodTotalCash', e.target.value)} style={{ width: 55, textAlign: 'center', borderColor: rErr.finance ? '#ef4444' : undefined, background: rErr.finance ? 'rgba(239, 68, 68, 0.08)' : undefined }} /></td>
                              <td style={{ padding: 3 }}><input type="text" value={r.zakat ?? ''} onChange={(e) => updateForm2Row(idx, 'zakat', e.target.value)} style={{ width: 50, textAlign: 'center', borderColor: rErr.finance ? '#ef4444' : undefined, background: rErr.finance ? 'rgba(239, 68, 68, 0.08)' : undefined }} /></td>
                              {/* Status */}
                              <td style={{ padding: 3 }}>
                                <select
                                  value={r.unitStatus || 'فعاله'}
                                  onChange={(e) => updateForm2Row(idx, 'unitStatus', e.target.value)}
                                  style={{ padding: '2px 4px', fontSize: 11, fontWeight: 600 }}
                                >
                                  <option value="فعاله">{t('proforma.active', 'فعاله')}</option>
                                  <option value="غير فعاله">{t('proforma.inactive', 'غير فعاله')}</option>
                                </select>
                              </td>
                              {/* Delete */}
                              <td style={{ padding: 3 }}>
                                <button
                                  type="button"
                                  onClick={() => removeForm2Row(idx)}
                                  style={{ background: 'none', border: 'none', color: '#ef4444', cursor: 'pointer', fontSize: 14 }}
                                  title={t('proforma.form2.remove', 'Remove Unit')}
                                >
                                  ✕
                                </button>
                              </td>
                            </tr>
                          );
                        })
                    )}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        ) : formType === 'form4' ? (
          /* FORM 4 UPPER DASHBOARD CARDS */
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            {/* Card 1: Executive & General Body Meetings */}
            <div className="card">
              <h3 style={{ marginTop: 0, marginBottom: 14, color: 'var(--primary, #38bdf8)', display: 'flex', alignItems: 'center', gap: 8 }}>
                <span>🤝</span> {t('proforma.form4MeetingsTitle', 'يونټ ايګزيکټيو او جنرل باډي غونډي (Unit Meetings)')}
              </h3>

              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: 16 }}>
                {/* Unit Executive Meeting */}
                <div style={{ background: 'var(--surface-alt)', padding: 14, borderRadius: 8, border: '1px solid var(--border)' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12, flexWrap: 'wrap', gap: 8 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                      <strong style={{ fontSize: 14 }}>{t('proforma.form4ExecMeeting', 'يونټ ايګزيکټيو غونډي (Executive Meeting)')}</strong>
                      {form4ExecSlots > 0 && (
                        form4ExecSum === form4ExecSlots ? (
                          <span style={{ fontSize: 11, padding: '2px 8px', borderRadius: 4, background: 'rgba(34, 197, 94, 0.15)', color: '#22c55e', border: '1px solid #22c55e', fontWeight: 600 }}>
                            ✓ {t('proforma.balanceCorrect', 'Balanced')}: {form4ExecPres + form4ExecAbs + form4ExecLeave}/{form4ExecSlots}
                          </span>
                        ) : (
                          <span style={{ fontSize: 11, padding: '2px 8px', borderRadius: 4, background: 'rgba(234, 179, 8, 0.15)', color: '#eab308', border: '1px solid #eab308', fontWeight: 600 }}>
                            ⚠️ {form4ExecSum}/{form4ExecSlots} ({form4ExecSlots - form4ExecSum > 0 ? `+${form4ExecSlots - form4ExecSum} left` : `${form4ExecSum - form4ExecSlots} over`})
                          </span>
                        )
                      )}
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <button
                        type="button"
                        onClick={handleAutoBalanceExec}
                        className="btn secondary"
                        style={{ padding: '3px 8px', fontSize: 11, fontWeight: 600, borderColor: '#0284c7', color: '#38bdf8' }}
                        title={t('proforma.autoBalance', 'Auto-Balance attendance to match Total Slots')}
                      >
                        ⚡ {t('proforma.autoBalance', 'Auto-Balance')}
                      </button>
                      <span className="badge ACTIVE" style={{ fontSize: 13, fontWeight: 'bold' }}>
                        {calcForm4ExecPct}
                      </span>
                    </div>
                  </div>

                  <div className="form-grid" style={{ gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                    <div className="field">
                      <label style={{ fontSize: 12 }}>{t('proforma.meetingDate', 'غونډي نيټه (Meeting Date)')}</label>
                      <input
                        type="text"
                        value={upper.execDate || ''}
                        onChange={(e) => updateUpper('execDate', e.target.value)}
                        placeholder="12/10"
                        style={{ padding: '5px 8px', fontSize: 13 }}
                      />
                    </div>

                    <div className="field">
                      <label style={{ fontSize: 12 }}>{t('proforma.totalMembers', 'ايګزيکټيو شمير (Total Slots)')}</label>
                      <NumberStepper
                        value={upper.execSlots ?? ''}
                        onChange={(val) => updateUpper('execSlots', val)}
                      />
                    </div>

                    <div className="field">
                      <label style={{ fontSize: 12, color: '#22c55e' }}>{t('proforma.present', 'حاضر (Present)')}</label>
                      <NumberStepper
                        value={upper.execPresent ?? ''}
                        max={form4ExecSlots > 0 ? form4ExecSlots : Infinity}
                        onChange={(val) => updateUpper('execPresent', val)}
                      />
                    </div>

                    <div className="field">
                      <label style={{ fontSize: 12, color: '#ef4444' }}>{t('proforma.absent', 'غيرحاضر (Absent)')}</label>
                      <NumberStepper
                        value={upper.execAbsent ?? ''}
                        onChange={(val) => updateUpper('execAbsent', val)}
                      />
                    </div>

                    <div className="field">
                      <label style={{ fontSize: 12, color: '#eab308' }}>{t('proforma.leave', 'رخصت (Leave)')}</label>
                      <NumberStepper
                        value={upper.execLeave ?? ''}
                        onChange={(val) => updateUpper('execLeave', val)}
                      />
                    </div>

                    <div className="field">
                      <label style={{ fontSize: 12 }}>{t('proforma.attendancePct', 'حاضري فيصدي (%)')}</label>
                      <input
                        type="text"
                        value={upper.execPct || calcForm4ExecPct}
                        onChange={(e) => updateUpper('execPct', e.target.value)}
                        style={{ textAlign: 'center', fontWeight: 'bold' }}
                      />
                    </div>
                  </div>
                </div>

                {/* Unit General Body Meeting */}
                <div style={{ background: 'var(--surface-alt)', padding: 14, borderRadius: 8, border: '1px solid var(--border)' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12, flexWrap: 'wrap', gap: 8 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                      <strong style={{ fontSize: 14 }}>{t('proforma.form4GbMeeting', 'يونټ جنرل باډي غونډي (General Body Meeting)')}</strong>
                      {form4GbMembers > 0 && (
                        form4GbSum === form4GbMembers ? (
                          <span style={{ fontSize: 11, padding: '2px 8px', borderRadius: 4, background: 'rgba(34, 197, 94, 0.15)', color: '#22c55e', border: '1px solid #22c55e', fontWeight: 600 }}>
                            ✓ {t('proforma.balanceCorrect', 'Balanced')}: {form4GbPres + form4GbAbs + form4GbLeave}/{form4GbMembers}
                          </span>
                        ) : (
                          <span style={{ fontSize: 11, padding: '2px 8px', borderRadius: 4, background: 'rgba(234, 179, 8, 0.15)', color: '#eab308', border: '1px solid #eab308', fontWeight: 600 }}>
                            ⚠️ {form4GbSum}/{form4GbMembers} ({form4GbMembers - form4GbSum > 0 ? `+${form4GbMembers - form4GbSum} left` : `${form4GbSum - form4GbMembers} over`})
                          </span>
                        )
                      )}
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <button
                        type="button"
                        onClick={handleAutoBalanceGb}
                        className="btn secondary"
                        style={{ padding: '3px 8px', fontSize: 11, fontWeight: 600, borderColor: '#0284c7', color: '#38bdf8' }}
                        title={t('proforma.autoBalance', 'Auto-Balance attendance to match Total Members')}
                      >
                        ⚡ {t('proforma.autoBalance', 'Auto-Balance')}
                      </button>
                      <span className="badge ACTIVE" style={{ fontSize: 13, fontWeight: 'bold' }}>
                        {calcForm4GbPct}
                      </span>
                    </div>
                  </div>

                  <div className="form-grid" style={{ gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                    <div className="field">
                      <label style={{ fontSize: 12 }}>{t('proforma.meetingDate', 'غونډي نيټه (Meeting Date)')}</label>
                      <input
                        type="text"
                        value={upper.gbDate || ''}
                        onChange={(e) => updateUpper('gbDate', e.target.value)}
                        placeholder="14/10"
                        style={{ padding: '5px 8px', fontSize: 13 }}
                      />
                    </div>

                    <div className="field">
                      <label style={{ fontSize: 12 }}>{t('proforma.totalMembers', 'يونټ ممبر شپ (Total Members)')}</label>
                      <NumberStepper
                        value={upper.gbMembers ?? ''}
                        onChange={(val) => updateUpper('gbMembers', val)}
                      />
                    </div>

                    <div className="field">
                      <label style={{ fontSize: 12, color: '#22c55e' }}>{t('proforma.present', 'حاضر (Present)')}</label>
                      <NumberStepper
                        value={upper.gbPresent ?? ''}
                        max={form4GbMembers > 0 ? form4GbMembers : Infinity}
                        onChange={(val) => updateUpper('gbPresent', val)}
                      />
                    </div>

                    <div className="field">
                      <label style={{ fontSize: 12, color: '#ef4444' }}>{t('proforma.absent', 'غيرحاضر (Absent)')}</label>
                      <NumberStepper
                        value={upper.gbAbsent ?? ''}
                        onChange={(val) => updateUpper('gbAbsent', val)}
                      />
                    </div>

                    <div className="field">
                      <label style={{ fontSize: 12, color: '#eab308' }}>{t('proforma.leave', 'رخصت (Leave)')}</label>
                      <NumberStepper
                        value={upper.gbLeave ?? ''}
                        onChange={(val) => updateUpper('gbLeave', val)}
                      />
                    </div>

                    <div className="field">
                      <label style={{ fontSize: 12 }}>{t('proforma.attendancePct', 'حاضري فيصدي (%)')}</label>
                      <input
                        type="text"
                        value={upper.gbPct || calcForm4GbPct}
                        onChange={(e) => updateUpper('gbPct', e.target.value)}
                        style={{ textAlign: 'center', fontWeight: 'bold' }}
                      />
                    </div>
                  </div>
                </div>
              </div>
            </div>

            {/* Card 2: PSO (Student Wing) & Ideological Education */}
            <div className="card">
              <h3 style={{ marginTop: 0, marginBottom: 14, color: 'var(--primary, #38bdf8)', display: 'flex', alignItems: 'center', gap: 8 }}>
                <span>🎓</span> {t('proforma.form4PsoTitle', 'پي ايس او يونټ او لوستنه (PSO Wing & Reading)')}
              </h3>

              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 14 }}>
                <div style={{ background: 'var(--surface-alt)', padding: 12, borderRadius: 8, border: '1px solid var(--border)' }}>
                  <label style={{ display: 'block', fontSize: 12, marginBottom: 6, fontWeight: 600 }}>{t('proforma.form4PsoMembers', 'پي ايس او غړو شمير (PSO Members)')}</label>
                  <NumberStepper
                    value={upper.psoMembers ?? ''}
                    onChange={(val) => updateUpper('psoMembers', val)}
                  />
                </div>

                <div style={{ background: 'var(--surface-alt)', padding: 12, borderRadius: 8, border: '1px solid var(--border)' }}>
                  <label style={{ display: 'block', fontSize: 12, marginBottom: 6, fontWeight: 600, color: '#22c55e' }}>{t('proforma.form4PsoPresent', 'غونډه کي حاضر شمير (Present)')}</label>
                  <NumberStepper
                    value={upper.psoPresent ?? ''}
                    max={form4PsoMembers > 0 ? form4PsoMembers : Infinity}
                    onChange={(val) => updateUpper('psoPresent', val)}
                  />
                </div>

                <div style={{ background: 'var(--surface-alt)', padding: 12, borderRadius: 8, border: '1px solid var(--border)' }}>
                  <label style={{ display: 'block', fontSize: 12, marginBottom: 6, fontWeight: 600, color: '#38bdf8' }}>{t('proforma.form4PsoAttendancePct', 'حاضر فيصدي (PSO Attendance %)')}</label>
                  <input
                    type="text"
                    value={upper.psoPct || calcForm4PsoPct}
                    onChange={(e) => updateUpper('psoPct', e.target.value)}
                    style={{ width: '100%', textAlign: 'center', fontWeight: 'bold', padding: '6px' }}
                  />
                </div>

                <div style={{ background: 'var(--surface-alt)', padding: 12, borderRadius: 8, border: '1px solid var(--border)' }}>
                  <label style={{ display: 'block', fontSize: 12, marginBottom: 6, fontWeight: 600, color: '#a855f7' }}>{t('proforma.form4Reading', 'لوستنه / مطالعه (Reading)')}</label>
                  <NumberStepper
                    value={upper.reading ?? ''}
                    onChange={(val) => updateUpper('reading', val)}
                  />
                </div>
              </div>
            </div>

            {/* Card 3: Activities, Programs & Outreach */}
            <div className="card">
              <h3 style={{ marginTop: 0, marginBottom: 14, color: 'var(--primary, #38bdf8)', display: 'flex', alignItems: 'center', gap: 8 }}>
                <span>📢</span> {t('proforma.form4ActivitiesTitle', 'فعاليتونه، پروګرامونه او اولسي رابطه (Activities & Outreach)')}
              </h3>

              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 14 }}>
                <div style={{ background: 'var(--surface-alt)', padding: 12, borderRadius: 8, border: '1px solid var(--border)' }}>
                  <label style={{ display: 'block', fontSize: 12, marginBottom: 6, fontWeight: 600 }}>{t('proforma.form4Seminar', 'سيمينار (Seminar)')}</label>
                  <NumberStepper
                    value={upper.seminar ?? ''}
                    onChange={(val) => updateUpper('seminar', val)}
                  />
                </div>

                <div style={{ background: 'var(--surface-alt)', padding: 12, borderRadius: 8, border: '1px solid var(--border)' }}>
                  <label style={{ display: 'block', fontSize: 12, marginBottom: 6, fontWeight: 600 }}>{t('proforma.form4StudyCircle', 'سټډي سرکل (Study Circle)')}</label>
                  <NumberStepper
                    value={upper.studyCircle ?? ''}
                    onChange={(val) => updateUpper('studyCircle', val)}
                  />
                </div>

                <div style={{ background: 'var(--surface-alt)', padding: 12, borderRadius: 8, border: '1px solid var(--border)' }}>
                  <label style={{ display: 'block', fontSize: 12, marginBottom: 6, fontWeight: 600, color: '#22c55e' }}>{t('proforma.form4NewMembers', 'نوي شموليت (New Joinees)')}</label>
                  <NumberStepper
                    value={upper.newMembers ?? ''}
                    onChange={(val) => updateUpper('newMembers', val)}
                  />
                </div>

                <div style={{ background: 'var(--surface-alt)', padding: 12, borderRadius: 8, border: '1px solid var(--border)' }}>
                  <label style={{ display: 'block', fontSize: 12, marginBottom: 6, fontWeight: 600, color: '#38bdf8' }}>{t('proforma.form4PublicEvents', 'اولسي غونډي / پروګرام')}</label>
                  <NumberStepper
                    value={upper.publicEvents ?? ''}
                    onChange={(val) => updateUpper('publicEvents', val)}
                  />
                </div>

                <div style={{ background: 'var(--surface-alt)', padding: 12, borderRadius: 8, border: '1px solid var(--border)' }}>
                  <label style={{ display: 'block', fontSize: 12, marginBottom: 6, fontWeight: 600, color: '#eab308' }}>{t('proforma.form4InactiveContact', 'غير فعاله ملګرو سره رابطه')}</label>
                  <NumberStepper
                    value={upper.inactiveContact ?? ''}
                    onChange={(val) => updateUpper('inactiveContact', val)}
                  />
                </div>

                <div style={{ background: 'var(--surface-alt)', padding: 12, borderRadius: 8, border: '1px solid var(--border)' }}>
                  <label style={{ display: 'block', fontSize: 12, marginBottom: 6, fontWeight: 600 }}>{t('proforma.form4PublicOutreach', 'اولس سره رابطه (Public Outreach)')}</label>
                  <NumberStepper
                    value={upper.publicOutreach ?? ''}
                    onChange={(val) => updateUpper('publicOutreach', val)}
                  />
                </div>
              </div>
            </div>

            {/* Card 4: Finances & Dues */}
            <div className="card">
              <h3 style={{ marginTop: 0, marginBottom: 14, color: 'var(--primary, #38bdf8)', display: 'flex', alignItems: 'center', gap: 8 }}>
                <span>💰</span> {t('proforma.form4FinancesTitle', 'چنده او مالي چارې (Finances & Dues - PKR)')}
              </h3>

              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 14 }}>
                <div style={{ background: 'var(--surface-alt)', padding: 12, borderRadius: 8, border: '1px solid var(--border)' }}>
                  <label style={{ display: 'block', fontSize: 12, marginBottom: 6, fontWeight: 600 }}>{t('proforma.form4OrgDues', 'تنظيمي چنده (Org Dues)')}</label>
                  <input
                    type="number"
                    value={upper.orgDonations ?? ''}
                    onChange={(e) => updateUpper('orgDonations', e.target.value)}
                    placeholder="8000"
                    style={{ width: '100%', padding: '6px', fontWeight: 600 }}
                  />
                </div>

                <div style={{ background: 'var(--surface-alt)', padding: 12, borderRadius: 8, border: '1px solid var(--border)' }}>
                  <label style={{ display: 'block', fontSize: 12, marginBottom: 6, fontWeight: 600 }}>{t('proforma.form4EmergencyDues', 'هنګامي چنده (Emergency Dues)')}</label>
                  <input
                    type="number"
                    value={upper.emergencyDonations ?? ''}
                    onChange={(e) => updateUpper('emergencyDonations', e.target.value)}
                    placeholder="0"
                    style={{ width: '100%', padding: '6px', fontWeight: 600 }}
                  />
                </div>

                <div style={{ background: 'var(--surface-alt)', padding: 12, borderRadius: 8, border: '1px solid var(--border)' }}>
                  <label style={{ display: 'block', fontSize: 12, marginBottom: 6, fontWeight: 600, color: '#ef4444' }}>{t('proforma.form4Expenses', 'خرڅ (Expenses)')}</label>
                  <input
                    type="number"
                    value={upper.expenses ?? ''}
                    onChange={(e) => updateUpper('expenses', e.target.value)}
                    placeholder="2250"
                    style={{ width: '100%', padding: '6px', fontWeight: 600 }}
                  />
                </div>

                <div style={{ background: 'var(--surface-alt)', padding: 12, borderRadius: 8, border: '1px solid var(--border)' }}>
                  <label style={{ display: 'block', fontSize: 12, marginBottom: 6, fontWeight: 600, color: calcForm4NetFinance >= 0 ? '#22c55e' : '#ef4444' }}>
                    {t('proforma.form4NetBalance', 'خالص پاتې / بيلانس (Net Balance)')}
                  </label>
                  <div style={{ padding: '6px 10px', fontWeight: 'bold', fontSize: 15, color: calcForm4NetFinance >= 0 ? '#22c55e' : '#ef4444' }}>
                    PKR {calcForm4NetFinance.toLocaleString()}
                  </div>
                </div>
              </div>
            </div>

            {/* Card 5: Discipline, Blood Bank & Households */}
            <div className="card">
              <h3 style={{ marginTop: 0, marginBottom: 14, color: 'var(--primary, #38bdf8)', display: 'flex', alignItems: 'center', gap: 8 }}>
                <span>🩸</span> {t('proforma.form4BloodBankTitle', 'تاديبي کاروائي، بلډ بينک او کورونه (Discipline, Blood Bank & Households)')}
              </h3>

              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 14 }}>
                <div style={{ background: 'var(--surface-alt)', padding: 12, borderRadius: 8, border: '1px solid var(--border)' }}>
                  <label style={{ display: 'block', fontSize: 12, marginBottom: 6, fontWeight: 600 }}>{t('proforma.form4Disciplinary', 'تاديبي کاروائي (Disciplinary)')}</label>
                  <input
                    type="text"
                    value={upper.disciplinary ?? ''}
                    onChange={(e) => updateUpper('disciplinary', e.target.value)}
                    placeholder="-"
                    style={{ width: '100%', padding: '6px' }}
                  />
                </div>

                <div style={{ background: 'var(--surface-alt)', padding: 12, borderRadius: 8, border: '1px solid var(--border)' }}>
                  <label style={{ display: 'block', fontSize: 12, marginBottom: 6, fontWeight: 600 }}>{t('proforma.form4Households', 'ټولو کورو شمير (Households)')}</label>
                  <NumberStepper
                    value={upper.totalHouseholds ?? ''}
                    onChange={(val) => updateUpper('totalHouseholds', val)}
                  />
                </div>

                <div style={{ background: 'var(--surface-alt)', padding: 12, borderRadius: 8, border: '1px solid var(--border)' }}>
                  <label style={{ display: 'block', fontSize: 12, marginBottom: 6, fontWeight: 600 }}>{t('proforma.form4BloodPosts', 'بلډ بينک پوستونه (Appeals)')}</label>
                  <NumberStepper
                    value={upper.bloodPosts ?? ''}
                    onChange={(val) => updateUpper('bloodPosts', val)}
                  />
                </div>

                <div style={{ background: 'var(--surface-alt)', padding: 12, borderRadius: 8, border: '1px solid var(--border)' }}>
                  <label style={{ display: 'block', fontSize: 12, marginBottom: 6, fontWeight: 600 }}>{t('proforma.form4BloodCash', 'بلډ بينک نغدي (Cash PKR)')}</label>
                  <input
                    type="text"
                    value={upper.bloodCash ?? ''}
                    onChange={(e) => updateUpper('bloodCash', e.target.value)}
                    placeholder="0"
                    style={{ width: '100%', padding: '6px' }}
                  />
                </div>

                <div style={{ background: 'var(--surface-alt)', padding: 12, borderRadius: 8, border: '1px solid var(--border)' }}>
                  <label style={{ display: 'block', fontSize: 12, marginBottom: 6, fontWeight: 600 }}>{t('proforma.form4BloodTotalCash', 'ټولي نغدي (Total Cash)')}</label>
                  <input
                    type="text"
                    value={upper.bloodTotalCash ?? ''}
                    onChange={(e) => updateUpper('bloodTotalCash', e.target.value)}
                    placeholder="0"
                    style={{ width: '100%', padding: '6px' }}
                  />
                </div>

                <div style={{ background: 'var(--surface-alt)', padding: 12, borderRadius: 8, border: '1px solid var(--border)' }}>
                  <label style={{ display: 'block', fontSize: 12, marginBottom: 6, fontWeight: 600 }}>{t('proforma.form4Zakat', 'زکات (Zakat PKR)')}</label>
                  <input
                    type="text"
                    value={upper.zakat ?? ''}
                    onChange={(e) => updateUpper('zakat', e.target.value)}
                    placeholder="0"
                    style={{ width: '100%', padding: '6px' }}
                  />
                </div>
              </div>
            </div>
          </div>
        ) : (
          /* FORM 1 UPPER DASHBOARD CARDS */
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            {/* Card 1: Executive & Committee Meetings */}
            <div className="card">
              <h3 style={{ marginTop: 0, marginBottom: 14, color: 'var(--primary, #38bdf8)', display: 'flex', alignItems: 'center', gap: 8 }}>
                <span>🤝</span> {t('proforma.meetingsSummary', 'Area Executive & Committee Meetings Summary')}
              </h3>

              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: 16 }}>
                {/* Area Executive Meeting */}
                <div style={{ background: 'var(--surface-alt)', padding: 14, borderRadius: 8, border: '1px solid var(--border)' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
                    <strong style={{ fontSize: 14 }}>{t('proforma.execMeetingTitle', 'Area Executive Meeting')}</strong>
                    <span className="badge ACTIVE" style={{ fontSize: 13, fontWeight: 'bold' }}>
                      {calcExecPct}
                    </span>
                  </div>

                  <div className="form-grid" style={{ gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                    <div className="field">
                      <label style={{ fontSize: 12 }}>{t('proforma.meetingDate', 'Meeting Date')}</label>
                      <input
                        type="text"
                        value={upper.execDate || formData.executiveMeetingDate || ''}
                        onChange={(e) => {
                          updateUpper('execDate', e.target.value);
                          updateField('executiveMeetingDate', e.target.value);
                        }}
                        placeholder="24 Oct 2026"
                        style={{ padding: '5px 8px', fontSize: 13 }}
                      />
                    </div>

                    <div className="field">
                      <label style={{ fontSize: 12 }}>{t('proforma.totalMembers', 'Total Slots')}</label>
                      <NumberStepper
                        value={upper.execSlots ?? formData.executiveSlots}
                        onChange={(val) => { updateUpper('execSlots', val); updateField('executiveSlots', val); }}
                      />
                    </div>

                    <div className="field">
                      <label style={{ fontSize: 12, color: '#22c55e' }}>{t('proforma.present', 'Present')}</label>
                      <NumberStepper
                        value={upper.execPresent ?? formData.executivePresent}
                        max={execTotal > 0 ? execTotal : Infinity}
                        onChange={(val) => { updateUpper('execPresent', val); updateField('executivePresent', val); }}
                      />
                    </div>

                    <div className="field">
                      <label style={{ fontSize: 12, color: '#ef4444' }}>{t('proforma.absent', 'Absent')}</label>
                      <NumberStepper
                        value={upper.execAbsent ?? formData.executiveAbsent}
                        onChange={(val) => { updateUpper('execAbsent', val); updateField('executiveAbsent', val); }}
                      />
                    </div>

                    <div className="field">
                      <label style={{ fontSize: 12, color: '#eab308' }}>{t('proforma.leave', 'Leave')}</label>
                      <NumberStepper
                        value={upper.execLeave ?? formData.executiveLeave}
                        onChange={(val) => { updateUpper('execLeave', val); updateField('executiveLeave', val); }}
                      />
                    </div>

                    <div className="field">
                      <label style={{ fontSize: 12 }}>{t('proforma.attendancePct', 'Attendance %')}</label>
                      <input
                        type="text"
                        value={upper.execPct || calcExecPct}
                        onChange={(e) => updateUpper('execPct', e.target.value)}
                        style={{ textAlign: 'center', fontWeight: 'bold' }}
                      />
                    </div>
                  </div>
                </div>

                {/* Area Committee Meeting */}
                <div style={{ background: 'var(--surface-alt)', padding: 14, borderRadius: 8, border: '1px solid var(--border)' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
                    <strong style={{ fontSize: 14 }}>{t('proforma.commMeetingTitle', 'Area Committee Meeting')}</strong>
                    <span className="badge ACTIVE" style={{ fontSize: 13, fontWeight: 'bold' }}>
                      {calcCommPct}
                    </span>
                  </div>

                  <div className="form-grid" style={{ gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                    <div className="field">
                      <label style={{ fontSize: 12 }}>{t('proforma.commTotal', 'Committee Members')}</label>
                      <NumberStepper
                        value={upper.commTotal ?? formData.committeeTotal}
                        onChange={(val) => { updateUpper('commTotal', val); updateField('committeeTotal', val); }}
                      />
                    </div>

                    <div className="field">
                      <label style={{ fontSize: 12, color: '#22c55e' }}>{t('proforma.present', 'Present')}</label>
                      <NumberStepper
                        value={upper.commPresent ?? formData.committeePresent}
                        max={commTotal > 0 ? commTotal : Infinity}
                        onChange={(val) => { updateUpper('commPresent', val); updateField('committeePresent', val); }}
                      />
                    </div>

                    <div className="field">
                      <label style={{ fontSize: 12, color: '#ef4444' }}>{t('proforma.absent', 'Absent')}</label>
                      <NumberStepper
                        value={upper.commAbsent ?? formData.committeeAbsent}
                        onChange={(val) => { updateUpper('commAbsent', val); updateField('committeeAbsent', val); }}
                      />
                    </div>

                    <div className="field">
                      <label style={{ fontSize: 12, color: '#eab308' }}>{t('proforma.leave', 'Leave')}</label>
                      <NumberStepper
                        value={upper.commLeave ?? formData.committeeLeave}
                        onChange={(val) => { updateUpper('commLeave', val); updateField('committeeLeave', val); }}
                      />
                    </div>

                    <div className="field" style={{ gridColumn: 'span 2' }}>
                      <label style={{ fontSize: 12 }}>{t('proforma.attendancePct', 'Attendance %')}</label>
                      <input
                        type="text"
                        value={upper.commPct || calcCommPct}
                        onChange={(e) => updateUpper('commPct', e.target.value)}
                        style={{ textAlign: 'center', fontWeight: 'bold' }}
                      />
                    </div>
                  </div>
                </div>
              </div>
            </div>

            {/* Card 2: Subordinate Basic Units Meetings */}
            <div className="card">
              <h3 style={{ marginTop: 0, marginBottom: 14, color: 'var(--primary, #38bdf8)', display: 'flex', alignItems: 'center', gap: 8 }}>
                <span>🏢</span> {t('proforma.subordinateUnits', 'Subordinate Basic Units Activity Summary')}
              </h3>

              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: 16 }}>
                {/* BU Executive Meetings */}
                <div style={{ background: 'var(--surface-alt)', padding: 14, borderRadius: 8, border: '1px solid var(--border)' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
                    <strong style={{ fontSize: 14 }}>{t('proforma.buExecMeetingsTitle', 'Basic Units Executive Meetings')}</strong>
                    <span className="badge ACTIVE" style={{ fontSize: 13, fontWeight: 'bold' }}>
                      {calcBuExecPct}
                    </span>
                  </div>

                  <div className="form-grid" style={{ gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                    <div className="field">
                      <label style={{ fontSize: 12 }}>{t('proforma.buExecMeetingsTotal', 'Exec Meetings Total')}</label>
                      <NumberStepper
                        value={upper.buExecCount ?? ''}
                        onChange={(val) => updateUpper('buExecCount', val)}
                      />
                    </div>

                    <div className="field">
                      <label style={{ fontSize: 12, color: '#22c55e' }}>{t('proforma.buExecMeetingsPresent', 'Attended/Held Meetings')}</label>
                      <NumberStepper
                        value={upper.buExecPresent ?? ''}
                        onChange={(val) => updateUpper('buExecPresent', val)}
                      />
                    </div>

                    <div className="field" style={{ gridColumn: 'span 2' }}>
                      <label style={{ fontSize: 12 }}>{t('proforma.buExecMeetingsPct', 'Attendance %')}</label>
                      <input
                        type="text"
                        value={upper.buExecPct || calcBuExecPct}
                        onChange={(e) => updateUpper('buExecPct', e.target.value)}
                        style={{ textAlign: 'center', fontWeight: 'bold' }}
                      />
                    </div>
                  </div>
                </div>

                {/* BU General Body Meetings */}
                <div style={{ background: 'var(--surface-alt)', padding: 14, borderRadius: 8, border: '1px solid var(--border)' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
                    <strong style={{ fontSize: 14 }}>{t('proforma.buGbMeetingsTitle', 'Basic Units General Body Meetings')}</strong>
                    <span className="badge ACTIVE" style={{ fontSize: 13, fontWeight: 'bold' }}>
                      {calcBuGbPct}
                    </span>
                  </div>

                  <div className="form-grid" style={{ gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                    <div className="field">
                      <label style={{ fontSize: 12 }}>{t('proforma.buGbMeetingsTotal', 'GB Meetings Total')}</label>
                      <NumberStepper
                        value={upper.buGbCount ?? ''}
                        onChange={(val) => updateUpper('buGbCount', val)}
                      />
                    </div>

                    <div className="field">
                      <label style={{ fontSize: 12, color: '#22c55e' }}>{t('proforma.buGbMeetingsPresent', 'Attended/Held Meetings')}</label>
                      <NumberStepper
                        value={upper.buGbPresent ?? ''}
                        onChange={(val) => updateUpper('buGbPresent', val)}
                      />
                    </div>

                    <div className="field" style={{ gridColumn: 'span 2' }}>
                      <label style={{ fontSize: 12 }}>{t('proforma.buGbMeetingsPct', 'Attendance %')}</label>
                      <input
                        type="text"
                        value={upper.buGbPct || calcBuGbPct}
                        onChange={(e) => updateUpper('buGbPct', e.target.value)}
                        style={{ textAlign: 'center', fontWeight: 'bold' }}
                      />
                    </div>
                  </div>
                </div>
              </div>
            </div>

            {/* Card 3: Membership Status */}
            <div className="card">
              <h3 style={{ marginTop: 0, marginBottom: 14, color: 'var(--primary, #38bdf8)', display: 'flex', alignItems: 'center', gap: 8 }}>
                <span>👥</span> {t('proforma.unitsAndMembership', 'Basic Units & Membership')}
              </h3>

              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 14 }}>
                <div style={{ background: 'var(--surface-alt)', padding: 12, borderRadius: 8, border: '1px solid var(--border)' }}>
                  <label style={{ display: 'block', fontSize: 12, marginBottom: 6, fontWeight: 600 }}>{t('proforma.totalMembers', 'Total Members')}</label>
                  <NumberStepper
                    value={upper.totalMembers ?? formData.totalMembers}
                    onChange={(val) => { updateUpper('totalMembers', val); updateField('totalMembers', val); }}
                  />
                </div>

                <div style={{ background: 'var(--surface-alt)', padding: 12, borderRadius: 8, border: '1px solid var(--border)' }}>
                  <label style={{ display: 'block', fontSize: 12, marginBottom: 6, fontWeight: 600, color: '#22c55e' }}>{t('proforma.activeMembers', 'Active Members')}</label>
                  <NumberStepper
                    value={upper.activeMembers ?? formData.activeMembers}
                    onChange={(val) => { updateUpper('activeMembers', val); updateField('activeMembers', val); }}
                  />
                </div>

                <div style={{ background: 'var(--surface-alt)', padding: 12, borderRadius: 8, border: '1px solid var(--border)' }}>
                  <label style={{ display: 'block', fontSize: 12, marginBottom: 6, fontWeight: 600, color: '#38bdf8' }}>{t('proforma.memberPct', 'Active Membership %')}</label>
                  <input
                    type="text"
                    value={upper.memberPct || calcMemberPct}
                    onChange={(e) => updateUpper('memberPct', e.target.value)}
                    style={{ width: '100%', textAlign: 'center', fontWeight: 'bold', padding: '6px' }}
                  />
                </div>

                <div style={{ background: 'var(--surface-alt)', padding: 12, borderRadius: 8, border: '1px solid var(--border)' }}>
                  <label style={{ display: 'block', fontSize: 12, marginBottom: 6, fontWeight: 600, color: '#a855f7' }}>{t('proforma.newInductions', 'New Inductions')}</label>
                  <NumberStepper
                    value={upper.newMembersCount ?? formData.newInductions}
                    onChange={(val) => { updateUpper('newMembersCount', val); updateField('newInductions', val); }}
                  />
                </div>
              </div>
            </div>

            {/* Card 4: Finances & Dues */}
            <div className="card">
              <h3 style={{ marginTop: 0, marginBottom: 14, color: 'var(--primary, #38bdf8)', display: 'flex', alignItems: 'center', gap: 8 }}>
                <span>💰</span> {t('proforma.finances', 'Monthly Financials & Dues Summary (PKR)')}
              </h3>

              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 14 }}>
                <div style={{ background: 'var(--surface-alt)', padding: 12, borderRadius: 8, border: '1px solid var(--border)' }}>
                  <label style={{ display: 'block', fontSize: 12, marginBottom: 6, fontWeight: 600 }}>{t('proforma.unitDonations', 'Basic Units Dues')}</label>
                  <input
                    type="number"
                    value={upper.unitDonations ?? ''}
                    onChange={(e) => updateUpper('unitDonations', e.target.value)}
                    placeholder="0"
                    style={{ width: '100%', padding: '6px' }}
                  />
                </div>

                <div style={{ background: 'var(--surface-alt)', padding: 12, borderRadius: 8, border: '1px solid var(--border)' }}>
                  <label style={{ display: 'block', fontSize: 12, marginBottom: 6, fontWeight: 600 }}>{t('proforma.areaDonations', 'Area Executive Dues')}</label>
                  <input
                    type="number"
                    value={upper.areaDonations ?? ''}
                    onChange={(e) => updateUpper('areaDonations', e.target.value)}
                    placeholder="0"
                    style={{ width: '100%', padding: '6px' }}
                  />
                </div>

                <div style={{ background: 'var(--surface-alt)', padding: 12, borderRadius: 8, border: '1px solid var(--border)' }}>
                  <label style={{ display: 'block', fontSize: 12, marginBottom: 6, fontWeight: 600 }}>{t('proforma.emergencyDonations', 'Emergency Dues')}</label>
                  <input
                    type="number"
                    value={upper.emergencyDonations ?? ''}
                    onChange={(e) => updateUpper('emergencyDonations', e.target.value)}
                    placeholder="0"
                    style={{ width: '100%', padding: '6px' }}
                  />
                </div>

                <div style={{ background: 'var(--surface-alt)', padding: 12, borderRadius: 8, border: '1px solid var(--border)' }}>
                  <label style={{ display: 'block', fontSize: 12, marginBottom: 6, fontWeight: 600, color: '#ef4444' }}>{t('proforma.totalExpenses', 'Total Expenses')}</label>
                  <input
                    type="number"
                    value={upper.totalExpenses ?? ''}
                    onChange={(e) => updateUpper('totalExpenses', e.target.value)}
                    placeholder="0"
                    style={{ width: '100%', padding: '6px' }}
                  />
                </div>

                <div style={{ background: 'var(--surface-alt)', padding: 12, borderRadius: 8, border: '1px solid var(--border)' }}>
                  <label style={{ display: 'block', fontSize: 12, marginBottom: 6, fontWeight: 600, color: calcNetFinance >= 0 ? '#22c55e' : '#ef4444' }}>
                    {t('proforma.netBalance', 'Net Balance (PKR)')}
                  </label>
                  <div style={{ padding: '6px 10px', fontWeight: 'bold', fontSize: 15, color: calcNetFinance >= 0 ? '#22c55e' : '#ef4444' }}>
                    PKR {calcNetFinance.toLocaleString()}
                  </div>
                </div>
              </div>
            </div>
          </div>
        )
      )}

      {/* ────────────────────────────────────────────────────────────────────────── */}
      {/* TAB 2: ROSTER / INDIVIDUAL EXECUTIVE PERFORMANCE */}
      {/* ────────────────────────────────────────────────────────────────────────── */}
      {activeTab === 'roster' && (
        <div>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14, flexWrap: 'wrap', gap: 10 }}>
            <div>
              <h3 style={{ margin: 0, color: 'var(--primary, #38bdf8)' }}>
                {formType === 'form6'
                  ? t('proforma.form6.rosterTitle', 'ضلعي ايګزيکټيو ځانګړي (انفرادي) کار او فعاليت رپورټ')
                  : formType === 'form4'
                  ? t('proforma.tabRosterForm4', 'ابتدائي يونټ ايګزيکټيو ځانګړي (انفرادي) کار او فعاليت')
                  : t('proforma.rosterTitle', 'Area Executive Members Performance')}
              </h3>
              <p className="muted" style={{ margin: '2px 0 0', fontSize: 13 }}>
                {formType === 'form6'
                  ? t('proforma.form6.rosterSubtitle', 'ضلعي ايګزيکټيو ملګرو د ټولو غونډو، اولسي فعاليتونو، او تنظيمي کارونو ۲۶ ستنو رسمي تفصيل')
                  : formType === 'form4'
                  ? 'Individual performance metrics for each cabinet member of this basic unit'
                  : t('proforma.rosterDesc', 'Official 24-column record of monthly meetings, attendance, donations, tours, and outreach')}
              </p>
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
              {formType === 'form6' ? (
                <>
                  <div style={{ position: 'relative' }}>
                    <input
                      type="text"
                      value={form6Search}
                      onChange={(e) => setForm6Search(e.target.value)}
                      placeholder={`🔍 ${t('proforma.searchPlaceholder', 'Search comrade / name...')}`}
                      style={{ fontSize: 12, padding: '5px 10px', borderRadius: 6, minWidth: 180 }}
                    />
                    {form6Search && (
                      <button
                        type="button"
                        onClick={() => setForm6Search('')}
                        style={{ position: 'absolute', right: isRtl ? 'auto' : 8, left: isRtl ? 8 : 'auto', top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-soft)' }}
                      >✕</button>
                    )}
                  </div>
                  <button
                    type="button"
                    className={`btn ${form6ViewMode === 'cards' ? '' : 'secondary'}`}
                    onClick={() => setForm6ViewMode('cards')}
                    style={{ fontSize: 12, padding: '6px 12px' }}
                  >
                    🗂️ {t('proforma.cardsView', 'Card View')}
                  </button>
                  <button
                    type="button"
                    className={`btn ${form6ViewMode === 'table' ? '' : 'secondary'}`}
                    onClick={() => setForm6ViewMode('table')}
                    style={{ fontSize: 12, padding: '6px 12px' }}
                  >
                    📊 {t('proforma.tableView', 'Official Table View')}
                  </button>
                  <button
                    type="button"
                    className="btn secondary"
                    onClick={handleAutoSumAllForm6Rows}
                    title="Auto-calculate total meetings for all comrades"
                    style={{ fontSize: 12, padding: '6px 12px' }}
                  >
                    ⚡ {t('proforma.form6.autoSumAll', 'Auto-Sum All')}
                  </button>
                  <button
                    type="button"
                    className="btn"
                    onClick={addForm6Row}
                    style={{ fontSize: 12, padding: '6px 12px', background: '#0284c7', borderColor: '#0284c7' }}
                  >
                    ➕ {t('proforma.form6.addComrade', '+ Add Comrade')}
                  </button>
                </>
              ) : (
                <>
                  <button
                    type="button"
                    className={`btn ${rosterViewMode === 'cards' ? '' : 'secondary'}`}
                    onClick={() => setRosterViewMode('cards')}
                    style={{ fontSize: 12, padding: '6px 12px' }}
                  >
                    🗂️ {t('proforma.cardsView', 'Card View')}
                  </button>
                  <button
                    type="button"
                    className={`btn ${rosterViewMode === 'table' ? '' : 'secondary'}`}
                    onClick={() => setRosterViewMode('table')}
                    style={{ fontSize: 12, padding: '6px 12px' }}
                  >
                    📊 {t('proforma.tableView', 'Official Table View')}
                  </button>
                  <button
                    type="button"
                    className="btn"
                    onClick={addRow}
                    style={{ fontSize: 12, padding: '6px 12px', background: '#0284c7', borderColor: '#0284c7' }}
                  >
                    ➕ {t('proforma.addMember', 'Add Member')}
                  </button>
                </>
              )}
            </div>
          </div>

          {/* FORM 6 ROSTER: CARDS VIEW */}
          {formType === 'form6' && form6ViewMode === 'cards' && (
            <div>
              {rows.length === 0 ? (
                <div className="card" style={{ textAlign: 'center', padding: 40, color: 'var(--text-soft)' }}>
                  {t('proforma.form6.noComrades', 'ضلعي ايګزيکټيو کښي تر اوسه ملګري نشته. د ملګري زياتولو لپاره "+ Add Comrade" کليک کړئ يا د سسټم څخه اتومات راوباسئ.')}
                </div>
              ) : (
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(360px, 1fr))', gap: 16 }}>
                  {rows
                    .map((r, originalIdx) => ({ ...r, _idx: originalIdx }))
                    .filter((r) => !form6Search.trim() || (r.name || '').toLowerCase().includes(form6Search.toLowerCase().trim()))
                    .map((r) => {
                      const idx = r._idx;
                      return (
                        <div key={idx} className="card" style={{ position: 'relative', border: '1px solid var(--border)' }}>
                          {/* Card Header */}
                          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid var(--border)', paddingBottom: 10, marginBottom: 12 }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 8, flex: 1 }}>
                              <span style={{ background: '#0284c7', color: '#fff', borderRadius: '50%', width: 26, height: 26, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', fontSize: 13, fontWeight: 'bold', flexShrink: 0 }}>
                                {idx + 1}
                              </span>
                              <input
                                type="text"
                                value={r.name || ''}
                                onChange={(e) => updateForm6Row(idx, 'name', e.target.value)}
                                placeholder={t('proforma.form6.comradeName', 'ضلع ايګزيکټيو نوم (Comrade Name)')}
                                style={{ fontWeight: 'bold', fontSize: 14, padding: '4px 8px', width: '100%' }}
                              />
                            </div>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0, marginInlineStart: 8 }}>
                              <select
                                value={r.activeStatus || 'فعاله'}
                                onChange={(e) => updateForm6Row(idx, 'activeStatus', e.target.value)}
                                style={{ fontSize: 11, padding: '3px 6px', borderRadius: 4 }}
                              >
                                <option value="فعاله">{t('proforma.active', 'فعاله')}</option>
                                <option value="غير فعاله">{t('proforma.inactive', 'غير فعاله')}</option>
                              </select>
                              <button
                                type="button"
                                onClick={() => removeForm6Row(idx)}
                                style={{ background: 'none', border: 'none', color: '#ef4444', cursor: 'pointer', fontSize: 16 }}
                                title={t('proforma.remove', 'Remove Member')}
                              >
                                ✕
                              </button>
                            </div>
                          </div>

                          {/* Quick Summary Strip */}
                          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 14, background: 'var(--surface-alt)', padding: '6px 10px', borderRadius: 6, fontSize: 12, alignItems: 'center' }}>
                            <span style={{ color: 'var(--primary, #38bdf8)', fontWeight: 700 }}>
                              🤝 {t('proforma.form6.totalMeetings', 'ټولي غونډي')}: <strong>{r.totalMeetings ?? 0}</strong>
                            </span>
                            <span style={{ color: 'var(--text-soft)' }}>•</span>
                            <span style={{ fontWeight: 600 }}>
                              💰 {t('proforma.form6.duesMonthly', 'چنده')}: PKR {(parseInt(r.monthlyDues || r.dues, 10) || 0).toLocaleString()}
                            </span>
                            <span style={{ color: 'var(--text-soft)' }}>•</span>
                            <span>
                              🏛️ {t('proforma.form6.officeAttendance', 'دفتر')}: {r.officeAttendance || 'حاضر'}
                            </span>
                          </div>

                          {/* Sub-Section 1: District & Area Meetings (ضلعي او علاقائي غونډي) */}
                          <div style={{ marginBottom: 12 }}>
                            <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--primary, #38bdf8)', marginBottom: 6, display: 'flex', alignItems: 'center', gap: 6 }}>
                              <span>🏛️</span> {t('proforma.form6.secDistAreaMeetings', 'ضلعي او علاقائي غونډي (District & Area Meetings)')}
                            </div>
                            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(130px, 1fr))', gap: 8 }}>
                              <div style={{ background: 'var(--surface-alt)', padding: '6px 8px', borderRadius: 6, border: '1px solid var(--border)', display: 'flex', flexDirection: 'column', gap: 4 }}>
                                <label style={{ fontSize: 10, fontWeight: 600, color: 'var(--text-soft)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{t('proforma.form6.distExec', 'ضلع ايګزيکټيو')}</label>
                                <NumberStepper value={r.distExecMeeting} onChange={(v) => updateForm6Row(idx, 'distExecMeeting', v)} style={{ width: '100%', minWidth: 0, justifyContent: 'space-between' }} />
                              </div>
                              <div style={{ background: 'var(--surface-alt)', padding: '6px 8px', borderRadius: 6, border: '1px solid var(--border)', display: 'flex', flexDirection: 'column', gap: 4 }}>
                                <label style={{ fontSize: 10, fontWeight: 600, color: 'var(--text-soft)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{t('proforma.form6.distComm', 'ضلع کميټي')}</label>
                                <NumberStepper value={r.distCommMeeting} onChange={(v) => updateForm6Row(idx, 'distCommMeeting', v)} style={{ width: '100%', minWidth: 0, justifyContent: 'space-between' }} />
                              </div>
                              <div style={{ background: 'var(--surface-alt)', padding: '6px 8px', borderRadius: 6, border: '1px solid var(--border)', display: 'flex', flexDirection: 'column', gap: 4 }}>
                                <label style={{ fontSize: 10, fontWeight: 600, color: 'var(--text-soft)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{t('proforma.form6.areaExec', 'علاقائي ايګزيکټيو')}</label>
                                <NumberStepper value={r.areaExecMeeting} onChange={(v) => updateForm6Row(idx, 'areaExecMeeting', v)} style={{ width: '100%', minWidth: 0, justifyContent: 'space-between' }} />
                              </div>
                              <div style={{ background: 'var(--surface-alt)', padding: '6px 8px', borderRadius: 6, border: '1px solid var(--border)', display: 'flex', flexDirection: 'column', gap: 4 }}>
                                <label style={{ fontSize: 10, fontWeight: 600, color: 'var(--text-soft)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{t('proforma.form6.areaComm', 'علاقائي کميټي')}</label>
                                <NumberStepper value={r.areaCommMeeting} onChange={(v) => updateForm6Row(idx, 'areaCommMeeting', v)} style={{ width: '100%', minWidth: 0, justifyContent: 'space-between' }} />
                              </div>
                            </div>
                          </div>

                          {/* Sub-Section 2: Basic Units & PSO Wing (بنسټيز يونټونه او پي ايس او) */}
                          <div style={{ marginBottom: 12 }}>
                            <div style={{ fontSize: 11, fontWeight: 700, color: '#10b981', marginBottom: 6, display: 'flex', alignItems: 'center', gap: 6 }}>
                              <span>🏢</span> {t('proforma.form6.secBuPsoMeetings', 'بنسټيز يونټونه او پي ايس او (Basic Units & PSO)')}
                            </div>
                            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(130px, 1fr))', gap: 8 }}>
                              <div style={{ background: 'var(--surface-alt)', padding: '6px 8px', borderRadius: 6, border: '1px solid var(--border)', display: 'flex', flexDirection: 'column', gap: 4 }}>
                                <label style={{ fontSize: 10, fontWeight: 600, color: 'var(--text-soft)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{t('proforma.form6.ownBu', 'خپل يونټ')}</label>
                                <NumberStepper value={r.ownBuMeeting} onChange={(v) => updateForm6Row(idx, 'ownBuMeeting', v)} style={{ width: '100%', minWidth: 0, justifyContent: 'space-between' }} />
                              </div>
                              <div style={{ background: 'var(--surface-alt)', padding: '6px 8px', borderRadius: 6, border: '1px solid var(--border)', display: 'flex', flexDirection: 'column', gap: 4 }}>
                                <label style={{ fontSize: 10, fontWeight: 600, color: 'var(--text-soft)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{t('proforma.form6.buExec', 'يونټ ايګزيکټيو')}</label>
                                <NumberStepper value={r.buExecMeeting} onChange={(v) => updateForm6Row(idx, 'buExecMeeting', v)} style={{ width: '100%', minWidth: 0, justifyContent: 'space-between' }} />
                              </div>
                              <div style={{ background: 'var(--surface-alt)', padding: '6px 8px', borderRadius: 6, border: '1px solid var(--border)', display: 'flex', flexDirection: 'column', gap: 4 }}>
                                <label style={{ fontSize: 10, fontWeight: 600, color: 'var(--text-soft)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{t('proforma.form6.buGb', 'يونټانو غونډي')}</label>
                                <NumberStepper value={r.buGbMeeting} onChange={(v) => updateForm6Row(idx, 'buGbMeeting', v)} style={{ width: '100%', minWidth: 0, justifyContent: 'space-between' }} />
                              </div>
                              <div style={{ background: 'var(--surface-alt)', padding: '6px 8px', borderRadius: 6, border: '1px solid var(--border)', display: 'flex', flexDirection: 'column', gap: 4 }}>
                                <label style={{ fontSize: 10, fontWeight: 600, color: 'var(--text-soft)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{t('proforma.form6.pso', 'PSO غونډي')}</label>
                                <NumberStepper value={r.psoMeeting} onChange={(v) => updateForm6Row(idx, 'psoMeeting', v)} style={{ width: '100%', minWidth: 0, justifyContent: 'space-between' }} />
                              </div>
                            </div>
                          </div>

                          {/* Sub-Section 3: Party Programs & Education (پروګرامونه، کانفرنسونه، سټډي سرکل) */}
                          <div style={{ marginBottom: 12 }}>
                            <div style={{ fontSize: 11, fontWeight: 700, color: '#8b5cf6', marginBottom: 6, display: 'flex', alignItems: 'center', gap: 6 }}>
                              <span>📚</span> {t('proforma.form6.secProgramsEducation', 'پروګرامونه او زده کړه (Programs & Education)')}
                            </div>
                            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(130px, 1fr))', gap: 8 }}>
                              <div style={{ background: 'var(--surface-alt)', padding: '6px 8px', borderRadius: 6, border: '1px solid var(--border)', display: 'flex', flexDirection: 'column', gap: 4 }}>
                                <label style={{ fontSize: 10, fontWeight: 600, color: 'var(--text-soft)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{t('proforma.form6.conf', 'کانفرنس')}</label>
                                <NumberStepper value={r.conferenceMeeting} onChange={(v) => updateForm6Row(idx, 'conferenceMeeting', v)} style={{ width: '100%', minWidth: 0, justifyContent: 'space-between' }} />
                              </div>
                              <div style={{ background: 'var(--surface-alt)', padding: '6px 8px', borderRadius: 6, border: '1px solid var(--border)', display: 'flex', flexDirection: 'column', gap: 4 }}>
                                <label style={{ fontSize: 10, fontWeight: 600, color: 'var(--text-soft)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{t('proforma.form6.seminar', 'سيمينار')}</label>
                                <NumberStepper value={r.seminarMeeting} onChange={(v) => updateForm6Row(idx, 'seminarMeeting', v)} style={{ width: '100%', minWidth: 0, justifyContent: 'space-between' }} />
                              </div>
                              <div style={{ background: 'var(--surface-alt)', padding: '6px 8px', borderRadius: 6, border: '1px solid var(--border)', display: 'flex', flexDirection: 'column', gap: 4 }}>
                                <label style={{ fontSize: 10, fontWeight: 600, color: 'var(--text-soft)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{t('proforma.form6.studyCircle', 'سټډي سرکل')}</label>
                                <NumberStepper value={r.studyCircleMeeting} onChange={(v) => updateForm6Row(idx, 'studyCircleMeeting', v)} style={{ width: '100%', minWidth: 0, justifyContent: 'space-between' }} />
                              </div>
                              <div style={{ background: 'var(--surface-alt)', padding: '6px 8px', borderRadius: 6, border: '1px solid var(--border)', display: 'flex', flexDirection: 'column', gap: 4 }}>
                                <label style={{ fontSize: 10, fontWeight: 600, color: 'var(--text-soft)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{t('proforma.form6.induction', 'شموليت')}</label>
                                <NumberStepper value={r.inductionMeeting} onChange={(v) => updateForm6Row(idx, 'inductionMeeting', v)} style={{ width: '100%', minWidth: 0, justifyContent: 'space-between' }} />
                              </div>
                              <div style={{ background: 'var(--surface-alt)', padding: '6px 8px', borderRadius: 6, border: '1px solid var(--border)', display: 'flex', flexDirection: 'column', gap: 4 }}>
                                <label style={{ fontSize: 10, fontWeight: 600, color: 'var(--text-soft)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{t('proforma.form6.allied', 'اتحاديان')}</label>
                                <NumberStepper value={r.alliedMeeting} onChange={(v) => updateForm6Row(idx, 'alliedMeeting', v)} style={{ width: '100%', minWidth: 0, justifyContent: 'space-between' }} />
                              </div>
                            </div>
                          </div>

                          {/* Sub-Section 4: Mass Action & Outreach (اولسي غونډي او دورې) */}
                          <div style={{ marginBottom: 12 }}>
                            <div style={{ fontSize: 11, fontWeight: 700, color: '#f59e0b', marginBottom: 6, display: 'flex', alignItems: 'center', gap: 6 }}>
                              <span>📢</span> {t('proforma.form6.secMassAction', 'اولسي فعاليت او دورې (Public Action & Tours)')}
                            </div>
                            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(130px, 1fr))', gap: 8 }}>
                              <div style={{ background: 'var(--surface-alt)', padding: '6px 8px', borderRadius: 6, border: '1px solid var(--border)', display: 'flex', flexDirection: 'column', gap: 4 }}>
                                <label style={{ fontSize: 10, fontWeight: 600, color: 'var(--text-soft)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{t('proforma.form6.rallies', 'جلسے مظاهرے')}</label>
                                <NumberStepper value={r.rallyMeeting} onChange={(v) => updateForm6Row(idx, 'rallyMeeting', v)} style={{ width: '100%', minWidth: 0, justifyContent: 'space-between' }} />
                              </div>
                              <div style={{ background: 'var(--surface-alt)', padding: '6px 8px', borderRadius: 6, border: '1px solid var(--border)', display: 'flex', flexDirection: 'column', gap: 4 }}>
                                <label style={{ fontSize: 10, fontWeight: 600, color: 'var(--text-soft)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{t('proforma.form6.jirgas', 'جرګے')}</label>
                                <NumberStepper value={r.jirgaMeeting} onChange={(v) => updateForm6Row(idx, 'jirgaMeeting', v)} style={{ width: '100%', minWidth: 0, justifyContent: 'space-between' }} />
                              </div>
                              <div style={{ background: 'var(--surface-alt)', padding: '6px 8px', borderRadius: 6, border: '1px solid var(--border)', display: 'flex', flexDirection: 'column', gap: 4 }}>
                                <label style={{ fontSize: 10, fontWeight: 600, color: 'var(--text-soft)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{t('proforma.form6.tours', 'دورې')}</label>
                                <NumberStepper value={r.tours} onChange={(v) => updateForm6Row(idx, 'tours', v)} style={{ width: '100%', minWidth: 0, justifyContent: 'space-between' }} />
                              </div>
                              <div style={{ background: 'var(--surface-alt)', padding: '6px 8px', borderRadius: 6, border: '1px solid var(--border)', display: 'flex', flexDirection: 'column', gap: 4 }}>
                                <label style={{ fontSize: 10, fontWeight: 600, color: 'var(--text-soft)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{t('proforma.form6.publicOutreach', 'اولسي رابطې')}</label>
                                <NumberStepper value={r.publicOutreach} onChange={(v) => updateForm6Row(idx, 'publicOutreach', v)} style={{ width: '100%', minWidth: 0, justifyContent: 'space-between' }} />
                              </div>
                            </div>
                          </div>

                          {/* Sub-Section 5: Attendance, Finances & Ideology (حاضري، چنده او نظرياتي لوستنه) */}
                          <div style={{ borderTop: '1px dashed var(--border)', paddingTop: 10 }}>
                            <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-soft)', marginBottom: 8, display: 'flex', alignItems: 'center', gap: 6 }}>
                              <span>💼</span> {t('proforma.form6.secAdministration', 'اداري، مالي چارې او مطالعه (Admin, Dues & Ideology)')}
                            </div>
                            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(130px, 1fr))', gap: 8 }}>
                              <div style={{ background: 'var(--surface-alt)', padding: '6px 8px', borderRadius: 6, border: '1px solid var(--border)', display: 'flex', flexDirection: 'column', gap: 4 }}>
                                <label style={{ fontSize: 10, fontWeight: 600, color: 'var(--text-soft)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{t('proforma.form6.inactiveContact', 'غير فعاله رابطې')}</label>
                                <NumberStepper value={r.inactiveContact} onChange={(v) => updateForm6Row(idx, 'inactiveContact', v)} style={{ width: '100%', minWidth: 0, justifyContent: 'space-between' }} />
                              </div>
                              <div style={{ background: 'var(--surface-alt)', padding: '6px 8px', borderRadius: 6, border: '1px solid var(--border)', display: 'flex', flexDirection: 'column', gap: 4 }}>
                                <label style={{ fontSize: 10, fontWeight: 600, color: 'var(--text-soft)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{t('proforma.form6.monthlyDues', 'مياشتني چنده (PKR)')}</label>
                                <input
                                  type="number"
                                  value={r.monthlyDues ?? ''}
                                  onChange={(e) => updateForm6Row(idx, 'monthlyDues', e.target.value)}
                                  placeholder="0"
                                  style={{ width: '100%', padding: '4px 6px', fontSize: 12, borderRadius: 4, fontWeight: 'bold' }}
                                />
                              </div>
                              <div style={{ background: 'var(--surface-alt)', padding: '6px 8px', borderRadius: 6, border: '1px solid var(--border)', display: 'flex', flexDirection: 'column', gap: 4 }}>
                                <label style={{ fontSize: 10, fontWeight: 600, color: 'var(--text-soft)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{t('proforma.form6.officeAttendance', 'دفتر حاضري')}</label>
                                <select
                                  value={r.officeAttendance || 'حاضر'}
                                  onChange={(e) => updateForm6Row(idx, 'officeAttendance', e.target.value)}
                                  style={{ width: '100%', padding: '4px 6px', fontSize: 12, borderRadius: 4 }}
                                >
                                  <option value="حاضر">{t('proforma.present', 'حاضر')}</option>
                                  <option value="غير حاضر">{t('proforma.absent', 'غير حاضر')}</option>
                                  <option value="رخصت">{t('proforma.leave', 'رخصت')}</option>
                                </select>
                              </div>
                              <div style={{ background: 'var(--surface-alt)', padding: '6px 8px', borderRadius: 6, border: '1px solid var(--border)', display: 'flex', flexDirection: 'column', gap: 4 }}>
                                <label style={{ fontSize: 10, fontWeight: 600, color: 'var(--text-soft)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{t('proforma.form6.bloodBank', 'بلډ بينک / زکات')}</label>
                                <input
                                  type="text"
                                  value={r.bloodBankPosts || ''}
                                  onChange={(e) => updateForm6Row(idx, 'bloodBankPosts', e.target.value)}
                                  placeholder="e.g. O+, 500"
                                  style={{ width: '100%', padding: '4px 6px', fontSize: 12, borderRadius: 4 }}
                                />
                              </div>
                              <div style={{ background: 'var(--surface-alt)', padding: '6px 8px', borderRadius: 6, border: '1px solid var(--border)', display: 'flex', flexDirection: 'column', gap: 4 }}>
                                <label style={{ fontSize: 10, fontWeight: 600, color: 'var(--text-soft)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{t('proforma.form6.ideologyReading', 'مطالعه سياسي نظرياتي')}</label>
                                <input
                                  type="text"
                                  value={r.ideologicalReading || ''}
                                  onChange={(e) => updateForm6Row(idx, 'ideologicalReading', e.target.value)}
                                  placeholder="e.g. کتاب / مجله"
                                  style={{ width: '100%', padding: '4px 6px', fontSize: 12, borderRadius: 4 }}
                                />
                              </div>
                            </div>
                          </div>
                        </div>
                      );
                    })}
                </div>
              )}
            </div>
          )}

          {/* FORM 6 ROSTER: OFFICIAL TABLE VIEW (26 COLUMNS MATCHING PRINTED SHEET) */}
          {formType === 'form6' && form6ViewMode === 'table' && (
            <div style={{ border: '1px solid var(--border)', borderRadius: 8, overflowX: 'auto', background: 'var(--surface)' }}>
              <table className="table" style={{ width: '100%', minWidth: 1600, fontSize: 11, borderCollapse: 'collapse', textAlign: 'center' }}>
                <thead>
                  <tr style={{ background: 'var(--surface-alt)' }}>
                    <th rowSpan={2} style={{ width: 36 }}>#</th>
                    <th rowSpan={2} style={{ minWidth: 150, textAlign: isRtl ? 'right' : 'left' }}>{t('proforma.form6.comradeName', 'ضلع ايګزيکټيو نوم')}</th>
                    <th rowSpan={2} title="ضلع ايګزيکټيو غونډي" style={{ minWidth: 55 }}>{t('proforma.form6.distExec', 'ضلع ايګزي')}</th>
                    <th rowSpan={2} title="ضلع کميټي غونډي" style={{ minWidth: 55 }}>{t('proforma.form6.distComm', 'ضلع کمي')}</th>
                    <th rowSpan={2} title="علاقائي ايګزيکټيو غونډي" style={{ minWidth: 55 }}>{t('proforma.form6.areaExec', 'علاقائي ايګ')}</th>
                    <th rowSpan={2} title="علاقائي کميټي غونډي" style={{ minWidth: 55 }}>{t('proforma.form6.areaComm', 'علاقائي کم')}</th>
                    <th rowSpan={2} title="خپل ابتدائي يونټ غونډي" style={{ minWidth: 55 }}>{t('proforma.form6.ownBu', 'خپل يونټ')}</th>
                    <th rowSpan={2} title="ابتدائي يونټ ايګزيکټيو غونډي" style={{ minWidth: 55 }}>{t('proforma.form6.buExec', 'يونټ ايګ')}</th>
                    <th rowSpan={2} title="ابتدائي يونټانو غونډي" style={{ minWidth: 55 }}>{t('proforma.form6.buGb', 'يونټ غونډي')}</th>
                    <th rowSpan={2} title="PSO سره غونډي" style={{ minWidth: 50 }}>PSO</th>
                    <th rowSpan={2} title="پارټي کانفرنسونه" style={{ minWidth: 50 }}>{t('proforma.form6.conf', 'کانفرنس')}</th>
                    <th rowSpan={2} title="سيمينارونه" style={{ minWidth: 50 }}>{t('proforma.form6.seminar', 'سيمينار')}</th>
                    <th rowSpan={2} title="سټډي سرکل" style={{ minWidth: 50 }}>{t('proforma.form6.studyCircle', 'سټډي')}</th>
                    <th rowSpan={2} title="نوي شموليت پروګرام" style={{ minWidth: 50 }}>{t('proforma.form6.induction', 'شموليت')}</th>
                    <th rowSpan={2} title="اتحاديانو جماعتو سره غونډي" style={{ minWidth: 55 }}>{t('proforma.form6.allied', 'اتحاديان')}</th>
                    <th colSpan={2} style={{ background: '#fef3c7', color: '#92400e' }}>{t('proforma.form6.publicGatherings', 'اولسي غونډي')}</th>
                    <th rowSpan={2} title="ټولي غونډي" style={{ minWidth: 55, background: 'var(--primary, #38bdf8)', color: '#fff', fontWeight: 'bold' }}>{t('proforma.form6.totalMeetings', 'ټولي')}</th>
                    <th rowSpan={2} title="مياشتني چنده (PKR)" style={{ minWidth: 75 }}>{t('proforma.form6.monthlyDues', 'چنده')}</th>
                    <th rowSpan={2} title="دورې" style={{ minWidth: 45 }}>{t('proforma.form6.tours', 'دورې')}</th>
                    <th rowSpan={2} title="اولسي تنظيمي رابطې" style={{ minWidth: 55 }}>{t('proforma.form6.publicOutreach', 'اولسي')}</th>
                    <th rowSpan={2} title="غير فعاله رابطې" style={{ minWidth: 55 }}>{t('proforma.form6.inactiveContact', 'غير فعاله')}</th>
                    <th rowSpan={2} title="دفتر حاضري" style={{ minWidth: 65 }}>{t('proforma.form6.officeAttendance', 'دفتر')}</th>
                    <th rowSpan={2} title="بلډ بينک پوسټ / زکات" style={{ minWidth: 70 }}>{t('proforma.form6.bloodBank', 'بلډ/زکات')}</th>
                    <th rowSpan={2} title="فعاله / غير فعاله" style={{ minWidth: 65 }}>{t('proforma.form6.status', 'حالت')}</th>
                    <th rowSpan={2} title="لوستنه (مطالعه) سياسي نظرياتي" style={{ minWidth: 90 }}>{t('proforma.form6.ideologyReading', 'مطالعه')}</th>
                    <th rowSpan={2} style={{ width: 35 }}>✕</th>
                  </tr>
                  <tr style={{ background: 'var(--surface-alt)' }}>
                    <th title="جلسے مظاهرے" style={{ minWidth: 50, background: '#fef3c7', color: '#92400e' }}>{t('proforma.form6.rallies', 'جلسے')}</th>
                    <th title="جرګے اولسي" style={{ minWidth: 50, background: '#fef3c7', color: '#92400e' }}>{t('proforma.form6.jirgas', 'جرګے')}</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.length === 0 ? (
                    <tr>
                      <td colSpan={27} style={{ padding: 30, color: 'var(--text-soft)' }}>
                        {t('proforma.form6.noComrades', 'ضلعي ايګزيکټيو کښي تر اوسه ملګري نشته. د ملګري زياتولو لپاره "+ Add Comrade" کليک کړئ.')}
                      </td>
                    </tr>
                  ) : (
                    rows.map((r, idx) => (
                      <tr key={idx} style={{ borderBottom: '1px solid var(--border)' }}>
                        <td style={{ padding: 4, fontWeight: 'bold' }}>{idx + 1}</td>
                        <td style={{ padding: 4, textAlign: isRtl ? 'right' : 'left' }}>
                          <input
                            type="text"
                            value={r.name || ''}
                            onChange={(e) => updateForm6Row(idx, 'name', e.target.value)}
                            placeholder={t('proforma.form6.comradeName', 'ملګري نوم')}
                            style={{ width: '100%', padding: '3px 6px', fontWeight: 600, fontSize: 12, borderRadius: 4 }}
                          />
                        </td>
                        <td style={{ padding: 2 }}><input type="number" min={0} value={r.distExecMeeting ?? ''} onChange={(e) => updateForm6Row(idx, 'distExecMeeting', e.target.value)} style={{ width: 44, textAlign: 'center', fontSize: 11, padding: 2 }} /></td>
                        <td style={{ padding: 2 }}><input type="number" min={0} value={r.distCommMeeting ?? ''} onChange={(e) => updateForm6Row(idx, 'distCommMeeting', e.target.value)} style={{ width: 44, textAlign: 'center', fontSize: 11, padding: 2 }} /></td>
                        <td style={{ padding: 2 }}><input type="number" min={0} value={r.areaExecMeeting ?? ''} onChange={(e) => updateForm6Row(idx, 'areaExecMeeting', e.target.value)} style={{ width: 44, textAlign: 'center', fontSize: 11, padding: 2 }} /></td>
                        <td style={{ padding: 2 }}><input type="number" min={0} value={r.areaCommMeeting ?? ''} onChange={(e) => updateForm6Row(idx, 'areaCommMeeting', e.target.value)} style={{ width: 44, textAlign: 'center', fontSize: 11, padding: 2 }} /></td>
                        <td style={{ padding: 2 }}><input type="number" min={0} value={r.ownBuMeeting ?? ''} onChange={(e) => updateForm6Row(idx, 'ownBuMeeting', e.target.value)} style={{ width: 44, textAlign: 'center', fontSize: 11, padding: 2 }} /></td>
                        <td style={{ padding: 2 }}><input type="number" min={0} value={r.buExecMeeting ?? ''} onChange={(e) => updateForm6Row(idx, 'buExecMeeting', e.target.value)} style={{ width: 44, textAlign: 'center', fontSize: 11, padding: 2 }} /></td>
                        <td style={{ padding: 2 }}><input type="number" min={0} value={r.buGbMeeting ?? ''} onChange={(e) => updateForm6Row(idx, 'buGbMeeting', e.target.value)} style={{ width: 44, textAlign: 'center', fontSize: 11, padding: 2 }} /></td>
                        <td style={{ padding: 2 }}><input type="number" min={0} value={r.psoMeeting ?? ''} onChange={(e) => updateForm6Row(idx, 'psoMeeting', e.target.value)} style={{ width: 40, textAlign: 'center', fontSize: 11, padding: 2 }} /></td>
                        <td style={{ padding: 2 }}><input type="number" min={0} value={r.conferenceMeeting ?? ''} onChange={(e) => updateForm6Row(idx, 'conferenceMeeting', e.target.value)} style={{ width: 40, textAlign: 'center', fontSize: 11, padding: 2 }} /></td>
                        <td style={{ padding: 2 }}><input type="number" min={0} value={r.seminarMeeting ?? ''} onChange={(e) => updateForm6Row(idx, 'seminarMeeting', e.target.value)} style={{ width: 40, textAlign: 'center', fontSize: 11, padding: 2 }} /></td>
                        <td style={{ padding: 2 }}><input type="number" min={0} value={r.studyCircleMeeting ?? ''} onChange={(e) => updateForm6Row(idx, 'studyCircleMeeting', e.target.value)} style={{ width: 40, textAlign: 'center', fontSize: 11, padding: 2 }} /></td>
                        <td style={{ padding: 2 }}><input type="number" min={0} value={r.inductionMeeting ?? ''} onChange={(e) => updateForm6Row(idx, 'inductionMeeting', e.target.value)} style={{ width: 40, textAlign: 'center', fontSize: 11, padding: 2 }} /></td>
                        <td style={{ padding: 2 }}><input type="number" min={0} value={r.alliedMeeting ?? ''} onChange={(e) => updateForm6Row(idx, 'alliedMeeting', e.target.value)} style={{ width: 40, textAlign: 'center', fontSize: 11, padding: 2 }} /></td>
                        <td style={{ padding: 2, background: '#fffbeb' }}><input type="number" min={0} value={r.rallyMeeting ?? ''} onChange={(e) => updateForm6Row(idx, 'rallyMeeting', e.target.value)} style={{ width: 40, textAlign: 'center', fontSize: 11, padding: 2 }} /></td>
                        <td style={{ padding: 2, background: '#fffbeb' }}><input type="number" min={0} value={r.jirgaMeeting ?? ''} onChange={(e) => updateForm6Row(idx, 'jirgaMeeting', e.target.value)} style={{ width: 40, textAlign: 'center', fontSize: 11, padding: 2 }} /></td>
                        <td style={{ padding: 2, background: 'rgba(56, 189, 248, 0.12)', fontWeight: 'bold' }}>
                          <input
                            type="number"
                            readOnly
                            value={r.totalMeetings ?? ''}
                            style={{ width: 44, textAlign: 'center', fontWeight: 'bold', fontSize: 12, border: 'none', background: 'transparent' }}
                          />
                        </td>
                        <td style={{ padding: 2 }}>
                          <input
                            type="number"
                            min={0}
                            value={r.monthlyDues ?? ''}
                            onChange={(e) => updateForm6Row(idx, 'monthlyDues', e.target.value)}
                            style={{ width: 68, textAlign: 'center', fontSize: 11, padding: 2, fontWeight: 600 }}
                          />
                        </td>
                        <td style={{ padding: 2 }}><input type="number" min={0} value={r.tours ?? ''} onChange={(e) => updateForm6Row(idx, 'tours', e.target.value)} style={{ width: 38, textAlign: 'center', fontSize: 11, padding: 2 }} /></td>
                        <td style={{ padding: 2 }}><input type="number" min={0} value={r.publicOutreach ?? ''} onChange={(e) => updateForm6Row(idx, 'publicOutreach', e.target.value)} style={{ width: 38, textAlign: 'center', fontSize: 11, padding: 2 }} /></td>
                        <td style={{ padding: 2 }}><input type="number" min={0} value={r.inactiveContact ?? ''} onChange={(e) => updateForm6Row(idx, 'inactiveContact', e.target.value)} style={{ width: 38, textAlign: 'center', fontSize: 11, padding: 2 }} /></td>
                        <td style={{ padding: 2 }}>
                          <select
                            value={r.officeAttendance || 'حاضر'}
                            onChange={(e) => updateForm6Row(idx, 'officeAttendance', e.target.value)}
                            style={{ fontSize: 11, padding: '2px 4px', borderRadius: 4 }}
                          >
                            <option value="حاضر">{t('proforma.present', 'حاضر')}</option>
                            <option value="غير حاضر">{t('proforma.absent', 'غير حاضر')}</option>
                            <option value="رخصت">{t('proforma.leave', 'رخصت')}</option>
                          </select>
                        </td>
                        <td style={{ padding: 2 }}>
                          <input
                            type="text"
                            value={r.bloodBankPosts || ''}
                            onChange={(e) => updateForm6Row(idx, 'bloodBankPosts', e.target.value)}
                            placeholder="O+ / زکات"
                            style={{ width: 65, textAlign: 'center', fontSize: 11, padding: 2 }}
                          />
                        </td>
                        <td style={{ padding: 2 }}>
                          <select
                            value={r.activeStatus || 'فعاله'}
                            onChange={(e) => updateForm6Row(idx, 'activeStatus', e.target.value)}
                            style={{ fontSize: 11, padding: '2px 4px', borderRadius: 4 }}
                          >
                            <option value="فعاله">{t('proforma.active', 'فعاله')}</option>
                            <option value="غير فعاله">{t('proforma.inactive', 'غير فعاله')}</option>
                          </select>
                        </td>
                        <td style={{ padding: 2 }}>
                          <input
                            type="text"
                            value={r.ideologicalReading || ''}
                            onChange={(e) => updateForm6Row(idx, 'ideologicalReading', e.target.value)}
                            placeholder="کتاب / مجله"
                            style={{ width: 85, fontSize: 11, padding: 2 }}
                          />
                        </td>
                        <td style={{ padding: 2 }}>
                          <button
                            type="button"
                            onClick={() => removeForm6Row(idx)}
                            style={{ background: 'none', border: 'none', color: '#ef4444', cursor: 'pointer', fontSize: 14 }}
                            title={t('proforma.remove', 'Remove Member')}
                          >
                            ✕
                          </button>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
                {rows.length > 0 && (
                  <tfoot>
                    <tr style={{ background: 'var(--surface-alt)', fontWeight: 'bold' }}>
                      <td colSpan={2} style={{ padding: 6, textAlign: isRtl ? 'right' : 'left' }}>
                        {t('proforma.form6.totalComrades', 'ټول ملګري')}: {rows.length}
                      </td>
                      <td>{rows.reduce((s, r) => s + (parseInt(r.distExecMeeting || r.distExec, 10) || 0), 0)}</td>
                      <td>{rows.reduce((s, r) => s + (parseInt(r.distCommMeeting || r.distComm, 10) || 0), 0)}</td>
                      <td>{rows.reduce((s, r) => s + (parseInt(r.areaExecMeeting || r.areaExec, 10) || 0), 0)}</td>
                      <td>{rows.reduce((s, r) => s + (parseInt(r.areaCommMeeting || r.areaComm, 10) || 0), 0)}</td>
                      <td>{rows.reduce((s, r) => s + (parseInt(r.ownBuMeeting || r.ownBu, 10) || 0), 0)}</td>
                      <td>{rows.reduce((s, r) => s + (parseInt(r.buExecMeeting || r.buExec, 10) || 0), 0)}</td>
                      <td>{rows.reduce((s, r) => s + (parseInt(r.buGbMeeting || r.buGb, 10) || 0), 0)}</td>
                      <td>{rows.reduce((s, r) => s + (parseInt(r.psoMeeting || r.pso, 10) || 0), 0)}</td>
                      <td>{rows.reduce((s, r) => s + (parseInt(r.conferenceMeeting || r.conf, 10) || 0), 0)}</td>
                      <td>{rows.reduce((s, r) => s + (parseInt(r.seminarMeeting || r.seminar, 10) || 0), 0)}</td>
                      <td>{rows.reduce((s, r) => s + (parseInt(r.studyCircleMeeting || r.studyCircle, 10) || 0), 0)}</td>
                      <td>{rows.reduce((s, r) => s + (parseInt(r.inductionMeeting || r.induction, 10) || 0), 0)}</td>
                      <td>{rows.reduce((s, r) => s + (parseInt(r.alliedMeeting || r.allied, 10) || 0), 0)}</td>
                      <td style={{ background: '#fffbeb' }}>{rows.reduce((s, r) => s + (parseInt(r.rallyMeeting || r.rallies, 10) || 0), 0)}</td>
                      <td style={{ background: '#fffbeb' }}>{rows.reduce((s, r) => s + (parseInt(r.jirgaMeeting || r.jirgas, 10) || 0), 0)}</td>
                      <td style={{ background: 'var(--primary, #38bdf8)', color: '#fff' }}>
                        {rows.reduce((s, r) => s + (parseInt(r.totalMeetings, 10) || 0), 0)}
                      </td>
                      <td style={{ color: '#10b981' }}>
                        PKR {rows.reduce((s, r) => s + (parseInt(r.monthlyDues || r.dues, 10) || 0), 0).toLocaleString()}
                      </td>
                      <td>{rows.reduce((s, r) => s + (parseInt(r.tours, 10) || 0), 0)}</td>
                      <td>{rows.reduce((s, r) => s + (parseInt(r.publicOutreach, 10) || 0), 0)}</td>
                      <td>{rows.reduce((s, r) => s + (parseInt(r.inactiveContact, 10) || 0), 0)}</td>
                      <td colSpan={5}></td>
                    </tr>
                  </tfoot>
                )}
              </table>
            </div>
          )}

          {/* FORM 4 ROSTER: CARDS VIEW */}
          {formType === 'form4' && rosterViewMode === 'cards' && (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(360px, 1fr))', gap: 16 }}>
              {rows.length === 0 ? (
                <div className="card" style={{ textAlign: 'center', padding: 40, color: 'var(--text-soft)' }}>
                  {t('proforma.noMembers', 'No cabinet members found. Click "Add Member" or "Auto-fill from System".')}
                </div>
              ) : (
                rows.map((r, idx) => (
                  <div key={idx} className="card" style={{ position: 'relative', border: '1px solid var(--border)' }}>
                    {/* Header */}
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid var(--border)', paddingBottom: 10, marginBottom: 14 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <span style={{ background: '#0284c7', color: '#fff', borderRadius: '50%', width: 26, height: 26, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', fontSize: 13, fontWeight: 'bold' }}>
                          {idx + 1}
                        </span>
                        <input
                          type="text"
                          value={r.name || ''}
                          onChange={(e) => updateRow(idx, 'name', e.target.value)}
                          placeholder="ايګزيکټيو نوم (Member Name)"
                          style={{ fontWeight: 'bold', fontSize: 14, padding: '4px 8px', minWidth: 200 }}
                        />
                      </div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <span className={`badge ${r.activeStatus === 'فعاله' ? 'ACTIVE' : 'INACTIVE'}`} style={{ fontSize: 12 }}>
                          {r.activeStatus || 'فعاله'}
                        </span>
                        <button
                          type="button"
                          onClick={() => removeRow(idx)}
                          style={{ background: 'none', border: 'none', color: '#ef4444', cursor: 'pointer', fontSize: 16 }}
                          title={t('proforma.remove', 'Remove Member')}
                        >
                          ✕
                        </button>
                      </div>
                    </div>

                    {/* Sub-Section 1: Meetings & Activities (غونډي او فعاليتونه) */}
                    <div style={{ marginBottom: 14 }}>
                      <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--primary, #38bdf8)', marginBottom: 8, display: 'flex', alignItems: 'center', gap: 6 }}>
                        <span>🤝</span> {t('proforma.unitExecMeetingsTitle', 'غونډي او غونډو کډون (Meetings & Events)')}
                      </div>
                      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: 10 }}>
                        <div>
                          <label style={{ fontSize: 11, display: 'block', color: 'var(--text-soft)', marginBottom: 4 }}>
                            {t('proforma.form4ExecMeeting', 'يونټ ايګزيکټيو (Exec)')}
                          </label>
                          <NumberStepper
                            value={r.unitExecMeeting}
                            onChange={(val) => updateRow(idx, 'unitExecMeeting', val)}
                          />
                        </div>

                        <div>
                          <label style={{ fontSize: 11, display: 'block', color: 'var(--text-soft)', marginBottom: 4 }}>
                            {t('proforma.form4GbMeeting', 'يونټ جنرل باډي (GB)')}
                          </label>
                          <NumberStepper
                            value={r.unitGbMeeting}
                            onChange={(val) => updateRow(idx, 'unitGbMeeting', val)}
                          />
                        </div>

                        <div>
                          <label style={{ fontSize: 11, display: 'block', color: 'var(--text-soft)', marginBottom: 4 }}>
                            {t('proforma.pso', 'پي ايس او (PSO)')}
                          </label>
                          <NumberStepper
                            value={r.psoMeeting}
                            onChange={(val) => updateRow(idx, 'psoMeeting', val)}
                          />
                        </div>

                        <div>
                          <label style={{ fontSize: 11, display: 'block', color: 'var(--text-soft)', marginBottom: 4 }}>
                            {t('proforma.form4Seminar', 'سيمينار (Seminar)')}
                          </label>
                          <NumberStepper
                            value={r.seminar}
                            onChange={(val) => updateRow(idx, 'seminar', val)}
                          />
                        </div>

                        <div>
                          <label style={{ fontSize: 11, display: 'block', color: 'var(--text-soft)', marginBottom: 4 }}>
                            {t('proforma.form4StudyCircle', 'سټډي سرکل (Study)')}
                          </label>
                          <NumberStepper
                            value={r.studyCircle}
                            onChange={(val) => updateRow(idx, 'studyCircle', val)}
                          />
                        </div>

                        <div>
                          <label style={{ fontSize: 11, display: 'block', color: 'var(--text-soft)', marginBottom: 4 }}>
                            {t('proforma.inductions', 'شموليت (Induct)')}
                          </label>
                          <NumberStepper
                            value={r.induction}
                            onChange={(val) => updateRow(idx, 'induction', val)}
                          />
                        </div>

                        <div>
                          <label style={{ fontSize: 11, display: 'block', color: 'var(--text-soft)', marginBottom: 4 }}>
                            {t('proforma.rallies', 'جلسے، مظاهرے (Rallies)')}
                          </label>
                          <NumberStepper
                            value={r.ralliesAndJirgas}
                            onChange={(val) => updateRow(idx, 'ralliesAndJirgas', val)}
                          />
                        </div>

                        <div>
                          <label style={{ fontSize: 11, display: 'block', color: 'var(--text-soft)', marginBottom: 4 }}>
                            {t('proforma.alliesMeetings', 'اتحاديان (Allies)')}
                          </label>
                          <NumberStepper
                            value={r.alliedMeetings}
                            onChange={(val) => updateRow(idx, 'alliedMeetings', val)}
                          />
                        </div>

                        <div>
                          <label style={{ fontSize: 11, display: 'block', color: 'var(--text-soft)', marginBottom: 4 }}>
                            {t('proforma.conferences', 'کانفرنس (Conf)')}
                          </label>
                          <NumberStepper
                            value={r.partyConference}
                            onChange={(val) => updateRow(idx, 'partyConference', val)}
                          />
                        </div>

                        <div style={{ background: 'rgba(34, 197, 94, 0.08)', padding: '4px 8px', borderRadius: 6, border: '1px solid rgba(34, 197, 94, 0.3)' }}>
                          <label style={{ fontSize: 11, display: 'block', color: '#22c55e', marginBottom: 4, fontWeight: 700 }}>
                            {t('proforma.totalMeetings', 'ټولي غونډي (Total Mtgs)')}
                          </label>
                          <input
                            type="text"
                            value={r.totalMeetings ?? ''}
                            onChange={(e) => updateRow(idx, 'totalMeetings', e.target.value)}
                            style={{ width: '100%', fontSize: 13, padding: '3px 6px', fontWeight: 'bold', textAlign: 'center' }}
                          />
                        </div>
                      </div>
                    </div>

                    {/* Sub-Section 2: Education & Outreach (لوستنه، روزنه او عامه رابطه) */}
                    <div style={{ marginBottom: 14, paddingTop: 12, borderTop: '1px dashed var(--border)' }}>
                      <div style={{ fontSize: 12, fontWeight: 700, color: '#a855f7', marginBottom: 8, display: 'flex', alignItems: 'center', gap: 6 }}>
                        <span>📖</span> {t('proforma.form4Reading', 'لوستنه، روزنه او عامه رابطه (Education & Outreach)')}
                      </div>
                      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 10 }}>
                        <div style={{ background: 'rgba(168, 85, 247, 0.08)', padding: '6px 8px', borderRadius: 6, border: '1px solid rgba(168, 85, 247, 0.3)' }}>
                          <label style={{ fontSize: 11, display: 'block', color: '#a855f7', marginBottom: 4, fontWeight: 700 }}>
                            {t('proforma.form4Reading', 'لوستنه / مطالعه (Reading)')}
                          </label>
                          <NumberStepper
                            value={r.reading}
                            onChange={(val) => updateRow(idx, 'reading', val)}
                          />
                        </div>

                        <div>
                          <label style={{ fontSize: 11, display: 'block', color: 'var(--text-soft)', marginBottom: 4 }}>
                            {t('proforma.form4InactiveContact', 'غير فعاله رابطه (Inactive)')}
                          </label>
                          <NumberStepper
                            value={r.inactiveContact}
                            onChange={(val) => updateRow(idx, 'inactiveContact', val)}
                          />
                        </div>

                        <div>
                          <label style={{ fontSize: 11, display: 'block', color: 'var(--text-soft)', marginBottom: 4 }}>
                            {t('proforma.form4PublicOutreach', 'اولس رابطه (Outreach)')}
                          </label>
                          <NumberStepper
                            value={r.publicOutreach}
                            onChange={(val) => updateRow(idx, 'publicOutreach', val)}
                          />
                        </div>
                      </div>
                    </div>

                    {/* Sub-Section 3: Finances & Meta (چنده او معلومات) */}
                    <div style={{ paddingTop: 12, borderTop: '1px dashed var(--border)' }}>
                      <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-main)', marginBottom: 8, display: 'flex', alignItems: 'center', gap: 6 }}>
                        <span>💼</span> {t('proforma.financeSummary', 'مالي چارې او معلومات (Finances & Meta)')}
                      </div>
                      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: 10 }}>
                        <div>
                          <label style={{ fontSize: 11, display: 'block', color: 'var(--text-soft)', marginBottom: 4 }}>
                            {t('proforma.monthlyDues', 'مياشتني چنده (PKR)')}
                          </label>
                          <input
                            type="number"
                            value={r.monthlyDues ?? ''}
                            onChange={(e) => updateRow(idx, 'monthlyDues', e.target.value)}
                            placeholder="500"
                            style={{ width: '100%', padding: '4px 8px' }}
                          />
                        </div>

                        <div>
                          <label style={{ fontSize: 11, display: 'block', color: 'var(--text-soft)', marginBottom: 4 }}>
                            {t('proforma.officeAttendance', 'دفتر حاضري (Office)')}
                          </label>
                          <input
                            type="text"
                            value={r.districtOrAreaAttendance ?? ''}
                            onChange={(e) => updateRow(idx, 'districtOrAreaAttendance', e.target.value)}
                            placeholder="حاضر / 3"
                            style={{ width: '100%', padding: '4px 8px' }}
                          />
                        </div>

                        <div>
                          <label style={{ fontSize: 11, display: 'block', color: 'var(--text-soft)', marginBottom: 4 }}>
                            {t('proforma.activeStatus', 'فعاله / غير فعاله')}
                          </label>
                          <select
                            value={r.activeStatus || 'فعاله'}
                            onChange={(e) => updateRow(idx, 'activeStatus', e.target.value)}
                            style={{ width: '100%', padding: '4px 8px' }}
                          >
                            <option value="فعاله">{t('proforma.statusActive', 'فعاله (Active)')}</option>
                            <option value="غير فعاله">{t('proforma.statusInactive', 'غير فعاله (Inactive)')}</option>
                          </select>
                        </div>

                        <div>
                          <label style={{ fontSize: 11, display: 'block', color: 'var(--text-soft)', marginBottom: 4 }}>
                            {t('proforma.bloodBankZakat', 'بلډ بينک / زکات')}
                          </label>
                          <input
                            type="text"
                            value={r.bloodPostsAndZakat || ''}
                            onChange={(e) => updateRow(idx, 'bloodPostsAndZakat', e.target.value)}
                            placeholder="O+ / Zakat"
                            style={{ width: '100%', padding: '4px 8px' }}
                          />
                        </div>
                      </div>
                    </div>
                  </div>
                ))
              )}
            </div>
          )}

          {/* FORM 4 ROSTER: OFFICIAL 19-COLUMN DENSE TABLE VIEW */}
          {formType === 'form4' && rosterViewMode === 'table' && (
            <div style={{ overflowX: 'auto', maxHeight: '600px', border: '1px solid var(--border)', borderRadius: 8 }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12, minWidth: 1500, textAlign: 'center' }}>
                <thead style={{ background: 'var(--surface-alt)', position: 'sticky', top: 0, zIndex: 10 }}>
                  <tr style={{ borderBottom: '2px solid var(--border)' }}>
                    <th style={{ padding: 6, width: 36 }}>#</th>
                    <th style={{ padding: 6, minWidth: 160 }}>ايګزيکټيو نوم</th>
                    <th style={{ padding: 6, width: 65 }}>يونټ ايګزيکټيو</th>
                    <th style={{ padding: 6, width: 65 }}>يونټ جنرل باډي</th>
                    <th style={{ padding: 6, width: 60 }}>پي ايس او</th>
                    <th style={{ padding: 6, width: 55 }}>سيمينار</th>
                    <th style={{ padding: 6, width: 55 }}>سټډي سرکل</th>
                    <th style={{ padding: 6, width: 60 }}>شموليت</th>
                    <th style={{ padding: 6, width: 65 }}>جلسے/مظاهرے</th>
                    <th style={{ padding: 6, width: 65 }}>اتحاديانو</th>
                    <th style={{ padding: 6, width: 60 }}>کانفرنس</th>
                    <th style={{ padding: 6, width: 60 }}>ټولي غونډي</th>
                    <th style={{ padding: 6, width: 75 }}>غير فعاله رابطه</th>
                    <th style={{ padding: 6, width: 65 }}>اولس رابطه</th>
                    <th style={{ padding: 6, width: 75 }}>مياشتني چنده</th>
                    <th style={{ padding: 6, width: 60 }}>لوستنه</th>
                    <th style={{ padding: 6, width: 75 }}>دفتر حاضري</th>
                    <th style={{ padding: 6, width: 70 }}>حالت</th>
                    <th style={{ padding: 6, width: 75 }}>بلډ بينک</th>
                    <th style={{ padding: 6, width: 36 }}>✕</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.length === 0 ? (
                    <tr>
                      <td colSpan={20} style={{ padding: 30, color: 'var(--text-soft)' }}>
                        {t('proforma.noMembers', 'No members registered yet.')}
                      </td>
                    </tr>
                  ) : (
                    rows.map((r, idx) => (
                      <tr key={idx} style={{ borderBottom: '1px solid var(--border)' }}>
                        <td style={{ padding: 4 }}>{idx + 1}</td>
                        <td style={{ padding: 4 }}>
                          <input
                            type="text"
                            value={r.name || ''}
                            onChange={(e) => updateRow(idx, 'name', e.target.value)}
                            placeholder="ايګزيکټيو نوم"
                            style={{ width: '100%', padding: '3px 6px', fontWeight: 600 }}
                          />
                        </td>
                        <td style={{ padding: 4 }}><input type="text" value={r.unitExecMeeting || ''} onChange={(e) => updateRow(idx, 'unitExecMeeting', e.target.value)} style={{ width: 45, textAlign: 'center' }} /></td>
                        <td style={{ padding: 4 }}><input type="text" value={r.unitGbMeeting || ''} onChange={(e) => updateRow(idx, 'unitGbMeeting', e.target.value)} style={{ width: 45, textAlign: 'center' }} /></td>
                        <td style={{ padding: 4 }}><input type="text" value={r.psoMeeting || ''} onChange={(e) => updateRow(idx, 'psoMeeting', e.target.value)} style={{ width: 45, textAlign: 'center' }} /></td>
                        <td style={{ padding: 4 }}><input type="text" value={r.seminar || ''} onChange={(e) => updateRow(idx, 'seminar', e.target.value)} style={{ width: 45, textAlign: 'center' }} /></td>
                        <td style={{ padding: 4 }}><input type="text" value={r.studyCircle || ''} onChange={(e) => updateRow(idx, 'studyCircle', e.target.value)} style={{ width: 45, textAlign: 'center' }} /></td>
                        <td style={{ padding: 4 }}><input type="text" value={r.induction || ''} onChange={(e) => updateRow(idx, 'induction', e.target.value)} style={{ width: 45, textAlign: 'center' }} /></td>
                        <td style={{ padding: 4 }}><input type="text" value={r.ralliesAndJirgas || ''} onChange={(e) => updateRow(idx, 'ralliesAndJirgas', e.target.value)} style={{ width: 45, textAlign: 'center' }} /></td>
                        <td style={{ padding: 4 }}><input type="text" value={r.alliedMeetings || ''} onChange={(e) => updateRow(idx, 'alliedMeetings', e.target.value)} style={{ width: 45, textAlign: 'center' }} /></td>
                        <td style={{ padding: 4 }}><input type="text" value={r.partyConference || ''} onChange={(e) => updateRow(idx, 'partyConference', e.target.value)} style={{ width: 45, textAlign: 'center' }} /></td>
                        <td style={{ padding: 4 }}><input type="text" value={r.totalMeetings || ''} onChange={(e) => updateRow(idx, 'totalMeetings', e.target.value)} style={{ width: 45, textAlign: 'center', fontWeight: 'bold' }} /></td>
                        <td style={{ padding: 4 }}><input type="text" value={r.inactiveContact || ''} onChange={(e) => updateRow(idx, 'inactiveContact', e.target.value)} style={{ width: 45, textAlign: 'center' }} /></td>
                        <td style={{ padding: 4 }}><input type="text" value={r.publicOutreach || ''} onChange={(e) => updateRow(idx, 'publicOutreach', e.target.value)} style={{ width: 45, textAlign: 'center' }} /></td>
                        <td style={{ padding: 4 }}><input type="text" value={r.monthlyDues || ''} onChange={(e) => updateRow(idx, 'monthlyDues', e.target.value)} style={{ width: 65, textAlign: 'center' }} /></td>
                        <td style={{ padding: 4 }}><input type="text" value={r.reading || ''} onChange={(e) => updateRow(idx, 'reading', e.target.value)} style={{ width: 45, textAlign: 'center' }} /></td>
                        <td style={{ padding: 4 }}><input type="text" value={r.districtOrAreaAttendance || ''} onChange={(e) => updateRow(idx, 'districtOrAreaAttendance', e.target.value)} style={{ width: 65, textAlign: 'center' }} /></td>
                        <td style={{ padding: 4 }}><input type="text" value={r.activeStatus || 'فعاله'} onChange={(e) => updateRow(idx, 'activeStatus', e.target.value)} style={{ width: 65, textAlign: 'center' }} /></td>
                        <td style={{ padding: 4 }}><input type="text" value={r.bloodPostsAndZakat || ''} onChange={(e) => updateRow(idx, 'bloodPostsAndZakat', e.target.value)} style={{ width: 65, textAlign: 'center' }} /></td>
                        <td style={{ padding: 4 }}>
                          <button
                            type="button"
                            onClick={() => removeRow(idx)}
                            style={{ background: 'none', border: 'none', color: '#ef4444', cursor: 'pointer', fontSize: 14 }}
                          >
                            ✕
                          </button>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          )}

          {/* FORM 1 ROSTER: CARDS VIEW */}
          {formType === 'form1' && rosterViewMode === 'cards' && (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(340px, 1fr))', gap: 16 }}>
              {rows.length === 0 ? (
                <div className="card" style={{ textAlign: 'center', padding: 40, color: 'var(--text-soft)' }}>
                  {t('proforma.noMembers', 'No cabinet members registered yet.')}
                </div>
              ) : (
                rows.map((r, idx) => (
                  <div key={idx} className="card" style={{ position: 'relative', border: '1px solid var(--border)' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid var(--border)', paddingBottom: 10, marginBottom: 12 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <span style={{ background: '#0284c7', color: '#fff', borderRadius: '50%', width: 24, height: 24, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', fontSize: 12, fontWeight: 'bold' }}>
                          {idx + 1}
                        </span>
                        <input
                          type="text"
                          value={r.name || ''}
                          onChange={(e) => updateRow(idx, 'name', e.target.value)}
                          placeholder={t('proforma.memberNameRole', 'Name & Role')}
                          style={{ fontWeight: 'bold', fontSize: 14, padding: '3px 8px', width: 200 }}
                        />
                      </div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                        <span className={`badge ${r.activeStatus === 'فعاله' ? 'ACTIVE' : 'INACTIVE'}`} style={{ fontSize: 11 }}>
                          {r.activeStatus || 'فعاله'}
                        </span>
                        <button
                          type="button"
                          onClick={() => removeRow(idx)}
                          style={{ background: 'none', border: 'none', color: '#ef4444', cursor: 'pointer', fontSize: 15 }}
                        >
                          ✕
                        </button>
                      </div>
                    </div>

                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                      <div>
                        <label style={{ fontSize: 11, display: 'block', color: 'var(--text-soft)', marginBottom: 4 }}>{t('proforma.execMeetings', 'Exec Meetings')}</label>
                        <NumberStepper
                          value={r.areaExecMeetings}
                          onChange={(val) => updateRow(idx, 'areaExecMeetings', val)}
                        />
                      </div>

                      <div>
                        <label style={{ fontSize: 11, display: 'block', color: 'var(--text-soft)', marginBottom: 4 }}>{t('proforma.commMeetings', 'Comm Meetings')}</label>
                        <NumberStepper
                          value={r.areaCommMeetings}
                          onChange={(val) => updateRow(idx, 'areaCommMeetings', val)}
                        />
                      </div>

                      <div>
                        <label style={{ fontSize: 11, display: 'block', color: 'var(--text-soft)', marginBottom: 4 }}>{t('proforma.meetingDate', 'Meeting Date')}</label>
                        <input
                          type="text"
                          value={r.meetingDate || ''}
                          onChange={(e) => updateRow(idx, 'meetingDate', e.target.value)}
                          placeholder="24 Oct 2026"
                          style={{ width: '100%', fontSize: 12, padding: '5px 8px', borderRadius: 4, border: '1px solid var(--border)' }}
                        />
                      </div>

                      <div>
                        <label style={{ fontSize: 11, display: 'block', color: 'var(--text-soft)', marginBottom: 4 }}>{t('proforma.ownBuMeetings', 'Own BU')}</label>
                        <NumberStepper
                          value={r.ownBuMeetings}
                          onChange={(val) => updateRow(idx, 'ownBuMeetings', val)}
                        />
                      </div>

                      <div>
                        <label style={{ fontSize: 11, display: 'block', color: 'var(--text-soft)', marginBottom: 4 }}>{t('proforma.buExecMeetings', 'BU Exec Meetings')}</label>
                        <NumberStepper
                          value={r.buExecMeetings}
                          onChange={(val) => updateRow(idx, 'buExecMeetings', val)}
                        />
                      </div>

                      <div>
                        <label style={{ fontSize: 11, display: 'block', color: 'var(--text-soft)', marginBottom: 4 }}>{t('proforma.buMeetings', 'BU Meetings')}</label>
                        <NumberStepper
                          value={r.buMeetings}
                          onChange={(val) => updateRow(idx, 'buMeetings', val)}
                        />
                      </div>

                      <div>
                        <label style={{ fontSize: 11, display: 'block', color: 'var(--text-soft)', marginBottom: 4 }}>{t('proforma.pso', 'PSO')}</label>
                        <NumberStepper
                          value={r.psoMeetings}
                          onChange={(val) => updateRow(idx, 'psoMeetings', val)}
                        />
                      </div>

                      <div>
                        <label style={{ fontSize: 11, display: 'block', color: 'var(--text-soft)', marginBottom: 4 }}>{t('proforma.conferences', 'Conferences')}</label>
                        <NumberStepper
                          value={r.conferences}
                          onChange={(val) => updateRow(idx, 'conferences', val)}
                        />
                      </div>

                      <div>
                        <label style={{ fontSize: 11, display: 'block', color: 'var(--text-soft)', marginBottom: 4 }}>{t('proforma.seminars', 'Seminars')}</label>
                        <NumberStepper
                          value={r.seminars}
                          onChange={(val) => updateRow(idx, 'seminars', val)}
                        />
                      </div>

                      <div>
                        <label style={{ fontSize: 11, display: 'block', color: 'var(--text-soft)', marginBottom: 4 }}>{t('proforma.studyCircles', 'Study Circles')}</label>
                        <NumberStepper
                          value={r.studyCircles}
                          onChange={(val) => updateRow(idx, 'studyCircles', val)}
                        />
                      </div>

                      <div>
                        <label style={{ fontSize: 11, display: 'block', color: 'var(--text-soft)', marginBottom: 4 }}>{t('proforma.inductions', 'Inductions')}</label>
                        <NumberStepper
                          value={r.inductions}
                          onChange={(val) => updateRow(idx, 'inductions', val)}
                        />
                      </div>

                      <div>
                        <label style={{ fontSize: 11, display: 'block', color: 'var(--text-soft)', marginBottom: 4 }}>{t('proforma.alliesMeetings', 'Allies Mtgs')}</label>
                        <NumberStepper
                          value={r.alliedMeetings}
                          onChange={(val) => updateRow(idx, 'alliedMeetings', val)}
                        />
                      </div>

                      <div>
                        <label style={{ fontSize: 11, display: 'block', color: 'var(--text-soft)', marginBottom: 4 }}>{t('proforma.rallies', 'Rallies/Protests')}</label>
                        <NumberStepper
                          value={r.ralliesAndJirgas}
                          onChange={(val) => updateRow(idx, 'ralliesAndJirgas', val)}
                        />
                      </div>

                      <div>
                        <label style={{ fontSize: 11, display: 'block', color: 'var(--text-soft)', marginBottom: 4 }}>{t('proforma.unitMeetings', 'Unit Meetings')}</label>
                        <NumberStepper
                          value={r.unitMeetings}
                          onChange={(val) => updateRow(idx, 'unitMeetings', val)}
                        />
                      </div>

                      <div>
                        <label style={{ fontSize: 11, display: 'block', color: 'var(--text-soft)', marginBottom: 4 }}>{t('proforma.tours', 'Tours')}</label>
                        <NumberStepper
                          value={r.tours}
                          onChange={(val) => updateRow(idx, 'tours', val)}
                        />
                      </div>

                      <div>
                        <label style={{ fontSize: 11, display: 'block', color: 'var(--text-soft)', marginBottom: 4 }}>{t('proforma.publicOutreach', 'Public Outreach')}</label>
                        <NumberStepper
                          value={r.publicOutreach}
                          onChange={(val) => updateRow(idx, 'publicOutreach', val)}
                        />
                      </div>

                      <div>
                        <label style={{ fontSize: 11, display: 'block', color: 'var(--text-soft)', marginBottom: 4 }}>{t('proforma.orgOutreach', 'Org Outreach')}</label>
                        <NumberStepper
                          value={r.orgOutreach}
                          onChange={(val) => updateRow(idx, 'orgOutreach', val)}
                        />
                      </div>
                    </div>

                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 12, marginTop: 12, paddingTop: 10, borderTop: '1px dashed var(--border)' }}>
                      <div>
                        <label style={{ fontSize: 11, display: 'block', color: 'var(--text-soft)', marginBottom: 4 }}>{t('proforma.monthlyDues', 'Monthly Dues (PKR)')}</label>
                        <input
                          type="number"
                          value={r.monthlyDues ?? ''}
                          onChange={(e) => updateRow(idx, 'monthlyDues', e.target.value)}
                          placeholder="1000"
                        />
                      </div>

                      <div>
                        <label style={{ fontSize: 11, display: 'block', color: 'var(--text-soft)', marginBottom: 4 }}>{t('proforma.officeAttendance', 'Office Attendance')}</label>
                        <input
                          type="text"
                          value={r.officeAttendance ?? ''}
                          onChange={(e) => updateRow(idx, 'officeAttendance', e.target.value)}
                          placeholder="حاضر / 100%"
                        />
                      </div>

                      <div>
                        <label style={{ fontSize: 11, display: 'block', color: 'var(--text-soft)', marginBottom: 4 }}>{t('proforma.bloodBank', 'Blood Bank')}</label>
                        <select
                          value={r.bloodPostsAndZakat || ''}
                          onChange={(e) => updateRow(idx, 'bloodPostsAndZakat', e.target.value)}
                        >
                          <option value="">— Select —</option>
                          <option value="A+">Group A+</option>
                          <option value="A-">Group A-</option>
                          <option value="B+">Group B+</option>
                          <option value="B-">Group B-</option>
                          <option value="AB+">Group AB+</option>
                          <option value="AB-">Group AB-</option>
                          <option value="O+">Group O+</option>
                          <option value="O-">Group O-</option>
                        </select>
                      </div>

                      <div>
                        <label style={{ fontSize: 11, display: 'block', color: 'var(--text-soft)', marginBottom: 4 }}>{t('proforma.educationReading', 'Education / Reading')}</label>
                        <input
                          type="text"
                          value={r.ideologicalReading || ''}
                          onChange={(e) => updateRow(idx, 'ideologicalReading', e.target.value)}
                          placeholder="Matric / Intermediate / LL.B"
                        />
                      </div>
                    </div>
                  </div>
                ))
              )}
            </div>
          )}

          {/* FORM 1 ROSTER: OFFICIAL 24-COLUMN DENSE TABLE VIEW */}
          {formType === 'form1' && rosterViewMode === 'table' && (
            <div style={{ overflowX: 'auto', maxHeight: '600px', border: '1px solid var(--border)', borderRadius: 8 }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12, minWidth: 1600, textAlign: 'center' }}>
                <thead style={{ background: 'var(--surface-alt)', position: 'sticky', top: 0, zIndex: 10 }}>
                  <tr style={{ borderBottom: '2px solid var(--border)' }}>
                    <th style={{ padding: 6, width: 36 }}>#</th>
                    <th style={{ padding: 6, minWidth: 180 }}>{t('proforma.memberNameRole', 'Name & Role')}</th>
                    <th style={{ padding: 6, width: 85 }}>{t('proforma.meetingDate', 'Date')}</th>
                    <th style={{ padding: 6, width: 60 }}>{t('proforma.execMeetings', 'Exec')}</th>
                    <th style={{ padding: 6, width: 60 }}>{t('proforma.commMeetings', 'Comm')}</th>
                    <th style={{ padding: 6, width: 65 }}>{t('proforma.ownBuMeetings', 'Own BU')}</th>
                    <th style={{ padding: 6, width: 65 }}>{t('proforma.buExecMeetings', 'BU Exec')}</th>
                    <th style={{ padding: 6, width: 65 }}>{t('proforma.buMeetings', 'BU Mtgs')}</th>
                    <th style={{ padding: 6, width: 55 }}>{t('proforma.pso', 'PSO')}</th>
                    <th style={{ padding: 6, width: 55 }}>{t('proforma.conferences', 'Conf')}</th>
                    <th style={{ padding: 6, width: 55 }}>{t('proforma.seminars', 'Sem')}</th>
                    <th style={{ padding: 6, width: 55 }}>{t('proforma.studyCircles', 'Study')}</th>
                    <th style={{ padding: 6, width: 55 }}>{t('proforma.inductions', 'Induct')}</th>
                    <th style={{ padding: 6, width: 55 }}>{t('proforma.alliesMeetings', 'Allies')}</th>
                    <th style={{ padding: 6, width: 55 }}>{t('proforma.rallies', 'Rallies')}</th>
                    <th style={{ padding: 6, width: 75 }}>{t('proforma.monthlyDues', 'Dues')}</th>
                    <th style={{ padding: 6, width: 65 }}>{t('proforma.unitMeetings', 'Unit Mtgs')}</th>
                    <th style={{ padding: 6, width: 55 }}>{t('proforma.tours', 'Tours')}</th>
                    <th style={{ padding: 6, width: 55 }}>{t('proforma.publicOutreach', 'Public')}</th>
                    <th style={{ padding: 6, width: 55 }}>{t('proforma.orgOutreach', 'Org')}</th>
                    <th style={{ padding: 6, width: 70 }}>{t('proforma.officeAttendance', 'Office')}</th>
                    <th style={{ padding: 6, width: 70 }}>{t('proforma.statusActive', 'Status')}</th>
                    <th style={{ padding: 6, width: 70 }}>{t('proforma.bloodBank', 'Blood')}</th>
                    <th style={{ padding: 6, width: 95 }}>{t('proforma.educationReading', 'Education')}</th>
                    <th style={{ padding: 6, width: 36 }}>✕</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.length === 0 ? (
                    <tr>
                      <td colSpan={25} style={{ padding: 30, color: 'var(--text-soft)' }}>
                        {t('proforma.noMembers', 'No members registered yet.')}
                      </td>
                    </tr>
                  ) : (
                    rows.map((r, idx) => (
                      <tr key={idx} style={{ borderBottom: '1px solid var(--border)' }}>
                        <td style={{ padding: 4 }}>{idx + 1}</td>
                        <td style={{ padding: 4 }}>
                          <input
                            type="text"
                            value={r.name || ''}
                            onChange={(e) => updateRow(idx, 'name', e.target.value)}
                            placeholder={t('proforma.memberNameRole', 'Name & Role')}
                            style={{ width: '100%', padding: '3px 6px', fontWeight: 600 }}
                          />
                        </td>
                        <td style={{ padding: 4 }}><input type="text" value={r.meetingDate || ''} onChange={(e) => updateRow(idx, 'meetingDate', e.target.value)} placeholder="24 Oct 2026" style={{ width: 80, textAlign: 'center', fontSize: 11 }} /></td>
                        <td style={{ padding: 4 }}><input type="text" value={r.areaExecMeetings || ''} onChange={(e) => updateRow(idx, 'areaExecMeetings', e.target.value)} style={{ width: 45, textAlign: 'center' }} /></td>
                        <td style={{ padding: 4 }}><input type="text" value={r.areaCommMeetings || ''} onChange={(e) => updateRow(idx, 'areaCommMeetings', e.target.value)} style={{ width: 45, textAlign: 'center' }} /></td>
                        <td style={{ padding: 4 }}><input type="text" value={r.ownBuMeetings || ''} onChange={(e) => updateRow(idx, 'ownBuMeetings', e.target.value)} style={{ width: 45, textAlign: 'center' }} /></td>
                        <td style={{ padding: 4 }}><input type="text" value={r.buExecMeetings || ''} onChange={(e) => updateRow(idx, 'buExecMeetings', e.target.value)} style={{ width: 45, textAlign: 'center' }} /></td>
                        <td style={{ padding: 4 }}><input type="text" value={r.buMeetings || ''} onChange={(e) => updateRow(idx, 'buMeetings', e.target.value)} style={{ width: 45, textAlign: 'center' }} /></td>
                        <td style={{ padding: 4 }}><input type="text" value={r.psoMeetings || ''} onChange={(e) => updateRow(idx, 'psoMeetings', e.target.value)} style={{ width: 45, textAlign: 'center' }} /></td>
                        <td style={{ padding: 4 }}><input type="text" value={r.conferences || ''} onChange={(e) => updateRow(idx, 'conferences', e.target.value)} style={{ width: 45, textAlign: 'center' }} /></td>
                        <td style={{ padding: 4 }}><input type="text" value={r.seminars || ''} onChange={(e) => updateRow(idx, 'seminars', e.target.value)} style={{ width: 45, textAlign: 'center' }} /></td>
                        <td style={{ padding: 4 }}><input type="text" value={r.studyCircles || ''} onChange={(e) => updateRow(idx, 'studyCircles', e.target.value)} style={{ width: 45, textAlign: 'center' }} /></td>
                        <td style={{ padding: 4 }}><input type="text" value={r.inductions || ''} onChange={(e) => updateRow(idx, 'inductions', e.target.value)} style={{ width: 45, textAlign: 'center' }} /></td>
                        <td style={{ padding: 4 }}><input type="text" value={r.alliedMeetings || ''} onChange={(e) => updateRow(idx, 'alliedMeetings', e.target.value)} style={{ width: 45, textAlign: 'center' }} /></td>
                        <td style={{ padding: 4 }}><input type="text" value={r.ralliesAndJirgas || ''} onChange={(e) => updateRow(idx, 'ralliesAndJirgas', e.target.value)} style={{ width: 45, textAlign: 'center' }} /></td>
                        <td style={{ padding: 4 }}><input type="text" value={r.monthlyDues || ''} onChange={(e) => updateRow(idx, 'monthlyDues', e.target.value)} style={{ width: 65, textAlign: 'center' }} /></td>
                        <td style={{ padding: 4 }}><input type="text" value={r.unitMeetings || ''} onChange={(e) => updateRow(idx, 'unitMeetings', e.target.value)} style={{ width: 45, textAlign: 'center' }} /></td>
                        <td style={{ padding: 4 }}><input type="text" value={r.tours || ''} onChange={(e) => updateRow(idx, 'tours', e.target.value)} style={{ width: 45, textAlign: 'center' }} /></td>
                        <td style={{ padding: 4 }}><input type="text" value={r.publicOutreach || ''} onChange={(e) => updateRow(idx, 'publicOutreach', e.target.value)} style={{ width: 45, textAlign: 'center' }} /></td>
                        <td style={{ padding: 4 }}><input type="text" value={r.orgOutreach || ''} onChange={(e) => updateRow(idx, 'orgOutreach', e.target.value)} style={{ width: 45, textAlign: 'center' }} /></td>
                        <td style={{ padding: 4 }}><input type="text" value={r.officeAttendance || ''} onChange={(e) => updateRow(idx, 'officeAttendance', e.target.value)} style={{ width: 65, textAlign: 'center' }} /></td>
                        <td style={{ padding: 4 }}><input type="text" value={r.activeStatus || 'فعاله'} onChange={(e) => updateRow(idx, 'activeStatus', e.target.value)} style={{ width: 65, textAlign: 'center' }} /></td>
                        <td style={{ padding: 4 }}><input type="text" value={r.bloodPostsAndZakat || ''} onChange={(e) => updateRow(idx, 'bloodPostsAndZakat', e.target.value)} style={{ width: 65, textAlign: 'center' }} /></td>
                        <td style={{ padding: 4 }}><input type="text" value={r.ideologicalReading || ''} onChange={(e) => updateRow(idx, 'ideologicalReading', e.target.value)} style={{ width: 95, textAlign: 'center' }} /></td>
                        <td style={{ padding: 4 }}>
                          <button
                            type="button"
                            onClick={() => removeRow(idx)}
                            style={{ background: 'none', border: 'none', color: '#ef4444', cursor: 'pointer', fontSize: 14 }}
                          >
                            ✕
                          </button>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* ────────────────────────────────────────────────────────────────────────── */}
      {/* TAB 3: NOTES & REMARKS */}
      {/* ────────────────────────────────────────────────────────────────────────── */}
      {activeTab === 'notes' && (
        <div className="card">
          <h3 style={{ margin: '0 0 10px', color: 'var(--primary, #38bdf8)' }}>
            {formType === 'form2' || formType === 'form5' || formType === 'form7' || formType === 'form8' || formType === 'form9'
              ? t('proforma.tabNotes2', '2. Remarks & Observations')
              : t('proforma.tabNotes', '3. Remarks & Observations')}
          </h3>
          <p className="muted" style={{ margin: '0 0 14px', fontSize: 13 }}>
            {t('proforma.notesPrompt', 'Write detailed political, organizational observations, unit reports, and upcoming resolutions for this month:')}
          </p>
          <textarea
            rows={8}
            value={formData.notes || ''}
            onChange={(e) => updateField('notes', e.target.value)}
            placeholder={formType === 'form9'
              ? t('proforma.notesPlaceholderForm9', 'e.g., Central and provincial organ comrades carried out party assignments, rallies, and organizational visits...')
              : formType === 'form8'
              ? t('proforma.form8.notesPlaceholder', 'e.g., During this month, central and provincial committee members in the district attended district and area meetings, conducted study circles, mobilized public rallies, and participated in party activities...')
              : formType === 'form7'
              ? t('proforma.form7.notesPlaceholder', 'e.g., During this month, subordinate area units held regular executive and general body meetings, basic units were supervised, ideological study circles were conducted, and dues were remitted to district leadership...')
              : formType === 'form6'
              ? t('proforma.notesPlaceholderForm6', 'e.g., During this month/quarter, district executive meetings were conducted, subordinate area and basic units performance was evaluated, ideological study circles were held, and political rallies were organized...')
              : formType === 'form5'
              ? t('proforma.notesPlaceholderForm5', 'e.g., During this period, provincial executive comrades completed organizational tours, attended central and provincial meetings, conducted study circles, and submitted individual activity summaries...')
              : formType === 'form4'
              ? t('proforma.notesPlaceholderForm4', 'e.g., During this month, the basic unit executive meeting was held with full attendance, new members were inducted, and upcoming political rallies were scheduled...')
              : formType === 'form2'
              ? t('proforma.notesPlaceholderForm2', 'e.g., During this month, subordinate basic units held regular executive and general body meetings, study circles were conducted, and dues were collected...')
              : t('proforma.notesPlaceholder', 'e.g., During this month, the area executive meeting was held with full attendance, new members were inducted, and upcoming political rallies were scheduled...')}
            style={{ width: '100%', padding: 12, borderRadius: 8, lineHeight: 1.6, fontSize: 14 }}
          />
        </div>
      )}

      {/* ────────────────────────────────────────────────────────────────────────── */}
      {/* FORM 3 TABS 1 TO 4 (ALL 8 SECTIONS) */}
      {/* ────────────────────────────────────────────────────────────────────────── */}
      {formType === 'form3' && activeTab === 'form3_tab1' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
          {/* Section 1: Inactive Basic Units */}
          <div className="card" style={{ padding: 18 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14, flexWrap: 'wrap', gap: 10 }}>
              <div>
                <h3 style={{ margin: 0, color: 'var(--primary, #38bdf8)', display: 'flex', alignItems: 'center', gap: 8, fontSize: 16 }}>
                  <span>🏢</span>
                  <span>{t('proforma.form3.sec1Title', 'علاقائي يونټ کښي غير فعاله ابتدائي يونټانو نومونه،وجوهات / وړانديزونه')}</span>
                </h3>
                <div style={{ fontSize: 12, color: 'var(--text-soft)', marginTop: 4 }}>
                  {t('proforma.form3.sec1Subtitle', 'Names of inactive basic units, specific causes/reasons, and revival proposals')}
                </div>
              </div>
              <button
                type="button"
                className="btn"
                onClick={addInactiveUnitRow}
                style={{ fontSize: 13, display: 'flex', alignItems: 'center', gap: 6, background: '#0284c7', borderColor: '#0284c7' }}
              >
                <span>➕</span>
                <span>{t('proforma.form3.addInactiveUnit', '+ Add Inactive Unit')}</span>
              </button>
            </div>

            {(formData.inactiveUnits || []).length === 0 ? (
              <div style={{ padding: '24px 16px', textAlign: 'center', color: 'var(--text-soft)', background: 'var(--surface-alt)', borderRadius: 8, border: '1px dashed var(--border)' }}>
                {t('proforma.form3.noInactiveUnits', 'No inactive units recorded in this area.')}
              </div>
            ) : (
              <div style={{ overflowX: 'auto' }}>
                <table className="table" style={{ width: '100%', fontSize: 13, borderCollapse: 'collapse' }}>
                  <thead>
                    <tr style={{ background: 'var(--surface-alt)' }}>
                      <th style={{ width: 50, textAlign: 'center' }}>#</th>
                      <th style={{ minWidth: 200 }}>{t('proforma.form3.unitName', 'Basic Unit Name')}</th>
                      <th style={{ minWidth: 280 }}>{t('proforma.form3.reason', 'Reasons for Inactivity')}</th>
                      <th style={{ minWidth: 280 }}>{t('proforma.form3.suggestion', 'Suggestions / Proposals')}</th>
                      <th style={{ width: 60, textAlign: 'center' }}>✕</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(formData.inactiveUnits || []).map((u, idx) => (
                      <tr key={idx}>
                        <td style={{ textAlign: 'center', fontWeight: 'bold' }}>{idx + 1}</td>
                        <td>
                          <input
                            type="text"
                            value={u.unitName || ''}
                            onChange={(e) => updateInactiveUnitRow(idx, 'unitName', e.target.value)}
                            placeholder={t('proforma.form3.unitNamePlaceholder', 'e.g., کلي څانګه / Basic Unit name')}
                            style={{ width: '100%', padding: '6px 10px', borderRadius: 4 }}
                          />
                        </td>
                        <td>
                          <input
                            type="text"
                            value={u.reason || ''}
                            onChange={(e) => updateInactiveUnitRow(idx, 'reason', e.target.value)}
                            placeholder={t('proforma.form3.reasonPlaceholder', 'e.g., مشر ملګری مسافر دی / lack of regular meetings...')}
                            style={{ width: '100%', padding: '6px 10px', borderRadius: 4 }}
                          />
                        </td>
                        <td>
                          <input
                            type="text"
                            value={u.suggestion || ''}
                            onChange={(e) => updateInactiveUnitRow(idx, 'suggestion', e.target.value)}
                            placeholder={t('proforma.form3.suggestionPlaceholder', 'e.g., د نوي باډۍ ټاکل / reorganization visit proposed...')}
                            style={{ width: '100%', padding: '6px 10px', borderRadius: 4 }}
                          />
                        </td>
                        <td style={{ textAlign: 'center' }}>
                          <button
                            type="button"
                            onClick={() => removeInactiveUnitRow(idx)}
                            title="Remove"
                            style={{ border: 'none', background: 'transparent', color: '#ef4444', cursor: 'pointer', fontSize: 16 }}
                          >
                            🗑️
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          {/* Section 2: Higher Committee Members Activity */}
          <div className="card" style={{ padding: 18 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14, flexWrap: 'wrap', gap: 10 }}>
              <div>
                <h3 style={{ margin: 0, color: 'var(--primary, #38bdf8)', display: 'flex', alignItems: 'center', gap: 8, fontSize: 16 }}>
                  <span>👥</span>
                  <span>{t('proforma.form3.sec2Title', 'علاقائي يونټ کښي مرکزي، زونل،ضلعي،علاقائي کميټي د غړو کار او فعاليت رپورټ')}</span>
                </h3>
                <div style={{ fontSize: 12, color: 'var(--text-soft)', marginTop: 4 }}>
                  {t('proforma.form3.sec2Subtitle', 'Comprehensive attendance, education, outreach and dues register for high-tier committee leaders')}
                </div>
              </div>
              <button
                type="button"
                className="btn"
                onClick={addCommitteeMemberRow}
                style={{ fontSize: 13, display: 'flex', alignItems: 'center', gap: 6, background: '#0284c7', borderColor: '#0284c7' }}
              >
                <span>➕</span>
                <span>{t('proforma.form3.addMember', '+ Add Committee Member')}</span>
              </button>
            </div>

            {(formData.committeeMembers || []).length === 0 ? (
              <div style={{ padding: '24px 16px', textAlign: 'center', color: 'var(--text-soft)', background: 'var(--surface-alt)', borderRadius: 8, border: '1px dashed var(--border)' }}>
                {t('proforma.form3.noMembers', 'No committee members registered yet. Click "+ Add Committee Member" or auto-fill.')}
              </div>
            ) : (
              <div style={{ overflowX: 'auto', border: '1px solid var(--border)', borderRadius: 8 }}>
                <table className="table" style={{ width: '100%', minWidth: 1400, fontSize: 12, borderCollapse: 'collapse', textAlign: 'center' }}>
                  <thead>
                    <tr style={{ background: 'var(--surface-alt)' }}>
                      <th style={{ width: 40 }}>#</th>
                      <th style={{ minWidth: 150, textAlign: isRtl ? 'right' : 'left' }}>{t('proforma.form3.name', 'Comrade / Member Name')}</th>
                      <th style={{ minWidth: 120 }}>{t('proforma.form3.role', 'Designation')}</th>
                      <th style={{ minWidth: 100 }}>{t('proforma.form3.date', 'Date')}</th>
                      <th title="علاقائي ايګزيکټيو غونډي" style={{ minWidth: 70 }}>{t('proforma.form3.areaExec', 'Area Exec')}</th>
                      <th title="علاقائي کميټي غونډي" style={{ minWidth: 70 }}>{t('proforma.form3.areaComm', 'Area Comm')}</th>
                      <th title="يونټ ايګزيکټيو غونډي" style={{ minWidth: 70 }}>{t('proforma.form3.unitExec', 'Unit Exec')}</th>
                      <th title="يونټ جنرل باډي غونډي" style={{ minWidth: 70 }}>{t('proforma.form3.unitGb', 'Unit GB')}</th>
                      <th title="پي ايس او غونډي" style={{ minWidth: 65 }}>{t('proforma.form3.pso', 'PSO')}</th>
                      <th title="کانفرنس" style={{ minWidth: 65 }}>{t('proforma.form3.conf', 'Conf')}</th>
                      <th title="سيمينار" style={{ minWidth: 65 }}>{t('proforma.form3.seminar', 'Seminar')}</th>
                      <th title="سټډي سرکل" style={{ minWidth: 70 }}>{t('proforma.form3.studyCircle', 'Study')}</th>
                      <th title="شموليت پروګرام" style={{ minWidth: 70 }}>{t('proforma.form3.induction', 'Induction')}</th>
                      <th title="جلسه مظاهره جرګه" style={{ minWidth: 75 }}>{t('proforma.form3.rally', 'Rally/Jirga')}</th>
                      <th title="لوستنه (مطالعه)" style={{ minWidth: 70 }}>{t('proforma.form3.reading', 'Reading')}</th>
                      <th title="غير فعاله ايګزيکټيو او ملګرو سره رابطه" style={{ minWidth: 80 }}>{t('proforma.form3.inactiveContact', 'Inactive Outreach')}</th>
                      <th title="چنده (PKR)" style={{ minWidth: 90 }}>{t('proforma.form3.dues', 'Dues')}</th>
                      <th title="دوره" style={{ minWidth: 65 }}>{t('proforma.form3.tour', 'Tour')}</th>
                      <th style={{ width: 45 }}>✕</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(formData.committeeMembers || []).map((m, idx) => (
                      <tr key={idx}>
                        <td style={{ fontWeight: 'bold' }}>{idx + 1}</td>
                        <td style={{ textAlign: isRtl ? 'right' : 'left' }}>
                          <input
                            type="text"
                            value={m.name || ''}
                            onChange={(e) => updateCommitteeMemberRow(idx, 'name', e.target.value)}
                            placeholder="Comrade Name"
                            style={{ width: '100%', padding: '4px 8px', fontSize: 12, borderRadius: 4 }}
                          />
                        </td>
                        <td>
                          <input
                            type="text"
                            value={m.role || ''}
                            onChange={(e) => updateCommitteeMemberRow(idx, 'role', e.target.value)}
                            placeholder="Role / Title"
                            style={{ width: '100%', padding: '4px 6px', fontSize: 12, borderRadius: 4 }}
                          />
                        </td>
                        <td>
                          <input
                            type="text"
                            value={m.date || ''}
                            onChange={(e) => updateCommitteeMemberRow(idx, 'date', e.target.value)}
                            placeholder="DD/MM"
                            style={{ width: '100%', padding: '4px 6px', fontSize: 12, borderRadius: 4, textAlign: 'center' }}
                          />
                        </td>
                        {['areaExec', 'areaComm', 'unitExec', 'unitGb', 'pso', 'conf', 'seminar', 'studyCircle', 'induction', 'rally', 'reading', 'inactiveContact'].map((col) => (
                          <td key={col}>
                            <NumberStepper
                              value={m[col]}
                              onChange={(val) => updateCommitteeMemberRow(idx, col, val)}
                              min={0}
                              style={{ minWidth: 70, transform: 'scale(0.92)' }}
                            />
                          </td>
                        ))}
                        <td>
                          <input
                            type="number"
                            value={m.dues ?? ''}
                            min={0}
                            onChange={(e) => updateCommitteeMemberRow(idx, 'dues', e.target.value === '' ? '' : parseInt(e.target.value, 10) || 0)}
                            placeholder="0"
                            style={{ width: 75, padding: '4px 6px', fontSize: 12, borderRadius: 4, textAlign: 'center', fontWeight: 'bold' }}
                          />
                        </td>
                        <td>
                          <NumberStepper
                            value={m.tour}
                            onChange={(val) => updateCommitteeMemberRow(idx, 'tour', val)}
                            min={0}
                            style={{ minWidth: 70, transform: 'scale(0.92)' }}
                          />
                        </td>
                        <td>
                          <button
                            type="button"
                            onClick={() => removeCommitteeMemberRow(idx)}
                            title="Remove"
                            style={{ border: 'none', background: 'transparent', color: '#ef4444', cursor: 'pointer', fontSize: 15 }}
                          >
                            🗑️
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      )}

      {/* TAB 2: PUBLIC GATHERINGS & EDUCATION */}
      {formType === 'form3' && activeTab === 'form3_tab2' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
          {/* Section 3: Public Gatherings, Rallies, Protests, Jirgas, Corner Meetings, Inductions */}
          <div className="card" style={{ padding: 18 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14, flexWrap: 'wrap', gap: 10 }}>
              <div>
                <h3 style={{ margin: 0, color: 'var(--primary, #38bdf8)', display: 'flex', alignItems: 'center', gap: 8, fontSize: 16 }}>
                  <span>📢</span>
                  <span>{t('proforma.form3.sec3Title', 'علاقائي يونټ کي اولسي غونډي، جلسے،مظاهرے، جرګے،کارنر ميټنګ،شموليت پرګرامونو رپورټ')}</span>
                </h3>
                <div style={{ fontSize: 12, color: 'var(--text-soft)', marginTop: 4 }}>
                  {t('proforma.form3.sec3Subtitle', 'Mass rallies, demonstrations, public jirgas, corner meetings, and new membership induction ceremonies')}
                </div>
              </div>
              <button
                type="button"
                className="btn"
                onClick={addPublicActivityRow}
                style={{ fontSize: 13, display: 'flex', alignItems: 'center', gap: 6, background: '#0284c7', borderColor: '#0284c7' }}
              >
                <span>➕</span>
                <span>{t('proforma.form3.addPublicActivity', '+ Add Public Gathering')}</span>
              </button>
            </div>

            {(formData.publicActivities || []).length === 0 ? (
              <div style={{ padding: '24px 16px', textAlign: 'center', color: 'var(--text-soft)', background: 'var(--surface-alt)', borderRadius: 8, border: '1px dashed var(--border)' }}>
                {t('proforma.form3.noPublicActivities', 'No public gatherings recorded.')}
              </div>
            ) : (
              <div style={{ overflowX: 'auto', border: '1px solid var(--border)', borderRadius: 8 }}>
                <table className="table" style={{ width: '100%', minWidth: 1000, fontSize: 12, borderCollapse: 'collapse' }}>
                  <thead>
                    <tr style={{ background: 'var(--surface-alt)' }}>
                      <th style={{ width: 40, textAlign: 'center' }}>#</th>
                      <th style={{ minWidth: 140 }}>{t('proforma.form3.orgName', 'Organ / Unit Name')}</th>
                      <th style={{ width: 95 }}>{t('proforma.form3.date', 'Date')}</th>
                      <th style={{ minWidth: 130 }}>{t('proforma.form3.location', 'Venue / Location')}</th>
                      <th style={{ minWidth: 160 }}>{t('proforma.form3.topic', 'Topic / Subject')}</th>
                      <th style={{ minWidth: 130 }}>{t('proforma.form3.programType', 'Program Type')}</th>
                      <th style={{ minWidth: 160 }}>{t('proforma.form3.speakers', 'Key Speakers')}</th>
                      <th style={{ width: 90, textAlign: 'center' }}>{t('proforma.form3.memberCount', 'Members Count')}</th>
                      <th style={{ width: 90, textAlign: 'center' }}>{t('proforma.form3.publicCount', 'Public Attendees')}</th>
                      <th style={{ width: 45, textAlign: 'center' }}>✕</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(formData.publicActivities || []).map((p, idx) => (
                      <tr key={idx}>
                        <td style={{ textAlign: 'center', fontWeight: 'bold' }}>{idx + 1}</td>
                        <td>
                          <input
                            type="text"
                            value={p.orgName || ''}
                            onChange={(e) => updatePublicActivityRow(idx, 'orgName', e.target.value)}
                            placeholder="Organ / Unit Name"
                            style={{ width: '100%', padding: '4px 8px', fontSize: 12, borderRadius: 4 }}
                          />
                        </td>
                        <td>
                          <input
                            type="text"
                            value={p.date || ''}
                            onChange={(e) => updatePublicActivityRow(idx, 'date', e.target.value)}
                            placeholder="DD/MM"
                            style={{ width: '100%', padding: '4px 6px', fontSize: 12, borderRadius: 4, textAlign: 'center' }}
                          />
                        </td>
                        <td>
                          <input
                            type="text"
                            value={p.location || ''}
                            onChange={(e) => updatePublicActivityRow(idx, 'location', e.target.value)}
                            placeholder="Venue"
                            style={{ width: '100%', padding: '4px 8px', fontSize: 12, borderRadius: 4 }}
                          />
                        </td>
                        <td>
                          <input
                            type="text"
                            value={p.topic || ''}
                            onChange={(e) => updatePublicActivityRow(idx, 'topic', e.target.value)}
                            placeholder="Subject / Agenda"
                            style={{ width: '100%', padding: '4px 8px', fontSize: 12, borderRadius: 4 }}
                          />
                        </td>
                        <td>
                          <input
                            type="text"
                            value={p.programType || ''}
                            onChange={(e) => updatePublicActivityRow(idx, 'programType', e.target.value)}
                            placeholder="Program Type"
                            style={{ width: '100%', padding: '4px 8px', fontSize: 12, borderRadius: 4 }}
                          />
                        </td>
                        <td>
                          <input
                            type="text"
                            value={p.speakers || ''}
                            onChange={(e) => updatePublicActivityRow(idx, 'speakers', e.target.value)}
                            placeholder="Key Speakers"
                            style={{ width: '100%', padding: '4px 8px', fontSize: 12, borderRadius: 4 }}
                          />
                        </td>
                        <td style={{ textAlign: 'center' }}>
                          <input
                            type="number"
                            value={p.memberCount ?? ''}
                            min={0}
                            onChange={(e) => updatePublicActivityRow(idx, 'memberCount', e.target.value)}
                            placeholder="0"
                            style={{ width: 65, padding: '4px 6px', fontSize: 12, borderRadius: 4, textAlign: 'center' }}
                          />
                        </td>
                        <td style={{ textAlign: 'center' }}>
                          <input
                            type="number"
                            value={p.publicCount ?? ''}
                            min={0}
                            onChange={(e) => updatePublicActivityRow(idx, 'publicCount', e.target.value)}
                            placeholder="0"
                            style={{ width: 65, padding: '4px 6px', fontSize: 12, borderRadius: 4, textAlign: 'center' }}
                          />
                        </td>
                        <td style={{ textAlign: 'center' }}>
                          <button
                            type="button"
                            onClick={() => removePublicActivityRow(idx)}
                            title="Remove"
                            style={{ border: 'none', background: 'transparent', color: '#ef4444', cursor: 'pointer', fontSize: 15 }}
                          >
                            🗑️
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          {/* Section 4: Party Conferences, Seminars & Study Circles */}
          <div className="card" style={{ padding: 18 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14, flexWrap: 'wrap', gap: 10 }}>
              <div>
                <h3 style={{ margin: 0, color: 'var(--primary, #38bdf8)', display: 'flex', alignItems: 'center', gap: 8, fontSize: 16 }}>
                  <span>📚</span>
                  <span>{t('proforma.form3.sec4Title', 'علاقائي يونټ کښي پارټي کانفرنس، سيمينار او سټډي سرکل')}</span>
                </h3>
                <div style={{ fontSize: 12, color: 'var(--text-soft)', marginTop: 4 }}>
                  {t('proforma.form3.sec4Subtitle', 'Educational programs, ideology study circles, symposiums and party conferences')}
                </div>
              </div>
              <button
                type="button"
                className="btn"
                onClick={addEducationalActivityRow}
                style={{ fontSize: 13, display: 'flex', alignItems: 'center', gap: 6, background: '#0284c7', borderColor: '#0284c7' }}
              >
                <span>➕</span>
                <span>{t('proforma.form3.addEduActivity', '+ Add Conference / Study Circle')}</span>
              </button>
            </div>

            {(formData.educationalActivities || []).length === 0 ? (
              <div style={{ padding: '24px 16px', textAlign: 'center', color: 'var(--text-soft)', background: 'var(--surface-alt)', borderRadius: 8, border: '1px dashed var(--border)' }}>
                {t('proforma.form3.noEduActivities', 'No conferences or study circles recorded.')}
              </div>
            ) : (
              <div style={{ overflowX: 'auto', border: '1px solid var(--border)', borderRadius: 8 }}>
                <table className="table" style={{ width: '100%', minWidth: 900, fontSize: 12, borderCollapse: 'collapse' }}>
                  <thead>
                    <tr style={{ background: 'var(--surface-alt)' }}>
                      <th style={{ width: 40, textAlign: 'center' }}>#</th>
                      <th style={{ minWidth: 140 }}>{t('proforma.form3.orgName', 'Organ / Unit Name')}</th>
                      <th style={{ width: 95 }}>{t('proforma.form3.date', 'Date')}</th>
                      <th style={{ minWidth: 130 }}>{t('proforma.form3.location', 'Venue / Location')}</th>
                      <th style={{ minWidth: 160 }}>{t('proforma.form3.topic', 'Topic / Subject')}</th>
                      <th style={{ minWidth: 130 }}>{t('proforma.form3.programType', 'Program Type')}</th>
                      <th style={{ minWidth: 160 }}>{t('proforma.form3.speakers', 'Key Speakers')}</th>
                      <th style={{ width: 95, textAlign: 'center' }}>{t('proforma.form3.memberCount', 'Members Count')}</th>
                      <th style={{ width: 45, textAlign: 'center' }}>✕</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(formData.educationalActivities || []).map((eRow, idx) => (
                      <tr key={idx}>
                        <td style={{ textAlign: 'center', fontWeight: 'bold' }}>{idx + 1}</td>
                        <td>
                          <input
                            type="text"
                            value={eRow.orgName || ''}
                            onChange={(e) => updateEducationalActivityRow(idx, 'orgName', e.target.value)}
                            placeholder="Organ / Unit Name"
                            style={{ width: '100%', padding: '4px 8px', fontSize: 12, borderRadius: 4 }}
                          />
                        </td>
                        <td>
                          <input
                            type="text"
                            value={eRow.date || ''}
                            onChange={(e) => updateEducationalActivityRow(idx, 'date', e.target.value)}
                            placeholder="DD/MM"
                            style={{ width: '100%', padding: '4px 6px', fontSize: 12, borderRadius: 4, textAlign: 'center' }}
                          />
                        </td>
                        <td>
                          <input
                            type="text"
                            value={eRow.location || ''}
                            onChange={(e) => updateEducationalActivityRow(idx, 'location', e.target.value)}
                            placeholder="Venue"
                            style={{ width: '100%', padding: '4px 8px', fontSize: 12, borderRadius: 4 }}
                          />
                        </td>
                        <td>
                          <input
                            type="text"
                            value={eRow.topic || ''}
                            onChange={(e) => updateEducationalActivityRow(idx, 'topic', e.target.value)}
                            placeholder="Subject / Agenda"
                            style={{ width: '100%', padding: '4px 8px', fontSize: 12, borderRadius: 4 }}
                          />
                        </td>
                        <td>
                          <input
                            type="text"
                            value={eRow.programType || ''}
                            onChange={(e) => updateEducationalActivityRow(idx, 'programType', e.target.value)}
                            placeholder="Study Circle / Seminar..."
                            style={{ width: '100%', padding: '4px 8px', fontSize: 12, borderRadius: 4 }}
                          />
                        </td>
                        <td>
                          <input
                            type="text"
                            value={eRow.speakers || ''}
                            onChange={(e) => updateEducationalActivityRow(idx, 'speakers', e.target.value)}
                            placeholder="Key Speakers / Instructor"
                            style={{ width: '100%', padding: '4px 8px', fontSize: 12, borderRadius: 4 }}
                          />
                        </td>
                        <td style={{ textAlign: 'center' }}>
                          <input
                            type="number"
                            value={eRow.memberCount ?? ''}
                            min={0}
                            onChange={(e) => updateEducationalActivityRow(idx, 'memberCount', e.target.value)}
                            placeholder="0"
                            style={{ width: 70, padding: '4px 6px', fontSize: 12, borderRadius: 4, textAlign: 'center' }}
                          />
                        </td>
                        <td style={{ textAlign: 'center' }}>
                          <button
                            type="button"
                            onClick={() => removeEducationalActivityRow(idx)}
                            title="Remove"
                            style={{ border: 'none', background: 'transparent', color: '#ef4444', cursor: 'pointer', fontSize: 15 }}
                          >
                            🗑️
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      )}

      {/* TAB 3: DISCIPLINE, BLOOD BANK & PROPOSALS */}
      {formType === 'form3' && activeTab === 'form3_tab3' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
          {/* Section 5: Disciplinary Actions */}
          <div className="card" style={{ padding: 18 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14, flexWrap: 'wrap', gap: 10 }}>
              <div>
                <h3 style={{ margin: 0, color: 'var(--primary, #38bdf8)', display: 'flex', alignItems: 'center', gap: 8, fontSize: 16 }}>
                  <span>⚖️</span>
                  <span>{t('proforma.form3.sec5Title', 'علاقه کي تاديبي کاروائي')}</span>
                </h3>
                <div style={{ fontSize: 12, color: 'var(--text-soft)', marginTop: 4 }}>
                  {t('proforma.form3.sec5Subtitle', 'Disciplinary actions, constitutional violations investigated, and measures taken in area')}
                </div>
              </div>
              <button
                type="button"
                className="btn"
                onClick={addDisciplinaryRow}
                style={{ fontSize: 13, display: 'flex', alignItems: 'center', gap: 6, background: '#0284c7', borderColor: '#0284c7' }}
              >
                <span>➕</span>
                <span>{t('proforma.form3.addDisciplinary', '+ Add Disciplinary Record')}</span>
              </button>
            </div>

            {(formData.disciplinaryActions || []).length === 0 ? (
              <div style={{ padding: '24px 16px', textAlign: 'center', color: 'var(--text-soft)', background: 'var(--surface-alt)', borderRadius: 8, border: '1px dashed var(--border)' }}>
                {t('proforma.form3.noDisciplinary', 'No disciplinary actions recorded in this area.')}
              </div>
            ) : (
              <div style={{ overflowX: 'auto', border: '1px solid var(--border)', borderRadius: 8 }}>
                <table className="table" style={{ width: '100%', fontSize: 12, borderCollapse: 'collapse' }}>
                  <thead>
                    <tr style={{ background: 'var(--surface-alt)' }}>
                      <th style={{ width: 40, textAlign: 'center' }}>#</th>
                      <th style={{ minWidth: 160 }}>{t('proforma.form3.name', 'Comrade Name')}</th>
                      <th style={{ minWidth: 140 }}>{t('proforma.form3.role', 'Designation')}</th>
                      <th style={{ minWidth: 240 }}>{t('proforma.form3.violation', 'Violation Committed')}</th>
                      <th style={{ minWidth: 240 }}>{t('proforma.form3.action', 'Disciplinary Action Taken')}</th>
                      <th style={{ width: 45, textAlign: 'center' }}>✕</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(formData.disciplinaryActions || []).map((d, idx) => (
                      <tr key={idx}>
                        <td style={{ textAlign: 'center', fontWeight: 'bold' }}>{idx + 1}</td>
                        <td>
                          <input
                            type="text"
                            value={d.name || ''}
                            onChange={(e) => updateDisciplinaryRow(idx, 'name', e.target.value)}
                            placeholder="Comrade Name"
                            style={{ width: '100%', padding: '5px 8px', fontSize: 12, borderRadius: 4 }}
                          />
                        </td>
                        <td>
                          <input
                            type="text"
                            value={d.role || ''}
                            onChange={(e) => updateDisciplinaryRow(idx, 'role', e.target.value)}
                            placeholder="Role / Unit"
                            style={{ width: '100%', padding: '5px 8px', fontSize: 12, borderRadius: 4 }}
                          />
                        </td>
                        <td>
                          <input
                            type="text"
                            value={d.violation || ''}
                            onChange={(e) => updateDisciplinaryRow(idx, 'violation', e.target.value)}
                            placeholder="Nature of constitutional or discipline breach"
                            style={{ width: '100%', padding: '5px 8px', fontSize: 12, borderRadius: 4 }}
                          />
                        </td>
                        <td>
                          <input
                            type="text"
                            value={d.action || ''}
                            onChange={(e) => updateDisciplinaryRow(idx, 'action', e.target.value)}
                            placeholder="Warning / suspension / expulsion..."
                            style={{ width: '100%', padding: '5px 8px', fontSize: 12, borderRadius: 4 }}
                          />
                        </td>
                        <td style={{ textAlign: 'center' }}>
                          <button
                            type="button"
                            onClick={() => removeDisciplinaryRow(idx)}
                            title="Remove"
                            style={{ border: 'none', background: 'transparent', color: '#ef4444', cursor: 'pointer', fontSize: 15 }}
                          >
                            🗑️
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          {/* Section 6: Blood Bank & Zakat Report */}
          <div className="card" style={{ padding: 18 }}>
            <h3 style={{ margin: '0 0 4px', color: 'var(--primary, #38bdf8)', display: 'flex', alignItems: 'center', gap: 8, fontSize: 16 }}>
              <span>🩸</span>
              <span>{t('proforma.form3.sec6Title', 'علاقائي يونټ کښي بلډ بينک د پاره پوستونه،نغدي او زکات رپورټ')}</span>
            </h3>
            <div style={{ fontSize: 12, color: 'var(--text-soft)', marginBottom: 16 }}>
              {t('proforma.form3.sec6Subtitle', 'Emergency blood appeal posts, cash funds collected, and party welfare Zakat register')}
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 16 }}>
              {/* Blood Posts */}
              <div style={{ padding: 14, borderRadius: 8, background: 'var(--surface-alt)', border: '1px solid var(--border)' }}>
                <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontWeight: 600, fontSize: 13, marginBottom: 8 }}>
                  <span>📢</span>
                  <span>{t('proforma.form3.bloodPosts', 'Blood Bank Appeals / Posts')}</span>
                </label>
                <NumberStepper
                  value={formData.bloodBank?.bloodPosts}
                  onChange={(val) => updateBloodBank('bloodPosts', val)}
                  min={0}
                  style={{ width: '100%' }}
                />
              </div>

              {/* Blood Cash */}
              <div style={{ padding: 14, borderRadius: 8, background: 'var(--surface-alt)', border: '1px solid var(--border)' }}>
                <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontWeight: 600, fontSize: 13, marginBottom: 8 }}>
                  <span>💵</span>
                  <span>{t('proforma.form3.bloodCash', 'Cash Received (PKR)')}</span>
                </label>
                <input
                  type="number"
                  value={formData.bloodBank?.bloodCash ?? ''}
                  min={0}
                  onChange={(e) => updateBloodBank('bloodCash', e.target.value === '' ? '' : parseInt(e.target.value, 10) || 0)}
                  placeholder="0"
                  style={{ width: '100%', padding: '8px 12px', fontSize: 14, fontWeight: 'bold', borderRadius: 6 }}
                />
              </div>

              {/* Total Cash */}
              <div style={{ padding: 14, borderRadius: 8, background: 'var(--surface-alt)', border: '1px solid var(--border)' }}>
                <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontWeight: 600, fontSize: 13, marginBottom: 8 }}>
                  <span>💰</span>
                  <span>{t('proforma.form3.bloodTotalCash', 'Total Cash (PKR)')}</span>
                </label>
                <input
                  type="number"
                  value={formData.bloodBank?.bloodTotalCash ?? ''}
                  min={0}
                  onChange={(e) => updateBloodBank('bloodTotalCash', e.target.value === '' ? '' : parseInt(e.target.value, 10) || 0)}
                  placeholder="0"
                  style={{ width: '100%', padding: '8px 12px', fontSize: 14, fontWeight: 'bold', borderRadius: 6 }}
                />
              </div>

              {/* Zakat */}
              <div style={{ padding: 14, borderRadius: 8, background: 'var(--surface-alt)', border: '1px solid var(--border)' }}>
                <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontWeight: 600, fontSize: 13, marginBottom: 8 }}>
                  <span>🤲</span>
                  <span>{t('proforma.form3.zakat', 'Zakat (PKR)')}</span>
                </label>
                <input
                  type="number"
                  value={formData.bloodBank?.zakat ?? ''}
                  min={0}
                  onChange={(e) => updateBloodBank('zakat', e.target.value === '' ? '' : parseInt(e.target.value, 10) || 0)}
                  placeholder="0"
                  style={{ width: '100%', padding: '8px 12px', fontSize: 14, fontWeight: 'bold', borderRadius: 6, color: '#10b981' }}
                />
              </div>
            </div>
          </div>

          {/* Section 7: Proposals & Demands Matrix */}
          <div className="card" style={{ padding: 18 }}>
            <h3 style={{ margin: '0 0 4px', color: 'var(--primary, #38bdf8)', display: 'flex', alignItems: 'center', gap: 8, fontSize: 16 }}>
              <span>💡</span>
              <span>{t('proforma.form3.sec7Title', 'وړانديزونه (پيشنهادونه،تجاويز) او غوښتنې')}</span>
            </h3>
            <div style={{ fontSize: 12, color: 'var(--text-soft)', marginBottom: 16 }}>
              {t('proforma.form3.sec7Subtitle', 'Multi-channel proposals matrix organized by Political, Organizational and Social categories, plus Public Demands')}
            </div>

            <div style={{ overflowX: 'auto', border: '1px solid var(--border)', borderRadius: 8, marginBottom: 16 }}>
              <table className="table" style={{ width: '100%', minWidth: 700, fontSize: 13, borderCollapse: 'collapse' }}>
                <thead>
                  <tr style={{ background: 'var(--surface-alt)' }}>
                    <th style={{ width: 160 }}>{t('proforma.form3.category', 'Category')}</th>
                    <th>{t('proforma.form3.byExec', 'By Executive (ايګزيکټيو لخوا)')}</th>
                    <th>{t('proforma.form3.byComm', 'By Unit & Area Comm (يونټ او علاقائي کميټي لخوا)')}</th>
                    <th>{t('proforma.form3.byInd', 'By Individual (فرد لخوا)')}</th>
                  </tr>
                </thead>
                <tbody>
                  {[
                    { key: 'political', label: t('proforma.form3.political', 'Political (سياسي)') },
                    { key: 'organizational', label: t('proforma.form3.organizational', 'Organizational (تنظيمي)') },
                    { key: 'social', label: t('proforma.form3.social', 'Social Work (ټولنيزو کارو)') },
                  ].map(({ key, label }) => (
                    <tr key={key}>
                      <td style={{ fontWeight: 700, background: 'var(--surface-alt)' }}>{label}</td>
                      <td>
                        <textarea
                          rows={2}
                          value={formData.proposals?.[key]?.exec || ''}
                          onChange={(e) => updateProposal(key, 'exec', e.target.value)}
                          placeholder={t('proforma.form3.proposalPlaceholder', 'Enter executive proposal...')}
                          style={{ width: '100%', padding: '6px 8px', fontSize: 12, borderRadius: 4, resize: 'vertical' }}
                        />
                      </td>
                      <td>
                        <textarea
                          rows={2}
                          value={formData.proposals?.[key]?.comm || ''}
                          onChange={(e) => updateProposal(key, 'comm', e.target.value)}
                          placeholder={t('proforma.form3.proposalPlaceholder', 'Enter committee proposal...')}
                          style={{ width: '100%', padding: '6px 8px', fontSize: 12, borderRadius: 4, resize: 'vertical' }}
                        />
                      </td>
                      <td>
                        <textarea
                          rows={2}
                          value={formData.proposals?.[key]?.ind || ''}
                          onChange={(e) => updateProposal(key, 'ind', e.target.value)}
                          placeholder={t('proforma.form3.proposalPlaceholder', 'Enter individual proposal...')}
                          style={{ width: '100%', padding: '6px 8px', fontSize: 12, borderRadius: 4, resize: 'vertical' }}
                        />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Demands */}
            <div style={{ padding: 14, borderRadius: 8, background: 'var(--surface-alt)', border: '1px solid var(--border)' }}>
              <label style={{ display: 'block', fontWeight: 700, fontSize: 13, marginBottom: 6, color: '#eab308' }}>
                ✊ {t('proforma.form3.demands', 'Demands / Rights (غوښتنې)')}
              </label>
              <textarea
                rows={3}
                value={formData.proposals?.demands || ''}
                onChange={(e) => updateDemands(e.target.value)}
                placeholder={t('proforma.form3.demandsPlaceholder', 'Enter public, civil, educational and developmental demands forwarded to party leadership...')}
                style={{ width: '100%', padding: '8px 12px', fontSize: 13, borderRadius: 6, lineHeight: 1.5 }}
              />
            </div>
          </div>
        </div>
      )}

      {/* TAB 4: OFFICE ACTIVITY, SOCIAL WORK & SIGNATURES */}
      {formType === 'form3' && activeTab === 'form3_tab4' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
          {/* Section 8: Office Activity, Social Work, Misc & Signatures */}
          <div className="card" style={{ padding: 18 }}>
            <h3 style={{ margin: '0 0 16px', color: 'var(--primary, #38bdf8)', display: 'flex', alignItems: 'center', gap: 8, fontSize: 16 }}>
              <span>✍️</span>
              <span>{t('proforma.form3.sec8Title', 'علاقائي دفتر فعاليت، ټولنيز کارونه او لاسليکونه')}</span>
            </h3>

            {/* 1. Area Office Activity */}
            <div style={{ marginBottom: 18 }}>
              <label style={{ display: 'block', fontWeight: 700, fontSize: 13, marginBottom: 6 }}>
                ۱۔ {t('proforma.form3.officeActivity', 'علاقائي دفتر فعاليت (Area Office Activity)')}
              </label>
              <textarea
                rows={4}
                value={formData.officeActivity || ''}
                onChange={(e) => updateForm3Field('officeActivity', e.target.value)}
                placeholder={t('proforma.form3.officeActivityPlaceholder', 'Detail office operations, hours open, coordination activities during the month...')}
                style={{ width: '100%', padding: '10px 12px', fontSize: 13, borderRadius: 6, lineHeight: 1.5 }}
              />
            </div>

            {/* 2. Brief Report of Social Work */}
            <div style={{ marginBottom: 18 }}>
              <label style={{ display: 'block', fontWeight: 700, fontSize: 13, marginBottom: 6 }}>
                ۲۔ {t('proforma.form3.socialReport', 'ټولنيزو کارو لنډ رپورټ (Brief Report of Social Work)')}
              </label>
              <textarea
                rows={4}
                value={formData.socialReport || ''}
                onChange={(e) => updateForm3Field('socialReport', e.target.value)}
                placeholder={t('proforma.form3.socialReportPlaceholder', 'Report public welfare initiatives, resolving communal disputes, disaster aid, medical camps...')}
                style={{ width: '100%', padding: '10px 12px', fontSize: 13, borderRadius: 6, lineHeight: 1.5 }}
              />
            </div>

            {/* 3. Miscellaneous */}
            <div style={{ marginBottom: 22 }}>
              <label style={{ display: 'block', fontWeight: 700, fontSize: 13, marginBottom: 6 }}>
                ۳۔ {t('proforma.form3.misc', 'متفرق (Miscellaneous)')}
              </label>
              <textarea
                rows={3}
                value={formData.misc || ''}
                onChange={(e) => updateForm3Field('misc', e.target.value)}
                placeholder={t('proforma.form3.miscPlaceholder', 'Other observations, notes, notices, or relevant party matters...')}
                style={{ width: '100%', padding: '10px 12px', fontSize: 13, borderRadius: 6, lineHeight: 1.5 }}
              />
            </div>

            {/* Official Signatures Row */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: 20, paddingTop: 16, borderTop: '1px solid var(--border)' }}>
              <div style={{ padding: 14, background: 'var(--surface-alt)', borderRadius: 8, border: '1px solid var(--border)' }}>
                <label style={{ display: 'block', fontWeight: 700, fontSize: 13, marginBottom: 8, color: 'var(--text-main)' }}>
                  ✍️ {t('proforma.form3.secSignature', 'علاقائي سيکرټري لاسليک (Area Secretary Signature)')}
                </label>
                <input
                  type="text"
                  value={formData.secSignature || ''}
                  onChange={(e) => updateForm3Field('secSignature', e.target.value)}
                  placeholder={t('proforma.form3.secSignaturePlaceholder', 'Name / Digital signature / Date')}
                  style={{ width: '100%', padding: '8px 12px', fontSize: 13, borderRadius: 6, fontWeight: 600 }}
                />
              </div>

              <div style={{ padding: 14, background: 'var(--surface-alt)', borderRadius: 8, border: '1px solid var(--border)' }}>
                <label style={{ display: 'block', fontWeight: 700, fontSize: 13, marginBottom: 8, color: 'var(--text-main)' }}>
                  ✍️ {t('proforma.form3.seniorSecSignature', 'علاقائي سينئر معاون لاس ليک (Area Senior Deputy Signature)')}
                </label>
                <input
                  type="text"
                  value={formData.seniorSecSignature || ''}
                  onChange={(e) => updateForm3Field('seniorSecSignature', e.target.value)}
                  placeholder={t('proforma.form3.seniorSecSignaturePlaceholder', 'Name / Digital signature / Date')}
                  style={{ width: '100%', padding: '8px 12px', fontSize: 13, borderRadius: 6, fontWeight: 600 }}
                />
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ────────────────────────────────────────────────────────────────────────── */}
      {/* IN-PAGE LIVE PRINT PREVIEW MODAL */}
      {/* ────────────────────────────────────────────────────────────────────────── */}
      {previewOpen && (
        <div
          style={{
            position: 'fixed',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            backgroundColor: 'rgba(0, 0, 0, 0.85)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 99999,
            padding: 16,
          }}
        >
          <div
            className="proforma-preview-modal"
            style={{
              background: '#fff',
              color: '#000',
              borderRadius: 12,
              width: '100%',
              maxWidth: 1200,
              height: '92vh',
              display: 'flex',
              flexDirection: 'column',
              boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.5)',
              direction: 'rtl',
            }}
          >
            <div
              className="proforma-preview-header"
              style={{
                padding: '12px 18px',
                borderBottom: '1px solid #e2e8f0',
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                background: '#f8fafc',
                borderTopLeftRadius: 12,
                borderTopRightRadius: 12,
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <span style={{ fontSize: 20 }}>🖨️</span>
                <strong>
                  {t(currentFormConfig.previewTitleKey, currentFormConfig.defaultPreviewTitle)}
                </strong>
              </div>
              <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                <button
                  type="button"
                  className="btn"
                  onClick={() => {
                    const printWin = window.open('', '_blank');
                    if (printWin) {
                      printWin.document.open();
                      printWin.document.write(previewHtml);
                      printWin.document.close();
                      printWin.focus();
                      setTimeout(() => {
                        printWin.print();
                      }, 250);
                    }
                  }}
                  style={{ backgroundColor: '#0284c7', color: '#fff', padding: '6px 14px' }}
                >
                  🖨️ {t('proforma.print', 'Print')}
                </button>
                <button
                  type="button"
                  className="btn"
                  onClick={() => handleDownload('pdf')}
                  style={{ backgroundColor: '#10b981', color: '#fff', padding: '6px 14px' }}
                >
                  📄 PDF
                </button>
                <button
                  type="button"
                  className="btn"
                  onClick={() => handleDownload('xlsx')}
                  style={{ backgroundColor: '#6366f1', color: '#fff', padding: '6px 14px' }}
                >
                  📊 Excel
                </button>
                <button
                  type="button"
                  className="btn secondary"
                  onClick={() => setPreviewOpen(false)}
                  style={{ padding: '6px 14px' }}
                >
                  {t('proforma.close', 'Close')}
                </button>
              </div>
            </div>

            <div style={{ flex: 1, overflow: 'auto', padding: 10, background: '#e2e8f0' }}>
              {previewLoading ? (
                <div style={{ padding: 50, textAlign: 'center', color: '#475569' }}>
                  {t('proforma.previewLoading', 'Preparing report preview...')}
                </div>
              ) : (
                <iframe
                  title="Proforma Print Preview"
                  srcDoc={previewHtml}
                  style={{
                    width: '100%',
                    height: '100%',
                    border: 'none',
                    background: '#fff',
                    borderRadius: 6,
                    boxShadow: '0 4px 6px -1px rgba(0,0,0,0.1)',
                  }}
                />
              )}
            </div>
          </div>
        </div>
      )}

      {/* ────────────────────────────────────────────────────────────────────────── */}
      {/* INTERACTIVE AUTO-FILL DIALOG */}
      {/* ────────────────────────────────────────────────────────────────────────── */}
      {showAutofillModal && (
        <div
          style={{
            position: 'fixed',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            backgroundColor: 'rgba(0, 0, 0, 0.7)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 99999,
            padding: 16,
            backdropFilter: 'blur(3px)',
          }}
        >
          <div
            className="card"
            style={{
              maxWidth: 520,
              width: '100%',
              padding: 24,
              borderRadius: 12,
              boxShadow: '0 20px 25px -5px rgba(0,0,0,0.4)',
              border: '1.5px solid var(--border)',
              background: 'var(--surface)',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 14 }}>
              <span style={{ fontSize: 28 }}>🔄</span>
              <div>
                <h3 style={{ margin: 0, fontSize: 17, color: 'var(--primary, #38bdf8)' }}>
                  {t('proforma.autofillModalTitle', 'Auto-fill from MIS Database')}
                </h3>
                <div style={{ fontSize: 12, color: 'var(--text-soft)', marginTop: 2 }}>
                  {t('proforma.autofillModalSubtitle', 'Aggregates verified meetings, attendance logs, registered members, donations & expenses for this month.')}
                </div>
              </div>
            </div>

            <p style={{ fontSize: 13, lineHeight: 1.5, color: 'var(--text-main)', marginBottom: 18 }}>
              {t('proforma.autofillModalDesc', 'How would you like to apply system records to this report?')}
            </p>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 12, marginBottom: 20 }}>
              <button
                type="button"
                className="btn"
                onClick={() => executeAutofill('emptyOnly')}
                style={{
                  display: 'flex',
                  alignItems: 'flex-start',
                  gap: 12,
                  padding: '12px 14px',
                  textAlign: isRtl ? 'right' : 'left',
                  background: 'var(--surface-alt)',
                  border: '1.5px solid var(--primary, #38bdf8)',
                  borderRadius: 8,
                  cursor: 'pointer',
                }}
              >
                <span style={{ fontSize: 20 }}>🧩</span>
                <div>
                  <div style={{ fontWeight: 700, fontSize: 13, color: 'var(--primary, #38bdf8)' }}>
                    {t('proforma.autofillFillEmpty', 'Fill Missing Fields Only (Recommended)')}
                  </div>
                  <div style={{ fontSize: 12, color: 'var(--text-soft)', marginTop: 2 }}>
                    {t('proforma.autofillFillEmptyHint', 'Keeps all your manual inputs and custom entries intact, only filling in empty or blank fields.')}
                  </div>
                </div>
              </button>

              <button
                type="button"
                className="btn secondary"
                onClick={() => executeAutofill('full')}
                style={{
                  display: 'flex',
                  alignItems: 'flex-start',
                  gap: 12,
                  padding: '12px 14px',
                  textAlign: isRtl ? 'right' : 'left',
                  borderRadius: 8,
                  cursor: 'pointer',
                  borderColor: '#eab308',
                }}
              >
                <span style={{ fontSize: 20 }}>⚠️</span>
                <div>
                  <div style={{ fontWeight: 700, fontSize: 13, color: '#eab308' }}>
                    {t('proforma.autofillFullSync', 'Full Overwrite with System Records')}
                  </div>
                  <div style={{ fontSize: 12, color: 'var(--text-soft)', marginTop: 2 }}>
                    {t('proforma.autofillFullSyncHint', 'Replaces all fields with fresh raw calculated numbers from database logs.')}
                  </div>
                </div>
              </button>
            </div>

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10 }}>
              <button
                type="button"
                className="btn secondary"
                onClick={() => setShowAutofillModal(false)}
              >
                {t('proforma.cancel', 'Cancel')}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Pashto On-Screen Keyboard & Word Helper */}
      <PashtoKeyboardHelper activeElementRef={activeInputRef} />
    </div>
  );
}
