module.exports = {
  apps: [
    {
      name: "dewey",
      script: "dist/index.js",
      // Update this to the actual path on your Raspberry Pi
      cwd: "/home/wesbaker/dewey",
      env: {
        NODE_ENV: "production",
      },
      watch: false,
      autorestart: true,
      restart_delay: 5000,
      max_restarts: 10,
      log_date_format: "YYYY-MM-DD HH:mm:ss",
    },
  ],
};
