const path = require('path');
const dotenv = require('dotenv');

// Load environment variables with fallback hierarchy:
// 1. server/.env (if running from repo root or server)
// 2. root .env (if a single root .env is used)
// 3. process.cwd() / system environment variables
dotenv.config({ path: path.resolve(__dirname, '../../.env') });
dotenv.config({ path: path.resolve(__dirname, '../../../.env') });
dotenv.config();

const isProd = process.env.NODE_ENV === 'production';

const env = {
  PORT: parseInt(process.env.PORT || '5000', 10),
  MONGO_URI: process.env.MONGO_URI || 'mongodb://127.0.0.1:27017/pnap_mis',
  JWT_SECRET: process.env.JWT_SECRET || 'dev-only-secret-change-me',
  JWT_EXPIRES_IN: process.env.JWT_EXPIRES_IN || '12h',
  // Comma-separated list of allowed browser origins. Defaults cover
  // the officeholder MIS (5173) and the standalone public portal (5174).
  CORS_ORIGIN: (process.env.CORS_ORIGIN || 'http://localhost:5173,http://localhost:5174')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean),
  UPLOAD_DIR: process.env.UPLOAD_DIR || 'uploads',
  MAX_UPLOAD_MB: parseInt(process.env.MAX_UPLOAD_MB || '5', 10),
  NODE_ENV: process.env.NODE_ENV || 'development',

  // Public base URL of the web client. Verification and reset links
  // point at the SPA, never at the API — the browser must land on a
  // page that can show a result, and the raw token must not be
  // handed to a server route the user cannot see the outcome of.
  // Trailing slashes are stripped so link building stays simple.
  APP_URL: (process.env.APP_URL || 'http://localhost:5173').replace(/\/+$/, ''),

  // SMTP. With SMTP_HOST unset the mailer falls back to logging the
  // message (including the link) to the console, so the whole flow is
  // exercisable in development without a mail server.
  SMTP_HOST: process.env.SMTP_HOST || '',
  SMTP_PORT: parseInt(process.env.SMTP_PORT || '587', 10),
  SMTP_USER: process.env.SMTP_USER || '',
  SMTP_PASS: process.env.SMTP_PASS || '',
  SMTP_FROM: process.env.SMTP_FROM || 'PNAP MIS <no-reply@pnap.local>',
  // Most providers use STARTTLS on 587 (secure=false) and implicit TLS
  // on 465. Derived rather than configured, with an escape hatch.
  SMTP_SECURE: process.env.SMTP_SECURE
    ? process.env.SMTP_SECURE === 'true'
    : parseInt(process.env.SMTP_PORT || '587', 10) === 465,

  // Rate limits (requests per window per IP)
  AUTH_RATE_LIMIT: parseInt(process.env.AUTH_RATE_LIMIT || '0', 10),
  REGISTER_RATE_LIMIT: parseInt(
    process.env.REGISTER_RATE_LIMIT || (isProd ? '10' : '0'),
    10
  ),
  API_RATE_LIMIT: parseInt(
    process.env.API_RATE_LIMIT || (isProd ? '600' : '0'),
    10
  ),
};

module.exports = env;
