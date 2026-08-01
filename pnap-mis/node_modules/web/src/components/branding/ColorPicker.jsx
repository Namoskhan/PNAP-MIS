import { useEffect, useState } from 'react';
import { normalizeHex } from '../../utils/contrast';
import ContrastBadge from './ContrastBadge';

// ColorPicker — hex input + native color square + optional contrast
// badge. The native <input type="color"> covers point-and-click;
// the text input lets admins paste exact hex codes from a brand
// guide. Both stay synchronized via the parent's `value` prop.
//
// Pair `contrastWith` with a background hex to get a live WCAG
// readout next to the picker — useful for buttons where text on
// primary needs ≥ 4.5:1.

export default function ColorPicker({
  label,
  value,
  onChange,
  contrastWith,
  contrastTarget = 4.5,
  contrastLabel,
  helpText,
  disabled,
}) {
  // Local input state lets admins type "#" or partial hex without
  // every keystroke firing the parent change. We only commit upward
  // when the value is a valid 6-digit hex.
  const [text, setText] = useState(value || '');

  useEffect(() => { setText(value || ''); }, [value]);

  function commit(next) {
    const norm = normalizeHex(next);
    setText(norm);
    if (/^#[0-9a-f]{6}$/i.test(norm) && norm.toLowerCase() !== String(value || '').toLowerCase()) {
      onChange(norm);
    }
  }

  return (
    <div className="field">
      <label>{label}</label>
      <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
        <input
          type="color"
          value={value || '#000000'}
          onChange={(e) => onChange(e.target.value)}
          disabled={disabled}
          style={{
            width: 40, height: 36,
            padding: 0, border: '1px solid var(--border-soft, #e5e7eb)',
            borderRadius: 6, cursor: disabled ? 'not-allowed' : 'pointer',
          }}
          aria-label={`${label} color picker`}
        />
        <input
          type="text"
          value={text}
          onChange={(e) => setText(e.target.value)}
          onBlur={(e) => commit(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); commit(e.target.value); } }}
          disabled={disabled}
          placeholder="#aabbcc"
          spellCheck={false}
          style={{ flex: 1, fontFamily: 'monospace', fontSize: 13 }}
        />
        {contrastWith && (
          <ContrastBadge
            fg={value}
            bg={contrastWith}
            target={contrastTarget}
            label={contrastLabel}
          />
        )}
      </div>
      {helpText && <div className="hint">{helpText}</div>}
    </div>
  );
}
