import SmartKpi from '../SmartKpi';
import { SkeletonKpiGrid } from '../Skeleton';
import { StackedHBar, Donut } from '../charts';
import { FileTextIcon, CheckIcon, InfoIcon } from '../icons';
import useAnalytics from './useAnalytics';
import UnitReportDownloads from './UnitReportDownloads';

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
  params, periodFrom, scope, accessScope,
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
          label="Reports submitted" value={t.filed}
          icon={<CheckIcon size={14} />}
          iconBg="var(--success-bg)" iconColor="var(--success)"
        />
        <SmartKpi
          label="Reports not submitted" value={t.outstanding}
          icon={<InfoIcon size={14} />}
          iconBg="var(--danger-bg)" iconColor="var(--danger)"
        />
        <SmartKpi
          label="Reports submitted (%)" value={t.filingRate ?? 0}
          icon={<FileTextIcon size={14} />}
          iconBg="var(--primary-tint)" iconColor="var(--primary)"
          format={(v) => (t.filingRate == null ? '—' : `${v}%`)}
        />
      </div>

      {/* Only the counter-intuitive half is worth saying: filed/outstanding
          are self-explanatory, the date-filter exemption is not. */}
      <p className="muted" style={{ fontSize: 12, marginTop: -4, marginBottom: 12 }}>
        Reports not submitted include older reports, even if they fall outside the selected dates.
      </p>

      {noun && rows.length > 0 && (
        <div style={{
          display: 'grid',
          gridTemplateColumns: 'minmax(0, 2fr) minmax(200px, 1fr)',
          gap: 10, marginBottom: 12,
        }} className="rep-grid">
          {/* One stacked bar per unit carries what the two old panels said
              between them: bar length is how much is owed in total, and the
              split inside it is the filing rate. Reading the same unit twice
              in two different charts was the thing to remove. */}
          <div className="chart-card">
            <div className="chart-card-head">
              <div>
                <div className="chart-card-title">Report status by {noun.toLowerCase()}</div>
                <div className="chart-card-sub">Units with the most missing reports appear first</div>
              </div>
            </div>
            <StackedHBar
              rows={rows.slice(0, 10).map((r) => ({
                label: r.name,
                values: { filed: r.filed, outstanding: r.outstanding },
              }))}
              series={[
                { key: 'filed', label: 'Submitted', color: 'var(--success)' },
                { key: 'outstanding', label: 'Not submitted', color: 'var(--danger)' },
              ]}
              emptyLabel="No reports found."
            />
          </div>

          <div className="chart-card rep-gauge">
            <div className="chart-card-head">
              <div>
                <div className="chart-card-title">Reports submitted (%)</div>
                <div className="chart-card-sub">Submitted reports as a percentage of all required reports</div>
              </div>
            </div>
            <div className="rep-gauge-body">
              <Donut
                percent={t.filingRate ?? 0}
                label=""
                size={132}
                stroke={13}
                color={(t.filingRate ?? 0) >= 60 ? 'var(--success)' : 'var(--warning)'}
                trackColor="var(--surface-alt)"
              />
              <p className="rep-gauge-note">
                {t.filed.toLocaleString()} submitted · {t.outstanding.toLocaleString()} not submitted
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Province / District / Area / Basic Unit report downloads. */}
      <UnitReportDownloads scope={scope} from={periodFrom} accessScope={accessScope} />
    </>
  );
}
