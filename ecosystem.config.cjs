module.exports = {
  apps: [{
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
  }]
}
