import { useTranslation } from 'react-i18next';
import { maybeFormatCnic, looksNumeric, isCnicPaste } from '../utils/identifier';

// The "Email or CNIC" input, with its CNIC auto-formatting. Shared by
// the sign-in form and both account-recovery forms so all three accept
// identifiers identically — the server dispatches on the same two
// shapes, and a field that formatted differently on one page would be a
// quiet way to make a valid CNIC un-enterable.
export default function IdentifierField({
  value,
  onChange,
  label,
  autoFocus = false,
  ...rest
}) {
  const { t } = useTranslation();
  const displayLabel = label ?? t('auth.identifierLabel', 'Email or CNIC');

  return (
    <div className="field">
      <label>{displayLabel}</label>
      <input
        value={value}
        placeholder={t('auth.identifierPlaceholder', 'email@example.com  ·  XXXXX-XXXXXXX-X')}
        onChange={(e) => onChange(maybeFormatCnic(e.target.value))}
        onPaste={(e) => {
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
        dir="ltr"
        className="mixed-input"
        {...rest}
      />
      {looksNumeric(value) && (
        <div className="hint">{t('auth.autoFormattingCnic', 'Auto-formatting as CNIC')}</div>
      )}
    </div>
  );
}
