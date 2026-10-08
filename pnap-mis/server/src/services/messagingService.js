const env = require('../config/env');

/**
 * Normalizes phone numbers to Pakistan standard digits:
 * 03001234567 -> 923001234567
 * +92 300 1234567 -> 923001234567
 * 3001234567 -> 923001234567
 */
function normalizePhone(rawPhone) {
  if (!rawPhone) return '';
  let digits = String(rawPhone).replace(/\D/g, '');
  if (digits.startsWith('0')) {
    digits = '92' + digits.slice(1);
  } else if (digits.length === 10 && digits.startsWith('3')) {
    digits = '92' + digits;
  }
  return digits;
}

function toE164(rawPhone) {
  const norm = normalizePhone(rawPhone);
  return norm ? `+${norm}` : '';
}

/**
 * Send SMS message via configured provider or console fallback.
 * Never throws into caller.
 *
 * @param {{ to: string, message: string }} opts
 */
async function sendSms({ to, message }) {
  if (!to || !message) return { success: false, reason: 'Missing to or message' };
  if (!env.SMS_ENABLED) {
    return { success: false, reason: 'SMS disabled via SMS_ENABLED' };
  }

  const e164 = toE164(to);
  const normalized = normalizePhone(to);

  try {
    if (env.SMS_PROVIDER === 'twilio' && env.TWILIO_ACCOUNT_SID && env.TWILIO_AUTH_TOKEN && env.TWILIO_PHONE_NUMBER) {
      const url = `https://api.twilio.com/2010-04-01/Accounts/${env.TWILIO_ACCOUNT_SID}/Messages.json`;
      const body = new URLSearchParams({
        To: e164,
        From: env.TWILIO_PHONE_NUMBER,
        Body: message,
      });

      const res = await fetch(url, {
        method: 'POST',
        headers: {
          Authorization: `Basic ${Buffer.from(`${env.TWILIO_ACCOUNT_SID}:${env.TWILIO_AUTH_TOKEN}`).toString('base64')}`,
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: body.toString(),
      });

      if (!res.ok) {
        const errText = await res.text();
        console.error('[sms:twilio] failed:', res.status, errText);
        return { success: false, error: errText };
      }
      return { success: true, provider: 'twilio' };
    }

    if (env.SMS_PROVIDER === 'generic_http' && env.SMS_GATEWAY_URL) {
      const payload = {
        to: normalized,
        e164,
        message,
        senderId: env.SMS_SENDER_ID,
        apiKey: env.SMS_API_KEY,
        username: env.SMS_USERNAME,
        password: env.SMS_PASSWORD,
      };

      const res = await fetch(env.SMS_GATEWAY_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(env.SMS_API_KEY ? { 'X-API-Key': env.SMS_API_KEY } : {}),
        },
        body: JSON.stringify(payload),
      });

      if (!res.ok) {
        const errText = await res.text();
        console.error('[sms:generic_http] failed:', res.status, errText);
        return { success: false, error: errText };
      }
      return { success: true, provider: 'generic_http' };
    }

    // Default development / console simulation mode
    console.log(
      `\n[sms:sim-message] 📱 to=${e164 || to} (provider=console)\n` +
      `  Sender: ${env.SMS_SENDER_ID || 'PKNAP'}\n` +
      `  Content: ${message}\n`
    );
    return { success: true, provider: 'console' };
  } catch (err) {
    console.error('[sms] send error:', err.message);
    return { success: false, error: err.message };
  }
}

/**
 * Send WhatsApp message via configured provider or console fallback.
 * Never throws into caller.
 *
 * @param {{ to: string, message: string }} opts
 */
async function sendWhatsApp({ to, message }) {
  if (!to || !message) return { success: false, reason: 'Missing to or message' };
  if (!env.WHATSAPP_ENABLED) {
    return { success: false, reason: 'WhatsApp disabled via WHATSAPP_ENABLED' };
  }

  const e164 = toE164(to);
  const normalized = normalizePhone(to);

  try {
    if (env.WHATSAPP_PROVIDER === 'meta' && env.WHATSAPP_API_TOKEN && env.WHATSAPP_PHONE_NUMBER_ID) {
      const url = `https://graph.facebook.com/v19.0/${env.WHATSAPP_PHONE_NUMBER_ID}/messages`;
      const res = await fetch(url, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${env.WHATSAPP_API_TOKEN}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          messaging_product: 'whatsapp',
          to: normalized,
          type: 'text',
          text: { preview_url: false, body: message },
        }),
      });

      if (!res.ok) {
        const errText = await res.text();
        console.error('[whatsapp:meta] failed:', res.status, errText);
        return { success: false, error: errText };
      }
      return { success: true, provider: 'meta' };
    }

    if (env.WHATSAPP_PROVIDER === 'twilio' && env.TWILIO_ACCOUNT_SID && env.TWILIO_AUTH_TOKEN && env.TWILIO_WHATSAPP_FROM) {
      const url = `https://api.twilio.com/2010-04-01/Accounts/${env.TWILIO_ACCOUNT_SID}/Messages.json`;
      const body = new URLSearchParams({
        To: `whatsapp:${e164}`,
        From: env.TWILIO_WHATSAPP_FROM.startsWith('whatsapp:')
          ? env.TWILIO_WHATSAPP_FROM
          : `whatsapp:${env.TWILIO_WHATSAPP_FROM}`,
        Body: message,
      });

      const res = await fetch(url, {
        method: 'POST',
        headers: {
          Authorization: `Basic ${Buffer.from(`${env.TWILIO_ACCOUNT_SID}:${env.TWILIO_AUTH_TOKEN}`).toString('base64')}`,
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: body.toString(),
      });

      if (!res.ok) {
        const errText = await res.text();
        console.error('[whatsapp:twilio] failed:', res.status, errText);
        return { success: false, error: errText };
      }
      return { success: true, provider: 'twilio' };
    }

    if (env.WHATSAPP_PROVIDER === 'generic_http' && env.WHATSAPP_GATEWAY_URL) {
      const payload = {
        to: normalized,
        e164,
        message,
        apiKey: env.WHATSAPP_API_TOKEN,
      };

      const res = await fetch(env.WHATSAPP_GATEWAY_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(env.WHATSAPP_API_TOKEN ? { Authorization: `Bearer ${env.WHATSAPP_API_TOKEN}` } : {}),
        },
        body: JSON.stringify(payload),
      });

      if (!res.ok) {
        const errText = await res.text();
        console.error('[whatsapp:generic_http] failed:', res.status, errText);
        return { success: false, error: errText };
      }
      return { success: true, provider: 'generic_http' };
    }

    // Default development / console simulation mode
    console.log(
      `\n[whatsapp:message] 💬 to=${e164 || to} (provider=console)\n` +
      `  Content: ${message}\n`
    );
    return { success: true, provider: 'console' };
  } catch (err) {
    console.error('[whatsapp] send error:', err.message);
    return { success: false, error: err.message };
  }
}

/**
 * Dispatches thank you messages to both SMS and WhatsApp.
 */
async function sendDonationThankYouMessages({ phone, donorName, amount, receiptNo, message }) {
  if (!phone) return;
  const msg = message || `Assalam-o-Alaikum ${donorName || 'Respected Supporter'}! PKNAP gratefully acknowledges receipt of your donation of PKR ${(amount || 0).toLocaleString()} (Receipt #${receiptNo}). Thank you for your support. JazakAllah Khair!`;

  return Promise.allSettled([
    sendSms({ to: phone, message: msg }),
    sendWhatsApp({ to: phone, message: msg }),
  ]);
}

module.exports = {
  normalizePhone,
  toE164,
  sendSms,
  sendWhatsApp,
  sendDonationThankYouMessages,
};
