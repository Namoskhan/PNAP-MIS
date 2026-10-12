import React, { useEffect, useState, useRef, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { useUnit } from '../../context/UnitContext';
import { useAuth } from '../../context/AuthContext';
import { api, errorMessage } from '../../api/client';
import UnitSwitcher from '../../components/UnitSwitcher';
import PashtoKeyboardHelper from '../../components/PashtoKeyboardHelper';

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
          width: 44,
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

export default function ProformaReportsPage() {
  const { t, i18n } = useTranslation();
  const { user } = useAuth();
  const { ctx } = useUnit();

  const isRtl = i18n.language === 'ps' || i18n.language === 'ur';

  // Support Form 1 (Area Unit Report) and Form 4 (Basic Unit Report)
  const [formType, setFormType] = useState(() => (ctx?.unitLevel === 'BASIC_UNIT' ? 'form4' : 'form1'));
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

  // Basic Units list for Form 4 dropdown selection
  const [basicUnitsList, setBasicUnitsList] = useState([]);
  const [selectedUnitId, setSelectedUnitId] = useState(() => (ctx?.unitLevel === 'BASIC_UNIT' ? ctx?.unitId : ''));
  const [areasList, setAreasList] = useState([]);
  const [selectedAreaId, setSelectedAreaId] = useState('');

  // Active Tab: 'upper' (Overview & Upper Table), 'roster' (Executive Members), 'notes' (Remarks)
  const [activeTab, setActiveTab] = useState('upper');
  // Roster View Mode: 'cards' (interactive cards) or 'table' (dense spreadsheet table)
  const [rosterViewMode, setRosterViewMode] = useState('cards');

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

  // Resolve effective areaId
  const effectiveAreaId = useMemo(() => {
    if (ctx?.unitLevel === 'AREA') return ctx.unitId;
    if (ctx?.areaId) return ctx.areaId;
    if (user?.scope?.areaId) return user.scope.areaId;
    return selectedAreaId || ctx?.unitId || '';
  }, [ctx, user, selectedAreaId]);

  // Load areas if user is at higher level
  useEffect(() => {
    if (ctx?.unitLevel === 'AREA' || ctx?.unitLevel === 'BASIC_UNIT') return;
    api.get('/org/areas')
      .then((res) => {
        const list = res.data?.data || [];
        setAreasList(list);
        if (list.length > 0 && !selectedAreaId) {
          setSelectedAreaId(String(list[0]._id));
        }
      })
      .catch((err) => console.error('Failed to load areas:', err));
  }, [ctx?.unitLevel]);

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
    if (formType === 'form4') {
      if (ctx?.unitLevel === 'BASIC_UNIT') return ctx.unitId;
      return selectedUnitId || (basicUnitsList[0]?._id) || '';
    }
    return effectiveAreaId;
  }, [formType, ctx, selectedUnitId, basicUnitsList, effectiveAreaId]);

  // Resolve active unit display name
  const activeUnitDisplayName = useMemo(() => {
    if (formType === 'form4') {
      if (ctx?.unitLevel === 'BASIC_UNIT') return ctx.unitName;
      const found = basicUnitsList.find((b) => String(b._id) === String(targetId));
      return found?.name || formData.unitName || 'Basic Unit';
    }
    return ctx?.unitName || formData.areaName || 'Area Unit';
  }, [formType, ctx, targetId, basicUnitsList, formData]);

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
    return cleaned;
  }

  // Load proforma report data from DB or system baseline
  async function loadData(prefillFromSystem = false) {
    if (!targetId) return;
    setLoading(true);
    setFeedback({ text: '', type: '' });
    try {
      const params = {
        formType,
        year,
        month,
        unitId: targetId,
        areaId: effectiveAreaId,
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
        areaId: effectiveAreaId,
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

  const rows = formData.rows || formData.execRows || [];
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

  // Save silently and return the saved document
  async function saveReportData() {
    if (!targetId) throw new Error(formType === 'form4' ? 'No basic unit selected' : 'No area context available');

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

    if (formType === 'form4') {
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
      await saveReportData();
      setFeedback({ text: t('proforma.savedSuccess', 'Report officially saved & stored in database successfully!'), type: 'success' });
    } catch (e) {
      setFeedback({ text: errorMessage(e), type: 'error' });
    } finally {
      setSaving(false);
    }
  }

  // Live Print Preview: Saves latest in-memory data first so preview matches 100%
  async function handleOpenPreview() {
    setPreviewLoading(true);
    setPreviewOpen(true);
    try {
      await saveReportData();

      const q = new URLSearchParams({
        year: String(year),
        month: String(month),
        ...(formType === 'form4' ? { unitId: targetId } : { areaId: effectiveAreaId }),
      });

      const endpoint = formType === 'form4' ? '/api/exports/proforma/form4/html' : '/api/exports/proforma/form1/html';
      const res = await fetch(`${endpoint}?${q.toString()}`, {
        headers: { Authorization: `Bearer ${localStorage.getItem('pnap_token')}` },
      });
      if (!res.ok) throw new Error('Preview failed');
      const html = await res.text();
      setPreviewHtml(html);
    } catch (e) {
      setPreviewHtml(`<div style="color:red;padding:20px;">${e.message}</div>`);
    } finally {
      setPreviewLoading(false);
    }
  }

  // Export Downloads: Saves latest in-memory data first so PDF/Excel matches 100%
  async function handleDownload(format) {
    try {
      setFeedback({ text: t('proforma.preparingExport', 'Saving and preparing export...'), type: 'info' });
      await saveReportData();

      const q = new URLSearchParams({
        year: String(year),
        month: String(month),
        ...(formType === 'form4' ? { unitId: targetId } : { areaId: effectiveAreaId }),
      });

      const endpoint = formType === 'form4' ? `/api/exports/proforma/form4/${format}` : `/api/exports/proforma/form1/${format}`;
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
      {/* Standard Page Header */}
      <div className="page-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: 12, marginBottom: 16 }}>
        <div>
          <h2 style={{ margin: 0, display: 'flex', alignItems: 'center', gap: 8 }}>
            <span>{formType === 'form4' ? '📄' : '📋'}</span>
            <span>
              {formType === 'form4'
                ? t('proforma.form4Title', 'پښتونخوا ملي عوامي پارټي ابتدائي يونټ کار او فعاليت مياشتنئي رپورټ (Form 4)')
                : t('proforma.form1Title', 'Area Unit Monthly Work & Activity Report (Form 1)')}
            </span>
          </h2>
          <p className="muted" style={{ margin: '4px 0 0' }}>
            {formType === 'form4'
              ? `${t('proforma.form4Desc', 'Official party monthly work & activity report for Primary / Basic Unit Executive')} · `
              : `${t('proforma.form1Desc', 'Official party monthly work and activity report for Area Executive and Subordinate Units')} · `}
            <strong>{activeUnitDisplayName}</strong>
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
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', borderBottom: '1px solid var(--border)', paddingBottom: 14, marginBottom: 14 }}>
          <button
            type="button"
            onClick={() => setFormType('form1')}
            className={`btn ${formType === 'form1' ? '' : 'secondary'}`}
            style={{ fontWeight: 700, display: 'flex', alignItems: 'center', gap: 8, fontSize: 13 }}
          >
            <span>📋</span>
            <span>{t('proforma.form1Btn', 'Form 1: Area Unit Report (علاقائي يونټ)')}</span>
          </button>
          <button
            type="button"
            onClick={() => setFormType('form4')}
            className={`btn ${formType === 'form4' ? '' : 'secondary'}`}
            style={{ fontWeight: 700, display: 'flex', alignItems: 'center', gap: 8, fontSize: 13 }}
          >
            <span>📄</span>
            <span>{t('proforma.form4Btn', 'Form 4: Basic Unit Report (بنسټيز يونټ)')}</span>
          </button>
        </div>

        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 14 }}>
          {/* Period Selectors */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 14, flexWrap: 'wrap' }}>
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
            {formType === 'form4' ? (
              ctx?.unitLevel === 'BASIC_UNIT' ? (
                <div>
                  <label style={{ display: 'block', fontWeight: 600, marginBottom: 4, fontSize: 13 }}>
                    {t('proforma.basicUnit', 'Basic Unit (بنسټيز يونټ)')}
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
                        {t('proforma.areaUnit', 'Area Unit (علاقه)')}
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
                      {t('proforma.selectBasicUnit', 'Select Basic Unit (بنسټيز يونټ وټاکئ)')}
                    </label>
                    <select
                      value={selectedUnitId}
                      onChange={(e) => setSelectedUnitId(e.target.value)}
                      style={{ minWidth: 190, fontWeight: 600 }}
                    >
                      {basicUnitsList.length === 0 ? (
                        <option value="">(No Basic Units in Area)</option>
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

          {/* Action Buttons */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
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
        <div
          style={{
            marginTop: 14,
            padding: '10px 14px',
            borderRadius: 8,
            background: statusDoc?.exists ? 'rgba(34, 197, 94, 0.1)' : 'rgba(234, 179, 8, 0.1)',
            border: `1.5px solid ${statusDoc?.exists ? '#22c55e' : '#eab308'}`,
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            flexWrap: 'wrap',
            gap: 10,
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <span style={{ fontSize: 20 }}>{statusDoc?.exists ? '✅' : '📝'}</span>
            <div>
              <div style={{ fontWeight: 700, fontSize: 13, color: statusDoc?.exists ? '#22c55e' : '#eab308' }}>
                {statusDoc?.exists
                  ? t('proforma.statusSaved', 'Report Officially Stored in Database')
                  : t('proforma.statusDraft', 'Draft - Not Submitted Yet')}
              </div>
              {statusDoc?.metadata?.submittedByName && (
                <div style={{ fontSize: 12, color: 'var(--text-soft)', marginTop: 2 }}>
                  {t('proforma.submittedBy', 'Submitted by')}: <strong>{statusDoc.metadata.submittedByName}</strong> ({statusDoc.metadata.submittedByRole}) · {new Date(statusDoc.metadata.submittedAt).toLocaleDateString()}
                </div>
              )}
            </div>
          </div>
          <div style={{ fontSize: 12, color: 'var(--text-soft)' }}>
            {formType === 'form4'
              ? 'پښتونخوا ملي عوامي پارټي بنسټيز يونټ کار او فعاليت مياشتنئي رپورټ (Form 4)'
              : 'پښتونخوا ملي عوامي پارټي علاقائي يونټ کار او فعاليت مياشتنئي رپورټ (Form 1)'}
          </div>
        </div>

        {feedback.text && (
          <div className={`alert ${feedback.type === 'success' ? 'good' : (feedback.type === 'error' ? 'error' : 'info')}`} style={{ marginTop: 12 }}>
            {feedback.text}
          </div>
        )}
      </div>

      {/* Tabs Navigation */}
      <div style={{ display: 'flex', gap: 10, borderBottom: '2px solid var(--border)', marginBottom: 16 }}>
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
          📊 {formType === 'form4'
            ? t('proforma.tabOverviewForm4', '1. د ابتدائي يونټ مياشتنئ لنډيز (Unit Summary)')
            : t('proforma.tabOverview', '1. Area Summary & Metrics')}
        </button>
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
          👥 {formType === 'form4'
            ? t('proforma.tabRosterForm4', '2. ابتدائي يونټ ايګزيکټيو ځانګړي فعاليت')
            : t('proforma.tabRoster', '2. Executive Members Activity')} ({rows.length})
        </button>
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
          📝 {t('proforma.tabNotes', '3. Remarks & Observations')}
        </button>
      </div>

      {/* ────────────────────────────────────────────────────────────────────────── */}
      {/* TAB 1: UPPER / SUMMARY METRICS */}
      {/* ────────────────────────────────────────────────────────────────────────── */}
      {activeTab === 'upper' && (
        formType === 'form4' ? (
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
                {formType === 'form4'
                  ? t('proforma.tabRosterForm4', 'ابتدائي يونټ ايګزيکټيو ځانګړي (انفرادي) کار او فعاليت')
                  : t('proforma.rosterTitle', 'Area Executive Members Performance')}
              </h3>
              <p className="muted" style={{ margin: '2px 0 0', fontSize: 13 }}>
                {formType === 'form4'
                  ? 'Individual performance metrics for each cabinet member of this basic unit'
                  : t('proforma.rosterDesc', 'Official 24-column record of monthly meetings, attendance, donations, tours, and outreach')}
              </p>
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
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
            </div>
          </div>

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
            {t('proforma.tabNotes', 'Remarks & Observations')}
          </h3>
          <p className="muted" style={{ margin: '0 0 14px', fontSize: 13 }}>
            {t('proforma.notesPrompt', 'Write detailed political, organizational observations, unit reports, and upcoming resolutions for this month:')}
          </p>
          <textarea
            rows={8}
            value={formData.notes || ''}
            onChange={(e) => updateField('notes', e.target.value)}
            placeholder={formType === 'form4'
              ? t('proforma.notesPlaceholderForm4', 'e.g., During this month, the basic unit executive meeting was held with full attendance, new members were inducted, and upcoming political rallies were scheduled...')
              : t('proforma.notesPlaceholder', 'e.g., During this month, the area executive meeting was held with full attendance, new members were inducted, and upcoming political rallies were scheduled...')}
            style={{ width: '100%', padding: 12, borderRadius: 8, lineHeight: 1.6, fontSize: 14 }}
          />
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
                  {formType === 'form4'
                    ? t('proforma.previewModalTitleForm4', 'پښتونخوا ملي عوامي پارټي بنسټيز يونټ کار او فعاليت مياشتنئي رپورټ (A4 Landscape Preview)')
                    : t('proforma.previewModalTitle', 'Area Unit Monthly Work & Activity Report (A4 Landscape Preview)')}
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
