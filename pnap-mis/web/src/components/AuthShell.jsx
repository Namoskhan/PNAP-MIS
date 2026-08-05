import { Link } from 'react-router-dom';
import { useBranding } from '../context/BrandingContext';

// Shared frame for the four unauthenticated account pages (forgot
// password, reset password, verify email, resend verification).
//
// Reuses the login page's own `.login-page` / `.login-card` classes
// rather than introducing a parallel set: these pages sit beside the
// login card in the user's mental model, and a visitor who arrives from
// an email should land somewhere that obviously belongs to the same
// system. Branding is read from the same context the login page uses, so
// a customised title or card style carries over automatically.
export default function AuthShell({ title, subtitle, children, footer }) {
  const { identity, loginPage } = useBranding();

  return (
    <div className="login-page">
      <div
        className={`login-card ${loginPage?.cardStyle === 'GLASS' ? 'login-card-glass' : ''}`}
        style={{ display: 'block' }}
      >
        <h1 style={{ marginBottom: 4 }}>
          {identity?.loginTitle || identity?.shortName || 'PKNAP'}
        </h1>
        {/* Left-aligned to match .login-card h1, so a visitor arriving
            from an email sees the same card they left. */}
        <h2 style={{ margin: '0 0 6px', fontSize: 17, fontWeight: 600 }}>{title}</h2>
        {subtitle && (
          <p
            className="muted"
            style={{ marginTop: 0, marginBottom: 18, fontSize: 13, lineHeight: 1.55 }}
          >
            {subtitle}
          </p>
        )}
        {children}
        <div style={{ marginTop: 18, textAlign: 'center', fontSize: 13 }}>
          {footer || <Link to="/login">Back to sign in</Link>}
        </div>
      </div>
    </div>
  );
}
