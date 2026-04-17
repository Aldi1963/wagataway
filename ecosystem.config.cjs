module.exports = {
  apps: [
    {
      name: "wa-gateway-api",
      script: "artifacts/api-server/dist/index.mjs",
      cwd: "./",
      instances: 1,
      exec_mode: "fork",
      env: {
        NODE_ENV: "production",
      },
      error_file: "logs/api-error.log",
      out_file: "logs/api-out.log",
      merge_logs: true,
      log_date_format: "YYYY-MM-DD HH:mm:ss",
      max_restarts: 10,
      restart_delay: 4000
    }
  ]
};
