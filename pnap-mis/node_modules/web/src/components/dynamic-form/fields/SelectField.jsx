import { FieldShell } from '../FieldShell';

export default function SelectField({ field, value, error, onChange, disabled }) {
  const options = field.validation?.options || [];
  return (
    <FieldShell field={field} error={error}>
      <select
        value={value ?? ''}
        onChange={(e) => onChange(e.target.value || undefined)}
        disabled={disabled}
        required={field.required}
      >
        <option value="">— Select —</option>
        {options.map((o) => (
          <option key={o.value} value={o.value}>{o.label}</option>
        ))}
      </select>
    </FieldShell>
  );
}
