import React, { useState, useEffect, useRef } from 'react';
import { api, errorMessage } from '../api/client';
import { useTranslation } from 'react-i18next';
import PashtoKeyboardHelper from './PashtoKeyboardHelper';

export default function ProformaEditorModal({
  isOpen,
  onClose,
  formType,
  year,
  month,
  unitId,
  areaId,
  districtId,
  provinceId,
  unitLevel,
  unitName,
  onSaved,
}) {
  const { t } = useTranslation();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState('');
  const [msg, setMsg] = useState('');

  const [formData, setFormData] = useState({});
  const [metadata, setMetadata] = useState({});
  const [canEdit, setCanEdit] = useState(true);
  const [activeTab, setActiveTab] = useState('summary'); // 'summary' | 'rows' | 'notes'

  const activeInputRef = useRef(null);

  useEffect(() => {
    if (!isOpen) return;
    loadData();
  }, [isOpen, formType, year, month, unitId, areaId, provinceId]);

  async function loadData() {
    setLoading(true);
    setErr('');
    setMsg('');
    try {
      const res = await api.get('/proforma/entry', {
        params: {
          formType,
          year,
          month,
          unitId,
          areaId,
          provinceId,
        },
      });
      const d = res.data?.data || {};
      setFormData(d);
      setMetadata(res.data?.metadata || {});
      setCanEdit(res.data?.canEdit ?? true);
    } catch (e) {
      setErr(errorMessage(e));
    } finally {
      setLoading(false);
    }
  }

  async function handleSave() {
    setSaving(true);
    setErr('');
    setMsg('');
    try {
      const payload = {
        formType,
        year: parseInt(year, 10),
        month: parseInt(month, 10),
        unitId: (formType === 'form5' ? provinceId : (['form1', 'form2', 'form3'].includes(formType) ? areaId : unitId)),
        areaId,
        districtId,
        provinceId,
        unitLevel,
        unitName,
        data: formData,
        notes: formData.notes || metadata.notes || '',
      };
      const res = await api.post('/proforma/save', payload);
      setMsg(res.data?.message || 'Report saved successfully in database!');
      setMetadata((prev) => ({
        ...prev,
        status: 'SUBMITTED',
        submittedByName: res.data?.report?.submittedByName || 'You',
        submittedByRole: res.data?.report?.submittedByRole || 'Officer',
        submittedAt: new Date().toISOString(),
      }));
      if (onSaved) onSaved(res.data?.report);
    } catch (e) {
      setErr(errorMessage(e));
    } finally {
      setSaving(false);
    }
  }

  function updateField(key, value) {
    setFormData((prev) => ({
      ...prev,
      [key]: value,
    }));
  }

  function updateRowField(rowIndex, colKey, val) {
    setFormData((prev) => {
      const rows = [...(prev.rows || [])];
      if (rows[rowIndex]) {
        rows[rowIndex] = { ...rows[rowIndex], [colKey]: val };
      }
      return { ...prev, rows };
    });
  }

  function addRow() {
    setFormData((prev) => {
      const rows = [...(prev.rows || [])];
      const newSerial = rows.length + 1;
      rows.push({
        serial: newSerial,
        name: '',
        role: '',
        bloodGroup: '',
      });
      return { ...prev, rows };
    });
  }

  function removeRow(idx) {
    setFormData((prev) => {
      const rows = (prev.rows || []).filter((_, i) => i !== idx);
      return { ...prev, rows };
    });
  }

  if (!isOpen) return null;

  const rows = formData.rows || [];

  return (
    <div
      style={{
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        backgroundColor: 'rgba(0, 0, 0, 0.75)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 9999,
        padding: 16,
      }}
    >
      <div
        style={{
          background: 'var(--surface, #1e293b)',
          color: 'var(--text, #f8fafc)',
          borderRadius: 12,
          width: '100%',
          maxWidth: 1100,
          maxHeight: '94vh',
          display: 'flex',
          flexDirection: 'column',
          boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.5)',
          border: '1.5px solid var(--border, #334155)',
          direction: 'rtl',
        }}
      >
        {/* Modal Header */}
        <div
          style={{
            padding: '14px 20px',
            borderBottom: '1px solid var(--border, #334155)',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            background: 'var(--surface-alt, #0f172a)',
            borderTopLeftRadius: 12,
            borderTopRightRadius: 12,
          }}
        >
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <span style={{ fontSize: 22 }}>📋</span>
              <h3 style={{ margin: 0, fontSize: 18, color: '#38bdf8' }}>
                د کار او فعاليت رپورټ ثبت او ترتيبول (Proforma Data Entry & Storage)
              </h3>
            </div>
            <div style={{ fontSize: 13, color: 'var(--text-soft, #94a3b8)', marginTop: 4 }}>
              فارم: <strong>{formType?.toUpperCase()}</strong> | مياشت: <strong>{month} / {year}</strong> | يونټ:{' '}
              <strong>{unitName || formData.unitName || formData.areaName || formData.provinceName || 'Unit'}</strong>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            style={{
              background: 'transparent',
              border: 'none',
              fontSize: 24,
              color: 'var(--text-soft, #94a3b8)',
              cursor: 'pointer',
              padding: '0 8px',
            }}
          >
            ✕
          </button>
        </div>

        {/* Status Bar */}
        <div
          style={{
            padding: '8px 20px',
            background: metadata.status === 'SUBMITTED' ? 'rgba(34, 197, 94, 0.15)' : 'rgba(234, 179, 8, 0.15)',
            borderBottom: '1px solid var(--border, #334155)',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            fontSize: 13,
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span>{metadata.status === 'SUBMITTED' ? '✅' : '📝'}</span>
            <span>
              حالت:{' '}
              <strong>
                {metadata.status === 'SUBMITTED' ? 'په ډيټابيس کې ثبت او خوندي شوی (Saved in Database)' : 'مسوده / نه دی ثبت شوی (Draft / Not Saved)'}
              </strong>
            </span>
            {metadata.submittedByName && (
              <span style={{ color: 'var(--text-soft, #94a3b8)', marginInlineStart: 8 }}>
                (د {metadata.submittedByName} لخوا د {metadata.submittedByRole} په توګه)
              </span>
            )}
          </div>
          <div style={{ fontSize: 12, color: 'var(--text-soft, #94a3b8)' }}>
            صلاحيت لرونکي عهدې: سينئر مرستيال، سکرټري، نائب صدر، جنرل سکرټري
          </div>
        </div>

        {/* Modal Body */}
        <div style={{ padding: 20, overflowY: 'auto', flex: 1 }}>
          {loading ? (
            <div style={{ textAlign: 'center', padding: '40px 0' }}>
              <div style={{ fontSize: 16 }}>ډاټا راښکل کيږي... (Loading data from database...)</div>
            </div>
          ) : (
            <>
              {err && (
                <div style={{ padding: 10, background: '#ef444422', border: '1px solid #ef4444', borderRadius: 8, marginBottom: 14, color: '#f87171' }}>
                  {err}
                </div>
              )}
              {msg && (
                <div style={{ padding: 10, background: '#22c55e22', border: '1px solid #22c55e', borderRadius: 8, marginBottom: 14, color: '#4ade80' }}>
                  {msg}
                </div>
              )}

              {/* Pashto Keyboard & Quick Words Toolbar */}
              <PashtoKeyboardHelper activeElementRef={activeInputRef} />

              {/* Tab Navigation */}
              <div style={{ display: 'flex', gap: 10, borderBottom: '1px solid var(--border, #334155)', marginBottom: 16 }}>
                <button
                  type="button"
                  className={`btn ${activeTab === 'summary' ? '' : 'secondary'}`}
                  style={{ borderRadius: '8px 8px 0 0', padding: '8px 16px' }}
                  onClick={() => setActiveTab('summary')}
                >
                  عمومي معلومات او فعاليتونه (Summary & Totals)
                </button>
                <button
                  type="button"
                  className={`btn ${activeTab === 'rows' ? '' : 'secondary'}`}
                  style={{ borderRadius: '8px 8px 0 0', padding: '8px 16px' }}
                  onClick={() => setActiveTab('rows')}
                >
                  د غړو / مسؤلینو جدول ({rows.length} کسان / يونټونه)
                </button>
                <button
                  type="button"
                  className={`btn ${activeTab === 'notes' ? '' : 'secondary'}`}
                  style={{ borderRadius: '8px 8px 0 0', padding: '8px 16px' }}
                  onClick={() => setActiveTab('notes')}
                >
                  تبصره او نوټونه (Notes & Remarks)
                </button>
              </div>

              {/* Tab 1: Summary Fields */}
              {activeTab === 'summary' && (
                <div>
                  <h4 style={{ margin: '0 0 12px', color: '#38bdf8' }}>د يونټ او مياشتني فعاليت لنډيز</h4>
                  <div
                    style={{
                      display: 'grid',
                      gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 1fr))',
                      gap: 12,
                    }}
                  >
                    {/* Common / Form 4 Fields */}
                    {formType === 'form4' && (
                      <>
                        <div>
                          <label style={{ display: 'block', fontSize: 12, marginBottom: 4 }}>د کاري کميټۍ د غونډې نېټه:</label>
                          <input
                            type="text"
                            value={formData.executiveMeetingDate || ''}
                            onChange={(e) => updateField('executiveMeetingDate', e.target.value)}
                            placeholder="مثلا: 10 اکتوبر 2026"
                            style={{ width: '100%', padding: 8, borderRadius: 6, background: 'var(--surface-alt)', border: '1px solid var(--border)', color: 'inherit' }}
                          />
                        </div>
                        <div>
                          <label style={{ display: 'block', fontSize: 12, marginBottom: 4 }}>د عمومي غونډې نېټه:</label>
                          <input
                            type="text"
                            value={formData.generalBodyMeetingDate || ''}
                            onChange={(e) => updateField('generalBodyMeetingDate', e.target.value)}
                            placeholder="مثلا: 25 اکتوبر 2026"
                            style={{ width: '100%', padding: 8, borderRadius: 6, background: 'var(--surface-alt)', border: '1px solid var(--border)', color: 'inherit' }}
                          />
                        </div>
                        <div>
                          <label style={{ display: 'block', fontSize: 12, marginBottom: 4 }}>ټول ملګري (Total Members):</label>
                          <input
                            type="number"
                            value={formData.totalMembers ?? ''}
                            onChange={(e) => updateField('totalMembers', parseInt(e.target.value, 10) || 0)}
                            style={{ width: '100%', padding: 8, borderRadius: 6, background: 'var(--surface-alt)', border: '1px solid var(--border)', color: 'inherit' }}
                          />
                        </div>
                        <div>
                          <label style={{ display: 'block', fontSize: 12, marginBottom: 4 }}>غير فعاله ملګري (Inactive):</label>
                          <input
                            type="number"
                            value={formData.inactiveMembers ?? ''}
                            onChange={(e) => updateField('inactiveMembers', parseInt(e.target.value, 10) || 0)}
                            style={{ width: '100%', padding: 8, borderRadius: 6, background: 'var(--surface-alt)', border: '1px solid var(--border)', color: 'inherit' }}
                          />
                        </div>
                        <div>
                          <label style={{ display: 'block', fontSize: 12, marginBottom: 4 }}>حاضري ټولټال (Total Attendance):</label>
                          <input
                            type="number"
                            value={formData.totalAttendance ?? ''}
                            onChange={(e) => updateField('totalAttendance', parseInt(e.target.value, 10) || 0)}
                            style={{ width: '100%', padding: 8, borderRadius: 6, background: 'var(--surface-alt)', border: '1px solid var(--border)', color: 'inherit' }}
                          />
                        </div>
                        <div>
                          <label style={{ display: 'block', fontSize: 12, marginBottom: 4 }}>د حاضري سلنه % (Attendance %):</label>
                          <input
                            type="text"
                            value={formData.attendanceRate || ''}
                            onChange={(e) => updateField('attendanceRate', e.target.value)}
                            placeholder="مثلا: 75%"
                            style={{ width: '100%', padding: 8, borderRadius: 6, background: 'var(--surface-alt)', border: '1px solid var(--border)', color: 'inherit' }}
                          />
                        </div>
                        <div>
                          <label style={{ display: 'block', fontSize: 12, marginBottom: 4 }}>مياشتنی ټارګټ چنده (Target Dues):</label>
                          <input
                            type="number"
                            value={formData.monthlyTargetDues ?? ''}
                            onChange={(e) => updateField('monthlyTargetDues', parseInt(e.target.value, 10) || 0)}
                            style={{ width: '100%', padding: 8, borderRadius: 6, background: 'var(--surface-alt)', border: '1px solid var(--border)', color: 'inherit' }}
                          />
                        </div>
                        <div>
                          <label style={{ display: 'block', fontSize: 12, marginBottom: 4 }}>ټولټال وصولي / چنده (Collected):</label>
                          <input
                            type="number"
                            value={formData.totalDuesCollected ?? ''}
                            onChange={(e) => updateField('totalDuesCollected', parseInt(e.target.value, 10) || 0)}
                            style={{ width: '100%', padding: 8, borderRadius: 6, background: 'var(--surface-alt)', border: '1px solid var(--border)', color: 'inherit' }}
                          />
                        </div>
                        <div>
                          <label style={{ display: 'block', fontSize: 12, marginBottom: 4 }}>د سټډي سرکلونو شمېر (Study Circles):</label>
                          <input
                            type="number"
                            value={formData.studyCirclesCount ?? ''}
                            onChange={(e) => updateField('studyCirclesCount', parseInt(e.target.value, 10) || 0)}
                            style={{ width: '100%', padding: 8, borderRadius: 6, background: 'var(--surface-alt)', border: '1px solid var(--border)', color: 'inherit' }}
                          />
                        </div>
                        <div>
                          <label style={{ display: 'block', fontSize: 12, marginBottom: 4 }}>د سيمينارونو شمېر (Seminars):</label>
                          <input
                            type="number"
                            value={formData.seminarsCount ?? ''}
                            onChange={(e) => updateField('seminarsCount', parseInt(e.target.value, 10) || 0)}
                            style={{ width: '100%', padding: 8, borderRadius: 6, background: 'var(--surface-alt)', border: '1px solid var(--border)', color: 'inherit' }}
                          />
                        </div>
                        <div>
                          <label style={{ display: 'block', fontSize: 12, marginBottom: 4 }}>د ګوندي ادبياتو لوستونکي غړي:</label>
                          <input
                            type="number"
                            value={formData.membersReadingLiterature ?? ''}
                            onChange={(e) => updateField('membersReadingLiterature', parseInt(e.target.value, 10) || 0)}
                            style={{ width: '100%', padding: 8, borderRadius: 6, background: 'var(--surface-alt)', border: '1px solid var(--border)', color: 'inherit' }}
                          />
                        </div>
                        <div>
                          <label style={{ display: 'block', fontSize: 12, marginBottom: 4 }}>نوي شامل شوي ملګري (New Members):</label>
                          <input
                            type="number"
                            value={formData.newInductions ?? ''}
                            onChange={(e) => updateField('newInductions', parseInt(e.target.value, 10) || 0)}
                            style={{ width: '100%', padding: 8, borderRadius: 6, background: 'var(--surface-alt)', border: '1px solid var(--border)', color: 'inherit' }}
                          />
                        </div>
                      </>
                    )}

                    {/* Form 1, 2, 3 Fields */}
                    {['form1', 'form2', 'form3'].includes(formType) && (
                      <>
                        <div>
                          <label style={{ display: 'block', fontSize: 12, marginBottom: 4 }}>علاقه (Area Name):</label>
                          <input
                            type="text"
                            value={formData.areaName || ''}
                            onChange={(e) => updateField('areaName', e.target.value)}
                            style={{ width: '100%', padding: 8, borderRadius: 6, background: 'var(--surface-alt)', border: '1px solid var(--border)', color: 'inherit' }}
                          />
                        </div>
                        <div>
                          <label style={{ display: 'block', fontSize: 12, marginBottom: 4 }}>د علاقائي غونډې نېټه:</label>
                          <input
                            type="text"
                            value={formData.areaMeetingDate || ''}
                            onChange={(e) => updateField('areaMeetingDate', e.target.value)}
                            placeholder="مثلا: 15 اکتوبر 2026"
                            style={{ width: '100%', padding: 8, borderRadius: 6, background: 'var(--surface-alt)', border: '1px solid var(--border)', color: 'inherit' }}
                          />
                        </div>
                        <div>
                          <label style={{ display: 'block', fontSize: 12, marginBottom: 4 }}>ټول ابتدائي يونټونه (Total Units):</label>
                          <input
                            type="number"
                            value={formData.totalUnitsCount ?? ''}
                            onChange={(e) => updateField('totalUnitsCount', parseInt(e.target.value, 10) || 0)}
                            style={{ width: '100%', padding: 8, borderRadius: 6, background: 'var(--surface-alt)', border: '1px solid var(--border)', color: 'inherit' }}
                          />
                        </div>
                        <div>
                          <label style={{ display: 'block', fontSize: 12, marginBottom: 4 }}>فعاله يونټونه (Active Units):</label>
                          <input
                            type="number"
                            value={formData.activeUnitsCount ?? ''}
                            onChange={(e) => updateField('activeUnitsCount', parseInt(e.target.value, 10) || 0)}
                            style={{ width: '100%', padding: 8, borderRadius: 6, background: 'var(--surface-alt)', border: '1px solid var(--border)', color: 'inherit' }}
                          />
                        </div>
                        <div>
                          <label style={{ display: 'block', fontSize: 12, marginBottom: 4 }}>ټولټال وصولي (Total Dues Collected):</label>
                          <input
                            type="number"
                            value={formData.totalDuesCollected ?? ''}
                            onChange={(e) => updateField('totalDuesCollected', parseInt(e.target.value, 10) || 0)}
                            style={{ width: '100%', padding: 8, borderRadius: 6, background: 'var(--surface-alt)', border: '1px solid var(--border)', color: 'inherit' }}
                          />
                        </div>
                      </>
                    )}

                    {/* Form 5 Province Fields */}
                    {formType === 'form5' && (
                      <>
                        <div>
                          <label style={{ display: 'block', fontSize: 12, marginBottom: 4 }}>صوبه (Province):</label>
                          <input
                            type="text"
                            value={formData.provinceName || ''}
                            onChange={(e) => updateField('provinceName', e.target.value)}
                            style={{ width: '100%', padding: 8, borderRadius: 6, background: 'var(--surface-alt)', border: '1px solid var(--border)', color: 'inherit' }}
                          />
                        </div>
                        <div>
                          <label style={{ display: 'block', fontSize: 12, marginBottom: 4 }}>د صوبائي غونډې نېټه:</label>
                          <input
                            type="text"
                            value={formData.meetingDate || ''}
                            onChange={(e) => updateField('meetingDate', e.target.value)}
                            placeholder="مثلا: 10 اکتوبر 2026"
                            style={{ width: '100%', padding: 8, borderRadius: 6, background: 'var(--surface-alt)', border: '1px solid var(--border)', color: 'inherit' }}
                          />
                        </div>
                        <div>
                          <label style={{ display: 'block', fontSize: 12, marginBottom: 4 }}>ټولټال راټولې شوې چندې (Total Dues):</label>
                          <input
                            type="number"
                            value={formData.totalDuesCollected ?? ''}
                            onChange={(e) => updateField('totalDuesCollected', parseInt(e.target.value, 10) || 0)}
                            style={{ width: '100%', padding: 8, borderRadius: 6, background: 'var(--surface-alt)', border: '1px solid var(--border)', color: 'inherit' }}
                          />
                        </div>
                      </>
                    )}
                  </div>
                </div>
              )}

              {/* Tab 2: Executive Rows / Units Table */}
              {activeTab === 'rows' && (
                <div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
                    <h4 style={{ margin: 0, color: '#38bdf8' }}>
                      {formType === 'form2'
                        ? 'د هر ابتدائي يونټ مياشتنی تفصيل'
                        : 'د کاري کميټۍ د غړو د فعاليت جدول (Individual Executive Records)'}
                    </h4>
                    <button type="button" className="btn secondary" style={{ fontSize: 12, padding: '4px 12px' }} onClick={addRow}>
                      ➕ غړی / کرښه اضافه کول (Add Row)
                    </button>
                  </div>

                  <div style={{ overflowX: 'auto', border: '1px solid var(--border)', borderRadius: 8 }}>
                    <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12, textAlign: 'center' }}>
                      <thead>
                        <tr style={{ background: 'var(--surface-alt)', borderBottom: '1.5px solid var(--border)' }}>
                          <th style={{ padding: '8px 4px', width: 40 }}>#</th>
                          <th style={{ padding: '8px 6px', minWidth: 120 }}>{formType === 'form2' ? 'يونټ نوم' : 'نوم او ولدیت'}</th>
                          <th style={{ padding: '8px 6px', minWidth: 110 }}>{formType === 'form2' ? 'ټول غړي' : 'عهده'}</th>
                          <th style={{ padding: '8px 6px', width: 70 }}>{formType === 'form2' ? 'غير فعاله' : 'وینې ګروپ'}</th>

                          {formType === 'form4' && (
                            <>
                              <th style={{ padding: '8px 4px', width: 65 }}>کاري غونډه</th>
                              <th style={{ padding: '8px 4px', width: 65 }}>عمومي غونډه</th>
                              <th style={{ padding: '8px 4px', width: 55 }}>جلسې</th>
                              <th style={{ padding: '8px 4px', width: 55 }}>مظاهرې</th>
                              <th style={{ padding: '8px 4px', width: 55 }}>پریس کانفرنس</th>
                              <th style={{ padding: '8px 4px', width: 55 }}>سټډي سرکل</th>
                              <th style={{ padding: '8px 4px', width: 55 }}>دورې</th>
                              <th style={{ padding: '8px 4px', width: 70 }}>چنده وصولي</th>
                              <th style={{ padding: '8px 4px', width: 65 }}>مطالعه</th>
                            </>
                          )}

                          {formType === 'form5' && (
                            <>
                              <th style={{ padding: '8px 4px', width: 60 }}>مرکزي غونډې</th>
                              <th style={{ padding: '8px 4px', width: 60 }}>صوبائي غونډې</th>
                              <th style={{ padding: '8px 4px', width: 60 }}>ضلعي غونډې</th>
                              <th style={{ padding: '8px 4px', width: 55 }}>جلسې</th>
                              <th style={{ padding: '8px 4px', width: 55 }}>مظاهرې</th>
                              <th style={{ padding: '8px 4px', width: 55 }}>سټډي سرکل</th>
                              <th style={{ padding: '8px 4px', width: 55 }}>دورې</th>
                              <th style={{ padding: '8px 4px', width: 70 }}>مياشتنۍ چنده</th>
                              <th style={{ padding: '8px 4px', width: 70 }}>ټولې چندې</th>
                            </>
                          )}

                          {formType === 'form2' && (
                            <>
                              <th style={{ padding: '8px 4px', minWidth: 90 }}>کاري غونډه نېټه</th>
                              <th style={{ padding: '8px 4px', minWidth: 90 }}>عمومي غونډه نېټه</th>
                              <th style={{ padding: '8px 4px', width: 60 }}>حاضري %</th>
                              <th style={{ padding: '8px 4px', width: 60 }}>سټډي سرکل</th>
                              <th style={{ padding: '8px 4px', width: 60 }}>سيمينارونه</th>
                              <th style={{ padding: '8px 4px', width: 70 }}>وصولي چنده</th>
                            </>
                          )}

                          <th style={{ padding: '8px 4px', minWidth: 90 }}>نوټونه / تبصره</th>
                          <th style={{ padding: '8px 4px', width: 35 }}></th>
                        </tr>
                      </thead>
                      <tbody>
                        {rows.map((r, i) => (
                          <tr key={i} style={{ borderBottom: '1px solid var(--border)' }}>
                            <td style={{ padding: 4 }}>{i + 1}</td>
                            <td style={{ padding: 4 }}>
                              <input
                                type="text"
                                value={r.name || r.unitName || ''}
                                onChange={(e) => updateRowField(i, formType === 'form2' ? 'unitName' : 'name', e.target.value)}
                                style={{ width: '100%', padding: '4px 6px', borderRadius: 4, background: 'transparent', border: '1px solid var(--border)', color: 'inherit', fontSize: 12 }}
                              />
                            </td>
                            <td style={{ padding: 4 }}>
                              <input
                                type="text"
                                value={r.role || r.totalMembers || ''}
                                onChange={(e) => updateRowField(i, formType === 'form2' ? 'totalMembers' : 'role', e.target.value)}
                                style={{ width: '100%', padding: '4px 6px', borderRadius: 4, background: 'transparent', border: '1px solid var(--border)', color: 'inherit', fontSize: 12 }}
                              />
                            </td>
                            <td style={{ padding: 4 }}>
                              <input
                                type="text"
                                value={r.bloodGroup || r.inactiveMembers || ''}
                                onChange={(e) => updateRowField(i, formType === 'form2' ? 'inactiveMembers' : 'bloodGroup', e.target.value)}
                                style={{ width: '100%', padding: '4px 4px', borderRadius: 4, background: 'transparent', border: '1px solid var(--border)', color: 'inherit', fontSize: 11, textAlign: 'center' }}
                              />
                            </td>

                            {formType === 'form4' && (
                              <>
                                <td style={{ padding: 4 }}>
                                  <input type="text" value={r.executiveMeetingsAttended ?? ''} onChange={(e) => updateRowField(i, 'executiveMeetingsAttended', e.target.value)} style={{ width: '100%', padding: '4px 2px', borderRadius: 4, background: 'transparent', border: '1px solid var(--border)', color: 'inherit', textAlign: 'center' }} />
                                </td>
                                <td style={{ padding: 4 }}>
                                  <input type="text" value={r.generalBodyMeetingsAttended ?? ''} onChange={(e) => updateRowField(i, 'generalBodyMeetingsAttended', e.target.value)} style={{ width: '100%', padding: '4px 2px', borderRadius: 4, background: 'transparent', border: '1px solid var(--border)', color: 'inherit', textAlign: 'center' }} />
                                </td>
                                <td style={{ padding: 4 }}>
                                  <input type="text" value={r.ralliesAttended ?? ''} onChange={(e) => updateRowField(i, 'ralliesAttended', e.target.value)} style={{ width: '100%', padding: '4px 2px', borderRadius: 4, background: 'transparent', border: '1px solid var(--border)', color: 'inherit', textAlign: 'center' }} />
                                </td>
                                <td style={{ padding: 4 }}>
                                  <input type="text" value={r.protestsAttended ?? ''} onChange={(e) => updateRowField(i, 'protestsAttended', e.target.value)} style={{ width: '100%', padding: '4px 2px', borderRadius: 4, background: 'transparent', border: '1px solid var(--border)', color: 'inherit', textAlign: 'center' }} />
                                </td>
                                <td style={{ padding: 4 }}>
                                  <input type="text" value={r.pressConferencesAttended ?? ''} onChange={(e) => updateRowField(i, 'pressConferencesAttended', e.target.value)} style={{ width: '100%', padding: '4px 2px', borderRadius: 4, background: 'transparent', border: '1px solid var(--border)', color: 'inherit', textAlign: 'center' }} />
                                </td>
                                <td style={{ padding: 4 }}>
                                  <input type="text" value={r.studyCirclesAttended ?? ''} onChange={(e) => updateRowField(i, 'studyCirclesAttended', e.target.value)} style={{ width: '100%', padding: '4px 2px', borderRadius: 4, background: 'transparent', border: '1px solid var(--border)', color: 'inherit', textAlign: 'center' }} />
                                </td>
                                <td style={{ padding: 4 }}>
                                  <input type="text" value={r.toursAttended ?? ''} onChange={(e) => updateRowField(i, 'toursAttended', e.target.value)} style={{ width: '100%', padding: '4px 2px', borderRadius: 4, background: 'transparent', border: '1px solid var(--border)', color: 'inherit', textAlign: 'center' }} />
                                </td>
                                <td style={{ padding: 4 }}>
                                  <input type="text" value={r.donationsCollected ?? ''} onChange={(e) => updateRowField(i, 'donationsCollected', e.target.value)} style={{ width: '100%', padding: '4px 2px', borderRadius: 4, background: 'transparent', border: '1px solid var(--border)', color: 'inherit', textAlign: 'center' }} />
                                </td>
                                <td style={{ padding: 4 }}>
                                  <input type="text" value={r.partyLiteratureRead ?? ''} onChange={(e) => updateRowField(i, 'partyLiteratureRead', e.target.value)} style={{ width: '100%', padding: '4px 2px', borderRadius: 4, background: 'transparent', border: '1px solid var(--border)', color: 'inherit', textAlign: 'center' }} />
                                </td>
                              </>
                            )}

                            {formType === 'form5' && (
                              <>
                                <td style={{ padding: 4 }}>
                                  <input type="text" value={r.centralCabinetMeetings ?? ''} onChange={(e) => updateRowField(i, 'centralCabinetMeetings', e.target.value)} style={{ width: '100%', padding: '4px 2px', borderRadius: 4, background: 'transparent', border: '1px solid var(--border)', color: 'inherit', textAlign: 'center' }} />
                                </td>
                                <td style={{ padding: 4 }}>
                                  <input type="text" value={r.provincialCabinetMeetings ?? ''} onChange={(e) => updateRowField(i, 'provincialCabinetMeetings', e.target.value)} style={{ width: '100%', padding: '4px 2px', borderRadius: 4, background: 'transparent', border: '1px solid var(--border)', color: 'inherit', textAlign: 'center' }} />
                                </td>
                                <td style={{ padding: 4 }}>
                                  <input type="text" value={r.districtWorkingCommitteeMeetings ?? ''} onChange={(e) => updateRowField(i, 'districtWorkingCommitteeMeetings', e.target.value)} style={{ width: '100%', padding: '4px 2px', borderRadius: 4, background: 'transparent', border: '1px solid var(--border)', color: 'inherit', textAlign: 'center' }} />
                                </td>
                                <td style={{ padding: 4 }}>
                                  <input type="text" value={r.ralliesRallies ?? ''} onChange={(e) => updateRowField(i, 'ralliesRallies', e.target.value)} style={{ width: '100%', padding: '4px 2px', borderRadius: 4, background: 'transparent', border: '1px solid var(--border)', color: 'inherit', textAlign: 'center' }} />
                                </td>
                                <td style={{ padding: 4 }}>
                                  <input type="text" value={r.protestsStrikes ?? ''} onChange={(e) => updateRowField(i, 'protestsStrikes', e.target.value)} style={{ width: '100%', padding: '4px 2px', borderRadius: 4, background: 'transparent', border: '1px solid var(--border)', color: 'inherit', textAlign: 'center' }} />
                                </td>
                                <td style={{ padding: 4 }}>
                                  <input type="text" value={r.studyCirclesCount ?? ''} onChange={(e) => updateRowField(i, 'studyCirclesCount', e.target.value)} style={{ width: '100%', padding: '4px 2px', borderRadius: 4, background: 'transparent', border: '1px solid var(--border)', color: 'inherit', textAlign: 'center' }} />
                                </td>
                                <td style={{ padding: 4 }}>
                                  <input type="text" value={r.toursVisitsCount ?? ''} onChange={(e) => updateRowField(i, 'toursVisitsCount', e.target.value)} style={{ width: '100%', padding: '4px 2px', borderRadius: 4, background: 'transparent', border: '1px solid var(--border)', color: 'inherit', textAlign: 'center' }} />
                                </td>
                                <td style={{ padding: 4 }}>
                                  <input type="text" value={r.duesPaidMonthly ?? ''} onChange={(e) => updateRowField(i, 'duesPaidMonthly', e.target.value)} style={{ width: '100%', padding: '4px 2px', borderRadius: 4, background: 'transparent', border: '1px solid var(--border)', color: 'inherit', textAlign: 'center' }} />
                                </td>
                                <td style={{ padding: 4 }}>
                                  <input type="text" value={r.totalDonationsCollected ?? ''} onChange={(e) => updateRowField(i, 'totalDonationsCollected', e.target.value)} style={{ width: '100%', padding: '4px 2px', borderRadius: 4, background: 'transparent', border: '1px solid var(--border)', color: 'inherit', textAlign: 'center' }} />
                                </td>
                              </>
                            )}

                            {formType === 'form2' && (
                              <>
                                <td style={{ padding: 4 }}>
                                  <input type="text" value={r.executiveMeetingDate || ''} onChange={(e) => updateRowField(i, 'executiveMeetingDate', e.target.value)} style={{ width: '100%', padding: '4px 2px', borderRadius: 4, background: 'transparent', border: '1px solid var(--border)', color: 'inherit', textAlign: 'center' }} />
                                </td>
                                <td style={{ padding: 4 }}>
                                  <input type="text" value={r.generalBodyMeetingDate || ''} onChange={(e) => updateRowField(i, 'generalBodyMeetingDate', e.target.value)} style={{ width: '100%', padding: '4px 2px', borderRadius: 4, background: 'transparent', border: '1px solid var(--border)', color: 'inherit', textAlign: 'center' }} />
                                </td>
                                <td style={{ padding: 4 }}>
                                  <input type="text" value={r.attendanceRate || ''} onChange={(e) => updateRowField(i, 'attendanceRate', e.target.value)} style={{ width: '100%', padding: '4px 2px', borderRadius: 4, background: 'transparent', border: '1px solid var(--border)', color: 'inherit', textAlign: 'center' }} />
                                </td>
                                <td style={{ padding: 4 }}>
                                  <input type="text" value={r.studyCircles || ''} onChange={(e) => updateRowField(i, 'studyCircles', e.target.value)} style={{ width: '100%', padding: '4px 2px', borderRadius: 4, background: 'transparent', border: '1px solid var(--border)', color: 'inherit', textAlign: 'center' }} />
                                </td>
                                <td style={{ padding: 4 }}>
                                  <input type="text" value={r.seminars || ''} onChange={(e) => updateRowField(i, 'seminars', e.target.value)} style={{ width: '100%', padding: '4px 2px', borderRadius: 4, background: 'transparent', border: '1px solid var(--border)', color: 'inherit', textAlign: 'center' }} />
                                </td>
                                <td style={{ padding: 4 }}>
                                  <input type="text" value={r.collectedDues || ''} onChange={(e) => updateRowField(i, 'collectedDues', e.target.value)} style={{ width: '100%', padding: '4px 2px', borderRadius: 4, background: 'transparent', border: '1px solid var(--border)', color: 'inherit', textAlign: 'center' }} />
                                </td>
                              </>
                            )}

                            <td style={{ padding: 4 }}>
                              <input
                                type="text"
                                value={r.notes || ''}
                                onChange={(e) => updateRowField(i, 'notes', e.target.value)}
                                style={{ width: '100%', padding: '4px 6px', borderRadius: 4, background: 'transparent', border: '1px solid var(--border)', color: 'inherit', fontSize: 11 }}
                              />
                            </td>
                            <td style={{ padding: 4 }}>
                              <button
                                type="button"
                                onClick={() => removeRow(i)}
                                style={{ background: 'transparent', border: 'none', color: '#ef4444', cursor: 'pointer', fontSize: 14 }}
                              >
                                🗑️
                              </button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

              {/* Tab 3: Notes & Remarks */}
              {activeTab === 'notes' && (
                <div>
                  <h4 style={{ margin: '0 0 10px', color: '#38bdf8' }}>د سينئر مرستيال يا مسؤل ځانګړې تبصره او يادښتونه (Officer Notes)</h4>
                  <textarea
                    rows={8}
                    value={formData.notes || ''}
                    onChange={(e) => updateField('notes', e.target.value)}
                    placeholder="دلته د مياشتني فعاليت، ننګونو، سپارښتنو يا نورو مهمو چارو په هکله نوټ وليکئ..."
                    style={{
                      width: '100%',
                      padding: 12,
                      borderRadius: 8,
                      background: 'var(--surface-alt)',
                      border: '1px solid var(--border)',
                      color: 'inherit',
                      fontSize: 14,
                      lineHeight: '1.6',
                    }}
                  />
                </div>
              )}
            </>
          )}
        </div>

        {/* Modal Footer */}
        <div
          style={{
            padding: '14px 20px',
            borderTop: '1px solid var(--border, #334155)',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            background: 'var(--surface-alt, #0f172a)',
            borderBottomLeftRadius: 12,
            borderBottomRightRadius: 12,
          }}
        >
          <div style={{ display: 'flex', gap: 8 }}>
            <button
              type="button"
              className="btn secondary"
              onClick={loadData}
              disabled={loading || saving}
              style={{ fontSize: 13 }}
            >
              🔄 د سسټم ډاټا بيا راښکل (Reset / Re-fetch)
            </button>
          </div>

          <div style={{ display: 'flex', gap: 10 }}>
            <button
              type="button"
              className="btn secondary"
              onClick={onClose}
              disabled={saving}
              style={{ fontSize: 13 }}
            >
              بندول (Close)
            </button>
            <button
              type="button"
              className="btn"
              onClick={handleSave}
              disabled={loading || saving || !canEdit}
              style={{
                background: '#16a34a',
                borderColor: '#16a34a',
                fontWeight: 700,
                padding: '8px 24px',
                fontSize: 14,
              }}
            >
              {saving ? 'خوندي کیږي... (Saving...)' : '💾 په ډيټابيس کې ثبت او خوندي کول (Save & Store Report)'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
