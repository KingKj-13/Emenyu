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
      max_memory_restart: process.env.PM2_MAX_MEMORY_RESTART || '512M',
      kill_timeout: Number(process.env.PM2_KILL_TIMEOUT_MS || 10000),
      listen_timeout: Number(process.env.PM2_LISTEN_TIMEOUT_MS || 10000),
      min_uptime: process.env.PM2_MIN_UPTIME || '10s',
      max_restarts: Number(process.env.PM2_MAX_RESTARTS || 10),
      error_file: './logs/pm2/emenuy-trump-api-error.log',
      out_file: './logs/pm2/emenuy-trump-api-out.log',
      log_file: './logs/pm2/emenuy-trump-api-combined.log',
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
