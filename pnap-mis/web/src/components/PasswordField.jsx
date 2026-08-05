import { useId, useState } from 'react';
import { EyeIcon, EyeOffIcon } from './icons';

// A password input with a show/hide toggle.
//
// Two details that matter more than they look:
//
//   * type="button". Inside a <form>, a bare <button> defaults to
//     type="submit", so an unmarked toggle would submit the login form
//     every time someone tried to check what they had typed.
//
//   * The visible state is never the initial state, and it resets on
//     nothing — revealing is always a deliberate act by the person at
//     the keyboard. Nothing is persisted, so a shoulder-surfer can't
//     inherit a revealed field from the last session.
//
// `labelAction` renders on the right of the label row — used by the
// sign-in form for its "Forgot password?" link.
export default function PasswordField({
  label = 'Password',
  labelAction,
  value,
  onChange,
  hint,
  autoFocus = false,
  autoComplete = 'current-password',
  ...rest
}) {
  const [visible, setVisible] = useState(false);
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

      <div className="pw-wrap">
        <input
          id={id}
          type={visible ? 'text' : 'password'}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          autoComplete={autoComplete}
          autoFocus={autoFocus}
          spellCheck={false}
          autoCapitalize="off"
          autoCorrect="off"
          required
          {...rest}
        />
        <button
          type="button"
          className="pw-toggle"
          onClick={() => setVisible((v) => !v)}
          // The button is the control, so it carries the label; the
          // icon inside is decorative and already aria-hidden.
          aria-label={visible ? 'Hide password' : 'Show password'}
          aria-pressed={visible}
          title={visible ? 'Hide password' : 'Show password'}
        >
          {visible ? <EyeOffIcon size={16} /> : <EyeIcon size={16} />}
        </button>
      </div>

      {hint && <div className="hint">{hint}</div>}
    </div>
  );
}
