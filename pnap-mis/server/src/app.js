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

app.use(helmet({ crossOriginResourcePolicy: { policy: 'cross-origin' } }));
app.use(cors({
  // Accept any of the configured origins; `origin: null/undefined`
  // covers same-origin requests, server-to-server tools, and curl.
  origin(origin, cb) {
    if (!origin || env.CORS_ORIGIN.includes(origin)) return cb(null, true);
    return cb(new Error(`CORS blocked: ${origin} is not in CORS_ORIGIN`));
  },
  credentials: true,
}));
app.use(express.json({ limit: '2mb' }));
app.use(express.urlencoded({ extended: true }));
if (env.NODE_ENV !== 'test') app.use(morgan('dev'));

// Global API rate limit. Production keeps the 600/15min guard (tunable
// via API_RATE_LIMIT); development defaults to 0 = disabled so bulk
// data entry and load testing aren't throttled.
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

app.use('/api', routes);

app.use(notFound);
app.use(errorHandler);

module.exports = app;
