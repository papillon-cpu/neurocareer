import { and, count, desc, eq, inArray, ne, sql } from "drizzle-orm";
import { z } from "zod";
import { getActiveSubscription } from "@/modules/billing/contacts";
import { cleanSkillList } from "@/modules/matching/skills";
import { sensitiveFindings } from "@/modules/matching/rules";
import { getDb, schema } from "@/server/db";

export type Vacancy = typeof schema.vacancies.$inferSelect;
export type VacancyStatus = Vacancy["status"];

export const MAX_OPEN_VACANCIES = 30;

export const LEVELS = { intern: "Стажёр", junior: "Junior", middle: "Middle", senior: "Senior", lead: "Lead" } as const;
export const FORMATS = { office: "Офис", hybrid: "Гибрид", remote: "Удалённо" } as const;
export const STATUS_LABEL: Record<VacancyStatus, string> = {
  draft: "Черновик",
  pending: "На модерации",
  published: "Опубликована",
  rejected: "Отклонена",
  closed: "Закрыта",
};

const text = (max: number) => z.string().trim().max(max, `Не длиннее ${max} символов`);
const optInt = (min: number, max: number) =>
  z.preprocess(
    (v) => (v === "" || v === null || v === undefined ? null : Number(v)),
    z.number().int("Нужно целое число").min(min, `Не меньше ${min}`).max(max, `Не больше ${max}`).nullable(),
  );
const skills = z
  .string()
  .max(1500, "Слишком длинный список")
  .transform((s) => cleanSkillList(s.split(/[,;\n]+/)))
  .pipe(z.array(z.string()).max(20, "Не больше 20 навыков"));

export const vacancyInputSchema = z
  .object({
    title: text(120).min(3, "Название не короче 3 символов"),
    tasks: text(4000),
    mustSkills: skills,
    niceSkills: skills,
    minExperienceYears: optInt(0, 30),
    level: z.enum(["", "intern", "junior", "middle", "senior", "lead"]).transform((v) => v || null),
    workFormat: z.enum(["", "office", "hybrid", "remote"]).transform((v) => v || null),
    city: text(80),
    salaryFrom: optInt(0, 10_000_000),
    salaryTo: optInt(0, 10_000_000),
    extra: text(2000),
  })
  .refine((v) => v.salaryFrom === null || v.salaryTo === null || v.salaryFrom <= v.salaryTo, {
    path: ["salaryTo"],
    message: "«До» не может быть меньше «от»",
  });

export type VacancyInput = z.infer<typeof vacancyInputSchema>;

export const hasSubscription = async (employerId: string) => Boolean(await getActiveSubscription(employerId));

export type Result<T = object> =
  | ({ ok: true } & T)
  | { ok: false; error: "no_subscription" | "not_found" | "limit" | "bad_status" | "sensitive" | "incomplete" | "rate_limited" | "unavailable"; details?: string[] };

const EDITABLE: VacancyStatus[] = ["draft", "rejected"];

/** Вакансия работодателя; чужие и несуществующие id дают null (IDOR). */
export async function getOwnVacancy(employerId: string, id: string): Promise<Vacancy | null> {
  if (!z.uuid().safeParse(id).success) return null;
  const db = await getDb();
  const [row] = await db
    .select()
    .from(schema.vacancies)
    .where(and(eq(schema.vacancies.id, id), eq(schema.vacancies.employerUserId, employerId)));
  return row ?? null;
}

export async function listVacancies(employerId: string): Promise<Vacancy[]> {
  const db = await getDb();
  return db.select().from(schema.vacancies).where(eq(schema.vacancies.employerUserId, employerId)).orderBy(desc(schema.vacancies.updatedAt));
}

async function openCount(employerId: string): Promise<number> {
  const db = await getDb();
  const [{ open }] = await db
    .select({ open: count() })
    .from(schema.vacancies)
    .where(and(eq(schema.vacancies.employerUserId, employerId), ne(schema.vacancies.status, "closed")));
  return open;
}

export async function createVacancy(employerId: string, input: VacancyInput): Promise<Result<{ id: string }>> {
  if (!(await hasSubscription(employerId))) return { ok: false, error: "no_subscription" };
  if ((await openCount(employerId)) >= MAX_OPEN_VACANCIES) return { ok: false, error: "limit" };
  const db = await getDb();
  const [row] = await db.insert(schema.vacancies).values({ employerUserId: employerId, ...input }).returning({ id: schema.vacancies.id });
  return { ok: true, id: row.id };
}

/** Править можно черновик и отклонённую вакансию (после правки она снова черновик). Опубликованную сначала снимают с публикации. */
export async function updateVacancy(employerId: string, id: string, input: VacancyInput): Promise<Result> {
  if (!(await hasSubscription(employerId))) return { ok: false, error: "no_subscription" };
  const v = await getOwnVacancy(employerId, id);
  if (!v) return { ok: false, error: "not_found" };
  if (!EDITABLE.includes(v.status)) return { ok: false, error: "bad_status" };
  const db = await getDb();
  await db
    .update(schema.vacancies)
    .set({ ...input, status: "draft", moderationNote: "", analysis: null, analysisSource: null, analyzedAt: null, updatedAt: new Date() })
    .where(eq(schema.vacancies.id, id));
  return { ok: true };
}

/** Что нужно заполнить, чтобы вакансию можно было отправить на модерацию. */
export function completenessProblems(v: Pick<Vacancy, "tasks" | "mustSkills">): string[] {
  const out: string[] = [];
  if (v.tasks.trim().length < 20) out.push("Опишите задачи (не короче 20 символов).");
  if (v.mustSkills.length === 0) out.push("Укажите хотя бы один обязательный навык: по ним подбор отбирает кандидатов.");
  return out;
}

/** Отправка на модерацию: нужна подписка, полнота и отсутствие дискриминационных формулировок. */
export async function submitVacancy(employerId: string, id: string): Promise<Result> {
  if (!(await hasSubscription(employerId))) return { ok: false, error: "no_subscription" };
  const v = await getOwnVacancy(employerId, id);
  if (!v) return { ok: false, error: "not_found" };
  if (!EDITABLE.includes(v.status)) return { ok: false, error: "bad_status" };
  const incomplete = completenessProblems(v);
  if (incomplete.length) return { ok: false, error: "incomplete", details: incomplete };
  const found = sensitiveFindings([v.title, v.tasks, v.extra, ...v.mustSkills, ...v.niceSkills].join("\n"));
  if (found.length) return { ok: false, error: "sensitive", details: found };
  const db = await getDb();
  await db.transaction(async (tx) => {
    await tx.update(schema.vacancies).set({ status: "pending", moderationNote: "", updatedAt: new Date() }).where(eq(schema.vacancies.id, id));
    await tx.insert(schema.auditEvents).values({ actorUserId: employerId, type: "vacancy.submitted", meta: { vacancyId: id } });
  });
  return { ok: true };
}

/** Снять с модерации или с публикации: вакансия возвращается в черновик и снова доступна для правки. */
export async function withdrawVacancy(employerId: string, id: string): Promise<Result> {
  const v = await getOwnVacancy(employerId, id);
  if (!v) return { ok: false, error: "not_found" };
  if (v.status !== "pending" && v.status !== "published") return { ok: false, error: "bad_status" };
  const db = await getDb();
  await db.update(schema.vacancies).set({ status: "draft", publishedAt: null, updatedAt: new Date() }).where(eq(schema.vacancies.id, id));
  return { ok: true };
}

/** Закрыть можно всегда, в том числе без подписки. */
export async function closeVacancy(employerId: string, id: string): Promise<Result> {
  const v = await getOwnVacancy(employerId, id);
  if (!v) return { ok: false, error: "not_found" };
  if (v.status === "closed") return { ok: false, error: "bad_status" };
  const db = await getDb();
  await db.update(schema.vacancies).set({ status: "closed", publishedAt: null, updatedAt: new Date() }).where(eq(schema.vacancies.id, id));
  await db.insert(schema.auditEvents).values({ actorUserId: employerId, type: "vacancy.closed", meta: { vacancyId: id } });
  return { ok: true };
}

/** Повторное открытие возвращает вакансию в черновик: публикация снова проходит модерацию. */
export async function reopenVacancy(employerId: string, id: string): Promise<Result> {
  if (!(await hasSubscription(employerId))) return { ok: false, error: "no_subscription" };
  const v = await getOwnVacancy(employerId, id);
  if (!v) return { ok: false, error: "not_found" };
  if (v.status !== "closed") return { ok: false, error: "bad_status" };
  if ((await openCount(employerId)) >= MAX_OPEN_VACANCIES) return { ok: false, error: "limit" };
  const db = await getDb();
  await db.update(schema.vacancies).set({ status: "draft", updatedAt: new Date() }).where(eq(schema.vacancies.id, id));
  return { ok: true };
}

/** Добавляет предложенные анализом навыки в списки вакансии (дубли и синонимы отбрасываются). */
export async function addSkills(employerId: string, id: string, add: { must: string[]; nice: string[] }): Promise<Result> {
  if (!(await hasSubscription(employerId))) return { ok: false, error: "no_subscription" };
  const v = await getOwnVacancy(employerId, id);
  if (!v) return { ok: false, error: "not_found" };
  if (!EDITABLE.includes(v.status)) return { ok: false, error: "bad_status" };
  const must = cleanSkillList([...v.mustSkills, ...add.must], 20);
  // Обязательные идут первыми, поэтому дубль желательного навыка отбрасывается, а не обязательного.
  const nice = cleanSkillList([...must, ...v.niceSkills, ...add.nice], 40).slice(must.length, must.length + 20);
  const db = await getDb();
  await db.update(schema.vacancies).set({ mustSkills: must, niceSkills: nice, status: "draft", updatedAt: new Date() }).where(eq(schema.vacancies.id, id));
  return { ok: true };
}

/* ---------- модерация (администратор) ---------- */

export async function listForModeration() {
  const db = await getDb();
  return db
    .select({ vacancy: schema.vacancies, company: schema.companies.name, email: schema.users.email })
    .from(schema.vacancies)
    .innerJoin(schema.users, eq(schema.users.id, schema.vacancies.employerUserId))
    .leftJoin(schema.employerProfiles, eq(schema.employerProfiles.userId, schema.vacancies.employerUserId))
    .leftJoin(schema.companies, eq(schema.companies.id, schema.employerProfiles.companyId))
    .where(inArray(schema.vacancies.status, ["pending", "published", "rejected"]))
    .orderBy(sql`case ${schema.vacancies.status} when 'pending' then 0 when 'published' then 1 else 2 end`, desc(schema.vacancies.updatedAt))
    .limit(100);
}

/** Одобрить (pending → published) или отклонить/снять (pending|published → rejected, причина обязательна). */
export async function moderateVacancy(
  adminId: string,
  id: string,
  decision: { approve: true } | { approve: false; note: string },
): Promise<Result> {
  if (!z.uuid().safeParse(id).success) return { ok: false, error: "not_found" };
  const db = await getDb();
  const [v] = await db.select().from(schema.vacancies).where(eq(schema.vacancies.id, id));
  if (!v) return { ok: false, error: "not_found" };
  if (decision.approve) {
    if (v.status !== "pending") return { ok: false, error: "bad_status" };
    if (sensitiveFindings([v.title, v.tasks, v.extra].join("\n")).length) return { ok: false, error: "sensitive" };
  } else if (v.status !== "pending" && v.status !== "published") return { ok: false, error: "bad_status" };

  await db.transaction(async (tx) => {
    const now = new Date();
    await tx
      .update(schema.vacancies)
      .set(
        decision.approve
          ? { status: "published", publishedAt: now, moderationNote: "", updatedAt: now }
          : { status: "rejected", publishedAt: null, moderationNote: decision.note.slice(0, 500), updatedAt: now },
      )
      .where(eq(schema.vacancies.id, id));
    await tx.insert(schema.auditEvents).values({
      actorUserId: adminId,
      type: decision.approve ? "vacancy.approved" : "vacancy.rejected",
      meta: { vacancyId: id },
    });
  });
  return { ok: true };
}
