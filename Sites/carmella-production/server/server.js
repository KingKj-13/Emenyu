process.env.TZ = process.env.TZ || 'Africa/Johannesburg';

const path = require('path');
const dotenv = require('dotenv');

// MUST run before any local require() below: ./utils/helpers.js reads
// TRUMP_RESTAURANT_ID/TRUMP_PUBLIC_BASE_PATH from process.env at module-load
// time (a top-level const, not inside createConfig()), so if dotenv loads
// after that require, this process silently boots as Trump's own identity
// instead of carmella-production's — dotenv never overwrites an already-set
// var, and by then it's too late anyway since the const already evaluated.
dotenv.config({ path: path.resolve(__dirname, '..', '.env'), quiet: true });

const express = require('express');
const fsPromises = require('fs').promises;
const http = require('http');

const { createMenuController } = require('./controllers/menuController');
const { createUploadController } = require('./controllers/uploadController');
const { createPromotionController } = require('./controllers/promotionController');
const { createHappyHourController } = require('./controllers/happyHourController');
const { createSpecialController } = require('./controllers/specialController');
const { createComboController } = require('./controllers/comboController');
const { createAnalyticsController } = require('./controllers/analyticsController');
const { createThemeController } = require('./controllers/themeController');
const { registerMenuRoutes } = require('./routes/menuRoutes');
const { registerUploadRoutes } = require('./routes/uploadRoutes');
const { registerPromotionRoutes } = require('./routes/promotionRoutes');
const { registerHappyHourRoutes } = require('./routes/happyHourRoutes');
const { registerSpecialRoutes } = require('./routes/specialRoutes');
const { registerComboRoutes } = require('./routes/comboRoutes');
const { registerAnalyticsRoutes } = require('./routes/analyticsRoutes');
const { registerThemeRoutes } = require('./routes/themeRoutes');
const { configureSecurity } = require('./middleware/security');
const { createErrorHandler, createRequestLogger } = require('./middleware/requestLogger');
const { FileService } = require('./services/fileService');
const { SocketService } = require('./services/socketService');
const { getPrisma } = require('./services/prismaClient');
const { createLogger } = require('./utils/logger');
const { createConfig, createAdminAuth, tenantPaths } = require('./utils/helpers');

const STATIC_ASSET_PATTERN = /\.(?:css|js|mjs|png|jpg|jpeg|webp|gif|svg|ico|woff|woff2|ttf|map)$/i;

function createStaticOptions(config) {
  return {
    redirect: false,
    etag: true,
    lastModified: true,
    setHeaders(res, filePath) {
      if (/[\\/]sw\.js$/i.test(filePath) || /\.html$/i.test(filePath)) {
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
    fsPromises.access(config.directories.data),
    fsPromises.access(config.directories.uploads)
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
      res.status(503).json({ status: 'not_ready', error: error.message || 'Storage readiness check failed' });
    }
  });
}

function registerProcessHandlers({ server, socketService, fileService, logger, config }) {
  let shuttingDown = false;

  function shutdown(reason, exitCode = 0) {
    if (shuttingDown) return;
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
        await fileService?.close();
      } catch (closeError) {
        logger.warn('shutdown_close_failed', { error: closeError });
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
    logger.fatal('unhandled_rejection', { error: reason instanceof Error ? reason : new Error(String(reason)) });
    shutdown('unhandledRejection', 1);
  });
}

async function startServer(baseDirOverride) {
  const config = createConfig(baseDirOverride || path.resolve(__dirname, '..'));
  const logger = createLogger(config);
  const fileService = new FileService(config, { logger });
  await fileService.ensureBaseFiles();

  const app = express();
  const server = http.createServer(app);
  const socketService = new SocketService(config, fileService, logger);
  socketService.initialize(server);

  const adminAuth = createAdminAuth();

  const controllers = {
    menu: createMenuController({ fileService, socketService, prismaMenuService: fileService.prismaMenu }),
    promotion: createPromotionController({ getPrisma, socketService }),
    happyHour: createHappyHourController({ getPrisma, socketService }),
    special: createSpecialController({ getPrisma, socketService }),
    combo: createComboController({ getPrisma, socketService }),
    analytics: createAnalyticsController({ getPrisma, fileService }),
    theme: createThemeController({ getPrisma, socketService })
  };
  const uploadController = createUploadController(config, { logger });

  app.use(createRequestLogger(logger, config));
  configureSecurity(app, config, logger);
  app.use(express.json({ limit: config.http.bodyLimit }));
  app.use(express.urlencoded({ extended: true, limit: config.http.urlEncodedLimit }));

  registerHealthRoutes(app, config, fileService, new Date().toISOString());

  app.get(tenantPaths(config, '/favicon.ico'), (req, res) => res.status(204).end());

  const staticOptions = createStaticOptions(config);
  const clientDist = config.directories.clientDist;
  const mediaDir = config.directories.media;
  for (const p of tenantPaths(config, '', { includeBare: false })) {
    app.use(p, express.static(clientDist, staticOptions));
  }
  app.use(express.static(mediaDir, staticOptions));
  for (const p of tenantPaths(config, '', { includeBare: false })) {
    app.use(p, express.static(mediaDir, staticOptions));
  }

  // STEP 6 — no login endpoints exist. GET /api/auth/me still exists so the
  // client's boot sequence has one stable "who am I" call; it always answers
  // with the same unauthenticated admin identity (see createAdminAuth).
  app.get(tenantPaths(config, '/api/auth/me'), (req, res) => {
    res.json({ user: { username: 'admin', role: 'owner', label: 'Admin' } });
  });

  // Client-facing runtime config (VAT/service rate, table count, brand name).
  app.get(tenantPaths(config, '/api/config'), (req, res) => {
    res.json({
      brandName: config.brandName,
      tableCount: config.tableCount,
      vatRate: config.order.vatRate,
      serviceRate: config.order.serviceRate
    });
  });

  registerMenuRoutes(app, config, controllers, adminAuth);
  registerUploadRoutes(app, config, uploadController, adminAuth);
  registerPromotionRoutes(app, config, controllers, adminAuth);
  registerHappyHourRoutes(app, config, controllers, adminAuth);
  registerSpecialRoutes(app, config, controllers, adminAuth);
  registerComboRoutes(app, config, controllers, adminAuth);
  registerAnalyticsRoutes(app, config, controllers, adminAuth);
  registerThemeRoutes(app, config, controllers, adminAuth);

  // STEP 5/12 — Admin "Live Carts": every currently-open cart (now broken
  // down per device -- see cartService.listActiveCarts), for the admin UI's
  // initial load (subsequent changes arrive over the liveCartsChanged socket
  // event, which the client re-fetches this same endpoint on).
  app.get(tenantPaths(config, '/api/admin/live-carts'), adminAuth, async (req, res) => {
    res.json(await fileService.listActiveCarts());
  });

  // STEP 12 — table-level cart controls. Each one persists the change, then
  // broadcasts over the same socket paths a guest-initiated cart update would
  // (syncCart to the table's own room, liveCartsChanged to Admin) so every
  // open screen -- guest or staff -- reflects it immediately, not just on
  // next poll.
  async function broadcastTableCartChange(tableId) {
    const state = await fileService.loadTableCart(tableId);
    await socketService.emitTableCart(tableId, state);
    socketService.emitAdminCartsChanged();
  }

  // "Table has paid and left" -- clears the cart AND the device roster, so
  // the next seating starts a fresh D1/D2/D3 count rather than continuing
  // the last party's numbering.
  app.post(tenantPaths(config, '/api/admin/live-carts/:tableId/reset'), adminAuth, async (req, res) => {
    await fileService.resetCart(req.params.tableId);
    await broadcastTableCartChange(req.params.tableId);
    res.json({ ok: true });
  });

  // Empties every device's items but keeps the SAME seating's device numbers
  // stable, unlike reset.
  app.post(tenantPaths(config, '/api/admin/live-carts/:tableId/clear'), adminAuth, async (req, res) => {
    await fileService.clearTable(req.params.tableId);
    await broadcastTableCartChange(req.params.tableId);
    res.json({ ok: true });
  });

  // Removes only one device's items; every other device's cart is untouched.
  app.post(tenantPaths(config, '/api/admin/live-carts/:tableId/clear-device'), adminAuth, async (req, res) => {
    const deviceId = String(req.body?.deviceId || '');
    if (!deviceId) return res.status(400).json({ error: 'deviceId is required' });
    await fileService.clearDevice(req.params.tableId, deviceId);
    await broadcastTableCartChange(req.params.tableId);
    res.json({ ok: true });
  });

  // Display-only marker (Table.status) -- Reset Cart is what actually clears
  // a table for its next seating.
  app.post(tenantPaths(config, '/api/admin/live-carts/:tableId/finish'), adminAuth, async (req, res) => {
    await fileService.markFinished(req.params.tableId);
    socketService.emitAdminCartsChanged();
    res.json({ ok: true });
  });

  const spaIndex = path.join(config.directories.clientDist, 'index.html');
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

  registerProcessHandlers({ server, socketService, fileService, logger, config });

  return { app, config, fileService, logger, server, socketService };
}

module.exports = { startServer };

if (require.main === module) {
  startServer().catch(error => {
    console.error(JSON.stringify({
      ts: new Date().toISOString(),
      level: 'fatal',
      event: 'server_start_failed',
      error: { name: error.name || 'Error', message: error.message || String(error), stack: error.stack || null }
    }));
    process.exit(1);
  });
}
