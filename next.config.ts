import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Кабинеты целиком динамические (сессии, cookies), поэтому Cache Components выключены.
  serverExternalPackages: ["@electric-sql/pglite", "pg"],
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
