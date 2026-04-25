module.exports = {
  apps: [
    {
      name: 'yys-backend',
      script: 'backend/src/server.js',
      interpreter: 'node',
      instances: 1,
      max_memory_restart: '500M',
      env_production: {
        NODE_ENV: 'production',
        PORT: 3001,
      },
      error_file: 'logs/backend-error.log',
      out_file: 'logs/backend-out.log',
      time: true,
      log_date_format: 'YYYY-MM-DD HH:mm:ss Z',
    },
    {
      name: 'yys-backup',
      script: 'scripts/backup.js',
      interpreter: 'node',
      cron_restart: '0 3 * * *',  // Her gece 03:00
      autorestart: false,
      watch: false,
      env_production: {
        NODE_ENV: 'production',
      },
      error_file: 'logs/backup-error.log',
      out_file: 'logs/backup-out.log',
      time: true,
    }
  ]
}
