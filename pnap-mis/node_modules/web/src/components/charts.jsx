// Lightweight inline-SVG chart primitives. No external dependency,
// fully styleable via CSS variables.

// Brand chart ramp — corporate blue family (deep → bright → tints).
// Keys keep their legacy names so call sites read the same; values
// align with the styles.css / themePresets corporate-blue palette.
export const BRAND = {
  darkest: '#172554',
  dark: '#1e40af',
  mid: '#2563eb',
  bright: '#3b82f6',
  light: '#93c5fd',
  pinker: '#bfdbfe',
  tint: '#eff6ff',
};

// SVG text inside small charts needs higher contrast than the body
// `--muted` token gives — small font sizes need stronger color to
// meet WCAG AA at 9–11px. Use a single shared dark-slate value.
const CHART_AXIS_FILL = '#334155';   // matches --text-soft
const CHART_AXIS_SUB  = '#475569';   // for second-tier sublabels

// ─── Horizontal bar chart ───
// rows: [{ label, value, color? }] — a per-row `color` overrides
// `accent`, which is what lets one HBar carry a CATEGORICAL palette
// (one hue per identity) instead of a single magnitude colour. Rows
// are always directly labelled, so a categorical palette here never
// relies on colour alone to be readable.
export function HBar({ rows, accent = 'var(--primary)', emptyLabel = 'No data.' }) {
  if (!rows || rows.length === 0) {
    return <p className="muted" style={{ margin: 0, fontSize: 13 }}>{emptyLabel}</p>;
  }
  const max = Math.max(...rows.map((r) => r.value || 0), 1);
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
      {rows.map((r) => {
        const pct = Math.round(((r.value || 0) / max) * 100);
        return (
          <div key={r.label} style={{ display: 'flex', alignItems: 'center', gap: 10, fontSize: 13 }}>
            <div style={{ width: 130, color: 'var(--text-soft)', fontWeight: 500 }}>{r.label}</div>
            <div style={{ flex: 1, height: 14, background: 'var(--surface-alt)', borderRadius: 7, overflow: 'hidden', position: 'relative' }}>
              <div style={{ width: `${pct}%`, height: '100%', background: r.color || accent, borderRadius: 7, transition: 'width .3s ease' }} />
            </div>
            <div style={{ width: 40, textAlign: 'right', fontWeight: 600, fontSize: 13 }}>{r.value || 0}</div>
          </div>
        );
      })}
    </div>
  );
}

// ─── Stacked horizontal bars (composition per row) ───
//
// For "how big is each one, and what is it made of" — the question a
// per-unit table answers a column at a time and makes the reader add up
// themselves.
//
// Bars are scaled to the LARGEST ROW TOTAL, not each to its own width,
// so the length of a bar means population size and the split inside it
// means composition. Scaling each row to 100% would make a 3-member
// unit look the same size as a 3,000-member one — the single easiest
// way to make a chart like this lie.
//
// rows:   [{ label, values: { [key]: number }, note? }]
// series: [{ key, label, color }]  — drawn left to right in this order
export function StackedHBar({ rows, series, emptyLabel = 'No data.', noteLabel }) {
  if (!rows || rows.length === 0) {
    return <p className="muted" style={{ margin: 0, fontSize: 13 }}>{emptyLabel}</p>;
  }
  const totalOf = (r) => series.reduce((s, x) => s + (r.values[x.key] || 0), 0);
  const max = Math.max(...rows.map(totalOf), 1);

  return (
    <div className="shb">
      <div className="shb-legend">
        {series.map((s) => (
          <span key={s.key} className="shb-legend-item">
            <span className="shb-swatch" style={{ background: s.color }} />
            {s.label}
          </span>
        ))}
      </div>

      <div className="shb-rows">
        {rows.map((r) => {
          const total = totalOf(r);
          // Width of the whole bar relative to the biggest row.
          const scale = (total / max) * 100;
          return (
            <div key={r.label} className="shb-row">
              <div className="shb-label" title={r.label}>{r.label}</div>

              <div className="shb-track">
                <div className="shb-stack" style={{ width: `${Math.max(scale, total > 0 ? 1.5 : 0)}%` }}>
                  {series.map((s) => {
                    const v = r.values[s.key] || 0;
                    if (v <= 0) return null;
                    return (
                      <div
                        key={s.key}
                        className="shb-seg"
                        style={{ width: `${(v / total) * 100}%`, background: s.color }}
                        title={`${r.label} — ${s.label}: ${v.toLocaleString()} of ${total.toLocaleString()}`}
                      >
                        {/* Printed inside only when the segment is wide
                            enough to hold it; CSS hides it otherwise. */}
                        <span className="shb-seg-num">{v.toLocaleString()}</span>
                      </div>
                    );
                  })}
                </div>
              </div>

              <div className="shb-total">
                {total.toLocaleString()}
                {r.note != null && r.note > 0 && (
                  <span className="shb-note" title={noteLabel}>+{r.note.toLocaleString()}</span>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ─── Multi-series sparkline (legacy trend) ───
export function MultiSparkline({ data, series, height = 110 }) {
  if (!data || data.length === 0) {
    return <p className="muted" style={{ margin: 0, fontSize: 13 }}>No trend data yet.</p>;
  }
  const w = 600, padX = 36, padY = 18, plotW = w - padX * 2, plotH = height - padY * 2;
  const allValues = series.flatMap((s) => data.map((d) => d[s.key] || 0));
  const max = Math.max(...allValues, 1);
  const stepX = data.length > 1 ? plotW / (data.length - 1) : 0;
  function points(seriesKey) {
    return data.map((d, i) => {
      const x = padX + i * stepX;
      const y = padY + plotH - ((d[seriesKey] || 0) / max) * plotH;
      return `${x},${y}`;
    }).join(' ');
  }
  return (
    <div style={{ width: '100%', overflowX: 'auto' }}>
      <svg viewBox={`0 0 ${w} ${height}`} preserveAspectRatio="none" style={{ width: '100%', height, display: 'block' }}>
        {[0, 0.5, 1].map((t) => {
          const y = padY + plotH * (1 - t);
          return <line key={t} x1={padX} y1={y} x2={w - padX} y2={y} stroke="var(--border)" strokeWidth="1" strokeDasharray={t === 0 ? '0' : '3 3'} />;
        })}
        <text x={padX - 6} y={padY + 4} fontSize="10.5" fill={CHART_AXIS_FILL} fontWeight="500" textAnchor="end">{max}</text>
        <text x={padX - 6} y={padY + plotH + 4} fontSize="10.5" fill={CHART_AXIS_FILL} fontWeight="500" textAnchor="end">0</text>
        {series.map((s) => (
          <g key={s.key}>
            <polyline points={points(s.key)} fill="none" stroke={s.color} strokeWidth="2.5" strokeLinejoin="round" strokeLinecap="round" />
            {data.map((d, i) => {
              const x = padX + i * stepX;
              const y = padY + plotH - ((d[s.key] || 0) / max) * plotH;
              return <circle key={i} cx={x} cy={y} r="3" fill={s.color}><title>{`${d.label || d.month}: ${d[s.key] || 0} ${s.label}`}</title></circle>;
            })}
          </g>
        ))}
        {data.map((d, i) => {
          const x = padX + i * stepX;
          return <text key={i} x={x} y={height - 2} fontSize="10.5" fontWeight="500" fill={CHART_AXIS_FILL} textAnchor="middle">{d.label || d.month?.slice(5) || ''}</text>;
        })}
      </svg>
      <div style={{ display: 'flex', gap: 16, marginTop: 6, fontSize: 12 }}>
        {series.map((s) => (
          <span key={s.key} style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
            <span style={{ width: 12, height: 3, background: s.color, borderRadius: 2 }} />
            <span style={{ color: 'var(--text-soft)' }}>{s.label}</span>
          </span>
        ))}
      </div>
    </div>
  );
}

// ─── Percentage bar ───
export function PctBar({ value, label, threshold = 60 }) {
  const v = value == null ? 0 : Math.max(0, Math.min(100, value));
  const isLow = value != null && value < threshold;
  const color = value == null ? 'var(--muted-soft)' : isLow ? 'var(--danger)' : 'var(--success)';
  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, marginBottom: 4 }}>
        <span style={{ color: 'var(--text-soft)', fontWeight: 500 }}>{label}</span>
        <span style={{ color, fontWeight: 600 }}>{value == null ? '—' : `${value}%`}</span>
      </div>
      <div style={{ height: 8, background: 'var(--surface-alt)', borderRadius: 4, overflow: 'hidden' }}>
        <div style={{ width: `${v}%`, height: '100%', background: color, borderRadius: 4, transition: 'width .3s ease' }} />
      </div>
    </div>
  );
}

// ─── Sparkline (full-width, fits at bottom of a KPI card) ───
export function Sparkline({ values, color = BRAND.dark, fill = 'rgba(30,64,175,0.10)', height = 28 }) {
  if (!values || values.length < 2) return null;
  const max = Math.max(...values, 1);
  const min = Math.min(...values, 0);
  const range = max - min || 1;
  const w = 200;
  const step = w / (values.length - 1);
  const points = values.map((v, i) => {
    const x = i * step;
    const y = height - ((v - min) / range) * (height - 4) - 2;
    return `${x.toFixed(1)},${y.toFixed(1)}`;
  }).join(' ');
  const areaPoints = `0,${height} ${points} ${w},${height}`;
  return (
    <svg viewBox={`0 0 ${w} ${height}`} preserveAspectRatio="none" width="100%" height={height} style={{ display: 'block' }} aria-hidden="true">
      <polygon points={areaPoints} fill={fill} />
      <polyline points={points} fill="none" stroke={color} strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" vectorEffect="non-scaling-stroke" />
    </svg>
  );
}

// ─── Vertical bars (with optional light "background" track) ───
// rows: [{ label, value, total? }] — if total > value, a light track is drawn behind the value bar.
//
// `width` is the SVG's viewBox width, i.e. the coordinate space the
// 11px labels are measured against — NOT the rendered size, which is
// always 100% of the container. With the default 240 and more than
// about six bars, each slot becomes narrower than its own label and
// the axis turns to mush. Callers plotting many bars, or bars with
// long labels, should pass a width scaled to
// `rows.length x longest-label` and put the chart in a horizontally
// scrollable wrapper. Defaulted so existing call sites are unchanged.
export function VBars({ rows, height = 90, color = BRAND.dark, trackColor = BRAND.tint, emptyLabel = 'No data.', showLabels = true, width = 240 }) {
  if (!rows || rows.length === 0) {
    return <p className="muted" style={{ margin: 0, fontSize: 12, padding: '20px 0' }}>{emptyLabel}</p>;
  }
  const max = Math.max(...rows.map((r) => Math.max(r.total || 0, r.value || 0)), 1);
  const padX = 8, padTop = 14, padBottom = showLabels ? 24 : 6;
  const w = width, plotH = height - padTop - padBottom;
  const slot = (w - padX * 2) / rows.length;
  const barW = Math.min(slot * 0.62, 30);
  return (
    <svg viewBox={`0 0 ${w} ${height}`} width="100%" height={height} style={{ display: 'block' }} role="img">
      {rows.map((r, i) => {
        const cx = padX + i * slot + slot / 2;
        const x = cx - barW / 2;
        const valH = ((r.value || 0) / max) * plotH;
        const totH = ((r.total || r.value || 0) / max) * plotH;
        const valY = padTop + plotH - valH;
        return (
          <g key={i}>
            {(r.total || 0) > (r.value || 0) && (
              <rect x={x} y={padTop + plotH - totH} width={barW} height={totH} rx="3" fill={trackColor} />
            )}
            <rect x={x} y={valY} width={barW} height={valH} rx="3" fill={color}>
              <title>{`${r.label}: ${r.value}${r.total ? ` / ${r.total}` : ''}`}</title>
            </rect>
            {/* Value label above each bar — high-contrast number so the
                user can read totals at a glance without hovering. */}
            <text
              x={cx}
              y={Math.max(padTop - 2, valY - 4)}
              textAnchor="middle"
              fontSize="11"
              fontWeight="700"
              fill={color}
            >{r.value || 0}</text>
            {showLabels && (
              <text
                x={cx}
                y={height - 7}
                textAnchor="middle"
                fontSize="11"
                fontWeight="600"
                fill={CHART_AXIS_FILL}
              >{r.label}</text>
            )}
          </g>
        );
      })}
    </svg>
  );
}

// ─── Smooth area chart (line + area + grid + last-point dot) ───
export function AreaChart({ values, labels, height = 130, color = BRAND.dark, fill = BRAND.tint, valueLabel }) {
  if (!values || values.length < 2) {
    return <p className="muted" style={{ margin: 0, fontSize: 12, padding: '20px 0' }}>Not enough trend data.</p>;
  }
  const max = Math.max(...values, 1);
  const min = Math.min(...values, 0);
  const range = max - min || 1;
  const w = 320, padX = 6, padTop = 8, padBottom = labels?.length ? 18 : 6;
  const plotW = w - padX * 2, plotH = height - padTop - padBottom;
  const step = plotW / (values.length - 1);
  const pts = values.map((v, i) => {
    const x = padX + i * step;
    const y = padTop + plotH - ((v - min) / range) * plotH;
    return [x, y];
  });
  const linePath = pts.map(([x, y], i) => (i === 0 ? `M ${x.toFixed(1)} ${y.toFixed(1)}` : `L ${x.toFixed(1)} ${y.toFixed(1)}`)).join(' ');
  const areaPath = `${linePath} L ${pts[pts.length - 1][0].toFixed(1)} ${(padTop + plotH).toFixed(1)} L ${pts[0][0].toFixed(1)} ${(padTop + plotH).toFixed(1)} Z`;
  const last = pts[pts.length - 1];
  return (
    <svg viewBox={`0 0 ${w} ${height}`} width="100%" height={height} style={{ display: 'block' }} role="img" aria-label="Area trend chart">
      {/* horizontal grid */}
      {[0, 0.5, 1].map((t) => {
        const y = padTop + plotH * (1 - t);
        return <line key={t} x1={padX} y1={y} x2={w - padX} y2={y} stroke="rgba(0,0,0,0.05)" strokeWidth="0.5" />;
      })}
      <path d={areaPath} fill={fill} />
      <path d={linePath} fill="none" stroke={color} strokeWidth="1.6" strokeLinejoin="round" />
      <circle cx={last[0]} cy={last[1]} r="3" fill={color} />
      <circle cx={last[0]} cy={last[1]} r="6" fill="none" stroke={color} strokeWidth="1" opacity="0.35" />
      {labels && labels.map((lab, i) => {
        const x = padX + i * step;
        return <text key={i} x={x} y={height - 4} textAnchor="middle" fontSize="10.5" fontWeight="500" fill={CHART_AXIS_FILL}>{lab}</text>;
      })}
      {valueLabel && (
        <text x={last[0] - 4} y={last[1] - 8} textAnchor="end" fontSize="10" fontWeight="600" fill={color}>{valueLabel}</text>
      )}
    </svg>
  );
}

// ─── Donut (single value, with center text) ───
export function Donut({ percent, label = 'filled', size = 100, stroke = 12, color = BRAND.dark, trackColor = BRAND.tint }) {
  const v = Math.max(0, Math.min(100, percent || 0));
  const r = (size / 2) - stroke / 2 - 1;
  const cx = size / 2, cy = size / 2;
  const dash = `${v} 100`;
  return (
    <svg viewBox={`0 0 ${size} ${size}`} width={size} height={size} role="img" aria-label={`${v}% ${label}`}>
      <circle cx={cx} cy={cy} r={r} fill="none" stroke={trackColor} strokeWidth={stroke} />
      <circle cx={cx} cy={cy} r={r} fill="none" stroke={color} strokeWidth={stroke}
        pathLength="100" strokeDasharray={dash}
        transform={`rotate(-90 ${cx} ${cy})`} strokeLinecap="round" />
      <text x={cx} y={cy + 1} textAnchor="middle" dominantBaseline="middle" fontSize={size * 0.22} fontWeight="700" fill={color}>{v}%</text>
      {label && <text x={cx} y={cy + size * 0.20} textAnchor="middle" dominantBaseline="middle" fontSize={Math.max(size * 0.115, 11)} fontWeight="500" fill={CHART_AXIS_SUB}>{label}</text>}
    </svg>
  );
}

// ─── Pie chart with side legend ───
// segments: [{ label, value, color? }]
export function PieChart({ segments, size = 110, palette = [BRAND.darkest, BRAND.dark, BRAND.mid, BRAND.bright, BRAND.light, BRAND.pinker] }) {
  const total = (segments || []).reduce((s, x) => s + (x.value || 0), 0);
  if (!segments || segments.length === 0 || total === 0) {
    return <p className="muted" style={{ margin: 0, fontSize: 12 }}>No data to chart.</p>;
  }
  const cx = size / 2, cy = size / 2, r = (size / 2) - 1;
  let cumulative = 0;
  const slices = segments.map((seg, i) => {
    const value = seg.value || 0;
    const startAngle = (cumulative / total) * Math.PI * 2 - Math.PI / 2;
    cumulative += value;
    const endAngle = (cumulative / total) * Math.PI * 2 - Math.PI / 2;
    const x1 = cx + r * Math.cos(startAngle), y1 = cy + r * Math.sin(startAngle);
    const x2 = cx + r * Math.cos(endAngle), y2 = cy + r * Math.sin(endAngle);
    const largeArc = (endAngle - startAngle) > Math.PI ? 1 : 0;
    const d = total === value
      ? `M ${cx - r} ${cy} A ${r} ${r} 0 1 1 ${cx + r} ${cy} A ${r} ${r} 0 1 1 ${cx - r} ${cy} Z`
      : `M ${cx} ${cy} L ${x1.toFixed(2)} ${y1.toFixed(2)} A ${r} ${r} 0 ${largeArc} 1 ${x2.toFixed(2)} ${y2.toFixed(2)} Z`;
    return { d, color: seg.color || palette[i % palette.length], label: seg.label, value, pct: Math.round((value / total) * 100) };
  });
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 14, minWidth: 0 }}>
      <svg viewBox={`0 0 ${size} ${size}`} width={size} height={size} style={{ flexShrink: 0 }} role="img" aria-label="Pie chart">
        {slices.map((s, i) => (
          <path key={i} d={s.d} fill={s.color} stroke="#fff" strokeWidth="0.6">
            <title>{`${s.label}: ${s.pct}%`}</title>
          </path>
        ))}
      </svg>
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 6, minWidth: 0 }}>
        {slices.map((s, i) => (
          <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13 }}>
            <span style={{ width: 10, height: 10, borderRadius: 2, background: s.color, flexShrink: 0 }} />
            <span style={{ color: 'var(--text)', flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontWeight: 500 }}>{s.label}</span>
            <span style={{ color: CHART_AXIS_FILL, fontWeight: 700 }}>{s.pct}%</span>
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── Ranked list (numbered chips, item label, value) ───
// items: [{ label, value, sub? }]
export function RankedList({ items, palette = [BRAND.darkest, BRAND.dark, BRAND.mid, BRAND.bright, BRAND.light], formatValue = (v) => v }) {
  if (!items || items.length === 0) {
    return <p className="muted" style={{ margin: 0, fontSize: 12 }}>No entries.</p>;
  }
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
      {items.map((it, i) => (
        <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '5px 0' }}>
          <div style={{
            width: 24, height: 24, borderRadius: '50%',
            background: palette[i % palette.length],
            color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: 12, fontWeight: 700, flexShrink: 0,
          }}>{i + 1}</div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 13, color: 'var(--text)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{it.label}</div>
            {it.sub && <div style={{ fontSize: 11, color: 'var(--muted)' }}>{it.sub}</div>}
          </div>
          <div style={{ fontSize: 12, color: 'var(--primary-dark)', fontWeight: 600, flexShrink: 0 }}>{formatValue(it.value)}</div>
        </div>
      ))}
    </div>
  );
}

// ─── Validated categorical palette ───
// Slots 1–3 of the reference categorical theme, for series that carry an
// IDENTITY (Cabinet vs Committee vs Jirga) rather than a magnitude. The
// BRAND ramp above is a single-hue sequential scale and must not be used
// for identity — five shades of the same blue are not distinguishable as
// categories.
//
// Validated against the light surface on the all-pairs list: worst CVD
// ΔE 9.2, worst normal-vision ΔE 24.0. Aqua measures 2.74:1 against white,
// under the 3:1 threshold, so every chart drawn with this palette ships a
// legend AND direct value labels — identity is never colour alone.
//
// Do not extend past three. Slot 4 of the reference theme is yellow, and
// yellow against orange fails the all-pairs floors; a fourth category
// folds into "Other" or becomes a separate facet.
export const CATEGORICAL = ['#2a78d6', '#eb6834', '#1baf7a'];

// Sequential steps for magnitude — one hue, light to dark, monotonic in
// lightness so the ramp survives greyscale printing and colour blindness.
export const SEQUENTIAL = [BRAND.tint, BRAND.pinker, BRAND.light, BRAND.bright, BRAND.dark, BRAND.darkest];

// Picks n steps SPREAD across the ramp rather than the first n. Taking
// consecutive steps off the light end (steps 1,2,3 for three series) puts
// two near-white fills side by side and the stack stops separating; spacing
// them uses the ramp's full lightness range whatever n turns out to be.
// The pale end still sits under 3:1 on white, so charts drawn from this
// ramp carry a legend and direct labels — never colour alone.
export function rampSteps(n) {
  const last = SEQUENTIAL.length - 1;          // 5
  if (n <= 1) return [SEQUENTIAL[last - 1]];
  return Array.from({ length: n }, (_, i) =>
    SEQUENTIAL[1 + Math.round((i * (last - 1)) / (n - 1))]);
}

// Rounds only the top of a column so the mark stays anchored to its
// baseline — a fully rounded bar reads as floating and misstates zero.
function topRoundedPath(x, y, w, h, r) {
  const rr = Math.max(0, Math.min(r, w / 2, h));
  return `M ${x} ${y + h} L ${x} ${y + rr} Q ${x} ${y} ${x + rr} ${y}`
    + ` L ${x + w - rr} ${y} Q ${x + w} ${y} ${x + w} ${y + rr}`
    + ` L ${x + w} ${y + h} Z`;
}

// ─── Shared legend ───
// Always rendered for two or more series, so identity never depends on
// colour recall alone.
export function ChartLegend({ series }) {
  if (!series || series.length < 2) return null;
  return (
    <div className="chart-legend">
      {series.map((s) => (
        <span key={s.key} className="chart-legend-item">
          <span className="chart-legend-swatch" style={{ background: s.color }} />
          <span>{s.label}</span>
        </span>
      ))}
    </div>
  );
}

// ─── Stacked column chart ───
// groups: [{ label, sublabel?, values: { [seriesKey]: number } }]
// series: [{ key, label, color }]
//
// Vertical because the category axis is time — years read left to right.
export function StackedColumns({
  groups, series, height = 220, emptyLabel = 'No data.',
  showTotals = true, colWidth = 58,
}) {
  const rows = (groups || []).filter(Boolean);
  if (rows.length === 0) {
    return <p className="muted" style={{ margin: 0, fontSize: 13 }}>{emptyLabel}</p>;
  }
  const totalOf = (g) => series.reduce((s, x) => s + (g.values?.[x.key] || 0), 0);
  const max = Math.max(...rows.map(totalOf), 1);
  const padL = 34, padR = 12, padT = showTotals ? 26 : 12, padB = 30;
  const w = padL + padR + rows.length * colWidth;
  const plotH = height - padT - padB;
  const barW = Math.min(36, colWidth - 18);
  const yOf = (v) => padT + plotH - (v / max) * plotH;

  return (
    <div>
      <div style={{ width: '100%', overflowX: 'auto' }}>
        <svg
          viewBox={`0 0 ${w} ${height}`}
          style={{ width: '100%', minWidth: Math.min(w, 520), height, display: 'block' }}
          role="img"
          aria-label="Stacked column chart"
        >
          {/* Recessive gridlines — the data sits in front of them. */}
          {[0, 0.5, 1].map((t) => {
            const y = padT + plotH * (1 - t);
            return (
              <g key={t}>
                <line
                  x1={padL} y1={y} x2={w - padR} y2={y}
                  stroke="var(--border)" strokeWidth="1"
                  strokeDasharray={t === 0 ? '0' : '3 3'}
                />
                <text
                  x={padL - 6} y={y + 3.5} fontSize="10.5" fontWeight="500"
                  fill={CHART_AXIS_FILL} textAnchor="end"
                >
                  {Math.round(max * t).toLocaleString()}
                </text>
              </g>
            );
          })}

          {/* Every segment carries a hairline outline. The pale end of the
              sequential ramp sits near 1.4:1 against white — legible as a
              shade beside its neighbours, but its outer edge would vanish
              into the page without it. This is the required relief, not
              decoration; the legend and the heatmap below are the rest. */}
          {rows.map((g, gi) => {
            const cx = padL + gi * colWidth + colWidth / 2;
            const x = cx - barW / 2;
            const total = totalOf(g);
            let cursor = padT + plotH;          // stack upward from the baseline
            const segs = [];
            series.forEach((s) => {
              const v = g.values?.[s.key] || 0;
              if (v <= 0) return;
              const rawH = (v / max) * plotH;
              // 2px of surface between segments keeps adjacent fills from
              // reading as one block; never let the gap eat the segment.
              const segH = Math.max(rawH - 2, 1.5);
              const y = cursor - rawH;
              segs.push({ s, v, y, h: segH, isTop: false });
              cursor = y;
            });
            if (segs.length > 0) segs[segs.length - 1].isTop = true;

            return (
              <g key={g.label}>
                {segs.map(({ s, v, y, h, isTop }) => (
                  isTop
                    ? (
                      <path
                        key={s.key} d={topRoundedPath(x, y, barW, h, 4)} fill={s.color}
                        stroke="rgba(15, 23, 42, 0.16)" strokeWidth="1"
                      >
                        <title>{`${g.label} — ${s.label}: ${v.toLocaleString()} of ${total.toLocaleString()}`}</title>
                      </path>
                    )
                    : (
                      <rect
                        key={s.key} x={x} y={y} width={barW} height={h} fill={s.color}
                        stroke="rgba(15, 23, 42, 0.16)" strokeWidth="1"
                      >
                        <title>{`${g.label} — ${s.label}: ${v.toLocaleString()} of ${total.toLocaleString()}`}</title>
                      </rect>
                    )
                ))}

                {/* Total above the column — a selective direct label, not a
                    number printed on every segment. */}
                {showTotals && total > 0 && (
                  <text
                    x={cx} y={yOf(total) - 8} fontSize="11" fontWeight="700"
                    fill={CHART_AXIS_FILL} textAnchor="middle"
                  >
                    {total.toLocaleString()}
                  </text>
                )}

                <text
                  x={cx} y={height - 15} fontSize="10.5" fontWeight="600"
                  fill={CHART_AXIS_FILL} textAnchor="middle"
                >
                  {g.label}
                </text>
                {g.sublabel && (
                  <text
                    x={cx} y={height - 4} fontSize="9.5" fontWeight="500"
                    fill={CHART_AXIS_SUB} textAnchor="middle"
                  >
                    {g.sublabel}
                  </text>
                )}
              </g>
            );
          })}
        </svg>
      </div>

      <ChartLegend series={series} />
    </div>
  );
}

// ─── Heatmap ───
// rows / cols: [{ key, label, sublabel? }]
// cells: { [rowKey]: { [colKey]: number } }
//
// The right form for a dense two-dimensional count matrix: the eye finds
// the hot cell without reading a single number, and the numbers are still
// there when it needs them. Built as a real <table> so it doubles as the
// accessible table view of itself.
export function Heatmap({
  rows, cols, cells, emptyLabel = 'No data.',
  rowHeader = '', valueNoun = '',
}) {
  if (!rows?.length || !cols?.length) {
    return <p className="muted" style={{ margin: 0, fontSize: 13 }}>{emptyLabel}</p>;
  }
  const all = [];
  rows.forEach((r) => cols.forEach((c) => all.push(cells?.[r.key]?.[c.key] || 0)));
  const max = Math.max(...all, 1);

  // Zero keeps the plain surface rather than the palest blue: "never
  // happened" is a different statement from "happened rarely", and a
  // shaded zero erases that difference.
  const shadeFor = (v) => {
    if (!v) return null;
    const t = v / max;
    if (t <= 0.20) return 1;
    if (t <= 0.40) return 2;
    if (t <= 0.60) return 3;
    if (t <= 0.80) return 4;
    return 5;
  };

  return (
    <div>
      <div className="hm-scroll">
        <table className="hm">
          <thead>
            <tr>
              <th className="hm-corner" scope="col">{rowHeader}</th>
              {cols.map((c) => (
                <th key={c.key} className="hm-colhead" scope="col">
                  <span>{c.label}</span>
                  {c.sublabel && <span className="hm-sub">{c.sublabel}</span>}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.key}>
                <th className="hm-rowhead" scope="row">
                  <span>{r.label}</span>
                  {r.sublabel && <span className="hm-sub">{r.sublabel}</span>}
                </th>
                {cols.map((c) => {
                  const v = cells?.[r.key]?.[c.key] || 0;
                  const step = shadeFor(v);
                  return (
                    <td
                      key={c.key}
                      className={`hm-cell${step && step >= 4 ? ' on-dark' : ''}${step ? '' : ' empty'}`}
                      style={step ? { background: SEQUENTIAL[step] } : undefined}
                      title={`${r.label} · ${c.label}: ${v.toLocaleString()}${valueNoun ? ` ${valueNoun}` : ''}`}
                    >
                      {v ? v.toLocaleString() : ''}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* A sequential scale needs its ends named, or the shading is decoration. */}
      <div className="hm-scale">
        <span className="hm-scale-label">0</span>
        {SEQUENTIAL.slice(1).map((c, i) => (
          <span key={i} className="hm-scale-chip" style={{ background: c }} />
        ))}
        <span className="hm-scale-label">{max.toLocaleString()}</span>
      </div>
    </div>
  );
}
