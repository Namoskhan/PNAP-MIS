import { FieldShell } from '../FieldShell';

// MULTISELECT — checkbox list (more accessible than <select multiple>).
// Emits a string[] in the snapshot order admin defined.
export default function MultiSelectField({ field, value, error, onChange, disabled }) {
  const options = field.validation?.options || [];
  const selected = Array.isArray(value) ? value : [];
  function toggle(v) {
    const has = selected.includes(v);
    onChange(has ? selected.filter((x) => x !== v) : [...selected, v]);
  }
  return (
    <FieldShell field={field} error={error}>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 6 }}>
        {options.map((o) => {
          const on = selected.includes(o.value);
          return (
            <label
              key={o.value}
              style={{
                display: 'inline-flex',
                gap: 6,
                alignItems: 'center',
                padding: '6px 10px',
                border: '1px solid var(--border)',
                borderRadius: 8,
                background: on ? 'rgba(30, 64, 175, 0.06)' : 'transparent',
                cursor: disabled ? 'not-allowed' : 'pointer',
                fontSize: 13,
              }}
            >
              <input
                type="checkbox"
                checked={on}
                disabled={disabled}
                onChange={() => toggle(o.value)}
              />
              {o.label}
            </label>
          );
        })}
      </div>
    </FieldShell>
  );
}
