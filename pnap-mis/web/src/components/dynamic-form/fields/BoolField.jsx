import { FieldShell } from '../FieldShell';

// BOOL — rendered as an inline checkbox. The label sits next to the
// control rather than above it, which reads better than the boxed
// FieldShell for a single toggle. We still let FieldShell handle the
// help text + error.
export default function BoolField({ field, value, error, onChange, disabled }) {
  return (
    <FieldShell field={field} error={error} hideLabel>
      <label className="toggle-row">
        <input
          type="checkbox"
          checked={!!value}
          onChange={(e) => onChange(e.target.checked)}
          disabled={disabled}
        />
        {field.label}{field.required && <span className="muted"> *</span>}
      </label>
    </FieldShell>
  );
}
