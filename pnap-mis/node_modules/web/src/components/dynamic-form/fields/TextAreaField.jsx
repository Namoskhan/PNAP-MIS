import { FieldShell } from '../FieldShell';

export default function TextAreaField({ field, value, error, onChange, disabled }) {
  const v = field.validation || {};
  return (
    <FieldShell field={field} error={error}>
      <textarea
        rows={4}
        value={value ?? ''}
        onChange={(e) => onChange(e.target.value)}
        disabled={disabled}
        minLength={v.minLength || undefined}
        maxLength={v.maxLength || undefined}
        required={field.required}
      />
    </FieldShell>
  );
}
