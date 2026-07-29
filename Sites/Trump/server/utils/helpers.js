const path = require('path');

const { isWeakPassword } = require('./weakPasswords');
const categoryClassifier = require('../services/categoryClassifier');

const RESTAURANT_ID = process.env.TRUMP_RESTAURANT_ID || 'trump';
const PUBLIC_BASE_PATH = process.env.TRUMP_PUBLIC_BASE_PATH || '/Trump';
// Overridable so a second tenant process (e.g. the Demo Steakhouse instance)
// doesn't collide with Trump's real "admin" account — User rows have no
// restaurantId column, so usernames must stay globally unique across tenants.
const ADMIN_USERNAME = process.env.TRUMP_ADMIN_USER || 'admin';
const LOCAL_ONLY_DEFAULT_PASSWORD = 'local-only-change-me';

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

function getSharedPassword(isProduction) {
  return (
    process.env.TRUMP_DEFAULT_PASSWORD ||
    process.env.STAGING_PASS ||
    (isProduction ? '' : LOCAL_ONLY_DEFAULT_PASSWORD)
  );
}

function validateProductionConfig(config, env) {
  const issues = [];

  if (config.auth.sessionTtlMs <= 0) {
    issues.push('TRUMP_SESSION_TTL_HOURS must be greater than zero');
  }

  if (!['Lax', 'Strict', 'None'].includes(config.auth.sessionCookieSameSite)) {
    issues.push('TRUMP_SESSION_SAMESITE must be Lax, Strict, or None');
  }

  if (config.auth.sessionCookieSameSite === 'None' && !config.security.secureCookies) {
    issues.push('TRUMP_SESSION_SAMESITE=None requires TRUMP_SECURE_COOKIES=true');
  }

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

  if (!env.TRUMP_SESSION_SECRET) {
    missing.push('TRUMP_SESSION_SECRET');
  } else if (env.TRUMP_SESSION_SECRET.length < 32) {
    weak.push('TRUMP_SESSION_SECRET must be at least 32 characters');
  }

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

  ['TRUMP_OWNER_PASS', 'TRUMP_MANAGER_PASS', 'TRUMP_WAITER_PASS'].forEach(key => {
    if (!env[key] && !env.TRUMP_DEFAULT_PASSWORD) {
      missing.push(`${key} or TRUMP_DEFAULT_PASSWORD`);
    }
  });

  if (!env.TRUMP_ADMIN_PASS && !env.TRUMP_OWNER_PASS && !env.TRUMP_DEFAULT_PASSWORD) {
    missing.push('TRUMP_ADMIN_PASS or TRUMP_OWNER_PASS or TRUMP_DEFAULT_PASSWORD');
  }

  if (!env.TRUMP_KITCHEN_PASS && !env.TRUMP_DEFAULT_PASSWORD) {
    missing.push('TRUMP_KITCHEN_PASS or TRUMP_DEFAULT_PASSWORD');
  }

  // Fail closed if any seeded account would use an empty or known-weak/demo
  // password. The denylist is centralized in utils/weakPasswords.js and shared
  // with the credential audit script.
  (config.auth.users || []).forEach(user => {
    if (!user.password) {
      missing.push(`a strong password for the "${user.username}" account`);
    } else if (isWeakPassword(user.password)) {
      weak.push(`account "${user.username}" must not use a known-weak/demo password`);
    }
  });

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
  const sharedPassword = getSharedPassword(isProduction);

  const directories = {
    base: baseDir,
    server: path.join(baseDir, 'server'),
    food: path.join(baseDir, 'food'),
    orders: path.join(baseDir, 'orders'),
    history: path.join(baseDir, 'history'),
    tables: path.join(baseDir, 'tables'),
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

  const files = {
    deals: path.join(directories.food, 'DealOfDay.json'),
    chatLogs: path.join(directories.data, 'chat_logs.json'),
    accounts: path.join(directories.data, 'accounts.json'),
    // Curated Demo Mode + future live-flippable admin settings — same
    // JSON-file pattern as DealOfDay.json, so the toggle can flip instantly
    // without a server restart (see fileService.loadSettings/saveSettings).
    settings: path.join(directories.data, 'settings.json')
  };

  const config = {
    appName: env.TRUMP_APP_NAME || 'emenuy-trump',
    env: nodeEnv,
    isProduction,
    restaurantId: RESTAURANT_ID,
    publicBasePath,
    publicOrigin,
    tableCount: parseInteger(env.TRUMP_TABLE_COUNT, 30),
    // Luxury dining tables share the same restaurant/login/order pipeline as
    // standard tables — they're just numbered in a reserved high range
    // (luxuryTableBase+1 .. luxuryTableBase+luxuryTableCount) so every place
    // that already validates "table<N> where N is 1..tableCount" needs no
    // changes; only the luxury-aware range check and the waiter UI treat
    // them differently (display as L1, L2, ... sorted to the top).
    luxuryTableCount: parseInteger(env.TRUMP_LUXURY_TABLE_COUNT, 6),
    luxuryTableBase: parseInteger(env.TRUMP_LUXURY_TABLE_BASE, 900),
    brandName: env.TRUMP_BRAND_NAME || 'Trump',
    // Phase 5 (AI Concierge): the chatbot's display name/branding. Surfaced to
    // the client via GET /api/config so the SPA never hardcodes it. This is a
    // branding string only — it carries no recommendation logic.
    assistantName: env.TRUMP_ASSISTANT_NAME || '🍷 Your Sommelier',
    // Waiter-app APK download link ("latest" GitHub release asset), surfaced to the
    // Admin UI via GET /api/config so managers can hand it to new staff on account
    // creation. See docs/final-product/phase-04b/APK-BUILD.md for the release rule.
    waiterApkUrl: env.TRUMP_WAITER_APK_URL || 'https://github.com/KingKj-13/Emenyu/releases/latest/download/trump-waiter.apk',
    // Latest waiter-app version. The native app compares its installed version to
    // this on launch and shows a dismissible "Update available" banner (linking to
    // waiterApkUrl) when older. Bump via env TRUMP_WAITER_LATEST_VERSION when you
    // publish a new APK — no code deploy needed. Keep in step with app.json version.
    waiterLatestVersion: env.TRUMP_WAITER_LATEST_VERSION || '1.0.1',
    // Persona-vs-scoring seam (AD-005): selects which NLG voice composes the
    // customer chat reply. The recommendation SCORING engine (recommendationScoring.js)
    // is unaffected by this — every persona shares it unchanged. 'template' is
    // Trump's existing Donald/Sommelier voice; 'gaspard' is Carmella's.
    assistantPersona: env.TRUMP_ASSISTANT_PERSONA || 'template',
    host: env.TRUMP_HOST || env.HOST || '0.0.0.0',
    port,
    // Sales/investor demo tenant support (Demo Steakhouse). Unset for Trump's
    // own .env, so this only ever activates on a deliberately-configured demo
    // process. When set, createRoleAuth() short-circuits every request to a
    // synthetic user with this role — no real accounts/login needed.
    demo: {
      autoLoginRole: env.TRUMP_DEMO_AUTO_LOGIN_ROLE || null,
      autoLoginUsername: env.TRUMP_DEMO_AUTO_LOGIN_USERNAME || 'demo-guest'
    },
    // Live pitch-demo mode (demo trump rule.md; Carmella's 2026-07-12 demo
    // validation report Part 9): hard-coded CHEF'S PICK chains for
    // aiService.recommend()/chat(), off by default so real diners always get
    // the real engine. TRUMP_SCRIPTED_DEMO_TABLE scopes it to one table —
    // leave unset (as here) to disable the table scope entirely, so any
    // table can trigger a chain by cart contents alone (Carmella runs this
    // way, since its six demo stories are deliberately spread across
    // different tables). Which chain set applies is decided by
    // config.restaurantId inside scriptedDemoChains.js, not by this flag.
    scriptedDemo: {
      enabled: parseBoolean(env.TRUMP_SCRIPTED_DEMO_ENABLED, false),
      tableId: env.TRUMP_SCRIPTED_DEMO_TABLE || null
    },
    admin: {
      username: ADMIN_USERNAME,
      password: sharedPassword
    },
    auth: {
      cookieName: env.TRUMP_SESSION_COOKIE_NAME || 'trump_session',
      sessionCookieSameSite: env.TRUMP_SESSION_SAMESITE || 'Lax',
      sessionSecret: env.TRUMP_SESSION_SECRET || env.STAGING_PASS || sharedPassword,
      sessionTtlMs: 1000 * 60 * 60 * parseInteger(env.TRUMP_SESSION_TTL_HOURS, 12),
      // Phase 04 — native token auth: short-lived Bearer access token + long-lived
      // DB-backed refresh token (device). Web cookie auth is unchanged.
      accessTtlMs: 1000 * 60 * parseInteger(env.TRUMP_ACCESS_TTL_MINUTES, 15),
      refreshTtlMs: 1000 * 60 * 60 * 24 * parseInteger(env.TRUMP_REFRESH_TTL_DAYS, 30),
      users: [
        {
          username: env.TRUMP_OWNER_USER || 'owner',
          password: env.TRUMP_OWNER_PASS || sharedPassword,
          role: 'owner',
          label: 'Owner'
        },
        {
          username: env.TRUMP_MANAGER_USER || 'manager',
          password: env.TRUMP_MANAGER_PASS || sharedPassword,
          role: 'manager',
          label: 'Manager'
        },
        {
          username: env.TRUMP_WAITER_USER || 'waiter',
          password: env.TRUMP_WAITER_PASS || sharedPassword,
          role: 'waiter',
          label: 'Waiter'
        },
        {
          username: env.TRUMP_KITCHEN_USER || 'kitchen',
          password: env.TRUMP_KITCHEN_PASS || sharedPassword,
          role: 'kitchen',
          label: 'Kitchen'
        },
        {
          username: ADMIN_USERNAME,
          password: env.TRUMP_ADMIN_PASS || env.TRUMP_OWNER_PASS || sharedPassword,
          role: 'owner',
          label: 'Admin'
        }
      ]
    },
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
      allowedMimeTypes: parseList(env.TRUMP_UPLOAD_MIME_TYPES || 'image/jpeg,image/png,image/webp,image/gif,video/mp4,video/webm')
        .map(value => value.toLowerCase()),
      allowedExtensions: parseList(env.TRUMP_UPLOAD_EXTENSIONS || '.jpg,.jpeg,.png,.webp,.gif,.mp4,.webm')
        .map(normalizeExtension)
        .filter(Boolean)
    },
    directories,
    files
  };

  validateProductionConfig(config, env);

  return config;
}

function parseCookieHeader(header) {
  return String(header || '').split(';').reduce((cookies, pair) => {
    const index = pair.indexOf('=');
    if (index === -1) {
      return cookies;
    }

    const key = pair.slice(0, index).trim();
    const value = pair.slice(index + 1).trim();
    if (key) {
      try {
        cookies[key] = decodeURIComponent(value);
      } catch {
        cookies[key] = value;
      }
    }

    return cookies;
  }, {});
}

function parseCookies(req) {
  return parseCookieHeader(req.headers.cookie || '');
}

function roleAllows(user, roles) {
  return Boolean(user && (!roles || roles.length === 0 || roles.includes(user.role)));
}

async function readBasicUser(req, config, accountService) {
  const authHeader = req.headers.authorization || '';
  if (!authHeader.toLowerCase().startsWith('basic ')) {
    return null;
  }

  const token = authHeader.split(' ')[1];
  if (!token) {
    return null;
  }

  const decoded = Buffer.from(token, 'base64').toString();
  const separator = decoded.indexOf(':');
  const username = separator >= 0 ? decoded.slice(0, separator) : decoded;
  const password = separator >= 0 ? decoded.slice(separator + 1) : '';

  if (!accountService) {
    return null;
  }

  return accountService.verifyCredentials(username, password);
}

function createRoleAuth(config, accountService, logger = null) {
  const crypto = require('crypto');
  const cookieName = config.auth.cookieName || 'trump_session';

  // Public demo tenant only (config.demo.autoLoginRole is unset for Trump's own
  // .env): every request/socket-handshake is treated as already authenticated,
  // so the demo admin/waiter UIs open with no login step. Real credentials/
  // accountService are never consulted on this path.
  function demoUser() {
    if (!config.demo?.autoLoginRole) {
      return null;
    }

    return {
      username: config.demo.autoLoginUsername,
      role: config.demo.autoLoginRole,
      label: 'Demo Guest',
      status: 'active'
    };
  }

  // Staff/Accounts tab for the demo tenant: `User` rows have no restaurantId
  // column (global uniqueness across every tenant sharing this DB), so the
  // demo admin's staff list is a process-local in-memory mock — it never
  // reads or writes the real Postgres `User` table, and resets on restart.
  let demoAccountsStore = null;
  function demoAccounts() {
    if (!demoAccountsStore) {
      demoAccountsStore = [
        { username: 'demo-owner', role: 'owner', label: 'Owner', status: 'active', assignedTables: [], createdBy: 'system', createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(), suspendedAt: null },
        { username: 'demo-manager', role: 'manager', label: 'Manager', status: 'active', assignedTables: [], createdBy: 'system', createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(), suspendedAt: null },
        { username: 'demo-waiter', role: 'waiter', label: 'Waiter', status: 'active', assignedTables: [], createdBy: 'system', createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(), suspendedAt: null },
        { username: 'demo-kitchen', role: 'kitchen', label: 'Kitchen', status: 'active', assignedTables: [], createdBy: 'system', createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(), suspendedAt: null }
      ];
    }
    return demoAccountsStore;
  }

  function sanitizeUser(user) {
    if (!user) {
      return null;
    }

    return accountService ? accountService.sanitizeUser(user) : {
      username: user.username,
      role: user.role,
      label: user.label || user.role,
      status: user.status || 'active'
    };
  }

  function getCookieOptions(req, maxAgeSeconds) {
    const secure = config.security.secureCookies || req.secure || req.headers['x-forwarded-proto'] === 'https';
    const parts = [
      `${cookieName}=`,
      'Path=/',
      'HttpOnly',
      `SameSite=${config.auth.sessionCookieSameSite || 'Lax'}`,
      `Max-Age=${maxAgeSeconds}`,
      'Priority=High'
    ];

    if (secure) {
      parts.push('Secure');
    }

    return parts;
  }

  function base64UrlEncode(value) {
    return Buffer.from(value).toString('base64url');
  }

  function sign(value) {
    return crypto.createHmac('sha256', config.auth.sessionSecret).update(value).digest('base64url');
  }

  function createToken(username, expiresAt) {
    const payload = base64UrlEncode(JSON.stringify({ username, issuedAt: Date.now(), expiresAt }));
    return `${payload}.${sign(payload)}`;
  }

  async function readToken(token) {
    const [payload, signature] = String(token || '').split('.');
    if (!payload || !signature) {
      return null;
    }

    const expected = sign(payload);
    const signatureBuffer = Buffer.from(signature);
    const expectedBuffer = Buffer.from(expected);
    if (signatureBuffer.length !== expectedBuffer.length || !crypto.timingSafeEqual(signatureBuffer, expectedBuffer)) {
      return null;
    }

    try {
      const parsed = JSON.parse(Buffer.from(payload, 'base64url').toString('utf-8'));
      if (!parsed.username || !parsed.expiresAt || parsed.expiresAt < Date.now()) {
        return null;
      }

      return accountService ? accountService.findActiveUser(parsed.username, parsed.issuedAt || 0) : null;
    } catch {
      return null;
    }
  }

  async function getSessionUser(req) {
    const cookies = parseCookies(req);
    const token = cookies[cookieName];
    if (!token) {
      return null;
    }

    return readToken(token);
  }

  // Phase 04 — accept a native Bearer ACCESS token (same HMAC + active-user check
  // as the cookie, so suspension / sessionInvalidBefore revoke it too).
  async function getBearerUser(req) {
    const header = req.headers.authorization || '';
    if (!header.toLowerCase().startsWith('bearer ')) {
      return null;
    }
    return readToken(header.slice(7).trim());
  }

  async function getRequestUser(req) {
    return demoUser()
      || (await getSessionUser(req))
      || (await getBearerUser(req))
      || (await readBasicUser(req, config, accountService));
  }

  function issueSession(req, res, user) {
    const expiresAt = Date.now() + config.auth.sessionTtlMs;
    const token = createToken(user.username, expiresAt);
    const maxAgeSeconds = Math.floor(config.auth.sessionTtlMs / 1000);
    const parts = getCookieOptions(req, maxAgeSeconds);
    parts[0] = `${cookieName}=${encodeURIComponent(token)}`;
    res.setHeader('Set-Cookie', parts.join('; '));
  }

  function clearSession(req, res) {
    res.setHeader('Set-Cookie', getCookieOptions(req, 0).join('; '));
  }

  function getRoleHome(role) {
    if (role === 'waiter') return `${config.publicBasePath}/Waiter`;
    if (role === 'kitchen') return `${config.publicBasePath}/Kitchen`;
    if (role === 'owner') return `${config.publicBasePath}/Owner`;
    return `${config.publicBasePath}/Admin`;
  }

  function deny(req, res, options = {}, user = null) {
    logger?.warn('auth_denied', {
      path: req.originalUrl,
      method: req.method,
      user: sanitizeUser(user),
      page: Boolean(options.page)
    });

    if (options.page) {
      if (user) {
        return res.redirect(getRoleHome(user.role));
      }

      return res.redirect(`${config.publicBasePath}/login?next=${encodeURIComponent(req.originalUrl || config.publicBasePath)}`);
    }

    if (!user) {
      // Deliberately NOT setting WWW-Authenticate: Basic here (removed
      // 2026-07-12). This app has no interactive Basic-Auth login flow --
      // every real user authenticates via the cookie-session login page
      // (the `options.page` branch above) or a Bearer token. But Express/
      // fetch don't care that a request was a silent background poll (e.g.
      // /api/notifications/unread-count, hit every ~60s) vs. a user action:
      // the moment ANY XHR/fetch response carries this header with a 401,
      // the BROWSER itself intercepts it and pops its own native
      // username/password dialog over the page -- with no way for the app
      // to suppress it. A session simply expiring mid-shift was enough to
      // trigger this on the waiter dashboard. readBasicUser() above still
      // accepts a proactively-sent `Authorization: Basic ...` header from
      // any real API client that wants to use it -- this only stops the
      // browser from being told to prompt for one.
      return res.status(401).json({ error: 'Authentication required' });
    }

    return res.status(403).json({ error: 'This account does not have permission for that action.' });
  }

  function requireRoles(roles = [], options = {}) {
    return async function roleMiddleware(req, res, next) {
      const user = await getRequestUser(req);
      if (!roleAllows(user, roles)) {
        return deny(req, res, options, user);
      }

      req.user = user;
      return next();
    };
  }

  return {
    requireRoles,
    requirePage(roles = []) {
      return requireRoles(roles, { page: true });
    },
    getRequestUser,
    // Phase 04 — mint a short-lived Bearer access token (reuses the cookie HMAC
    // format so readToken/getBearerUser validate it identically).
    createAccessToken(username, ttlMs) {
      return createToken(username, Date.now() + (ttlMs || config.auth.accessTtlMs || 900000));
    },
    // Verify a raw session token (same HMAC + active-user check as REST auth).
    // Returns the sanitized active user, or null. Used by the Socket.IO handshake.
    getUserFromToken: token => demoUser() || readToken(token),
    // Verify a session from a raw Cookie header string (Socket.IO handshake).
    async authenticateCookieHeader(cookieHeader) {
      if (demoUser()) {
        return demoUser();
      }
      const cookies = parseCookieHeader(cookieHeader);
      const token = cookies[cookieName];
      return token ? readToken(token) : null;
    },
    async login(req, res) {
      const { username, password } = req.body || {};
      const existing = accountService ? await accountService.findAccount(username) : null;
      if (existing && existing.status === 'suspended') {
        logger?.warn('auth_login_suspended', { username });
        return res.status(403).json({ error: 'This account is suspended. Contact the owner.' });
      }

      const user = accountService
        ? await accountService.verifyCredentials(username, password)
        : null;
      if (!user) {
        logger?.warn('auth_login_failed', { username });
        return res.status(401).json({ error: 'Invalid credentials' });
      }

      issueSession(req, res, user);
      logger?.info('auth_login_success', { user: sanitizeUser(user) });
      return res.json({ ok: true, user: sanitizeUser(user), defaultPath: getRoleHome(user.role) });
    },
    async logout(req, res) {
      const user = await getSessionUser(req);
      if (user && accountService) {
        await accountService.invalidateSessions(user.username);
      }

      clearSession(req, res);
      logger?.info('auth_logout', { user: sanitizeUser(user) });
      return res.json({ ok: true });
    },
    async me(req, res) {
      const user = await getRequestUser(req);
      return res.json({ user: user ? sanitizeUser(user) : null, defaultPath: user ? getRoleHome(user.role) : config.publicBasePath });
    },
    async listAccounts(req, res) {
      if (config.demo?.autoLoginRole) {
        return res.json(demoAccounts());
      }
      const accounts = await accountService.listForActor(req.user);
      return res.json(accounts);
    },
    async createAccount(req, res) {
      if (config.demo?.autoLoginRole) {
        const body = req.body || {};
        if (!body.username || !body.role) {
          return res.status(400).json({ error: 'username and role are required' });
        }
        if (demoAccounts().some(a => a.username === body.username)) {
          return res.status(409).json({ error: 'That username already exists' });
        }
        const account = {
          username: body.username, role: body.role, label: body.label || body.role, status: 'active',
          assignedTables: [], createdBy: 'demo', createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(), suspendedAt: null
        };
        demoAccounts().push(account);
        return res.status(201).json(account);
      }
      try {
        const account = await accountService.createAccount(req.user, req.body || {});
        logger?.info('auth_account_created', { actor: sanitizeUser(req.user), account });
        return res.status(201).json(account);
      } catch (error) {
        logger?.warn('auth_account_create_failed', { actor: sanitizeUser(req.user), error });
        return res.status(error.statusCode || 500).json({ error: error.message || 'Account create failed' });
      }
    },
    async updateAccount(req, res) {
      if (config.demo?.autoLoginRole) {
        const account = demoAccounts().find(a => a.username === req.params.username);
        if (!account) {
          return res.status(404).json({ error: 'Account not found' });
        }
        Object.assign(account, req.body || {}, { updatedAt: new Date().toISOString() });
        return res.json(account);
      }
      try {
        const account = await accountService.updateAccount(req.user, req.params.username, req.body || {});
        logger?.info('auth_account_updated', { actor: sanitizeUser(req.user), account });
        return res.json(account);
      } catch (error) {
        logger?.warn('auth_account_update_failed', { actor: sanitizeUser(req.user), username: req.params.username, error });
        return res.status(error.statusCode || 500).json({ error: error.message || 'Account update failed' });
      }
    }
  };
}

function createAdminAuth(config) {
  return async function adminAuth(req, res, next) {
    const user = await readBasicUser(req, config);
    if (!user || !roleAllows(user, ['owner', 'manager'])) {
      res.set('WWW-Authenticate', 'Basic');
      return res.sendStatus(401);
    }

    req.user = user;
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
  createRoleAuth,
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
