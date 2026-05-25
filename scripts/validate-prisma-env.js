const path = require('path');

const dotenv = require('dotenv');

dotenv.config({ path: path.resolve(__dirname, '..', '.env'), quiet: true });

function isLocalHost(hostname) {
  return ['localhost', '127.0.0.1', '::1'].includes(String(hostname || '').toLowerCase());
}

function sanitizeUrl(parsed) {
  const isPrismaPostgres = parsed.protocol === 'prisma+postgres:';

  return {
    protocol: parsed.protocol.replace(':', ''),
    host: parsed.hostname,
    port: parsed.port || 'default',
    database: isPrismaPostgres ? 'managed-by-prisma-postgres' : parsed.pathname.replace(/^\/+/, '') || 'missing',
    username: isPrismaPostgres ? 'managed-by-prisma-postgres' : parsed.username ? 'configured' : 'missing',
    password: isPrismaPostgres ? 'managed-by-prisma-postgres' : parsed.password ? 'configured' : 'missing',
    apiKey: isPrismaPostgres ? parsed.searchParams.has('api_key') ? 'configured' : 'missing' : 'not-used',
    sslmode: parsed.searchParams.get('sslmode') || 'not-set'
  };
}

function validatePrismaEnvironment(env = process.env) {
  const databaseUrl = env.DATABASE_URL;
  const isProduction = env.NODE_ENV === 'production' || env.APP_ENV === 'production';
  const allowLocal = String(env.ALLOW_LOCAL_DATABASE_URL || '').toLowerCase() === 'true';
  const errors = [];
  const warnings = [];
  let parsed = null;

  if (!databaseUrl) {
    errors.push('DATABASE_URL is required');
  } else {
    try {
      parsed = new URL(databaseUrl);
    } catch {
      errors.push('DATABASE_URL must be a valid PostgreSQL connection URL');
    }
  }

  if (parsed) {
    const isDirectPostgres = ['postgresql:', 'postgres:'].includes(parsed.protocol);
    const isPrismaPostgres = parsed.protocol === 'prisma+postgres:';

    if (!isDirectPostgres && !isPrismaPostgres) {
      errors.push('DATABASE_URL must use postgresql://, postgres://, or prisma+postgres://');
    }

    if (isDirectPostgres && !parsed.username) {
      errors.push('DATABASE_URL must include a database username');
    }

    if (isDirectPostgres && !parsed.password) {
      warnings.push('DATABASE_URL has no password; verify this is intentional for the target database');
    }

    if (isPrismaPostgres && !parsed.searchParams.has('api_key')) {
      errors.push('prisma+postgres DATABASE_URL must include api_key in the query string');
    }

    if (!parsed.hostname) {
      errors.push('DATABASE_URL must include a host');
    }

    if (isDirectPostgres && (!parsed.pathname || parsed.pathname === '/')) {
      errors.push('DATABASE_URL must include a database name');
    }

    if (isProduction && isLocalHost(parsed.hostname) && !allowLocal) {
      errors.push('production DATABASE_URL must not point at localhost unless ALLOW_LOCAL_DATABASE_URL=true');
    }

    if (isProduction && !isLocalHost(parsed.hostname) && !parsed.searchParams.get('sslmode')) {
      warnings.push('production DATABASE_URL should normally set sslmode=require or the provider-required TLS option');
    }
  }

  if (errors.length > 0) {
    const error = new Error(errors.join('; '));
    error.validation = { errors, warnings, summary: parsed ? sanitizeUrl(parsed) : null };
    throw error;
  }

  return {
    status: 'ok',
    warnings,
    summary: parsed ? sanitizeUrl(parsed) : null
  };
}

if (require.main === module) {
  try {
    console.log(JSON.stringify(validatePrismaEnvironment(), null, 2));
  } catch (error) {
    if (error.validation) {
      console.error(JSON.stringify({ status: 'failed', ...error.validation }, null, 2));
    } else {
      console.error(error.message || String(error));
    }
    process.exit(1);
  }
}

module.exports = {
  validatePrismaEnvironment
};
