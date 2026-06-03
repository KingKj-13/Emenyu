// Read-only credential audit.
//
// Scans every account (PostgreSQL + the JSON fallback) for weak / known-
// compromised passwords and missing password hashes, and flags any account that
// must be rotated. Exits non-zero when weak credentials are found, so it can gate
// a deploy in CI.
//
//   node scripts/audit-accounts.js          # human-readable report
//   node scripts/audit-accounts.js --json    # machine-readable JSON
//
// This script NEVER modifies accounts (it does not run the startup merge/seed).
// Rotate flagged accounts via the admin console
// (PATCH /Trump/api/auth/accounts/:username) or by re-seeding strong values from
// env and restarting. Production startup already refuses to seed weak passwords.

const path = require('path');

const dotenv = require('dotenv');

dotenv.config({ path: path.resolve(__dirname, '..', '.env'), quiet: true });

const { createConfig } = require('../server/utils/helpers');
const { createLogger } = require('../server/utils/logger');
const { AccountService, verifyPasswordHash } = require('../server/services/accountService');
const { WEAK_PASSWORDS, findWeakMatch } = require('../server/utils/weakPasswords');

function mergeAccounts(jsonAccounts, postgresAccounts) {
  const byUsername = new Map();
  (jsonAccounts || []).forEach(account => {
    if (account && account.username) {
      byUsername.set(account.username, { ...account, source: 'json' });
    }
  });
  // Postgres is authoritative — it overrides the JSON view for the same username.
  (postgresAccounts || []).forEach(account => {
    if (account && account.username) {
      byUsername.set(account.username, { ...account, source: 'postgres' });
    }
  });
  return [...byUsername.values()].sort((left, right) => left.username.localeCompare(right.username));
}

async function main() {
  const asJson = process.argv.includes('--json');
  const config = createConfig(path.resolve(__dirname, '..'));
  const logger = createLogger({ ...config, logging: { level: 'warn' } });
  const accountService = new AccountService(config, { logger });

  // Read-only access paths (no ensureReady → no seed/merge/migration writes).
  const jsonAccounts = await accountService.readAccounts();
  const postgresAccounts = await accountService.prismaAuth.listUsers();
  const accounts = mergeAccounts(jsonAccounts, postgresAccounts);

  const findings = [];
  for (const account of accounts) {
    const issues = [];
    if (!account.passwordHash) {
      issues.push('no password hash');
    } else {
      const weak = findWeakMatch(account.passwordHash, verifyPasswordHash);
      if (weak) {
        issues.push(`weak/known password ("${weak}")`);
      }
    }

    if (issues.length > 0) {
      findings.push({
        username: account.username,
        role: account.role,
        status: account.status || 'active',
        source: account.source || 'json',
        issues
      });
    }
  }

  await accountService.close();

  const adminWeak = findings.some(finding => finding.username === 'admin');
  const summary = {
    totalAccounts: accounts.length,
    postgresAvailable: postgresAccounts.length > 0,
    weakOrInsecure: findings.length,
    denylistSize: WEAK_PASSWORDS.size,
    backdoorCheck: adminWeak
      ? 'WEAK admin account detected — rotate immediately'
      : 'no weak admin/backdoor account detected',
    findings
  };

  if (asJson) {
    console.log(JSON.stringify(summary, null, 2));
  } else {
    console.log('--- Trump account credential audit ---');
    console.log(`Accounts audited : ${summary.totalAccounts} (postgres ${summary.postgresAvailable ? 'reachable' : 'unavailable — JSON only'})`);
    console.log(`Denylist entries : ${summary.denylistSize}`);
    console.log(`Backdoor check   : ${summary.backdoorCheck}`);
    if (findings.length === 0) {
      console.log('Result           : OK — no weak or missing credentials found.');
    } else {
      console.log(`Result           : ${findings.length} account(s) require rotation:`);
      for (const finding of findings) {
        console.log(`  - ${finding.username} [${finding.role}, ${finding.status}, ${finding.source}] → ${finding.issues.join('; ')}`);
      }
    }
  }

  process.exit(findings.length === 0 ? 0 : 1);
}

main().catch(error => {
  console.error(error && error.message ? error.message : String(error));
  process.exit(2);
});
