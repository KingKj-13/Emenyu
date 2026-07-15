const path = require('path');

const categoryClassifier = require('../services/categoryClassifier');

const RESTAURANT_ID = process.env.TRUMP_RESTAURANT_ID || 'trump';
const PUBLIC_BASE_PATH = process.env.TRUMP_PUBLIC_BASE_PATH || '/Trump';

function parseInteger(value, fallback) {
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function parseFloatOr(value, fallback) {
  const parsed = Number.parseFloat(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function parseBoolean(value, fallback = false) {
  if (value === undefined || value === null || value === '') {
    return fallback;
  }

  return ['1', 'true', 'yes', 'on'].includes(String(value).trim().toLowerCase());
}

function parseList(value) {
  return String(value || '')
    .split(',')
    .map(item => item.trim())
    .filter(Boolean);
}

function normalizeExtension(value) {
  const clean = String(value || '').trim().toLowerCase();
  if (!clean) {
    return '';
  }

  return clean.startsWith('.') ? clean : `.${clean}`;
}

function normalizeBasePath(value) {
  const raw = String(value || '').trim();
  if (!raw || raw === '/') {
    return '';
  }

  return `/${raw.replace(/^\/+|\/+$/g, '')}`;
}

// Most routes need to answer at the bare path (local/dev with no prefix), the
// tenant's real public base path, and that base path lower-cased (some proxies/
// clients hit it lower-case). This used to be re-implemented per-file as a local
// alias(p) function or an inline literal array hardcoding "/Trump"/"trump" —
// config.publicBasePath was computed but silently ignored. tenantPaths() is the
// single source of truth so a tenant's own publicBasePath (e.g. "/Carmella")
// actually drives routing instead of every tenant secretly answering at /Trump.
// Pass { includeBare: false } for mounts that must only answer under the
// tenant prefix (e.g. the client build's static assets, historically NOT
// served at bare '/' — only the media dir and API/HTML routes were).
function tenantPaths(config, routePath, { includeBare = true } = {}) {
  const suffix = routePath === '/' ? '' : routePath;
  const base = config.publicBasePath || '';
  const lower = base.toLowerCase();
  const paths = includeBare ? [`${suffix || '/'}`] : [];
  if (base) {
    paths.push(`${base}${suffix}`);
    if (lower !== base) {
      paths.push(`${lower}${suffix}`);
    }
  }
  return paths;
}

function validateProductionConfig(config, env) {
  const issues = [];

  if (config.uploads.maxFileSizeBytes <= 0) {
    issues.push('TRUMP_UPLOAD_MAX_MB must be greater than zero');
  }

  if (config.uploads.allowedMimeTypes.length === 0) {
    issues.push('TRUMP_UPLOAD_MIME_TYPES must include at least one MIME type');
  }

  if (config.uploads.allowedExtensions.length === 0) {
    issues.push('TRUMP_UPLOAD_EXTENSIONS must include at least one extension');
  }

  if (
    config.security.rateLimitWindowMs <= 0 ||
    config.security.generalRateLimitMax <= 0 ||
    config.security.authRateLimitMax <= 0 ||
    config.security.publicWriteRateLimitMax <= 0 ||
    config.security.chatRateLimitMax <= 0
  ) {
    issues.push('rate limit values must be greater than zero');
  }

  if (config.order.vatRate < 0 || config.order.serviceRate < 0 || config.order.maxTipMultiple < 0) {
    issues.push('TRUMP_VAT_RATE, TRUMP_SERVICE_RATE, and TRUMP_ORDER_MAX_TIP_MULTIPLE must be zero or greater');
  }

  if (config.order.maxItemQty <= 0 || config.order.maxLines <= 0 || config.order.maxTotalQty <= 0) {
    issues.push('order quantity limits (TRUMP_ORDER_MAX_*) must be greater than zero');
  }

  if (issues.length > 0) {
    throw new Error(`[config] Invalid runtime configuration: ${issues.join('; ')}.`);
  }

  if (!config.isProduction) {
    return;
  }

  const missing = [];
  const weak = [];

  if (!env.TRUMP_PUBLIC_ORIGIN && parseList(env.TRUMP_ALLOWED_ORIGINS).length === 0) {
    missing.push('TRUMP_PUBLIC_ORIGIN or TRUMP_ALLOWED_ORIGINS');
  }

  if (config.publicOrigin && /example|localhost\.localdomain/i.test(config.publicOrigin)) {
    weak.push('TRUMP_PUBLIC_ORIGIN must be replaced with the real production origin');
  }

  const insecureProductionOrigins = config.security.allowedOrigins.filter(origin => {
    if (!/^http:\/\//i.test(origin)) {
      return false;
    }

    return !/^http:\/\/(?:localhost|127\.0\.0\.1)(?::\d+)?$/i.test(origin);
  });
  if (insecureProductionOrigins.length > 0 && !parseBoolean(env.TRUMP_ALLOW_INSECURE_PRODUCTION_ORIGIN, false)) {
    weak.push('production origins must use https unless explicitly allowed for a private test environment');
  }

  // No accounts/passwords exist in carmella-production (admin access is
  // deliberately unauthenticated by product decision — see root task spec),
  // so there is nothing to validate here.

  if (missing.length > 0 || weak.length > 0) {
    throw new Error(
      `[config] Refusing to start production without required secure configuration. Missing: ${[
        ...new Set(missing)
      ].join(', ') || 'none'}. Issues: ${weak.join(', ') || 'none'}.`
    );
  }
}

function createConfig(baseDir = path.resolve(__dirname, '..', '..')) {
  const env = process.env;
  const nodeEnv = env.NODE_ENV || 'development';
  const isProduction = nodeEnv === 'production';
  const port = parseInteger(env.TRUMP_PORT || env.PORT, 3012);
  const publicBasePath = normalizeBasePath(PUBLIC_BASE_PATH) || '/Trump';
  const publicOrigin = env.TRUMP_PUBLIC_ORIGIN || '';
  const allowedOrigins = [...new Set([
    ...parseList(env.TRUMP_ALLOWED_ORIGINS),
    publicOrigin
  ].filter(Boolean))];

  const directories = {
    base: baseDir,
    server: path.join(baseDir, 'server'),
    food: path.join(baseDir, 'food'),
    data: path.join(baseDir, 'data'),
    uploads: path.join(baseDir, 'uploads'),
    // Overridable so a second tenant process can serve Trump's real client
    // build / Images / Video read-only instead of duplicating them on disk
    // (see Sites/Demo). Both default to baseDir-relative, i.e. today's paths.
    clientDist: env.TRUMP_CLIENT_DIST_DIR
      ? path.resolve(baseDir, env.TRUMP_CLIENT_DIST_DIR)
      : path.join(baseDir, 'client', 'dist'),
    media: env.TRUMP_MEDIA_DIR ? path.resolve(baseDir, env.TRUMP_MEDIA_DIR) : baseDir
  };

  const config = {
    appName: env.TRUMP_APP_NAME || 'emenuy-trump',
    env: nodeEnv,
    isProduction,
    restaurantId: RESTAURANT_ID,
    publicBasePath,
    publicOrigin,
    tableCount: parseInteger(env.TRUMP_TABLE_COUNT, 30),
    brandName: env.TRUMP_BRAND_NAME || 'Trump',
    host: env.TRUMP_HOST || env.HOST || '0.0.0.0',
    port,
    http: {
      bodyLimit: env.TRUMP_BODY_LIMIT || '2mb',
      urlEncodedLimit: env.TRUMP_URLENCODED_LIMIT || '1mb',
      shutdownTimeoutMs: parseInteger(env.TRUMP_SHUTDOWN_TIMEOUT_MS, 10000)
    },
    logging: {
      level: env.LOG_LEVEL || (isProduction ? 'info' : 'debug')
    },
    security: {
      allowedOrigins,
      authRateLimitMax: parseInteger(env.TRUMP_AUTH_RATE_LIMIT_MAX, 20),
      // Phase 05A — validated production limits. A whole restaurant shares ONE NAT/Wi-Fi
      // IP, so per-IP ceilings must fit per-restaurant traffic, not per-person. Measured
      // need: ~20 order submits/min + ~200 requests/min per restaurant at peak.
      // Order POSTs: 300 / 15 min = 20/min. (was 60 — throttled a busy restaurant.)
      publicWriteRateLimitMax: parseInteger(env.TRUMP_PUBLIC_WRITE_RATE_LIMIT_MAX, isProduction ? 300 : 1000),
      chatRateLimitMax: parseInteger(env.TRUMP_CHAT_RATE_LIMIT_MAX, isProduction ? 120 : 1000),
      compressionThresholdBytes: parseInteger(env.TRUMP_COMPRESSION_THRESHOLD_BYTES, 1024),
      corsCredentials: true,
      csp: {
        enabled: parseBoolean(env.TRUMP_CSP_ENABLED, true),
        reportOnly: parseBoolean(env.TRUMP_CSP_REPORT_ONLY, false)
      },
      forceHttps: parseBoolean(env.TRUMP_FORCE_HTTPS, false),
      // General per-IP: 3000 / 15 min = 200/min/restaurant (was 600 — see above). Static
      // assets + health are already skipped, so this counts API calls only.
      generalRateLimitMax: parseInteger(env.TRUMP_RATE_LIMIT_MAX, isProduction ? 3000 : 2000),
      // Phase 05 — TEMPORARY, REMOVABLE load-test bypass. Default OFF. When set, the
      // rate limiters skip (so a controlled capacity test from one IP isn't throttled).
      // MUST NEVER be enabled in production; a startup warning is logged if it is.
      loadTestBypass: parseBoolean(env.TRUMP_LOAD_TEST_BYPASS, false),
      hsts: isProduction && parseBoolean(env.TRUMP_HSTS_ENABLED, true),
      rateLimitWindowMs: parseInteger(env.TRUMP_RATE_LIMIT_WINDOW_MS, 15 * 60 * 1000),
      secureCookies: isProduction || parseBoolean(env.TRUMP_SECURE_COOKIES, false),
      trustProxy: parseBoolean(env.TRUMP_TRUST_PROXY, isProduction)
    },
    order: {
      vatRate: parseFloatOr(env.TRUMP_VAT_RATE, 0.15),
      serviceRate: parseFloatOr(env.TRUMP_SERVICE_RATE, 0.05),
      maxItemQty: parseInteger(env.TRUMP_ORDER_MAX_ITEM_QTY, 50),
      maxLines: parseInteger(env.TRUMP_ORDER_MAX_LINES, 100),
      maxTotalQty: parseInteger(env.TRUMP_ORDER_MAX_TOTAL_QTY, 300),
      maxTipMultiple: parseFloatOr(env.TRUMP_ORDER_MAX_TIP_MULTIPLE, 2),
      rejectOnPriceMismatch: parseBoolean(env.TRUMP_ORDER_REJECT_ON_PRICE_MISMATCH, false)
    },
    reco: {
      maxBeverages: parseInteger(env.TRUMP_RECO_MAX_BEVERAGES, 1),
      enforceStage: parseBoolean(env.TRUMP_RECO_ENFORCE_STAGE, true),
      rotation: {
        scope: env.TRUMP_RECO_ROTATION_SCOPE || 'session',
        bucket: env.TRUMP_RECO_ROTATION_BUCKET || 'day',
        pool: parseInteger(env.TRUMP_RECO_ROTATION_POOL, 5)
      }
    },
    staticAssets: {
      cacheSeconds: parseInteger(env.TRUMP_STATIC_CACHE_SECONDS, isProduction ? 7 * 24 * 60 * 60 : 0)
    },
    uploads: {
      maxFileSizeBytes: parseInteger(env.TRUMP_UPLOAD_MAX_MB, 25) * 1024 * 1024,
      // No video uploads by product decision (see root task spec) — images only.
      allowedMimeTypes: parseList(env.TRUMP_UPLOAD_MIME_TYPES || 'image/jpeg,image/png,image/webp,image/gif')
        .map(value => value.toLowerCase()),
      allowedExtensions: parseList(env.TRUMP_UPLOAD_EXTENSIONS || '.jpg,.jpeg,.png,.webp,.gif')
        .map(normalizeExtension)
        .filter(Boolean)
    },
    directories
  };

  validateProductionConfig(config, env);

  return config;
}

// carmella-production has no login, no accounts, no sessions — the product
// decision (see root task spec) is that the admin panel is reachable by
// anyone who has its URL. adminAuth exists only so route files keep a
// consistent, readable "this is an admin-surface route" marker; it is a
// no-op that always allows the request through.
function createAdminAuth() {
  return function adminAuth(req, res, next) {
    req.user = { username: 'admin', role: 'owner', label: 'Admin', status: 'active' };
    return next();
  };
}

function normalizeId(raw) {
  if (!raw) {
    return 'unknown';
  }

  return raw.toString().toLowerCase().replace(/[^a-z0-9]/g, '');
}

function getCanonicalTableId(raw) {
  const cleanId = normalizeId(raw);

  if (/^\d+$/.test(cleanId)) {
    return `table${cleanId}`;
  }

  return cleanId;
}

function getTableAliases(raw) {
  const cleanId = normalizeId(raw);
  const aliases = new Set([cleanId]);

  if (/^\d+$/.test(cleanId)) {
    aliases.add(`table${cleanId}`);
  }

  const tableNumber = cleanId.match(/^table(\d+)$/);
  if (tableNumber) {
    aliases.add(tableNumber[1]);
  }

  return [...aliases];
}

function normalizeName(raw) {
  if (!raw) {
    return '';
  }

  return raw.toString().toLowerCase().replace(/[^a-z0-9]/g, '');
}

// Delegates to the single authoritative classifier (server/services/categoryClassifier.js).
// Kept as a thin wrapper so the many existing importers of getCategoryType are unchanged.
function getCategoryType(categoryName) {
  return categoryClassifier.categoryType(categoryName);
}

function safeFileName(raw) {
  return path.basename(String(raw || ''));
}

function tableIdFromFilename(filename) {
  const parts = String(filename || '').split('_');
  return parts.length >= 3 ? normalizeId(parts[2]) : 'unknown';
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

module.exports = {
  createAdminAuth,
  createConfig,
  getCanonicalTableId,
  getCategoryType,
  getTableAliases,
  normalizeId,
  normalizeName,
  safeFileName,
  sleep,
  tableIdFromFilename,
  tenantPaths
};
