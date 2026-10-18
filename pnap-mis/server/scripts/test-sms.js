/**
 * CLI Test utility for Outbound SMS (Veevo Tech / Console / Twilio).
 *
 * Usage:
 *   node scripts/test-sms.js [phoneNumber] [message]
 *
 * Example:
 *   node scripts/test-sms.js 03001234567 "Test SMS message from PNAP-MIS"
 *   node scripts/test-sms.js +923001234567 "Testing Veevo Tech v3 integration"
 */

const env = require('../src/config/env');
const { sendSms, normalizePhone, toE164 } = require('../src/services/messagingService');

async function main() {
  const args = process.argv.slice(2);

  console.log('========================================================');
  console.log('          PNAP-MIS SMS Gateway Diagnostics & Tester      ');
  console.log('========================================================\n');

  console.log('Current SMS Configuration:');
  console.log(`  - SMS_ENABLED     : ${env.SMS_ENABLED}`);
  console.log(`  - SMS_PROVIDER    : ${env.SMS_PROVIDER}`);
  console.log(`  - VEEVO_API_URL   : ${env.VEEVO_API_URL}`);
  console.log(`  - VEEVO_API_HASH  : ${env.VEEVO_API_HASH ? `[Configured: ${env.VEEVO_API_HASH.slice(0, 4)}...${env.VEEVO_API_HASH.slice(-4)}]` : '[NOT SET]'}`);
  console.log(`  - VEEVO_SENDER_ID : ${env.VEEVO_SENDER_ID || '(default)'}`);
  console.log(`  - VEEVO_HEADER_ID : ${env.VEEVO_HEADER_ID || '(none)'}\n`);

  if (args.length === 0 || args[0] === '--help' || args[0] === '-h') {
    console.log('Usage:');
    console.log('  node scripts/test-sms.js <phone_number> [message]\n');
    console.log('Examples:');
    console.log('  node scripts/test-sms.js 03001234567');
    console.log('  node scripts/test-sms.js +923001234567 "Your OTP code is 123456"');
    console.log('\nNote: To test Veevo Tech, set VEEVO_API_HASH in server/.env and SMS_PROVIDER=veevotech.');
    process.exit(0);
  }

  const rawPhone = args[0];
  const message = args[1] || `[PNAP-MIS Test SMS] Delivery verification at ${new Date().toLocaleTimeString()} PKT. JazakAllah Khair!`;

  const e164 = toE164(rawPhone);
  const normalized = normalizePhone(rawPhone);

  console.log(`Testing Outbound SMS:`);
  console.log(`  - Input Phone    : "${rawPhone}"`);
  console.log(`  - Normalized     : "${normalized}"`);
  console.log(`  - E.164 (Veevo)  : "${e164}"`);
  console.log(`  - Message Text   : "${message}"`);
  console.log(`  - Message Length : ${message.length} chars (${message.length > 160 ? 'multi-part' : 'single SMS'})\n`);

  console.log('Dispatching request to SMS service...\n');

  const start = Date.now();
  const result = await sendSms({ to: rawPhone, message });
  const duration = Date.now() - start;

  console.log(`---------------- Result (${duration}ms) ----------------`);
  console.log(JSON.stringify(result, null, 2));
  console.log('--------------------------------------------------------\n');

  if (result.success) {
    console.log('✅ SMS successfully handled by provider:', result.provider);
  } else {
    console.error('❌ SMS sending failed:', result.error || result.reason || 'Unknown error');
  }
}

main().catch((err) => {
  console.error('Fatal execution error:', err);
  process.exit(1);
});
