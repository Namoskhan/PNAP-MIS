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
    // Deliberately NOT gated on an `alive` flag. Under StrictMode the
    // sequence is effect → cleanup → effect: the cleanup of the first
    // run fires while its request is still in the air, and the second
    // run returns early on the guard above. An `alive` flag captured by
    // the first run would therefore be false by the time the only
    // response arrives, the state would never be set, and the page
    // would sit on "Confirming your email…" forever — the request
    // having succeeded on the server and spent the token.
    //
    // Settling on an unmounted component is safe: React 18 dropped the
    // setState-after-unmount warning, and `fired` already guarantees
    // exactly one request per token.
    verifyEmail(token)
      .then((data) => setState({ status: 'ok', alreadyVerified: data?.alreadyVerified }))
      .catch((err) => setState({ status: 'failed', message: authErrorMessage(err) }));
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
