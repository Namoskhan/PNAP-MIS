import { lazy, Suspense, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useAuth } from '../context/AuthContext';
import { useBranding } from '../context/BrandingContext';
import { errorMessage } from '../api/client';
import IdentifierField from '../components/IdentifierField';
import PasswordField from '../components/PasswordField';
import LanguageSelector from '../components/LanguageSelector';
import { useToast } from '../components/Toast';

const PublicRegisterModal = lazy(() => import('../components/PublicRegisterModal'));

export default function LoginPage() {
  const { login, user } = useAuth();
  const { identity, loginPage, logos } = useBranding();
  const { t } = useTranslation();
  const nav = useNavigate();
  const toast = useToast();
  const [identifier, setIdentifier] = useState('');
  const [password, setPassword] = useState('');
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  const [registerOpen, setRegisterOpen] = useState(false);

  if (user) {
    nav('/', { replace: true });
  }

  async function onSubmit(e) {
    e.preventDefault();
    setErr('');
    setBusy(true);
    try {
      await login(identifier, password);
      toast.success(t('common.welcomeBack', 'Welcome back!'), { duration: 2500 });
      nav('/', { replace: true });
    } catch (e) {
      const msg = errorMessage(e);
      setErr(msg);
      toast.error(msg, { title: t('common.signInFailed', 'Sign-in failed') });
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="login-page">
      <div className="login-header-controls">
        <LanguageSelector variant="login" />
        <button
          type="button"
          className="btn"
          onClick={() => setRegisterOpen(true)}
          style={{
            padding: '8px 16px',
            fontSize: 13,
            whiteSpace: 'nowrap',
            boxShadow: 'var(--shadow-md)',
          }}
        >
          {t('auth.registerBtn', '+ Register')}
        </button>
      </div>

      {/* Optional branded hero banner above the card. Hidden when
          loginPage.heroText is blank. */}
      {loginPage?.heroText && (
        <div style={{
          textAlign: 'center',
          margin: '40px auto 8px',
          maxWidth: 560,
          padding: '0 16px',
          color: 'var(--text)',
        }}>
          <h2 style={{ margin: 0, fontSize: 22, fontWeight: 700 }}>
            {loginPage.heroText}
          </h2>
          {loginPage.slogan && (
            <p className="muted" style={{ marginTop: 6, fontSize: 14 }}>
              {loginPage.slogan}
            </p>
          )}
        </div>
      )}
      <form
        className={`login-card ${loginPage?.cardStyle === 'GLASS' ? 'login-card-glass' : ''}`}
        onSubmit={onSubmit}
      >
        <div style={{ textAlign: 'center', marginBottom: 16 }}>
          <img
            src={logos?.login?.url || '/logo.png'}
            alt="Pakhtunkhwa National Awami Party Logo"
            style={{
              width: 88,
              height: 88,
              borderRadius: '50%',
              objectFit: 'contain',
              boxShadow: '0 4px 14px rgba(0,0,0,0.12)',
              margin: '0 auto',
              display: 'inline-block'
            }}
          />
        </div>
        {/* Branded title — falls back to the system short name, then
            to the literal 'PKNAP' if nothing has loaded yet. */}
        <h1>{identity?.loginTitle || identity?.shortName || t('auth.loginTitle', 'PKNAP')}</h1>
        {loginPage?.welcomeMessage && (
          <p className="muted" style={{ textAlign: 'center', marginTop: -8, marginBottom: 16, fontSize: 13 }}>
            {loginPage.welcomeMessage}
          </p>
        )}
        {err && <div className="alert error">{err}</div>}
        <IdentifierField value={identifier} onChange={setIdentifier} />
        <div style={{ marginTop: 12 }}>
          <PasswordField
            value={password}
            onChange={setPassword}
            autoComplete="current-password"
            labelAction={
              <Link to="/forgot-password" style={{ fontSize: 12.5 }}>
                {t('auth.forgotPassword', 'Forgot password?')}
              </Link>
            }
          />
        </div>
        <button className="btn" style={{ marginTop: 18, width: '100%' }} disabled={busy}>
          {busy ? t('auth.signingIn', 'Signing in…') : t('auth.signIn', 'Sign In')}
        </button>
        <div className="muted" style={{ marginTop: 14, textAlign: 'center', fontSize: 12.5 }}>
          {t('auth.didntGetEmail', "Didn't get your confirmation email?")}{' '}
          <Link to="/resend-verification">{t('auth.resendVerification', 'Resend verification')}</Link>
        </div>
      </form>
      {registerOpen && (
        <Suspense fallback={null}>
          <PublicRegisterModal open={registerOpen} onClose={() => setRegisterOpen(false)} />
        </Suspense>
      )}
    </div>
  );
}
