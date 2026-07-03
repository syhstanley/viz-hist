import { defineConfig } from "@playwright/test";

const BASE_URL = process.env.BASE_URL || "http://localhost:3000";

export default defineConfig({
  testDir: "./e2e",
  timeout: 30000,
  retries: 0,
  use: {
    baseURL: BASE_URL,
    headless: true,
    screenshot: "only-on-failure",
  },
  // Don't auto-start webServer in CI — assume backend + frontend are already running
  ...(process.env.CI
    ? {}
    : {
        webServer: [
          {
            command: "cd ../backend && source .venv/bin/activate && uvicorn app.main:app --port 8001",
            port: 8001,
            reuseExistingServer: true,
          },
          {
            command: "npm start",
            port: 3000,
            reuseExistingServer: true,
          },
        ],
      }),
});
