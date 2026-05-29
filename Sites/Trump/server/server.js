const express = require('express');
const fsPromises = require('fs').promises;
const http = require('http');
const path = require('path');

const dotenv = require('dotenv');

const { createAiController } = require('./controllers/aiController');
const { createAnalyticsController } = require('./controllers/analyticsController');
const { createDealController } = require('./controllers/dealController');
const { createKitchenController } = require('./controllers/kitchenController');
const { createMenuController } = require('./controllers/menuController');
const { createPushController } = require('./controllers/pushController');
const { createRatingController } = require('./controllers/ratingController');
const { createReservationController } = require('./controllers/reservationController');
const { createOrderController } = require('./controllers/orderController');
const { createUploadController } = require('./controllers/uploadController');
const { createWaiterController } = require('./controllers/waiterController');
const { createWaiterApiController } = require('./controllers/waiterApiController');
const { registerAnalyticsRoutes } = require('./routes/analyticsRoutes');
const { registerWaiterApiRoutes } = require('./routes/waiterApiRoutes');
const { registerDealRoutes } = require('./routes/dealRoutes');
const { registerKitchenRoutes } = require('./routes/kitchenRoutes');
const { registerMenuRoutes } = require('./routes/menuRoutes');
const { registerPushRoutes } = require('./routes/pushRoutes');
const { registerRatingRoutes } = require('./routes/ratingRoutes');
const { registerReservationRoutes } = require('./routes/reservationRoutes');
const { registerOrderRoutes } = require('./routes/orderRoutes');
const { registerUploadRoutes } = require('./routes/uploadRoutes');
const { configureSecurity } = require('./middleware/security');
const { createErrorHandler, createRequestLogger } = require('./middleware/requestLogger');
const { AiService } = require('./services/aiService');
const { createNlgService } = require('./services/nlg/nlgService');
const { createGuestService } = require('./services/guestService');
const { createOpportunityService } = require('./services/opportunityService');
const { createWaiterAnalyticsService } = require('./services/waiterAnalyticsService');
const { createServiceRecoveryService } = require('./services/serviceRecoveryService');
const { createFloorService } = require('./services/floorService');
const { AccountService } = require('./services/accountService');
const { FileService } = require('./services/fileService');
const { SocketService } = require('./services/socketService');
const { MediaEnrichmentService } = require('./services/mediaEnrichmentService');
const { createLogger } = require('./utils/logger');
const { createConfig, createRoleAuth } = require('./utils/helpers');

function loadEnvironment() {
  dotenv.config({ quiet: true });
  dotenv.config({ path: path.resolve(__dirname, '..', '.env'), quiet: true });
  dotenv.config({ path: path.resolve(__dirname, '..', '..', '..', '.env'), quiet: true });
}

loadEnvironment();

const STATIC_ASSET_PATTERN = /\.(?:css|js|mjs|png|jpg|jpeg|webp|gif|svg|ico|mp4|webm|woff|woff2|ttf|map)$/i;

function createStaticOptions(config) {
  return {
    redirect: false,
    etag: true,
    lastModified: true,
    setHeaders(res, filePath) {
      if (/\.html$/i.test(filePath)) {
        res.setHeader('Cache-Control', 'no-store');
        return;
      }

      if (STATIC_ASSET_PATTERN.test(filePath) && config.staticAssets.cacheSeconds > 0) {
        res.setHeader('Cache-Control', `public, max-age=${config.staticAssets.cacheSeconds}`);
        return;
      }

      res.setHeader('Cache-Control', 'no-cache');
    }
  };
}

async function checkStorage(config) {
  await Promise.all([
    fsPromises.access(config.directories.food),
    fsPromises.access(config.directories.orders),
    fsPromises.access(config.directories.history),
    fsPromises.access(config.directories.tables),
    fsPromises.access(config.directories.data),
    fsPromises.access(config.files.accounts)
  ]);
}

function registerHealthRoutes(app, config, fileService, startedAt) {
  const healthPaths = ['/healthz', `${config.publicBasePath}/healthz`, `${config.publicBasePath.toLowerCase()}/healthz`];
  const readyPaths = ['/readyz', `${config.publicBasePath}/readyz`, `${config.publicBasePath.toLowerCase()}/readyz`];

  app.get(healthPaths, (req, res) => {
    res.json({
      status: 'ok',
      app: config.appName,
      env: config.env,
      restaurantId: config.restaurantId,
      uptimeSeconds: Math.round(process.uptime()),
      startedAt
    });
  });

  app.get(readyPaths, async (req, res) => {
    try {
      await checkStorage(config);
      const menu = await fileService.loadMenu();
      res.json({
        status: 'ready',
        app: config.appName,
        restaurantId: config.restaurantId,
        menuSections: menu && typeof menu === 'object' ? Object.keys(menu).length : 0
      });
    } catch (error) {
      res.status(503).json({
        status: 'not_ready',
        error: error.message || 'Storage readiness check failed'
      });
    }
  });
}

function registerProcessHandlers({ server, socketService, accountService, fileService, logger, config }) {
  let shuttingDown = false;

  function shutdown(reason, exitCode = 0) {
    if (shuttingDown) {
      return;
    }

    shuttingDown = true;
    logger.warn('server_shutdown_started', { reason, exitCode });
    socketService.close();

    const timeout = setTimeout(() => {
      logger.error('server_shutdown_forced', { reason });
      process.exit(exitCode || 1);
    }, config.http.shutdownTimeoutMs);
    timeout.unref();

    server.close(async error => {
      if (error) {
        logger.error('server_shutdown_error', { reason, error });
        process.exit(1);
        return;
      }

      try {
        await Promise.all([
          accountService?.close(),
          fileService?.close()
        ]);
      } catch (closeError) {
        logger.warn('auth_postgres_close_failed', { error: closeError });
      }

      logger.info('server_shutdown_complete', { reason });
      process.exit(exitCode);
    });
  }

  process.once('SIGTERM', () => shutdown('SIGTERM', 0));
  process.once('SIGINT', () => shutdown('SIGINT', 0));
  process.once('uncaughtException', error => {
    logger.fatal('uncaught_exception', { error });
    shutdown('uncaughtException', 1);
  });
  process.once('unhandledRejection', reason => {
    logger.fatal('unhandled_rejection', {
      error: reason instanceof Error ? reason : new Error(String(reason))
    });
    shutdown('unhandledRejection', 1);
  });
}

async function startServer() {
  const config = createConfig(path.resolve(__dirname, '..'));
  const logger = createLogger(config);
  const fileService = new FileService(config, { logger });
  await fileService.ensureBaseFiles();
  const accountService = new AccountService(config, { logger });
  await accountService.ensureReady();

  const app = express();
  const server = http.createServer(app);
  const socketService = new SocketService(config, fileService, logger);
  socketService.initialize(server);

  const aiService = new AiService(config, fileService, socketService);
  const mediaEnrichmentService = new MediaEnrichmentService(config);
  const auth = createRoleAuth(config, accountService, logger);

  // Waiter-AI: deterministic business logic + pluggable wording layer (hybrid).
  const nlgService = createNlgService({ config, logger });
  const guestService = createGuestService({ config });
  const opportunityService = createOpportunityService({ config, aiService });
  const waiterAnalyticsService = createWaiterAnalyticsService({ config });
  const serviceRecoveryService = createServiceRecoveryService({ config });
  const floorService = createFloorService({ config });
  logger.info('nlg_mode', nlgService.status());

  const controllers = {
    ai: createAiController({ aiService }),
    analytics: createAnalyticsController({ config }),
    deal: createDealController({ fileService, socketService }),
    kitchen: createKitchenController({ config, fileService, socketService }),
    menu: createMenuController({ fileService, socketService, mediaEnrichmentService, prismaMenuService: fileService.prismaMenu }),
    order: createOrderController({ config, fileService, socketService }),
    push: createPushController({ config }),
    rating: createRatingController({ config }),
    reservation: createReservationController({ config }),
    waiter: createWaiterController({ config, fileService, socketService }),
    waiterApi: createWaiterApiController({
      config,
      fileService,
      socketService,
      aiService,
      nlgService,
      guestService,
      opportunityService,
      waiterAnalyticsService,
      serviceRecoveryService,
      floorService
    })
  };
  const uploadController = createUploadController(config);

  app.use(createRequestLogger(logger));
  configureSecurity(app, config, logger);
  app.use(express.json({ limit: config.http.bodyLimit }));
  app.use(express.urlencoded({ extended: true, limit: config.http.urlEncodedLimit }));

  registerHealthRoutes(app, config, fileService, new Date().toISOString());

  app.get(['/favicon.ico', '/Trump/favicon.ico', '/trump/favicon.ico'], (req, res) => {
    res.status(204).end();
  });

  app.get(
    ['/admin.html', '/Trump/admin.html', '/trump/admin.html'],
    auth.requirePage(['owner', 'manager']),
    controllers.order.serveAdminPage
  );
  app.get(
    ['/waiter.html', '/Trump/waiter.html', '/trump/waiter.html'],
    auth.requirePage(['owner', 'manager', 'waiter']),
    controllers.waiter.serveWaiterPage
  );
  app.get(
    ['/owner.html', '/Trump/owner.html', '/trump/owner.html'],
    auth.requirePage(['owner']),
    (req, res) => res.sendFile(path.join(config.directories.base, 'owner.html'))
  );

  const staticOptions = createStaticOptions(config);
  const clientDist = path.join(__dirname, '../client/dist');
  app.use('/Trump', express.static(clientDist, staticOptions));
  app.use('/trump', express.static(clientDist, staticOptions));
  app.use(express.static(config.directories.base, staticOptions));
  app.use('/Trump', express.static(config.directories.base, staticOptions));
  app.use('/trump', express.static(config.directories.base, staticOptions));

  // Legacy login URL — React Router handles this via SPA fallback below
  app.post(['/api/auth/login', '/Trump/api/auth/login', '/trump/api/auth/login'], auth.login);
  app.post(['/api/auth/logout', '/Trump/api/auth/logout', '/trump/api/auth/logout'], auth.logout);
  app.get(['/api/auth/me', '/Trump/api/auth/me', '/trump/api/auth/me'], auth.me);
  app.get(
    ['/api/auth/accounts', '/Trump/api/auth/accounts', '/trump/api/auth/accounts'],
    auth.requireRoles(['owner', 'manager']),
    auth.listAccounts
  );
  app.post(
    ['/api/auth/accounts', '/Trump/api/auth/accounts', '/trump/api/auth/accounts'],
    auth.requireRoles(['owner', 'manager']),
    auth.createAccount
  );
  app.patch(
    ['/api/auth/accounts/:username', '/Trump/api/auth/accounts/:username', '/trump/api/auth/accounts/:username'],
    auth.requireRoles(['owner', 'manager']),
    auth.updateAccount
  );

  registerAnalyticsRoutes(app, controllers, auth.requireRoles(['owner', 'manager']));
  registerMenuRoutes(app, controllers, auth.requireRoles(['owner', 'manager']));
  registerDealRoutes(app, controllers, auth.requireRoles(['owner', 'manager']));
  registerKitchenRoutes(app, controllers, auth.requireRoles(['owner', 'manager', 'kitchen']));
  registerPushRoutes(app, controllers, auth.requireRoles(['owner', 'manager', 'waiter', 'kitchen']));
  registerRatingRoutes(app, controllers, auth.requireRoles(['owner', 'manager']));
  registerReservationRoutes(app, controllers, auth.requireRoles(['owner', 'manager']));
  registerUploadRoutes(app, uploadController, auth.requireRoles(['owner', 'manager']));
  registerWaiterApiRoutes(app, controllers, auth);
  registerOrderRoutes(app, controllers, auth);

  // SPA fallback: serve React app for all /Trump/* routes with no file extension
  const spaIndex = path.join(__dirname, '../client/dist/index.html');
  function serveSpa(req, res, next) {
    if (/\.\w+$/.test(req.path)) return next();
    res.sendFile(spaIndex);
  }
  app.use('/Trump', serveSpa);
  app.use('/trump', serveSpa);

  app.use(createErrorHandler(logger, config));

  await new Promise(resolve => {
    server.listen(config.port, config.host, () => {
      const baseUrl = config.publicOrigin || `http://${config.host}:${config.port}`;
      logger.info('server_started', {
        baseUrl,
        publicBasePath: config.publicBasePath,
        port: config.port,
        host: config.host,
        nodeVersion: process.version
      });
      resolve();
    });
  });

  registerProcessHandlers({ server, socketService, accountService, fileService, logger, config });

  // Nightly media enrichment — runs at 03:00 server time if API keys are configured
  try {
    const cron = require('node-cron');
    cron.schedule('0 3 * * *', async () => {
      logger.info('media_enrichment_cron_start');
      try {
        const result = await mediaEnrichmentService.enrichBatch({ limit: 50, restaurantId: 'trump' });
        logger.info('media_enrichment_cron_done', result);
      } catch (e) {
        logger.warn('media_enrichment_cron_error', { error: e.message });
      }
    });
  } catch {
    // node-cron not available — skip cron
  }

  // Every minute: check if any deal's active window just opened/closed and notify clients
  let lastDealActiveSnapshot = '';
  setInterval(async () => {
    try {
      const deals = await fileService.loadDeals();
      if (!Array.isArray(deals)) return;
      const now = new Date();
      const day = now.getDay();
      const mins = now.getHours() * 60 + now.getMinutes();
      const snapshot = deals.map(d => {
        if (!d.startsAt && !d.endsAt && !d.activeDays) return '1';
        const dayOk = !d.activeDays || d.activeDays.length === 0 || d.activeDays.includes(day);
        if (!dayOk) return '0';
        if (d.startsAt && d.endsAt) {
          const [sh, sm] = d.startsAt.split(':').map(Number);
          const [eh, em] = d.endsAt.split(':').map(Number);
          return mins >= sh * 60 + (sm || 0) && mins <= eh * 60 + (em || 0) ? '1' : '0';
        }
        return '1';
      }).join('');
      if (snapshot !== lastDealActiveSnapshot) {
        lastDealActiveSnapshot = snapshot;
        socketService.emitDealUpdated();
      }
    } catch {}
  }, 60 * 1000);

  return {
    accountService,
    app,
    config,
    fileService,
    logger,
    server,
    socketService
  };
}

module.exports = {
  startServer
};

if (require.main === module) {
  startServer().catch(error => {
    console.error(
      JSON.stringify({
        ts: new Date().toISOString(),
        level: 'fatal',
        event: 'server_start_failed',
        error: {
          name: error.name || 'Error',
          message: error.message || String(error),
          stack: error.stack || null
        }
      })
    );
    process.exit(1);
  });
}
