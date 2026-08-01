import { FieldShell } from '../FieldShell';

// NUMBER / INT / CURRENCY share this implementation. The server
// rejects non-integers for INT, so we just hint the user via `step`.
export default function NumberField({ field, value, error, onChange, disabled }) {
  const v = field.validation || {};
  const step = field.type === 'INT' ? 1 : 'any';
  const prefix = field.type === 'CURRENCY' ? 'Rs.' : null;
  return (
    <FieldShell field={field} error={error}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
        {prefix && <span className="muted" style={{ fontSize: 13 }}>{prefix}</span>}
        <input
          type="number"
          value={value ?? ''}
          onChange={(e) => {
            const raw = e.target.value;
            if (raw === '') onChange(undefined);
            else onChange(field.type === 'INT' ? parseInt(raw, 10) : Number(raw));
          }}
          step={step}
          min={v.min ?? undefined}
          max={v.max ?? undefined}
          disabled={disabled}
          required={field.required}
          style={{ flex: 1 }}
        />
      </div>
    </FieldShell>
  );
}
