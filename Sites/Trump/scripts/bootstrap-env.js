const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

const envPath = path.resolve(__dirname, '..', '.env');

function randomSecret(bytes = 36) {
  return crypto.randomBytes(bytes).toString('base64url');
}

function parseEnv(raw) {
  const map = new Map();
  raw.split(/\r?\n/).forEach(line => {
    const match = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=(.*)$/);
    if (match) {
      map.set(match[1], match[2]);
    }
  });
  return map;
}

function main() {
  const raw = fs.existsSync(envPath) ? fs.readFileSync(envPath, 'utf8') : '';
  const lines = raw.split(/\r?\n/);
  const env = parseEnv(raw);
  const updated = [];

  function ensure(key, value, options = {}) {
    const fillBlank = Boolean(options.fillBlank);
    if (!env.has(key) || (fillBlank && String(env.get(key) || '').trim() === '')) {
      lines.push(`${key}=${value}`);
      env.set(key, value);
      updated.push(key);
    }
  }

  if (raw.trim() && !raw.endsWith('\n')) {
    lines.push('');
  }

  ensure('TRUMP_APP_NAME', 'emenuy-trump');
  ensure('TRUMP_RESTAURANT_ID', 'trump');
  ensure('TRUMP_PUBLIC_BASE_PATH', '/Trump');
  ensure('TRUMP_PUBLIC_ORIGIN', 'http://127.0.0.1:3012');
  ensure('TRUMP_ALLOWED_ORIGINS', 'http://127.0.0.1:3012,http://localhost:3012');
  ensure('TRUMP_TRUST_PROXY', 'true');
  ensure('TRUMP_HSTS_ENABLED', 'true');
  ensure('TRUMP_FORCE_HTTPS', 'false');
  ensure('TRUMP_SESSION_SECRET', randomSecret(48), { fillBlank: true });
  ensure('TRUMP_SESSION_COOKIE_NAME', 'trump_session');
  ensure('TRUMP_SESSION_TTL_HOURS', '12');
  ensure('TRUMP_OWNER_USER', 'owner');
  ensure('TRUMP_OWNER_PASS', randomSecret(24), { fillBlank: true });
  ensure('TRUMP_ADMIN_PASS', randomSecret(24), { fillBlank: true });
  ensure('TRUMP_MANAGER_USER', 'manager');
  ensure('TRUMP_MANAGER_PASS', randomSecret(24), { fillBlank: true });
  ensure('TRUMP_WAITER_USER', 'waiter');
  ensure('TRUMP_WAITER_PASS', randomSecret(24), { fillBlank: true });
  ensure('TRUMP_RATE_LIMIT_WINDOW_MS', '900000');
  ensure('TRUMP_RATE_LIMIT_MAX', '600');
  ensure('TRUMP_AUTH_RATE_LIMIT_MAX', '20');
  ensure('TRUMP_BODY_LIMIT', '2mb');
  ensure('TRUMP_URLENCODED_LIMIT', '1mb');
  ensure('TRUMP_UPLOAD_MAX_MB', '25');
  ensure('TRUMP_UPLOAD_MIME_TYPES', 'image/jpeg,image/png,image/webp,image/gif,video/mp4,video/webm');
  ensure('TRUMP_UPLOAD_EXTENSIONS', '.jpg,.jpeg,.png,.webp,.gif,.mp4,.webm');
  ensure('TRUMP_STATIC_CACHE_SECONDS', '604800');
  ensure('TRUMP_COMPRESSION_THRESHOLD_BYTES', '1024');
  ensure('LOG_LEVEL', 'info');

  fs.writeFileSync(envPath, `${lines.filter((line, index) => index < lines.length - 1 || line !== '').join('\n')}\n`);

  console.log(
    JSON.stringify(
      {
        status: 'ok',
        updated,
        preservedCount: env.size - updated.length
      },
      null,
      2
    )
  );
}

main();
