const path = require('node:path');
const root = __dirname;

module.exports = {
  apps: [
    {
      name: 'rp-compta-api',
      cwd: path.join(root, 'apps/server'),
      script: 'dist/index.js',
      instances: 1,
      exec_mode: 'fork',
      env: {
        NODE_ENV: 'production',
      },
      max_memory_restart: '400M',
      error_file: path.join(root, 'logs/api-error.log'),
      out_file: path.join(root, 'logs/api-out.log'),
      time: true,
    },
    {
      name: 'rp-compta-bot',
      cwd: path.join(root, 'apps/bot'),
      script: 'dist/index.js',
      instances: 1,
      exec_mode: 'fork',
      env: {
        NODE_ENV: 'production',
      },
      max_memory_restart: '200M',
      error_file: path.join(root, 'logs/bot-error.log'),
      out_file: path.join(root, 'logs/bot-out.log'),
      time: true,
    },
  ],
};
