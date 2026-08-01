import { FieldShell } from '../FieldShell';

// DATE — uses a native <input type="datetime-local">. We accept both
// Date instances and ISO strings on the way in, and emit ISO on the
// way out so the wire format stays consistent.
function toLocalInputValue(v) {
  if (!v) return '';
  const d = v instanceof Date ? v : new Date(v);
  if (Number.isNaN(d.getTime())) return '';
  // YYYY-MM-DDTHH:mm — local timezone
  const pad = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export default function DateField({ field, value, error, onChange, disabled }) {
  return (
    <FieldShell field={field} error={error}>
      <input
        type="datetime-local"
        value={toLocalInputValue(value)}
        onChange={(e) => onChange(e.target.value ? new Date(e.target.value).toISOString() : undefined)}
        disabled={disabled}
        required={field.required}
      />
    </FieldShell>
  );
}
