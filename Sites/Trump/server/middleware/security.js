const compression = require('compression');
const cors = require('cors');
const rateLimit = require('express-rate-limit');
const helmet = require('helmet');

const STATIC_ASSET_PATTERN = /\.(?:css|js|mjs|png|jpg|jpeg|webp|gif|svg|ico|mp4|webm|woff|woff2|ttf|map)$/i;

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

  app.use(
    helmet({
      contentSecurityPolicy: false,
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
}

module.exports = {
  configureSecurity,
  createCorsOptions,
  isAllowedOrigin
};
