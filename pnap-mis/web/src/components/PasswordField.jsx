import { useId } from 'react';
import { useTranslation } from 'react-i18next';
import PasswordInput from './PasswordInput';

export default function PasswordField({
  label,
  labelAction,
  value,
  onChange,
  hint,
  autoComplete = 'current-password',
  ...rest
}) {
  const id = useId();
  const { t } = useTranslation();
  const displayLabel = label ?? t('auth.passwordLabel', 'Password');

  return (
    <div className="field">
      {labelAction ? (
        <div style={{
          display: 'flex', alignItems: 'baseline',
          justifyContent: 'space-between', gap: 10, marginBottom: 6,
        }}>
          <label htmlFor={id} style={{ marginBottom: 0 }}>{displayLabel}</label>
          {labelAction}
        </div>
      ) : (
        <label htmlFor={id}>{displayLabel}</label>
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
