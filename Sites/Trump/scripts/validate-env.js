const path = require('path');

const dotenv = require('dotenv');

dotenv.config({ path: path.resolve(__dirname, '..', '.env'), quiet: true });

const { createConfig } = require('../server/utils/helpers');

function maskBoolean(value) {
  return value ? 'configured' : 'missing';
}

try {
  const config = createConfig(path.resolve(__dirname, '..'));
  const summary = {
    appName: config.appName,
    env: config.env,
    host: config.host,
    port: config.port,
    publicBasePath: config.publicBasePath,
    publicOrigin: maskBoolean(config.publicOrigin),
    allowedOriginsCount: config.security.allowedOrigins.length,
    secureCookies: config.security.secureCookies,
    trustProxy: config.security.trustProxy,
    forceHttps: config.security.forceHttps,
    hsts: config.security.hsts,
    sessionSecret: maskBoolean(config.auth.sessionSecret),
    sessionCookieSameSite: config.auth.sessionCookieSameSite,
    sessionTtlHours: Math.round(config.auth.sessionTtlMs / (1000 * 60 * 60)),
    uploadMaxMb: Math.round(config.uploads.maxFileSizeBytes / (1024 * 1024)),
    uploadMimeTypes: config.uploads.allowedMimeTypes,
    uploadExtensions: config.uploads.allowedExtensions,
    logLevel: config.logging.level
  };

  console.log(JSON.stringify({ status: 'ok', summary }, null, 2));
} catch (error) {
  console.error(error.message || String(error));
  process.exit(1);
}
