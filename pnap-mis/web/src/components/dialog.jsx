import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';

// Replacements for window.confirm / prompt / alert.
//
// Deliberately IMPERATIVE rather than a hook. The native calls live in
// ~50 event handlers across ~30 files, many of them nested closures where
// a hook cannot be called; an imperative service keeps each call site a
// one-line swap:
//
//   if (!confirm('Delete?')) return;
//   if (!await dialog.confirm('Delete?')) return;
//
// A single <DialogHost /> mounted once at the app root does the
// rendering. Requests queue, so two overlapping calls can't fight over
// the same slot.

let push = null;                 // set by the mounted DialogHost
const pending = [];              // requests raised before mount

function request(spec) {
  return new Promise((resolve) => {
    const item = { ...spec, resolve };
    if (push) push(item);
    else pending.push(item);     // survives a call during first render
  });
}

const dialog = {
  /** @returns {Promise<boolean>} */
  confirm(message, opts = {}) {
    return request({ kind: 'confirm', message, ...opts });
  },
  /** @returns {Promise<string|null>} null when cancelled */
  prompt(message, defaultValue = '', opts = {}) {
    return request({ kind: 'prompt', message, defaultValue, ...opts });
  },
  /** @returns {Promise<void>} */
  alert(message, opts = {}) {
    return request({ kind: 'alert', message, ...opts });
  },
  /**
   * One-tap pick from a fixed set. Use this instead of prompt() whenever
   * the answer must be one of a known list — typing an enum value by
   * hand (`RESIGNED`) is slow and a typo becomes a server 400.
   *
   * @param {string} message
   * @param {Array<{value: string, label: string, hint?: string, tone?: 'danger'}>} choices
   * @returns {Promise<string|null>} the chosen value, or null when cancelled
   */
  choose(message, choices, opts = {}) {
    return request({ kind: 'choose', message, choices, ...opts });
  },
};

export default dialog;

export function DialogHost() {
  const [queue, setQueue] = useState([]);
  const current = queue[0] || null;
  const [value, setValue] = useState('');
  const inputRef = useRef(null);
  const okRef = useRef(null);
  const choicesRef = useRef(null);

  useEffect(() => {
    push = (item) => setQueue((q) => [...q, item]);
    if (pending.length) {
      setQueue((q) => [...q, ...pending.splice(0)]);
    }
    return () => { push = null; };
  }, []);

  // Reset the field for each new request, and put focus where the next
  // keystroke should go.
  useEffect(() => {
    if (!current) return;
    setValue(current.kind === 'prompt' ? (current.defaultValue ?? '') : '');
    const t = setTimeout(() => {
      if (current.kind === 'prompt') inputRef.current?.focus();
      // A choice dialog has no default action to focus — put the caret on
      // the first option so Tab walks the list and Enter picks one.
      else if (current.kind === 'choose') choicesRef.current?.querySelector('button')?.focus();
      else okRef.current?.focus();
    }, 0);
    return () => clearTimeout(t);
  }, [current]);

  function settle(result) {
    current?.resolve(result);
    setQueue((q) => q.slice(1));
  }

  const nullish = current?.kind === 'prompt' || current?.kind === 'choose';
  const cancel = () => settle(nullish ? null : false);
  const accept = () => settle(current.kind === 'prompt' ? value : true);

  useEffect(() => {
    if (!current) return;
    function onKey(e) {
      if (e.key === 'Escape') { e.preventDefault(); cancel(); }
      // Enter confirms, except inside a textarea where it means newline.
      // A choice dialog has no single confirm action — the focused option
      // button handles Enter itself, so swallowing it here would settle
      // the request before the click ever fires.
      if (e.key === 'Enter' && e.target.tagName !== 'TEXTAREA' && current.kind !== 'choose') {
        e.preventDefault(); accept();
      }
    }
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  });

  if (!current) return null;

  const {
    kind, message, title, confirmLabel, cancelLabel, tone, choices,
  } = current;

  return createPortal(
    <div
      className="modal-backdrop"
      // An alert has nothing to cancel, so a stray backdrop click
      // shouldn't dismiss a destructive confirmation by accident.
      onClick={(e) => { if (e.target === e.currentTarget && kind !== 'confirm') cancel(); }}
    >
      <div
        className="modal dlg"
        role={kind === 'alert' ? 'alertdialog' : 'dialog'}
        aria-modal="true"
        aria-label={title || (kind === 'confirm' ? 'Confirm' : kind === 'prompt' ? 'Input required' : kind === 'choose' ? 'Choose an option' : 'Notice')}
      >
        {title && <h3 className="dlg-title">{title}</h3>}
        <p className="dlg-message">{message}</p>

        {kind === 'prompt' && (
          <div className="field" style={{ marginTop: 12 }}>
            <input
              ref={inputRef}
              value={value}
              onChange={(e) => setValue(e.target.value)}
              type={current.inputType || 'text'}
              placeholder={current.placeholder || ''}
              aria-label={message}
            />
          </div>
        )}

        {kind === 'choose' && (
          <div className="dlg-choices" ref={choicesRef}>
            {(choices || []).map((c) => (
              <button
                key={c.value}
                type="button"
                className={`dlg-choice${c.tone === 'danger' ? ' danger' : ''}`}
                onClick={() => settle(c.value)}
              >
                <span className="dlg-choice-label">{c.label}</span>
                {c.hint && <span className="dlg-choice-hint">{c.hint}</span>}
              </button>
            ))}
          </div>
        )}

        <div className="dlg-actions">
          {kind !== 'alert' && (
            <button type="button" className="btn secondary" onClick={cancel}>
              {cancelLabel || 'Cancel'}
            </button>
          )}
          {/* A choice dialog is settled by the option buttons themselves —
              a trailing Confirm would have nothing to confirm. */}
          {kind !== 'choose' && (
            <button
              type="button"
              ref={okRef}
              className={`btn${tone === 'danger' ? ' danger' : ''}`}
              onClick={accept}
            >
              {confirmLabel || (kind === 'alert' ? 'OK' : kind === 'prompt' ? 'Save' : 'Confirm')}
            </button>
          )}
        </div>
      </div>
    </div>,
    document.body,
  );
}
