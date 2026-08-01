import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { useBranding } from '../context/BrandingContext';
import { errorMessage } from '../api/client';
import PublicRegisterModal from '../components/PublicRegisterModal';
import { useToast } from '../components/Toast';

// If the user types digits, format them as a CNIC (5-7-1). If they
// type anything that isn't a digit (e.g. "@" for email or letters
// for username), leave the value as-is so admins can enter their
// email/username untouched.
function maybeFormatCnic(input) {
  if (!input) return '';
  // Anything beyond digits, dashes, and whitespace is a non-CNIC
  // identifier — let it through verbatim. Dashes + spaces alone are
  // tolerated because users sometimes paste from a CNIC card with a
  // trailing space.
  if (/[^0-9\s-]/.test(input)) return input;
  // Strip everything except digits, cap at 13 (CNIC length).
  const digits = input.replace(/\D/g, '').slice(0, 13);
  if (digits.length === 0) return '';
  if (digits.length <= 5) return digits;
  if (digits.length <= 12) return `${digits.slice(0, 5)}-${digits.slice(5)}`;
  return `${digits.slice(0, 5)}-${digits.slice(5, 12)}-${digits.slice(12)}`;
}

export default function LoginPage() {
  const { login, user } = useAuth();
  const { identity, loginPage } = useBranding();
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
      toast.success('Welcome back!', { duration: 2500 });
      nav('/', { replace: true });
    } catch (e) {
      const msg = errorMessage(e);
      setErr(msg);
      toast.error(msg, { title: 'Sign-in failed' });
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="login-page">
      <button
        type="button"
        className="btn"
        onClick={() => setRegisterOpen(true)}
        style={{
          position: 'fixed',
          top: 20,
          right: 24,
          padding: '8px 16px',
          fontSize: 13,
          whiteSpace: 'nowrap',
          boxShadow: 'var(--shadow-lg)',
          zIndex: 10,
        }}
      >
        + Register
      </button>
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
        {/* Branded title — falls back to the system short name, then
            to the literal 'PKNAP' if nothing has loaded yet. */}
        <h1>{identity?.loginTitle || identity?.shortName || 'PKNAP'}</h1>
        {loginPage?.welcomeMessage && (
          <p className="muted" style={{ textAlign: 'center', marginTop: -8, marginBottom: 16, fontSize: 13 }}>
            {loginPage.welcomeMessage}
          </p>
        )}
        {err && <div className="alert error">{err}</div>}
        <div className="field">
          <label>Email, Username, or CNIC</label>
          <input
            value={identifier}
            placeholder="email@example.com  ·  username  ·  XXXXX-XXXXXXX-X"
            onChange={(e) => setIdentifier(maybeFormatCnic(e.target.value))}
            onPaste={(e) => {
              // Format pasted CNICs immediately — without this, a
              // pasted "1560504515151" would briefly appear unformatted
              // before the next keystroke triggered the formatter.
              const text = e.clipboardData.getData('text');
              if (text && !/[^0-9\s-]/.test(text)) {
                e.preventDefault();
                setIdentifier(maybeFormatCnic(text));
              }
            }}
            autoComplete="username"
            spellCheck={false}
            autoCapitalize="off"
            required
          />
          {/^\d/.test(identifier) && (
            <div className="hint">Auto-formatting as CNIC</div>
          )}
        </div>
        <div className="field" style={{ marginTop: 12 }}>
          <label>Password</label>
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
          />
        </div>
        <button className="btn" style={{ marginTop: 18, width: '100%' }} disabled={busy}>
          {busy ? 'Signing in…' : 'Sign In'}
        </button>
      </form>
      <PublicRegisterModal open={registerOpen} onClose={() => setRegisterOpen(false)} />
    </div>
  );
}
