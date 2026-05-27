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
        TRUMP_HOST: process.env.TRUMP_HOST || '0.0.0.0',
        TRUMP_PORT: process.env.TRUMP_PORT || process.env.PORT || 3012
      },
      env_production: {
        NODE_ENV: 'production',
        TRUMP_HOST: process.env.TRUMP_HOST || '0.0.0.0',
        TRUMP_PORT: process.env.TRUMP_PORT || process.env.PORT || 3012
      }
    }
  ]
};
