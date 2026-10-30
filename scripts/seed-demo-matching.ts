// Демо-данные для проверки подбора вручную (только локальная разработка, останавливайте dev-сервер перед запуском):
//   npm run db:seed -- --demo        (создаёт демо-работодателя и сотрудника; админ — через ADMIN_EMAIL/ADMIN_PASSWORD)
//   npx tsx scripts/seed-demo-matching.ts
// Создаёт трёх опубликованных кандидатов с разными навыками и подписку демо-работодателя, у которой уже
// использовано 48 из 50 контактов, чтобы можно было увидеть и включённый контакт, и платный (200 ₽).
import { randomBytes } from "node:crypto";
import { eq } from "drizzle-orm";
import { getDb, runMigrations, schema } from "../src/server/db";
import { registerUser } from "../src/modules/auth/service";
import { emptyContent } from "../src/modules/resume/content";
import * as resumes from "../src/modules/resume/service";
import { publishProfile, saveSharing } from "../src/modules/visibility/service";

async function main() {
  if (process.env.NODE_ENV === "production") throw new Error("Демо-данные запрещены в production");
  await runMigrations();
  const db = await getDb();
  const password = randomBytes(9).toString("base64url");

  const people = [
    { name: "Анна Демо", skills: ["TypeScript", "PostgreSQL", "Docker"], format: "remote" as const, share: true },
    { name: "Борис Демо", skills: ["TypeScript", "PostgreSQL"], format: "office" as const, share: true },
    { name: "Вера Демо", skills: ["TypeScript", "React"], format: "remote" as const, share: false },
  ];
  for (const [i, p] of people.entries()) {
    const email = `demo-cand-${i + 1}@example.com`;
    const [exists] = await db.select().from(schema.users).where(eq(schema.users.email, email));
    if (exists) {
      console.log("Уже есть:", email);
      continue;
    }
    const u = await registerUser({ fullName: p.name, email, password, role: "employee", acceptService: true, acceptMarketing: false });
    await db.insert(schema.employeeAccess).values({ userId: u.id }).onConflictDoNothing();
    await db
      .update(schema.employeeProfiles)
      .set({ headline: "Backend-разработчик", city: "Москва", desiredRole: "Backend", workFormat: p.format, about: "Проектирую и поддерживаю сервисы." })
      .where(eq(schema.employeeProfiles.userId, u.id));
    const c = emptyContent({ fullName: p.name, email, phone: "+7 900 000-00-0" + (i + 1), headline: "Backend" });
    c.skills = p.skills;
    c.experience = [{ company: "Демо", position: "Backend-разработчик", start: "2019-03", end: "2024-03", description: "Разрабатывал сервисы." }];
    const r = await resumes.createResume(u.id, { title: "Резюме", content: c, source: "manual", reviewNotes: [] });
    await publishProfile(u.id, { resumeVersionId: r.versionId, acceptPublication: true });
    if (p.share) await saveSharing(u.id, { shareEmail: true, sharePhone: true, acceptSharing: true });
    console.log(`Кандидат: ${email}  пароль: ${password}`);
  }

  const [employer] = await db.select().from(schema.users).where(eq(schema.users.email, "demo-employer@example.com"));
  if (!employer) throw new Error("Сначала создайте демо-работодателя: npm run db:seed -- --demo");
  const [sub] = await db
    .insert(schema.subscriptions)
    .values({
      userId: employer.id,
      periodStart: new Date(Date.now() - 86_400_000),
      periodEnd: new Date(Date.now() + 29 * 86_400_000),
      priceKopecks: 100_000,
      includedContacts: 50,
      extraContactKopecks: 20_000,
    })
    .returning();
  for (let i = 0; i < 48; i++) {
    const [d] = await db
      .insert(schema.users)
      .values({ email: `filler-${randomBytes(4).toString("hex")}@deleted.invalid`, passwordHash: "x", role: "employee", deletedAt: new Date() })
      .returning({ id: schema.users.id });
    await db.insert(schema.contactUnlocks).values({ employerUserId: employer.id, candidateUserId: d.id, subscriptionId: sub.id, chargeKind: "included" });
  }
  console.log("Подписка демо-работодателя создана: использовано 48 из 50 контактов.");
  process.exit(0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
