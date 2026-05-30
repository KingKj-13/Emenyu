const path = require('path');

const RESTAURANT_ID = process.env.TRUMP_RESTAURANT_ID || 'trump';
const PUBLIC_BASE_PATH = process.env.TRUMP_PUBLIC_BASE_PATH || '/Trump';
const ADMIN_USERNAME = 'admin';
const LOCAL_ONLY_DEFAULT_PASSWORD = 'local-only-change-me';

function parseInteger(value, fallback) {
  const parsed = Number.parseInt(value, 10);
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

  if (config.security.rateLimitWindowMs <= 0 || config.security.generalRateLimitMax <= 0 || config.security.authRateLimitMax <= 0) {
    issues.push('rate limit values must be greater than zero');
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
  const demoAdminPassword = env.TRUMP_DEMO_PASSWORD || '123456789';
  const demoWaiterPassword = env.TRUMP_DEMO_PASSWORD || '123456789';
  const demoKitchenPassword = env.TRUMP_DEMO_PASSWORD || '123456789';

  const directories = {
    base: baseDir,
    server: path.join(baseDir, 'server'),
    frontend: path.join(baseDir, 'frontend'),
    food: path.join(baseDir, 'food'),
    orders: path.join(baseDir, 'orders'),
    history: path.join(baseDir, 'history'),
    tables: path.join(baseDir, 'tables'),
    data: path.join(baseDir, 'data'),
    uploads: path.join(baseDir, 'uploads')
  };

  const files = {
    deals: path.join(directories.food, 'DealOfDay.json'),
    chatLogs: path.join(directories.data, 'chat_logs.json'),
    accounts: path.join(directories.data, 'accounts.json')
  };

  const config = {
    appName: env.TRUMP_APP_NAME || 'emenuy-trump',
    env: nodeEnv,
    isProduction,
    restaurantId: RESTAURANT_ID,
    publicBasePath,
    publicOrigin,
    tableCount: parseInteger(env.TRUMP_TABLE_COUNT, 30),
    brandName: env.TRUMP_BRAND_NAME || 'Aurum & Ember',
    llm: {
      provider: (env.TRUMP_LLM_PROVIDER || '').trim().toLowerCase(),
      apiKey: env.TRUMP_LLM_API_KEY || '',
      model: env.TRUMP_LLM_MODEL || 'claude-opus-4-8',
      timeoutMs: parseInteger(env.TRUMP_LLM_TIMEOUT_MS, 6000)
    },
    host: env.TRUMP_HOST || env.HOST || '0.0.0.0',
    port,
    admin: {
      username: ADMIN_USERNAME,
      password: sharedPassword
    },
    auth: {
      cookieName: env.TRUMP_SESSION_COOKIE_NAME || 'trump_session',
      sessionCookieSameSite: env.TRUMP_SESSION_SAMESITE || 'Lax',
      sessionSecret: env.TRUMP_SESSION_SECRET || env.STAGING_PASS || sharedPassword,
      sessionTtlMs: 1000 * 60 * 60 * parseInteger(env.TRUMP_SESSION_TTL_HOURS, 12),
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
          password: demoWaiterPassword,
          role: 'waiter',
          label: 'Waiter',
          demo: true,
          passwordFromEnv: false
        },
        {
          username: env.TRUMP_KITCHEN_USER || 'kitchen',
          password: demoKitchenPassword,
          role: 'kitchen',
          label: 'Kitchen',
          demo: true,
          passwordFromEnv: false
        },
        {
          username: ADMIN_USERNAME,
          password: demoAdminPassword,
          role: 'owner',
          label: 'Admin',
          demo: true,
          passwordFromEnv: false
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
      compressionThresholdBytes: parseInteger(env.TRUMP_COMPRESSION_THRESHOLD_BYTES, 1024),
      corsCredentials: true,
      forceHttps: parseBoolean(env.TRUMP_FORCE_HTTPS, false),
      generalRateLimitMax: parseInteger(env.TRUMP_RATE_LIMIT_MAX, isProduction ? 600 : 2000),
      hsts: isProduction && parseBoolean(env.TRUMP_HSTS_ENABLED, true),
      rateLimitWindowMs: parseInteger(env.TRUMP_RATE_LIMIT_WINDOW_MS, 15 * 60 * 1000),
      secureCookies: isProduction || parseBoolean(env.TRUMP_SECURE_COOKIES, false),
      trustProxy: parseBoolean(env.TRUMP_TRUST_PROXY, isProduction)
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

function parseCookies(req) {
  const header = req.headers.cookie || '';
  return header.split(';').reduce((cookies, pair) => {
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

  if (accountService) {
    return accountService.verifyCredentials(username, password);
  }

  return config.auth.users.find(user => user.username === username && user.password === password) || null;
}

function createRoleAuth(config, accountService, logger = null) {
  const crypto = require('crypto');
  const cookieName = config.auth.cookieName || 'trump_session';

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

  async function getRequestUser(req) {
    return (await getSessionUser(req)) || (await readBasicUser(req, config, accountService));
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
      res.set('WWW-Authenticate', 'Basic');
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
    async login(req, res) {
      const { username, password } = req.body || {};
      const existing = accountService ? await accountService.findAccount(username) : null;
      if (existing && existing.status === 'suspended') {
        logger?.warn('auth_login_suspended', { username });
        return res.status(403).json({ error: 'This account is suspended. Contact the owner.' });
      }

      const user = accountService
        ? await accountService.verifyCredentials(username, password)
        : config.auth.users.find(candidate => candidate.username === username && candidate.password === password);
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
      const accounts = await accountService.listForActor(req.user);
      return res.json(accounts);
    },
    async createAccount(req, res) {
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

function getCategoryType(categoryName) {
  const lower = String(categoryName || '').toLowerCase();

  if (lower.includes('starter') || lower.includes('meze') || lower.includes('tapas') || lower.includes('soup')) {
    return 'STARTER';
  }

  if (lower.includes('dessert') || lower.includes('sweet') || lower.includes('cake') || lower.includes('ice cream')) {
    return 'DESSERT';
  }

  if (
    lower.includes('wine') ||
    lower.includes('cellar') ||
    lower.includes('sparkling') ||
    lower.includes('champagne') ||
    lower.includes('red wine') ||
    lower.includes('white wine') ||
    lower.includes('rosé') ||
    lower.includes('rose wine')
  ) {
    return 'WINE';
  }

  if (
    lower.includes('drink') ||
    lower.includes('beverage') ||
    lower.includes('beer') ||
    lower.includes('coffee') ||
    lower.includes('tea') ||
    lower.includes('cocktail') ||
    lower.includes('spirit') ||
    lower.includes('liqueur')
  ) {
    return 'DRINK';
  }

  return 'MAIN';
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
  tableIdFromFilename
};
