const fs = require('fs');
const path = require('path');
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');
const rateLimit = require('express-rate-limit');

const env = require('./config/env');
const routes = require('./routes');
const { notFound, errorHandler } = require('./middleware/errorHandler');

const app = express();

app.use(
  helmet({
    crossOriginResourcePolicy: { policy: 'cross-origin' },
    crossOriginOpenerPolicy: false,
    contentSecurityPolicy: false,
  })
);

// Flexible CORS support: allows wildcard '*' or configured origins without throwing 500 errors
const isOriginAllowed = (origin) => {
  if (!origin) return true;
  if (env.CORS_ORIGIN.includes('*')) return true;
  if (env.CORS_ORIGIN.includes(origin)) return true;
  return false;
};

app.use(
  cors({
    origin(origin, cb) {
      if (isOriginAllowed(origin)) return cb(null, true);
      return cb(null, false);
    },
    credentials: true,
  })
);

app.use(express.json({ limit: '2mb' }));
app.use(express.urlencoded({ extended: true }));
if (env.NODE_ENV !== 'test') app.use(morgan('dev'));

// Global API rate limit
const apiMax = env.API_RATE_LIMIT;
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: apiMax,
  skip: () => apiMax === 0,
  standardHeaders: true,
  legacyHeaders: false,
});
app.use('/api', limiter);

app.use('/uploads', express.static(path.resolve(process.cwd(), env.UPLOAD_DIR)));

// API routes
app.use('/api', routes);

// ── Production Frontend SPA Serving ─────────────────────────────────
// If compiled client assets exist (e.g. in Docker or production build),
// serve the static assets and forward non-API GET requests to index.html
const clientDistCandidates = [
  path.resolve(__dirname, '../../web/dist'),
  path.resolve(__dirname, '../web/dist'),
  path.resolve(__dirname, '../../../web/dist'),
  path.resolve(process.cwd(), 'web/dist'),
  path.resolve(process.cwd(), 'dist'),
];

let clientDistPath = null;
for (const candidate of clientDistCandidates) {
  if (fs.existsSync(candidate) && fs.existsSync(path.join(candidate, 'index.html'))) {
    clientDistPath = candidate;
    break;
  }
}

if (clientDistPath) {
  console.log(`[server] Serving static SPA frontend from: ${clientDistPath}`);
  app.use(
    express.static(clientDistPath, {
      maxAge: '1h',
      setHeaders: (res, filePath) => {
        if (filePath.endsWith('.html')) {
          res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
        }
      },
    })
  );

  app.get('*', (req, res, next) => {
    // Let API and upload 404s fall through to error handlers
    if (req.path.startsWith('/api') || req.path.startsWith('/uploads')) {
      return next();
    }
    res.sendFile(path.join(clientDistPath, 'index.html'));
  });
} else {
  console.log('[server] Running in API-only mode (no static web/dist bundle found)');
}

app.use(notFound);
app.use(errorHandler);

module.exports = app;
