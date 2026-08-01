// Shared chrome for every dynamic-form field — label, help text,
// inline error message. Each field component focuses on its own
// control element and lets FieldShell handle the surrounding markup.
export function FieldShell({ field, error, children, hideLabel }) {
  return (
    <div className={`field full ${error ? 'has-error' : ''}`}>
      {!hideLabel && (
        <label>
          {field.label}{field.required && <span style={{ color: 'var(--danger)' }}> *</span>}
        </label>
      )}
      {children}
      {field.helpText && !error && <div className="hint">{field.helpText}</div>}
      {error && <div className="hint" style={{ color: 'var(--danger)' }}>{error}</div>}
    </div>
  );
}
