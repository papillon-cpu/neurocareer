import { defineConfig } from "vitest/config";
import path from "node:path";

export default defineConfig({
  resolve: { alias: { "@": path.resolve(import.meta.dirname, "src") } },
  test: {
    environment: "node",
    include: ["tests/**/*.test.ts"],
    env: { PGLITE_DATA_DIR: "memory://", DATABASE_URL: "" },
    testTimeout: 30000,
    // В каждом файле своя встроенная БД (WASM): параллельно они не помещаются в память.
    fileParallelism: false,
  },
});
