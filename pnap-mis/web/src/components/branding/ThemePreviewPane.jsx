// ThemePreviewPane — renders a small sample of canonical UI surfaces
// (sidebar, card, button cluster, status pills, tier badges) using
// the candidate palette. Lets admins see the impact of color tweaks
// without applying globally.
//
// Implementation note: instead of overriding CSS variables (which
// would leak to the rest of the page), the preview uses inline
// styles so the changes are scoped to this component only.

export default function ThemePreviewPane({ palette }) {
  if (!palette) return null;
  const p = palette;

  return (
    <div style={{
      borderRadius: 12,
      border: `1px solid ${p.borderSoft || '#e5e7eb'}`,
      overflow: 'hidden',
      background: p.background || '#f7f8fb',
    }}>
      {/* Sample sidebar + main split */}
      <div style={{ display: 'flex', minHeight: 340 }}>
        <div style={{
          width: 88,
          background: p.sidebarBg || '#7f1d1d',
          color: p.sidebarFg || '#ffffff',
          padding: '12px 8px',
          fontSize: 11,
        }}>
          <div style={{ fontWeight: 700, fontSize: 13, marginBottom: 12 }}>
            {/* shortName from branding context could be wired in,
                but keep this preview self-contained */}
            BRAND
          </div>
          <div style={{ opacity: 0.85, lineHeight: 1.6 }}>
            Dashboard<br />
            Members<br />
            Meetings<br />
            Finance
          </div>
        </div>

        <div style={{
          flex: 1,
          padding: 16,
          background: p.background || '#f7f8fb',
          color: p.textPrimary || '#1a1a1a',
        }}>
          {/* KPI card */}
          <div style={{
            background: p.surface || '#ffffff',
            border: `1px solid ${p.borderSoft || '#e5e7eb'}`,
            borderRadius: 10,
            padding: 12,
            marginBottom: 10,
          }}>
            <div style={{ fontSize: 11, color: p.textMuted || '#6b7280', textTransform: 'uppercase', letterSpacing: '.05em' }}>
              Active Members
            </div>
            <div style={{ fontSize: 22, fontWeight: 700, marginTop: 4, color: p.textPrimary || '#1a1a1a' }}>
              1,247
            </div>
          </div>

          {/* Button cluster */}
          <div style={{ display: 'flex', gap: 8, marginBottom: 10 }}>
            <button style={{
              background: p.primary || '#b91c1c',
              color: p.textInverse || '#ffffff',
              border: 'none', padding: '6px 14px', borderRadius: 6, cursor: 'pointer',
              fontSize: 12, fontWeight: 600,
            }}>
              Save
            </button>
            <button style={{
              background: 'transparent',
              color: p.primary || '#b91c1c',
              border: `1px solid ${p.primary || '#b91c1c'}`,
              padding: '6px 14px', borderRadius: 6, cursor: 'pointer',
              fontSize: 12, fontWeight: 600,
            }}>
              Cancel
            </button>
          </div>

          {/* Status pills */}
          <div style={{ display: 'flex', gap: 6, marginBottom: 10, flexWrap: 'wrap' }}>
            {[
              { label: 'Approved', color: p.success || '#10b981' },
              { label: 'Pending',  color: p.warning || '#f59e0b' },
              { label: 'Rejected', color: p.danger  || '#b91c1c' },
              { label: 'Info',     color: p.info    || '#0891b2' },
            ].map((s) => (
              <span key={s.label} style={{
                display: 'inline-block',
                padding: '3px 10px',
                borderRadius: 999,
                background: s.color + '22',
                color: s.color,
                fontSize: 11,
                fontWeight: 600,
              }}>{s.label}</span>
            ))}
          </div>

          {/* Tier badges */}
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
            {[
              { label: 'CENTRAL',    color: p.tierCentral    || '#16a34a' },
              { label: 'PROVINCE',   color: p.tierProvince   || '#2563eb' },
              { label: 'DISTRICT',   color: p.tierDistrict   || '#d97706' },
              { label: 'AREA',       color: p.tierArea       || '#ea580c' },
              { label: 'BASIC_UNIT', color: p.tierBasicUnit  || '#475569' },
            ].map((t) => (
              <span key={t.label} style={{
                display: 'inline-block',
                padding: '3px 8px',
                borderRadius: 6,
                background: t.color + '1a',
                color: t.color,
                border: `1px solid ${t.color}40`,
                fontSize: 10,
                fontWeight: 600,
                fontFamily: 'monospace',
              }}>{t.label}</span>
            ))}
          </div>

          {/* Muted footer hint */}
          <div style={{
            color: p.textMuted || '#6b7280',
            fontSize: 11,
            marginTop: 12,
            paddingTop: 8,
            borderTop: `1px dashed ${p.borderSoft || '#e5e7eb'}`,
          }}>
            Body text · muted text · <code style={{ background: 'transparent' }}>code</code>
          </div>
        </div>
      </div>
    </div>
  );
}
