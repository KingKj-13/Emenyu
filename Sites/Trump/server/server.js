// Pin the process timezone before anything else touches Date — the analytics
// controller's hour/day-of-week/trend bucketing all use local Date getters
// (getHours/getDay/getFullYear etc), which otherwise silently follow whatever
// timezone the host OS happens to be configured with (commonly UTC on a fresh
// cloud VPS) rather than the restaurant's real SAST business day.
process.env.TZ = 'Africa/Johannesburg';

const express = require('express');
const fsPromises = require('fs').promises;
const http = require('http');
const path = require('path');

const dotenv = require('dotenv');

const { createAiController } = require('./controllers/aiController');
const { createAnalyticsController } = require('./controllers/analyticsController');
const { createRecommendationAnalyticsController } = require('./controllers/recommendationAnalyticsController');
const { createRecommendationBundleController } = require('./controllers/recommendationBundleController');
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
const { registerRecommendationAnalyticsRoutes } = require('./routes/recommendationAnalyticsRoutes');
const { registerRecommendationBundleRoutes } = require('./routes/recommendationBundleRoutes');
const { registerWaiterApiRoutes } = require('./routes/waiterApiRoutes');
const { registerOperationsRoutes } = require('./routes/operationsRoutes');
const { AuditService } = require('./services/auditService');
const { ShiftService } = require('./services/shiftService');
const { TableOwnershipService } = require('./services/tableOwnershipService');
const { NotificationService } = require('./services/notificationService');
const { OperationsService } = require('./services/operationsService');
const { createOperationsController } = require('./controllers/operationsController');
const { registerAuthTokenRoutes } = require('./routes/authTokenRoutes');
const { TokenService } = require('./services/tokenService');
const { PushDispatcher } = require('./services/pushDispatcher');
const { createAuthTokenController } = require('./controllers/authTokenController');
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
const { createOrderValidationService } = require('./services/orderValidationService');
const { createNlgService } = require('./services/nlg/nlgService');
const { createGuestService } = require('./services/guestService');
const { createOpportunityService } = require('./services/opportunityService');
const { createWaiterAnalyticsService } = require('./services/waiterAnalyticsService');
const { createServiceRecoveryService } = require('./services/serviceRecoveryService');
const { createFloorService } = require('./services/floorService');
const { createWaiterWorkflowService } = require('./services/waiterWorkflowService');
const { AccountService } = require('./services/accountService');
const { FileService } = require('./services/fileService');
const { SocketService } = require('./services/socketService');
const { MediaEnrichmentService } = require('./services/mediaEnrichmentService');
const { RecommendationEventService } = require('./services/recommendationEventService');
const { RecommendationBundleService } = require('./services/recommendationBundleService');
const { createLogger } = require('./utils/logger');
const { createConfig, createRoleAuth, tenantPaths } = require('./utils/helpers');

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
      if (/\.mp4$/i.test(filePath)) {
        res.type('video/mp4');
      } else if (/\.webm$/i.test(filePath)) {
        res.type('video/webm');
      } else if (/\.jpg$/i.test(filePath)) {
        try {
          const fs = require('fs');
          const fd = fs.openSync(filePath, 'r');
          const buffer = Buffer.alloc(4);
          fs.readSync(fd, buffer, 0, 4, 0);
          fs.closeSync(fd);
          if (buffer[0] === 0x89 && buffer[1] === 0x50 && buffer[2] === 0x4E && buffer[3] === 0x47) {
            res.type('image/png');
          }
        } catch(e) {}
      }

      if (/[\\/]sw\.js$/i.test(filePath)) {
        res.setHeader('Cache-Control', 'no-store');
        return;
      }

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

async function startServer(baseDirOverride) {
  const config = createConfig(baseDirOverride || path.resolve(__dirname, '..'));
  const logger = createLogger(config);
  const fileService = new FileService(config, { logger });
  await fileService.ensureBaseFiles();
  const auditService = new AuditService({ config, logger });
  const accountService = new AccountService(config, { logger, auditService });
  await accountService.ensureReady();

  const app = express();
  const server = http.createServer(app);
  const auth = createRoleAuth(config, accountService, logger);
  const socketService = new SocketService(config, fileService, logger, { auth });
  socketService.initialize(server);

  // Waiter-AI: deterministic business logic + pluggable wording layer (hybrid).
  // Built before aiService so the shared reasonComposer (Phase 3A) reuses one
  // NLG instance across the chatbot, the customer cards and the waiter app.
  const nlgService = createNlgService({ config, logger });
  const aiService = new AiService(config, fileService, socketService, { logger, nlgService });
  // Drop the reco caches the moment menu / recommendation / order data mutates,
  // so owner edits (and new orders) are reflected immediately rather than after
  // the cache TTL. Every mutation path already funnels through these emitters.
  socketService.onDataChange(() => aiService.invalidateCaches());
  const mediaEnrichmentService = new MediaEnrichmentService(config);
  const recommendationEventService = new RecommendationEventService({ config, logger });
  const recommendationBundleService = new RecommendationBundleService({ config, logger });
  const orderValidationService = createOrderValidationService({ config, fileService, logger });

  const guestService = createGuestService({ config });
  const opportunityService = createOpportunityService({ config, aiService });
  const waiterAnalyticsService = createWaiterAnalyticsService({ config });
  const serviceRecoveryService = createServiceRecoveryService({ config });
  const floorService = createFloorService({ config });
  const waiterWorkflowService = createWaiterWorkflowService({ config, socketService });
  // Phase 03 — staff operations services (shifts, table ownership, notification
  // center, owner-ops snapshot) bound together by the immutable audit trail.
  const tokenService = new TokenService({ config, logger }); // Phase 04 — native refresh/device registry
  // Phase 04B — background push fan-out (Expo); a non-fatal side-effect of notify().
  const pushDispatcher = new PushDispatcher({ accountService, tokenService, config, logger });
  const notificationService = new NotificationService({ config, logger, socketService, auditService, pushDispatcher });
  socketService.setNotificationService(notificationService);
  const shiftService = new ShiftService({ config, logger, auditService });
  const tableOwnershipService = new TableOwnershipService({ config, logger, auditService, notificationService });
  const operationsService = new OperationsService({ config, logger, shiftService, notificationService });
  logger.info('nlg_mode', nlgService.status());

  const controllers = {
    ai: createAiController({ aiService, config, waiterWorkflowService, fileService }),
    analytics: createAnalyticsController({ config }),
    recommendationAnalytics: createRecommendationAnalyticsController({ recommendationEventService, prismaMenuService: fileService.prismaMenu }),
    recommendationBundle: createRecommendationBundleController({ recommendationBundleService, socketService }),
    deal: createDealController({ fileService, socketService }),
    kitchen: createKitchenController({ config, fileService, socketService, notificationService }),
    menu: createMenuController({ fileService, socketService, mediaEnrichmentService, prismaMenuService: fileService.prismaMenu, config }),
    order: createOrderController({ config, fileService, socketService, orderValidationService }),
    push: createPushController({ config }),
    rating: createRatingController({ config }),
    reservation: createReservationController({ config }),
    waiter: createWaiterController({ config, fileService, socketService, orderValidationService }),
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
      floorService,
      waiterWorkflowService
    }),
    operations: createOperationsController({
      shiftService, tableOwnershipService, notificationService, operationsService, auditService
    }),
    authToken: createAuthTokenController({ accountService, auth, tokenService, config, logger })
  };
  const uploadController = createUploadController(config, { logger });

  app.use(createRequestLogger(logger, config));
  configureSecurity(app, config, logger);
  app.use(express.json({ limit: config.http.bodyLimit }));
  app.use(express.urlencoded({ extended: true, limit: config.http.urlEncodedLimit }));

  registerHealthRoutes(app, config, fileService, new Date().toISOString());

  app.get(tenantPaths(config, '/favicon.ico'), (req, res) => {
    res.status(204).end();
  });

  // Retired (Phase 01B): the vanilla admin.html is superseded by the React /Admin
  // dashboard. Redirect preserves the old bookmark and keeps the same owner/manager
  // guard. A .html URL cannot render the SPA directly (React Router basename is
  // config.publicBasePath), so we redirect to the canonical /Admin route instead
  // of serving the SPA here.
  app.get(
    tenantPaths(config, '/admin.html'),
    auth.requirePage(['owner', 'manager']),
    (req, res) => res.redirect(`${config.publicBasePath}/Admin`)
  );
  // Retired (Phase 01B): the vanilla waiter.html is superseded by the React /Waiter
  // app. Redirect preserves the bookmark and the same guard (a .html URL cannot
  // render the SPA directly because React Router basename is config.publicBasePath).
  app.get(
    tenantPaths(config, '/waiter.html'),
    auth.requirePage(['owner', 'manager', 'waiter']),
    (req, res) => res.redirect(`${config.publicBasePath}/Waiter`)
  );
  // Retired: the vanilla owner.html is superseded by the React /Owner dashboard.
  app.get(
    tenantPaths(config, '/owner.html'),
    auth.requirePage(['owner']),
    (req, res) => res.redirect(`${config.publicBasePath}/Owner`)
  );

  const staticOptions = createStaticOptions(config);
  // Overridable so a second tenant process (e.g. Sites/Demo, Sites/Carmella) can
  // reuse Trump's real client build / Images / Video without duplicating either
  // on disk. Each tenant serves its own build under its own publicBasePath.
  const clientDist = config.directories.clientDist;
  const mediaDir = config.directories.media;
  // Client build is only ever served under the tenant prefix, never at bare '/'
  // (unchanged from before this refactor).
  for (const p of tenantPaths(config, '', { includeBare: false })) {
    app.use(p, express.static(clientDist, staticOptions));
  }
  app.use(express.static(mediaDir, staticOptions));
  for (const p of tenantPaths(config, '', { includeBare: false })) {
    app.use(p, express.static(mediaDir, staticOptions));
  }

  // Legacy login URL — React Router handles this via SPA fallback below
  app.post(tenantPaths(config, '/api/auth/login'), auth.login);
  app.post(tenantPaths(config, '/api/auth/logout'), auth.logout);
  app.get(tenantPaths(config, '/api/auth/me'), auth.me);
  app.get(
    tenantPaths(config, '/api/auth/accounts'),
    auth.requireRoles(['owner', 'manager']),
    auth.listAccounts
  );
  app.post(
    tenantPaths(config, '/api/auth/accounts'),
    auth.requireRoles(['owner', 'manager']),
    auth.createAccount
  );
  app.patch(
    tenantPaths(config, '/api/auth/accounts/:username'),
    auth.requireRoles(['owner', 'manager']),
    auth.updateAccount
  );

  registerAnalyticsRoutes(app, config, controllers, auth.requireRoles(['owner', 'manager']));
  registerRecommendationAnalyticsRoutes(app, config, controllers, auth.requireRoles(['owner', 'manager']));
  registerRecommendationBundleRoutes(app, config, controllers, auth.requireRoles(['owner', 'manager']));
  registerMenuRoutes(app, config, controllers, auth.requireRoles(['owner', 'manager']));
  registerDealRoutes(app, config, controllers, auth.requireRoles(['owner', 'manager']));
  registerKitchenRoutes(app, config, controllers, auth.requireRoles(['owner', 'manager', 'kitchen']));
  registerPushRoutes(app, config, controllers, auth.requireRoles(['owner', 'manager', 'waiter', 'kitchen']));
  registerRatingRoutes(app, config, controllers, auth.requireRoles(['owner', 'manager']));
  registerReservationRoutes(app, config, controllers, auth.requireRoles(['owner', 'manager']));
  registerUploadRoutes(app, config, uploadController, auth.requireRoles(['owner', 'manager']));
  registerWaiterApiRoutes(app, config, controllers, auth);
  registerOperationsRoutes(app, config, controllers, auth);
  registerAuthTokenRoutes(app, config, controllers, auth);
  registerOrderRoutes(app, config, controllers, auth);

  // SPA fallback: serve React app for all <publicBasePath>/* routes with no
  // file extension (never at bare '/', unchanged from before this refactor).
  const spaIndex = path.join(__dirname, '../client/dist/index.html');
  function serveSpa(req, res, next) {
    if (/\.\w+$/.test(req.path)) return next();
    res.sendFile(spaIndex);
  }
  for (const p of tenantPaths(config, '', { includeBare: false })) {
    app.use(p, serveSpa);
  }

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

  // Warm the recommendation caches off the request path so the first guest
  // request is already fast and never triggers a blocking recompute inline.
  aiService.warmCaches();

  // Nightly media enrichment — runs at 03:00 server time if API keys are configured
  try {
    const cron = require('node-cron');
    cron.schedule('0 3 * * *', async () => {
      logger.info('media_enrichment_cron_start');
      try {
        const result = await mediaEnrichmentService.enrichBatch({ limit: 50, restaurantId: config.restaurantId });
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
