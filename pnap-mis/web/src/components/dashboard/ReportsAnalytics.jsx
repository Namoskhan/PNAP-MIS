import { useTranslation } from 'react-i18next';
import SmartKpi from '../SmartKpi';
import { SkeletonKpiGrid } from '../Skeleton';
import { StackedHBar, Donut } from '../charts';
import { FileTextIcon, CheckIcon, InfoIcon } from '../icons';
import useAnalytics from './useAnalytics';
import UnitReportDownloads from './UnitReportDownloads';

// Section 6 — Reports.

export default function ReportsAnalytics({
  params, periodFrom, scope, accessScope,
}) {
  const { t } = useTranslation();
  const { data, loading, error } = useAnalytics('/dashboard/reports', params);

  const levelNoun = {
    PROVINCE: t('units.province', 'Province'),
    DISTRICT: t('units.district', 'District'),
    AREA: t('units.area', 'Area'),
    BASIC_UNIT: t('units.basicUnit', 'Basic Unit'),
  };

  if (loading && !data) return <SkeletonKpiGrid count={3} />;
  if (error) return <div className="alert error">{error}</div>;
  if (!data) return null;

  const totals = data.totals;
  const rows = data.rows || [];
  const noun = data.level ? levelNoun[data.level] : null;

  return (
    <>
      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fit, minmax(190px, 1fr))',
        gap: 10, marginBottom: 12,
      }}>
        <SmartKpi
          label={t('dashboard.reportsSubmitted', 'Reports submitted')} value={totals.filed}
          icon={<CheckIcon size={14} />}
          iconBg="var(--success-bg)" iconColor="var(--success)"
        />
        <SmartKpi
          label={t('dashboard.reportsNotSubmitted', 'Reports not submitted')} value={totals.outstanding}
          icon={<InfoIcon size={14} />}
          iconBg="var(--danger-bg)" iconColor="var(--danger)"
        />
        <SmartKpi
          label={t('dashboard.reportsSubmittedPct', 'Reports submitted (%)')} value={totals.filingRate ?? 0}
          icon={<FileTextIcon size={14} />}
          iconBg="var(--primary-tint)" iconColor="var(--primary)"
          format={(v) => (totals.filingRate == null ? '—' : `${v}%`)}
        />
      </div>

      <p className="muted" style={{ fontSize: 12, marginTop: -4, marginBottom: 12 }}>
        {t('dashboard.reportsNotSubmittedNote', 'Reports not submitted include older reports, even if they fall outside the selected dates.')}
      </p>

      {noun && rows.length > 0 && (
        <div style={{
          display: 'grid',
          gridTemplateColumns: 'minmax(0, 2fr) minmax(200px, 1fr)',
          gap: 10, marginBottom: 12,
        }} className="rep-grid">
          <div className="chart-card">
            <div className="chart-card-head">
              <div>
                <div className="chart-card-title">
                  {t('dashboard.reportStatusBy', 'Report status by {{tier}}', { tier: noun })}
                </div>
                <div className="chart-card-sub">
                  {t('dashboard.unitsWithMostMissingFirst', 'Units with the most missing reports appear first')}
                </div>
              </div>
            </div>
            <StackedHBar
              rows={rows.slice(0, 10).map((r) => ({
                label: r.name,
                values: { filed: r.filed, outstanding: r.outstanding },
              }))}
              series={[
                { key: 'filed', label: t('dashboard.submitted', 'Submitted'), color: 'var(--success)' },
                { key: 'outstanding', label: t('dashboard.notSubmitted', 'Not submitted'), color: 'var(--danger)' },
              ]}
              emptyLabel={t('common.noData', 'No records found')}
            />
          </div>

          <div className="chart-card rep-gauge">
            <div className="chart-card-head">
              <div>
                <div className="chart-card-title">{t('dashboard.reportsSubmittedPct', 'Reports submitted (%)')}</div>
                <div className="chart-card-sub">
                  {t('dashboard.submittedPctSub', 'Submitted reports as a percentage of all required reports')}
                </div>
              </div>
            </div>
            <div className="rep-gauge-body">
              <Donut
                percent={totals.filingRate ?? 0}
                label=""
                size={132}
                stroke={13}
                color={(totals.filingRate ?? 0) >= 60 ? 'var(--success)' : 'var(--warning)'}
                trackColor="var(--surface-alt)"
              />
              <p className="rep-gauge-note">
                {totals.filed.toLocaleString()} {t('dashboard.submitted', 'submitted')} · {totals.outstanding.toLocaleString()} {t('dashboard.notSubmitted', 'not submitted')}
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
