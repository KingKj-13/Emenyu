const path = require('path');

const dotenv = require('dotenv');

dotenv.config({ quiet: true });
dotenv.config({ path: path.resolve(__dirname, '..', '.env'), quiet: true });
dotenv.config({ path: path.resolve(__dirname, '..', '..', '..', '.env'), quiet: true });

const { FileService } = require('../server/services/fileService');
const { createConfig } = require('../server/utils/helpers');
const { createLogger } = require('../server/utils/logger');
const { flattenMenu } = require('../server/services/prismaMenuService');

async function main() {
  const config = createConfig(path.resolve(__dirname, '..'));
  const logger = createLogger(config);
  const fileService = new FileService(config, { logger });

  try {
    await fileService.ensureBaseFiles();
    const menu = await fileService.loadMenu();
    const recommendations = await fileService.loadRecommendations();
    const popular = await fileService.loadPopular();
    const status = fileService.getMenuMigrationStatus();

    console.log(JSON.stringify({
      status: status.postgres.ready ? 'ok' : 'json_fallback_active',
      postgres: {
        configured: status.postgres.configured,
        ready: status.postgres.ready,
        fallbackEnabled: status.postgres.fallbackEnabled,
        lastError: status.postgres.lastError
      },
      migration: status.migration || status.postgres.lastMigration,
      menu: {
        rootCategories: Object.keys(menu || {}).length,
        items: flattenMenu(menu).length
      },
      recommendations: Array.isArray(recommendations) ? recommendations.length : 0,
      popular: Array.isArray(popular) ? popular.length : 0
    }, null, 2));
  } finally {
    await fileService.close();
  }
}

main().catch(error => {
  console.error(error.message || String(error));
  process.exit(1);
});
