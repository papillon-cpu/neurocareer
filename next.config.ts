import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Dev-сервер доступен через публичный туннель (trycloudflare) — разрешаем внешний хост,
  // иначе Next отдаёт 403 на чанки, шрифты и HMR, и клиент не гидрируется.
  allowedDevOrigins: ["*.trycloudflare.com"],
  // Кабинеты целиком динамические (сессии, cookies), поэтому Cache Components выключены.
  // Загрузка резюме до 5 МБ + служебные байты multipart (по умолчанию лимит 1 МБ).
  experimental: { serverActions: { bodySizeLimit: "6mb" } },
  serverExternalPackages: ["@electric-sql/pglite", "pg", "unpdf", "mammoth", "jszip"],
  // Tailwind v4 обрабатывается через PostCSS (@tailwindcss/postcss) — одинаково для webpack и turbopack.
};

export default nextConfig;
