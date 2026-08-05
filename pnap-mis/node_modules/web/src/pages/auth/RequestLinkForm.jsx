import { useState } from 'react';
import { Link } from 'react-router-dom';
import AuthShell from '../../components/AuthShell';
import IdentifierField from '../../components/IdentifierField';
import { authErrorMessage } from '../../api/authClient';

// Shared body for the two "send me a link" pages — forgot password and
// resend verification. They are the same interaction (identify yourself,
// we mail you something) and only differ in wording and endpoint, so the
// behaviour lives here once.
//
// Note the success state: it is deliberately NOT a confirmation that an
// account was found. The server answers identically whether or not the
// identifier matches anything, and this screen has to preserve that —
// "we've sent you an email" here would turn the page into an account-
// existence oracle that the API carefully avoids being.
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
          Check your inbox — and your spam folder, which is where these
          messages most often end up.
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
          Use a different email or CNIC
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
  return (
    <>
      <Link to="/login">Back to sign in</Link>
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
