module.exports = {
  apps: [
    {
      name: 'rp-compta-api',
      cwd: '/var/www/rp-compta/apps/server',
      script: 'dist/index.js',
      instances: 1,
      exec_mode: 'fork',
      env: {
        NODE_ENV: 'production',
      },
      max_memory_restart: '400M',
      error_file: '/var/www/rp-compta/logs/api-error.log',
      out_file: '/var/www/rp-compta/logs/api-out.log',
      time: true,
    },
    {
      name: 'rp-compta-bot',
      cwd: '/var/www/rp-compta/apps/bot',
      script: 'dist/index.js',
      instances: 1,
      exec_mode: 'fork',
      env: {
        NODE_ENV: 'production',
      },
      max_memory_restart: '200M',
      error_file: '/var/www/rp-compta/logs/bot-error.log',
      out_file: '/var/www/rp-compta/logs/bot-out.log',
      time: true,
    },
  ],
};
