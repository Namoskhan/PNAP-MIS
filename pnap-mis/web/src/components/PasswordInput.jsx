import { useId, useState } from 'react';
import { EyeIcon, EyeOffIcon } from './icons';

// The low-level password control: an input with a reveal toggle, and
// nothing else. Callers supply their own label and layout — see
// PasswordField for the wrapped variant used by the sign-in form.
//
// Two details that matter more than they look:
//
//   * type="button". Inside a <form>, a bare <button> defaults to
//     type="submit", so an unmarked toggle would submit the form every
//     time someone checked what they had typed.
//
//   * Revealing is always a deliberate act and is never persisted, so a
//     re-render or a reopened dialog can't leave a password on screen.
//
// onChange receives the EVENT (not the value) to match every other
// input in the admin forms.
export default function PasswordInput({
  value, onChange, id, className = '', ...rest
}) {
  const [visible, setVisible] = useState(false);
  const auto = useId();
  const inputId = id || auto;

  return (
    <div className={`pw-wrap ${className}`.trim()}>
      <input
        id={inputId}
        type={visible ? 'text' : 'password'}
        value={value}
        onChange={onChange}
        autoComplete="new-password"
        spellCheck={false}
        autoCapitalize="off"
        autoCorrect="off"
        {...rest}
      />
      <button
        type="button"
        className="pw-toggle"
        onClick={() => setVisible((v) => !v)}
        // The label states the ACTION, so a screen reader announces what
        // pressing it will do rather than the current state.
        aria-label={visible ? 'Hide password' : 'Show password'}
        aria-pressed={visible}
        aria-controls={inputId}
        title={visible ? 'Hide password' : 'Show password'}
      >
        {visible ? <EyeOffIcon size={16} /> : <EyeIcon size={16} />}
      </button>
    </div>
  );
}
