const LEVELS = {
  debug: 10,
  info: 20,
  warn: 30,
  error: 40,
  fatal: 50
};

const REDACTED_KEYS = new Set([
  'authorization',
  'apikey',
  'apiKey',
  'cookie',
  'password',
  'passwordHash',
  'secret',
  'sessionSecret',
  'token'
]);

function normalizeLevel(level) {
  const clean = String(level || '').toLowerCase();
  return LEVELS[clean] ? clean : 'info';
}

function serializeError(error) {
  if (!error) {
    return null;
  }

  return {
    name: error.name || 'Error',
    message: error.message || String(error),
    stack: error.stack || null,
    statusCode: error.statusCode || error.status || null
  };
}

function redact(value) {
  if (value instanceof Error) {
    return serializeError(value);
  }

  if (Array.isArray(value)) {
    return value.map(item => redact(item));
  }

  if (!value || typeof value !== 'object') {
    return value;
  }

  return Object.entries(value).reduce((out, [key, item]) => {
    const cleanKey = key.toLowerCase();
    out[key] = REDACTED_KEYS.has(cleanKey) ||
      cleanKey.includes('password') ||
      cleanKey.includes('secret') ||
      cleanKey.includes('token') ||
      (cleanKey.includes('api') && cleanKey.includes('key'))
      ? '[redacted]'
      : redact(item);
    return out;
  }, {});
}

function createLogger(config = {}) {
  const minLevel = normalizeLevel(config.logging?.level || process.env.LOG_LEVEL || 'info');
  const base = {
    app: config.appName || 'emenuy-trump',
    env: config.env || process.env.NODE_ENV || 'development',
    restaurantId: config.restaurantId || 'trump'
  };

  function write(level, event, fields = {}) {
    if (LEVELS[level] < LEVELS[minLevel]) {
      return;
    }

    const payload = redact({
      ts: new Date().toISOString(),
      level,
      event,
      pid: process.pid,
      ...base,
      ...fields
    });
    const line = JSON.stringify(payload);

    if (LEVELS[level] >= LEVELS.error) {
      console.error(line);
      return;
    }

    console.log(line);
  }

  return {
    debug(event, fields) {
      write('debug', event, fields);
    },
    info(event, fields) {
      write('info', event, fields);
    },
    warn(event, fields) {
      write('warn', event, fields);
    },
    error(event, fields) {
      write('error', event, fields);
    },
    fatal(event, fields) {
      write('fatal', event, fields);
    }
  };
}

module.exports = {
  createLogger,
  serializeError
};
