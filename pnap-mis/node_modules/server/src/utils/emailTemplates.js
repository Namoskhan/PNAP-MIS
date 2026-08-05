// Transactional email bodies. Plain objects in, { subject, text, html }
// out — no template engine and no I/O, so these stay trivially testable.
//
// Every message ships BOTH a text and an html part: a large share of
// the intended recipients read mail on low-end Android clients, and a
// verification link that renders as a blank card is a support ticket.
//
// The link is always printed as literal text as well as wrapped in the
// button, because mail clients that strip anchors are exactly the ones
// where the user most needs a URL they can copy.

function esc(s) {
  return String(s == null ? '' : s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function shell({ title, greeting, body, ctaLabel, url, footer, brand }) {
  const safeUrl = esc(url);
  return `<!doctype html>
<html><body style="margin:0;padding:24px;background:#f4f5f7;font-family:Segoe UI,Roboto,Helvetica,Arial,sans-serif;color:#1f2430;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;margin:0 auto;background:#ffffff;border-radius:10px;padding:28px;">
    <tr><td>
      <div style="font-size:13px;letter-spacing:.08em;text-transform:uppercase;color:#6b7280;margin-bottom:14px;">${esc(brand)}</div>
      <h1 style="margin:0 0 14px;font-size:20px;line-height:1.35;">${esc(title)}</h1>
      <p style="margin:0 0 10px;font-size:15px;line-height:1.6;">${esc(greeting)}</p>
      <p style="margin:0 0 22px;font-size:15px;line-height:1.6;">${esc(body)}</p>
      <p style="margin:0 0 22px;">
        <a href="${safeUrl}" style="display:inline-block;background:#1d4ed8;color:#ffffff;text-decoration:none;padding:12px 22px;border-radius:7px;font-size:15px;font-weight:600;">${esc(ctaLabel)}</a>
      </p>
      <p style="margin:0 0 6px;font-size:13px;color:#6b7280;">If the button does not work, copy this link into your browser:</p>
      <p style="margin:0 0 22px;font-size:13px;word-break:break-all;"><a href="${safeUrl}" style="color:#1d4ed8;">${safeUrl}</a></p>
      <hr style="border:none;border-top:1px solid #e5e7eb;margin:0 0 14px;">
      <p style="margin:0;font-size:12px;color:#6b7280;line-height:1.6;">${esc(footer)}</p>
    </td></tr>
  </table>
</body></html>`;
}

function verifyEmail({ fullName, url, brand = 'PNAP MIS', hours = 24 }) {
  const greeting = `Assalam-o-Alaikum ${fullName || 'there'},`;
  const body = `Please confirm this email address so it can be used to recover your ${brand} account.`;
  const footer = `This link expires in ${hours} hours and can be used once. If you did not expect this email, you can safely ignore it — nothing changes until the link is opened.`;
  return {
    subject: `Confirm your email address — ${brand}`,
    text: `${greeting}\n\n${body}\n\n${url}\n\n${footer}\n`,
    html: shell({
      title: 'Confirm your email address',
      greeting, body, ctaLabel: 'Confirm email', url, footer, brand,
    }),
  };
}

function resetPassword({ fullName, url, brand = 'PNAP MIS', hours = 1 }) {
  const greeting = `Assalam-o-Alaikum ${fullName || 'there'},`;
  const body = `We received a request to reset the password for your ${brand} account. Choose a new password using the link below.`;
  const footer = `This link expires in ${hours === 1 ? '1 hour' : `${hours} hours`} and can be used once. If you did not request a password reset, ignore this email — your current password remains active and unchanged.`;
  return {
    subject: `Reset your password — ${brand}`,
    text: `${greeting}\n\n${body}\n\n${url}\n\n${footer}\n`,
    html: shell({
      title: 'Reset your password',
      greeting, body, ctaLabel: 'Reset password', url, footer, brand,
    }),
  };
}

// Sent after a successful reset. Not a courtesy — it is the only signal
// a victim gets if someone else completed a reset on their account.
function passwordChanged({ fullName, url, brand = 'PNAP MIS' }) {
  const greeting = `Assalam-o-Alaikum ${fullName || 'there'},`;
  const body = `The password for your ${brand} account was just changed. If this was you, no action is needed.`;
  const footer = 'If you did NOT change your password, contact your organizational administrator immediately.';
  return {
    subject: `Your password was changed — ${brand}`,
    text: `${greeting}\n\n${body}\n\n${footer}\n`,
    html: shell({
      title: 'Your password was changed',
      greeting, body, ctaLabel: 'Sign in', url, footer, brand,
    }),
  };
}

module.exports = { verifyEmail, resetPassword, passwordChanged };
