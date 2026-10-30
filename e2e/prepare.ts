// Готовит чистую базу для сквозных тестов: .data/e2e, администратор и два опубликованных кандидата.
// Запускается перед `playwright test` (см. npm run test:e2e). Сайт при этом должен быть остановлен.
import { rmSync } from "node:fs";
import { E2E } from "./constants";

process.env.PGLITE_DATA_DIR = ".data/e2e";
rmSync(".data/e2e", { recursive: true, force: true });

async function main() {
  const { eq } = await import("drizzle-orm");
  const { getDb, runMigrations, schema } = await import("../src/server/db");
  const { hashPassword } = await import("../src/modules/auth/password");
  const { registerUser } = await import("../src/modules/auth/service");
  const { emptyContent } = await import("../src/modules/resume/content");
  const resumes = await import("../src/modules/resume/service");
  const { publishProfile, saveSharing } = await import("../src/modules/visibility/service");

  await runMigrations();
  const db = await getDb();
  await db.insert(schema.users).values({ email: E2E.admin.email, passwordHash: await hashPassword(E2E.admin.password), role: "admin" });

  const people = [
    { who: E2E.anna, name: "Анна Тестова", skills: ["TypeScript", "PostgreSQL", "Docker"], format: "remote" as const },
    { who: E2E.boris, name: "Борис Тестов", skills: ["TypeScript", "PostgreSQL"], format: "office" as const },
  ];
  for (const p of people) {
    const u = await registerUser({ fullName: p.name, email: p.who.email, password: E2E.password, role: "employee", acceptService: true, acceptMarketing: false });
    await db.insert(schema.employeeAccess).values({ userId: u.id }).onConflictDoNothing();
    await db
      .update(schema.employeeProfiles)
      .set({ headline: "Backend-разработчик", city: "Москва", desiredRole: "Backend", workFormat: p.format, about: "Проектирую и поддерживаю сервисы." })
      .where(eq(schema.employeeProfiles.userId, u.id));
    const c = emptyContent({ fullName: p.name, email: p.who.resume, phone: "+7 900 000-00-00", headline: "Backend" });
    c.skills = p.skills;
    c.experience = [{ company: "Тест", position: "Backend-разработчик", start: "2019-03", end: "2024-03", description: "Разрабатывал сервисы." }];
    const r = await resumes.createResume(u.id, { title: "Резюме", content: c, source: "manual", reviewNotes: [] });
    await publishProfile(u.id, { resumeVersionId: r.versionId, acceptPublication: true });
    await saveSharing(u.id, { shareEmail: true, sharePhone: false, acceptSharing: true });
  }
  console.log("e2e: база подготовлена");
  process.exit(0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
