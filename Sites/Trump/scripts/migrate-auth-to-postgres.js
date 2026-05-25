const path = require('path');

const dotenv = require('dotenv');

dotenv.config({ quiet: true });
dotenv.config({ path: path.resolve(__dirname, '..', '.env'), quiet: true });
dotenv.config({ path: path.resolve(__dirname, '..', '..', '..', '.env'), quiet: true });

const { AccountService } = require('../server/services/accountService');
const { createConfig } = require('../server/utils/helpers');
const { createLogger } = require('../server/utils/logger');

function countByRole(accounts) {
  return accounts.reduce((summary, account) => {
    summary[account.role] = (summary[account.role] || 0) + 1;
    return summary;
  }, {});
}

async function main() {
  const config = createConfig(path.resolve(__dirname, '..'));
  const logger = createLogger(config);
  const accountService = new AccountService(config, { logger });

  try {
    await accountService.ensureReady();
    const hybridAccounts = await accountService.getHybridAccounts();
    const status = accountService.getMigrationStatus();

    console.log(JSON.stringify({
      status: status.postgres.ready ? 'ok' : 'json_fallback_active',
      jsonAccounts: status.jsonAccounts,
      postgres: {
        configured: status.postgres.configured,
        ready: status.postgres.ready,
        fallbackEnabled: status.postgres.fallbackEnabled,
        lastError: status.postgres.lastError
      },
      migration: status.migration,
      roleCounts: countByRole(hybridAccounts)
    }, null, 2));
  } finally {
    await accountService.close();
  }
}

main().catch(error => {
  console.error(error.message || String(error));
  process.exit(1);
});
