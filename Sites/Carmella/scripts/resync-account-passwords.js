#!/usr/bin/env node
'use strict';
// Password recovery for the 2026-07-12 demo login failure.
//
// Root cause: AccountService.mergeDefaultAccounts() deliberately seeds an
// account from config.auth.users (built from this tenant's own .env) only
// the FIRST time it's missing -- an existing account's password is NEVER
// reset on startup (see the comment at that call site), so a real staff
// member's manually-changed password survives restarts. That is correct
// behaviour, but it also means: if .env's TRUMP_*_PASS values are rotated
// AFTER an account already exists (which happened here -- accounts.json
// shows these five accounts were created 2026-07-10/11, and current .env
// carries different, later-rotated password values), the account's stored
// hash and the current .env value silently diverge. Login then fails with
// no code bug anywhere -- both sides are individually "correct", just
// mutually stale.
//
// This script does NOT touch authentication logic (verifyPasswordHash,
// requireRoles, requirePage are all untouched) and does NOT create a
// bypass. It performs the same password-reset write updateAccount() does
// (hashPassword() -> prismaAuth.upsertUser(..., {overwrite:true}) ->
// writeAccounts()) for each of this tenant's five default accounts, but
// only when the CURRENT .env password doesn't already verify -- i.e. a
// real password reset to the value already sitting in this environment's
// own .env, run once from an operator shell since updateAccount()'s own
// permission model (canManageRole) structurally cannot let any actor reset
// an owner-role account's password via the normal admin UI (owners can only
// manage manager/waiter/kitchen, never another owner) -- there is no
// self-service path for this by design, only direct recovery.
//
//   node scripts/resync-account-passwords.js            # dry-run (default): report only
//   node scripts/resync-account-passwords.js --apply     # actually reset mismatched accounts
const path = require('path');
const dotenv = require('dotenv');
dotenv.config({ path: path.resolve(__dirname, '..', '.env'), quiet: true });

const { createConfig } = require('../../Trump/server/utils/helpers');
const { AccountService, hashPassword } = require('../../Trump/server/services/accountService');

const APPLY = process.argv.includes('--apply');

async function main() {
  const config = createConfig(path.resolve(__dirname, '..'));
  const accountService = new AccountService(config, { logger: { info: () => {}, warn: () => {} } });
  await accountService.ensureReady();

  console.log(`restaurantId=${config.restaurantId} mode=${APPLY ? 'APPLY' : 'DRY-RUN (pass --apply to actually reset)'}\n`);

  for (const defaultUser of config.auth.users) {
    const { username, password, role, label } = defaultUser;
    const valid = await accountService.verifyCredentials(username, password);

    if (valid) {
      console.log(`[OK]    ${username} (${role}) -- current .env password already matches the stored hash. No change.`);
      continue;
    }

    console.log(`[STALE] ${username} (${role}) -- .env password does NOT match the stored hash.`);
    if (!APPLY) {
      console.log(`         would reset to the value currently in .env (TRUMP_*_PASS for ${label})`);
      continue;
    }

    const account = await accountService.findAccount(username);
    if (!account) {
      console.log(`         [SKIP] no existing account row found for ${username} (unexpected -- ensureReady() should have created it)`);
      continue;
    }

    account.passwordHash = hashPassword(password);
    account.updatedAt = new Date().toISOString();
    await accountService.prismaAuth.upsertUser(account, { overwrite: true });

    const accounts = await accountService.getAccounts();
    const idx = accounts.findIndex(c => c.username === username);
    if (idx >= 0) accounts[idx] = { ...accounts[idx], passwordHash: account.passwordHash, updatedAt: account.updatedAt };
    await accountService.writeAccounts(accounts);

    const reverify = await accountService.verifyCredentials(username, password);
    console.log(`         reset ${reverify ? 'OK -- now verifies' : 'FAILED -- still does not verify, needs manual look'}`);
  }
}

main().catch(e => { console.error(e); process.exit(1); });
