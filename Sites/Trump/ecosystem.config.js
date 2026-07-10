const path = require('path');

module.exports = {
  apps: [
    {
      name: 'emenuy-trump-api',
      cwd: __dirname,
      script: './server.js',
      exec_mode: 'fork',
      instances: 1,
      autorestart: true,
      watch: false,
      wait_ready: true,
      listen_timeout: Number(process.env.PM2_LISTEN_TIMEOUT_MS || 15000),
      kill_timeout: Number(process.env.PM2_KILL_TIMEOUT_MS || 10000),
      restart_delay: 1000,
      exp_backoff_restart_delay: 100,
      min_uptime: process.env.PM2_MIN_UPTIME || '10s',
      max_restarts: Number(process.env.PM2_MAX_RESTARTS || 10),
      max_memory_restart: process.env.PM2_MAX_MEMORY_RESTART || '768M',
      error_file: './logs/pm2/emenuy-trump-api-error.log',
      out_file: './logs/pm2/emenuy-trump-api-out.log',
      log_file: './logs/pm2/emenuy-trump-api-combined.log',
      log_date_format: 'YYYY-MM-DD HH:mm:ss Z',
      merge_logs: false,
      time: true,
      env: {
        NODE_ENV: 'production',
        // Bind to loopback by default: the app must only be reachable via the
        // nginx reverse proxy. Exposing 0.0.0.0 lets the internet hit the app
        // directly, bypassing TLS/HSTS/rate-limits (Phase 02B.1 — finding N2).
        // Override TRUMP_HOST only for setups without a fronting proxy.
        TRUMP_HOST: process.env.TRUMP_HOST || '127.0.0.1',
        TRUMP_PORT: process.env.TRUMP_PORT || process.env.PORT || 3012
      },
      env_production: {
        NODE_ENV: 'production',
        TRUMP_HOST: process.env.TRUMP_HOST || '127.0.0.1',
        TRUMP_PORT: process.env.TRUMP_PORT || process.env.PORT || 3012
      }
    },
    // Public sales/investor demo tenant ("Demo Steakhouse") — same server
    // code (Sites/Demo/server.js just requires this app's server/server.js
    // with a different baseDir), own port/env/data dir, fronted by nginx at
    // /demo/*. See docs/project-progress/demo-steakhouse-decisions.md.
    {
      name: 'emenuy-demo-api',
      cwd: path.resolve(__dirname, '..', 'Demo'),
      script: './server.js',
      exec_mode: 'fork',
      instances: 1,
      autorestart: true,
      watch: false,
      wait_ready: true,
      listen_timeout: Number(process.env.PM2_LISTEN_TIMEOUT_MS || 15000),
      kill_timeout: Number(process.env.PM2_KILL_TIMEOUT_MS || 10000),
      restart_delay: 1000,
      exp_backoff_restart_delay: 100,
      min_uptime: process.env.PM2_MIN_UPTIME || '10s',
      max_restarts: Number(process.env.PM2_MAX_RESTARTS || 10),
      // Lower cap than Trump's — the shared droplet is already memory-constrained
      // (see project_prod_access memory: 87% disk, swap active) and this is
      // low-traffic sales-demo load, not real customer traffic.
      max_memory_restart: process.env.PM2_DEMO_MAX_MEMORY_RESTART || '384M',
      error_file: './logs/pm2/emenuy-demo-api-error.log',
      out_file: './logs/pm2/emenuy-demo-api-out.log',
      log_file: './logs/pm2/emenuy-demo-api-combined.log',
      log_date_format: 'YYYY-MM-DD HH:mm:ss Z',
      merge_logs: false,
      time: true,
      env: {
        NODE_ENV: 'production',
        TRUMP_HOST: '127.0.0.1',
        TRUMP_PORT: 3014
      },
      env_production: {
        NODE_ENV: 'production',
        TRUMP_HOST: '127.0.0.1',
        TRUMP_PORT: 3014
      }
    }
  ]
};
