import { useId } from 'react';
import PasswordInput from './PasswordInput';

// A labelled password field: the .field wrapper, its label and hint,
// around the shared PasswordInput control.
//
// This used to carry its own copy of the input + toggle markup, which
// meant two components competing for the same .pw-toggle class. The
// control now lives in exactly one place; this is only the label layout.
//
// `labelAction` renders on the right of the label row — used by the
// sign-in form for its "Forgot password?" link.
//
// NOTE: onChange here takes the VALUE, not the event, because the
// sign-in form was written against that signature. PasswordInput itself
// takes the event, like every other input.
export default function PasswordField({
  label = 'Password',
  labelAction,
  value,
  onChange,
  hint,
  autoComplete = 'current-password',
  ...rest
}) {
  const id = useId();

  return (
    <div className="field">
      {labelAction ? (
        // The label is flattened into a flex row so the action can sit
        // beside it; it therefore has to carry the 6px gap itself.
        <div style={{
          display: 'flex', alignItems: 'baseline',
          justifyContent: 'space-between', gap: 10, marginBottom: 6,
        }}>
          <label htmlFor={id} style={{ marginBottom: 0 }}>{label}</label>
          {labelAction}
        </div>
      ) : (
        <label htmlFor={id}>{label}</label>
      )}

      <PasswordInput
        id={id}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        autoComplete={autoComplete}
        required
        {...rest}
      />

      {hint && <div className="hint">{hint}</div>}
    </div>
  );
}
