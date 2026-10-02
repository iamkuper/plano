import { defineConfig } from "@playwright/test";

const API = 3201;
const WEB = 3200;
const DB = "postgresql://kanban:kanban@localhost:5433/kanban_e2e?schema=public";

export default defineConfig({
  testDir: "./e2e",
  timeout: 45_000,
  expect: { timeout: 8_000 },
  workers: 1,
  fullyParallel: false,
  reporter: [["list"]],
  use: {
    baseURL: `http://localhost:${WEB}`,
    locale: "ru-RU",
    viewport: { width: 1360, height: 860 },
    screenshot: "only-on-failure",
    launchOptions: { executablePath: process.env.CHROMIUM_PATH ?? "/opt/pw-browsers/chromium" },
  },
  webServer: [
    {
      command: "node ../web/e2e/prepare-db.mjs && pnpm build && node dist/main",
      cwd: "../api",
      port: API,
      reuseExistingServer: false,
      timeout: 180_000,
      env: {
        PORT: String(API),
        DATABASE_URL: DB,
        JWT_SECRET: "e2e-secret",
        DISABLE_SCHEDULERS: "1",
        APP_URL: `http://localhost:${WEB}`,
        API_PUBLIC_URL: `http://localhost:${API}`,
        TBANK_TERMINAL_KEY: "",
        TBANK_PASSWORD: "",
        SMTP_HOST: "",
        PLATFORM_ADMIN_EMAILS: "owner@e2e.test",
        UPLOAD_DIR: "/tmp/plano-e2e-uploads",
      },
    },
    {
      command: `pnpm exec next dev -p ${WEB}`,
      port: WEB,
      reuseExistingServer: false,
      timeout: 180_000,
      env: { NEXT_PUBLIC_API_URL: `http://localhost:${API}` },
    },
  ],
});
