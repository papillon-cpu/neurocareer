import { mkdirSync } from "node:fs";
import { drizzle as drizzlePg } from "drizzle-orm/node-postgres";
import { migrate as migratePg } from "drizzle-orm/node-postgres/migrator";
import { drizzle as drizzlePglite } from "drizzle-orm/pglite";
import { migrate as migratePglite } from "drizzle-orm/pglite/migrator";
import type { PgDatabase, PgQueryResultHKT } from "drizzle-orm/pg-core";
import * as schema from "./schema";

export type Db = PgDatabase<PgQueryResultHKT, typeof schema>;

const MIGRATIONS = { migrationsFolder: "drizzle" };

const g = globalThis as unknown as { __neurocareerDb?: Promise<Db> };

/**
 * Есть DATABASE_URL — работаем с PostgreSQL (прод и staging; миграции: `npm run db:migrate`).
 * Нет — используем встроенный PostgreSQL (PGlite) в папке .data для локальной разработки;
 * миграции применяются автоматически. PGLITE_DATA_DIR=memory:// — БД в памяти (для тестов).
 */
export function getDb(): Promise<Db> {
  if (!g.__neurocareerDb) {
    const p = init();
    // Неудачная инициализация не кэшируется: следующий запрос попробует снова.
    p.catch(() => {
      g.__neurocareerDb = undefined;
    });
    g.__neurocareerDb = p;
  }
  return g.__neurocareerDb;
}

async function init(): Promise<Db> {
  const url = process.env.DATABASE_URL;
  if (url) {
    const { Pool } = await import("pg");
    return drizzlePg(new Pool({ connectionString: url }), { schema });
  }
  const { PGlite } = await import("@electric-sql/pglite");
  const dir = process.env.PGLITE_DATA_DIR ?? ".data/pglite";
  if (!dir.startsWith("memory://")) mkdirSync(dir, { recursive: true });
  const client = new PGlite(dir);
  const db = drizzlePglite(client, { schema });
  await migratePglite(db, MIGRATIONS);
  return db;
}

export async function runMigrations(): Promise<void> {
  const url = process.env.DATABASE_URL;
  if (!url) {
    await getDb(); // PGlite мигрирует сам при открытии
    return;
  }
  const { Pool } = await import("pg");
  const pool = new Pool({ connectionString: url });
  try {
    await migratePg(drizzlePg(pool, { schema }), MIGRATIONS);
  } finally {
    await pool.end();
  }
}

export { schema };
