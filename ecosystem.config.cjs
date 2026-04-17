module.exports = {
  apps: [
    {
      name: "wa-gateway-api",
      script: "artifacts/api-server/dist/index.mjs",
      cwd: "/www/wwwroot/wagateway", // Gantilah 'wagateway' dengan nama folder proyek Anda di aaPanel
      instances: 1,
      exec_mode: "fork",
      env: {
        NODE_ENV: "production",
        PORT: 8080,
        // DATABASE_URL akan diambil dari file .env di artifacts/api-server/.env
      },
      error_file: "logs/api-error.log",
      out_file: "logs/api-out.log",
      log_date_format: "YYYY-MM-DD HH:mm:ss",
      max_restarts: 10,
      restart_delay: 3000,
      autorestart: true,
      watch: false
    }
  ]
};
