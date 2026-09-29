const jwt = require('jsonwebtoken');
const env = require('../config/env');
const User = require('../models/User');
const { ApiError } = require('../utils/response');

async function authenticate(req, res, next) {
  try {
    let token = '';
    const header = req.headers.authorization || '';
    const [scheme, bearerToken] = header.split(' ');
    if (scheme === 'Bearer' && bearerToken) {
      token = bearerToken;
    } else if (req.query?.token) {
      token = req.query.token;
    }
    if (!token) {
      throw new ApiError(401, 'UNAUTHENTICATED', 'Missing bearer token');
    }
    const payload = jwt.verify(token, env.JWT_SECRET);
    const user = await User.findById(payload.sub);
    if (!user || !user.isActive) {
      throw new ApiError(401, 'UNAUTHENTICATED', 'User not found or inactive');
    }
    req.user = user;
    req.authPayload = payload;

    // Sliding window token renewal for rememberMe sessions:
    // If the session has rememberMe enabled (or header requests keep-logged-in)
    // and less than 6 days remain, emit a renewed 7-day token in X-Refreshed-Token.
    const isRemembered = Boolean(payload.rememberMe || req.headers['x-keep-logged-in'] === 'true');
    if (isRemembered) {
      const nowSec = Math.floor(Date.now() / 1000);
      const remainingSec = payload.exp ? payload.exp - nowSec : 0;
      if (remainingSec < 6 * 24 * 3600) {
        const refreshed = signToken(user, { rememberMe: true });
        res.set('X-Refreshed-Token', refreshed);
      }
    }
    next();
  } catch (err) {
    if (err.name === 'JsonWebTokenError' || err.name === 'TokenExpiredError') {
      return next(new ApiError(401, 'UNAUTHENTICATED', 'Invalid or expired token'));
    }
    next(err);
  }
}

function requireRole(...allowed) {
  return (req, res, next) => {
    if (!req.user) return next(new ApiError(401, 'UNAUTHENTICATED', 'Login required'));
    const has = req.user.roles.some((r) => allowed.includes(r));
    if (!has) return next(new ApiError(403, 'FORBIDDEN', 'Insufficient role'));
    next();
  };
}

// requirePermission — gate a route on the dynamic permission catalogue
// (MANAGE_EVENT_CONFIG, VIEW_EVENT_CONFIG, etc.). Any of the listed
// codes is sufficient. Lazy-loaded to avoid a require cycle with
// utils/permissions, which itself depends on a model.
function requirePermission(...codes) {
  return (req, res, next) => {
    if (!req.user) return next(new ApiError(401, 'UNAUTHENTICATED', 'Login required'));
    const { userHasPermission } = require('../utils/permissions');
    const has = codes.some((c) => userHasPermission(req.user, c));
    if (!has) return next(new ApiError(403, 'FORBIDDEN', 'Insufficient permission'));
    next();
  };
}

function signToken(user, options = {}) {
  const rememberMe = options.rememberMe ?? false;
  const expiresIn =
    options.expiresIn ||
    (rememberMe ? (env.JWT_REMEMBER_ME_EXPIRES_IN || '7d') : (env.JWT_EXPIRES_IN || '12h'));
  return jwt.sign(
    {
      sub: user._id.toString(),
      roles: user.roles,
      rememberMe: Boolean(rememberMe),
    },
    env.JWT_SECRET,
    { expiresIn }
  );
}

module.exports = { authenticate, requireRole, requirePermission, signToken };
