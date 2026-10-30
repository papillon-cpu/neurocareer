import { defineConfig } from "@playwright/test";

// Сквозные тесты идут по production-сборке на отдельной базе .data/e2e и порту 3200.
// Используется установленный Google Chrome, поэтому отдельные браузеры скачивать не нужно.
// Запуск: npm run test:e2e (собирает сайт, готовит базу и гоняет сценарии).
export default defineConfig({
  testDir: "e2e",
  testMatch: "*.spec.ts",
  fullyParallel: false,
  workers: 1,
  timeout: 60_000,
  expect: { timeout: 10_000 },
  reporter: [["list"]],
  use: { baseURL: "http://localhost:3200", channel: "chrome", trace: "retain-on-failure", locale: "ru-RU" },
  webServer: {
    command: "npm run start -- -p 3200",
    url: "http://localhost:3200/api/health",
    reuseExistingServer: false,
    timeout: 120_000,
    env: { PGLITE_DATA_DIR: ".data/e2e", BILLING_PROVIDER: "sandbox", DEMO_MODE: "1" },
  },
});
