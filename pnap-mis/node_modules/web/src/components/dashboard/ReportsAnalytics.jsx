import SmartKpi from '../SmartKpi';
import { SkeletonKpiGrid } from '../Skeleton';
import { HBar, PctBar, BRAND } from '../charts';
import { FileTextIcon, CheckIcon, InfoIcon } from '../icons';
import useAnalytics from './useAnalytics';
import UnitReportDownloads from './UnitReportDownloads';
import PerformanceReports from './PerformanceReports';

// Section 6 — Reports.
//
// Three things, in the order an executive wants them:
//   1. Filing status — which meetings owe a report.
//   2. Unit reports — download the Province / District / Area / Basic
//      Unit report for any unit.
//   3. Performance — unit score, member leaderboard, member reports.
//
// There is deliberately NO "assigned / pending / completed" panel: no
// report in this system is assigned to a person. The unit reports are
// generated documents (PDF/XLSX on demand) and the only report with a
// lifecycle is a meeting's, which is filed by finalizing the meeting.

const LEVEL_NOUN = {
  PROVINCE: 'Province', DISTRICT: 'District',
  AREA: 'Area', BASIC_UNIT: 'Basic Unit',
};

export default function ReportsAnalytics({
  params, windowLabel, unitLevel, unitId, scopeName, periodFrom, scope,
}) {
  const { data, loading, error } = useAnalytics('/dashboard/reports', params);

  if (loading && !data) return <SkeletonKpiGrid count={3} />;
  if (error) return <div className="alert error">{error}</div>;
  if (!data) return null;

  const t = data.totals;
  const rows = data.rows || [];
  const noun = data.level ? LEVEL_NOUN[data.level] : null;

  return (
    <>
      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fit, minmax(190px, 1fr))',
        gap: 10, marginBottom: 12,
      }}>
        <SmartKpi
          label="Reports Filed" value={t.filed}
          icon={<CheckIcon size={14} />}
          iconBg="var(--success-bg)" iconColor="var(--success)"
        />
        <SmartKpi
          label="Reports Outstanding" value={t.outstanding}
          icon={<InfoIcon size={14} />}
          iconBg="var(--danger-bg)" iconColor="var(--danger)"
        />
        <SmartKpi
          label="Filing Rate" value={t.filingRate ?? 0}
          icon={<FileTextIcon size={14} />}
          iconBg="var(--primary-tint)" iconColor="var(--primary)"
          format={(v) => (t.filingRate == null ? '—' : `${v}%`)}
        />
      </div>

      <p className="muted" style={{ fontSize: 12, marginTop: -4, marginBottom: 12 }}>
        A meeting&apos;s report is <strong>filed</strong> when the meeting is finalized and
        <strong> outstanding</strong> once it has ended without that happening. Outstanding
        counts ignore the date filter — a report from six months ago is still owed today.
      </p>

      {noun && rows.length > 0 && (
        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))',
          gap: 10, marginBottom: 12,
        }}>
          <div className="chart-card">
            <div className="chart-card-head">
              <div>
                <div className="chart-card-title">{noun}s owing reports</div>
                <div className="chart-card-sub">Most outstanding first</div>
              </div>
            </div>
            <HBar
              rows={rows.slice(0, 10).map((r) => ({ label: r.name, value: r.outstanding }))}
              accent="var(--danger)"
              emptyLabel="Nothing outstanding."
            />
          </div>

          <div className="chart-card">
            <div className="chart-card-head">
              <div>
                <div className="chart-card-title">Filing rate by {noun.toLowerCase()}</div>
                <div className="chart-card-sub">Filed ÷ (filed + outstanding)</div>
              </div>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 9, paddingTop: 4 }}>
              {rows.slice(0, 8).map((r) => (
                <PctBar
                  key={r._id}
                  value={r.filingRate}
                  label={`${r.name} · ${r.filed} filed, ${r.outstanding} owed`}
                />
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Province / District / Area / Basic Unit report downloads. */}
      <UnitReportDownloads scope={scope} from={periodFrom} />

      {/* Unit performance score, member leaderboard, member reports. */}
      <PerformanceReports
        unitLevel={unitLevel}
        unitId={unitId}
        scopeName={scopeName}
        from={periodFrom}
        windowLabel={windowLabel}
      />
    </>
  );
}
