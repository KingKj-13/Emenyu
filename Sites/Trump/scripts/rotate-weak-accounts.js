// Credential remediation — rotate weak / known-compromised account passwords.
//
// Detects weak passwords (shared denylist) in BOTH PostgreSQL and the JSON
// fallback, then rotates each affected account to a fresh strong secret in BOTH
// stores (kept in lockstep so a Postgres outage cannot resurrect weak fallback
// credentials) and invalidates existing sessions. This is an operator tool: it
// bypasses the role-based management checks so it can rotate owner accounts too.
//
//   node scripts/rotate-weak-accounts.js              # dry run — list what WOULD rotate
//   node scripts/rotate-weak-accounts.js --apply       # perform the rotation
//   node scripts/rotate-weak-accounts.js --apply --show # also print the new secrets to stdout
//
// New secrets are written to a gitignored file under backups/ (path printed).
// They are not recoverable afterwards — distribute them to staff, then rotate
// again from the admin console if you prefer per-user chosen passwords.

const path = require('path');
const fs = require('fs');
const crypto = require('crypto');

const dotenv = require('dotenv');

dotenv.config({ path: path.resolve(__dirname, '..', '.env'), quiet: true });

const { createConfig } = require('../server/utils/helpers');
const { createLogger } = require('../server/utils/logger');
const { AccountService, hashPassword, verifyPasswordHash } = require('../server/services/accountService');
const { findWeakMatch, isWeakPassword } = require('../server/utils/weakPasswords');

function strongPassword(bytes = 18) {
  let candidate;
  do {
    candidate = crypto.randomBytes(bytes).toString('base64url');
  } while (isWeakPassword(candidate));
  return candidate;
}

function readJsonAccounts(file) {
  try {
    const parsed = JSON.parse(fs.readFileSync(file, 'utf8'));
    return Array.isArray(parsed.accounts) ? parsed.accounts : [];
  } catch {
    return [];
  }
}

async function main() {
  const apply = process.argv.includes('--apply');
  const show = process.argv.includes('--show');

  const config = createConfig(path.resolve(__dirname, '..'));
  const logger = createLogger({ ...config, logging: { level: 'warn' } });
  const accountService = new AccountService(config, { logger });

  const jsonAccounts = readJsonAccounts(config.files.accounts);
  const jsonByUser = new Map(jsonAccounts.map(account => [account.username, account]));
  const pgAccounts = await accountService.prismaAuth.listUsers();
  const pgByUser = new Map(pgAccounts.map(account => [account.username, account]));

  const usernames = [...new Set([...jsonByUser.keys(), ...pgByUser.keys()])].sort();
  const weak = [];
  for (const username of usernames) {
    const pg = pgByUser.get(username);
    const js = jsonByUser.get(username);
    const pgWeak = pg && pg.passwordHash ? findWeakMatch(pg.passwordHash, verifyPasswordHash) : null;
    const jsWeak = js && js.passwordHash ? findWeakMatch(js.passwordHash, verifyPasswordHash) : null;
    if (pgWeak || jsWeak) {
      weak.push({
        username,
        role: (pg || js).role,
        status: (pg && pg.status) || (js && js.status) || 'active',
        inPostgres: Boolean(pg),
        inJson: Boolean(js),
        matched: pgWeak || jsWeak
      });
    }
  }

  if (weak.length === 0) {
    console.log('No weak accounts found — nothing to rotate.');
    await accountService.close();
    process.exit(0);
  }

  console.log(`Weak accounts detected: ${weak.length}`);
  weak.forEach(entry => {
    const stores = [entry.inPostgres ? 'postgres' : null, entry.inJson ? 'json' : null].filter(Boolean).join('+');
    console.log(`  - ${entry.username.padEnd(16)} [${entry.role}, ${entry.status}] stores: ${stores} (matched "${entry.matched}")`);
  });

  if (!apply) {
    console.log('\nDry run only. Re-run with --apply to rotate these credentials.');
    await accountService.close();
    process.exit(0);
  }

  const now = Date.now();
  const nowIso = new Date(now).toISOString();
  const rotated = [];

  for (const entry of weak) {
    const newPassword = strongPassword();
    const newHash = hashPassword(newPassword);

    if (entry.inPostgres) {
      await accountService.prismaAuth.updateUser(entry.username, {
        passwordHash: newHash,
        sessionInvalidBefore: now
      });
    }

    if (entry.inJson) {
      const account = jsonByUser.get(entry.username);
      account.passwordHash = newHash;
      account.updatedAt = nowIso;
      account.sessionInvalidBefore = now;
    }

    rotated.push({ username: entry.username, role: entry.role, password: newPassword });
  }

  // Persist JSON changes atomically via the same writer the service uses.
  await accountService.writeAccounts(jsonAccounts);
  await accountService.close();

  // Write secrets to a gitignored file (backups/ is ignored in .gitignore).
  const outDir = path.resolve(__dirname, '..', 'backups');
  fs.mkdirSync(outDir, { recursive: true });
  const outFile = path.join(outDir, `phase1.1-rotated-credentials-${nowIso.replace(/[:.]/g, '-')}.txt`);
  const lines = [
    `Trump credential rotation — ${nowIso}`,
    'Store securely and distribute to staff. These secrets are NOT recoverable later.',
    '-'.repeat(64),
    ...rotated.map(item => `${item.username.padEnd(16)} [${item.role.padEnd(8)}]  ${item.password}`),
    ''
  ];
  fs.writeFileSync(outFile, lines.join('\n'), { mode: 0o600 });

  console.log(`\nRotated ${rotated.length} account(s) in postgres + json. Sessions invalidated.`);
  console.log(`Secrets written to (gitignored):\n  ${outFile}`);
  if (show) {
    console.log('\n' + lines.join('\n'));
  } else {
    console.log('(re-run with --show to also print the secrets here)');
  }

  process.exit(0);
}

main().catch(error => {
  console.error(error && error.message ? error.message : String(error));
  process.exit(2);
});
