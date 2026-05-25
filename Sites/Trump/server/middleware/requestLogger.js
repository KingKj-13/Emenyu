const crypto = require('crypto');

const HEALTH_PATHS = new Set(['/healthz', '/readyz', '/Trump/healthz', '/Trump/readyz', '/trump/healthz', '/trump/readyz']);

function getPathWithoutQuery(req) {
  return String(req.originalUrl || req.url || '').split('?')[0] || '/';
}

function createRequestLogger(logger) {
  return function requestLogger(req, res, next) {
    const requestId = req.headers['x-request-id'] || crypto.randomUUID();
    const startedAt = process.hrtime.bigint();
    req.id = requestId;
    res.setHeader('X-Request-Id', requestId);

    res.on('finish', () => {
      const path = getPathWithoutQuery(req);
      if (HEALTH_PATHS.has(path)) {
        return;
      }

      const durationMs = Number(process.hrtime.bigint() - startedAt) / 1000000;
      const level = res.statusCode >= 500 ? 'error' : res.statusCode >= 400 ? 'warn' : 'info';
      logger[level]('http_request', {
        requestId,
        method: req.method,
        path,
        statusCode: res.statusCode,
        durationMs: Number(durationMs.toFixed(2)),
        ip: req.ip || req.socket?.remoteAddress,
        userAgent: req.get('user-agent') || '',
        contentLength: res.getHeader('content-length') || null
      });
    });

    next();
  };
}

function createErrorHandler(logger, config = {}) {
  return function errorHandler(error, req, res, next) {
    const statusCode = error.statusCode || error.status || (String(error.code || '').startsWith('LIMIT_') ? 400 : 500);

    logger.error('http_error', {
      requestId: req.id,
      method: req.method,
      path: getPathWithoutQuery(req),
      statusCode,
      error
    });

    if (res.headersSent) {
      return next(error);
    }

    const publicMessage = statusCode >= 500 && config.isProduction
      ? 'Internal server error'
      : error.message || 'Internal server error';

    return res.status(statusCode).json({
      error: publicMessage,
      requestId: req.id
    });
  };
}

module.exports = {
  createErrorHandler,
  createRequestLogger
};
