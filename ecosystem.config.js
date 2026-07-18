module.exports = {
  apps: [
    {
      name: 'minichat-server',
      cwd: './server',
      script: 'dist/server.js',
      env: {
        NODE_ENV: 'production',
        PORT: 3001,
      },
      watch: false,
      instances: 1,
      autorestart: true,
      max_restarts: 10,
      restart_delay: 1000,
    },
    {
      name: 'minichat-client',
      cwd: './client',
      script: 'node_modules/.bin/next',
      args: 'start',
      env: {
        NODE_ENV: 'production',
        PORT: 3000,
      },
      watch: false,
      instances: 1,
      autorestart: true,
      max_restarts: 10,
      restart_delay: 1000,
    },
  ],
};
