import { maybeFormatCnic, looksNumeric, isCnicPaste } from '../utils/identifier';

// The "Email or CNIC" input, with its CNIC auto-formatting. Shared by
// the sign-in form and both account-recovery forms so all three accept
// identifiers identically — the server dispatches on the same two
// shapes, and a field that formatted differently on one page would be a
// quiet way to make a valid CNIC un-enterable.
//
// Username was withdrawn as a login identifier; the only account that
// still signs in with one is the bootstrap Super Admin, which has
// neither an email nor a CNIC. That route is deliberately undocumented
// here rather than advertised in the placeholder.
export default function IdentifierField({
  value,
  onChange,
  label = 'Email or CNIC',
  autoFocus = false,
  ...rest
}) {
  return (
    <div className="field">
      <label>{label}</label>
      <input
        value={value}
        placeholder="email@example.com  ·  XXXXX-XXXXXXX-X"
        onChange={(e) => onChange(maybeFormatCnic(e.target.value))}
        onPaste={(e) => {
          // Format pasted CNICs immediately — without this, a pasted
          // "1560504515151" would briefly appear unformatted before the
          // next keystroke triggered the formatter.
          const text = e.clipboardData.getData('text');
          if (isCnicPaste(text)) {
            e.preventDefault();
            onChange(maybeFormatCnic(text));
          }
        }}
        autoComplete="username"
        spellCheck={false}
        autoCapitalize="off"
        autoFocus={autoFocus}
        required
        {...rest}
      />
      {looksNumeric(value) && <div className="hint">Auto-formatting as CNIC</div>}
    </div>
  );
}
