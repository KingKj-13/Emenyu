const { startServer } = require('./server/server');

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
