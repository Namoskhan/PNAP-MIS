import React, { useMemo } from 'react';

/**
 * Form7Workspace:
 * District Subordinate Area Units Monthly Work & Activity Report
 * (ضلع کښي علاقائي يونټانو د کار او فعاليت مياشتنئي رپورټ)
 *
 * Implements full 14-group, 45-column interactive editing with:
 * - Summary KPI cards
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
  form7Validation = { isValid: true, errors: [] },
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
              {totals.activeOffices} {t('proforma.active', 'Active')}
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
      {/* 2. CONTROLS TOOLBAR */}
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

      {/* Validation warning if any */}
      {!form7Validation.isValid && (
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
            gap: 8,
          }}
        >
          <span style={{ fontSize: 16 }}>⚠️</span>
          <span>{form7Validation.errors[0]}</span>
        </div>
      )}

      {/* ────────────────────────────────────────────────────────────────────────── */}
      {/* 3. CARDS VIEW */}
      {/* ────────────────────────────────────────────────────────────────────────── */}
      {form7ViewMode === 'cards' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          {filteredRows.map(({ r, originalIdx: idx }) => (
            <div
              key={r.unitId || idx}
              className="card"
              style={{
                padding: 16,
                border: '1px solid var(--border)',
                background: 'var(--surface)',
                borderRadius: 10,
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
                      background: '#0284c7',
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
                      }}
                    />
                  </div>
                </div>

                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    <label style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-soft)' }}>
                      {t('proforma.form7.officeActivity', 'Office Activity')}:
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
                      <option value="فعاله">فعاله (Active)</option>
                      <option value="غير فعاله">غير فعاله (Inactive)</option>
                    </select>
                  </div>

                  <button
                    type="button"
                    onClick={() => removeForm7Row(idx)}
                    className="btn secondary"
                    style={{ padding: '4px 10px', color: '#ef4444', borderColor: '#ef4444', fontSize: 12 }}
                    title="Remove this Area Unit row"
                  >
                    🗑️
                  </button>
                </div>
              </div>

              {/* 8 Structured Sections Grid */}
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: 12 }}>
                {/* 1. Executive Meetings */}
                <div style={{ background: 'var(--surface-alt)', padding: 12, borderRadius: 8, border: '1px solid rgba(2, 132, 199, 0.2)' }}>
                  <div style={{ fontWeight: 700, fontSize: 12, color: '#0284c7', marginBottom: 8, display: 'flex', justifyContent: 'space-between' }}>
                    <span>🤝 {t('proforma.form7.secExecMeetings', 'ايګزيکټيو غونډي')}</span>
                    <span style={{ background: '#0284c7', color: '#fff', padding: '1px 6px', borderRadius: 4, fontSize: 11 }}>{r.execPct || '0%'}</span>
                  </div>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6, fontSize: 11 }}>
                    <div>
                      <label style={{ display: 'block', color: 'var(--text-soft)' }}>غونډي (Meetings)</label>
                      <input type="number" min="0" value={r.execMeetings ?? ''} onChange={(e) => updateForm7Row(idx, 'execMeetings', e.target.value)} style={{ width: '100%', padding: '4px 6px', fontSize: 12 }} />
                    </div>
                    <div>
                      <label style={{ display: 'block', color: 'var(--text-soft)' }}>ټول شمير (Total)</label>
                      <input type="number" min="0" value={r.execTotalMembers ?? ''} onChange={(e) => updateForm7Row(idx, 'execTotalMembers', e.target.value)} style={{ width: '100%', padding: '4px 6px', fontSize: 12 }} />
                    </div>
                    <div>
                      <label style={{ display: 'block', color: 'var(--text-soft)' }}>حاضر ملګري (Present)</label>
                      <input type="number" min="0" value={r.execPresent ?? ''} onChange={(e) => updateForm7Row(idx, 'execPresent', e.target.value)} style={{ width: '100%', padding: '4px 6px', fontSize: 12 }} />
                    </div>
                    <div>
                      <label style={{ display: 'block', color: 'var(--text-soft)' }}>حاضر غونډو (Held)</label>
                      <input type="number" min="0" value={r.execHeld ?? ''} onChange={(e) => updateForm7Row(idx, 'execHeld', e.target.value)} style={{ width: '100%', padding: '4px 6px', fontSize: 12 }} />
                    </div>
                  </div>
                </div>

                {/* 2. Committee Meetings */}
                <div style={{ background: 'var(--surface-alt)', padding: 12, borderRadius: 8, border: '1px solid rgba(99, 102, 241, 0.2)' }}>
                  <div style={{ fontWeight: 700, fontSize: 12, color: '#6366f1', marginBottom: 8, display: 'flex', justifyContent: 'space-between' }}>
                    <span>🏛️ {t('proforma.form7.secCommMeetings', 'کميټي غونډي')}</span>
                    <span style={{ background: '#6366f1', color: '#fff', padding: '1px 6px', borderRadius: 4, fontSize: 11 }}>{r.commPct || '0%'}</span>
                  </div>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6, fontSize: 11 }}>
                    <div>
                      <label style={{ display: 'block', color: 'var(--text-soft)' }}>غونډي (Meetings)</label>
                      <input type="number" min="0" value={r.commMeetings ?? ''} onChange={(e) => updateForm7Row(idx, 'commMeetings', e.target.value)} style={{ width: '100%', padding: '4px 6px', fontSize: 12 }} />
                    </div>
                    <div>
                      <label style={{ display: 'block', color: 'var(--text-soft)' }}>غړو شمير (Total)</label>
                      <input type="number" min="0" value={r.commTotalMembers ?? ''} onChange={(e) => updateForm7Row(idx, 'commTotalMembers', e.target.value)} style={{ width: '100%', padding: '4px 6px', fontSize: 12 }} />
                    </div>
                    <div>
                      <label style={{ display: 'block', color: 'var(--text-soft)' }}>حاضر ملګري (Present)</label>
                      <input type="number" min="0" value={r.commPresent ?? ''} onChange={(e) => updateForm7Row(idx, 'commPresent', e.target.value)} style={{ width: '100%', padding: '4px 6px', fontSize: 12 }} />
                    </div>
                    <div>
                      <label style={{ display: 'block', color: 'var(--text-soft)' }}>حاضر غونډو (Held)</label>
                      <input type="number" min="0" value={r.commHeld ?? ''} onChange={(e) => updateForm7Row(idx, 'commHeld', e.target.value)} style={{ width: '100%', padding: '4px 6px', fontSize: 12 }} />
                    </div>
                  </div>
                </div>

                {/* 3. Basic Units Count */}
                <div style={{ background: 'var(--surface-alt)', padding: 12, borderRadius: 8, border: '1px solid rgba(16, 185, 129, 0.2)' }}>
                  <div style={{ fontWeight: 700, fontSize: 12, color: '#10b981', marginBottom: 8 }}>
                    🏢 {t('proforma.form7.secBasicUnits', 'ابتدائي يونټانو شمير')}
                  </div>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 6, fontSize: 11 }}>
                    <div>
                      <label style={{ display: 'block', color: 'var(--text-soft)' }}>شمير (Total)</label>
                      <input type="number" min="0" value={r.buCount ?? ''} onChange={(e) => updateForm7Row(idx, 'buCount', e.target.value)} style={{ width: '100%', padding: '4px 6px', fontSize: 12 }} />
                    </div>
                    <div>
                      <label style={{ display: 'block', color: 'var(--text-soft)' }}>نوي (New)</label>
                      <input type="number" min="0" value={r.newBuCount ?? ''} onChange={(e) => updateForm7Row(idx, 'newBuCount', e.target.value)} style={{ width: '100%', padding: '4px 6px', fontSize: 12 }} />
                    </div>
                    <div>
                      <label style={{ display: 'block', color: '#ef4444' }}>غير فعاله (Inactive)</label>
                      <input type="number" min="0" value={r.inactiveBuCount ?? ''} onChange={(e) => updateForm7Row(idx, 'inactiveBuCount', e.target.value)} style={{ width: '100%', padding: '4px 6px', fontSize: 12 }} />
                    </div>
                  </div>
                </div>

                {/* 4. Basic Units Executive & GB Meetings */}
                <div style={{ background: 'var(--surface-alt)', padding: 12, borderRadius: 8, border: '1px solid rgba(20, 184, 166, 0.2)' }}>
                  <div style={{ fontWeight: 700, fontSize: 12, color: '#14b8a6', marginBottom: 8, display: 'flex', justifyContent: 'space-between' }}>
                    <span>👥 {t('proforma.form7.secBuExec', 'ابتدائي يونټانو غونډي')}</span>
                    <span style={{ fontSize: 11, color: 'var(--text-soft)' }}>Exec: {r.buExecPct || '0%'} | GB: {r.buGbPct || '0%'}</span>
                  </div>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 6, fontSize: 11 }}>
                    <div>
                      <label style={{ display: 'block', color: 'var(--text-soft)' }}>ايګزيکټيو غړو</label>
                      <input type="number" min="0" value={r.buExecUnitsTotal ?? ''} onChange={(e) => updateForm7Row(idx, 'buExecUnitsTotal', e.target.value)} style={{ width: '100%', padding: '4px 6px', fontSize: 12 }} />
                    </div>
                    <div>
                      <label style={{ display: 'block', color: 'var(--text-soft)' }}>حاضر غړو</label>
                      <input type="number" min="0" value={r.buExecUnitsPresent ?? ''} onChange={(e) => updateForm7Row(idx, 'buExecUnitsPresent', e.target.value)} style={{ width: '100%', padding: '4px 6px', fontSize: 12 }} />
                    </div>
                    <div>
                      <label style={{ display: 'block', color: 'var(--text-soft)' }}>ايګزيکټيو غونډو</label>
                      <input type="number" min="0" value={r.buExecMeetingsTotal ?? ''} onChange={(e) => updateForm7Row(idx, 'buExecMeetingsTotal', e.target.value)} style={{ width: '100%', padding: '4px 6px', fontSize: 12 }} />
                    </div>
                    <div>
                      <label style={{ display: 'block', color: 'var(--text-soft)' }}>حاضر غونډو</label>
                      <input type="number" min="0" value={r.buExecMeetingsHeld ?? ''} onChange={(e) => updateForm7Row(idx, 'buExecMeetingsHeld', e.target.value)} style={{ width: '100%', padding: '4px 6px', fontSize: 12 }} />
                    </div>
                    <div>
                      <label style={{ display: 'block', color: 'var(--text-soft)' }}>GB غونډو (ټول)</label>
                      <input type="number" min="0" value={r.buGbMeetingsTotal ?? ''} onChange={(e) => updateForm7Row(idx, 'buGbMeetingsTotal', e.target.value)} style={{ width: '100%', padding: '4px 6px', fontSize: 12 }} />
                    </div>
                    <div>
                      <label style={{ display: 'block', color: 'var(--text-soft)' }}>GB حاضر غونډو</label>
                      <input type="number" min="0" value={r.buGbMeetingsHeld ?? ''} onChange={(e) => updateForm7Row(idx, 'buGbMeetingsHeld', e.target.value)} style={{ width: '100%', padding: '4px 6px', fontSize: 12 }} />
                    </div>
                  </div>
                </div>

                {/* 5. Membership & Ideological Study */}
                <div style={{ background: 'var(--surface-alt)', padding: 12, borderRadius: 8, border: '1px solid rgba(245, 158, 11, 0.2)' }}>
                  <div style={{ fontWeight: 700, fontSize: 12, color: '#f59e0b', marginBottom: 8, display: 'flex', justifyContent: 'space-between' }}>
                    <span>📖 {t('proforma.form7.secMembership', 'غړيتوب او مطالعه')}</span>
                    <span style={{ fontSize: 11, color: 'var(--text-soft)' }}>غړي: {r.membershipPct || '0%'} | مطالعه: {r.studyPct || '0%'}</span>
                  </div>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 6, fontSize: 11 }}>
                    <div>
                      <label style={{ display: 'block', color: 'var(--text-soft)' }}>ټول غړي</label>
                      <input type="number" min="0" value={r.membershipTotal ?? ''} onChange={(e) => updateForm7Row(idx, 'membershipTotal', e.target.value)} style={{ width: '100%', padding: '4px 6px', fontSize: 12 }} />
                    </div>
                    <div>
                      <label style={{ display: 'block', color: 'var(--text-soft)' }}>حاضر غړي</label>
                      <input type="number" min="0" value={r.membershipPresent ?? ''} onChange={(e) => updateForm7Row(idx, 'membershipPresent', e.target.value)} style={{ width: '100%', padding: '4px 6px', fontSize: 12 }} />
                    </div>
                    <div>
                      <label style={{ display: 'block', color: 'var(--text-soft)' }}>علاقائي کميټي</label>
                      <input type="number" min="0" value={r.studyAreaComm ?? ''} onChange={(e) => updateForm7Row(idx, 'studyAreaComm', e.target.value)} style={{ width: '100%', padding: '4px 6px', fontSize: 12 }} />
                    </div>
                    <div>
                      <label style={{ display: 'block', color: 'var(--text-soft)' }}>يونټانو کميټي</label>
                      <input type="number" min="0" value={r.studyUnitsComm ?? ''} onChange={(e) => updateForm7Row(idx, 'studyUnitsComm', e.target.value)} style={{ width: '100%', padding: '4px 6px', fontSize: 12 }} />
                    </div>
                    <div>
                      <label style={{ display: 'block', color: 'var(--text-soft)' }}>يونټانو شمير</label>
                      <input type="number" min="0" value={r.studyUnitsCount ?? ''} onChange={(e) => updateForm7Row(idx, 'studyUnitsCount', e.target.value)} style={{ width: '100%', padding: '4px 6px', fontSize: 12 }} />
                    </div>
                  </div>
                </div>

                {/* 6. Programs, Inductions & PSO */}
                <div style={{ background: 'var(--surface-alt)', padding: 12, borderRadius: 8, border: '1px solid rgba(168, 85, 247, 0.2)' }}>
                  <div style={{ fontWeight: 700, fontSize: 12, color: '#a855f7', marginBottom: 8 }}>
                    🎓 {t('proforma.form7.secPrograms', 'پروګرامونه، شموليت او PSO')}
                  </div>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 6, fontSize: 11 }}>
                    <div>
                      <label style={{ display: 'block', color: 'var(--text-soft)' }}>کانفرنس/سيمينار/سرکل</label>
                      <input type="number" min="0" value={r.programsCount ?? ''} onChange={(e) => updateForm7Row(idx, 'programsCount', e.target.value)} style={{ width: '100%', padding: '4px 6px', fontSize: 12 }} />
                    </div>
                    <div>
                      <label style={{ display: 'block', color: 'var(--text-soft)' }}>شموليت پروګرام</label>
                      <input type="number" min="0" value={r.inductionPrograms ?? ''} onChange={(e) => updateForm7Row(idx, 'inductionPrograms', e.target.value)} style={{ width: '100%', padding: '4px 6px', fontSize: 12 }} />
                    </div>
                    <div>
                      <label style={{ display: 'block', color: 'var(--text-soft)' }}>نوي شموليت</label>
                      <input type="number" min="0" value={r.newInductions ?? ''} onChange={(e) => updateForm7Row(idx, 'newInductions', e.target.value)} style={{ width: '100%', padding: '4px 6px', fontSize: 12 }} />
                    </div>
                    <div>
                      <label style={{ display: 'block', color: 'var(--text-soft)' }}>PSO يونټونو شمير</label>
                      <input type="number" min="0" value={r.psoUnitsCount ?? ''} onChange={(e) => updateForm7Row(idx, 'psoUnitsCount', e.target.value)} style={{ width: '100%', padding: '4px 6px', fontSize: 12 }} />
                    </div>
                  </div>
                </div>

                {/* 7. Public Gatherings & Areas Without Unit */}
                <div style={{ background: 'var(--surface-alt)', padding: 12, borderRadius: 8, border: '1px solid rgba(249, 115, 22, 0.2)' }}>
                  <div style={{ fontWeight: 700, fontSize: 12, color: '#f97316', marginBottom: 8 }}>
                    📢 {t('proforma.form7.secPublicGatherings', 'اولسي غونډي او سيمې')}
                  </div>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 6, fontSize: 11 }}>
                    <div>
                      <label style={{ display: 'block', color: 'var(--text-soft)' }}>جلسے مظاهرے</label>
                      <input type="number" min="0" value={r.ralliesCount ?? ''} onChange={(e) => updateForm7Row(idx, 'ralliesCount', e.target.value)} style={{ width: '100%', padding: '4px 6px', fontSize: 12 }} />
                    </div>
                    <div>
                      <label style={{ display: 'block', color: 'var(--text-soft)' }}>جرګے</label>
                      <input type="number" min="0" value={r.jirgasCount ?? ''} onChange={(e) => updateForm7Row(idx, 'jirgasCount', e.target.value)} style={{ width: '100%', padding: '4px 6px', fontSize: 12 }} />
                    </div>
                    <div>
                      <label style={{ display: 'block', color: 'var(--text-soft)' }}>يونټو غونډي</label>
                      <input type="number" min="0" value={r.unitGatherings ?? ''} onChange={(e) => updateForm7Row(idx, 'unitGatherings', e.target.value)} style={{ width: '100%', padding: '4px 6px', fontSize: 12 }} />
                    </div>
                    <div>
                      <label style={{ display: 'block', color: 'var(--text-soft)' }}>کلي چي يونټ نسته</label>
                      <input type="number" min="0" value={r.villagesWithoutUnit ?? ''} onChange={(e) => updateForm7Row(idx, 'villagesWithoutUnit', e.target.value)} style={{ width: '100%', padding: '4px 6px', fontSize: 12 }} />
                    </div>
                  </div>
                </div>

                {/* 8. Dues & Blood Bank */}
                <div style={{ background: 'var(--surface-alt)', padding: 12, borderRadius: 8, border: '1px solid rgba(16, 185, 129, 0.2)' }}>
                  <div style={{ fontWeight: 700, fontSize: 12, color: '#10b981', marginBottom: 8 }}>
                    💰 {t('proforma.form7.secDues', 'چنده او بلډ بينک')}
                  </div>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 6, fontSize: 11 }}>
                    <div>
                      <label style={{ display: 'block', color: 'var(--text-soft)' }}>ټول (مياشتنۍ)</label>
                      <input type="number" min="0" value={r.duesMonthly ?? ''} onChange={(e) => updateForm7Row(idx, 'duesMonthly', e.target.value)} style={{ width: '100%', padding: '4px 6px', fontSize: 12 }} />
                    </div>
                    <div>
                      <label style={{ display: 'block', color: 'var(--text-soft)' }}>علاقائي (تنظيمي)</label>
                      <input type="number" min="0" value={r.duesOrg ?? ''} onChange={(e) => updateForm7Row(idx, 'duesOrg', e.target.value)} style={{ width: '100%', padding: '4px 6px', fontSize: 12 }} />
                    </div>
                    <div>
                      <label style={{ display: 'block', color: 'var(--text-soft)' }}>هنګامي</label>
                      <input type="number" min="0" value={r.duesEmergency ?? ''} onChange={(e) => updateForm7Row(idx, 'duesEmergency', e.target.value)} style={{ width: '100%', padding: '4px 6px', fontSize: 12 }} />
                    </div>
                    <div>
                      <label style={{ display: 'block', color: 'var(--text-soft)' }}>بلډ پوستونه</label>
                      <input type="number" min="0" value={r.bloodPosts ?? ''} onChange={(e) => updateForm7Row(idx, 'bloodPosts', e.target.value)} style={{ width: '100%', padding: '4px 6px', fontSize: 12 }} />
                    </div>
                    <div>
                      <label style={{ display: 'block', color: 'var(--text-soft)' }}>نغدي</label>
                      <input type="number" min="0" value={r.bloodCash ?? ''} onChange={(e) => updateForm7Row(idx, 'bloodCash', e.target.value)} style={{ width: '100%', padding: '4px 6px', fontSize: 12 }} />
                    </div>
                    <div>
                      <label style={{ display: 'block', color: 'var(--text-soft)' }}>زکات</label>
                      <input type="number" min="0" value={r.bloodZakat ?? ''} onChange={(e) => updateForm7Row(idx, 'bloodZakat', e.target.value)} style={{ width: '100%', padding: '4px 6px', fontSize: 12 }} />
                    </div>
                  </div>
                </div>
              </div>
            </div>
          ))}

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
      {/* 4. TABLE VIEW (OFFICIAL 45 COLUMNS MATCHING PAPER PROFORMA) */}
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
                    شمير
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
                    علاقائي يونټ نوم
                  </th>
                  <th colSpan={5} style={{ background: 'rgba(2, 132, 199, 0.15)', borderLeft: '1px solid var(--border)', borderBottom: '1px solid var(--border)', padding: 6 }}>
                    ايګزيکټيو غونډي
                  </th>
                  <th colSpan={5} style={{ background: 'rgba(99, 102, 241, 0.15)', borderLeft: '1px solid var(--border)', borderBottom: '1px solid var(--border)', padding: 6 }}>
                    کميټي غونډي
                  </th>
                  <th colSpan={2} style={{ background: 'rgba(16, 185, 129, 0.15)', borderLeft: '1px solid var(--border)', borderBottom: '1px solid var(--border)', padding: 6 }}>
                    ابتدائي يونټانو شمير
                  </th>
                  <th colSpan={5} style={{ background: 'rgba(20, 184, 166, 0.15)', borderLeft: '1px solid var(--border)', borderBottom: '1px solid var(--border)', padding: 6 }}>
                    ابتدائي يونټانو ايګزيکټيو
                  </th>
                  <th colSpan={4} style={{ background: 'rgba(14, 165, 233, 0.15)', borderLeft: '1px solid var(--border)', borderBottom: '1px solid var(--border)', padding: 6 }}>
                    ابتدائي يونټانو غونډو شمير
                  </th>
                  <th colSpan={3} style={{ background: 'rgba(245, 158, 11, 0.15)', borderLeft: '1px solid var(--border)', borderBottom: '1px solid var(--border)', padding: 6 }}>
                    غړيتوب (ممبرشپ)
                  </th>
                  <th colSpan={4} style={{ background: 'rgba(234, 179, 8, 0.15)', borderLeft: '1px solid var(--border)', borderBottom: '1px solid var(--border)', padding: 6 }}>
                    لوستنه (مطالعه)
                  </th>
                  <th colSpan={3} style={{ background: 'rgba(168, 85, 247, 0.15)', borderLeft: '1px solid var(--border)', borderBottom: '1px solid var(--border)', padding: 6 }}>
                    پروګرامونه او شموليت
                  </th>
                  <th rowSpan={2} style={{ background: 'rgba(139, 92, 246, 0.15)', borderLeft: '1px solid var(--border)', borderBottom: '1px solid var(--border)', minWidth: 65, padding: 6 }}>
                    PSO يونټانو شمير
                  </th>
                  <th colSpan={3} style={{ background: 'rgba(249, 115, 22, 0.15)', borderLeft: '1px solid var(--border)', borderBottom: '1px solid var(--border)', padding: 6 }}>
                    اولسي غونډي
                  </th>
                  <th rowSpan={2} style={{ background: 'rgba(239, 68, 68, 0.15)', borderLeft: '1px solid var(--border)', borderBottom: '1px solid var(--border)', minWidth: 80, padding: 6 }}>
                    هغه کليو محلو شمير يونټ نسته
                  </th>
                  <th rowSpan={2} style={{ background: 'rgba(100, 116, 139, 0.15)', borderLeft: '1px solid var(--border)', borderBottom: '1px solid var(--border)', minWidth: 85, padding: 6 }}>
                    علاقائي دوتر فعاليت
                  </th>
                  <th colSpan={3} style={{ background: 'rgba(34, 197, 94, 0.15)', borderLeft: '1px solid var(--border)', borderBottom: '1px solid var(--border)', padding: 6 }}>
                    چنده
                  </th>
                  <th colSpan={3} style={{ background: 'rgba(236, 72, 153, 0.15)', borderLeft: '1px solid var(--border)', borderBottom: '1px solid var(--border)', padding: 6 }}>
                    بلډ بينک
                  </th>
                  <th rowSpan={2} style={{ minWidth: 45, borderBottom: '1px solid var(--border)', padding: 6 }}>
                    عمل
                  </th>
                </tr>

                {/* Header Row 2: Sub-columns */}
                <tr style={{ background: 'var(--surface-alt)', color: 'var(--text-soft)', fontSize: 11 }}>
                  {/* Exec */}
                  <th style={{ minWidth: 55, borderLeft: '1px solid var(--border)', padding: 4 }}>غونډي</th>
                  <th style={{ minWidth: 55, borderLeft: '1px solid var(--border)', padding: 4 }}>شمير</th>
                  <th style={{ minWidth: 65, borderLeft: '1px solid var(--border)', padding: 4 }}>حاضر ملګرو</th>
                  <th style={{ minWidth: 65, borderLeft: '1px solid var(--border)', padding: 4 }}>حاضر غونډو</th>
                  <th style={{ minWidth: 55, borderLeft: '1px solid var(--border)', padding: 4 }}>فيصدي</th>
                  {/* Comm */}
                  <th style={{ minWidth: 55, borderLeft: '1px solid var(--border)', padding: 4 }}>غونډي</th>
                  <th style={{ minWidth: 60, borderLeft: '1px solid var(--border)', padding: 4 }}>غړو شمير</th>
                  <th style={{ minWidth: 75, borderLeft: '1px solid var(--border)', padding: 4 }}>حاضر ملګرو شمير</th>
                  <th style={{ minWidth: 65, borderLeft: '1px solid var(--border)', padding: 4 }}>حاضر غونډو</th>
                  <th style={{ minWidth: 55, borderLeft: '1px solid var(--border)', padding: 4 }}>فيصدي</th>
                  {/* BU Count */}
                  <th style={{ minWidth: 55, borderLeft: '1px solid var(--border)', padding: 4 }}>شمير</th>
                  <th style={{ minWidth: 60, borderLeft: '1px solid var(--border)', padding: 4 }}>نوي شمير</th>
                  {/* BU Exec */}
                  <th style={{ minWidth: 55, borderLeft: '1px solid var(--border)', padding: 4 }}>غړو</th>
                  <th style={{ minWidth: 60, borderLeft: '1px solid var(--border)', padding: 4 }}>حاضر غړو</th>
                  <th style={{ minWidth: 55, borderLeft: '1px solid var(--border)', padding: 4 }}>غونډو</th>
                  <th style={{ minWidth: 65, borderLeft: '1px solid var(--border)', padding: 4 }}>حاضر غونډو</th>
                  <th style={{ minWidth: 55, borderLeft: '1px solid var(--border)', padding: 4 }}>فيصدي</th>
                  {/* BU GB */}
                  <th style={{ minWidth: 60, borderLeft: '1px solid var(--border)', padding: 4 }}>ټول</th>
                  <th style={{ minWidth: 65, borderLeft: '1px solid var(--border)', padding: 4 }}>حاضر غونډو</th>
                  <th style={{ minWidth: 55, borderLeft: '1px solid var(--border)', padding: 4 }}>فيصدي</th>
                  <th style={{ minWidth: 65, borderLeft: '1px solid var(--border)', padding: 4 }}>غير فعاله شمير</th>
                  {/* Membership */}
                  <th style={{ minWidth: 55, borderLeft: '1px solid var(--border)', padding: 4 }}>ټول</th>
                  <th style={{ minWidth: 60, borderLeft: '1px solid var(--border)', padding: 4 }}>حاضر غړو</th>
                  <th style={{ minWidth: 55, borderLeft: '1px solid var(--border)', padding: 4 }}>فيصدي</th>
                  {/* Study */}
                  <th style={{ minWidth: 70, borderLeft: '1px solid var(--border)', padding: 4 }}>علاقائي کميټي</th>
                  <th style={{ minWidth: 70, borderLeft: '1px solid var(--border)', padding: 4 }}>يونټانو کميټي</th>
                  <th style={{ minWidth: 60, borderLeft: '1px solid var(--border)', padding: 4 }}>يونټانو</th>
                  <th style={{ minWidth: 55, borderLeft: '1px solid var(--border)', padding: 4 }}>فيصدي</th>
                  {/* Programs */}
                  <th style={{ minWidth: 80, borderLeft: '1px solid var(--border)', padding: 4 }}>کانفرنس/سيمينار/سرکل</th>
                  <th style={{ minWidth: 75, borderLeft: '1px solid var(--border)', padding: 4 }}>شموليت پروګرام</th>
                  <th style={{ minWidth: 65, borderLeft: '1px solid var(--border)', padding: 4 }}>نوي شموليت</th>
                  {/* Gatherings */}
                  <th style={{ minWidth: 70, borderLeft: '1px solid var(--border)', padding: 4 }}>جلسے مظاهرے</th>
                  <th style={{ minWidth: 55, borderLeft: '1px solid var(--border)', padding: 4 }}>جرګے</th>
                  <th style={{ minWidth: 65, borderLeft: '1px solid var(--border)', padding: 4 }}>يونټو غونډي</th>
                  {/* Dues */}
                  <th style={{ minWidth: 75, borderLeft: '1px solid var(--border)', padding: 4 }}>ټول (مياشتنۍ)</th>
                  <th style={{ minWidth: 75, borderLeft: '1px solid var(--border)', padding: 4 }}>علاقائي (تنظيمي)</th>
                  <th style={{ minWidth: 65, borderLeft: '1px solid var(--border)', padding: 4 }}>هنګامي</th>
                  {/* Blood Bank */}
                  <th style={{ minWidth: 55, borderLeft: '1px solid var(--border)', padding: 4 }}>پوستونه</th>
                  <th style={{ minWidth: 65, borderLeft: '1px solid var(--border)', padding: 4 }}>نغدي</th>
                  <th style={{ minWidth: 65, borderLeft: '1px solid var(--border)', padding: 4 }}>زکات</th>
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
                        placeholder="نوم وټاکئ"
                        style={{
                          width: '100%',
                          padding: '4px 6px',
                          fontSize: 12,
                          fontWeight: 600,
                          borderRadius: 4,
                          border: '1px solid transparent',
                          background: 'transparent',
                        }}
                      />
                    </td>

                    {/* 3-7. Executive Meetings */}
                    <td style={{ borderLeft: '1px solid var(--border)', borderBottom: '1px solid var(--border)', padding: 2 }}>
                      <input type="number" min="0" value={r.execMeetings ?? ''} onChange={(e) => updateForm7Row(idx, 'execMeetings', e.target.value)} style={{ width: 45, textAlign: 'center', padding: '3px 2px', fontSize: 11 }} />
                    </td>
                    <td style={{ borderLeft: '1px solid var(--border)', borderBottom: '1px solid var(--border)', padding: 2 }}>
                      <input type="number" min="0" value={r.execTotalMembers ?? ''} onChange={(e) => updateForm7Row(idx, 'execTotalMembers', e.target.value)} style={{ width: 45, textAlign: 'center', padding: '3px 2px', fontSize: 11 }} />
                    </td>
                    <td style={{ borderLeft: '1px solid var(--border)', borderBottom: '1px solid var(--border)', padding: 2 }}>
                      <input type="number" min="0" value={r.execPresent ?? ''} onChange={(e) => updateForm7Row(idx, 'execPresent', e.target.value)} style={{ width: 45, textAlign: 'center', padding: '3px 2px', fontSize: 11 }} />
                    </td>
                    <td style={{ borderLeft: '1px solid var(--border)', borderBottom: '1px solid var(--border)', padding: 2 }}>
                      <input type="number" min="0" value={r.execHeld ?? ''} onChange={(e) => updateForm7Row(idx, 'execHeld', e.target.value)} style={{ width: 45, textAlign: 'center', padding: '3px 2px', fontSize: 11 }} />
                    </td>
                    <td style={{ borderLeft: '1px solid var(--border)', borderBottom: '1px solid var(--border)', padding: 2 }}>
                      <span style={{ fontSize: 11, fontWeight: 700, color: '#0284c7' }}>{r.execPct || '0%'}</span>
                    </td>

                    {/* 8-12. Committee Meetings */}
                    <td style={{ borderLeft: '1px solid var(--border)', borderBottom: '1px solid var(--border)', padding: 2 }}>
                      <input type="number" min="0" value={r.commMeetings ?? ''} onChange={(e) => updateForm7Row(idx, 'commMeetings', e.target.value)} style={{ width: 45, textAlign: 'center', padding: '3px 2px', fontSize: 11 }} />
                    </td>
                    <td style={{ borderLeft: '1px solid var(--border)', borderBottom: '1px solid var(--border)', padding: 2 }}>
                      <input type="number" min="0" value={r.commTotalMembers ?? ''} onChange={(e) => updateForm7Row(idx, 'commTotalMembers', e.target.value)} style={{ width: 45, textAlign: 'center', padding: '3px 2px', fontSize: 11 }} />
                    </td>
                    <td style={{ borderLeft: '1px solid var(--border)', borderBottom: '1px solid var(--border)', padding: 2 }}>
                      <input type="number" min="0" value={r.commPresent ?? ''} onChange={(e) => updateForm7Row(idx, 'commPresent', e.target.value)} style={{ width: 45, textAlign: 'center', padding: '3px 2px', fontSize: 11 }} />
                    </td>
                    <td style={{ borderLeft: '1px solid var(--border)', borderBottom: '1px solid var(--border)', padding: 2 }}>
                      <input type="number" min="0" value={r.commHeld ?? ''} onChange={(e) => updateForm7Row(idx, 'commHeld', e.target.value)} style={{ width: 45, textAlign: 'center', padding: '3px 2px', fontSize: 11 }} />
                    </td>
                    <td style={{ borderLeft: '1px solid var(--border)', borderBottom: '1px solid var(--border)', padding: 2 }}>
                      <span style={{ fontSize: 11, fontWeight: 700, color: '#6366f1' }}>{r.commPct || '0%'}</span>
                    </td>

                    {/* 13-14. Basic Units Count */}
                    <td style={{ borderLeft: '1px solid var(--border)', borderBottom: '1px solid var(--border)', padding: 2 }}>
                      <input type="number" min="0" value={r.buCount ?? ''} onChange={(e) => updateForm7Row(idx, 'buCount', e.target.value)} style={{ width: 45, textAlign: 'center', padding: '3px 2px', fontSize: 11 }} />
                    </td>
                    <td style={{ borderLeft: '1px solid var(--border)', borderBottom: '1px solid var(--border)', padding: 2 }}>
                      <input type="number" min="0" value={r.newBuCount ?? ''} onChange={(e) => updateForm7Row(idx, 'newBuCount', e.target.value)} style={{ width: 45, textAlign: 'center', padding: '3px 2px', fontSize: 11 }} />
                    </td>

                    {/* 15-19. BU Executive */}
                    <td style={{ borderLeft: '1px solid var(--border)', borderBottom: '1px solid var(--border)', padding: 2 }}>
                      <input type="number" min="0" value={r.buExecUnitsTotal ?? ''} onChange={(e) => updateForm7Row(idx, 'buExecUnitsTotal', e.target.value)} style={{ width: 45, textAlign: 'center', padding: '3px 2px', fontSize: 11 }} />
                    </td>
                    <td style={{ borderLeft: '1px solid var(--border)', borderBottom: '1px solid var(--border)', padding: 2 }}>
                      <input type="number" min="0" value={r.buExecUnitsPresent ?? ''} onChange={(e) => updateForm7Row(idx, 'buExecUnitsPresent', e.target.value)} style={{ width: 45, textAlign: 'center', padding: '3px 2px', fontSize: 11 }} />
                    </td>
                    <td style={{ borderLeft: '1px solid var(--border)', borderBottom: '1px solid var(--border)', padding: 2 }}>
                      <input type="number" min="0" value={r.buExecMeetingsTotal ?? ''} onChange={(e) => updateForm7Row(idx, 'buExecMeetingsTotal', e.target.value)} style={{ width: 45, textAlign: 'center', padding: '3px 2px', fontSize: 11 }} />
                    </td>
                    <td style={{ borderLeft: '1px solid var(--border)', borderBottom: '1px solid var(--border)', padding: 2 }}>
                      <input type="number" min="0" value={r.buExecMeetingsHeld ?? ''} onChange={(e) => updateForm7Row(idx, 'buExecMeetingsHeld', e.target.value)} style={{ width: 45, textAlign: 'center', padding: '3px 2px', fontSize: 11 }} />
                    </td>
                    <td style={{ borderLeft: '1px solid var(--border)', borderBottom: '1px solid var(--border)', padding: 2 }}>
                      <span style={{ fontSize: 11, fontWeight: 700, color: '#14b8a6' }}>{r.buExecPct || '0%'}</span>
                    </td>

                    {/* 20-23. BU GB Meetings */}
                    <td style={{ borderLeft: '1px solid var(--border)', borderBottom: '1px solid var(--border)', padding: 2 }}>
                      <input type="number" min="0" value={r.buGbMeetingsTotal ?? ''} onChange={(e) => updateForm7Row(idx, 'buGbMeetingsTotal', e.target.value)} style={{ width: 45, textAlign: 'center', padding: '3px 2px', fontSize: 11 }} />
                    </td>
                    <td style={{ borderLeft: '1px solid var(--border)', borderBottom: '1px solid var(--border)', padding: 2 }}>
                      <input type="number" min="0" value={r.buGbMeetingsHeld ?? ''} onChange={(e) => updateForm7Row(idx, 'buGbMeetingsHeld', e.target.value)} style={{ width: 45, textAlign: 'center', padding: '3px 2px', fontSize: 11 }} />
                    </td>
                    <td style={{ borderLeft: '1px solid var(--border)', borderBottom: '1px solid var(--border)', padding: 2 }}>
                      <span style={{ fontSize: 11, fontWeight: 700, color: '#0ea5e9' }}>{r.buGbPct || '0%'}</span>
                    </td>
                    <td style={{ borderLeft: '1px solid var(--border)', borderBottom: '1px solid var(--border)', padding: 2 }}>
                      <input type="number" min="0" value={r.inactiveBuCount ?? ''} onChange={(e) => updateForm7Row(idx, 'inactiveBuCount', e.target.value)} style={{ width: 45, textAlign: 'center', padding: '3px 2px', fontSize: 11 }} />
                    </td>

                    {/* 24-26. Membership */}
                    <td style={{ borderLeft: '1px solid var(--border)', borderBottom: '1px solid var(--border)', padding: 2 }}>
                      <input type="number" min="0" value={r.membershipTotal ?? ''} onChange={(e) => updateForm7Row(idx, 'membershipTotal', e.target.value)} style={{ width: 50, textAlign: 'center', padding: '3px 2px', fontSize: 11 }} />
                    </td>
                    <td style={{ borderLeft: '1px solid var(--border)', borderBottom: '1px solid var(--border)', padding: 2 }}>
                      <input type="number" min="0" value={r.membershipPresent ?? ''} onChange={(e) => updateForm7Row(idx, 'membershipPresent', e.target.value)} style={{ width: 50, textAlign: 'center', padding: '3px 2px', fontSize: 11 }} />
                    </td>
                    <td style={{ borderLeft: '1px solid var(--border)', borderBottom: '1px solid var(--border)', padding: 2 }}>
                      <span style={{ fontSize: 11, fontWeight: 700, color: '#f59e0b' }}>{r.membershipPct || '0%'}</span>
                    </td>

                    {/* 27-30. Study */}
                    <td style={{ borderLeft: '1px solid var(--border)', borderBottom: '1px solid var(--border)', padding: 2 }}>
                      <input type="number" min="0" value={r.studyAreaComm ?? ''} onChange={(e) => updateForm7Row(idx, 'studyAreaComm', e.target.value)} style={{ width: 45, textAlign: 'center', padding: '3px 2px', fontSize: 11 }} />
                    </td>
                    <td style={{ borderLeft: '1px solid var(--border)', borderBottom: '1px solid var(--border)', padding: 2 }}>
                      <input type="number" min="0" value={r.studyUnitsComm ?? ''} onChange={(e) => updateForm7Row(idx, 'studyUnitsComm', e.target.value)} style={{ width: 45, textAlign: 'center', padding: '3px 2px', fontSize: 11 }} />
                    </td>
                    <td style={{ borderLeft: '1px solid var(--border)', borderBottom: '1px solid var(--border)', padding: 2 }}>
                      <input type="number" min="0" value={r.studyUnitsCount ?? ''} onChange={(e) => updateForm7Row(idx, 'studyUnitsCount', e.target.value)} style={{ width: 45, textAlign: 'center', padding: '3px 2px', fontSize: 11 }} />
                    </td>
                    <td style={{ borderLeft: '1px solid var(--border)', borderBottom: '1px solid var(--border)', padding: 2 }}>
                      <span style={{ fontSize: 11, fontWeight: 700, color: '#eab308' }}>{r.studyPct || '0%'}</span>
                    </td>

                    {/* 31-33. Programs */}
                    <td style={{ borderLeft: '1px solid var(--border)', borderBottom: '1px solid var(--border)', padding: 2 }}>
                      <input type="number" min="0" value={r.programsCount ?? ''} onChange={(e) => updateForm7Row(idx, 'programsCount', e.target.value)} style={{ width: 50, textAlign: 'center', padding: '3px 2px', fontSize: 11 }} />
                    </td>
                    <td style={{ borderLeft: '1px solid var(--border)', borderBottom: '1px solid var(--border)', padding: 2 }}>
                      <input type="number" min="0" value={r.inductionPrograms ?? ''} onChange={(e) => updateForm7Row(idx, 'inductionPrograms', e.target.value)} style={{ width: 50, textAlign: 'center', padding: '3px 2px', fontSize: 11 }} />
                    </td>
                    <td style={{ borderLeft: '1px solid var(--border)', borderBottom: '1px solid var(--border)', padding: 2 }}>
                      <input type="number" min="0" value={r.newInductions ?? ''} onChange={(e) => updateForm7Row(idx, 'newInductions', e.target.value)} style={{ width: 50, textAlign: 'center', padding: '3px 2px', fontSize: 11 }} />
                    </td>

                    {/* 34. PSO */}
                    <td style={{ borderLeft: '1px solid var(--border)', borderBottom: '1px solid var(--border)', padding: 2 }}>
                      <input type="number" min="0" value={r.psoUnitsCount ?? ''} onChange={(e) => updateForm7Row(idx, 'psoUnitsCount', e.target.value)} style={{ width: 45, textAlign: 'center', padding: '3px 2px', fontSize: 11 }} />
                    </td>

                    {/* 35-37. Gatherings */}
                    <td style={{ borderLeft: '1px solid var(--border)', borderBottom: '1px solid var(--border)', padding: 2 }}>
                      <input type="number" min="0" value={r.ralliesCount ?? ''} onChange={(e) => updateForm7Row(idx, 'ralliesCount', e.target.value)} style={{ width: 45, textAlign: 'center', padding: '3px 2px', fontSize: 11 }} />
                    </td>
                    <td style={{ borderLeft: '1px solid var(--border)', borderBottom: '1px solid var(--border)', padding: 2 }}>
                      <input type="number" min="0" value={r.jirgasCount ?? ''} onChange={(e) => updateForm7Row(idx, 'jirgasCount', e.target.value)} style={{ width: 45, textAlign: 'center', padding: '3px 2px', fontSize: 11 }} />
                    </td>
                    <td style={{ borderLeft: '1px solid var(--border)', borderBottom: '1px solid var(--border)', padding: 2 }}>
                      <input type="number" min="0" value={r.unitGatherings ?? ''} onChange={(e) => updateForm7Row(idx, 'unitGatherings', e.target.value)} style={{ width: 45, textAlign: 'center', padding: '3px 2px', fontSize: 11 }} />
                    </td>

                    {/* 38. Villages w/o Unit */}
                    <td style={{ borderLeft: '1px solid var(--border)', borderBottom: '1px solid var(--border)', padding: 2 }}>
                      <input type="number" min="0" value={r.villagesWithoutUnit ?? ''} onChange={(e) => updateForm7Row(idx, 'villagesWithoutUnit', e.target.value)} style={{ width: 45, textAlign: 'center', padding: '3px 2px', fontSize: 11 }} />
                    </td>

                    {/* 39. Office Activity */}
                    <td style={{ borderLeft: '1px solid var(--border)', borderBottom: '1px solid var(--border)', padding: 2 }}>
                      <select
                        value={r.officeActivity || 'فعاله'}
                        onChange={(e) => updateForm7Row(idx, 'officeActivity', e.target.value)}
                        style={{
                          fontSize: 11,
                          padding: '2px 4px',
                          borderRadius: 4,
                          background: r.officeActivity === 'غير فعاله' ? 'rgba(239, 68, 68, 0.15)' : 'rgba(34, 197, 94, 0.15)',
                          color: r.officeActivity === 'غير فعاله' ? '#ef4444' : '#22c55e',
                          fontWeight: 700,
                          border: 'none',
                        }}
                      >
                        <option value="فعاله">فعاله</option>
                        <option value="غير فعاله">غير فعاله</option>
                      </select>
                    </td>

                    {/* 40-42. Dues */}
                    <td style={{ borderLeft: '1px solid var(--border)', borderBottom: '1px solid var(--border)', padding: 2 }}>
                      <input type="number" min="0" value={r.duesMonthly ?? ''} onChange={(e) => updateForm7Row(idx, 'duesMonthly', e.target.value)} style={{ width: 65, textAlign: 'center', padding: '3px 2px', fontSize: 11 }} />
                    </td>
                    <td style={{ borderLeft: '1px solid var(--border)', borderBottom: '1px solid var(--border)', padding: 2 }}>
                      <input type="number" min="0" value={r.duesOrg ?? ''} onChange={(e) => updateForm7Row(idx, 'duesOrg', e.target.value)} style={{ width: 65, textAlign: 'center', padding: '3px 2px', fontSize: 11 }} />
                    </td>
                    <td style={{ borderLeft: '1px solid var(--border)', borderBottom: '1px solid var(--border)', padding: 2 }}>
                      <input type="number" min="0" value={r.duesEmergency ?? ''} onChange={(e) => updateForm7Row(idx, 'duesEmergency', e.target.value)} style={{ width: 60, textAlign: 'center', padding: '3px 2px', fontSize: 11 }} />
                    </td>

                    {/* 43-45. Blood Bank */}
                    <td style={{ borderLeft: '1px solid var(--border)', borderBottom: '1px solid var(--border)', padding: 2 }}>
                      <input type="number" min="0" value={r.bloodPosts ?? ''} onChange={(e) => updateForm7Row(idx, 'bloodPosts', e.target.value)} style={{ width: 45, textAlign: 'center', padding: '3px 2px', fontSize: 11 }} />
                    </td>
                    <td style={{ borderLeft: '1px solid var(--border)', borderBottom: '1px solid var(--border)', padding: 2 }}>
                      <input type="number" min="0" value={r.bloodCash ?? ''} onChange={(e) => updateForm7Row(idx, 'bloodCash', e.target.value)} style={{ width: 55, textAlign: 'center', padding: '3px 2px', fontSize: 11 }} />
                    </td>
                    <td style={{ borderLeft: '1px solid var(--border)', borderBottom: '1px solid var(--border)', padding: 2 }}>
                      <input type="number" min="0" value={r.bloodZakat ?? ''} onChange={(e) => updateForm7Row(idx, 'bloodZakat', e.target.value)} style={{ width: 55, textAlign: 'center', padding: '3px 2px', fontSize: 11 }} />
                    </td>

                    {/* 46. Action */}
                    <td style={{ borderBottom: '1px solid var(--border)', padding: 2 }}>
                      <button
                        type="button"
                        onClick={() => removeForm7Row(idx)}
                        style={{ border: 'none', background: 'transparent', cursor: 'pointer', color: '#ef4444', fontSize: 14 }}
                        title="Remove row"
                      >
                        ✕
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>

              {/* ────────────────────────────────────────────────────────────────── */}
              {/* FOOTER: TOTAL SUMMARY ROW */}
              {/* ────────────────────────────────────────────────────────────────── */}
              <tfoot
                style={{
                  position: 'sticky',
                  bottom: 0,
                  zIndex: 20,
                  background: 'var(--surface-alt)',
                  fontWeight: 800,
                  boxShadow: '0 -2px 4px rgba(0,0,0,0.06)',
                }}
              >
                <tr style={{ background: 'var(--surface-alt)', borderTop: '2px solid var(--primary, #38bdf8)' }}>
                  <td
                    style={{
                      position: 'sticky',
                      right: 0,
                      zIndex: 25,
                      background: 'var(--surface-alt)',
                      padding: 8,
                      borderLeft: '1px solid var(--border)',
                    }}
                  >
                    ∑
                  </td>
                  <td
                    style={{
                      position: 'sticky',
                      right: 45,
                      zIndex: 25,
                      background: 'var(--surface-alt)',
                      padding: 8,
                      borderLeft: '2px solid var(--primary, #38bdf8)',
                      textAlign: 'right',
                    }}
                  >
                    مجموعه / ټول ({totals.unitsCount} يونټونه)
                  </td>
                  {/* Exec */}
                  <td style={{ borderLeft: '1px solid var(--border)', padding: 6 }}>{totals.execMeetings}</td>
                  <td style={{ borderLeft: '1px solid var(--border)', padding: 6 }}>{totals.execTotalMembers}</td>
                  <td style={{ borderLeft: '1px solid var(--border)', padding: 6 }}>{totals.execPresent}</td>
                  <td style={{ borderLeft: '1px solid var(--border)', padding: 6 }}>{totals.execHeld}</td>
                  <td style={{ borderLeft: '1px solid var(--border)', padding: 6, color: '#0284c7' }}>{totals.execPct}</td>
                  {/* Comm */}
                  <td style={{ borderLeft: '1px solid var(--border)', padding: 6 }}>{totals.commMeetings}</td>
                  <td style={{ borderLeft: '1px solid var(--border)', padding: 6 }}>{totals.commTotalMembers}</td>
                  <td style={{ borderLeft: '1px solid var(--border)', padding: 6 }}>{totals.commPresent}</td>
                  <td style={{ borderLeft: '1px solid var(--border)', padding: 6 }}>{totals.commHeld}</td>
                  <td style={{ borderLeft: '1px solid var(--border)', padding: 6, color: '#6366f1' }}>{totals.commPct}</td>
                  {/* BU Count */}
                  <td style={{ borderLeft: '1px solid var(--border)', padding: 6 }}>{totals.buCount}</td>
                  <td style={{ borderLeft: '1px solid var(--border)', padding: 6 }}>{totals.newBuCount}</td>
                  {/* BU Exec */}
                  <td style={{ borderLeft: '1px solid var(--border)', padding: 6 }}>{totals.buExecUnitsTotal}</td>
                  <td style={{ borderLeft: '1px solid var(--border)', padding: 6 }}>{totals.buExecUnitsPresent}</td>
                  <td style={{ borderLeft: '1px solid var(--border)', padding: 6 }}>{totals.buExecMeetingsTotal}</td>
                  <td style={{ borderLeft: '1px solid var(--border)', padding: 6 }}>{totals.buExecMeetingsHeld}</td>
                  <td style={{ borderLeft: '1px solid var(--border)', padding: 6, color: '#14b8a6' }}>{totals.buExecPct}</td>
                  {/* BU GB */}
                  <td style={{ borderLeft: '1px solid var(--border)', padding: 6 }}>{totals.buGbMeetingsTotal}</td>
                  <td style={{ borderLeft: '1px solid var(--border)', padding: 6 }}>{totals.buGbMeetingsHeld}</td>
                  <td style={{ borderLeft: '1px solid var(--border)', padding: 6, color: '#0ea5e9' }}>{totals.buGbPct}</td>
                  <td style={{ borderLeft: '1px solid var(--border)', padding: 6, color: '#ef4444' }}>{totals.inactiveBuCount}</td>
                  {/* Membership */}
                  <td style={{ borderLeft: '1px solid var(--border)', padding: 6 }}>{totals.membershipTotal}</td>
                  <td style={{ borderLeft: '1px solid var(--border)', padding: 6 }}>{totals.membershipPresent}</td>
                  <td style={{ borderLeft: '1px solid var(--border)', padding: 6, color: '#f59e0b' }}>{totals.membershipPct}</td>
                  {/* Study */}
                  <td style={{ borderLeft: '1px solid var(--border)', padding: 6 }}>{totals.studyAreaComm}</td>
                  <td style={{ borderLeft: '1px solid var(--border)', padding: 6 }}>{totals.studyUnitsComm}</td>
                  <td style={{ borderLeft: '1px solid var(--border)', padding: 6 }}>{totals.studyUnitsCount}</td>
                  <td style={{ borderLeft: '1px solid var(--border)', padding: 6, color: '#eab308' }}>{totals.studyPct}</td>
                  {/* Programs */}
                  <td style={{ borderLeft: '1px solid var(--border)', padding: 6 }}>{totals.programsCount}</td>
                  <td style={{ borderLeft: '1px solid var(--border)', padding: 6 }}>{totals.inductionPrograms}</td>
                  <td style={{ borderLeft: '1px solid var(--border)', padding: 6 }}>{totals.newInductions}</td>
                  {/* PSO */}
                  <td style={{ borderLeft: '1px solid var(--border)', padding: 6 }}>{totals.psoUnitsCount}</td>
                  {/* Gatherings */}
                  <td style={{ borderLeft: '1px solid var(--border)', padding: 6 }}>{totals.ralliesCount}</td>
                  <td style={{ borderLeft: '1px solid var(--border)', padding: 6 }}>{totals.jirgasCount}</td>
                  <td style={{ borderLeft: '1px solid var(--border)', padding: 6 }}>{totals.unitGatherings}</td>
                  {/* Villages w/o Unit */}
                  <td style={{ borderLeft: '1px solid var(--border)', padding: 6 }}>{totals.villagesWithoutUnit}</td>
                  {/* Office */}
                  <td style={{ borderLeft: '1px solid var(--border)', padding: 6, color: '#22c55e' }}>{totals.activeOffices} فعاله</td>
                  {/* Dues */}
                  <td style={{ borderLeft: '1px solid var(--border)', padding: 6, color: '#10b981' }}>{totals.duesMonthly.toLocaleString()}</td>
                  <td style={{ borderLeft: '1px solid var(--border)', padding: 6, color: '#10b981' }}>{totals.duesOrg.toLocaleString()}</td>
                  <td style={{ borderLeft: '1px solid var(--border)', padding: 6, color: '#f59e0b' }}>{totals.duesEmergency.toLocaleString()}</td>
                  {/* Blood Bank */}
                  <td style={{ borderLeft: '1px solid var(--border)', padding: 6 }}>{totals.bloodPosts}</td>
                  <td style={{ borderLeft: '1px solid var(--border)', padding: 6, color: '#10b981' }}>{totals.bloodCash.toLocaleString()}</td>
                  <td style={{ borderLeft: '1px solid var(--border)', padding: 6, color: '#10b981' }}>{totals.bloodZakat.toLocaleString()}</td>
                  <td style={{ padding: 6 }}>—</td>
                </tr>
              </tfoot>
            </table>
          </div>
        </div>
      )}

      {/* ────────────────────────────────────────────────────────────────────────── */}
      {/* 5. OFFICIAL DISTRICT LEADERSHIP SIGNATURES BLOCK */}
      {/* ────────────────────────────────────────────────────────────────────────── */}
      <div className="card" style={{ padding: 18, marginTop: 10 }}>
        <h4 style={{ margin: '0 0 14px', color: 'var(--primary, #38bdf8)', display: 'flex', alignItems: 'center', gap: 8, fontSize: 15 }}>
          <span>✍️</span>
          <span>{t('proforma.form7.signaturesTitle', 'د ضلعي مشرتابه رسمي لاسليکونه (Official District Leadership Signatures)')}</span>
        </h4>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: 16 }}>
          <div style={{ padding: 12, background: 'var(--surface-alt)', borderRadius: 8, border: '1px solid var(--border)' }}>
            <label style={{ display: 'block', fontWeight: 700, fontSize: 13, marginBottom: 8, color: 'var(--text-main)' }}>
              ✍️ {t('proforma.form7.distPresidentSignature', 'ضلعي صدر لاسليک (District President Signature)')}
            </label>
            <input
              type="text"
              value={formData.distPresidentSignature || ''}
              onChange={(e) => updateField('distPresidentSignature', e.target.value)}
              placeholder="نوم / ډيجيټل لاسليک / نېټه"
              style={{ width: '100%', padding: '8px 12px', fontSize: 13, borderRadius: 6, fontWeight: 600 }}
            />
          </div>

          <div style={{ padding: 12, background: 'var(--surface-alt)', borderRadius: 8, border: '1px solid var(--border)' }}>
            <label style={{ display: 'block', fontWeight: 700, fontSize: 13, marginBottom: 8, color: 'var(--text-main)' }}>
              ✍️ {t('proforma.form7.distSecSignature', 'ضلعي جنرل سيکرټري لاسليک (District General Secretary Signature)')}
            </label>
            <input
              type="text"
              value={formData.distSecSignature || ''}
              onChange={(e) => updateField('distSecSignature', e.target.value)}
              placeholder="نوم / ډيجيټل لاسليک / نېټه"
              style={{ width: '100%', padding: '8px 12px', fontSize: 13, borderRadius: 6, fontWeight: 600 }}
            />
          </div>
        </div>
      </div>
    </div>
  );
}
