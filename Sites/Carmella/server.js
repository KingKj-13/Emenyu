// "Carmella by Sir Gaspard" tenant — reuses Trump's actual server/business
// logic unchanged, just points it at this directory's own .env/data/storage
// and its own database (restaurantId + basePath + persona are the only
// things that differ; see emenyu-carmella/ARCHITECTURE_DECISIONS.md AD-006).
//
// IMPORTANT: this .env load MUST happen before requiring Trump's server module
// below — that module's own loadEnvironment() resolves its .env paths relative
// to ITS OWN __dirname (always Sites/Trump/server, regardless of who required
// it), so without this, dotenv's "don't overwrite an existing var" default is
// the only thing standing between this process and silently running as
// Trump's real restaurantId. Loading ours first locks in every key this file
// sets. (Same pattern as Sites/Demo/server.js.)
const path = require('path');
const dotenv = require('dotenv');
dotenv.config({ path: path.join(__dirname, '.env'), quiet: true });

const { startServer } = require('../Trump/server/server');

startServer(path.resolve(__dirname)).catch(error => {
  console.error(
    JSON.stringify({
      ts: new Date().toISOString(),
      level: 'fatal',
      event: 'carmella_server_start_failed',
      error: {
        name: error.name || 'Error',
        message: error.message || String(error),
        stack: error.stack || null
      }
    })
  );
  process.exit(1);
});
