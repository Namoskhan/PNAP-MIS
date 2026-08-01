// Lightweight skeleton placeholders. Render while data is loading
// instead of plain "Loading..." text. CSS lives in styles.css.

export function SkeletonText({ lines = 3, lastShort = true }) {
  return (
    <div>
      {Array.from({ length: lines }).map((_, i) => (
        <span
          key={i}
          className={`sk-line${lastShort && i === lines - 1 ? ' short' : ''}`}
        />
      ))}
    </div>
  );
}

export function SkeletonCard({ lines = 3 }) {
  return (
    <div className="sk-card">
      <span className="sk-line title" />
      <SkeletonText lines={lines} />
    </div>
  );
}

export function SkeletonKpi() {
  return (
    <div className="sk-card" style={{ minHeight: 110 }}>
      <span className="sk-line shortest" />
      <span className="sk-line tall" style={{ width: '55%', marginTop: 12, height: 26 }} />
      <span className="sk-line short" style={{ marginTop: 14 }} />
    </div>
  );
}

export function SkeletonKpiGrid({ count = 6 }) {
  return (
    <div className="sk-grid">
      {Array.from({ length: count }).map((_, i) => <SkeletonKpi key={i} />)}
    </div>
  );
}

export function SkeletonRow({ cols = 6 }) {
  return (
    <tr>
      {Array.from({ length: cols }).map((_, i) => (
        <td key={i}><span className="sk-line" style={{ marginBottom: 0, width: i === 0 ? '50%' : '70%' }} /></td>
      ))}
    </tr>
  );
}

export function SkeletonRows({ rows = 6, cols = 6 }) {
  return (
    <>
      {Array.from({ length: rows }).map((_, i) => <SkeletonRow key={i} cols={cols} />)}
    </>
  );
}
