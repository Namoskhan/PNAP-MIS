import { useEffect, useRef, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import AuthShell from '../../components/AuthShell';
import { verifyEmail, authErrorMessage } from '../../api/authClient';

export default function VerifyEmailPage() {
  const { t } = useTranslation();
  const { token } = useParams();
  const [state, setState] = useState({ status: 'working' });

  const fired = useRef(false);

  useEffect(() => {
    if (fired.current) return;
    fired.current = true;
    verifyEmail(token)
      .then((data) => setState({ status: 'ok', alreadyVerified: data?.alreadyVerified }))
      .catch((err) => setState({ status: 'failed', message: authErrorMessage(err) }));
  }, [token]);

  if (state.status === 'working') {
    return <AuthShell title={t('auth.confirmingEmail', 'Confirming your email…')} subtitle={t('auth.oneMoment', 'One moment.')} footer={<span />} />;
  }

  if (state.status === 'ok') {
    return (
      <AuthShell
        title={state.alreadyVerified ? t('auth.alreadyConfirmed', 'Already confirmed') : t('auth.emailConfirmed', 'Email confirmed')}
        subtitle={
          state.alreadyVerified
            ? t('auth.alreadyConfirmedBody', 'This email address was already confirmed. Nothing further is needed.')
            : t('auth.emailConfirmedBody', 'Your email address is confirmed. It can now be used to recover your account.')
        }
        footer={<span />}
      >
        <div className="alert success" style={{ marginBottom: 0 }}>
          {t('auth.allSet', "You're all set.")}
        </div>
        <Link to="/login" className="btn" style={{ marginTop: 16, width: '100%', display: 'block', textAlign: 'center' }}>
          {t('auth.continueToSignIn', 'Continue to sign in')}
        </Link>
      </AuthShell>
    );
  }

  return (
    <AuthShell
      title={t('auth.verificationFailed', 'Confirmation failed')}
      subtitle={t('auth.verificationFailedBody', 'This link could not be used. Verification links expire after 24 hours and can only be opened once.')}
      footer={<Link to="/login">{t('auth.backToSignIn', 'Back to sign in')}</Link>}
    >
      <div className="alert error" style={{ marginBottom: 0 }}>
        {state.message}
      </div>
      <Link
        to="/resend-verification"
        className="btn"
        style={{ marginTop: 16, width: '100%', display: 'block', textAlign: 'center' }}
      >
        {t('auth.sendNewLink', 'Send a new link')}
      </Link>
    </AuthShell>
  );
}
