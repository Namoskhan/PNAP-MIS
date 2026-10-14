import React, { useMemo } from 'react';

/**
 * Form7Workspace:
 * District Subordinate Area Units Monthly Work & Activity Report
 * (ضلع کښي علاقائي يونټانو د کار او فعاليت مياشتنئي رپورټ)
 *
 * Implements full 14-group, 45-column interactive editing with:
 * - Dynamic bilingual localization (English, Pashto, Urdu)
 * - Visual validation highlighting with tooltips & inline error indicators
 * - One-click Auto-Fix for attendance / meeting ratio mismatches
 * - Dual view modes: Interactive Cards View & Official 45-column Table View
 * - Auto-calculation of meeting percentages and summary totals
 * - Subordinate Area Unit row addition/removal/filtering
 * - Official district leadership signature blocks
 */
export default function Form7Workspace({
  formData = {},
  rows = [],
  form7ViewMode = 'cards',
  setForm7ViewMode,
  form7Search = '',
  setForm7Search,
  updateForm7Row,
  addForm7Row,
  removeForm7Row,
  handleAutoCalcAllForm7Rows,
  handleAutoFixForm7Inconsistencies,
  form7Validation = { isValid: true, errors: [], rowErrors: {} },
  isRtl = true,
  t,
  updateField,
}) {
  // Filtered rows for search
  const filteredRows = useMemo(() => {
    return rows
      .map((r, originalIdx) => ({ r, originalIdx }))
      .filter(({ r }) => !form7Search || (r.unitName || '').toLowerCase().includes(form7Search.toLowerCase()));
  }, [rows, form7Search]);

  // Aggregate calculations for KPI and Table Footer
  const totals = useMemo(() => {
    const sum = (field) => rows.reduce((acc, r) => acc + (parseInt(r[field], 10) || 0), 0);

    const execMeetings = sum('execMeetings');
    const execHeld = sum('execHeld');
    const execPct = execMeetings > 0 ? `${Math.min(100, Math.round((execHeld / execMeetings) * 100))}%` : '0%';

    const commMeetings = sum('commMeetings');
    const commHeld = sum('commHeld');
    const commPct = commMeetings > 0 ? `${Math.min(100, Math.round((commHeld / commMeetings) * 100))}%` : '0%';

    const buExecMeetingsTotal = sum('buExecMeetingsTotal');
    const buExecMeetingsHeld = sum('buExecMeetingsHeld');
    const buExecPct = buExecMeetingsTotal > 0 ? `${Math.min(100, Math.round((buExecMeetingsHeld / buExecMeetingsTotal) * 100))}%` : '0%';

    const buGbMeetingsTotal = sum('buGbMeetingsTotal');
    const buGbMeetingsHeld = sum('buGbMeetingsHeld');
    const buGbPct = buGbMeetingsTotal > 0 ? `${Math.min(100, Math.round((buGbMeetingsHeld / buGbMeetingsTotal) * 100))}%` : '0%';

    const membershipTotal = sum('membershipTotal');
    const membershipPresent = sum('membershipPresent');
    const membershipPct = membershipTotal > 0 ? `${Math.min(100, Math.round((membershipPresent / membershipTotal) * 100))}%` : '0%';

    const studyUnitsComm = sum('studyUnitsComm');
    const studyUnitsCount = sum('studyUnitsCount');
    const studyPct = studyUnitsComm > 0 ? `${Math.min(100, Math.round((studyUnitsCount / studyUnitsComm) * 100))}%` : '0%';

    const duesMonthly = sum('duesMonthly');
    const duesOrg = sum('duesOrg');
    const duesEmergency = sum('duesEmergency');
    const totalDues = duesMonthly + duesOrg + duesEmergency;

    const activeOffices = rows.filter((r) => r.officeActivity !== 'غير فعاله').length;

    return {
      unitsCount: rows.length,
      activeOffices,
      execMeetings,
      execTotalMembers: sum('execTotalMembers'),
      execPresent: sum('execPresent'),
      execHeld,
      execPct,
      commMeetings,
      commTotalMembers: sum('commTotalMembers'),
      commPresent: sum('commPresent'),
      commHeld,
      commPct,
      buCount: sum('buCount'),
      newBuCount: sum('newBuCount'),
      buExecUnitsTotal: sum('buExecUnitsTotal'),
      buExecUnitsPresent: sum('buExecUnitsPresent'),
      buExecMeetingsTotal,
      buExecMeetingsHeld,
      buExecPct,
      buGbMeetingsTotal,
      buGbMeetingsHeld,
      buGbPct,
      inactiveBuCount: sum('inactiveBuCount'),
      membershipTotal,
      membershipPresent,
      membershipPct,
      studyAreaComm: sum('studyAreaComm'),
      studyUnitsComm,
      studyUnitsCount,
      studyPct,
      programsCount: sum('programsCount'),
      inductionPrograms: sum('inductionPrograms'),
      newInductions: sum('newInductions'),
      psoUnitsCount: sum('psoUnitsCount'),
      ralliesCount: sum('ralliesCount'),
      jirgasCount: sum('jirgasCount'),
      unitGatherings: sum('unitGatherings'),
      villagesWithoutUnit: sum('villagesWithoutUnit'),
      duesMonthly,
      duesOrg,
      duesEmergency,
      totalDues,
      bloodPosts: sum('bloodPosts'),
      bloodCash: sum('bloodCash'),
      bloodZakat: sum('bloodZakat'),
    };
  }, [rows]);

  // Validation helpers
  const getFieldError = (idx, field) => {
    return form7Validation?.rowErrors?.[idx]?.[field] || null;
  };

  const getRowErrorCount = (idx) => {
    return Object.keys(form7Validation?.rowErrors?.[idx] || {}).length;
  };

  const getCardInputStyle = (idx, field) => {
    const isErr = Boolean(getFieldError(idx, field));
    return {
      width: '100%',
      padding: '5px 7px',
      fontSize: 12,
      borderRadius: 5,
      border: isErr ? '1.5px solid #ef4444' : '1px solid var(--border)',
      background: isErr ? 'rgba(239, 68, 68, 0.08)' : 'var(--surface-alt)',
      color: isErr ? '#ef4444' : 'inherit',
      fontWeight: isErr ? 700 : 500,
      transition: 'border-color 0.2s, background 0.2s',
    };
  };

  const getTableInputStyle = (idx, field, customWidth = 48) => {
    const isErr = Boolean(getFieldError(idx, field));
    return {
      width: customWidth,
      textAlign: 'center',
      padding: '3px 2px',
      fontSize: 11,
      borderRadius: 4,
      border: isErr ? '1.5px solid #ef4444' : '1px solid var(--border)',
      background: isErr ? 'rgba(239, 68, 68, 0.1)' : 'var(--surface-alt)',
      color: isErr ? '#ef4444' : 'inherit',
      fontWeight: isErr ? 700 : 500,
    };
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      {/* ────────────────────────────────────────────────────────────────────────── */}
      {/* 1. KPI SUMMARY CARDS */}
      {/* ────────────────────────────────────────────────────────────────────────── */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 12 }}>
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
            {t('proforma.form7.kpiTotalAreas', 'Total Area Units')}
          </div>
          <div style={{ fontSize: 22, fontWeight: 'bold', marginTop: 4, display: 'flex', alignItems: 'center', gap: 8 }}>
            <span>🏢 {totals.unitsCount}</span>
            <span style={{ fontSize: 11, padding: '2px 6px', borderRadius: 4, background: 'rgba(34, 197, 94, 0.15)', color: '#22c55e', fontWeight: 600 }}>
              {totals.activeOffices} {t('proforma.form7.lblActive', 'فعاله (Active)')}
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
            {t('proforma.form7.kpiExecHeld', 'Exec Mtgs Held')}
          </div>
          <div style={{ fontSize: 22, fontWeight: 'bold', marginTop: 4 }}>
            🤝 {totals.execHeld}
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
            {t('proforma.form7.kpiCommHeld', 'Committee Mtgs Held')}
          </div>
          <div style={{ fontSize: 22, fontWeight: 'bold', marginTop: 4 }}>
            🏛️ {totals.commHeld}
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
            {t('proforma.form7.kpiBasicUnits', 'Subordinate Basic Units')}
          </div>
          <div style={{ fontSize: 22, fontWeight: 'bold', marginTop: 4 }}>
            👥 {totals.buCount}
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
            {t('proforma.form7.kpiTotalDues', 'Total Dues Collected')}
          </div>
          <div style={{ fontSize: 20, fontWeight: 'bold', marginTop: 4, color: '#10b981' }}>
            PKR {totals.totalDues.toLocaleString()}
          </div>
        </div>
      </div>

      {/* ────────────────────────────────────────────────────────────────────────── */}
      {/* 2. VALIDATION ALERT BANNER WITH ONE-CLICK AUTO-FIX */}
      {/* ────────────────────────────────────────────────────────────────────────── */}
      {!form7Validation.isValid && (
        <div
          style={{
            padding: '12px 16px',
            borderRadius: 8,
            background: 'rgba(239, 68, 68, 0.12)',
            border: '1.5px solid #ef4444',
            color: '#ef4444',
            fontSize: 13,
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            flexWrap: 'wrap',
            gap: 12,
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <span style={{ fontSize: 22 }}>⚠️</span>
            <div>
              <div style={{ fontWeight: 700, fontSize: 14 }}>
                {t('proforma.form7.validation.issuesFound', `Found ${form7Validation.errors.length} accuracy/validation issue(s) in Form 7`, { count: form7Validation.errors.length })}
              </div>
              <div style={{ fontSize: 12, opacity: 0.95, marginTop: 3 }}>
                {form7Validation.errors[0]}
                {form7Validation.errors.length > 1 && ` (+${form7Validation.errors.length - 1} more)`}
              </div>
            </div>
          </div>

          {handleAutoFixForm7Inconsistencies && (
            <button
              type="button"
              onClick={handleAutoFixForm7Inconsistencies}
              className="btn"
              style={{
                padding: '6px 14px',
                fontSize: 12,
                fontWeight: 700,
                background: '#ef4444',
                borderColor: '#ef4444',
                color: '#fff',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: 6,
                boxShadow: '0 2px 4px rgba(239, 68, 68, 0.3)',
              }}
              title="Automatically bounds present counts to total members and held meetings to scheduled meetings"
            >
              <span>⚡</span>
              <span>{t('proforma.form7.autoFixAll', 'Auto-Correct Mismatches')}</span>
            </button>
          )}
        </div>
      )}

      {/* ────────────────────────────────────────────────────────────────────────── */}
      {/* 3. CONTROLS TOOLBAR */}
      {/* ────────────────────────────────────────────────────────────────────────── */}
      <div className="card" style={{ padding: '12px 16px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 12 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
          <div style={{ display: 'flex', borderRadius: 8, overflow: 'hidden', border: '1px solid var(--border)' }}>
            <button
              type="button"
              onClick={() => setForm7ViewMode('cards')}
              style={{
                padding: '7px 14px',
                fontSize: 13,
                fontWeight: 600,
                border: 'none',
                background: form7ViewMode === 'cards' ? '#0284c7' : 'var(--surface-alt)',
                color: form7ViewMode === 'cards' ? '#fff' : 'inherit',
                cursor: 'pointer',
              }}
            >
              🗂️ {t('proforma.form7.viewCards', 'Cards View')}
            </button>
            <button
              type="button"
              onClick={() => setForm7ViewMode('table')}
              style={{
                padding: '7px 14px',
                fontSize: 13,
                fontWeight: 600,
                border: 'none',
                background: form7ViewMode === 'table' ? '#0284c7' : 'var(--surface-alt)',
                color: form7ViewMode === 'table' ? '#fff' : 'inherit',
                cursor: 'pointer',
              }}
            >
              📊 {t('proforma.form7.viewTable', 'Official Table View (45 Columns)')}
            </button>
          </div>

          <div style={{ position: 'relative' }}>
            <input
              type="text"
              value={form7Search}
              onChange={(e) => setForm7Search(e.target.value)}
              placeholder={t('proforma.form7.searchArea', 'Search Area Unit by name...')}
              style={{
                padding: '7px 12px',
                fontSize: 13,
                minWidth: 240,
                borderRadius: 6,
                border: '1px solid var(--border)',
                background: 'var(--surface-alt)',
              }}
            />
            {form7Search && (
              <button
                type="button"
                onClick={() => setForm7Search('')}
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
          {handleAutoFixForm7Inconsistencies && (
            <button
              type="button"
              onClick={handleAutoFixForm7Inconsistencies}
              className="btn secondary"
              style={{ fontSize: 12, padding: '7px 12px', borderColor: '#ef4444', color: '#ef4444', fontWeight: 600 }}
              title="Automatically bounds present counts to total members and balances attendance ratios"
            >
              ⚡ {t('proforma.form7.autoFixAll', 'Auto-Correct Mismatches')}
            </button>
          )}

          <button
            type="button"
            onClick={handleAutoCalcAllForm7Rows}
            className="btn secondary"
            style={{ fontSize: 12, padding: '7px 12px', borderColor: '#0284c7', color: '#38bdf8', fontWeight: 600 }}
            title="Auto-calculates percentages for meetings and study circles across all Area units"
          >
            ⚡ {t('proforma.form7.autoCalcAll', 'Auto-Calculate All')}
          </button>

          <button
            type="button"
            onClick={addForm7Row}
            className="btn"
            style={{ fontSize: 13, padding: '7px 14px', background: '#0284c7', borderColor: '#0284c7', fontWeight: 600 }}
          >
            ➕ {t('proforma.form7.addArea', '+ Add Area Unit')}
          </button>
        </div>
      </div>

      {/* ────────────────────────────────────────────────────────────────────────── */}
      {/* 4. CARDS VIEW */}
      {/* ────────────────────────────────────────────────────────────────────────── */}
      {form7ViewMode === 'cards' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          {filteredRows.map(({ r, originalIdx: idx }) => {
            const rowErrCount = getRowErrorCount(idx);

            return (
              <div
                key={r.unitId || idx}
                className="card"
                style={{
                  padding: 16,
                  border: rowErrCount > 0 ? '1.5px solid #ef4444' : '1px solid var(--border)',
                  background: 'var(--surface)',
                  borderRadius: 10,
                  boxShadow: rowErrCount > 0 ? '0 0 8px rgba(239, 68, 68, 0.15)' : 'none',
                }}
              >
                {/* Card Header */}
                <div
                  style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    flexWrap: 'wrap',
                    gap: 12,
                    paddingBottom: 12,
                    borderBottom: '1px solid var(--border)',
                    marginBottom: 14,
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                    <span
                      style={{
                        background: rowErrCount > 0 ? '#ef4444' : '#0284c7',
                        color: '#fff',
                        borderRadius: '50%',
                        width: 28,
                        height: 28,
                        display: 'inline-flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        fontWeight: 700,
                        fontSize: 13,
                      }}
                    >
                      {idx + 1}
                    </span>
                    <div>
                      <input
                        type="text"
                        value={r.unitName || ''}
                        onChange={(e) => updateForm7Row(idx, 'unitName', e.target.value)}
                        placeholder={t('proforma.form7.areaName', 'Area Unit Name (علاقائي يونټ نوم)')}
                        style={{
                          fontWeight: 700,
                          fontSize: 15,
                          padding: '5px 10px',
                          borderRadius: 6,
                          minWidth: 220,
                          border: getFieldError(idx, 'unitName') ? '1.5px solid #ef4444' : '1px solid var(--border)',
                          background: getFieldError(idx, 'unitName') ? 'rgba(239, 68, 68, 0.08)' : 'var(--surface-alt)',
                        }}
                      />
                      {getFieldError(idx, 'unitName') && (
                        <div style={{ color: '#ef4444', fontSize: 11, marginTop: 2, fontWeight: 600 }}>
                          ⚠️ {getFieldError(idx, 'unitName')}
                        </div>
                      )}
                    </div>
                    {rowErrCount > 0 && (
                      <span style={{ fontSize: 11, padding: '3px 8px', borderRadius: 12, background: 'rgba(239, 68, 68, 0.15)', color: '#ef4444', fontWeight: 700, border: '1px solid #ef4444' }}>
                        ⚠️ {rowErrCount} {t('proforma.issues', 'issue(s)')}
                      </span>
                    )}
                  </div>

                  <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                      <label style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-soft)' }}>
                        {t('proforma.form7.officeActivityLabel', 'Area Office Activity')}:
                      </label>
                      <select
                        value={r.officeActivity || 'فعاله'}
                        onChange={(e) => updateForm7Row(idx, 'officeActivity', e.target.value)}
                        style={{
                          padding: '4px 8px',
                          fontSize: 12,
                          fontWeight: 600,
                          borderRadius: 6,
                          background: r.officeActivity === 'غير فعاله' ? 'rgba(239, 68, 68, 0.15)' : 'rgba(34, 197, 94, 0.15)',
                          color: r.officeActivity === 'غير فعاله' ? '#ef4444' : '#22c55e',
                          border: '1px solid var(--border)',
                        }}
                      >
                        <option value="فعاله">{t('proforma.form7.lblActive', 'فعاله (Active)')}</option>
                        <option value="غير فعاله">{t('proforma.form7.lblInactive', 'غير فعاله (Inactive)')}</option>
                      </select>
                    </div>

                    <button
                      type="button"
                      onClick={() => removeForm7Row(idx)}
                      className="btn secondary"
                      style={{ padding: '4px 10px', color: '#ef4444', borderColor: '#ef4444', fontSize: 12 }}
                      title={t('proforma.form7.removeArea', 'Remove this Area Unit')}
                    >
                      🗑️
                    </button>
                  </div>
                </div>

                {/* 8 Structured Sections Grid */}
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: 12 }}>
                  {/* 1. Executive Meetings */}
                  <div style={{ background: 'var(--surface-alt)', padding: 12, borderRadius: 8, border: '1px solid rgba(2, 132, 199, 0.2)' }}>
                    <div style={{ fontWeight: 700, fontSize: 12, color: '#0284c7', marginBottom: 8, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <span>🤝 {t('proforma.form7.secExecMeetings', 'Executive Meetings (ايګزيکټيو غونډي)')}</span>
                      <span style={{ background: '#0284c7', color: '#fff', padding: '1px 6px', borderRadius: 4, fontSize: 11, fontWeight: 700 }}>
                        {r.execPct || '0%'}
                      </span>
                    </div>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6, fontSize: 11 }}>
                      <div>
                        <label style={{ display: 'block', color: 'var(--text-soft)' }}>{t('proforma.form7.lblMeetings', 'غونډي (Meetings)')}</label>
                        <input type="number" min="0" value={r.execMeetings ?? ''} onChange={(e) => updateForm7Row(idx, 'execMeetings', e.target.value)} style={getCardInputStyle(idx, 'execMeetings')} title={getFieldError(idx, 'execMeetings')} />
                      </div>
                      <div>
                        <label style={{ display: 'block', color: 'var(--text-soft)' }}>{t('proforma.form7.lblTotal', 'ټول شمير (Total)')}</label>
                        <input type="number" min="0" value={r.execTotalMembers ?? ''} onChange={(e) => updateForm7Row(idx, 'execTotalMembers', e.target.value)} style={getCardInputStyle(idx, 'execTotalMembers')} title={getFieldError(idx, 'execTotalMembers')} />
                      </div>
                      <div>
                        <label style={{ display: 'block', color: getFieldError(idx, 'execPresent') ? '#ef4444' : 'var(--text-soft)' }}>{t('proforma.form7.lblPresent', 'حاضر ملګري (Present)')}</label>
                        <input type="number" min="0" value={r.execPresent ?? ''} onChange={(e) => updateForm7Row(idx, 'execPresent', e.target.value)} style={getCardInputStyle(idx, 'execPresent')} title={getFieldError(idx, 'execPresent')} />
                        {getFieldError(idx, 'execPresent') && <span style={{ color: '#ef4444', fontSize: 10, display: 'block' }}>⚠️ Exceeds total</span>}
                      </div>
                      <div>
                        <label style={{ display: 'block', color: getFieldError(idx, 'execHeld') ? '#ef4444' : 'var(--text-soft)' }}>{t('proforma.form7.lblHeld', 'حاضر غونډو (Held)')}</label>
                        <input type="number" min="0" value={r.execHeld ?? ''} onChange={(e) => updateForm7Row(idx, 'execHeld', e.target.value)} style={getCardInputStyle(idx, 'execHeld')} title={getFieldError(idx, 'execHeld')} />
                        {getFieldError(idx, 'execHeld') && <span style={{ color: '#ef4444', fontSize: 10, display: 'block' }}>⚠️ Exceeds mtgs</span>}
                      </div>
                    </div>
                  </div>

                  {/* 2. Committee Meetings */}
                  <div style={{ background: 'var(--surface-alt)', padding: 12, borderRadius: 8, border: '1px solid rgba(99, 102, 241, 0.2)' }}>
                    <div style={{ fontWeight: 700, fontSize: 12, color: '#6366f1', marginBottom: 8, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <span>🏛️ {t('proforma.form7.secCommMeetings', 'Committee Meetings (کميټي غونډي)')}</span>
                      <span style={{ background: '#6366f1', color: '#fff', padding: '1px 6px', borderRadius: 4, fontSize: 11, fontWeight: 700 }}>
                        {r.commPct || '0%'}
                      </span>
                    </div>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6, fontSize: 11 }}>
                      <div>
                        <label style={{ display: 'block', color: 'var(--text-soft)' }}>{t('proforma.form7.lblMeetings', 'غونډي (Meetings)')}</label>
                        <input type="number" min="0" value={r.commMeetings ?? ''} onChange={(e) => updateForm7Row(idx, 'commMeetings', e.target.value)} style={getCardInputStyle(idx, 'commMeetings')} title={getFieldError(idx, 'commMeetings')} />
                      </div>
                      <div>
                        <label style={{ display: 'block', color: 'var(--text-soft)' }}>{t('proforma.form7.lblTotalMembers', 'غړو شمير (Total)')}</label>
                        <input type="number" min="0" value={r.commTotalMembers ?? ''} onChange={(e) => updateForm7Row(idx, 'commTotalMembers', e.target.value)} style={getCardInputStyle(idx, 'commTotalMembers')} title={getFieldError(idx, 'commTotalMembers')} />
                      </div>
                      <div>
                        <label style={{ display: 'block', color: getFieldError(idx, 'commPresent') ? '#ef4444' : 'var(--text-soft)' }}>{t('proforma.form7.lblPresent', 'حاضر ملګري (Present)')}</label>
                        <input type="number" min="0" value={r.commPresent ?? ''} onChange={(e) => updateForm7Row(idx, 'commPresent', e.target.value)} style={getCardInputStyle(idx, 'commPresent')} title={getFieldError(idx, 'commPresent')} />
                        {getFieldError(idx, 'commPresent') && <span style={{ color: '#ef4444', fontSize: 10, display: 'block' }}>⚠️ Exceeds total</span>}
                      </div>
                      <div>
                        <label style={{ display: 'block', color: getFieldError(idx, 'commHeld') ? '#ef4444' : 'var(--text-soft)' }}>{t('proforma.form7.lblHeld', 'حاضر غونډو (Held)')}</label>
                        <input type="number" min="0" value={r.commHeld ?? ''} onChange={(e) => updateForm7Row(idx, 'commHeld', e.target.value)} style={getCardInputStyle(idx, 'commHeld')} title={getFieldError(idx, 'commHeld')} />
                        {getFieldError(idx, 'commHeld') && <span style={{ color: '#ef4444', fontSize: 10, display: 'block' }}>⚠️ Exceeds mtgs</span>}
                      </div>
                    </div>
                  </div>

                  {/* 3. Basic Units Count */}
                  <div style={{ background: 'var(--surface-alt)', padding: 12, borderRadius: 8, border: '1px solid rgba(16, 185, 129, 0.2)' }}>
                    <div style={{ fontWeight: 700, fontSize: 12, color: '#10b981', marginBottom: 8 }}>
                      🏢 {t('proforma.form7.secBasicUnits', 'Basic Units Count (ابتدائي يونټانو شمير)')}
                    </div>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 6, fontSize: 11 }}>
                      <div>
                        <label style={{ display: 'block', color: 'var(--text-soft)' }}>{t('proforma.form7.lblTotal', 'شمير (Total)')}</label>
                        <input type="number" min="0" value={r.buCount ?? ''} onChange={(e) => updateForm7Row(idx, 'buCount', e.target.value)} style={getCardInputStyle(idx, 'buCount')} title={getFieldError(idx, 'buCount')} />
                      </div>
                      <div>
                        <label style={{ display: 'block', color: getFieldError(idx, 'newBuCount') ? '#ef4444' : 'var(--text-soft)' }}>{t('proforma.form7.lblNew', 'نوي (New)')}</label>
                        <input type="number" min="0" value={r.newBuCount ?? ''} onChange={(e) => updateForm7Row(idx, 'newBuCount', e.target.value)} style={getCardInputStyle(idx, 'newBuCount')} title={getFieldError(idx, 'newBuCount')} />
                        {getFieldError(idx, 'newBuCount') && <span style={{ color: '#ef4444', fontSize: 10, display: 'block' }}>⚠️ Exceeds total</span>}
                      </div>
                      <div>
                        <label style={{ display: 'block', color: getFieldError(idx, 'inactiveBuCount') ? '#ef4444' : '#ef4444' }}>{t('proforma.form7.lblInactive', 'غير فعاله (Inactive)')}</label>
                        <input type="number" min="0" value={r.inactiveBuCount ?? ''} onChange={(e) => updateForm7Row(idx, 'inactiveBuCount', e.target.value)} style={getCardInputStyle(idx, 'inactiveBuCount')} title={getFieldError(idx, 'inactiveBuCount')} />
                        {getFieldError(idx, 'inactiveBuCount') && <span style={{ color: '#ef4444', fontSize: 10, display: 'block' }}>⚠️ Exceeds total</span>}
                      </div>
                    </div>
                  </div>

                  {/* 4. Basic Units Executive & GB Meetings */}
                  <div style={{ background: 'var(--surface-alt)', padding: 12, borderRadius: 8, border: '1px solid rgba(20, 184, 166, 0.2)' }}>
                    <div style={{ fontWeight: 700, fontSize: 12, color: '#14b8a6', marginBottom: 8, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <span>👥 {t('proforma.form7.secBuExec', 'Basic Units Exec & GB (ابتدائي يونټانو ايګزيکټيو او GB)')}</span>
                      <span style={{ fontSize: 11, color: 'var(--text-soft)', fontWeight: 600 }}>
                        Exec: {r.buExecPct || '0%'} | GB: {r.buGbPct || '0%'}
                      </span>
                    </div>
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 6, fontSize: 11 }}>
                      <div>
                        <label style={{ display: 'block', color: 'var(--text-soft)' }}>{t('proforma.form7.lblBuExecTotalMembers', 'ايګزيکټيو غړو')}</label>
                        <input type="number" min="0" value={r.buExecUnitsTotal ?? ''} onChange={(e) => updateForm7Row(idx, 'buExecUnitsTotal', e.target.value)} style={getCardInputStyle(idx, 'buExecUnitsTotal')} title={getFieldError(idx, 'buExecUnitsTotal')} />
                      </div>
                      <div>
                        <label style={{ display: 'block', color: getFieldError(idx, 'buExecUnitsPresent') ? '#ef4444' : 'var(--text-soft)' }}>{t('proforma.form7.lblBuExecPresentMembers', 'حاضر غړو')}</label>
                        <input type="number" min="0" value={r.buExecUnitsPresent ?? ''} onChange={(e) => updateForm7Row(idx, 'buExecUnitsPresent', e.target.value)} style={getCardInputStyle(idx, 'buExecUnitsPresent')} title={getFieldError(idx, 'buExecUnitsPresent')} />
                        {getFieldError(idx, 'buExecUnitsPresent') && <span style={{ color: '#ef4444', fontSize: 10, display: 'block' }}>⚠️ Exceeds total</span>}
                      </div>
                      <div>
                        <label style={{ display: 'block', color: 'var(--text-soft)' }}>{t('proforma.form7.lblBuExecMeetingsTotal', 'ايګزيکټيو غونډو')}</label>
                        <input type="number" min="0" value={r.buExecMeetingsTotal ?? ''} onChange={(e) => updateForm7Row(idx, 'buExecMeetingsTotal', e.target.value)} style={getCardInputStyle(idx, 'buExecMeetingsTotal')} title={getFieldError(idx, 'buExecMeetingsTotal')} />
                      </div>
                      <div>
                        <label style={{ display: 'block', color: getFieldError(idx, 'buExecMeetingsHeld') ? '#ef4444' : 'var(--text-soft)' }}>{t('proforma.form7.lblBuExecMeetingsHeld', 'حاضر غونډو')}</label>
                        <input type="number" min="0" value={r.buExecMeetingsHeld ?? ''} onChange={(e) => updateForm7Row(idx, 'buExecMeetingsHeld', e.target.value)} style={getCardInputStyle(idx, 'buExecMeetingsHeld')} title={getFieldError(idx, 'buExecMeetingsHeld')} />
                        {getFieldError(idx, 'buExecMeetingsHeld') && <span style={{ color: '#ef4444', fontSize: 10, display: 'block' }}>⚠️ Exceeds total</span>}
                      </div>
                      <div>
                        <label style={{ display: 'block', color: 'var(--text-soft)' }}>{t('proforma.form7.lblBuGbMeetingsTotal', 'GB غونډو (ټول)')}</label>
                        <input type="number" min="0" value={r.buGbMeetingsTotal ?? ''} onChange={(e) => updateForm7Row(idx, 'buGbMeetingsTotal', e.target.value)} style={getCardInputStyle(idx, 'buGbMeetingsTotal')} title={getFieldError(idx, 'buGbMeetingsTotal')} />
                      </div>
                      <div>
                        <label style={{ display: 'block', color: getFieldError(idx, 'buGbMeetingsHeld') ? '#ef4444' : 'var(--text-soft)' }}>{t('proforma.form7.lblBuGbMeetingsHeld', 'GB حاضر غونډو')}</label>
                        <input type="number" min="0" value={r.buGbMeetingsHeld ?? ''} onChange={(e) => updateForm7Row(idx, 'buGbMeetingsHeld', e.target.value)} style={getCardInputStyle(idx, 'buGbMeetingsHeld')} title={getFieldError(idx, 'buGbMeetingsHeld')} />
                        {getFieldError(idx, 'buGbMeetingsHeld') && <span style={{ color: '#ef4444', fontSize: 10, display: 'block' }}>⚠️ Exceeds total</span>}
                      </div>
                    </div>
                  </div>

                  {/* 5. Membership & Ideological Study */}
                  <div style={{ background: 'var(--surface-alt)', padding: 12, borderRadius: 8, border: '1px solid rgba(245, 158, 11, 0.2)' }}>
                    <div style={{ fontWeight: 700, fontSize: 12, color: '#f59e0b', marginBottom: 8, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <span>📖 {t('proforma.form7.secMembership', 'Membership & Study (غړيتوب او مطالعه)')}</span>
                      <span style={{ fontSize: 11, color: 'var(--text-soft)', fontWeight: 600 }}>
                        {t('proforma.form7.lblMembers', 'غړي')}: {r.membershipPct || '0%'} | {t('proforma.form7.lblStudy', 'مطالعه')}: {r.studyPct || '0%'}
                      </span>
                    </div>
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 6, fontSize: 11 }}>
                      <div>
                        <label style={{ display: 'block', color: 'var(--text-soft)' }}>{t('proforma.form7.lblMembershipTotal', 'ټول غړي')}</label>
                        <input type="number" min="0" value={r.membershipTotal ?? ''} onChange={(e) => updateForm7Row(idx, 'membershipTotal', e.target.value)} style={getCardInputStyle(idx, 'membershipTotal')} title={getFieldError(idx, 'membershipTotal')} />
                      </div>
                      <div>
                        <label style={{ display: 'block', color: getFieldError(idx, 'membershipPresent') ? '#ef4444' : 'var(--text-soft)' }}>{t('proforma.form7.lblMembershipPresent', 'حاضر غړي')}</label>
                        <input type="number" min="0" value={r.membershipPresent ?? ''} onChange={(e) => updateForm7Row(idx, 'membershipPresent', e.target.value)} style={getCardInputStyle(idx, 'membershipPresent')} title={getFieldError(idx, 'membershipPresent')} />
                        {getFieldError(idx, 'membershipPresent') && <span style={{ color: '#ef4444', fontSize: 10, display: 'block' }}>⚠️ Exceeds total</span>}
                      </div>
                      <div>
                        <label style={{ display: 'block', color: 'var(--text-soft)' }}>{t('proforma.form7.lblStudyAreaComm', 'علاقائي کميټي')}</label>
                        <input type="number" min="0" value={r.studyAreaComm ?? ''} onChange={(e) => updateForm7Row(idx, 'studyAreaComm', e.target.value)} style={getCardInputStyle(idx, 'studyAreaComm')} title={getFieldError(idx, 'studyAreaComm')} />
                      </div>
                      <div>
                        <label style={{ display: 'block', color: 'var(--text-soft)' }}>{t('proforma.form7.lblStudyUnitsComm', 'يونټانو کميټي')}</label>
                        <input type="number" min="0" value={r.studyUnitsComm ?? ''} onChange={(e) => updateForm7Row(idx, 'studyUnitsComm', e.target.value)} style={getCardInputStyle(idx, 'studyUnitsComm')} title={getFieldError(idx, 'studyUnitsComm')} />
                      </div>
                      <div>
                        <label style={{ display: 'block', color: getFieldError(idx, 'studyUnitsCount') ? '#ef4444' : 'var(--text-soft)' }}>{t('proforma.form7.lblStudyUnitsCount', 'يونټانو شمير')}</label>
                        <input type="number" min="0" value={r.studyUnitsCount ?? ''} onChange={(e) => updateForm7Row(idx, 'studyUnitsCount', e.target.value)} style={getCardInputStyle(idx, 'studyUnitsCount')} title={getFieldError(idx, 'studyUnitsCount')} />
                        {getFieldError(idx, 'studyUnitsCount') && <span style={{ color: '#ef4444', fontSize: 10, display: 'block' }}>⚠️ Exceeds total</span>}
                      </div>
                    </div>
                  </div>

                  {/* 6. Programs, Inductions & PSO */}
                  <div style={{ background: 'var(--surface-alt)', padding: 12, borderRadius: 8, border: '1px solid rgba(168, 85, 247, 0.2)' }}>
                    <div style={{ fontWeight: 700, fontSize: 12, color: '#a855f7', marginBottom: 8 }}>
                      🎓 {t('proforma.form7.secPrograms', 'Programs & Inductions (کانفرنس، سيمينار، شموليت، PSO)')}
                    </div>
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 6, fontSize: 11 }}>
                      <div>
                        <label style={{ display: 'block', color: 'var(--text-soft)' }}>{t('proforma.form7.lblProgramsCount', 'کانفرنس/سيمينار/سرکل')}</label>
                        <input type="number" min="0" value={r.programsCount ?? ''} onChange={(e) => updateForm7Row(idx, 'programsCount', e.target.value)} style={getCardInputStyle(idx, 'programsCount')} title={getFieldError(idx, 'programsCount')} />
                      </div>
                      <div>
                        <label style={{ display: 'block', color: 'var(--text-soft)' }}>{t('proforma.form7.lblInductionPrograms', 'شموليت پروګرام')}</label>
                        <input type="number" min="0" value={r.inductionPrograms ?? ''} onChange={(e) => updateForm7Row(idx, 'inductionPrograms', e.target.value)} style={getCardInputStyle(idx, 'inductionPrograms')} title={getFieldError(idx, 'inductionPrograms')} />
                      </div>
                      <div>
                        <label style={{ display: 'block', color: 'var(--text-soft)' }}>{t('proforma.form7.lblNewInductions', 'نوي شموليت')}</label>
                        <input type="number" min="0" value={r.newInductions ?? ''} onChange={(e) => updateForm7Row(idx, 'newInductions', e.target.value)} style={getCardInputStyle(idx, 'newInductions')} title={getFieldError(idx, 'newInductions')} />
                      </div>
                      <div>
                        <label style={{ display: 'block', color: 'var(--text-soft)' }}>{t('proforma.form7.lblPsoUnitsCount', 'PSO يونټونو شمير')}</label>
                        <input type="number" min="0" value={r.psoUnitsCount ?? ''} onChange={(e) => updateForm7Row(idx, 'psoUnitsCount', e.target.value)} style={getCardInputStyle(idx, 'psoUnitsCount')} title={getFieldError(idx, 'psoUnitsCount')} />
                      </div>
                    </div>
                  </div>

                  {/* 7. Public Gatherings & Areas Without Unit */}
                  <div style={{ background: 'var(--surface-alt)', padding: 12, borderRadius: 8, border: '1px solid rgba(249, 115, 22, 0.2)' }}>
                    <div style={{ fontWeight: 700, fontSize: 12, color: '#f97316', marginBottom: 8 }}>
                      📢 {t('proforma.form7.secPublicGatherings', 'Public Gatherings (اولسي غونډي او کلي)')}
                    </div>
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 6, fontSize: 11 }}>
                      <div>
                        <label style={{ display: 'block', color: 'var(--text-soft)' }}>{t('proforma.form7.lblRalliesCount', 'جلسے مظاهرے')}</label>
                        <input type="number" min="0" value={r.ralliesCount ?? ''} onChange={(e) => updateForm7Row(idx, 'ralliesCount', e.target.value)} style={getCardInputStyle(idx, 'ralliesCount')} title={getFieldError(idx, 'ralliesCount')} />
                      </div>
                      <div>
                        <label style={{ display: 'block', color: 'var(--text-soft)' }}>{t('proforma.form7.lblJirgasCount', 'جرګے')}</label>
                        <input type="number" min="0" value={r.jirgasCount ?? ''} onChange={(e) => updateForm7Row(idx, 'jirgasCount', e.target.value)} style={getCardInputStyle(idx, 'jirgasCount')} title={getFieldError(idx, 'jirgasCount')} />
                      </div>
                      <div>
                        <label style={{ display: 'block', color: 'var(--text-soft)' }}>{t('proforma.form7.lblUnitGatherings', 'يونټو غونډي')}</label>
                        <input type="number" min="0" value={r.unitGatherings ?? ''} onChange={(e) => updateForm7Row(idx, 'unitGatherings', e.target.value)} style={getCardInputStyle(idx, 'unitGatherings')} title={getFieldError(idx, 'unitGatherings')} />
                      </div>
                      <div>
                        <label style={{ display: 'block', color: 'var(--text-soft)' }}>{t('proforma.form7.lblVillagesWithoutUnit', 'کلي چي يونټ نسته')}</label>
                        <input type="number" min="0" value={r.villagesWithoutUnit ?? ''} onChange={(e) => updateForm7Row(idx, 'villagesWithoutUnit', e.target.value)} style={getCardInputStyle(idx, 'villagesWithoutUnit')} title={getFieldError(idx, 'villagesWithoutUnit')} />
                      </div>
                    </div>
                  </div>

                  {/* 8. Dues & Blood Bank */}
                  <div style={{ background: 'var(--surface-alt)', padding: 12, borderRadius: 8, border: '1px solid rgba(16, 185, 129, 0.2)' }}>
                    <div style={{ fontWeight: 700, fontSize: 12, color: '#10b981', marginBottom: 8 }}>
                      💰 {t('proforma.form7.secDues', 'Dues & Blood Bank (چنده او بلډ بينک)')}
                    </div>
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 6, fontSize: 11 }}>
                      <div>
                        <label style={{ display: 'block', color: 'var(--text-soft)' }}>{t('proforma.form7.lblDuesMonthly', 'ټول مياشتنۍ')}</label>
                        <input type="number" min="0" value={r.duesMonthly ?? ''} onChange={(e) => updateForm7Row(idx, 'duesMonthly', e.target.value)} style={getCardInputStyle(idx, 'duesMonthly')} title={getFieldError(idx, 'duesMonthly')} />
                      </div>
                      <div>
                        <label style={{ display: 'block', color: 'var(--text-soft)' }}>{t('proforma.form7.lblDuesOrg', 'علاقائي تنظيمي')}</label>
                        <input type="number" min="0" value={r.duesOrg ?? ''} onChange={(e) => updateForm7Row(idx, 'duesOrg', e.target.value)} style={getCardInputStyle(idx, 'duesOrg')} title={getFieldError(idx, 'duesOrg')} />
                      </div>
                      <div>
                        <label style={{ display: 'block', color: 'var(--text-soft)' }}>{t('proforma.form7.lblDuesEmergency', 'هنګامي')}</label>
                        <input type="number" min="0" value={r.duesEmergency ?? ''} onChange={(e) => updateForm7Row(idx, 'duesEmergency', e.target.value)} style={getCardInputStyle(idx, 'duesEmergency')} title={getFieldError(idx, 'duesEmergency')} />
                      </div>
                      <div>
                        <label style={{ display: 'block', color: 'var(--text-soft)' }}>{t('proforma.form7.lblBloodPosts', 'بلډ پوستونه')}</label>
                        <input type="number" min="0" value={r.bloodPosts ?? ''} onChange={(e) => updateForm7Row(idx, 'bloodPosts', e.target.value)} style={getCardInputStyle(idx, 'bloodPosts')} title={getFieldError(idx, 'bloodPosts')} />
                      </div>
                      <div>
                        <label style={{ display: 'block', color: 'var(--text-soft)' }}>{t('proforma.form7.lblBloodCash', 'نغدي')}</label>
                        <input type="number" min="0" value={r.bloodCash ?? ''} onChange={(e) => updateForm7Row(idx, 'bloodCash', e.target.value)} style={getCardInputStyle(idx, 'bloodCash')} title={getFieldError(idx, 'bloodCash')} />
                      </div>
                      <div>
                        <label style={{ display: 'block', color: 'var(--text-soft)' }}>{t('proforma.form7.lblBloodZakat', 'زکات')}</label>
                        <input type="number" min="0" value={r.bloodZakat ?? ''} onChange={(e) => updateForm7Row(idx, 'bloodZakat', e.target.value)} style={getCardInputStyle(idx, 'bloodZakat')} title={getFieldError(idx, 'bloodZakat')} />
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            );
          })}

          {rows.length === 0 && (
            <div className="card" style={{ padding: 40, textAlign: 'center', color: 'var(--text-soft)' }}>
              <div style={{ fontSize: 36, marginBottom: 10 }}>🏢</div>
              <div style={{ fontSize: 15, fontWeight: 600 }}>{t('proforma.form7.noAreas', 'No Area Units recorded yet.')}</div>
              <button type="button" onClick={addForm7Row} className="btn" style={{ marginTop: 14 }}>
                ➕ {t('proforma.form7.addArea', '+ Add Area Unit')}
              </button>
            </div>
          )}
        </div>
      )}

      {/* ────────────────────────────────────────────────────────────────────────── */}
      {/* 5. TABLE VIEW (OFFICIAL 45 COLUMNS MATCHING PAPER PROFORMA) */}
      {/* ────────────────────────────────────────────────────────────────────────── */}
      {form7ViewMode === 'table' && (
        <div
          className="card"
          style={{
            padding: 0,
            overflow: 'hidden',
            border: '1px solid var(--border)',
            background: 'var(--surface)',
            borderRadius: 8,
          }}
        >
          <div
            style={{
              overflowX: 'auto',
              maxHeight: '75vh',
              position: 'relative',
              direction: 'rtl',
            }}
          >
            <table
              className="proforma-table"
              style={{
                width: '100%',
                minWidth: 2600,
                borderCollapse: 'separate',
                borderSpacing: 0,
                fontSize: 12,
                textAlign: 'center',
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
                {/* Header Row 1: Groups */}
                <tr style={{ background: 'var(--surface-alt)', color: 'var(--text-main)', borderBottom: '1px solid var(--border)' }}>
                  <th
                    rowSpan={2}
                    style={{
                      position: 'sticky',
                      right: 0,
                      zIndex: 25,
                      background: 'var(--surface-alt)',
                      minWidth: 45,
                      borderLeft: '1px solid var(--border)',
                      borderBottom: '1px solid var(--border)',
                      padding: 8,
                    }}
                  >
                    {t('proforma.form7.srNo', 'شمير')}
                  </th>
                  <th
                    rowSpan={2}
                    style={{
                      position: 'sticky',
                      right: 45,
                      zIndex: 25,
                      background: 'var(--surface-alt)',
                      minWidth: 170,
                      borderLeft: '2px solid var(--primary, #38bdf8)',
                      borderBottom: '1px solid var(--border)',
                      padding: 8,
                    }}
                  >
                    {t('proforma.form7.areaName', 'علاقائي يونټ نوم')}
                  </th>
                  <th colSpan={5} style={{ background: 'rgba(2, 132, 199, 0.15)', borderLeft: '1px solid var(--border)', borderBottom: '1px solid var(--border)', padding: 6 }}>
                    {t('proforma.form7.secExecMeetings', 'ايګزيکټيو')}
                  </th>
                  <th colSpan={5} style={{ background: 'rgba(99, 102, 241, 0.15)', borderLeft: '1px solid var(--border)', borderBottom: '1px solid var(--border)', padding: 6 }}>
                    {t('proforma.form7.secCommMeetings', 'کميټي غونډي')}
                  </th>
                  <th colSpan={2} style={{ background: 'rgba(16, 185, 129, 0.15)', borderLeft: '1px solid var(--border)', borderBottom: '1px solid var(--border)', padding: 6 }}>
                    {t('proforma.form7.secBasicUnits', 'ابتدائي يونټانو شمير')}
                  </th>
                  <th colSpan={5} style={{ background: 'rgba(20, 184, 166, 0.15)', borderLeft: '1px solid var(--border)', borderBottom: '1px solid var(--border)', padding: 6 }}>
                    {t('proforma.form7.secBuExec', 'ابتدائي يونټانو ايګزيکټيو')}
                  </th>
                  <th colSpan={4} style={{ background: 'rgba(14, 165, 233, 0.15)', borderLeft: '1px solid var(--border)', borderBottom: '1px solid var(--border)', padding: 6 }}>
                    {t('proforma.form7.secBuGb', 'ابتدائي يونټانو غونډو شمير')}
                  </th>
                  <th colSpan={3} style={{ background: 'rgba(245, 158, 11, 0.15)', borderLeft: '1px solid var(--border)', borderBottom: '1px solid var(--border)', padding: 6 }}>
                    {t('proforma.form7.secMembership', 'غړيتوب (ممبرشپ)')}
                  </th>
                  <th colSpan={4} style={{ background: 'rgba(234, 179, 8, 0.15)', borderLeft: '1px solid var(--border)', borderBottom: '1px solid var(--border)', padding: 6 }}>
                    {t('proforma.form7.secStudy', 'لوستنه (مطالعه)')}
                  </th>
                  <th colSpan={3} style={{ background: 'rgba(168, 85, 247, 0.15)', borderLeft: '1px solid var(--border)', borderBottom: '1px solid var(--border)', padding: 6 }}>
                    {t('proforma.form7.secPrograms', 'پروګرامونه او شموليت')}
                  </th>
                  <th rowSpan={2} style={{ background: 'rgba(139, 92, 246, 0.15)', borderLeft: '1px solid var(--border)', borderBottom: '1px solid var(--border)', minWidth: 65, padding: 6 }}>
                    {t('proforma.form7.psoUnitsCount', 'PSO شمير')}
                  </th>
                  <th colSpan={3} style={{ background: 'rgba(249, 115, 22, 0.15)', borderLeft: '1px solid var(--border)', borderBottom: '1px solid var(--border)', padding: 6 }}>
                    {t('proforma.form7.secPublicGatherings', 'اولسي غونډي')}
                  </th>
                  <th rowSpan={2} style={{ background: 'rgba(239, 68, 68, 0.15)', borderLeft: '1px solid var(--border)', borderBottom: '1px solid var(--border)', minWidth: 80, padding: 6 }}>
                    {t('proforma.form7.villagesWithoutUnit', 'کليو شمير يونټ نسته')}
                  </th>
                  <th rowSpan={2} style={{ background: 'rgba(100, 116, 139, 0.15)', borderLeft: '1px solid var(--border)', borderBottom: '1px solid var(--border)', minWidth: 85, padding: 6 }}>
                    {t('proforma.form7.officeActivity', 'علاقائي دفتر فعاليت')}
                  </th>
                  <th colSpan={3} style={{ background: 'rgba(34, 197, 94, 0.15)', borderLeft: '1px solid var(--border)', borderBottom: '1px solid var(--border)', padding: 6 }}>
                    {t('proforma.form7.secDues', 'چنده')}
                  </th>
                  <th colSpan={3} style={{ background: 'rgba(236, 72, 153, 0.15)', borderLeft: '1px solid var(--border)', borderBottom: '1px solid var(--border)', padding: 6 }}>
                    {t('proforma.form7.secBloodBank', 'بلډ بينک')}
                  </th>
                  <th rowSpan={2} style={{ minWidth: 45, borderBottom: '1px solid var(--border)', padding: 6 }}>
                    {t('proforma.action', 'عمل')}
                  </th>
                </tr>

                {/* Header Row 2: Sub-columns */}
                <tr style={{ background: 'var(--surface-alt)', color: 'var(--text-soft)', fontSize: 11 }}>
                  {/* Exec */}
                  <th style={{ minWidth: 55, borderLeft: '1px solid var(--border)', padding: 4 }}>{t('proforma.form7.execMeetings', 'غونډي')}</th>
                  <th style={{ minWidth: 55, borderLeft: '1px solid var(--border)', padding: 4 }}>{t('proforma.form7.execTotalMembers', 'شمير')}</th>
                  <th style={{ minWidth: 65, borderLeft: '1px solid var(--border)', padding: 4 }}>{t('proforma.form7.execPresent', 'حاضر ملګرو')}</th>
                  <th style={{ minWidth: 65, borderLeft: '1px solid var(--border)', padding: 4 }}>{t('proforma.form7.execHeld', 'حاضر غونډو')}</th>
                  <th style={{ minWidth: 55, borderLeft: '1px solid var(--border)', padding: 4 }}>{t('proforma.form7.execPct', 'فيصدي')}</th>
                  {/* Comm */}
                  <th style={{ minWidth: 55, borderLeft: '1px solid var(--border)', padding: 4 }}>{t('proforma.form7.commMeetings', 'غونډي')}</th>
                  <th style={{ minWidth: 60, borderLeft: '1px solid var(--border)', padding: 4 }}>{t('proforma.form7.commTotalMembers', 'غړو شمير')}</th>
                  <th style={{ minWidth: 75, borderLeft: '1px solid var(--border)', padding: 4 }}>{t('proforma.form7.commPresent', 'حاضر ملګرو')}</th>
                  <th style={{ minWidth: 65, borderLeft: '1px solid var(--border)', padding: 4 }}>{t('proforma.form7.commHeld', 'حاضر غونډو')}</th>
                  <th style={{ minWidth: 55, borderLeft: '1px solid var(--border)', padding: 4 }}>{t('proforma.form7.commPct', 'فيصدي')}</th>
                  {/* BU Count */}
                  <th style={{ minWidth: 55, borderLeft: '1px solid var(--border)', padding: 4 }}>{t('proforma.form7.buCount', 'شمير')}</th>
                  <th style={{ minWidth: 60, borderLeft: '1px solid var(--border)', padding: 4 }}>{t('proforma.form7.newBuCount', 'نوي')}</th>
                  {/* BU Exec */}
                  <th style={{ minWidth: 55, borderLeft: '1px solid var(--border)', padding: 4 }}>{t('proforma.form7.buExecUnitsTotal', 'غړو')}</th>
                  <th style={{ minWidth: 60, borderLeft: '1px solid var(--border)', padding: 4 }}>{t('proforma.form7.buExecUnitsPresent', 'حاضر غړو')}</th>
                  <th style={{ minWidth: 55, borderLeft: '1px solid var(--border)', padding: 4 }}>{t('proforma.form7.buExecMeetingsTotal', 'غونډو')}</th>
                  <th style={{ minWidth: 65, borderLeft: '1px solid var(--border)', padding: 4 }}>{t('proforma.form7.buExecMeetingsHeld', 'حاضر غونډو')}</th>
                  <th style={{ minWidth: 55, borderLeft: '1px solid var(--border)', padding: 4 }}>{t('proforma.form7.buExecPct', 'فيصدي')}</th>
                  {/* BU GB */}
                  <th style={{ minWidth: 60, borderLeft: '1px solid var(--border)', padding: 4 }}>{t('proforma.form7.buGbMeetingsTotal', 'ټول')}</th>
                  <th style={{ minWidth: 65, borderLeft: '1px solid var(--border)', padding: 4 }}>{t('proforma.form7.buGbMeetingsHeld', 'حاضر غونډو')}</th>
                  <th style={{ minWidth: 55, borderLeft: '1px solid var(--border)', padding: 4 }}>{t('proforma.form7.buGbPct', 'فيصدي')}</th>
                  <th style={{ minWidth: 65, borderLeft: '1px solid var(--border)', padding: 4 }}>{t('proforma.form7.inactiveBuCount', 'غير فعاله')}</th>
                  {/* Membership */}
                  <th style={{ minWidth: 55, borderLeft: '1px solid var(--border)', padding: 4 }}>{t('proforma.form7.membershipTotal', 'ټول')}</th>
                  <th style={{ minWidth: 60, borderLeft: '1px solid var(--border)', padding: 4 }}>{t('proforma.form7.membershipPresent', 'حاضر غړو')}</th>
                  <th style={{ minWidth: 55, borderLeft: '1px solid var(--border)', padding: 4 }}>{t('proforma.form7.membershipPct', 'فيصدي')}</th>
                  {/* Study */}
                  <th style={{ minWidth: 70, borderLeft: '1px solid var(--border)', padding: 4 }}>{t('proforma.form7.studyAreaComm', 'علاقائي کميټي')}</th>
                  <th style={{ minWidth: 70, borderLeft: '1px solid var(--border)', padding: 4 }}>{t('proforma.form7.studyUnitsComm', 'يونټانو کميټي')}</th>
                  <th style={{ minWidth: 60, borderLeft: '1px solid var(--border)', padding: 4 }}>{t('proforma.form7.studyUnitsCount', 'يونټانو')}</th>
                  <th style={{ minWidth: 55, borderLeft: '1px solid var(--border)', padding: 4 }}>{t('proforma.form7.studyPct', 'فيصدي')}</th>
                  {/* Programs */}
                  <th style={{ minWidth: 80, borderLeft: '1px solid var(--border)', padding: 4 }}>{t('proforma.form7.programsCount', 'کانفرنس/سيمينار')}</th>
                  <th style={{ minWidth: 75, borderLeft: '1px solid var(--border)', padding: 4 }}>{t('proforma.form7.inductionPrograms', 'شموليت پروګرام')}</th>
                  <th style={{ minWidth: 65, borderLeft: '1px solid var(--border)', padding: 4 }}>{t('proforma.form7.newInductions', 'نوي شموليت')}</th>
                  {/* Gatherings */}
                  <th style={{ minWidth: 70, borderLeft: '1px solid var(--border)', padding: 4 }}>{t('proforma.form7.ralliesCount', 'جلسے مظاهرے')}</th>
                  <th style={{ minWidth: 55, borderLeft: '1px solid var(--border)', padding: 4 }}>{t('proforma.form7.jirgasCount', 'جرګے')}</th>
                  <th style={{ minWidth: 65, borderLeft: '1px solid var(--border)', padding: 4 }}>{t('proforma.form7.unitGatherings', 'يونټو غونډي')}</th>
                  {/* Dues */}
                  <th style={{ minWidth: 75, borderLeft: '1px solid var(--border)', padding: 4 }}>{t('proforma.form7.duesMonthly', 'ټول (مياشتنۍ)')}</th>
                  <th style={{ minWidth: 75, borderLeft: '1px solid var(--border)', padding: 4 }}>{t('proforma.form7.duesOrg', 'علاقائي (تنظيمي)')}</th>
                  <th style={{ minWidth: 65, borderLeft: '1px solid var(--border)', padding: 4 }}>{t('proforma.form7.duesEmergency', 'هنګامي')}</th>
                  {/* Blood Bank */}
                  <th style={{ minWidth: 55, borderLeft: '1px solid var(--border)', padding: 4 }}>{t('proforma.form7.bloodPosts', 'پوستونه')}</th>
                  <th style={{ minWidth: 65, borderLeft: '1px solid var(--border)', padding: 4 }}>{t('proforma.form7.bloodCash', 'نغدي')}</th>
                  <th style={{ minWidth: 65, borderLeft: '1px solid var(--border)', padding: 4 }}>{t('proforma.form7.bloodZakat', 'زکات')}</th>
                </tr>
              </thead>

              <tbody>
                {filteredRows.map(({ r, originalIdx: idx }) => (
                  <tr
                    key={r.unitId || idx}
                    style={{
                      background: idx % 2 === 0 ? 'var(--surface)' : 'var(--surface-alt)',
                      transition: 'background 0.2s',
                    }}
                  >
                    {/* 1. Sr # (Sticky) */}
                    <td
                      style={{
                        position: 'sticky',
                        right: 0,
                        zIndex: 10,
                        background: idx % 2 === 0 ? 'var(--surface)' : 'var(--surface-alt)',
                        borderLeft: '1px solid var(--border)',
                        borderBottom: '1px solid var(--border)',
                        fontWeight: 700,
                        padding: 6,
                      }}
                    >
                      {idx + 1}
                    </td>

                    {/* 2. Area Unit Name (Sticky) */}
                    <td
                      style={{
                        position: 'sticky',
                        right: 45,
                        zIndex: 10,
                        background: idx % 2 === 0 ? 'var(--surface)' : 'var(--surface-alt)',
                        borderLeft: '2px solid var(--primary, #38bdf8)',
                        borderBottom: '1px solid var(--border)',
                        padding: '4px 6px',
                        textAlign: 'right',
                      }}
                    >
                      <input
                        type="text"
                        value={r.unitName || ''}
                        onChange={(e) => updateForm7Row(idx, 'unitName', e.target.value)}
                        placeholder={t('proforma.form7.areaName', 'علاقائي يونټ نوم')}
                        style={{
                          width: '100%',
                          padding: '4px 6px',
                          fontSize: 12,
                          fontWeight: 600,
                          borderRadius: 4,
                          border: getFieldError(idx, 'unitName') ? '1.5px solid #ef4444' : '1px solid transparent',
                          background: getFieldError(idx, 'unitName') ? 'rgba(239, 68, 68, 0.1)' : 'transparent',
                        }}
                        title={getFieldError(idx, 'unitName')}
                      />
                    </td>

                    {/* 3-7. Executive Meetings */}
                    <td style={{ borderLeft: '1px solid var(--border)', borderBottom: '1px solid var(--border)', padding: 2 }}>
                      <input type="number" min="0" value={r.execMeetings ?? ''} onChange={(e) => updateForm7Row(idx, 'execMeetings', e.target.value)} style={getTableInputStyle(idx, 'execMeetings', 45)} title={getFieldError(idx, 'execMeetings')} />
                    </td>
                    <td style={{ borderLeft: '1px solid var(--border)', borderBottom: '1px solid var(--border)', padding: 2 }}>
                      <input type="number" min="0" value={r.execTotalMembers ?? ''} onChange={(e) => updateForm7Row(idx, 'execTotalMembers', e.target.value)} style={getTableInputStyle(idx, 'execTotalMembers', 45)} title={getFieldError(idx, 'execTotalMembers')} />
                    </td>
                    <td style={{ borderLeft: '1px solid var(--border)', borderBottom: '1px solid var(--border)', padding: 2 }}>
                      <input type="number" min="0" value={r.execPresent ?? ''} onChange={(e) => updateForm7Row(idx, 'execPresent', e.target.value)} style={getTableInputStyle(idx, 'execPresent', 45)} title={getFieldError(idx, 'execPresent')} />
                    </td>
                    <td style={{ borderLeft: '1px solid var(--border)', borderBottom: '1px solid var(--border)', padding: 2 }}>
                      <input type="number" min="0" value={r.execHeld ?? ''} onChange={(e) => updateForm7Row(idx, 'execHeld', e.target.value)} style={getTableInputStyle(idx, 'execHeld', 45)} title={getFieldError(idx, 'execHeld')} />
                    </td>
                    <td style={{ borderLeft: '1px solid var(--border)', borderBottom: '1px solid var(--border)', padding: 2 }}>
                      <span style={{ fontSize: 11, fontWeight: 700, color: '#0284c7' }}>{r.execPct || '0%'}</span>
                    </td>

                    {/* 8-12. Committee Meetings */}
                    <td style={{ borderLeft: '1px solid var(--border)', borderBottom: '1px solid var(--border)', padding: 2 }}>
                      <input type="number" min="0" value={r.commMeetings ?? ''} onChange={(e) => updateForm7Row(idx, 'commMeetings', e.target.value)} style={getTableInputStyle(idx, 'commMeetings', 45)} title={getFieldError(idx, 'commMeetings')} />
                    </td>
                    <td style={{ borderLeft: '1px solid var(--border)', borderBottom: '1px solid var(--border)', padding: 2 }}>
                      <input type="number" min="0" value={r.commTotalMembers ?? ''} onChange={(e) => updateForm7Row(idx, 'commTotalMembers', e.target.value)} style={getTableInputStyle(idx, 'commTotalMembers', 45)} title={getFieldError(idx, 'commTotalMembers')} />
                    </td>
                    <td style={{ borderLeft: '1px solid var(--border)', borderBottom: '1px solid var(--border)', padding: 2 }}>
                      <input type="number" min="0" value={r.commPresent ?? ''} onChange={(e) => updateForm7Row(idx, 'commPresent', e.target.value)} style={getTableInputStyle(idx, 'commPresent', 45)} title={getFieldError(idx, 'commPresent')} />
                    </td>
                    <td style={{ borderLeft: '1px solid var(--border)', borderBottom: '1px solid var(--border)', padding: 2 }}>
                      <input type="number" min="0" value={r.commHeld ?? ''} onChange={(e) => updateForm7Row(idx, 'commHeld', e.target.value)} style={getTableInputStyle(idx, 'commHeld', 45)} title={getFieldError(idx, 'commHeld')} />
                    </td>
                    <td style={{ borderLeft: '1px solid var(--border)', borderBottom: '1px solid var(--border)', padding: 2 }}>
                      <span style={{ fontSize: 11, fontWeight: 700, color: '#6366f1' }}>{r.commPct || '0%'}</span>
                    </td>

                    {/* 13-14. Basic Units Count */}
                    <td style={{ borderLeft: '1px solid var(--border)', borderBottom: '1px solid var(--border)', padding: 2 }}>
                      <input type="number" min="0" value={r.buCount ?? ''} onChange={(e) => updateForm7Row(idx, 'buCount', e.target.value)} style={getTableInputStyle(idx, 'buCount', 45)} title={getFieldError(idx, 'buCount')} />
                    </td>
                    <td style={{ borderLeft: '1px solid var(--border)', borderBottom: '1px solid var(--border)', padding: 2 }}>
                      <input type="number" min="0" value={r.newBuCount ?? ''} onChange={(e) => updateForm7Row(idx, 'newBuCount', e.target.value)} style={getTableInputStyle(idx, 'newBuCount', 45)} title={getFieldError(idx, 'newBuCount')} />
                    </td>

                    {/* 15-19. BU Executive */}
                    <td style={{ borderLeft: '1px solid var(--border)', borderBottom: '1px solid var(--border)', padding: 2 }}>
                      <input type="number" min="0" value={r.buExecUnitsTotal ?? ''} onChange={(e) => updateForm7Row(idx, 'buExecUnitsTotal', e.target.value)} style={getTableInputStyle(idx, 'buExecUnitsTotal', 45)} title={getFieldError(idx, 'buExecUnitsTotal')} />
                    </td>
                    <td style={{ borderLeft: '1px solid var(--border)', borderBottom: '1px solid var(--border)', padding: 2 }}>
                      <input type="number" min="0" value={r.buExecUnitsPresent ?? ''} onChange={(e) => updateForm7Row(idx, 'buExecUnitsPresent', e.target.value)} style={getTableInputStyle(idx, 'buExecUnitsPresent', 45)} title={getFieldError(idx, 'buExecUnitsPresent')} />
                    </td>
                    <td style={{ borderLeft: '1px solid var(--border)', borderBottom: '1px solid var(--border)', padding: 2 }}>
                      <input type="number" min="0" value={r.buExecMeetingsTotal ?? ''} onChange={(e) => updateForm7Row(idx, 'buExecMeetingsTotal', e.target.value)} style={getTableInputStyle(idx, 'buExecMeetingsTotal', 45)} title={getFieldError(idx, 'buExecMeetingsTotal')} />
                    </td>
                    <td style={{ borderLeft: '1px solid var(--border)', borderBottom: '1px solid var(--border)', padding: 2 }}>
                      <input type="number" min="0" value={r.buExecMeetingsHeld ?? ''} onChange={(e) => updateForm7Row(idx, 'buExecMeetingsHeld', e.target.value)} style={getTableInputStyle(idx, 'buExecMeetingsHeld', 45)} title={getFieldError(idx, 'buExecMeetingsHeld')} />
                    </td>
                    <td style={{ borderLeft: '1px solid var(--border)', borderBottom: '1px solid var(--border)', padding: 2 }}>
                      <span style={{ fontSize: 11, fontWeight: 700, color: '#14b8a6' }}>{r.buExecPct || '0%'}</span>
                    </td>

                    {/* 20-23. BU General Body */}
                    <td style={{ borderLeft: '1px solid var(--border)', borderBottom: '1px solid var(--border)', padding: 2 }}>
                      <input type="number" min="0" value={r.buGbMeetingsTotal ?? ''} onChange={(e) => updateForm7Row(idx, 'buGbMeetingsTotal', e.target.value)} style={getTableInputStyle(idx, 'buGbMeetingsTotal', 45)} title={getFieldError(idx, 'buGbMeetingsTotal')} />
                    </td>
                    <td style={{ borderLeft: '1px solid var(--border)', borderBottom: '1px solid var(--border)', padding: 2 }}>
                      <input type="number" min="0" value={r.buGbMeetingsHeld ?? ''} onChange={(e) => updateForm7Row(idx, 'buGbMeetingsHeld', e.target.value)} style={getTableInputStyle(idx, 'buGbMeetingsHeld', 45)} title={getFieldError(idx, 'buGbMeetingsHeld')} />
                    </td>
                    <td style={{ borderLeft: '1px solid var(--border)', borderBottom: '1px solid var(--border)', padding: 2 }}>
                      <span style={{ fontSize: 11, fontWeight: 700, color: '#0ea5e9' }}>{r.buGbPct || '0%'}</span>
                    </td>
                    <td style={{ borderLeft: '1px solid var(--border)', borderBottom: '1px solid var(--border)', padding: 2 }}>
                      <input type="number" min="0" value={r.inactiveBuCount ?? ''} onChange={(e) => updateForm7Row(idx, 'inactiveBuCount', e.target.value)} style={getTableInputStyle(idx, 'inactiveBuCount', 45)} title={getFieldError(idx, 'inactiveBuCount')} />
                    </td>

                    {/* 24-26. Membership */}
                    <td style={{ borderLeft: '1px solid var(--border)', borderBottom: '1px solid var(--border)', padding: 2 }}>
                      <input type="number" min="0" value={r.membershipTotal ?? ''} onChange={(e) => updateForm7Row(idx, 'membershipTotal', e.target.value)} style={getTableInputStyle(idx, 'membershipTotal', 45)} title={getFieldError(idx, 'membershipTotal')} />
                    </td>
                    <td style={{ borderLeft: '1px solid var(--border)', borderBottom: '1px solid var(--border)', padding: 2 }}>
                      <input type="number" min="0" value={r.membershipPresent ?? ''} onChange={(e) => updateForm7Row(idx, 'membershipPresent', e.target.value)} style={getTableInputStyle(idx, 'membershipPresent', 45)} title={getFieldError(idx, 'membershipPresent')} />
                    </td>
                    <td style={{ borderLeft: '1px solid var(--border)', borderBottom: '1px solid var(--border)', padding: 2 }}>
                      <span style={{ fontSize: 11, fontWeight: 700, color: '#f59e0b' }}>{r.membershipPct || '0%'}</span>
                    </td>

                    {/* 27-30. Study */}
                    <td style={{ borderLeft: '1px solid var(--border)', borderBottom: '1px solid var(--border)', padding: 2 }}>
                      <input type="number" min="0" value={r.studyAreaComm ?? ''} onChange={(e) => updateForm7Row(idx, 'studyAreaComm', e.target.value)} style={getTableInputStyle(idx, 'studyAreaComm', 45)} title={getFieldError(idx, 'studyAreaComm')} />
                    </td>
                    <td style={{ borderLeft: '1px solid var(--border)', borderBottom: '1px solid var(--border)', padding: 2 }}>
                      <input type="number" min="0" value={r.studyUnitsComm ?? ''} onChange={(e) => updateForm7Row(idx, 'studyUnitsComm', e.target.value)} style={getTableInputStyle(idx, 'studyUnitsComm', 45)} title={getFieldError(idx, 'studyUnitsComm')} />
                    </td>
                    <td style={{ borderLeft: '1px solid var(--border)', borderBottom: '1px solid var(--border)', padding: 2 }}>
                      <input type="number" min="0" value={r.studyUnitsCount ?? ''} onChange={(e) => updateForm7Row(idx, 'studyUnitsCount', e.target.value)} style={getTableInputStyle(idx, 'studyUnitsCount', 45)} title={getFieldError(idx, 'studyUnitsCount')} />
                    </td>
                    <td style={{ borderLeft: '1px solid var(--border)', borderBottom: '1px solid var(--border)', padding: 2 }}>
                      <span style={{ fontSize: 11, fontWeight: 700, color: '#eab308' }}>{r.studyPct || '0%'}</span>
                    </td>

                    {/* 31-33. Programs & Inductions */}
                    <td style={{ borderLeft: '1px solid var(--border)', borderBottom: '1px solid var(--border)', padding: 2 }}>
                      <input type="number" min="0" value={r.programsCount ?? ''} onChange={(e) => updateForm7Row(idx, 'programsCount', e.target.value)} style={getTableInputStyle(idx, 'programsCount', 50)} title={getFieldError(idx, 'programsCount')} />
                    </td>
                    <td style={{ borderLeft: '1px solid var(--border)', borderBottom: '1px solid var(--border)', padding: 2 }}>
                      <input type="number" min="0" value={r.inductionPrograms ?? ''} onChange={(e) => updateForm7Row(idx, 'inductionPrograms', e.target.value)} style={getTableInputStyle(idx, 'inductionPrograms', 50)} title={getFieldError(idx, 'inductionPrograms')} />
                    </td>
                    <td style={{ borderLeft: '1px solid var(--border)', borderBottom: '1px solid var(--border)', padding: 2 }}>
                      <input type="number" min="0" value={r.newInductions ?? ''} onChange={(e) => updateForm7Row(idx, 'newInductions', e.target.value)} style={getTableInputStyle(idx, 'newInductions', 50)} title={getFieldError(idx, 'newInductions')} />
                    </td>

                    {/* 34. PSO */}
                    <td style={{ borderLeft: '1px solid var(--border)', borderBottom: '1px solid var(--border)', padding: 2 }}>
                      <input type="number" min="0" value={r.psoUnitsCount ?? ''} onChange={(e) => updateForm7Row(idx, 'psoUnitsCount', e.target.value)} style={getTableInputStyle(idx, 'psoUnitsCount', 45)} title={getFieldError(idx, 'psoUnitsCount')} />
                    </td>

                    {/* 35-37. Public Gatherings */}
                    <td style={{ borderLeft: '1px solid var(--border)', borderBottom: '1px solid var(--border)', padding: 2 }}>
                      <input type="number" min="0" value={r.ralliesCount ?? ''} onChange={(e) => updateForm7Row(idx, 'ralliesCount', e.target.value)} style={getTableInputStyle(idx, 'ralliesCount', 45)} title={getFieldError(idx, 'ralliesCount')} />
                    </td>
                    <td style={{ borderLeft: '1px solid var(--border)', borderBottom: '1px solid var(--border)', padding: 2 }}>
                      <input type="number" min="0" value={r.jirgasCount ?? ''} onChange={(e) => updateForm7Row(idx, 'jirgasCount', e.target.value)} style={getTableInputStyle(idx, 'jirgasCount', 45)} title={getFieldError(idx, 'jirgasCount')} />
                    </td>
                    <td style={{ borderLeft: '1px solid var(--border)', borderBottom: '1px solid var(--border)', padding: 2 }}>
                      <input type="number" min="0" value={r.unitGatherings ?? ''} onChange={(e) => updateForm7Row(idx, 'unitGatherings', e.target.value)} style={getTableInputStyle(idx, 'unitGatherings', 45)} title={getFieldError(idx, 'unitGatherings')} />
                    </td>

                    {/* 38. Villages Without Unit */}
                    <td style={{ borderLeft: '1px solid var(--border)', borderBottom: '1px solid var(--border)', padding: 2 }}>
                      <input type="number" min="0" value={r.villagesWithoutUnit ?? ''} onChange={(e) => updateForm7Row(idx, 'villagesWithoutUnit', e.target.value)} style={getTableInputStyle(idx, 'villagesWithoutUnit', 50)} title={getFieldError(idx, 'villagesWithoutUnit')} />
                    </td>

                    {/* 39. Office Activity */}
                    <td style={{ borderLeft: '1px solid var(--border)', borderBottom: '1px solid var(--border)', padding: 2 }}>
                      <select
                        value={r.officeActivity || 'فعاله'}
                        onChange={(e) => updateForm7Row(idx, 'officeActivity', e.target.value)}
                        style={{
                          fontSize: 11,
                          padding: '3px 4px',
                          borderRadius: 4,
                          border: '1px solid var(--border)',
                          fontWeight: 600,
                          color: r.officeActivity === 'غير فعاله' ? '#ef4444' : '#22c55e',
                          background: 'transparent',
                        }}
                      >
                        <option value="فعاله">{t('proforma.form7.lblActive', 'فعاله')}</option>
                        <option value="غير فعاله">{t('proforma.form7.lblInactive', 'غير فعاله')}</option>
                      </select>
                    </td>

                    {/* 40-42. Dues */}
                    <td style={{ borderLeft: '1px solid var(--border)', borderBottom: '1px solid var(--border)', padding: 2 }}>
                      <input type="number" min="0" value={r.duesMonthly ?? ''} onChange={(e) => updateForm7Row(idx, 'duesMonthly', e.target.value)} style={getTableInputStyle(idx, 'duesMonthly', 55)} title={getFieldError(idx, 'duesMonthly')} />
                    </td>
                    <td style={{ borderLeft: '1px solid var(--border)', borderBottom: '1px solid var(--border)', padding: 2 }}>
                      <input type="number" min="0" value={r.duesOrg ?? ''} onChange={(e) => updateForm7Row(idx, 'duesOrg', e.target.value)} style={getTableInputStyle(idx, 'duesOrg', 55)} title={getFieldError(idx, 'duesOrg')} />
                    </td>
                    <td style={{ borderLeft: '1px solid var(--border)', borderBottom: '1px solid var(--border)', padding: 2 }}>
                      <input type="number" min="0" value={r.duesEmergency ?? ''} onChange={(e) => updateForm7Row(idx, 'duesEmergency', e.target.value)} style={getTableInputStyle(idx, 'duesEmergency', 55)} title={getFieldError(idx, 'duesEmergency')} />
                    </td>

                    {/* 43-45. Blood Bank */}
                    <td style={{ borderLeft: '1px solid var(--border)', borderBottom: '1px solid var(--border)', padding: 2 }}>
                      <input type="number" min="0" value={r.bloodPosts ?? ''} onChange={(e) => updateForm7Row(idx, 'bloodPosts', e.target.value)} style={getTableInputStyle(idx, 'bloodPosts', 45)} title={getFieldError(idx, 'bloodPosts')} />
                    </td>
                    <td style={{ borderLeft: '1px solid var(--border)', borderBottom: '1px solid var(--border)', padding: 2 }}>
                      <input type="number" min="0" value={r.bloodCash ?? ''} onChange={(e) => updateForm7Row(idx, 'bloodCash', e.target.value)} style={getTableInputStyle(idx, 'bloodCash', 50)} title={getFieldError(idx, 'bloodCash')} />
                    </td>
                    <td style={{ borderLeft: '1px solid var(--border)', borderBottom: '1px solid var(--border)', padding: 2 }}>
                      <input type="number" min="0" value={r.bloodZakat ?? ''} onChange={(e) => updateForm7Row(idx, 'bloodZakat', e.target.value)} style={getTableInputStyle(idx, 'bloodZakat', 50)} title={getFieldError(idx, 'bloodZakat')} />
                    </td>

                    {/* Action */}
                    <td style={{ borderBottom: '1px solid var(--border)', padding: 2 }}>
                      <button
                        type="button"
                        onClick={() => removeForm7Row(idx)}
                        style={{ background: 'none', border: 'none', color: '#ef4444', cursor: 'pointer', fontSize: 13 }}
                        title={t('proforma.form7.removeArea', 'Remove this Area Unit')}
                      >
                        ✕
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>

              {/* Table Footer: Column Totals */}
              <tfoot
                style={{
                  position: 'sticky',
                  bottom: 0,
                  zIndex: 15,
                  background: 'var(--surface-alt)',
                  fontWeight: 700,
                  fontSize: 11,
                  boxShadow: '0 -2px 4px rgba(0,0,0,0.06)',
                }}
              >
                <tr style={{ background: 'var(--surface-alt)', borderTop: '2px solid var(--border)' }}>
                  <td
                    colSpan={2}
                    style={{
                      position: 'sticky',
                      right: 0,
                      zIndex: 18,
                      background: 'var(--surface-alt)',
                      padding: 8,
                      textAlign: 'center',
                      borderLeft: '2px solid var(--primary, #38bdf8)',
                    }}
                  >
                    {t('proforma.form7.totalSummary', 'مجموعه / ټول (Total Summary)')}
                  </td>
                  {/* Exec Totals */}
                  <td style={{ borderLeft: '1px solid var(--border)', padding: 4 }}>{totals.execMeetings}</td>
                  <td style={{ borderLeft: '1px solid var(--border)', padding: 4 }}>{totals.execTotalMembers}</td>
                  <td style={{ borderLeft: '1px solid var(--border)', padding: 4 }}>{totals.execPresent}</td>
                  <td style={{ borderLeft: '1px solid var(--border)', padding: 4 }}>{totals.execHeld}</td>
                  <td style={{ borderLeft: '1px solid var(--border)', padding: 4, color: '#0284c7' }}>{totals.execPct}</td>

                  {/* Comm Totals */}
                  <td style={{ borderLeft: '1px solid var(--border)', padding: 4 }}>{totals.commMeetings}</td>
                  <td style={{ borderLeft: '1px solid var(--border)', padding: 4 }}>{totals.commTotalMembers}</td>
                  <td style={{ borderLeft: '1px solid var(--border)', padding: 4 }}>{totals.commPresent}</td>
                  <td style={{ borderLeft: '1px solid var(--border)', padding: 4 }}>{totals.commHeld}</td>
                  <td style={{ borderLeft: '1px solid var(--border)', padding: 4, color: '#6366f1' }}>{totals.commPct}</td>

                  {/* BU Count Totals */}
                  <td style={{ borderLeft: '1px solid var(--border)', padding: 4 }}>{totals.buCount}</td>
                  <td style={{ borderLeft: '1px solid var(--border)', padding: 4 }}>{totals.newBuCount}</td>

                  {/* BU Exec Totals */}
                  <td style={{ borderLeft: '1px solid var(--border)', padding: 4 }}>{totals.buExecUnitsTotal}</td>
                  <td style={{ borderLeft: '1px solid var(--border)', padding: 4 }}>{totals.buExecUnitsPresent}</td>
                  <td style={{ borderLeft: '1px solid var(--border)', padding: 4 }}>{totals.buExecMeetingsTotal}</td>
                  <td style={{ borderLeft: '1px solid var(--border)', padding: 4 }}>{totals.buExecMeetingsHeld}</td>
                  <td style={{ borderLeft: '1px solid var(--border)', padding: 4, color: '#14b8a6' }}>{totals.buExecPct}</td>

                  {/* BU GB Totals */}
                  <td style={{ borderLeft: '1px solid var(--border)', padding: 4 }}>{totals.buGbMeetingsTotal}</td>
                  <td style={{ borderLeft: '1px solid var(--border)', padding: 4 }}>{totals.buGbMeetingsHeld}</td>
                  <td style={{ borderLeft: '1px solid var(--border)', padding: 4, color: '#0ea5e9' }}>{totals.buGbPct}</td>
                  <td style={{ borderLeft: '1px solid var(--border)', padding: 4, color: '#ef4444' }}>{totals.inactiveBuCount}</td>

                  {/* Membership Totals */}
                  <td style={{ borderLeft: '1px solid var(--border)', padding: 4 }}>{totals.membershipTotal}</td>
                  <td style={{ borderLeft: '1px solid var(--border)', padding: 4 }}>{totals.membershipPresent}</td>
                  <td style={{ borderLeft: '1px solid var(--border)', padding: 4, color: '#f59e0b' }}>{totals.membershipPct}</td>

                  {/* Study Totals */}
                  <td style={{ borderLeft: '1px solid var(--border)', padding: 4 }}>{totals.studyAreaComm}</td>
                  <td style={{ borderLeft: '1px solid var(--border)', padding: 4 }}>{totals.studyUnitsComm}</td>
                  <td style={{ borderLeft: '1px solid var(--border)', padding: 4 }}>{totals.studyUnitsCount}</td>
                  <td style={{ borderLeft: '1px solid var(--border)', padding: 4, color: '#eab308' }}>{totals.studyPct}</td>

                  {/* Programs Totals */}
                  <td style={{ borderLeft: '1px solid var(--border)', padding: 4 }}>{totals.programsCount}</td>
                  <td style={{ borderLeft: '1px solid var(--border)', padding: 4 }}>{totals.inductionPrograms}</td>
                  <td style={{ borderLeft: '1px solid var(--border)', padding: 4 }}>{totals.newInductions}</td>

                  {/* PSO */}
                  <td style={{ borderLeft: '1px solid var(--border)', padding: 4 }}>{totals.psoUnitsCount}</td>

                  {/* Gatherings */}
                  <td style={{ borderLeft: '1px solid var(--border)', padding: 4 }}>{totals.ralliesCount}</td>
                  <td style={{ borderLeft: '1px solid var(--border)', padding: 4 }}>{totals.jirgasCount}</td>
                  <td style={{ borderLeft: '1px solid var(--border)', padding: 4 }}>{totals.unitGatherings}</td>

                  {/* Villages Without Unit */}
                  <td style={{ borderLeft: '1px solid var(--border)', padding: 4 }}>{totals.villagesWithoutUnit}</td>

                  {/* Active Offices */}
                  <td style={{ borderLeft: '1px solid var(--border)', padding: 4, color: '#22c55e' }}>{totals.activeOffices}</td>

                  {/* Dues Totals */}
                  <td style={{ borderLeft: '1px solid var(--border)', padding: 4 }}>{totals.duesMonthly.toLocaleString()}</td>
                  <td style={{ borderLeft: '1px solid var(--border)', padding: 4 }}>{totals.duesOrg.toLocaleString()}</td>
                  <td style={{ borderLeft: '1px solid var(--border)', padding: 4 }}>{totals.duesEmergency.toLocaleString()}</td>

                  {/* Blood Bank Totals */}
                  <td style={{ borderLeft: '1px solid var(--border)', padding: 4 }}>{totals.bloodPosts}</td>
                  <td style={{ borderLeft: '1px solid var(--border)', padding: 4 }}>{totals.bloodCash.toLocaleString()}</td>
                  <td style={{ borderLeft: '1px solid var(--border)', padding: 4 }}>{totals.bloodZakat.toLocaleString()}</td>

                  <td style={{ padding: 4 }}>—</td>
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
        <h4 style={{ margin: '0 0 14px', color: 'var(--primary, #38bdf8)', display: 'flex', alignItems: 'center', gap: 8, fontSize: 15 }}>
          <span>✍️</span>
          <span>{t('proforma.form7.signaturesTitle', 'Official District Leadership Signatures (د ضلعي مشرتابه رسمي لاسليکونه)')}</span>
        </h4>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: 16 }}>
          <div style={{ padding: 12, background: 'var(--surface-alt)', borderRadius: 8, border: '1px solid var(--border)' }}>
            <label style={{ display: 'block', fontWeight: 700, fontSize: 13, marginBottom: 8, color: 'var(--text-main)' }}>
              ✍️ {t('proforma.form7.distPresidentSignature', 'District President Signature (ضلعي صدر لاسليک)')}
            </label>
            <input
              type="text"
              value={formData.distPresidentSignature || ''}
              onChange={(e) => updateField('distPresidentSignature', e.target.value)}
              placeholder={t('proforma.form7.signaturePlaceholder', 'Name / Digital signature / Date')}
              style={{ width: '100%', padding: '8px 12px', fontSize: 13, borderRadius: 6, fontWeight: 600 }}
            />
          </div>

          <div style={{ padding: 12, background: 'var(--surface-alt)', borderRadius: 8, border: '1px solid var(--border)' }}>
            <label style={{ display: 'block', fontWeight: 700, fontSize: 13, marginBottom: 8, color: 'var(--text-main)' }}>
              ✍️ {t('proforma.form7.distSecSignature', 'District General Secretary Signature (ضلعي جنرل سيکرټري لاسليک)')}
            </label>
            <input
              type="text"
              value={formData.distSecSignature || ''}
              onChange={(e) => updateField('distSecSignature', e.target.value)}
              placeholder={t('proforma.form7.signaturePlaceholder', 'Name / Digital signature / Date')}
              style={{ width: '100%', padding: '8px 12px', fontSize: 13, borderRadius: 6, fontWeight: 600 }}
            />
          </div>
        </div>
      </div>
    </div>
  );
}
