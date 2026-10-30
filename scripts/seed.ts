// Использование:
//   ADMIN_EMAIL=you@example.com ADMIN_PASSWORD=... npm run db:seed
//   npm run db:seed -- --demo     (только вне production: демо-сотрудник и демо-работодатель)
import { randomBytes } from "node:crypto";
import { eq } from "drizzle-orm";
import { getDb, runMigrations, schema } from "../src/server/db";
import { hashPassword } from "../src/modules/auth/password";
import { registerUser } from "../src/modules/auth/service";

async function main() {
  await runMigrations();
  const db = await getDb();

  const adminEmail = process.env.ADMIN_EMAIL?.trim().toLowerCase();
  const adminPassword = process.env.ADMIN_PASSWORD;
  if (adminEmail && adminPassword) {
    if (adminPassword.length < 12) throw new Error("ADMIN_PASSWORD должен быть не короче 12 символов");
    const [exists] = await db.select().from(schema.users).where(eq(schema.users.email, adminEmail));
    if (exists) {
      console.log("Администратор уже существует:", adminEmail);
    } else {
      await db
        .insert(schema.users)
        .values({ email: adminEmail, passwordHash: await hashPassword(adminPassword), role: "admin" });
      console.log("Создан администратор:", adminEmail);
    }
  } else {
    console.log("ADMIN_EMAIL / ADMIN_PASSWORD не заданы — администратор не создан.");
  }

  if (process.argv.includes("--demo")) {
    if (process.env.NODE_ENV === "production") throw new Error("--demo запрещён в production");
    const password = randomBytes(9).toString("base64url");
    for (const [email, role, fullName] of [
      ["demo-employee@example.com", "employee", "Демо Сотрудник"],
      ["demo-employer@example.com", "employer", "Демо Работодатель"],
    ] as const) {
      const [exists] = await db.select().from(schema.users).where(eq(schema.users.email, email));
      if (exists) {
        console.log("Демо-пользователь уже есть:", email, "(пароль не меняется)");
        continue;
      }
      await registerUser({ fullName, email, password, role, acceptService: true, acceptMarketing: false });
      console.log(`Демо-пользователь: ${email}  пароль: ${password}  (только для локальной разработки)`);
    }
  }
  process.exit(0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
