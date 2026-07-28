// PresetGallery — clickable cards showing the locked code-side
// presets. Selecting one fires `onApply(presetCode)`; the parent
// page actually calls applyPreset() on the API.

export default function PresetGallery({ presets, currentPresetName, onApply, disabled }) {
  if (!presets || presets.length === 0) return null;

  return (
    <div style={{
      display: 'grid',
      gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
      gap: 10,
    }}>
      {presets.map((preset) => {
        const active = preset.code === currentPresetName;
        const swatch = preset.light || {};
        return (
          <button
            key={preset.code}
            type="button"
            onClick={() => !disabled && onApply?.(preset.code)}
            disabled={disabled}
            style={{
              textAlign: 'left',
              cursor: disabled ? 'not-allowed' : 'pointer',
              padding: 12,
              border: active
                ? `2px solid ${swatch.primary || '#b91c1c'}`
                : '1px solid var(--border-soft, #e5e7eb)',
              borderRadius: 10,
              background: 'var(--surface, #ffffff)',
              transition: 'transform .12s ease',
              opacity: disabled ? 0.6 : 1,
              font: 'inherit',
            }}
            onMouseEnter={(e) => { if (!disabled) e.currentTarget.style.transform = 'translateY(-2px)'; }}
            onMouseLeave={(e) => { e.currentTarget.style.transform = 'translateY(0)'; }}
          >
            {/* Color swatch row — first 4 brand colors at a glance */}
            <div style={{ display: 'flex', gap: 4, marginBottom: 8 }}>
              {['primary', 'secondary', 'accent', 'background'].map((k) => (
                <div key={k} style={{
                  width: 24, height: 24, borderRadius: 4,
                  background: swatch[k] || '#9ca3af',
                  border: '1px solid rgba(0,0,0,0.06)',
                }} />
              ))}
            </div>
            <div style={{ fontWeight: 600, fontSize: 14, marginBottom: 2 }}>
              {preset.label}
              {active && <span style={{ marginLeft: 8, fontSize: 11, color: swatch.primary || '#b91c1c' }}>· active</span>}
            </div>
            <div className="muted" style={{ fontSize: 12 }}>
              {preset.description}
            </div>
          </button>
        );
      })}
    </div>
  );
}
