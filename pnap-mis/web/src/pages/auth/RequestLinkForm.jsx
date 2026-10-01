import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import AuthShell from '../../components/AuthShell';
import IdentifierField from '../../components/IdentifierField';
import { authErrorMessage } from '../../api/authClient';

// Shared body for the two "send me a link" pages — forgot password and
// resend verification. They are the same interaction (identify yourself,
// we mail you something) and only differ in wording and endpoint, so the
// behaviour lives here once.
export default function RequestLinkForm({
  title,
  subtitle,
  submitLabel,
  busyLabel,
  successTitle,
  successBody,
  onSubmit,
  footer,
}) {
  const { t } = useTranslation();
  const [identifier, setIdentifier] = useState('');
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState(false);

  async function handle(e) {
    e.preventDefault();
    setErr('');
    setBusy(true);
    try {
      await onSubmit(identifier.trim());
      setSent(true);
    } catch (ex) {
      setErr(authErrorMessage(ex));
    } finally {
      setBusy(false);
    }
  }

  if (sent) {
    return (
      <AuthShell title={successTitle} subtitle={successBody} footer={footer}>
        <div className="alert" style={{ marginBottom: 0 }}>
          {t('auth.checkInboxSpam', 'Check your inbox — and your spam folder, which is where these messages most often end up.')}
        </div>
        <button
          type="button"
          className="btn secondary"
          style={{ marginTop: 14, width: '100%' }}
          onClick={() => {
            setSent(false);
            setIdentifier('');
          }}
        >
          {t('auth.useDifferentId', 'Use a different email or CNIC')}
        </button>
      </AuthShell>
    );
  }

  return (
    <AuthShell title={title} subtitle={subtitle} footer={footer}>
      <form onSubmit={handle}>
        {err && <div className="alert error">{err}</div>}
        <IdentifierField value={identifier} onChange={setIdentifier} autoFocus />
        <button className="btn" style={{ marginTop: 18, width: '100%' }} disabled={busy}>
          {busy ? busyLabel : submitLabel}
        </button>
      </form>
    </AuthShell>
  );
}

/** The footer both pages share: back to sign in, plus a link to the other flow. */
export function AuthFooter({ otherTo, otherLabel }) {
  const { t } = useTranslation();
  return (
    <>
      <Link to="/login">{t('auth.backToSignIn', 'Back to sign in')}</Link>
      {otherTo && (
        <>
          <span className="muted" style={{ margin: '0 8px' }}>
            ·
          </span>
          <Link to={otherTo}>{otherLabel}</Link>
        </>
      )}
    </>
  );
}
