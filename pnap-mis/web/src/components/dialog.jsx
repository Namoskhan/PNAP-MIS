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
};

export default dialog;

export function DialogHost() {
  const [queue, setQueue] = useState([]);
  const current = queue[0] || null;
  const [value, setValue] = useState('');
  const inputRef = useRef(null);
  const okRef = useRef(null);

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
      else okRef.current?.focus();
    }, 0);
    return () => clearTimeout(t);
  }, [current]);

  function settle(result) {
    current?.resolve(result);
    setQueue((q) => q.slice(1));
  }

  const cancel = () => settle(current.kind === 'prompt' ? null : false);
  const accept = () => settle(current.kind === 'prompt' ? value : true);

  useEffect(() => {
    if (!current) return;
    function onKey(e) {
      if (e.key === 'Escape') { e.preventDefault(); cancel(); }
      // Enter confirms, except inside a textarea where it means newline.
      if (e.key === 'Enter' && e.target.tagName !== 'TEXTAREA') {
        e.preventDefault(); accept();
      }
    }
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  });

  if (!current) return null;

  const {
    kind, message, title, confirmLabel, cancelLabel, tone,
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
        aria-label={title || (kind === 'confirm' ? 'Confirm' : kind === 'prompt' ? 'Input required' : 'Notice')}
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

        <div className="dlg-actions">
          {kind !== 'alert' && (
            <button type="button" className="btn secondary" onClick={cancel}>
              {cancelLabel || 'Cancel'}
            </button>
          )}
          <button
            type="button"
            ref={okRef}
            className={`btn${tone === 'danger' ? ' danger' : ''}`}
            onClick={accept}
          >
            {confirmLabel || (kind === 'alert' ? 'OK' : kind === 'prompt' ? 'Save' : 'Confirm')}
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
