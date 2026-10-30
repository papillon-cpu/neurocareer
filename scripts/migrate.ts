import { runMigrations } from "../src/server/db";

runMigrations()
  .then(() => {
    console.log("Миграции применены.");
    process.exit(0);
  })
  .catch((e) => {
    console.error(e);
    process.exit(1);
  });
