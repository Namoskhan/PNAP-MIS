import { useId, useState } from 'react';
import { EyeIcon, EyeOffIcon } from './icons';

// Password input with a reveal toggle.
//
// The toggle is a real <button type="button"> — inside a <form> a bare
// <button> submits, which would fire the create request every time
// someone peeked at what they had typed.
//
// Visibility is local state and always starts hidden: a re-render or a
// reopened dialog must never leave a password on screen.
export default function PasswordInput({
  value, onChange, id, className = '', ...rest
}) {
  const [shown, setShown] = useState(false);
  const auto = useId();
  const inputId = id || auto;

  return (
    <div className={`pw-field ${className}`.trim()}>
      <input
        id={inputId}
        type={shown ? 'text' : 'password'}
        value={value}
        onChange={onChange}
        autoComplete="new-password"
        {...rest}
      />
      <button
        type="button"
        className="pw-toggle"
        onClick={() => setShown((s) => !s)}
        // The label states the ACTION, so a screen reader announces what
        // pressing it will do rather than the current state.
        aria-label={shown ? 'Hide password' : 'Show password'}
        aria-pressed={shown}
        aria-controls={inputId}
        // Not a tab stop: keyboard users move label → field → next field,
        // and a toggle between them interrupts filling the form.
        tabIndex={-1}
      >
        {shown ? <EyeOffIcon size={16} /> : <EyeIcon size={16} />}
      </button>
    </div>
  );
}
