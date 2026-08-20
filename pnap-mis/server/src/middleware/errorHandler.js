const env = require('../config/env');
const { ApiError, fail } = require('../utils/response');

function notFound(req, res, next) {
  next(new ApiError(404, 'NOT_FOUND', `Route ${req.method} ${req.originalUrl} not found`));
}

function errorHandler(err, req, res, next) {
  if (res.headersSent) return next(err);

  if (err.name === 'ValidationError') {
    return fail(res, 400, 'VALIDATION_ERROR', err.message, err.errors);
  }
  if (err.name === 'CastError') {
    return fail(res, 400, 'INVALID_ID', `Invalid ${err.path}: ${err.value}`);
  }
  if (err.code === 11000) {
    // Surface WHICH field collided so the client (and humans
    // reading the response) know what to fix. err.keyValue is
    // populated by the MongoDB driver for E11000 errors.
    const kv = err.keyValue || {};
    const pretty = Object.entries(kv)
      .map(([k, v]) => `${k}=${JSON.stringify(v)}`)
      .join(', ');
    const collection = err.message?.match(/collection: \S+\.(\S+)/)?.[1];
    const message = pretty
      ? `Duplicate value in ${collection || 'database'}: ${pretty}`
      : 'Duplicate field value';
    console.error('[error] duplicate-key', { collection, kv });
    return fail(res, 409, 'DUPLICATE', message, kv);
  }
  if (err instanceof ApiError) {
    return fail(res, err.status, err.code, err.message, err.details);
  }

  // MongoDB connection failures are the most common cause of 500s
  // during local development; surface them clearly.
  const isMongoErr =
    err.name === 'MongooseServerSelectionError' ||
    err.name === 'MongoNetworkError' ||
    err.name === 'MongoServerSelectionError';
  if (isMongoErr) {
    console.error('[db error]', err.message);
    return fail(res, 503, 'DB_UNAVAILABLE',
      `Database not reachable. Is MongoDB running at ${env.MONGO_URI}?`);
  }

  console.error('[error]', err);
  // In development, expose the underlying error so we don't have
  // to play 20 questions when something blows up.
  const details = env.NODE_ENV === 'production'
    ? undefined
    : { name: err.name, message: err.message, stack: err.stack?.split('\n').slice(0, 5) };
  return fail(res, 500, 'INTERNAL_ERROR', err.message || 'Something went wrong', details);
}

module.exports = { notFound, errorHandler };
