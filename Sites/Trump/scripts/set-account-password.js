// One-off operator tool — set a SPECIFIC chosen password on an EXISTING
// account, in both Postgres and the JSON fallback (kept in lockstep, same
// as rotate-weak-accounts.js), and invalidate existing sessions so the
// change takes effect immediately rather than only on next natural login.
//
// Unlike rotate-weak-accounts.js, this does NOT reject weak passwords --
// it's for an operator deliberately choosing a specific password (e.g. for
// a demo/testing account), not for remediating a compromised one. It also
// does not seed a NEW account -- the account must already exist; if it
// doesn't, this errors out rather than silently creating one.
//
//   node scripts/set-account-password.js --env <path-to-.env> <username> <newPassword>
//
// Example (run from the tenant's own directory so --env can be relative):
//   node ../Trump/scripts/set-account-password.js --env ./.env carmella-admin 123456789

const path = require('path');
const fs = require('fs');
const dotenv = require('dotenv');

function parseArgs(argv) {
  const args = { _: [] };
  for (let i = 0; i < argv.length; i += 1) {
    if (argv[i] === '--env') { args.env = argv[i + 1]; i += 1; }
    else args._.push(argv[i]);
  }
  return args;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const [username, newPassword] = args._;

  if (!args.env || !username || !newPassword) {
    console.error('Usage: node set-account-password.js --env <path-to-.env> <username> <newPassword>');
    process.exit(1);
  }

  const envPath = path.resolve(args.env);
  if (!fs.existsSync(envPath)) {
    console.error(`Env file not found: ${envPath}`);
    process.exit(1);
  }
  // Same pattern Sites/Carmella/server.js uses: load the TENANT's own .env
  // before requiring anything from Trump's server tree, so Trump's own
  // loadEnvironment() (dotenv's default "don't overwrite an existing var")
  // can't silently override it with Trump's own values.
  dotenv.config({ path: envPath, quiet: true });

  const { createConfig } = require('../server/utils/helpers');
  const { createLogger } = require('../server/utils/logger');
  const { AccountService, hashPassword } = require('../server/services/accountService');

  const config = createConfig(path.resolve(__dirname, '..'));
  const logger = createLogger({ ...config, logging: { level: 'warn' } });
  const accountService = new AccountService(config, { logger });

  const cleanUsername = username.trim().toLowerCase();
  const pgAccount = await accountService.prismaAuth.findUser(cleanUsername).catch(() => null);
  const jsonAccounts = await accountService.getAccounts();
  const jsonAccount = jsonAccounts.find(a => a.username === cleanUsername);

  if (!pgAccount && !jsonAccount) {
    console.error(`Account "${cleanUsername}" does not exist in Postgres or the JSON fallback for this env (restaurantId: ${config.restaurantId}). Refusing to create a new one -- use the admin console for that.`);
    await accountService.close();
    process.exit(1);
  }

  const now = Date.now();
  const nowIso = new Date(now).toISOString();
  const newHash = hashPassword(newPassword);

  if (pgAccount) {
    await accountService.prismaAuth.updateUser(cleanUsername, {
      passwordHash: newHash,
      sessionInvalidBefore: now
    });
    console.log(`Postgres: updated "${cleanUsername}" (role: ${pgAccount.role}), sessions invalidated.`);
  }

  if (jsonAccount) {
    jsonAccount.passwordHash = newHash;
    jsonAccount.updatedAt = nowIso;
    jsonAccount.sessionInvalidBefore = now;
    await accountService.writeAccounts(jsonAccounts);
    console.log(`JSON fallback: updated "${cleanUsername}".`);
  }

  await accountService.close();
  console.log(`Done. restaurantId=${config.restaurantId}, account="${cleanUsername}" now uses the requested password.`);
  process.exit(0);
}

main().catch(error => {
  console.error(error && error.message ? error.message : String(error));
  process.exit(2);
});
