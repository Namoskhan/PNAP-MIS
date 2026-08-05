import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import AuthShell from '../../components/AuthShell';
import { checkResetToken, resetPassword, authErrorMessage } from '../../api/authClient';

const MIN_PASSWORD = 8;

// Mirrors passwordResetService.passwordProblem on the server. The server
// is the authority — this copy exists only so the user is told about a
// weak password before submitting, not after.
function localProblem(password, confirm) {
  if (password.length < MIN_PASSWORD) return `Password must be at least ${MIN_PASSWORD} characters.`;
  if (!/[a-zA-Z]/.test(password) || !/[0-9]/.test(password)) {
    return 'Password must contain at least one letter and one number.';
  }
  if (password !== confirm) return 'Passwords do not match.';
  return null;
}

export default function ResetPasswordPage() {
  const { token } = useParams();
  const nav = useNavigate();

  // The link is validated BEFORE the form is shown. Discovering a link
  // expired only after typing a new password twice is a small cruelty
  // this endpoint exists to avoid.
  const [check, setCheck] = useState({ status: 'checking' });
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);

  useEffect(() => {
    let alive = true;
    checkResetToken(token)
      .then((data) => alive && setCheck({ status: 'valid', fullName: data?.fullName }))
      .catch((ex) => alive && setCheck({ status: 'invalid', message: authErrorMessage(ex) }));
    return () => {
      alive = false;
    };
  }, [token]);

  async function submit(e) {
    e.preventDefault();
    const problem = localProblem(password, confirm);
    if (problem) {
      setErr(problem);
      return;
    }
    setErr('');
    setBusy(true);
    try {
      await resetPassword(token, password, confirm);
      setDone(true);
      // Long enough to read the confirmation, short enough not to strand
      // someone on a dead-end page.
      setTimeout(() => nav('/login', { replace: true }), 2500);
    } catch (ex) {
      setErr(authErrorMessage(ex));
    } finally {
      setBusy(false);
    }
  }

  if (check.status === 'checking') {
    return <AuthShell title="Checking your link…" subtitle="One moment." footer={<span />} />;
  }

  if (check.status === 'invalid') {
    return (
      <AuthShell
        title="Link no longer valid"
        subtitle="Reset links expire after one hour and can only be used once. Requesting a new link also cancels any earlier one."
        footer={<Link to="/login">Back to sign in</Link>}
      >
        <div className="alert error" style={{ marginBottom: 0 }}>
          {check.message}
        </div>
        <Link
          to="/forgot-password"
          className="btn"
          style={{ marginTop: 16, width: '100%', display: 'block', textAlign: 'center' }}
        >
          Request a new link
        </Link>
      </AuthShell>
    );
  }

  if (done) {
    return (
      <AuthShell
        title="Password updated"
        subtitle="You can now sign in with your new password. Taking you to the sign-in page…"
        footer={<Link to="/login">Go to sign in now</Link>}
      >
        <div className="alert success" style={{ marginBottom: 0 }}>
          Your password has been changed.
        </div>
      </AuthShell>
    );
  }

  return (
    <AuthShell
      title="Choose a new password"
      subtitle={
        check.fullName
          ? `Setting a new password for ${check.fullName}.`
          : 'Enter a new password for your account.'
      }
    >
      <form onSubmit={submit}>
        {err && <div className="alert error">{err}</div>}
        <div className="field">
          <label>New password</label>
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            autoComplete="new-password"
            autoFocus
            required
          />
          <div className="hint">
            At least {MIN_PASSWORD} characters, including a letter and a number.
          </div>
        </div>
        <div className="field" style={{ marginTop: 12 }}>
          <label>Confirm new password</label>
          <input
            type="password"
            value={confirm}
            onChange={(e) => setConfirm(e.target.value)}
            autoComplete="new-password"
            required
          />
        </div>
        <button className="btn" style={{ marginTop: 18, width: '100%' }} disabled={busy}>
          {busy ? 'Updating…' : 'Update password'}
        </button>
      </form>
    </AuthShell>
  );
}
