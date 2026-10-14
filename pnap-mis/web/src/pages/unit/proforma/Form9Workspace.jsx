import React, { useState, useMemo } from 'react';

/**
 * Form9Workspace:
 * District Central & Provincial Organs Members Monthly Work & Activity Report
 * (ضلع کښي مرکزي، صوبائي ادارو د غړو کار او فعاليت رپورټ)
 *
 * Implements 7 Distinct Proforma Sections on A4 Portrait:
 * 1. Central & Provincial Organs Members Activity Roster (21 Columns)
 * 2. Public Gatherings, Meetings, Rallies, Jirgas, Corner Meetings & Strikes (9 Columns)
 * 3. Party Conferences, Seminars & Study Circles Report (8 Columns)
 * 4. Blood Bank Hides, Cash & Zakat Report (4 Fields)
 * 5. Disciplinary Actions in District (4 Columns)
 * 6. Proposals & Demands Matrix (Political, Organizational, Social Work)
 * 7. Social Work Brief, Miscellaneous Notes & Area Leadership Signatures
 */
export default function Form9Workspace({
  formData = {},
  sec1Members = [],
  sec2PublicGatherings = [],
  sec3Conferences = [],
  sec4BloodBank = {},
  sec5Discipline = [],
  sec6Proposals = {},
  sec7Notes = {},
  activeSection = 'sec1',
  setActiveSection,
  form9ViewMode = 'cards',
  setForm9ViewMode,
  form9Search = '',
  setForm9Search,
  updateForm9Sec1Row,
  addForm9Sec1Row,
  removeForm9Sec1Row,
  handleAutoCalcForm9,
  updateForm9Sec2Row,
  addForm9Sec2Row,
  removeForm9Sec2Row,
  updateForm9Sec3Row,
  addForm9Sec3Row,
  removeForm9Sec3Row,
  updateForm9Sec4,
  updateForm9Sec5Row,
  addForm9Sec5Row,
  removeForm9Sec5Row,
  updateForm9Sec6,
  updateForm9Sec7,
  isRtl = true,
  t,
}) {
  // Local section filter if parent didn't provide activeSection
  const [localActiveSec, setLocalActiveSec] = useState('sec1');
  const currentSection = activeSection || localActiveSec;
  const setSection = setActiveSection || setLocalActiveSec;

  // Filtered rows for Section 1 Search
  const filteredSec1 = useMemo(() => {
    return (sec1Members || [])
      .map((r, originalIdx) => ({ r, originalIdx }))
      .filter(({ r }) => !form9Search || (r.name || '').toLowerCase().includes(form9Search.toLowerCase()));
  }, [sec1Members, form9Search]);

  // Aggregate calculations for KPI summary and Section 1 Table Footer
  const totals = useMemo(() => {
    const sumSec1 = (field) => (sec1Members || []).reduce((acc, r) => acc + (parseInt(r[field], 10) || 0), 0);

    const totalMembers = (sec1Members || []).length;
    const totalMeetings = sumSec1('totalMeetings');
    const totalGatherings = (sec2PublicGatherings || []).length;
    const totalConferences = (sec3Conferences || []).length;
    const totalDiscipline = (sec5Discipline || []).length;

    const bCash = parseInt(sec4BloodBank?.totalCash, 10) ||
      ((parseInt(sec4BloodBank?.cash, 10) || 0) + (parseInt(sec4BloodBank?.zakat, 10) || 0));

    return {
      totalMembers,
      totalMeetings,
      totalGatherings,
      totalConferences,
      totalDiscipline,
      totalCash: bCash,
      distExecMeeting: sumSec1('distExecMeeting'),
      distCommMeeting: sumSec1('distCommMeeting'),
      areaExecMeeting: sumSec1('areaExecMeeting'),
      areaCommMeeting: sumSec1('areaCommMeeting'),
      buExecMeeting: sumSec1('buExecMeeting'),
      buGbMeeting: sumSec1('buGbMeeting'),
      psoMeeting: sumSec1('psoMeeting'),
      conferences: sumSec1('conferences'),
      seminars: sumSec1('seminars'),
      studyCircles: sumSec1('studyCircles'),
      inductions: sumSec1('inductions'),
      alliesMeeting: sumSec1('alliesMeeting'),
      publicGatherings: sumSec1('publicGatherings'),
      dues: sumSec1('dues'),
      tours: sumSec1('tours'),
    };
  }, [sec1Members, sec2PublicGatherings, sec3Conferences, sec4BloodBank, sec5Discipline]);

  const cardInputStyle = {
    width: '100%',
    padding: '7px 10px',
    fontSize: 13,
    borderRadius: 6,
    border: '1px solid var(--border)',
    background: 'var(--surface-alt)',
    color: 'inherit',
    fontWeight: 500,
    boxSizing: 'border-box',
  };

  const tableInputStyle = (width = 52) => ({
    width,
    textAlign: 'center',
    padding: '5px 3px',
    fontSize: 12,
    borderRadius: 4,
    border: '1px solid var(--border)',
    background: 'var(--surface-alt)',
    color: 'inherit',
    fontWeight: 600,
    boxSizing: 'border-box',
  });

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      {/* ───────────────────────────────────────────────────────────── */}
      {/* 1. TOP HEADER & SUMMARY METRIC TILES                          */}
      {/* ───────────────────────────────────────────────────────────── */}
      <div
        className="card"
        style={{
          padding: '18px 20px',
          borderRadius: 12,
          background: 'linear-gradient(135deg, var(--surface) 0%, var(--surface-alt) 100%)',
          border: '1px solid var(--border)',
          boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.05)',
        }}
      >
        <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between', gap: 14, marginBottom: 16 }}>
          <div>
            <h2 style={{ margin: 0, fontSize: 19, fontWeight: 800, color: 'var(--primary, #38bdf8)' }}>
              {t('proforma.form9.title', 'District Central & Provincial Organs Members Work & Activity Report')}
            </h2>
            <div style={{ fontSize: 13, color: 'var(--text-soft)', marginTop: 4, fontWeight: 500 }}>
              {t('proforma.form9.subtitle', 'ضلع کښي مرکزي، صوبائي ادارو د غړو کار او فعاليت رپورټ')}
            </div>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <button
              type="button"
              className="btn secondary"
              onClick={handleAutoCalcForm9}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: 6,
                padding: '7px 14px',
                fontSize: 12,
                fontWeight: 700,
                borderRadius: 8,
                background: 'rgba(56, 189, 248, 0.1)',
                borderColor: 'var(--primary, #38bdf8)',
                color: 'var(--primary, #38bdf8)',
              }}
            >
              <span>⚡</span>
              <span>{t('proforma.form9.autoCalcAll', '⚡ Auto-Calculate All')}</span>
            </button>
          </div>
        </div>

        {/* Metric KPI Tiles Grid */}
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))',
            gap: 12,
          }}
        >
          {/* Total Members */}
          <div style={{ padding: '10px 12px', borderRadius: 8, background: 'var(--surface)', border: '1px solid var(--border)' }}>
            <div style={{ fontSize: 11, color: 'var(--text-soft)', fontWeight: 600 }}>
              {t('proforma.form9.kpiTotalMembers', 'Total Organ Members')}
            </div>
            <div style={{ fontSize: 20, fontWeight: 800, color: 'var(--primary, #38bdf8)', marginTop: 4 }}>
              👥 {totals.totalMembers}
            </div>
          </div>

          {/* Total Meetings */}
          <div style={{ padding: '10px 12px', borderRadius: 8, background: 'var(--surface)', border: '1px solid var(--border)' }}>
            <div style={{ fontSize: 11, color: 'var(--text-soft)', fontWeight: 600 }}>
              {t('proforma.form9.kpiTotalMeetings', 'Total Meetings Held')}
            </div>
            <div style={{ fontSize: 20, fontWeight: 800, color: '#10b981', marginTop: 4 }}>
              🤝 {totals.totalMeetings}
            </div>
          </div>

          {/* Public Gatherings */}
          <div style={{ padding: '10px 12px', borderRadius: 8, background: 'var(--surface)', border: '1px solid var(--border)' }}>
            <div style={{ fontSize: 11, color: 'var(--text-soft)', fontWeight: 600 }}>
              {t('proforma.form9.kpiPublicGatherings', 'Public Gatherings')}
            </div>
            <div style={{ fontSize: 20, fontWeight: 800, color: '#f59e0b', marginTop: 4 }}>
              📢 {totals.totalGatherings}
            </div>
          </div>

          {/* Conferences */}
          <div style={{ padding: '10px 12px', borderRadius: 8, background: 'var(--surface)', border: '1px solid var(--border)' }}>
            <div style={{ fontSize: 11, color: 'var(--text-soft)', fontWeight: 600 }}>
              {t('proforma.form9.kpiConferences', 'Conferences / Seminars')}
            </div>
            <div style={{ fontSize: 20, fontWeight: 800, color: '#8b5cf6', marginTop: 4 }}>
              🎓 {totals.totalConferences}
            </div>
          </div>

          {/* Blood Bank & Zakat */}
          <div style={{ padding: '10px 12px', borderRadius: 8, background: 'var(--surface)', border: '1px solid var(--border)' }}>
            <div style={{ fontSize: 11, color: 'var(--text-soft)', fontWeight: 600 }}>
              {t('proforma.form9.kpiTotalCash', 'Blood Bank & Zakat (PKR)')}
            </div>
            <div style={{ fontSize: 20, fontWeight: 800, color: '#06b6d4', marginTop: 4 }}>
              PKR {totals.totalCash.toLocaleString()}
            </div>
          </div>

          {/* Disciplinary Actions */}
          <div style={{ padding: '10px 12px', borderRadius: 8, background: 'var(--surface)', border: '1px solid var(--border)' }}>
            <div style={{ fontSize: 11, color: 'var(--text-soft)', fontWeight: 600 }}>
              {t('proforma.form9.kpiDisciplinaryActions', 'Disciplinary Actions')}
            </div>
            <div style={{ fontSize: 20, fontWeight: 800, color: '#ef4444', marginTop: 4 }}>
              ⚖️ {totals.totalDiscipline}
            </div>
          </div>
        </div>
      </div>

      {/* ───────────────────────────────────────────────────────────── */}
      {/* 2. SUB-NAVIGATION TABS (7 SECTIONS)                           */}
      {/* ───────────────────────────────────────────────────────────── */}
      <div
        style={{
          display: 'flex',
          overflowX: 'auto',
          gap: 6,
          padding: '6px 8px',
          background: 'var(--surface)',
          borderRadius: 10,
          border: '1px solid var(--border)',
        }}
      >
        {[
          { key: 'sec1', icon: '👥', label: t('proforma.form9.tabSec1', '1. Members Activity Roster (غړو فعاليت)') },
          { key: 'sec2', icon: '📢', label: t('proforma.form9.tabSec2', '2. Public Gatherings & Rallies (اولسي غونډي او جلسې)') },
          { key: 'sec3', icon: '🎓', label: t('proforma.form9.tabSec3', '3. Conferences & Seminars (کانفرنسونه او سيمينارونه)') },
          { key: 'sec4', icon: '🩸', label: t('proforma.form9.tabSec4', '4. Blood Bank & Zakat (بلډ بينک، پوستونه او زکات)') },
          { key: 'sec5', icon: '⚖️', label: t('proforma.form9.tabSec5', '5. Disciplinary Actions (تاديبي کاروايي)') },
          { key: 'sec6', icon: '💡', label: t('proforma.form9.tabSec6', '6. Proposals & Demands (وړانديزونه او غوښتنې)') },
          { key: 'sec7', icon: '📝', label: t('proforma.form9.tabSec7', '7. Social Work & Notes (ټولنيز کار، متفرق او لاسليکونه)') },
        ].map((tab) => {
          const isActive = currentSection === tab.key;
          return (
            <button
              key={tab.key}
              type="button"
              className={`btn ${isActive ? '' : 'secondary'}`}
              onClick={() => setSection(tab.key)}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 6,
                padding: '8px 14px',
                fontSize: 12,
                fontWeight: isActive ? 800 : 600,
                whiteSpace: 'nowrap',
                borderRadius: 8,
                transition: 'all 0.2s',
                border: isActive ? '1.5px solid var(--primary, #38bdf8)' : '1px solid transparent',
              }}
            >
              <span>{tab.icon}</span>
              <span>{tab.label}</span>
            </button>
          );
        })}
      </div>

      {/* ───────────────────────────────────────────────────────────── */}
      {/* 3. SECTION 1: MEMBERS WORK & ACTIVITY ROSTER (21 COLUMNS)     */}
      {/* ───────────────────────────────────────────────────────────── */}
      {currentSection === 'sec1' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          {/* Controls Bar */}
          <div
            style={{
              display: 'flex',
              flexWrap: 'wrap',
              alignItems: 'center',
              justifyContent: 'space-between',
              gap: 12,
              padding: '12px 16px',
              borderRadius: 8,
              background: 'var(--surface)',
              border: '1px solid var(--border)',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, flex: 1, minWidth: 220 }}>
              <span style={{ fontSize: 16 }}>🔍</span>
              <input
                type="text"
                value={form9Search}
                onChange={(e) => setForm9Search && setForm9Search(e.target.value)}
                placeholder={t('proforma.form9.searchMemberPlaceholder', 'Search member by name...')}
                style={{
                  width: '100%',
                  padding: '6px 10px',
                  fontSize: 13,
                  borderRadius: 6,
                  border: '1px solid var(--border)',
                  background: 'var(--surface-alt)',
                  color: 'inherit',
                }}
              />
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              {/* Dual View Toggle */}
              <div
                style={{
                  display: 'flex',
                  borderRadius: 6,
                  overflow: 'hidden',
                  border: '1px solid var(--border)',
                }}
              >
                <button
                  type="button"
                  className={`btn ${form9ViewMode === 'cards' ? '' : 'secondary'}`}
                  onClick={() => setForm9ViewMode && setForm9ViewMode('cards')}
                  style={{ padding: '6px 12px', fontSize: 12, borderRadius: 0 }}
                >
                  🗂️ {t('proforma.form9.viewCards', 'Cards View')}
                </button>
                <button
                  type="button"
                  className={`btn ${form9ViewMode === 'table' ? '' : 'secondary'}`}
                  onClick={() => setForm9ViewMode && setForm9ViewMode('table')}
                  style={{ padding: '6px 12px', fontSize: 12, borderRadius: 0 }}
                >
                  📊 {t('proforma.form9.viewTable', 'Table View (21 Columns)')}
                </button>
              </div>

              <button
                type="button"
                className="btn"
                onClick={addForm9Sec1Row}
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 6,
                  padding: '6px 14px',
                  fontSize: 12,
                  fontWeight: 700,
                  borderRadius: 6,
                }}
              >
                <span>➕</span>
                <span>{t('proforma.form9.addMember', '+ Add Member')}</span>
              </button>
            </div>
          </div>

          {/* Cards View Mode */}
          {form9ViewMode === 'cards' && (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(360px, 1fr))', gap: 14 }}>
              {filteredSec1.length === 0 ? (
                <div
                  style={{
                    gridColumn: '1 / -1',
                    padding: 30,
                    textAlign: 'center',
                    background: 'var(--surface)',
                    borderRadius: 10,
                    border: '1px dashed var(--border)',
                    color: 'var(--text-soft)',
                  }}
                >
                  {t('proforma.form9.noMembers', "No members recorded yet. Click '+ Add Member' to add an entry.")}
                </div>
              ) : (
                filteredSec1.map(({ r, originalIdx }) => (
                  <div
                    key={r.memberId || originalIdx}
                    className="card"
                    style={{
                      padding: 16,
                      borderRadius: 10,
                      background: 'var(--surface)',
                      border: '1px solid var(--border)',
                      display: 'flex',
                      flexDirection: 'column',
                      gap: 12,
                    }}
                  >
                    {/* Header: Comrade Name & Remove */}
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8, flex: 1 }}>
                        <span
                          style={{
                            width: 26,
                            height: 26,
                            borderRadius: '50%',
                            background: 'var(--surface-alt)',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            fontWeight: 800,
                            fontSize: 12,
                          }}
                        >
                          {originalIdx + 1}
                        </span>
                        <input
                          type="text"
                          value={r.name || ''}
                          onChange={(e) => updateForm9Sec1Row(originalIdx, 'name', e.target.value)}
                          placeholder={t('proforma.form9.namePlaceholder', 'Enter comrade full name')}
                          style={{
                            ...cardInputStyle,
                            fontWeight: 700,
                            fontSize: 14,
                            color: 'var(--primary, #38bdf8)',
                          }}
                        />
                      </div>
                      <button
                        type="button"
                        onClick={() => removeForm9Sec1Row(originalIdx)}
                        style={{
                          background: 'none',
                          border: 'none',
                          cursor: 'pointer',
                          color: '#ef4444',
                          fontSize: 15,
                          padding: 4,
                        }}
                        title={t('proforma.form9.removeMember', 'Remove')}
                      >
                        🗑️
                      </button>
                    </div>

                    {/* Role & Date */}
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                      <div>
                        <label style={{ fontSize: 11, color: 'var(--text-soft)', fontWeight: 600, display: 'block', marginBottom: 3 }}>
                          {t('proforma.form9.designation', 'Designation / Role')}
                        </label>
                        <input
                          type="text"
                          value={r.designation || ''}
                          onChange={(e) => updateForm9Sec1Row(originalIdx, 'designation', e.target.value)}
                          placeholder={t('proforma.form9.designationPlaceholder', 'e.g., Central Committee Member')}
                          style={cardInputStyle}
                        />
                      </div>
                      <div>
                        <label style={{ fontSize: 11, color: 'var(--text-soft)', fontWeight: 600, display: 'block', marginBottom: 3 }}>
                          {t('proforma.form9.date', 'Meeting / Tour Date')}
                        </label>
                        <input
                          type="date"
                          value={r.date || ''}
                          onChange={(e) => updateForm9Sec1Row(originalIdx, 'date', e.target.value)}
                          style={cardInputStyle}
                        />
                      </div>
                    </div>

                    {/* Committee Meetings Group */}
                    <div style={{ padding: 10, borderRadius: 8, background: 'var(--surface-alt)', border: '1px solid var(--border)' }}>
                      <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--primary, #38bdf8)', marginBottom: 8 }}>
                        🤝 {t('proforma.form8.secMeetings', 'Committee & Executive Meetings')}
                      </div>
                      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 6 }}>
                        {[
                          { key: 'distExecMeeting', label: t('proforma.form9.distExecMeeting', 'Dist Exec') },
                          { key: 'distCommMeeting', label: t('proforma.form9.distCommMeeting', 'Dist Comm') },
                          { key: 'areaExecMeeting', label: t('proforma.form9.areaExecMeeting', 'Area Exec') },
                          { key: 'areaCommMeeting', label: t('proforma.form9.areaCommMeeting', 'Area Comm') },
                          { key: 'buExecMeeting', label: t('proforma.form9.buExecMeeting', 'BU Exec') },
                          { key: 'buGbMeeting', label: t('proforma.form9.buGbMeeting', 'BU GB') },
                          { key: 'psoMeeting', label: t('proforma.form9.psoMeeting', 'PSO') },
                          { key: 'alliesMeeting', label: t('proforma.form9.alliesMeeting', 'Allies') },
                        ].map((m) => (
                          <div key={m.key}>
                            <label style={{ fontSize: 10, color: 'var(--text-soft)', display: 'block', marginBottom: 2 }}>{m.label}</label>
                            <input
                              type="number"
                              min={0}
                              value={r[m.key] ?? ''}
                              onChange={(e) => updateForm9Sec1Row(originalIdx, m.key, e.target.value === '' ? '' : parseInt(e.target.value, 10) || 0)}
                              style={{ ...cardInputStyle, textAlign: 'center', padding: '5px 2px' }}
                            />
                          </div>
                        ))}
                      </div>
                    </div>

                    {/* Programs & Gatherings */}
                    <div style={{ padding: 10, borderRadius: 8, background: 'var(--surface-alt)', border: '1px solid var(--border)' }}>
                      <div style={{ fontSize: 12, fontWeight: 700, color: '#f59e0b', marginBottom: 8 }}>
                        🎓 {t('proforma.form8.secPrograms', 'Programs, Circles & Inductions')}
                      </div>
                      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: 6 }}>
                        {[
                          { key: 'conferences', label: t('proforma.form9.conferences', 'Conf') },
                          { key: 'seminars', label: t('proforma.form9.seminars', 'Sem') },
                          { key: 'studyCircles', label: t('proforma.form9.studyCircles', 'Study') },
                          { key: 'inductions', label: t('proforma.form9.inductions', 'Induct') },
                          { key: 'publicGatherings', label: t('proforma.form9.publicGatherings', 'Rallies') },
                        ].map((p) => (
                          <div key={p.key}>
                            <label style={{ fontSize: 10, color: 'var(--text-soft)', display: 'block', marginBottom: 2 }}>{p.label}</label>
                            <input
                              type="number"
                              min={0}
                              value={r[p.key] ?? ''}
                              onChange={(e) => updateForm9Sec1Row(originalIdx, p.key, e.target.value === '' ? '' : parseInt(e.target.value, 10) || 0)}
                              style={{ ...cardInputStyle, textAlign: 'center', padding: '5px 2px' }}
                            />
                          </div>
                        ))}
                      </div>
                    </div>

                    {/* Total Meetings KPI & Ideological Study */}
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 2fr', gap: 8 }}>
                      <div style={{ padding: 8, borderRadius: 6, background: 'rgba(16, 185, 129, 0.1)', border: '1px solid #10b981', textAlign: 'center' }}>
                        <div style={{ fontSize: 10, fontWeight: 700, color: '#10b981' }}>
                          ⚡ {t('proforma.form9.totalMeetings', 'Total Mtgs')}
                        </div>
                        <div style={{ fontSize: 18, fontWeight: 800, color: '#10b981', marginTop: 2 }}>
                          {r.totalMeetings || 0}
                        </div>
                      </div>
                      <div>
                        <label style={{ fontSize: 11, color: 'var(--text-soft)', fontWeight: 600, display: 'block', marginBottom: 2 }}>
                          📖 {t('proforma.form9.ideologicalReading', 'Ideological Study')}
                        </label>
                        <input
                          type="text"
                          value={r.ideologicalReading || ''}
                          onChange={(e) => updateForm9Sec1Row(originalIdx, 'ideologicalReading', e.target.value)}
                          placeholder={t('proforma.form9.readingPlaceholder', 'Books or topics studied')}
                          style={cardInputStyle}
                        />
                      </div>
                    </div>

                    {/* Dues & Tours */}
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                      <div>
                        <label style={{ fontSize: 11, color: 'var(--text-soft)', fontWeight: 600, display: 'block', marginBottom: 2 }}>
                          💵 {t('proforma.form9.dues', 'Monthly Dues')}
                        </label>
                        <input
                          type="number"
                          min={0}
                          value={r.dues ?? ''}
                          onChange={(e) => updateForm9Sec1Row(originalIdx, 'dues', e.target.value === '' ? '' : parseInt(e.target.value, 10) || 0)}
                          style={cardInputStyle}
                        />
                      </div>
                      <div>
                        <label style={{ fontSize: 11, color: 'var(--text-soft)', fontWeight: 600, display: 'block', marginBottom: 2 }}>
                          🚗 {t('proforma.form9.tours', 'Tours / Visits')}
                        </label>
                        <input
                          type="number"
                          min={0}
                          value={r.tours ?? ''}
                          onChange={(e) => updateForm9Sec1Row(originalIdx, 'tours', e.target.value === '' ? '' : parseInt(e.target.value, 10) || 0)}
                          style={cardInputStyle}
                        />
                      </div>
                    </div>
                  </div>
                ))
              )}
            </div>
          )}

          {/* Table View Mode (21 Columns) */}
          {form9ViewMode === 'table' && (
            <div
              style={{
                overflowX: 'auto',
                background: 'var(--surface)',
                borderRadius: 10,
                border: '1px solid var(--border)',
              }}
            >
              <table
                style={{
                  width: '100%',
                  borderCollapse: 'collapse',
                  fontSize: 12,
                  textAlign: 'center',
                }}
              >
                <thead>
                  <tr style={{ background: 'var(--surface-alt)', borderBottom: '2px solid var(--border)' }}>
                    <th style={{ padding: '8px 4px', width: 36, position: 'sticky', [isRtl ? 'right' : 'left']: 0, background: 'var(--surface-alt)', zIndex: 2 }}>
                      {t('proforma.form9.srNo', 'Sr #')}
                    </th>
                    <th style={{ padding: '8px 6px', width: 150, textAlign: isRtl ? 'right' : 'left', position: 'sticky', [isRtl ? 'right' : 'left']: 36, background: 'var(--surface-alt)', zIndex: 2 }}>
                      {t('proforma.form9.name', 'Comrade Name')}
                    </th>
                    <th style={{ padding: '8px 6px', width: 110 }}>{t('proforma.form9.designation', 'Designation')}</th>
                    <th style={{ padding: '8px 4px', width: 85 }}>{t('proforma.form9.date', 'Date')}</th>
                    <th style={{ padding: '8px 4px' }}>{t('proforma.form9.distExecMeeting', 'Dist Exec')}</th>
                    <th style={{ padding: '8px 4px' }}>{t('proforma.form9.distCommMeeting', 'Dist Comm')}</th>
                    <th style={{ padding: '8px 4px' }}>{t('proforma.form9.areaExecMeeting', 'Area Exec')}</th>
                    <th style={{ padding: '8px 4px' }}>{t('proforma.form9.areaCommMeeting', 'Area Comm')}</th>
                    <th style={{ padding: '8px 4px' }}>{t('proforma.form9.buExecMeeting', 'BU Exec')}</th>
                    <th style={{ padding: '8px 4px' }}>{t('proforma.form9.buGbMeeting', 'BU GB')}</th>
                    <th style={{ padding: '8px 4px' }}>{t('proforma.form9.psoMeeting', 'PSO')}</th>
                    <th style={{ padding: '8px 4px' }}>{t('proforma.form9.conferences', 'Conf')}</th>
                    <th style={{ padding: '8px 4px' }}>{t('proforma.form9.seminars', 'Sem')}</th>
                    <th style={{ padding: '8px 4px' }}>{t('proforma.form9.studyCircles', 'Study')}</th>
                    <th style={{ padding: '8px 4px' }}>{t('proforma.form9.inductions', 'Induct')}</th>
                    <th style={{ padding: '8px 4px' }}>{t('proforma.form9.alliesMeeting', 'Allies')}</th>
                    <th style={{ padding: '8px 4px' }}>{t('proforma.form9.publicGatherings', 'Rallies')}</th>
                    <th style={{ padding: '8px 6px', background: 'rgba(16, 185, 129, 0.1)', color: '#10b981', fontWeight: 800 }}>
                      {t('proforma.form9.totalMeetings', 'Total')}
                    </th>
                    <th style={{ padding: '8px 6px', width: 140 }}>{t('proforma.form9.ideologicalReading', 'Ideological Study')}</th>
                    <th style={{ padding: '8px 4px' }}>{t('proforma.form9.dues', 'Dues')}</th>
                    <th style={{ padding: '8px 4px' }}>{t('proforma.form9.tours', 'Tours')}</th>
                    <th style={{ padding: '8px 4px', width: 34 }}></th>
                  </tr>
                </thead>
                <tbody>
                  {filteredSec1.map(({ r, originalIdx }) => (
                    <tr
                      key={r.memberId || originalIdx}
                      style={{
                        borderBottom: '1px solid var(--border)',
                        background: originalIdx % 2 === 0 ? 'transparent' : 'rgba(0,0,0,0.02)',
                      }}
                    >
                      <td style={{ padding: '6px 2px', position: 'sticky', [isRtl ? 'right' : 'left']: 0, background: 'var(--surface)', zIndex: 1, fontWeight: 700 }}>
                        {originalIdx + 1}
                      </td>
                      <td style={{ padding: '6px 4px', position: 'sticky', [isRtl ? 'right' : 'left']: 36, background: 'var(--surface)', zIndex: 1, textAlign: isRtl ? 'right' : 'left' }}>
                        <input
                          type="text"
                          value={r.name || ''}
                          onChange={(e) => updateForm9Sec1Row(originalIdx, 'name', e.target.value)}
                          placeholder={t('proforma.form9.namePlaceholder', 'Full Name')}
                          style={{ ...tableInputStyle(140), textAlign: isRtl ? 'right' : 'left', fontWeight: 600 }}
                        />
                      </td>
                      <td style={{ padding: '6px 2px' }}>
                        <input
                          type="text"
                          value={r.designation || ''}
                          onChange={(e) => updateForm9Sec1Row(originalIdx, 'designation', e.target.value)}
                          style={{ ...tableInputStyle(105), textAlign: isRtl ? 'right' : 'left' }}
                        />
                      </td>
                      <td style={{ padding: '6px 2px' }}>
                        <input
                          type="text"
                          value={r.date || ''}
                          onChange={(e) => updateForm9Sec1Row(originalIdx, 'date', e.target.value)}
                          style={tableInputStyle(75)}
                        />
                      </td>
                      {['distExecMeeting', 'distCommMeeting', 'areaExecMeeting', 'areaCommMeeting', 'buExecMeeting', 'buGbMeeting', 'psoMeeting', 'conferences', 'seminars', 'studyCircles', 'inductions', 'alliesMeeting', 'publicGatherings'].map((field) => (
                        <td key={field} style={{ padding: '6px 2px' }}>
                          <input
                            type="number"
                            min={0}
                            value={r[field] ?? ''}
                            onChange={(e) => updateForm9Sec1Row(originalIdx, field, e.target.value === '' ? '' : parseInt(e.target.value, 10) || 0)}
                            style={tableInputStyle(44)}
                          />
                        </td>
                      ))}
                      <td style={{ padding: '6px 4px', fontWeight: 800, color: '#10b981', background: 'rgba(16, 185, 129, 0.05)' }}>
                        {r.totalMeetings || 0}
                      </td>
                      <td style={{ padding: '6px 2px' }}>
                        <input
                          type="text"
                          value={r.ideologicalReading || ''}
                          onChange={(e) => updateForm9Sec1Row(originalIdx, 'ideologicalReading', e.target.value)}
                          style={{ ...tableInputStyle(130), textAlign: isRtl ? 'right' : 'left' }}
                        />
                      </td>
                      <td style={{ padding: '6px 2px' }}>
                        <input
                          type="number"
                          min={0}
                          value={r.dues ?? ''}
                          onChange={(e) => updateForm9Sec1Row(originalIdx, 'dues', e.target.value === '' ? '' : parseInt(e.target.value, 10) || 0)}
                          style={tableInputStyle(50)}
                        />
                      </td>
                      <td style={{ padding: '6px 2px' }}>
                        <input
                          type="number"
                          min={0}
                          value={r.tours ?? ''}
                          onChange={(e) => updateForm9Sec1Row(originalIdx, 'tours', e.target.value === '' ? '' : parseInt(e.target.value, 10) || 0)}
                          style={tableInputStyle(44)}
                        />
                      </td>
                      <td style={{ padding: '6px 2px' }}>
                        <button
                          type="button"
                          onClick={() => removeForm9Sec1Row(originalIdx)}
                          style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#ef4444', fontSize: 14 }}
                        >
                          🗑️
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr style={{ background: 'var(--surface-alt)', borderTop: '2px solid var(--border)', fontWeight: 800 }}>
                    <td colSpan={2} style={{ padding: '8px 10px', textAlign: isRtl ? 'right' : 'left' }}>
                      {t('proforma.form8.totalSummary', 'Total / Summary')} ({totals.totalMembers})
                    </td>
                    <td colSpan={2}></td>
                    <td>{totals.distExecMeeting}</td>
                    <td>{totals.distCommMeeting}</td>
                    <td>{totals.areaExecMeeting}</td>
                    <td>{totals.areaCommMeeting}</td>
                    <td>{totals.buExecMeeting}</td>
                    <td>{totals.buGbMeeting}</td>
                    <td>{totals.psoMeeting}</td>
                    <td>{totals.conferences}</td>
                    <td>{totals.seminars}</td>
                    <td>{totals.studyCircles}</td>
                    <td>{totals.inductions}</td>
                    <td>{totals.alliesMeeting}</td>
                    <td>{totals.publicGatherings}</td>
                    <td style={{ color: '#10b981', background: 'rgba(16, 185, 129, 0.15)' }}>{totals.totalMeetings}</td>
                    <td></td>
                    <td>{totals.dues}</td>
                    <td>{totals.tours}</td>
                    <td></td>
                  </tr>
                </tfoot>
              </table>
            </div>
          )}
        </div>
      )}

      {/* ───────────────────────────────────────────────────────────── */}
      {/* 4. SECTION 2: PUBLIC GATHERINGS & RALLIES (9 COLUMNS)         */}
      {/* ───────────────────────────────────────────────────────────── */}
      {currentSection === 'sec2' && (
        <div className="card" style={{ padding: 18, borderRadius: 10, background: 'var(--surface)', border: '1px solid var(--border)' }}>
          <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between', gap: 10, marginBottom: 14 }}>
            <div>
              <h3 style={{ margin: 0, fontSize: 16, fontWeight: 700, color: 'var(--primary, #38bdf8)' }}>
                {t('proforma.form9.sec2Title', 'Public Gatherings, Rallies, Protests, Jirgas, Corner Meetings, Inductions & Strikes')}
              </h3>
              <div style={{ fontSize: 12, color: 'var(--text-soft)', marginTop: 2 }}>
                {t('proforma.form9.sec2Desc', 'Report on mass public mobilization programs, corner meetings, and protests held in the district.')}
              </div>
            </div>

            <button type="button" className="btn" onClick={addForm9Sec2Row} style={{ padding: '6px 14px', fontSize: 12 }}>
              ➕ {t('proforma.form9.addProgram', '+ Add Public Event')}
            </button>
          </div>

          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12, textAlign: 'center' }}>
              <thead>
                <tr style={{ background: 'var(--surface-alt)', borderBottom: '2px solid var(--border)' }}>
                  <th style={{ padding: 8, width: 36 }}>{t('proforma.form9.srNo', 'Sr #')}</th>
                  <th style={{ padding: 8, width: 140 }}>{t('proforma.form9.organName', 'Organ / Body Name')}</th>
                  <th style={{ padding: 8, width: 100 }}>{t('proforma.form9.eventDate', 'Date')}</th>
                  <th style={{ padding: 8, width: 120 }}>{t('proforma.form9.venue', 'Venue')}</th>
                  <th style={{ padding: 8, width: 140 }}>{t('proforma.form9.topic', 'Topic / Agenda')}</th>
                  <th style={{ padding: 8, width: 130 }}>{t('proforma.form9.programType', 'Program Type')}</th>
                  <th style={{ padding: 8, width: 160 }}>{t('proforma.form9.speakers', 'Speakers / Key Comrades')}</th>
                  <th style={{ padding: 8, width: 80 }}>{t('proforma.form9.comradesCount', 'Comrades')}</th>
                  <th style={{ padding: 8, width: 80 }}>{t('proforma.form9.peopleCount', 'Public')}</th>
                  <th style={{ padding: 8, width: 34 }}></th>
                </tr>
              </thead>
              <tbody>
                {sec2PublicGatherings.length === 0 ? (
                  <tr>
                    <td colSpan={10} style={{ padding: 24, textAlign: 'center', color: 'var(--text-soft)' }}>
                      {t('proforma.form9.noPrograms', 'No public events recorded yet.')}
                    </td>
                  </tr>
                ) : (
                  sec2PublicGatherings.map((r, idx) => (
                    <tr key={idx} style={{ borderBottom: '1px solid var(--border)' }}>
                      <td style={{ padding: 6, fontWeight: 700 }}>{idx + 1}</td>
                      <td style={{ padding: 4 }}>
                        <input
                          type="text"
                          value={r.organName || ''}
                          onChange={(e) => updateForm9Sec2Row(idx, 'organName', e.target.value)}
                          placeholder={t('proforma.form9.organNamePlaceholder', 'Organ')}
                          style={cardInputStyle}
                        />
                      </td>
                      <td style={{ padding: 4 }}>
                        <input
                          type="date"
                          value={r.date || ''}
                          onChange={(e) => updateForm9Sec2Row(idx, 'date', e.target.value)}
                          style={cardInputStyle}
                        />
                      </td>
                      <td style={{ padding: 4 }}>
                        <input
                          type="text"
                          value={r.venue || ''}
                          onChange={(e) => updateForm9Sec2Row(idx, 'venue', e.target.value)}
                          placeholder={t('proforma.form9.venuePlaceholder', 'Venue')}
                          style={cardInputStyle}
                        />
                      </td>
                      <td style={{ padding: 4 }}>
                        <input
                          type="text"
                          value={r.topic || ''}
                          onChange={(e) => updateForm9Sec2Row(idx, 'topic', e.target.value)}
                          placeholder={t('proforma.form9.topicPlaceholder', 'Topic')}
                          style={cardInputStyle}
                        />
                      </td>
                      <td style={{ padding: 4 }}>
                        <input
                          type="text"
                          value={r.programType || ''}
                          onChange={(e) => updateForm9Sec2Row(idx, 'programType', e.target.value)}
                          placeholder={t('proforma.form9.programTypePlaceholder', 'e.g. Rally, Jirga')}
                          style={cardInputStyle}
                        />
                      </td>
                      <td style={{ padding: 4 }}>
                        <input
                          type="text"
                          value={r.speakers || ''}
                          onChange={(e) => updateForm9Sec2Row(idx, 'speakers', e.target.value)}
                          placeholder={t('proforma.form9.speakersPlaceholder', 'Speakers')}
                          style={cardInputStyle}
                        />
                      </td>
                      <td style={{ padding: 4 }}>
                        <input
                          type="number"
                          min={0}
                          value={r.comradesCount ?? ''}
                          onChange={(e) => updateForm9Sec2Row(idx, 'comradesCount', e.target.value === '' ? '' : parseInt(e.target.value, 10) || 0)}
                          style={{ ...cardInputStyle, textAlign: 'center' }}
                        />
                      </td>
                      <td style={{ padding: 4 }}>
                        <input
                          type="number"
                          min={0}
                          value={r.peopleCount ?? ''}
                          onChange={(e) => updateForm9Sec2Row(idx, 'peopleCount', e.target.value === '' ? '' : parseInt(e.target.value, 10) || 0)}
                          style={{ ...cardInputStyle, textAlign: 'center' }}
                        />
                      </td>
                      <td style={{ padding: 4 }}>
                        <button
                          type="button"
                          onClick={() => removeForm9Sec2Row(idx)}
                          style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#ef4444' }}
                        >
                          🗑️
                        </button>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ───────────────────────────────────────────────────────────── */}
      {/* 5. SECTION 3: PARTY CONFERENCES & SEMINARS (8 COLUMNS)        */}
      {/* ───────────────────────────────────────────────────────────── */}
      {currentSection === 'sec3' && (
        <div className="card" style={{ padding: 18, borderRadius: 10, background: 'var(--surface)', border: '1px solid var(--border)' }}>
          <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between', gap: 10, marginBottom: 14 }}>
            <div>
              <h3 style={{ margin: 0, fontSize: 16, fontWeight: 700, color: '#8b5cf6' }}>
                {t('proforma.form9.sec3Title', 'Party Conferences, Seminars & Study Circles Report')}
              </h3>
              <div style={{ fontSize: 12, color: 'var(--text-soft)', marginTop: 2 }}>
                {t('proforma.form9.sec3Desc', 'Ideological education, study sessions, and seminars arranged by party organs.')}
              </div>
            </div>

            <button type="button" className="btn" onClick={addForm9Sec3Row} style={{ padding: '6px 14px', fontSize: 12 }}>
              ➕ {t('proforma.form9.addConference', '+ Add Study Session / Conference')}
            </button>
          </div>

          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12, textAlign: 'center' }}>
              <thead>
                <tr style={{ background: 'var(--surface-alt)', borderBottom: '2px solid var(--border)' }}>
                  <th style={{ padding: 8, width: 36 }}>{t('proforma.form9.srNo', 'Sr #')}</th>
                  <th style={{ padding: 8, width: 140 }}>{t('proforma.form9.organName', 'Organ / Body Name')}</th>
                  <th style={{ padding: 8, width: 100 }}>{t('proforma.form9.eventDate', 'Date')}</th>
                  <th style={{ padding: 8, width: 120 }}>{t('proforma.form9.venue', 'Venue')}</th>
                  <th style={{ padding: 8, width: 150 }}>{t('proforma.form9.topic', 'Topic / Agenda')}</th>
                  <th style={{ padding: 8, width: 130 }}>{t('proforma.form9.programType', 'Program Type')}</th>
                  <th style={{ padding: 8, width: 160 }}>{t('proforma.form9.speakers', 'Speakers / Key Comrades')}</th>
                  <th style={{ padding: 8, width: 85 }}>{t('proforma.form9.comradesCount', 'Comrades')}</th>
                  <th style={{ padding: 8, width: 34 }}></th>
                </tr>
              </thead>
              <tbody>
                {sec3Conferences.length === 0 ? (
                  <tr>
                    <td colSpan={9} style={{ padding: 24, textAlign: 'center', color: 'var(--text-soft)' }}>
                      {t('proforma.form9.noConferences', 'No conferences or study circles recorded yet.')}
                    </td>
                  </tr>
                ) : (
                  sec3Conferences.map((r, idx) => (
                    <tr key={idx} style={{ borderBottom: '1px solid var(--border)' }}>
                      <td style={{ padding: 6, fontWeight: 700 }}>{idx + 1}</td>
                      <td style={{ padding: 4 }}>
                        <input
                          type="text"
                          value={r.organName || ''}
                          onChange={(e) => updateForm9Sec3Row(idx, 'organName', e.target.value)}
                          placeholder={t('proforma.form9.organNamePlaceholder', 'Organ')}
                          style={cardInputStyle}
                        />
                      </td>
                      <td style={{ padding: 4 }}>
                        <input
                          type="date"
                          value={r.date || ''}
                          onChange={(e) => updateForm9Sec3Row(idx, 'date', e.target.value)}
                          style={cardInputStyle}
                        />
                      </td>
                      <td style={{ padding: 4 }}>
                        <input
                          type="text"
                          value={r.venue || ''}
                          onChange={(e) => updateForm9Sec3Row(idx, 'venue', e.target.value)}
                          placeholder={t('proforma.form9.venuePlaceholder', 'Venue')}
                          style={cardInputStyle}
                        />
                      </td>
                      <td style={{ padding: 4 }}>
                        <input
                          type="text"
                          value={r.topic || ''}
                          onChange={(e) => updateForm9Sec3Row(idx, 'topic', e.target.value)}
                          placeholder={t('proforma.form9.topicPlaceholder', 'Topic')}
                          style={cardInputStyle}
                        />
                      </td>
                      <td style={{ padding: 4 }}>
                        <input
                          type="text"
                          value={r.programType || ''}
                          onChange={(e) => updateForm9Sec3Row(idx, 'programType', e.target.value)}
                          placeholder={t('proforma.form9.programTypePlaceholder', 'e.g. Conference, Seminar')}
                          style={cardInputStyle}
                        />
                      </td>
                      <td style={{ padding: 4 }}>
                        <input
                          type="text"
                          value={r.speakers || ''}
                          onChange={(e) => updateForm9Sec3Row(idx, 'speakers', e.target.value)}
                          placeholder={t('proforma.form9.speakersPlaceholder', 'Speakers')}
                          style={cardInputStyle}
                        />
                      </td>
                      <td style={{ padding: 4 }}>
                        <input
                          type="number"
                          min={0}
                          value={r.comradesCount ?? ''}
                          onChange={(e) => updateForm9Sec3Row(idx, 'comradesCount', e.target.value === '' ? '' : parseInt(e.target.value, 10) || 0)}
                          style={{ ...cardInputStyle, textAlign: 'center' }}
                        />
                      </td>
                      <td style={{ padding: 4 }}>
                        <button
                          type="button"
                          onClick={() => removeForm9Sec3Row(idx)}
                          style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#ef4444' }}
                        >
                          🗑️
                        </button>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ───────────────────────────────────────────────────────────── */}
      {/* 6. SECTION 4: BLOOD BANK HIDES, CASH & ZAKAT (4 FIELDS)       */}
      {/* ───────────────────────────────────────────────────────────── */}
      {currentSection === 'sec4' && (
        <div className="card" style={{ padding: 20, borderRadius: 10, background: 'var(--surface)', border: '1px solid var(--border)' }}>
          <div style={{ marginBottom: 16 }}>
            <h3 style={{ margin: 0, fontSize: 16, fontWeight: 700, color: '#06b6d4' }}>
              {t('proforma.form9.sec4Title', 'Blood Bank Hides, Cash & Zakat Report')}
            </h3>
            <div style={{ fontSize: 12, color: 'var(--text-soft)', marginTop: 2 }}>
              {t('proforma.form9.sec4Desc', 'Eid hides collection, monetary donations, and zakat collected for party blood bank initiatives.')}
            </div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 16 }}>
            {/* Eid Hides Count */}
            <div style={{ padding: 16, borderRadius: 8, background: 'var(--surface-alt)', border: '1px solid var(--border)' }}>
              <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontWeight: 700, fontSize: 13, marginBottom: 8 }}>
                <span>🐑</span>
                <span>{t('proforma.form9.eidHidesCount', 'Eid Hides / Skins Count')}</span>
              </label>
              <input
                type="number"
                min={0}
                value={sec4BloodBank.eidHidesCount ?? ''}
                onChange={(e) => updateForm9Sec4('eidHidesCount', e.target.value === '' ? '' : parseInt(e.target.value, 10) || 0)}
                placeholder="0"
                style={{ ...cardInputStyle, fontSize: 16, fontWeight: 800 }}
              />
            </div>

            {/* Cash Collected */}
            <div style={{ padding: 16, borderRadius: 8, background: 'var(--surface-alt)', border: '1px solid var(--border)' }}>
              <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontWeight: 700, fontSize: 13, marginBottom: 8 }}>
                <span>💵</span>
                <span>{t('proforma.form9.cash', 'Cash Collected')}</span>
              </label>
              <input
                type="number"
                min={0}
                value={sec4BloodBank.cash ?? ''}
                onChange={(e) => updateForm9Sec4('cash', e.target.value === '' ? '' : parseInt(e.target.value, 10) || 0)}
                placeholder="0"
                style={{ ...cardInputStyle, fontSize: 16, fontWeight: 800 }}
              />
            </div>

            {/* Total Cash */}
            <div style={{ padding: 16, borderRadius: 8, background: 'var(--surface-alt)', border: '1px solid var(--border)' }}>
              <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontWeight: 700, fontSize: 13, marginBottom: 8 }}>
                <span>💰</span>
                <span>{t('proforma.form9.totalCash', 'Total Cash (PKR)')}</span>
              </label>
              <input
                type="number"
                min={0}
                value={sec4BloodBank.totalCash ?? ''}
                onChange={(e) => updateForm9Sec4('totalCash', e.target.value === '' ? '' : parseInt(e.target.value, 10) || 0)}
                placeholder="0"
                style={{ ...cardInputStyle, fontSize: 16, fontWeight: 800 }}
              />
            </div>

            {/* Zakat Funds */}
            <div style={{ padding: 16, borderRadius: 8, background: 'var(--surface-alt)', border: '1px solid var(--border)' }}>
              <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontWeight: 700, fontSize: 13, marginBottom: 8 }}>
                <span>🤲</span>
                <span>{t('proforma.form9.zakat', 'Zakat Funds')}</span>
              </label>
              <input
                type="number"
                min={0}
                value={sec4BloodBank.zakat ?? ''}
                onChange={(e) => updateForm9Sec4('zakat', e.target.value === '' ? '' : parseInt(e.target.value, 10) || 0)}
                placeholder="0"
                style={{ ...cardInputStyle, fontSize: 16, fontWeight: 800 }}
              />
            </div>
          </div>
        </div>
      )}

      {/* ───────────────────────────────────────────────────────────── */}
      {/* 7. SECTION 5: DISCIPLINARY ACTIONS (4 COLUMNS)                */}
      {/* ───────────────────────────────────────────────────────────── */}
      {currentSection === 'sec5' && (
        <div className="card" style={{ padding: 18, borderRadius: 10, background: 'var(--surface)', border: '1px solid var(--border)' }}>
          <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between', gap: 10, marginBottom: 14 }}>
            <div>
              <h3 style={{ margin: 0, fontSize: 16, fontWeight: 700, color: '#ef4444' }}>
                {t('proforma.form9.sec5Title', 'Disciplinary Actions in District')}
              </h3>
              <div style={{ fontSize: 12, color: 'var(--text-soft)', marginTop: 2 }}>
                {t('proforma.form9.sec5Desc', 'Official disciplinary actions, show-cause notices, or resolutions regarding constitutional or party violations.')}
              </div>
            </div>

            <button type="button" className="btn" onClick={addForm9Sec5Row} style={{ padding: '6px 14px', fontSize: 12 }}>
              ➕ {t('proforma.form9.addAction', '+ Add Disciplinary Case')}
            </button>
          </div>

          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12, textAlign: 'center' }}>
              <thead>
                <tr style={{ background: 'var(--surface-alt)', borderBottom: '2px solid var(--border)' }}>
                  <th style={{ padding: 8, width: 180 }}>{t('proforma.form9.name', 'Comrade Name')}</th>
                  <th style={{ padding: 8, width: 140 }}>{t('proforma.form9.designation', 'Designation / Role')}</th>
                  <th style={{ padding: 8 }}>{t('proforma.form9.violation', 'Violation Committed')}</th>
                  <th style={{ padding: 8, width: 200 }}>{t('proforma.form9.actionTaken', 'Action Taken')}</th>
                  <th style={{ padding: 8, width: 34 }}></th>
                </tr>
              </thead>
              <tbody>
                {sec5Discipline.length === 0 ? (
                  <tr>
                    <td colSpan={5} style={{ padding: 24, textAlign: 'center', color: 'var(--text-soft)' }}>
                      {t('proforma.form9.noActions', 'No disciplinary actions recorded for this month.')}
                    </td>
                  </tr>
                ) : (
                  sec5Discipline.map((r, idx) => (
                    <tr key={idx} style={{ borderBottom: '1px solid var(--border)' }}>
                      <td style={{ padding: 4 }}>
                        <input
                          type="text"
                          value={r.comradeName || ''}
                          onChange={(e) => updateForm9Sec5Row(idx, 'comradeName', e.target.value)}
                          placeholder={t('proforma.form9.namePlaceholder', 'Full Name')}
                          style={{ ...cardInputStyle, fontWeight: 700 }}
                        />
                      </td>
                      <td style={{ padding: 4 }}>
                        <input
                          type="text"
                          value={r.designation || ''}
                          onChange={(e) => updateForm9Sec5Row(idx, 'designation', e.target.value)}
                          placeholder={t('proforma.form9.designationPlaceholder', 'Designation')}
                          style={cardInputStyle}
                        />
                      </td>
                      <td style={{ padding: 4 }}>
                        <input
                          type="text"
                          value={r.violation || ''}
                          onChange={(e) => updateForm9Sec5Row(idx, 'violation', e.target.value)}
                          placeholder={t('proforma.form9.violationPlaceholder', 'Describe constitutional or conduct violation')}
                          style={cardInputStyle}
                        />
                      </td>
                      <td style={{ padding: 4 }}>
                        <input
                          type="text"
                          value={r.actionTaken || ''}
                          onChange={(e) => updateForm9Sec5Row(idx, 'actionTaken', e.target.value)}
                          placeholder={t('proforma.form9.actionTakenPlaceholder', 'Action Taken')}
                          style={cardInputStyle}
                        />
                      </td>
                      <td style={{ padding: 4 }}>
                        <button
                          type="button"
                          onClick={() => removeForm9Sec5Row(idx)}
                          style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#ef4444' }}
                        >
                          🗑️
                        </button>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ───────────────────────────────────────────────────────────── */}
      {/* 8. SECTION 6: PROPOSALS & DEMANDS MATRIX                      */}
      {/* ───────────────────────────────────────────────────────────── */}
      {currentSection === 'sec6' && (
        <div className="card" style={{ padding: 18, borderRadius: 10, background: 'var(--surface)', border: '1px solid var(--border)' }}>
          <div style={{ marginBottom: 16 }}>
            <h3 style={{ margin: 0, fontSize: 16, fontWeight: 700, color: 'var(--primary, #38bdf8)' }}>
              {t('proforma.form9.sec6Title', 'Proposals (Suggestions / Recommendations) & Demands')}
            </h3>
            <div style={{ fontSize: 12, color: 'var(--text-soft)', marginTop: 2 }}>
              {t('proforma.form9.sec6Desc', 'Multi-level matrix of political, organizational, and social proposals and demands.')}
            </div>
          </div>

          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12, textAlign: 'center' }}>
              <thead>
                <tr style={{ background: 'var(--surface-alt)', borderBottom: '2px solid var(--border)' }}>
                  <th style={{ padding: 10, width: 140 }}>Category</th>
                  <th style={{ padding: 10 }}>{t('proforma.form9.colByUnit', 'Submitted by Unit (يونټ لخوا)')}</th>
                  <th style={{ padding: 10 }}>{t('proforma.form9.colByArea', 'Submitted by Area (علاقې لخوا)')}</th>
                  <th style={{ padding: 10 }}>{t('proforma.form9.colByDistrict', 'Submitted by District (ضلعې لخوا)')}</th>
                  <th style={{ padding: 10 }}>{t('proforma.form9.colProposals', 'Proposals (وړانديزونه / تجاویز)')}</th>
                  <th style={{ padding: 10 }}>{t('proforma.form9.colDemands', 'Demands (غوښتنې)')}</th>
                </tr>
              </thead>
              <tbody>
                {[
                  { key: 'political', label: t('proforma.form9.catPolitical', 'Political (سياسي)') },
                  { key: 'organizational', label: t('proforma.form9.catOrganizational', 'Organizational (تنظيمي)') },
                  { key: 'social', label: t('proforma.form9.catSocial', 'Social Work (ټولنيزو کارو)') },
                ].map((row) => (
                  <tr key={row.key} style={{ borderBottom: '1px solid var(--border)' }}>
                    <td style={{ padding: 10, fontWeight: 800, background: 'var(--surface-alt)', textAlign: isRtl ? 'right' : 'left' }}>
                      {row.label}
                    </td>
                    {['byUnit', 'byArea', 'byDistrict', 'proposals', 'demands'].map((col) => (
                      <td key={col} style={{ padding: 6 }}>
                        <textarea
                          rows={2}
                          value={sec6Proposals?.[row.key]?.[col] || ''}
                          onChange={(e) => updateForm9Sec6(row.key, col, e.target.value)}
                          placeholder="..."
                          style={{
                            ...cardInputStyle,
                            resize: 'vertical',
                            fontSize: 12,
                            padding: '6px 8px',
                          }}
                        />
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ───────────────────────────────────────────────────────────── */}
      {/* 9. SECTION 7: SOCIAL WORK BRIEF, MISC & SIGNATURES            */}
      {/* ───────────────────────────────────────────────────────────── */}
      {currentSection === 'sec7' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          {/* Social Work Brief */}
          <div className="card" style={{ padding: 18, borderRadius: 10, background: 'var(--surface)', border: '1px solid var(--border)' }}>
            <label style={{ display: 'block', fontWeight: 700, fontSize: 14, color: 'var(--primary, #38bdf8)', marginBottom: 8 }}>
              {t('proforma.form9.socialWorkReport', '1. Social Work Brief Report (۱۔ ټولنيزو کارو لنډ رپورټ)')}
            </label>
            <textarea
              rows={4}
              value={sec7Notes.socialWorkReport || ''}
              onChange={(e) => updateForm9Sec7('socialWorkReport', e.target.value)}
              placeholder={t('proforma.form9.socialWorkPlaceholder', 'Summarize community welfare, medical camps, relief activities...')}
              style={{ ...cardInputStyle, fontSize: 13, lineHeight: 1.5, padding: 12 }}
            />
          </div>

          {/* Miscellaneous Notes */}
          <div className="card" style={{ padding: 18, borderRadius: 10, background: 'var(--surface)', border: '1px solid var(--border)' }}>
            <label style={{ display: 'block', fontWeight: 700, fontSize: 14, color: '#f59e0b', marginBottom: 8 }}>
              {t('proforma.form9.miscellaneousNotes', '2. Miscellaneous Notes & Remarks (۲۔ متفرق)')}
            </label>
            <textarea
              rows={3}
              value={sec7Notes.miscellaneousNotes || ''}
              onChange={(e) => updateForm9Sec7('miscellaneousNotes', e.target.value)}
              placeholder={t('proforma.form9.miscPlaceholder', 'General political observations, administrative notes...')}
              style={{ ...cardInputStyle, fontSize: 13, lineHeight: 1.5, padding: 12 }}
            />
          </div>

          {/* Signatures Authorization Block */}
          <div
            className="card"
            style={{
              padding: 20,
              borderRadius: 10,
              background: 'linear-gradient(135deg, var(--surface) 0%, var(--surface-alt) 100%)',
              border: '1.5px solid var(--border)',
            }}
          >
            <div style={{ marginBottom: 14 }}>
              <h4 style={{ margin: 0, fontSize: 15, fontWeight: 800, color: 'var(--primary, #38bdf8)' }}>
                ✍️ {t('proforma.form9.signaturesBlock', 'Official Area Leadership Signatures')}
              </h4>
              <div style={{ fontSize: 12, color: 'var(--text-soft)', marginTop: 4 }}>
                {t('proforma.form8.signaturesDesc', 'Official party proformas require authorization by leadership. These digital signatures and signing date will appear directly on the official printed A4 report, PDF export, and archival records.')}
              </div>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 16 }}>
              {/* Area Secretary Signature */}
              <div style={{ padding: 12, borderRadius: 8, background: 'var(--surface)', border: '1px solid var(--border)' }}>
                <label style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-soft)', display: 'block', marginBottom: 6 }}>
                  {t('proforma.form9.areaSecSignature', 'Area Secretary Signature')}
                </label>
                <input
                  type="text"
                  value={sec7Notes.areaSecSignature || ''}
                  onChange={(e) => updateForm9Sec7('areaSecSignature', e.target.value)}
                  placeholder={t('proforma.form9.signaturePlaceholder', 'Name / Digital sign')}
                  style={{ ...cardInputStyle, fontWeight: 700 }}
                />
              </div>

              {/* Area Senior Deputy Signature */}
              <div style={{ padding: 12, borderRadius: 8, background: 'var(--surface)', border: '1px solid var(--border)' }}>
                <label style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-soft)', display: 'block', marginBottom: 6 }}>
                  {t('proforma.form9.areaSeniorDeputySignature', 'Area Senior Deputy (معاون) Signature')}
                </label>
                <input
                  type="text"
                  value={sec7Notes.areaSeniorDeputySignature || ''}
                  onChange={(e) => updateForm9Sec7('areaSeniorDeputySignature', e.target.value)}
                  placeholder={t('proforma.form9.signaturePlaceholder', 'Name / Digital sign')}
                  style={{ ...cardInputStyle, fontWeight: 700 }}
                />
              </div>

              {/* Date of Signature */}
              <div style={{ padding: 12, borderRadius: 8, background: 'var(--surface)', border: '1px solid var(--border)' }}>
                <label style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-soft)', display: 'block', marginBottom: 6 }}>
                  {t('proforma.form9.signatureDate', 'Date of Signature')}
                </label>
                <input
                  type="date"
                  value={sec7Notes.signatureDate || ''}
                  onChange={(e) => updateForm9Sec7('signatureDate', e.target.value)}
                  style={cardInputStyle}
                />
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
