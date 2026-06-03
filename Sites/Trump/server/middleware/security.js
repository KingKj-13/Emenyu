const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

const compression = require('compression');
const cors = require('cors');
const rateLimit = require('express-rate-limit');
const helmet = require('helmet');

const STATIC_ASSET_PATTERN = /\.(?:css|js|mjs|png|jpg|jpeg|webp|gif|svg|ico|mp4|webm|woff|woff2|ttf|map)$/i;

// Build the route-alias list used for path-scoped middleware, matching the
// `/x`, `/Trump/x`, `/trump/x` convention used throughout the routers.
function aliasPaths(config, suffix) {
  const base = config.publicBasePath;
  return [`/${suffix}`, `${base}/${suffix}`, `${base.toLowerCase()}/${suffix}`];
}

function aliasApiPaths(config, suffix) {
  return aliasPaths(config, `api/${suffix}`);
}

// Compute CSP 'sha256-...' source tokens for every inline <script> in the built
// SPA entry HTML. Recomputed at startup so the policy self-heals across rebuilds
// (each deploy rebuilds the client, then PM2 reloads the process). Returns [] if
// the build is absent — callers then fall back to a script-src of just 'self'.
function computeInlineScriptHashes(htmlPath) {
  try {
    const html = fs.readFileSync(htmlPath, 'utf8');
    const hashes = [];
    const pattern = /<script(?![^>]*\bsrc=)[^>]*>([\s\S]*?)<\/script>/gi;
    let match;
    while ((match = pattern.exec(html)) !== null) {
      const body = match[1];
      if (!body || !body.trim()) {
        continue;
      }
      const digest = crypto.createHash('sha256').update(body, 'utf8').digest('base64');
      hashes.push(`'sha256-${digest}'`);
    }
    return hashes;
  } catch {
    return [];
  }
}

function buildCspDirectives(config) {
  const indexHtml = path.join(config.directories.base, 'client', 'dist', 'index.html');
  const scriptHashes = computeInlineScriptHashes(indexHtml);

  return {
    defaultSrc: ["'self'"],
    baseUri: ["'self'"],
    objectSrc: ["'none'"],
    frameAncestors: ["'self'"],
    formAction: ["'self'"],
    // Bundled SPA JS is same-origin; inline scripts (service-worker registration)
    // are allowed only by exact hash — never 'unsafe-inline' for scripts.
    scriptSrc: ["'self'", ...scriptHashes],
    // React + framer-motion set inline styles at runtime; Google Fonts ships CSS.
    styleSrc: ["'self'", "'unsafe-inline'", 'https://fonts.googleapis.com'],
    fontSrc: ["'self'", 'https://fonts.gstatic.com', 'data:'],
    // Menu/QR images come from the app, uploads, and data:/blob: URLs.
    imgSrc: ["'self'", 'data:', 'blob:'],
    mediaSrc: ["'self'", 'blob:', 'data:'],
    // Same-origin REST + Socket.IO (XHR polling and the ws/wss upgrade).
    connectSrc: ["'self'", 'ws:', 'wss:'],
    workerSrc: ["'self'"],
    manifestSrc: ["'self'"]
  };
}

function isLocalDevelopmentOrigin(origin) {
  return /^https?:\/\/(?:localhost|127\.0\.0\.1)(?::\d+)?$/i.test(origin || '');
}

function isAllowedOrigin(origin, config) {
  if (!origin) {
    return true;
  }

  if (!config.isProduction && isLocalDevelopmentOrigin(origin)) {
    return true;
  }

  return (config.security.allowedOrigins || []).includes(origin);
}

function createCorsOptions(config, logger) {
  return {
    origin(origin, callback) {
      const allowed = isAllowedOrigin(origin, config);
      if (!allowed) {
        logger.warn('cors_origin_blocked', { origin });
      }

      callback(null, allowed);
    },
    credentials: config.security.corsCredentials,
    methods: ['GET', 'HEAD', 'POST', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With', 'X-Request-Id'],
    optionsSuccessStatus: 204
  };
}

function createRateLimitHandler(logger, eventName) {
  return function rateLimitHandler(req, res, next, options) {
    logger.warn(eventName, {
      requestId: req.id,
      method: req.method,
      path: req.originalUrl,
      ip: req.ip || req.socket?.remoteAddress
    });

    res.status(options.statusCode).json({
      error: 'Too many requests. Please try again shortly.',
      requestId: req.id
    });
  };
}

function configureSecurity(app, config, logger) {
  app.disable('x-powered-by');
  app.set('trust proxy', config.security.trustProxy ? 1 : false);

  app.use((req, res, next) => {
    if (config.security.forceHttps && !req.secure && req.headers['x-forwarded-proto'] !== 'https') {
      return res.redirect(308, `https://${req.headers.host}${req.originalUrl}`);
    }

    return next();
  });

  const cspEnabled = config.security.csp?.enabled !== false;
  if (cspEnabled) {
    logger.info('csp_enabled', { reportOnly: Boolean(config.security.csp?.reportOnly) });
  }

  app.use(
    helmet({
      contentSecurityPolicy: cspEnabled
        ? {
            useDefaults: false,
            reportOnly: Boolean(config.security.csp?.reportOnly),
            directives: buildCspDirectives(config)
          }
        : false,
      crossOriginEmbedderPolicy: false,
      frameguard: { action: 'sameorigin' },
      hsts: config.security.hsts
        ? {
            maxAge: 15552000,
            includeSubDomains: true
          }
        : false,
      referrerPolicy: { policy: 'strict-origin-when-cross-origin' }
    })
  );

  app.use(compression({ threshold: config.security.compressionThresholdBytes }));
  app.use(cors(createCorsOptions(config, logger)));

  app.use(
    rateLimit({
      windowMs: config.security.rateLimitWindowMs,
      limit: config.security.generalRateLimitMax,
      standardHeaders: 'draft-8',
      legacyHeaders: false,
      skip(req) {
        return req.method === 'GET' && (STATIC_ASSET_PATTERN.test(req.path) || req.path.endsWith('/healthz') || req.path.endsWith('/readyz'));
      },
      handler: createRateLimitHandler(logger, 'rate_limit_general')
    })
  );

  app.use(
    ['/api/auth/login', `${config.publicBasePath}/api/auth/login`, `${config.publicBasePath.toLowerCase()}/api/auth/login`],
    rateLimit({
      windowMs: config.security.rateLimitWindowMs,
      limit: config.security.authRateLimitMax,
      standardHeaders: 'draft-8',
      legacyHeaders: false,
      skipSuccessfulRequests: true,
      handler: createRateLimitHandler(logger, 'rate_limit_auth')
    })
  );

  // Stricter per-IP throttle for unauthenticated public writes (order
  // submission, ratings, reservations). Only POSTs are limited so the
  // authenticated GET/PATCH/DELETE variants of these paths are unaffected.
  // The general limiter still applies on top of this one.
  const publicWriteLimiter = rateLimit({
    windowMs: config.security.rateLimitWindowMs,
    limit: config.security.publicWriteRateLimitMax,
    standardHeaders: 'draft-8',
    legacyHeaders: false,
    skip(req) {
      return req.method !== 'POST';
    },
    handler: createRateLimitHandler(logger, 'rate_limit_public_write')
  });
  app.use(
    [
      ...aliasPaths(config, 'submit_order'),
      ...aliasApiPaths(config, 'ratings'),
      ...aliasApiPaths(config, 'reservations')
    ],
    publicWriteLimiter
  );

  // The customer chatbot can be chattier than a one-off order, so it gets its
  // own (more generous) POST limit.
  app.use(
    aliasApiPaths(config, 'chat'),
    rateLimit({
      windowMs: config.security.rateLimitWindowMs,
      limit: config.security.chatRateLimitMax,
      standardHeaders: 'draft-8',
      legacyHeaders: false,
      skip(req) {
        return req.method !== 'POST';
      },
      handler: createRateLimitHandler(logger, 'rate_limit_chat')
    })
  );
}

module.exports = {
  configureSecurity,
  createCorsOptions,
  isAllowedOrigin
};
