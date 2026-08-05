import { useEffect, useRef, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import AuthShell from '../../components/AuthShell';
import { verifyEmail, authErrorMessage } from '../../api/authClient';

// Success and failure are two states of ONE page rather than two routes.
// Redirecting to a separate outcome page would mean either putting the
// token in a second URL or losing it, and the token is single-use — it
// gets exactly one chance to be spent.
export default function VerifyEmailPage() {
  const { token } = useParams();
  const [state, setState] = useState({ status: 'working' });

  // StrictMode runs effects twice in development. The first run spends
  // the token; without this guard the second run would fail against a
  // token that no longer exists and paint "invalid link" over a
  // verification that actually succeeded.
  const fired = useRef(false);

  useEffect(() => {
    if (fired.current) return;
    fired.current = true;
    let alive = true;
    verifyEmail(token)
      .then((data) => {
        if (alive) setState({ status: 'ok', alreadyVerified: data?.alreadyVerified });
      })
      .catch((err) => {
        if (alive) setState({ status: 'failed', message: authErrorMessage(err) });
      });
    return () => {
      alive = false;
    };
  }, [token]);

  if (state.status === 'working') {
    return <AuthShell title="Confirming your email…" subtitle="One moment." footer={<span />} />;
  }

  if (state.status === 'ok') {
    return (
      <AuthShell
        title={state.alreadyVerified ? 'Already confirmed' : 'Email confirmed'}
        subtitle={
          state.alreadyVerified
            ? 'This email address was already confirmed. Nothing further is needed.'
            : 'Your email address is confirmed. It can now be used to recover your account.'
        }
        footer={<span />}
      >
        <div className="alert success" style={{ marginBottom: 0 }}>
          You're all set.
        </div>
        <Link to="/login" className="btn" style={{ marginTop: 16, width: '100%', display: 'block', textAlign: 'center' }}>
          Continue to sign in
        </Link>
      </AuthShell>
    );
  }

  return (
    <AuthShell
      title="Confirmation failed"
      subtitle="This link could not be used. Verification links expire after 24 hours and can only be opened once."
      footer={<Link to="/login">Back to sign in</Link>}
    >
      <div className="alert error" style={{ marginBottom: 0 }}>
        {state.message}
      </div>
      <Link
        to="/resend-verification"
        className="btn"
        style={{ marginTop: 16, width: '100%', display: 'block', textAlign: 'center' }}
      >
        Send a new link
      </Link>
    </AuthShell>
  );
}
