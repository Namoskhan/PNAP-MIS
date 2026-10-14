import React, { useMemo } from 'react';

/**
 * Form8Workspace:
 * District Central & Provincial Committee Members Monthly Work & Activity Report
 * (ضلع کښي مرکزي، صوبائي کميټي د غړو د کار او فعاليت رپورټ)
 *
 * Implements 22-column interactive editing with:
 * - Dual view modes: Interactive Cards View & Official 22-column Table View
 * - Dynamic bilingual localization (English, Pashto, Urdu)
 * - Visual validation highlighting with tooltips & inline error indicators
 * - One-click Auto-Calculate and Auto-Correct tools
 * - Automatic calculation of Total Meetings
 * - Comrade addition/removal/filtering
 * - Official district leadership signature blocks
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
  // Filtered rows for search
  const filteredRows = useMemo(() => {
    return rows
      .map((r, originalIdx) => ({ r, originalIdx }))
      .filter(({ r }) => !form8Search || (r.name || '').toLowerCase().includes(form8Search.toLowerCase()));
  }, [rows, form8Search]);

  // Aggregate calculations for KPI and Table Footer
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
    const bloodBank = sum('bloodBank');

    const activeCount = rows.filter((r) => r.activeStatus === 'فعاله').length;
    const comradesCount = rows.filter((r) => r.name && r.name.trim()).length || rows.length;

    return {
      comradesCount,
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

  // Field validation helpers
  const getFieldError = (idx, field) => {
    const rowErr = form8Validation.rowErrors?.[idx];
    return rowErr?.[field] || null;
  };

  const getCardInputStyle = (idx, field) => {
    const isErr = Boolean(getFieldError(idx, field));
    return {
      width: '100%',
      padding: '6px 10px',
      fontSize: 13,
      borderRadius: 5,
      border: isErr ? '1.5px solid #ef4444' : '1px solid var(--border)',
      background: isErr ? 'rgba(239, 68, 68, 0.08)' : 'var(--surface-alt)',
      color: isErr ? '#ef4444' : 'inherit',
      fontWeight: isErr ? 700 : 500,
      transition: 'border-color 0.2s, background 0.2s',
    };
  };

  const getTableInputStyle = (idx, field, customWidth = 50) => {
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
            {t('proforma.form8.kpiTotalComrades', 'Total Comrades')}
          </div>
          <div style={{ fontSize: 22, fontWeight: 'bold', marginTop: 4, display: 'flex', alignItems: 'center', gap: 8 }}>
            <span>👥 {totals.comradesCount}</span>
            <span style={{ fontSize: 11, padding: '2px 6px', borderRadius: 4, background: 'rgba(34, 197, 94, 0.15)', color: '#22c55e', fontWeight: 600 }}>
              {totals.activeCount} {t('proforma.form8.activeOption', 'فعاله (Active)')}
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
      <div
        className="card"
        style={{
          padding: '12px 16px',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          flexWrap: 'wrap',
          gap: 12,
          background: 'var(--surface)',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap', flex: 1, minWidth: 260 }}>
          {/* Dual View Toggle */}
          <div
            style={{
              display: 'inline-flex',
              padding: 3,
              background: 'var(--surface-alt)',
              borderRadius: 8,
              border: '1px solid var(--border)',
            }}
          >
            <button
              type="button"
              onClick={() => setForm8ViewMode('cards')}
              style={{
                padding: '6px 14px',
                borderRadius: 6,
                border: 'none',
                background: form8ViewMode === 'cards' ? 'var(--primary, #38bdf8)' : 'transparent',
                color: form8ViewMode === 'cards' ? '#fff' : 'var(--text-main)',
                fontWeight: 700,
                fontSize: 12,
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: 6,
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
                background: form8ViewMode === 'table' ? 'var(--primary, #38bdf8)' : 'transparent',
                color: form8ViewMode === 'table' ? '#fff' : 'var(--text-main)',
                fontWeight: 700,
                fontSize: 12,
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: 6,
              }}
            >
              <span>📊</span>
              <span>{t('proforma.form8.viewTable', 'Official Table View (22 Columns)')}</span>
            </button>
          </div>

          {/* Search by Name */}
          <input
            type="text"
            value={form8Search}
            onChange={(e) => setForm8Search(e.target.value)}
            placeholder={t('proforma.form8.searchPlaceholder', 'Search comrade by name...')}
            style={{
              padding: '7px 12px',
              fontSize: 13,
              borderRadius: 6,
              border: '1px solid var(--border)',
              minWidth: 220,
              background: 'var(--surface-alt)',
            }}
          />
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
          {handleAutoFixForm8Inconsistencies && !form8Validation.isValid && (
            <button
              type="button"
              className="btn"
              onClick={handleAutoFixForm8Inconsistencies}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 6,
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
              display: 'flex',
              alignItems: 'center',
              gap: 6,
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
            style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, fontWeight: 700 }}
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
                  className="card"
                  style={{
                    padding: 16,
                    border: '1px solid var(--border)',
                    borderRight: isRtl ? '4px solid #0284c7' : '1px solid var(--border)',
                    borderLeft: !isRtl ? '4px solid #0284c7' : '1px solid var(--border)',
                    background: 'var(--surface)',
                  }}
                >
                  {/* Card Header */}
                  <div
                    style={{
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'center',
                      marginBottom: 14,
                      paddingBottom: 10,
                      borderBottom: '1px solid var(--border)',
                      flexWrap: 'wrap',
                      gap: 8,
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10, flex: 1, minWidth: 260 }}>
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
                        }}
                      >
                        {originalIdx + 1}
                      </span>
                      <div style={{ flex: 1, maxWidth: 360 }}>
                        <input
                          type="text"
                          value={r.name || ''}
                          onChange={(e) => updateForm8Row(originalIdx, 'name', e.target.value)}
                          placeholder={t('proforma.form8.name', 'Comrade Name (ملګري نوم)')}
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

                    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                      <select
                        value={r.activeStatus || 'فعاله'}
                        onChange={(e) => updateForm8Row(originalIdx, 'activeStatus', e.target.value)}
                        style={{
                          padding: '6px 12px',
                          borderRadius: 6,
                          fontSize: 12,
                          fontWeight: 700,
                          background: r.activeStatus === 'فعاله' ? 'rgba(34, 197, 94, 0.15)' : 'rgba(239, 68, 68, 0.15)',
                          color: r.activeStatus === 'فعاله' ? '#22c55e' : '#ef4444',
                          border: '1px solid var(--border)',
                        }}
                      >
                        <option value="فعاله">{t('proforma.form8.activeOption', 'فعاله (Active)')}</option>
                        <option value="غير فعاله">{t('proforma.form8.inactiveOption', 'غير فعاله (Inactive)')}</option>
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
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: 14 }}>
                    {/* Group 1: Committee & Executive Meetings */}
                    <div style={{ padding: 12, background: 'var(--surface-alt)', borderRadius: 8, border: '1px solid var(--border)' }}>
                      <div style={{ fontWeight: 700, fontSize: 12, marginBottom: 8, color: '#0284c7' }}>
                        🤝 {t('proforma.form8.secMeetings', 'Committee & Executive Meetings')}
                      </div>
                      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 8 }}>
                        <div>
                          <label style={{ fontSize: 11, color: 'var(--text-soft)', display: 'block', marginBottom: 2 }}>
                            {t('proforma.form8.distCommMeeting', 'Dist Comm (ضلعي کميټي)')}
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
                            {t('proforma.form8.areaExecMeeting', 'Area Exec (علاقائي ايګزيکټيو)')}
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
                            {t('proforma.form8.areaCommMeeting', 'Area Comm (علاقائي کميټي)')}
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
                            {t('proforma.form8.ownBuMeeting', 'Own Unit (خپل يونټ)')}
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
                            {t('proforma.form8.buExecMeeting', 'BU Exec (يونټ ايګزيکټيو)')}
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
                            {t('proforma.form8.buMeeting', 'Basic Units (ابتدائي يونټانو)')}
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
                            {t('proforma.form8.psoMeeting', 'PSO Mtgs (PSO سره غونډي)')}
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
                          <label style={{ fontSize: 11, color: 'var(--text-soft)', display: 'block', marginBottom: 2, fontWeight: 700 }}>
                            {t('proforma.form8.totalMeetings', 'Total Mtgs (ټولي غونډي)')}
                          </label>
                          <input
                            type="number"
                            readOnly
                            value={r.totalMeetings ?? ''}
                            style={{
                              ...getCardInputStyle(originalIdx, 'totalMeetings'),
                              background: '#e0f2fe',
                              fontWeight: 700,
                            }}
                          />
                        </div>
                      </div>
                    </div>

                    {/* Group 2: Conferences, Seminars, Study Circles & Inductions */}
                    <div style={{ padding: 12, background: 'var(--surface-alt)', borderRadius: 8, border: '1px solid var(--border)' }}>
                      <div style={{ fontWeight: 700, fontSize: 12, marginBottom: 8, color: '#8b5cf6' }}>
                        🎓 {t('proforma.form8.secPrograms', 'Programs, Circles & Inductions')}
                      </div>
                      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 8 }}>
                        <div>
                          <label style={{ fontSize: 11, color: 'var(--text-soft)', display: 'block', marginBottom: 2 }}>
                            {t('proforma.form8.conferences', 'Conferences (کانفرنسونه)')}
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
                            {t('proforma.form8.seminars', 'Seminars (سيمينارونه)')}
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
                            {t('proforma.form8.studyCircles', 'Study Circles (سټډي سرکل)')}
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
                            {t('proforma.form8.inductions', 'Inductions (شموليت)')}
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
                            {t('proforma.form8.publicGatherings', 'Rallies & Jirgas (جلسے مظاهرے جرګے)')}
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

                    {/* Group 3: Dues, Tours, Contacts, Reading & Blood Bank */}
                    <div style={{ padding: 12, background: 'var(--surface-alt)', borderRadius: 8, border: '1px solid var(--border)' }}>
                      <div style={{ fontWeight: 700, fontSize: 12, marginBottom: 8, color: '#10b981' }}>
                        💰 {t('proforma.form8.secDuesAndVisits', 'Finances, Tours & Contacts')}
                      </div>
                      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 8 }}>
                        <div>
                          <label style={{ fontSize: 11, color: 'var(--text-soft)', display: 'block', marginBottom: 2 }}>
                            {t('proforma.form8.monthlyDues', 'Monthly Dues (چنده)')}
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
                            {t('proforma.form8.tours', 'Tours (دوره)')}
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
                            {t('proforma.form8.contacts', 'Contacts (رابطے)')}
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
                            {t('proforma.form8.officeAttendance', 'Office Att (دفتر حاضري)')}
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
                            {t('proforma.form8.bloodBank', 'Blood Bank (بلډ بينک/زکات)')}
                          </label>
                          <input
                            type="text"
                            value={r.bloodBank || ''}
                            onChange={(e) => updateForm8Row(originalIdx, 'bloodBank', e.target.value)}
                            style={getCardInputStyle(originalIdx, 'bloodBank')}
                          />
                        </div>
                        <div>
                          <label style={{ fontSize: 11, color: 'var(--text-soft)', display: 'block', marginBottom: 2 }}>
                            {t('proforma.form8.ideologicalReading', 'Reading (لوستنه مطالعه)')}
                          </label>
                          <input
                            type="text"
                            value={r.ideologicalReading || ''}
                            onChange={(e) => updateForm8Row(originalIdx, 'ideologicalReading', e.target.value)}
                            placeholder="Book name / topic"
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
        <div className="card" style={{ padding: 14, overflow: 'hidden' }}>
          <div style={{ overflowX: 'auto', maxHeight: '72vh' }}>
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
                <tr style={{ background: '#f1f5f9', color: '#000', fontWeight: 'bold' }}>
                  <th style={{ width: 36, padding: 4 }}>#</th>
                  <th
                    style={{
                      width: 130,
                      padding: 4,
                      position: 'sticky',
                      right: 0,
                      zIndex: 22,
                      background: '#f1f5f9',
                      borderLeft: '2px solid var(--primary, #38bdf8)',
                    }}
                  >
                    {t('proforma.form8.name', 'ملګري نوم')}
                  </th>
                  <th style={{ width: 48, padding: 4 }}>ضلعي کميټي</th>
                  <th style={{ width: 50, padding: 4 }}>علاقائي ايګزيکټيو</th>
                  <th style={{ width: 50, padding: 4 }}>علاقائي کميټي</th>
                  <th style={{ width: 48, padding: 4 }}>خپل يونټ</th>
                  <th style={{ width: 50, padding: 4 }}>يونټ ايګزيکټيو</th>
                  <th style={{ width: 50, padding: 4 }}>ابتدائي يونټانو</th>
                  <th style={{ width: 46, padding: 4 }}>PSO سره</th>
                  <th style={{ width: 48, padding: 4 }}>کانفرنسونه</th>
                  <th style={{ width: 46, padding: 4 }}>سيمينارونه</th>
                  <th style={{ width: 46, padding: 4 }}>سټډي سرکل</th>
                  <th style={{ width: 48, padding: 4 }}>شموليت</th>
                  <th style={{ width: 64, padding: 4 }}>جلسے مظاهرے</th>
                  <th style={{ width: 46, padding: 4, background: '#e0f2fe' }}>ټولي غونډي</th>
                  <th style={{ width: 50, padding: 4 }}>مياشتني چنده</th>
                  <th style={{ width: 42, padding: 4 }}>دوره</th>
                  <th style={{ width: 52, padding: 4 }}>رابطے تنظيمي</th>
                  <th style={{ width: 46, padding: 4 }}>دفتر حاضري</th>
                  <th style={{ width: 62, padding: 4 }}>فعاله/غير</th>
                  <th style={{ width: 85, padding: 4 }}>لوستنه (مطالعه)</th>
                  <th style={{ width: 55, padding: 4 }}>بلډ بينک/زکات</th>
                  <th style={{ width: 36, padding: 4 }}>🗑️</th>
                </tr>
              </thead>
              <tbody>
                {filteredRows.map(({ r, originalIdx }) => (
                  <tr key={originalIdx} style={{ borderBottom: '1px solid var(--border)' }}>
                    <td style={{ padding: 3, fontWeight: 700 }}>{originalIdx + 1}</td>
                    <td
                      style={{
                        padding: 3,
                        position: 'sticky',
                        right: 0,
                        zIndex: 10,
                        background: 'var(--surface)',
                        borderLeft: '2px solid var(--primary, #38bdf8)',
                      }}
                    >
                      <input
                        type="text"
                        value={r.name || ''}
                        onChange={(e) => updateForm8Row(originalIdx, 'name', e.target.value)}
                        placeholder="Comrade name"
                        style={{
                          ...getTableInputStyle(originalIdx, 'name', 120),
                          textAlign: 'right',
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
                        style={getTableInputStyle(originalIdx, 'tours', 42)}
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
                          fontSize: 10,
                          padding: '2px 4px',
                          borderRadius: 4,
                          fontWeight: 600,
                          border: '1px solid var(--border)',
                          background: r.activeStatus === 'فعاله' ? 'rgba(34, 197, 94, 0.15)' : 'rgba(239, 68, 68, 0.15)',
                          color: r.activeStatus === 'فعاله' ? '#22c55e' : '#ef4444',
                        }}
                      >
                        <option value="فعاله">فعاله</option>
                        <option value="غير فعاله">غير فعاله</option>
                      </select>
                    </td>
                    <td style={{ padding: 2 }}>
                      <input
                        type="text"
                        value={r.ideologicalReading || ''}
                        onChange={(e) => updateForm8Row(originalIdx, 'ideologicalReading', e.target.value)}
                        placeholder="Book/topic"
                        style={{
                          ...getTableInputStyle(originalIdx, 'ideologicalReading', 80),
                          textAlign: 'right',
                        }}
                      />
                    </td>
                    <td style={{ padding: 2 }}>
                      <input
                        type="text"
                        value={r.bloodBank || ''}
                        onChange={(e) => updateForm8Row(originalIdx, 'bloodBank', e.target.value)}
                        style={getTableInputStyle(originalIdx, 'bloodBank', 50)}
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
                          fontSize: 12,
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
                <tr style={{ background: 'var(--surface-alt)', borderTop: '2px solid var(--border)' }}>
                  <td colSpan={2} style={{ padding: 6, textAlign: 'center', fontWeight: 'bold' }}>
                    {t('proforma.form8.totalSummary', 'مجموعه / ټول (Total Summary)')}
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
                  <td style={{ padding: 3, color: '#22c55e' }}>{totals.activeCount} فعاله</td>
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
            <span>{t('proforma.form8.signaturesTitle', 'Official District Leadership Signatures (د ضلعي مشرتابه رسمي لاسليکونه)')}</span>
          </h4>
          <p style={{ margin: 0, fontSize: 12, color: 'var(--text-soft)', lineHeight: 1.4 }}>
            {t(
              'proforma.form8.signaturesDesc',
              'Official party proformas require authorization by the District President and District General Secretary. When filled, these digital signatures and signing date will appear directly on the official printed A4 report, PDF export, and archival records.'
            )}
          </p>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: 16 }}>
          <div style={{ padding: 12, background: 'var(--surface-alt)', borderRadius: 8, border: '1px solid var(--border)' }}>
            <label style={{ display: 'block', fontWeight: 700, fontSize: 13, marginBottom: 8, color: 'var(--text-main)' }}>
              ✍️ {t('proforma.form8.distPresidentSignature', 'District President Signature (ضلعي صدر لاسليک)')}
            </label>
            <input
              type="text"
              value={formData.distPresidentSignature || ''}
              onChange={(e) => updateField('distPresidentSignature', e.target.value)}
              placeholder={t('proforma.form8.signaturePlaceholder', 'Name / Digital signature / Date')}
              style={{ width: '100%', padding: '8px 12px', fontSize: 13, borderRadius: 6, fontWeight: 600 }}
            />
          </div>

          <div style={{ padding: 12, background: 'var(--surface-alt)', borderRadius: 8, border: '1px solid var(--border)' }}>
            <label style={{ display: 'block', fontWeight: 700, fontSize: 13, marginBottom: 8, color: 'var(--text-main)' }}>
              ✍️ {t('proforma.form8.distSecSignature', 'District General Secretary Signature (ضلعي جنرل سيکرټري لاسليک)')}
            </label>
            <input
              type="text"
              value={formData.distSecSignature || ''}
              onChange={(e) => updateField('distSecSignature', e.target.value)}
              placeholder={t('proforma.form8.signaturePlaceholder', 'Name / Digital signature / Date')}
              style={{ width: '100%', padding: '8px 12px', fontSize: 13, borderRadius: 6, fontWeight: 600 }}
            />
          </div>

          <div style={{ padding: 12, background: 'var(--surface-alt)', borderRadius: 8, border: '1px solid var(--border)' }}>
            <label style={{ display: 'block', fontWeight: 700, fontSize: 13, marginBottom: 8, color: 'var(--text-main)' }}>
              📅 {t('proforma.form8.signatureDate', 'Date of Signature (د دستخط نېټه)')}
            </label>
            <input
              type="date"
              value={formData.signatureDate || formData.distSignatureDate || ''}
              onChange={(e) => {
                updateField('signatureDate', e.target.value);
                updateField('distSignatureDate', e.target.value);
              }}
              style={{ width: '100%', padding: '8px 12px', fontSize: 13, borderRadius: 6, fontWeight: 600 }}
            />
          </div>
        </div>
      </div>
    </div>
  );
}
