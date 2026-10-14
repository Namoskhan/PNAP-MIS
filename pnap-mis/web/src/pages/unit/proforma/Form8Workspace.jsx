import React, { useMemo } from 'react';

/**
 * Form8Workspace:
 * District Central & Provincial Committee Members Monthly Work & Activity Report
 * (ضلع کښي مرکزي، صوبائي کميټي د غړو د کار او فعاليت رپورټ)
 *
 * Implements 22-column interactive editing with:
 * - Full 3-Language Localization (English, Pashto, Urdu) with native terminology
 * - Fully Responsive Design (Fluid desktop, tablet, and mobile layouts)
 * - Direction-Aware Sticky Columns (RTL right-stick, LTR left-stick with depth shadow)
 * - Dual View Modes: Touch-friendly Grouped Cards View & Official 22-Column Table View
 * - One-click Auto-Calculate and Auto-Correct Tools
 * - Visual Validation with Tooltips and Inconsistency Highlighting
 * - District Leadership Signature Authorization Block
 */
export default function Form8Workspace({
  formData = {},
  rows = [],
  form8ViewMode = 'cards',
  setForm8ViewMode,
  form8Search = '',
  setForm8Search,
  updateForm8Row,
  addForm8Row,
  removeForm8Row,
  handleAutoCalcAllForm8Rows,
  handleAutoFixForm8Inconsistencies,
  form8Validation = { isValid: true, errors: [], rowErrors: {} },
  isRtl = true,
  t,
  updateField,
}) {
  // Filtered rows for real-time search
  const filteredRows = useMemo(() => {
    return rows
      .map((r, originalIdx) => ({ r, originalIdx }))
      .filter(({ r }) => !form8Search || (r.name || '').toLowerCase().includes(form8Search.toLowerCase()));
  }, [rows, form8Search]);

  // Aggregate calculations for KPI summary and Table Footer
  const totals = useMemo(() => {
    const sum = (field) => rows.reduce((acc, r) => acc + (parseInt(r[field], 10) || 0), 0);

    const distCommMeeting = sum('distCommMeeting');
    const areaExecMeeting = sum('areaExecMeeting');
    const areaCommMeeting = sum('areaCommMeeting');
    const ownBuMeeting = sum('ownBuMeeting');
    const buExecMeeting = sum('buExecMeeting');
    const buMeeting = sum('buMeeting');
    const psoMeeting = sum('psoMeeting');
    const conferences = sum('conferences');
    const seminars = sum('seminars');
    const studyCircles = sum('studyCircles');
    const inductions = sum('inductions');
    const publicGatherings = sum('publicGatherings');
    const totalMeetings = sum('totalMeetings');
    const monthlyDues = sum('monthlyDues');
    const tours = sum('tours');
    const contacts = sum('contacts');
    const officeAttendance = sum('officeAttendance');
    const bloodBank = rows.reduce((acc, r) => acc + (parseInt(r.bloodBank, 10) || 0), 0);

    const activeCount = rows.filter((r) => r.activeStatus !== 'غير فعاله' && r.activeStatus !== 'Inactive' && r.activeStatus !== 'غیر فعال').length;

    return {
      comradesCount: rows.length,
      activeCount,
      distCommMeeting,
      areaExecMeeting,
      areaCommMeeting,
      ownBuMeeting,
      buExecMeeting,
      buMeeting,
      psoMeeting,
      conferences,
      seminars,
      studyCircles,
      inductions,
      publicGatherings,
      totalMeetings,
      monthlyDues,
      tours,
      contacts,
      officeAttendance,
      bloodBank,
    };
  }, [rows]);

  // Validation helpers
  const getFieldError = (idx, field) => {
    return form8Validation?.rowErrors?.[idx]?.[field] || null;
  };

  const getCardInputStyle = (idx, field) => {
    const isErr = Boolean(getFieldError(idx, field));
    return {
      width: '100%',
      padding: '7px 10px',
      fontSize: 13,
      borderRadius: 6,
      border: isErr ? '1.5px solid #ef4444' : '1px solid var(--border)',
      background: isErr ? 'rgba(239, 68, 68, 0.08)' : 'var(--surface-alt)',
      color: isErr ? '#ef4444' : 'inherit',
      fontWeight: isErr ? 700 : 500,
      boxSizing: 'border-box',
      transition: 'border-color 0.2s, background 0.2s',
    };
  };

  const getTableInputStyle = (idx, field, customWidth = 52) => {
    const isErr = Boolean(getFieldError(idx, field));
    return {
      width: customWidth,
      textAlign: 'center',
      padding: '5px 3px',
      fontSize: 12,
      borderRadius: 4,
      border: isErr ? '1.5px solid #ef4444' : '1px solid var(--border)',
      background: isErr ? 'rgba(239, 68, 68, 0.1)' : 'var(--surface-alt)',
      color: isErr ? '#ef4444' : 'inherit',
      fontWeight: isErr ? 700 : 500,
      boxSizing: 'border-box',
    };
  };

  return (
    <div className="form8-workspace" style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      {/* ────────────────────────────────────────────────────────────────────────── */}
      {/* EMBEDDED RESPONSIVE STYLESHEET */}
      {/* ────────────────────────────────────────────────────────────────────────── */}
      <style>{`
        .form8-workspace {
          width: 100%;
          box-sizing: border-box;
        }

        /* Responsive KPI Grid */
        .form8-kpi-grid {
          display: grid;
          grid-template-columns: repeat(auto-fit, minmax(min(180px, 100%), 1fr));
          gap: 12px;
        }

        /* Responsive Toolbar */
        .form8-toolbar {
          display: flex;
          justify-content: space-between;
          align-items: center;
          gap: 12px;
          flex-wrap: wrap;
        }
        .form8-toolbar-left {
          display: flex;
          align-items: center;
          gap: 10px;
          flex-wrap: wrap;
          flex: 1;
          min-width: 260px;
        }
        .form8-view-toggle {
          display: inline-flex;
          padding: 3px;
          background: var(--surface-alt);
          border-radius: 8px;
          border: 1px solid var(--border);
        }
        .form8-view-toggle button {
          white-space: nowrap !important;
          display: inline-flex !important;
          align-items: center;
          gap: 6px;
        }
        .form8-search-input {
          padding: 8px 12px;
          font-size: 13px;
          border-radius: 6px;
          border: 1px solid var(--border);
          min-width: 220px;
          flex: 1;
          background: var(--surface-alt);
          box-sizing: border-box;
        }
        .form8-toolbar-actions {
          display: flex;
          align-items: center;
          gap: 8px;
          flex-wrap: wrap;
        }
        .form8-toolbar-actions button {
          white-space: nowrap !important;
          display: inline-flex !important;
          align-items: center;
          justify-content: center;
          gap: 6px;
        }

        /* Cards View Responsive Structure */
        .form8-card {
          padding: 16px;
          border: 1px solid var(--border);
          background: var(--surface);
          border-radius: var(--radius, 8px);
          box-sizing: border-box;
        }
        .form8-card-header {
          display: flex;
          justify-content: space-between;
          align-items: center;
          margin-bottom: 14px;
          padding-bottom: 12px;
          border-bottom: 1px solid var(--border);
          flex-wrap: wrap;
          gap: 10px;
        }
        .form8-card-header-left {
          display: flex;
          align-items: center;
          gap: 10px;
          flex: 1;
          min-width: 240px;
        }
        .form8-card-header-right {
          display: flex;
          align-items: center;
          gap: 10px;
        }
        .form8-card-subgrid {
          display: grid;
          grid-template-columns: repeat(auto-fit, minmax(min(270px, 100%), 1fr));
          gap: 14px;
        }
        .form8-field-group {
          display: grid;
          grid-template-columns: repeat(2, 1fr);
          gap: 10px;
        }

        /* Signatures Grid */
        .form8-signatures-grid {
          display: grid;
          grid-template-columns: repeat(auto-fit, minmax(min(250px, 100%), 1fr));
          gap: 14px;
        }

        /* Table Responsive Scroller */
        .form8-table-scroller {
          width: 100%;
          overflow-x: auto;
          max-height: 72vh;
          -webkit-overflow-scrolling: touch;
          border-radius: 6px;
          border: 1px solid var(--border);
        }

        /* Tablet Breakpoints */
        @media (max-width: 820px) {
          .form8-toolbar {
            flex-direction: column !important;
            align-items: stretch !important;
            gap: 10px;
          }
          .form8-toolbar-left {
            width: 100% !important;
            min-width: 0 !important;
          }
          .form8-toolbar-actions {
            display: grid !important;
            grid-template-columns: 1fr 1fr;
            width: 100% !important;
            gap: 8px;
          }
          .form8-toolbar-actions button {
            width: 100% !important;
            justify-content: center !important;
          }
          .form8-kpi-grid {
            grid-template-columns: repeat(2, 1fr);
          }
        }

        /* Mobile Phone Breakpoints */
        @media (max-width: 580px) {
          .form8-kpi-grid {
            grid-template-columns: 1fr;
            gap: 8px;
          }
          .form8-toolbar-left {
            flex-direction: column !important;
            align-items: stretch !important;
          }
          .form8-view-toggle {
            display: grid !important;
            grid-template-columns: 1fr 1fr;
            width: 100%;
          }
          .form8-view-toggle button {
            justify-content: center !important;
            font-size: 11px !important;
            padding: 8px 4px !important;
          }
          .form8-search-input {
            width: 100% !important;
            min-width: 0 !important;
            font-size: 13px !important;
          }
          .form8-toolbar-actions {
            grid-template-columns: 1fr !important;
          }
          .form8-card-header {
            flex-direction: column !important;
            align-items: stretch !important;
          }
          .form8-card-header-left {
            width: 100% !important;
            min-width: 0 !important;
          }
          .form8-card-header-right {
            justify-content: space-between !important;
            width: 100% !important;
          }
          .form8-card-subgrid {
            grid-template-columns: 1fr !important;
          }
          .form8-field-group {
            grid-template-columns: 1fr 1fr;
            gap: 8px;
          }
          .form8-signatures-grid {
            grid-template-columns: 1fr !important;
          }
        }

        @media (max-width: 360px) {
          .form8-field-group {
            grid-template-columns: 1fr !important;
          }
        }
      `}</style>

      {/* ────────────────────────────────────────────────────────────────────────── */}
      {/* 1. KPI SUMMARY CARDS */}
      {/* ────────────────────────────────────────────────────────────────────────── */}
      <div className="form8-kpi-grid">
        <div
          className="card"
          style={{
            padding: '12px 16px',
            background: 'var(--surface-alt)',
            border: '1px solid var(--border)',
            borderRight: isRtl ? '4px solid #0284c7' : '1px solid var(--border)',
            borderLeft: !isRtl ? '4px solid #0284c7' : '1px solid var(--border)',
          }}
        >
          <div style={{ fontSize: 12, color: 'var(--text-soft)', fontWeight: 600 }}>
            {t('proforma.form8.kpiTotalComrades', 'Total Comrades')}
          </div>
          <div style={{ fontSize: 22, fontWeight: 'bold', marginTop: 4, display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
            <span>👥 {totals.comradesCount}</span>
            <span
              style={{
                fontSize: 11,
                padding: '2px 8px',
                borderRadius: 4,
                background: 'rgba(34, 197, 94, 0.15)',
                color: '#22c55e',
                fontWeight: 600,
                whiteSpace: 'nowrap',
              }}
            >
              {totals.activeCount} {t('proforma.form8.activeOption', 'Active')}
            </span>
          </div>
        </div>

        <div
          className="card"
          style={{
            padding: '12px 16px',
            background: 'var(--surface-alt)',
            border: '1px solid var(--border)',
            borderRight: isRtl ? '4px solid #10b981' : '1px solid var(--border)',
            borderLeft: !isRtl ? '4px solid #10b981' : '1px solid var(--border)',
          }}
        >
          <div style={{ fontSize: 12, color: 'var(--text-soft)', fontWeight: 600 }}>
            {t('proforma.form8.kpiTotalMeetings', 'Total Meetings Held')}
          </div>
          <div style={{ fontSize: 22, fontWeight: 'bold', marginTop: 4 }}>
            🤝 {totals.totalMeetings}
          </div>
        </div>

        <div
          className="card"
          style={{
            padding: '12px 16px',
            background: 'var(--surface-alt)',
            border: '1px solid var(--border)',
            borderRight: isRtl ? '4px solid #8b5cf6' : '1px solid var(--border)',
            borderLeft: !isRtl ? '4px solid #8b5cf6' : '1px solid var(--border)',
          }}
        >
          <div style={{ fontSize: 12, color: 'var(--text-soft)', fontWeight: 600 }}>
            {t('proforma.form8.kpiGatherings', 'Public Gatherings')}
          </div>
          <div style={{ fontSize: 22, fontWeight: 'bold', marginTop: 4 }}>
            📢 {totals.publicGatherings}
          </div>
        </div>

        <div
          className="card"
          style={{
            padding: '12px 16px',
            background: 'var(--surface-alt)',
            border: '1px solid var(--border)',
            borderRight: isRtl ? '4px solid #f59e0b' : '1px solid var(--border)',
            borderLeft: !isRtl ? '4px solid #f59e0b' : '1px solid var(--border)',
          }}
        >
          <div style={{ fontSize: 12, color: 'var(--text-soft)', fontWeight: 600 }}>
            {t('proforma.form8.kpiTours', 'Tours & Visits')}
          </div>
          <div style={{ fontSize: 22, fontWeight: 'bold', marginTop: 4 }}>
            🚗 {totals.tours}
          </div>
        </div>

        <div
          className="card"
          style={{
            padding: '12px 16px',
            background: 'var(--surface-alt)',
            border: '1px solid var(--border)',
            borderRight: isRtl ? '4px solid #ec4899' : '1px solid var(--border)',
            borderLeft: !isRtl ? '4px solid #ec4899' : '1px solid var(--border)',
          }}
        >
          <div style={{ fontSize: 12, color: 'var(--text-soft)', fontWeight: 600 }}>
            {t('proforma.form8.kpiTotalDues', 'Total Dues Collected')}
          </div>
          <div style={{ fontSize: 20, fontWeight: 'bold', marginTop: 4, color: '#10b981' }}>
            PKR {totals.monthlyDues.toLocaleString()}
          </div>
        </div>
      </div>

      {/* ────────────────────────────────────────────────────────────────────────── */}
      {/* 2. VALIDATION ALERT BANNER */}
      {/* ────────────────────────────────────────────────────────────────────────── */}
      {!form8Validation.isValid && (
        <div
          style={{
            padding: '12px 16px',
            background: 'rgba(239, 68, 68, 0.1)',
            border: '1.5px solid #ef4444',
            borderRadius: 8,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: 12,
            flexWrap: 'wrap',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <span style={{ fontSize: 22 }}>⚠️</span>
            <div>
              <strong style={{ color: '#ef4444', fontSize: 14 }}>
                {form8Validation.errors.length} {t('proforma.validationIssuesFound', 'Validation inconsistencies detected')}
              </strong>
              <div style={{ fontSize: 12, color: 'var(--text-main)', marginTop: 2 }}>
                {form8Validation.errors[0]}
                {form8Validation.errors.length > 1 && ` (+${form8Validation.errors.length - 1} more)`}
              </div>
            </div>
          </div>
          {handleAutoFixForm8Inconsistencies && (
            <button
              type="button"
              className="btn"
              onClick={handleAutoFixForm8Inconsistencies}
              style={{
                background: '#ef4444',
                color: '#fff',
                fontSize: 12,
                fontWeight: 700,
                padding: '6px 14px',
                borderRadius: 6,
                whiteSpace: 'nowrap',
              }}
            >
              {t('proforma.form8.autoFixAll', '⚡ Auto-Correct Mismatches')}
            </button>
          )}
        </div>
      )}

      {/* ────────────────────────────────────────────────────────────────────────── */}
      {/* 3. TOOLBAR: SEARCH, VIEW TOGGLE, AUTO-CALCULATE, ADD COMRADE */}
      {/* ────────────────────────────────────────────────────────────────────────── */}
      <div className="card form8-toolbar" style={{ padding: '12px 16px', background: 'var(--surface)' }}>
        <div className="form8-toolbar-left">
          {/* Dual View Toggle */}
          <div className="form8-view-toggle">
            <button
              type="button"
              onClick={() => setForm8ViewMode('cards')}
              style={{
                padding: '6px 14px',
                borderRadius: 6,
                border: 'none',
                background: form8ViewMode === 'cards' ? 'var(--primary, #0ea5e9)' : 'transparent',
                color: form8ViewMode === 'cards' ? '#fff' : 'var(--text-main)',
                fontWeight: 700,
                fontSize: 12,
                cursor: 'pointer',
              }}
            >
              <span>🗂️</span>
              <span>{t('proforma.form8.viewCards', 'Cards View')}</span>
            </button>
            <button
              type="button"
              onClick={() => setForm8ViewMode('table')}
              style={{
                padding: '6px 14px',
                borderRadius: 6,
                border: 'none',
                background: form8ViewMode === 'table' ? 'var(--primary, #0ea5e9)' : 'transparent',
                color: form8ViewMode === 'table' ? '#fff' : 'var(--text-main)',
                fontWeight: 700,
                fontSize: 12,
                cursor: 'pointer',
              }}
            >
              <span>📊</span>
              <span>{t('proforma.form8.viewTable', 'Official Table View (22 Columns)')}</span>
            </button>
          </div>

          {/* Search by Name */}
          <input
            type="text"
            className="form8-search-input"
            value={form8Search}
            onChange={(e) => setForm8Search(e.target.value)}
            placeholder={t('proforma.form8.searchPlaceholder', 'Search comrade by name...')}
          />
        </div>

        <div className="form8-toolbar-actions">
          {handleAutoFixForm8Inconsistencies && !form8Validation.isValid && (
            <button
              type="button"
              className="btn"
              onClick={handleAutoFixForm8Inconsistencies}
              style={{
                fontSize: 12,
                fontWeight: 700,
                background: '#ef4444',
                color: '#fff',
              }}
            >
              <span>⚡</span>
              <span>{t('proforma.form8.autoFixAll', '⚡ Auto-Correct Mismatches')}</span>
            </button>
          )}

          <button
            type="button"
            className="btn secondary"
            onClick={handleAutoCalcAllForm8Rows}
            style={{
              fontSize: 12,
              fontWeight: 700,
              background: '#0ea5e9',
              color: '#fff',
            }}
          >
            <span>⚡</span>
            <span>{t('proforma.form8.autoCalcAll', '⚡ Auto-Calculate All')}</span>
          </button>

          <button
            type="button"
            className="btn primary"
            onClick={addForm8Row}
            style={{ fontSize: 12, fontWeight: 700 }}
          >
            <span>➕</span>
            <span>{t('proforma.form8.addComrade', '+ Add Comrade')}</span>
          </button>
        </div>
      </div>

      {/* ────────────────────────────────────────────────────────────────────────── */}
      {/* 4. CARDS VIEW (MODERN GROUPED CARDS) */}
      {/* ────────────────────────────────────────────────────────────────────────── */}
      {form8ViewMode === 'cards' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          {filteredRows.length === 0 ? (
            <div className="card" style={{ padding: 32, textAlign: 'center', color: 'var(--text-soft)' }}>
              {t('proforma.form8.noComrades', 'No committee comrades recorded yet. Click "+ Add Comrade" to add entries.')}
            </div>
          ) : (
            filteredRows.map(({ r, originalIdx }) => {
              const nameErr = getFieldError(originalIdx, 'name');

              return (
                <div
                  key={originalIdx}
                  className="card form8-card"
                  style={{
                    borderRight: isRtl ? '4px solid #0284c7' : '1px solid var(--border)',
                    borderLeft: !isRtl ? '4px solid #0284c7' : '1px solid var(--border)',
                  }}
                >
                  {/* Card Header */}
                  <div className="form8-card-header">
                    <div className="form8-card-header-left">
                      <span
                        style={{
                          width: 28,
                          height: 28,
                          borderRadius: '50%',
                          background: '#0284c7',
                          color: '#fff',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          fontWeight: 'bold',
                          fontSize: 12,
                          flexShrink: 0,
                        }}
                      >
                        {originalIdx + 1}
                      </span>
                      <div style={{ flex: 1 }}>
                        <input
                          type="text"
                          value={r.name || ''}
                          onChange={(e) => updateForm8Row(originalIdx, 'name', e.target.value)}
                          placeholder={t('proforma.form8.namePlaceholder', 'Enter comrade full name')}
                          style={{
                            ...getCardInputStyle(originalIdx, 'name'),
                            fontWeight: 700,
                            fontSize: 14,
                          }}
                        />
                        {nameErr && (
                          <div style={{ fontSize: 11, color: '#ef4444', marginTop: 2, fontWeight: 600 }}>
                            ⚠️ {nameErr}
                          </div>
                        )}
                      </div>
                    </div>

                    <div className="form8-card-header-right">
                      <select
                        value={r.activeStatus || 'فعاله'}
                        onChange={(e) => updateForm8Row(originalIdx, 'activeStatus', e.target.value)}
                        style={{
                          padding: '6px 12px',
                          borderRadius: 6,
                          fontSize: 12,
                          fontWeight: 700,
                          background: (r.activeStatus === 'فعاله' || r.activeStatus === 'Active' || r.activeStatus === 'فعال') ? 'rgba(34, 197, 94, 0.15)' : 'rgba(239, 68, 68, 0.15)',
                          color: (r.activeStatus === 'فعاله' || r.activeStatus === 'Active' || r.activeStatus === 'فعال') ? '#22c55e' : '#ef4444',
                          border: '1px solid var(--border)',
                        }}
                      >
                        <option value="فعاله">{t('proforma.form8.activeOption', 'Active')}</option>
                        <option value="غير فعاله">{t('proforma.form8.inactiveOption', 'Inactive')}</option>
                      </select>

                      <button
                        type="button"
                        onClick={() => removeForm8Row(originalIdx)}
                        className="btn"
                        style={{
                          padding: '6px 10px',
                          color: '#ef4444',
                          background: 'rgba(239, 68, 68, 0.1)',
                          border: 'none',
                          borderRadius: 6,
                          fontSize: 13,
                        }}
                        title={t('proforma.form8.removeComrade', 'Remove Comrade')}
                      >
                        🗑️
                      </button>
                    </div>
                  </div>

                  {/* Grouped Fields in Card */}
                  <div className="form8-card-subgrid">
                    {/* Group 1: Committee & Executive Meetings */}
                    <div style={{ padding: 12, background: 'var(--surface-alt)', borderRadius: 8, border: '1px solid var(--border)' }}>
                      <div style={{ fontWeight: 700, fontSize: 12, marginBottom: 8, color: '#0284c7' }}>
                        🤝 {t('proforma.form8.secMeetings', 'Committee & Executive Meetings')}
                      </div>
                      <div className="form8-field-group">
                        <div>
                          <label style={{ fontSize: 11, color: 'var(--text-soft)', display: 'block', marginBottom: 2 }}>
                            {t('proforma.form8.distCommMeeting', 'District Committee Meetings')}
                          </label>
                          <input
                            type="number"
                            min="0"
                            value={r.distCommMeeting ?? ''}
                            onChange={(e) => updateForm8Row(originalIdx, 'distCommMeeting', e.target.value)}
                            style={getCardInputStyle(originalIdx, 'distCommMeeting')}
                          />
                        </div>
                        <div>
                          <label style={{ fontSize: 11, color: 'var(--text-soft)', display: 'block', marginBottom: 2 }}>
                            {t('proforma.form8.areaExecMeeting', 'Area Executive Meetings')}
                          </label>
                          <input
                            type="number"
                            min="0"
                            value={r.areaExecMeeting ?? ''}
                            onChange={(e) => updateForm8Row(originalIdx, 'areaExecMeeting', e.target.value)}
                            style={getCardInputStyle(originalIdx, 'areaExecMeeting')}
                          />
                        </div>
                        <div>
                          <label style={{ fontSize: 11, color: 'var(--text-soft)', display: 'block', marginBottom: 2 }}>
                            {t('proforma.form8.areaCommMeeting', 'Area Committee Meetings')}
                          </label>
                          <input
                            type="number"
                            min="0"
                            value={r.areaCommMeeting ?? ''}
                            onChange={(e) => updateForm8Row(originalIdx, 'areaCommMeeting', e.target.value)}
                            style={getCardInputStyle(originalIdx, 'areaCommMeeting')}
                          />
                        </div>
                        <div>
                          <label style={{ fontSize: 11, color: 'var(--text-soft)', display: 'block', marginBottom: 2 }}>
                            {t('proforma.form8.ownBuMeeting', 'Own Unit Meetings')}
                          </label>
                          <input
                            type="number"
                            min="0"
                            value={r.ownBuMeeting ?? ''}
                            onChange={(e) => updateForm8Row(originalIdx, 'ownBuMeeting', e.target.value)}
                            style={getCardInputStyle(originalIdx, 'ownBuMeeting')}
                          />
                        </div>
                        <div>
                          <label style={{ fontSize: 11, color: 'var(--text-soft)', display: 'block', marginBottom: 2 }}>
                            {t('proforma.form8.buExecMeeting', 'BU Executive Meetings')}
                          </label>
                          <input
                            type="number"
                            min="0"
                            value={r.buExecMeeting ?? ''}
                            onChange={(e) => updateForm8Row(originalIdx, 'buExecMeeting', e.target.value)}
                            style={getCardInputStyle(originalIdx, 'buExecMeeting')}
                          />
                        </div>
                        <div>
                          <label style={{ fontSize: 11, color: 'var(--text-soft)', display: 'block', marginBottom: 2 }}>
                            {t('proforma.form8.buMeeting', 'Basic Units Meetings')}
                          </label>
                          <input
                            type="number"
                            min="0"
                            value={r.buMeeting ?? ''}
                            onChange={(e) => updateForm8Row(originalIdx, 'buMeeting', e.target.value)}
                            style={getCardInputStyle(originalIdx, 'buMeeting')}
                          />
                        </div>
                        <div>
                          <label style={{ fontSize: 11, color: 'var(--text-soft)', display: 'block', marginBottom: 2 }}>
                            {t('proforma.form8.psoMeeting', 'PSO Meetings')}
                          </label>
                          <input
                            type="number"
                            min="0"
                            value={r.psoMeeting ?? ''}
                            onChange={(e) => updateForm8Row(originalIdx, 'psoMeeting', e.target.value)}
                            style={getCardInputStyle(originalIdx, 'psoMeeting')}
                          />
                        </div>
                        <div>
                          <label style={{ fontSize: 11, color: '#0284c7', display: 'block', marginBottom: 2, fontWeight: 700 }}>
                            {t('proforma.form8.totalMeetings', 'Total Meetings')}
                          </label>
                          <input
                            type="number"
                            readOnly
                            value={r.totalMeetings ?? ''}
                            style={{
                              ...getCardInputStyle(originalIdx, 'totalMeetings'),
                              background: '#e0f2fe',
                              color: '#0284c7',
                              fontWeight: 700,
                            }}
                          />
                        </div>
                      </div>
                    </div>

                    {/* Group 2: Programs, Circles & Inductions */}
                    <div style={{ padding: 12, background: 'var(--surface-alt)', borderRadius: 8, border: '1px solid var(--border)' }}>
                      <div style={{ fontWeight: 700, fontSize: 12, marginBottom: 8, color: '#10b981' }}>
                        🎓 {t('proforma.form8.secPrograms', 'Programs, Circles & Inductions')}
                      </div>
                      <div className="form8-field-group">
                        <div>
                          <label style={{ fontSize: 11, color: 'var(--text-soft)', display: 'block', marginBottom: 2 }}>
                            {t('proforma.form8.conferences', 'Party Conferences')}
                          </label>
                          <input
                            type="number"
                            min="0"
                            value={r.conferences ?? ''}
                            onChange={(e) => updateForm8Row(originalIdx, 'conferences', e.target.value)}
                            style={getCardInputStyle(originalIdx, 'conferences')}
                          />
                        </div>
                        <div>
                          <label style={{ fontSize: 11, color: 'var(--text-soft)', display: 'block', marginBottom: 2 }}>
                            {t('proforma.form8.seminars', 'Seminars')}
                          </label>
                          <input
                            type="number"
                            min="0"
                            value={r.seminars ?? ''}
                            onChange={(e) => updateForm8Row(originalIdx, 'seminars', e.target.value)}
                            style={getCardInputStyle(originalIdx, 'seminars')}
                          />
                        </div>
                        <div>
                          <label style={{ fontSize: 11, color: 'var(--text-soft)', display: 'block', marginBottom: 2 }}>
                            {t('proforma.form8.studyCircles', 'Study Circles')}
                          </label>
                          <input
                            type="number"
                            min="0"
                            value={r.studyCircles ?? ''}
                            onChange={(e) => updateForm8Row(originalIdx, 'studyCircles', e.target.value)}
                            style={getCardInputStyle(originalIdx, 'studyCircles')}
                          />
                        </div>
                        <div>
                          <label style={{ fontSize: 11, color: 'var(--text-soft)', display: 'block', marginBottom: 2 }}>
                            {t('proforma.form8.inductions', 'Induction Programs')}
                          </label>
                          <input
                            type="number"
                            min="0"
                            value={r.inductions ?? ''}
                            onChange={(e) => updateForm8Row(originalIdx, 'inductions', e.target.value)}
                            style={getCardInputStyle(originalIdx, 'inductions')}
                          />
                        </div>
                        <div style={{ gridColumn: 'span 2' }}>
                          <label style={{ fontSize: 11, color: 'var(--text-soft)', display: 'block', marginBottom: 2 }}>
                            {t('proforma.form8.publicGatherings', 'Rallies, Protests & Jirgas')}
                          </label>
                          <input
                            type="number"
                            min="0"
                            value={r.publicGatherings ?? ''}
                            onChange={(e) => updateForm8Row(originalIdx, 'publicGatherings', e.target.value)}
                            style={getCardInputStyle(originalIdx, 'publicGatherings')}
                          />
                        </div>
                      </div>
                    </div>

                    {/* Group 3: Finances, Tours & Contacts */}
                    <div style={{ padding: 12, background: 'var(--surface-alt)', borderRadius: 8, border: '1px solid var(--border)' }}>
                      <div style={{ fontWeight: 700, fontSize: 12, marginBottom: 8, color: '#f59e0b' }}>
                        💰 {t('proforma.form8.secFinances', 'Finances, Tours & Contacts')}
                      </div>
                      <div className="form8-field-group">
                        <div>
                          <label style={{ fontSize: 11, color: 'var(--text-soft)', display: 'block', marginBottom: 2 }}>
                            {t('proforma.form8.monthlyDues', 'Monthly Dues')}
                          </label>
                          <input
                            type="number"
                            min="0"
                            value={r.monthlyDues ?? ''}
                            onChange={(e) => updateForm8Row(originalIdx, 'monthlyDues', e.target.value)}
                            style={getCardInputStyle(originalIdx, 'monthlyDues')}
                          />
                        </div>
                        <div>
                          <label style={{ fontSize: 11, color: 'var(--text-soft)', display: 'block', marginBottom: 2 }}>
                            {t('proforma.form8.tours', 'Tours')}
                          </label>
                          <input
                            type="number"
                            min="0"
                            value={r.tours ?? ''}
                            onChange={(e) => updateForm8Row(originalIdx, 'tours', e.target.value)}
                            style={getCardInputStyle(originalIdx, 'tours')}
                          />
                        </div>
                        <div>
                          <label style={{ fontSize: 11, color: 'var(--text-soft)', display: 'block', marginBottom: 2 }}>
                            {t('proforma.form8.contacts', 'Contacts (Org & Public)')}
                          </label>
                          <input
                            type="number"
                            min="0"
                            value={r.contacts ?? ''}
                            onChange={(e) => updateForm8Row(originalIdx, 'contacts', e.target.value)}
                            style={getCardInputStyle(originalIdx, 'contacts')}
                          />
                        </div>
                        <div>
                          <label style={{ fontSize: 11, color: 'var(--text-soft)', display: 'block', marginBottom: 2 }}>
                            {t('proforma.form8.officeAttendance', 'Office Attendance')}
                          </label>
                          <input
                            type="number"
                            min="0"
                            value={r.officeAttendance ?? ''}
                            onChange={(e) => updateForm8Row(originalIdx, 'officeAttendance', e.target.value)}
                            style={getCardInputStyle(originalIdx, 'officeAttendance')}
                          />
                        </div>
                        <div>
                          <label style={{ fontSize: 11, color: 'var(--text-soft)', display: 'block', marginBottom: 2 }}>
                            {t('proforma.form8.bloodBank', 'Blood Bank, Post & Zakat')}
                          </label>
                          <input
                            type="text"
                            value={r.bloodBank || ''}
                            onChange={(e) => updateForm8Row(originalIdx, 'bloodBank', e.target.value)}
                            placeholder={t('proforma.form8.bloodPlaceholder', 'Amount / Details')}
                            style={getCardInputStyle(originalIdx, 'bloodBank')}
                          />
                        </div>
                        <div>
                          <label style={{ fontSize: 11, color: 'var(--text-soft)', display: 'block', marginBottom: 2 }}>
                            {t('proforma.form8.ideologicalReading', 'Ideological Study')}
                          </label>
                          <input
                            type="text"
                            value={r.ideologicalReading || ''}
                            onChange={(e) => updateForm8Row(originalIdx, 'ideologicalReading', e.target.value)}
                            placeholder={t('proforma.form8.readingPlaceholder', 'Book title or topic')}
                            style={getCardInputStyle(originalIdx, 'ideologicalReading')}
                          />
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              );
            })
          )}
        </div>
      )}

      {/* ────────────────────────────────────────────────────────────────────────── */}
      {/* 5. OFFICIAL 22-COLUMN TABLE VIEW */}
      {/* ────────────────────────────────────────────────────────────────────────── */}
      {form8ViewMode === 'table' && (
        <div className="card" style={{ padding: 14 }}>
          {/* Scroll Hint */}
          <div
            style={{
              fontSize: 11,
              color: 'var(--text-soft)',
              marginBottom: 8,
              display: 'flex',
              alignItems: 'center',
              gap: 6,
            }}
          >
            <span>↔</span>
            <span>{t('proforma.scrollHint', 'Scroll horizontally to view all columns (↔)')}</span>
          </div>

          <div className="form8-table-scroller">
            <table
              className="table"
              style={{
                width: '100%',
                borderCollapse: 'collapse',
                fontSize: 11,
                textAlign: 'center',
                whiteSpace: 'nowrap',
              }}
            >
              <thead
                style={{
                  position: 'sticky',
                  top: 0,
                  zIndex: 20,
                  background: 'var(--surface-alt)',
                  boxShadow: '0 2px 4px rgba(0,0,0,0.06)',
                }}
              >
                <tr style={{ background: '#f1f5f9', color: '#0f172a', fontWeight: 'bold' }}>
                  <th
                    style={{
                      width: 36,
                      minWidth: 36,
                      padding: '6px 4px',
                      position: 'sticky',
                      right: isRtl ? 0 : 'auto',
                      left: !isRtl ? 0 : 'auto',
                      zIndex: 23,
                      background: '#f1f5f9',
                    }}
                  >
                    #
                  </th>
                  <th
                    style={{
                      width: 140,
                      minWidth: 140,
                      padding: '6px 6px',
                      position: 'sticky',
                      right: isRtl ? 36 : 'auto',
                      left: !isRtl ? 36 : 'auto',
                      zIndex: 23,
                      background: '#f1f5f9',
                      borderLeft: isRtl ? '2px solid var(--primary, #0ea5e9)' : 'none',
                      borderRight: !isRtl ? '2px solid var(--primary, #0ea5e9)' : 'none',
                      boxShadow: isRtl ? '-3px 0 5px rgba(0,0,0,0.06)' : '3px 0 5px rgba(0,0,0,0.06)',
                    }}
                  >
                    {t('proforma.form8.name', 'Comrade Name')}
                  </th>
                  <th style={{ width: 50, padding: 4 }} title={t('proforma.form8.distCommMeeting')}>
                    {t('proforma.form8.tblDistComm', 'Dist Comm')}
                  </th>
                  <th style={{ width: 50, padding: 4 }} title={t('proforma.form8.areaExecMeeting')}>
                    {t('proforma.form8.tblAreaExec', 'Area Exec')}
                  </th>
                  <th style={{ width: 50, padding: 4 }} title={t('proforma.form8.areaCommMeeting')}>
                    {t('proforma.form8.tblAreaComm', 'Area Comm')}
                  </th>
                  <th style={{ width: 48, padding: 4 }} title={t('proforma.form8.ownBuMeeting')}>
                    {t('proforma.form8.tblOwnBu', 'Own Unit')}
                  </th>
                  <th style={{ width: 50, padding: 4 }} title={t('proforma.form8.buExecMeeting')}>
                    {t('proforma.form8.tblBuExec', 'BU Exec')}
                  </th>
                  <th style={{ width: 50, padding: 4 }} title={t('proforma.form8.buMeeting')}>
                    {t('proforma.form8.tblBuMeeting', 'Basic Units')}
                  </th>
                  <th style={{ width: 46, padding: 4 }} title={t('proforma.form8.psoMeeting')}>
                    {t('proforma.form8.tblPsoMeeting', 'With PSO')}
                  </th>
                  <th style={{ width: 48, padding: 4 }} title={t('proforma.form8.conferences')}>
                    {t('proforma.form8.tblConferences', 'Conferences')}
                  </th>
                  <th style={{ width: 46, padding: 4 }} title={t('proforma.form8.seminars')}>
                    {t('proforma.form8.tblSeminars', 'Seminars')}
                  </th>
                  <th style={{ width: 46, padding: 4 }} title={t('proforma.form8.studyCircles')}>
                    {t('proforma.form8.tblStudyCircles', 'Study Circles')}
                  </th>
                  <th style={{ width: 48, padding: 4 }} title={t('proforma.form8.inductions')}>
                    {t('proforma.form8.tblInductions', 'Inductions')}
                  </th>
                  <th style={{ width: 68, padding: 4 }} title={t('proforma.form8.publicGatherings')}>
                    {t('proforma.form8.tblPublicGatherings', 'Rallies & Jirgas')}
                  </th>
                  <th style={{ width: 50, padding: 4, background: '#e0f2fe', color: '#0284c7' }} title={t('proforma.form8.totalMeetings')}>
                    {t('proforma.form8.tblTotalMeetings', 'Total Mtgs')}
                  </th>
                  <th style={{ width: 52, padding: 4 }} title={t('proforma.form8.monthlyDues')}>
                    {t('proforma.form8.tblMonthlyDues', 'Monthly Dues')}
                  </th>
                  <th style={{ width: 44, padding: 4 }} title={t('proforma.form8.tours')}>
                    {t('proforma.form8.tblTours', 'Tours')}
                  </th>
                  <th style={{ width: 54, padding: 4 }} title={t('proforma.form8.contacts')}>
                    {t('proforma.form8.tblContacts', 'Contacts')}
                  </th>
                  <th style={{ width: 48, padding: 4 }} title={t('proforma.form8.officeAttendance')}>
                    {t('proforma.form8.tblOfficeAttendance', 'Office Attnd')}
                  </th>
                  <th style={{ width: 64, padding: 4 }} title={t('proforma.form8.activeStatus')}>
                    {t('proforma.form8.tblActiveStatus', 'Status')}
                  </th>
                  <th style={{ width: 90, padding: 4 }} title={t('proforma.form8.ideologicalReading')}>
                    {t('proforma.form8.tblIdeologicalReading', 'Study (Books)')}
                  </th>
                  <th style={{ width: 58, padding: 4 }} title={t('proforma.form8.bloodBank')}>
                    {t('proforma.form8.tblBloodBank', 'Blood/Zakat')}
                  </th>
                  <th style={{ width: 36, padding: 4 }}>🗑️</th>
                </tr>
              </thead>
              <tbody>
                {filteredRows.map(({ r, originalIdx }) => (
                  <tr key={originalIdx} style={{ borderBottom: '1px solid var(--border)' }}>
                    <td
                      style={{
                        padding: '4px 3px',
                        fontWeight: 700,
                        position: 'sticky',
                        right: isRtl ? 0 : 'auto',
                        left: !isRtl ? 0 : 'auto',
                        zIndex: 12,
                        background: 'var(--surface)',
                      }}
                    >
                      {originalIdx + 1}
                    </td>
                    <td
                      style={{
                        padding: 3,
                        position: 'sticky',
                        right: isRtl ? 36 : 'auto',
                        left: !isRtl ? 36 : 'auto',
                        zIndex: 12,
                        background: 'var(--surface)',
                        borderLeft: isRtl ? '2px solid var(--primary, #0ea5e9)' : 'none',
                        borderRight: !isRtl ? '2px solid var(--primary, #0ea5e9)' : 'none',
                        boxShadow: isRtl ? '-3px 0 5px rgba(0,0,0,0.06)' : '3px 0 5px rgba(0,0,0,0.06)',
                      }}
                    >
                      <input
                        type="text"
                        value={r.name || ''}
                        onChange={(e) => updateForm8Row(originalIdx, 'name', e.target.value)}
                        placeholder={t('proforma.form8.namePlaceholder', 'Comrade name')}
                        style={{
                          ...getTableInputStyle(originalIdx, 'name', 130),
                          textAlign: isRtl ? 'right' : 'left',
                          fontWeight: 600,
                        }}
                      />
                    </td>
                    <td style={{ padding: 2 }}>
                      <input
                        type="number"
                        min="0"
                        value={r.distCommMeeting ?? ''}
                        onChange={(e) => updateForm8Row(originalIdx, 'distCommMeeting', e.target.value)}
                        style={getTableInputStyle(originalIdx, 'distCommMeeting')}
                      />
                    </td>
                    <td style={{ padding: 2 }}>
                      <input
                        type="number"
                        min="0"
                        value={r.areaExecMeeting ?? ''}
                        onChange={(e) => updateForm8Row(originalIdx, 'areaExecMeeting', e.target.value)}
                        style={getTableInputStyle(originalIdx, 'areaExecMeeting')}
                      />
                    </td>
                    <td style={{ padding: 2 }}>
                      <input
                        type="number"
                        min="0"
                        value={r.areaCommMeeting ?? ''}
                        onChange={(e) => updateForm8Row(originalIdx, 'areaCommMeeting', e.target.value)}
                        style={getTableInputStyle(originalIdx, 'areaCommMeeting')}
                      />
                    </td>
                    <td style={{ padding: 2 }}>
                      <input
                        type="number"
                        min="0"
                        value={r.ownBuMeeting ?? ''}
                        onChange={(e) => updateForm8Row(originalIdx, 'ownBuMeeting', e.target.value)}
                        style={getTableInputStyle(originalIdx, 'ownBuMeeting')}
                      />
                    </td>
                    <td style={{ padding: 2 }}>
                      <input
                        type="number"
                        min="0"
                        value={r.buExecMeeting ?? ''}
                        onChange={(e) => updateForm8Row(originalIdx, 'buExecMeeting', e.target.value)}
                        style={getTableInputStyle(originalIdx, 'buExecMeeting')}
                      />
                    </td>
                    <td style={{ padding: 2 }}>
                      <input
                        type="number"
                        min="0"
                        value={r.buMeeting ?? ''}
                        onChange={(e) => updateForm8Row(originalIdx, 'buMeeting', e.target.value)}
                        style={getTableInputStyle(originalIdx, 'buMeeting')}
                      />
                    </td>
                    <td style={{ padding: 2 }}>
                      <input
                        type="number"
                        min="0"
                        value={r.psoMeeting ?? ''}
                        onChange={(e) => updateForm8Row(originalIdx, 'psoMeeting', e.target.value)}
                        style={getTableInputStyle(originalIdx, 'psoMeeting')}
                      />
                    </td>
                    <td style={{ padding: 2 }}>
                      <input
                        type="number"
                        min="0"
                        value={r.conferences ?? ''}
                        onChange={(e) => updateForm8Row(originalIdx, 'conferences', e.target.value)}
                        style={getTableInputStyle(originalIdx, 'conferences')}
                      />
                    </td>
                    <td style={{ padding: 2 }}>
                      <input
                        type="number"
                        min="0"
                        value={r.seminars ?? ''}
                        onChange={(e) => updateForm8Row(originalIdx, 'seminars', e.target.value)}
                        style={getTableInputStyle(originalIdx, 'seminars')}
                      />
                    </td>
                    <td style={{ padding: 2 }}>
                      <input
                        type="number"
                        min="0"
                        value={r.studyCircles ?? ''}
                        onChange={(e) => updateForm8Row(originalIdx, 'studyCircles', e.target.value)}
                        style={getTableInputStyle(originalIdx, 'studyCircles')}
                      />
                    </td>
                    <td style={{ padding: 2 }}>
                      <input
                        type="number"
                        min="0"
                        value={r.inductions ?? ''}
                        onChange={(e) => updateForm8Row(originalIdx, 'inductions', e.target.value)}
                        style={getTableInputStyle(originalIdx, 'inductions')}
                      />
                    </td>
                    <td style={{ padding: 2 }}>
                      <input
                        type="number"
                        min="0"
                        value={r.publicGatherings ?? ''}
                        onChange={(e) => updateForm8Row(originalIdx, 'publicGatherings', e.target.value)}
                        style={getTableInputStyle(originalIdx, 'publicGatherings')}
                      />
                    </td>
                    <td style={{ padding: 2, background: '#f0f9ff' }}>
                      <input
                        type="number"
                        readOnly
                        value={r.totalMeetings ?? ''}
                        style={{
                          ...getTableInputStyle(originalIdx, 'totalMeetings'),
                          fontWeight: 700,
                          background: '#e0f2fe',
                          color: '#0284c7',
                        }}
                      />
                    </td>
                    <td style={{ padding: 2 }}>
                      <input
                        type="number"
                        min="0"
                        value={r.monthlyDues ?? ''}
                        onChange={(e) => updateForm8Row(originalIdx, 'monthlyDues', e.target.value)}
                        style={getTableInputStyle(originalIdx, 'monthlyDues')}
                      />
                    </td>
                    <td style={{ padding: 2 }}>
                      <input
                        type="number"
                        min="0"
                        value={r.tours ?? ''}
                        onChange={(e) => updateForm8Row(originalIdx, 'tours', e.target.value)}
                        style={getTableInputStyle(originalIdx, 'tours', 44)}
                      />
                    </td>
                    <td style={{ padding: 2 }}>
                      <input
                        type="number"
                        min="0"
                        value={r.contacts ?? ''}
                        onChange={(e) => updateForm8Row(originalIdx, 'contacts', e.target.value)}
                        style={getTableInputStyle(originalIdx, 'contacts', 48)}
                      />
                    </td>
                    <td style={{ padding: 2 }}>
                      <input
                        type="number"
                        min="0"
                        value={r.officeAttendance ?? ''}
                        onChange={(e) => updateForm8Row(originalIdx, 'officeAttendance', e.target.value)}
                        style={getTableInputStyle(originalIdx, 'officeAttendance', 44)}
                      />
                    </td>
                    <td style={{ padding: 2 }}>
                      <select
                        value={r.activeStatus || 'فعاله'}
                        onChange={(e) => updateForm8Row(originalIdx, 'activeStatus', e.target.value)}
                        style={{
                          fontSize: 11,
                          padding: '3px 4px',
                          borderRadius: 4,
                          fontWeight: 600,
                          border: '1px solid var(--border)',
                          background: (r.activeStatus === 'فعاله' || r.activeStatus === 'Active' || r.activeStatus === 'فعال') ? 'rgba(34, 197, 94, 0.15)' : 'rgba(239, 68, 68, 0.15)',
                          color: (r.activeStatus === 'فعاله' || r.activeStatus === 'Active' || r.activeStatus === 'فعال') ? '#22c55e' : '#ef4444',
                        }}
                      >
                        <option value="فعاله">{t('proforma.form8.activeOption', 'Active')}</option>
                        <option value="غير فعاله">{t('proforma.form8.inactiveOption', 'Inactive')}</option>
                      </select>
                    </td>
                    <td style={{ padding: 2 }}>
                      <input
                        type="text"
                        value={r.ideologicalReading || ''}
                        onChange={(e) => updateForm8Row(originalIdx, 'ideologicalReading', e.target.value)}
                        placeholder={t('proforma.form8.readingPlaceholder', 'Book/topic')}
                        style={{
                          ...getTableInputStyle(originalIdx, 'ideologicalReading', 85),
                          textAlign: isRtl ? 'right' : 'left',
                        }}
                      />
                    </td>
                    <td style={{ padding: 2 }}>
                      <input
                        type="text"
                        value={r.bloodBank || ''}
                        onChange={(e) => updateForm8Row(originalIdx, 'bloodBank', e.target.value)}
                        placeholder={t('proforma.form8.bloodPlaceholder', 'Amount')}
                        style={getTableInputStyle(originalIdx, 'bloodBank', 52)}
                      />
                    </td>
                    <td style={{ padding: 2 }}>
                      <button
                        type="button"
                        onClick={() => removeForm8Row(originalIdx)}
                        style={{
                          background: 'none',
                          border: 'none',
                          cursor: 'pointer',
                          color: '#ef4444',
                          fontSize: 13,
                        }}
                        title={t('proforma.form8.removeComrade', 'Remove Comrade')}
                      >
                        🗑️
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot
                style={{
                  position: 'sticky',
                  bottom: 0,
                  zIndex: 20,
                  background: 'var(--surface-alt)',
                  fontWeight: 700,
                  fontSize: 11,
                  boxShadow: '0 -2px 4px rgba(0,0,0,0.06)',
                }}
              >
                <tr style={{ background: '#f8fafc', borderTop: '2px solid var(--border)' }}>
                  <td
                    colSpan={2}
                    style={{
                      padding: 6,
                      textAlign: 'center',
                      fontWeight: 'bold',
                      position: 'sticky',
                      right: isRtl ? 0 : 'auto',
                      left: !isRtl ? 0 : 'auto',
                      zIndex: 23,
                      background: '#f8fafc',
                      borderLeft: isRtl ? '2px solid var(--primary, #0ea5e9)' : 'none',
                      borderRight: !isRtl ? '2px solid var(--primary, #0ea5e9)' : 'none',
                      boxShadow: isRtl ? '-3px 0 5px rgba(0,0,0,0.06)' : '3px 0 5px rgba(0,0,0,0.06)',
                    }}
                  >
                    {t('proforma.form8.totalSummary', 'Total / Summary')}
                  </td>
                  <td style={{ padding: 3 }}>{totals.distCommMeeting}</td>
                  <td style={{ padding: 3 }}>{totals.areaExecMeeting}</td>
                  <td style={{ padding: 3 }}>{totals.areaCommMeeting}</td>
                  <td style={{ padding: 3 }}>{totals.ownBuMeeting}</td>
                  <td style={{ padding: 3 }}>{totals.buExecMeeting}</td>
                  <td style={{ padding: 3 }}>{totals.buMeeting}</td>
                  <td style={{ padding: 3 }}>{totals.psoMeeting}</td>
                  <td style={{ padding: 3 }}>{totals.conferences}</td>
                  <td style={{ padding: 3 }}>{totals.seminars}</td>
                  <td style={{ padding: 3 }}>{totals.studyCircles}</td>
                  <td style={{ padding: 3 }}>{totals.inductions}</td>
                  <td style={{ padding: 3 }}>{totals.publicGatherings}</td>
                  <td style={{ padding: 3, background: '#e0f2fe', color: '#0284c7' }}>{totals.totalMeetings}</td>
                  <td style={{ padding: 3 }}>{totals.monthlyDues.toLocaleString()}</td>
                  <td style={{ padding: 3 }}>{totals.tours}</td>
                  <td style={{ padding: 3 }}>{totals.contacts}</td>
                  <td style={{ padding: 3 }}>{totals.officeAttendance}</td>
                  <td style={{ padding: 3, color: '#22c55e' }}>{totals.activeCount} {t('proforma.form8.activeOption', 'Active')}</td>
                  <td style={{ padding: 3 }}>—</td>
                  <td style={{ padding: 3 }}>{totals.bloodBank}</td>
                  <td style={{ padding: 3 }}>—</td>
                </tr>
              </tfoot>
            </table>
          </div>
        </div>
      )}

      {/* ────────────────────────────────────────────────────────────────────────── */}
      {/* 6. OFFICIAL DISTRICT LEADERSHIP SIGNATURES BLOCK */}
      {/* ────────────────────────────────────────────────────────────────────────── */}
      <div className="card" style={{ padding: 18, marginTop: 10 }}>
        <div style={{ marginBottom: 14 }}>
          <h4 style={{ margin: '0 0 6px', color: 'var(--primary, #38bdf8)', display: 'flex', alignItems: 'center', gap: 8, fontSize: 15 }}>
            <span>✍️</span>
            <span>{t('proforma.form8.signaturesTitle', 'Official District Leadership Signatures')}</span>
          </h4>
          <p style={{ margin: 0, fontSize: 12, color: 'var(--text-soft)', lineHeight: 1.5 }}>
            {t(
              'proforma.form8.signaturesDesc',
              'Official party proformas require authorization by the District President and District General Secretary. When filled, these digital signatures and signing date will appear directly on the official printed A4 report, PDF export, and archival records.'
            )}
          </p>
        </div>

        <div className="form8-signatures-grid">
          <div style={{ padding: 12, background: 'var(--surface-alt)', borderRadius: 8, border: '1px solid var(--border)' }}>
            <label style={{ display: 'block', fontWeight: 700, fontSize: 13, marginBottom: 8, color: 'var(--text-main)' }}>
              ✍️ {t('proforma.form8.distPresidentSignature', 'District President Signature')}
            </label>
            <input
              type="text"
              value={formData.distPresidentSignature || ''}
              onChange={(e) => updateField('distPresidentSignature', e.target.value)}
              placeholder={t('proforma.form8.signaturePlaceholder', 'Name / Digital signature')}
              style={{ width: '100%', padding: '8px 12px', fontSize: 13, borderRadius: 6, fontWeight: 600, boxSizing: 'border-box' }}
            />
          </div>

          <div style={{ padding: 12, background: 'var(--surface-alt)', borderRadius: 8, border: '1px solid var(--border)' }}>
            <label style={{ display: 'block', fontWeight: 700, fontSize: 13, marginBottom: 8, color: 'var(--text-main)' }}>
              ✍️ {t('proforma.form8.distSecSignature', 'District General Secretary Signature')}
            </label>
            <input
              type="text"
              value={formData.distSecSignature || ''}
              onChange={(e) => updateField('distSecSignature', e.target.value)}
              placeholder={t('proforma.form8.signaturePlaceholder', 'Name / Digital signature')}
              style={{ width: '100%', padding: '8px 12px', fontSize: 13, borderRadius: 6, fontWeight: 600, boxSizing: 'border-box' }}
            />
          </div>

          <div style={{ padding: 12, background: 'var(--surface-alt)', borderRadius: 8, border: '1px solid var(--border)' }}>
            <label style={{ display: 'block', fontWeight: 700, fontSize: 13, marginBottom: 8, color: 'var(--text-main)' }}>
              📅 {t('proforma.form8.signatureDate', 'Date of Signature')}
            </label>
            <input
              type="date"
              value={formData.signatureDate || formData.distSignatureDate || ''}
              onChange={(e) => {
                updateField('signatureDate', e.target.value);
                updateField('distSignatureDate', e.target.value);
              }}
              style={{ width: '100%', padding: '8px 12px', fontSize: 13, borderRadius: 6, fontWeight: 600, boxSizing: 'border-box' }}
            />
          </div>
        </div>
      </div>
    </div>
  );
}
