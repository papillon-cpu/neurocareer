import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Кабинеты целиком динамические (сессии, cookies), поэтому Cache Components выключены.
  // Загрузка резюме до 5 МБ + служебные байты multipart (по умолчанию лимит 1 МБ).
  experimental: { serverActions: { bodySizeLimit: "6mb" } },
  serverExternalPackages: ["@electric-sql/pglite", "pg", "unpdf", "mammoth", "jszip"],
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

export default nextConfig;
