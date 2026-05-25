const path = require('path');

const dotenv = require('dotenv');

dotenv.config({ quiet: true });
dotenv.config({ path: path.resolve(__dirname, '..', '.env'), quiet: true });
dotenv.config({ path: path.resolve(__dirname, '..', '..', '..', '.env'), quiet: true });

const { FileService } = require('../server/services/fileService');
const { createConfig } = require('../server/utils/helpers');
const { createLogger } = require('../server/utils/logger');

async function main() {
  const config = createConfig(path.resolve(__dirname, '..'));
  const logger = createLogger(config);
  const fileService = new FileService(config, { logger });

  try {
    const [activeOrders, historyOrders, tableCarts] = await Promise.all([
      fileService.listOrdersJson('orders'),
      fileService.listOrdersJson('history'),
      fileService.listTableCartsJson()
    ]);
    const migration = await fileService.prismaOrder.migrateFromJson({ activeOrders, historyOrders, tableCarts });
    const counts = await fileService.prismaOrder.getCounts();
    const status = fileService.getOrderMigrationStatus();

    console.log(JSON.stringify({
      status: status.postgres.ready ? 'ok' : 'json_fallback_active',
      postgres: {
        configured: status.postgres.configured,
        ready: status.postgres.ready,
        fallbackEnabled: status.postgres.fallbackEnabled,
        lastError: status.postgres.lastError
      },
      migration,
      counts,
      jsonSource: {
        activeOrders: activeOrders.length,
        historyOrders: historyOrders.length,
        tableCarts: tableCarts.length
      }
    }, null, 2));
  } finally {
    await fileService.close();
  }
}

main().catch(error => {
  console.error(error.message || String(error));
  process.exit(1);
});
