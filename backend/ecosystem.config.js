// PM2 process manager config — keeps the backend running persistently on
// the VPS, restarting on crash and on server reboot (after `pm2 startup` +
// `pm2 save`). Run from backend/: `pm2 start ecosystem.config.js`.
module.exports = {
  apps: [
    {
      name: "bhatta-cloud-api",
      cwd: __dirname,
      script: "dist/index.js",
      instances: 1,
      autorestart: true,
      watch: false,
      max_memory_restart: "500M",
      env: {
        NODE_ENV: "production",
      },
    },
  ],
};
