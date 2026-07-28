import { FieldShell } from '../FieldShell';

// TEXT — single-line input. Honours minLength / maxLength / regex
// constraints client-side as a courtesy; the server is the source
// of truth via dynamicFormService.validate().
export default function TextField({ field, value, error, onChange, disabled }) {
  const v = field.validation || {};
  return (
    <FieldShell field={field} error={error}>
      <input
        type="text"
        value={value ?? ''}
        onChange={(e) => onChange(e.target.value)}
        disabled={disabled}
        minLength={v.minLength || undefined}
        maxLength={v.maxLength || undefined}
        pattern={v.regex || undefined}
        required={field.required}
      />
    </FieldShell>
  );
}
