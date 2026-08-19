const nodemailer = require('nodemailer');
const env = require('../config/env');

// ─── Outbound transactional mail ─────────────────────────────────────
//
// One transport, created lazily and reused. Nodemailer pools the
// connection, so building it per-send would open a new SMTP session for
// every password reset.
//
// With SMTP_HOST unset the service degrades to a CONSOLE transport that
// prints the subject and the link. That is deliberate: the entire
// verification and reset flow has to be walkable on a developer machine
// with no mail server, and a silent no-op would make a broken flow look
// like a working one.
//
// Sending is best-effort by design. A failed send must never fail the
// HTTP request — the caller's response is identical whether or not an
// account exists, and surfacing a transport error would break that
// property and leak existence through an error message.

let transport = null;
let mode = null; // 'smtp' | 'console'

function getTransport() {
  if (transport) return transport;
  if (env.SMTP_HOST) {
    transport = nodemailer.createTransport({
      host: env.SMTP_HOST,
      port: env.SMTP_PORT,
      secure: env.SMTP_SECURE,
      auth: env.SMTP_USER ? { user: env.SMTP_USER, pass: env.SMTP_PASS } : undefined,
    });
    mode = 'smtp';
  } else {
    // jsonTransport renders the message without touching the network.
    transport = nodemailer.createTransport({ jsonTransport: true });
    mode = 'console';
    console.warn(
      '[email] SMTP_HOST is not set — messages will be logged to the console, not delivered.'
    );
  }
  return transport;
}

/**
 * Send one message. Resolves to true on delivery, false on any failure.
 * Never throws.
 *
 * @param {{to:string, subject:string, text:string, html:string}} msg
 */
async function send(msg) {
  if (!msg || !msg.to) return false;
  try {
    const t = getTransport();
    const info = await t.sendMail({ from: env.SMTP_FROM, ...msg });
    if (mode === 'console') {
      console.log(
        `\n[email:console] to=${msg.to}\n  subject: ${msg.subject}\n` +
        `${(msg.text || '').split('\n').map((l) => `  ${l}`).join('\n')}\n`
      );
    }
    return Boolean(info);
  } catch (err) {
    // Logged, never rethrown — see the note above on response parity.
    console.error(`[email] send failed to=${msg.to}: ${err.message}`);
    return false;
  }
}

/** True when a real SMTP transport is configured. Used by /health-style checks. */
function isConfigured() {
  return Boolean(env.SMTP_HOST);
}

module.exports = { send, isConfigured };
