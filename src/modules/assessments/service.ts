import { randomInt } from "node:crypto";
import { and, count, desc, eq, inArray } from "drizzle-orm";
import { getDb, schema } from "@/server/db";
import { getDefinition } from "./definitions";
import { buildReport, requiredIds, validateAnswer } from "./engine";
import type { AnswerValue, Answers, Report } from "./types";

export type Attempt = typeof schema.assessmentAttempts.$inferSelect;

const owned = (userId: string, attemptId: string) =>
  and(eq(schema.assessmentAttempts.id, attemptId), eq(schema.assessmentAttempts.userId, userId));

/** Начинает попытку или возвращает незавершённую (возобновление). Незнакомый slug даёт null. */
export async function startOrResume(userId: string, slug: string): Promise<Attempt | null> {
  const def = getDefinition(slug);
  if (!def) return null;
  const db = await getDb();
  const find = async () => {
    const [a] = await db
      .select()
      .from(schema.assessmentAttempts)
      .where(
        and(
          eq(schema.assessmentAttempts.userId, userId),
          eq(schema.assessmentAttempts.slug, slug),
          eq(schema.assessmentAttempts.status, "in_progress"),
        ),
      );
    return a;
  };
  const existing = await find();
  if (existing) return existing;
  // Одновременные запросы упираются в частичный уникальный индекс: проигравший читает победителя.
  const [created] = await db
    .insert(schema.assessmentAttempts)
    .values({ userId, slug, version: def.version, seed: randomInt(1, 2 ** 31 - 1) })
    .onConflictDoNothing()
    .returning();
  return created ?? (await find()) ?? null;
}

export async function getAttemptWithAnswers(userId: string, attemptId: string) {
  const db = await getDb();
  const [attempt] = await db.select().from(schema.assessmentAttempts).where(owned(userId, attemptId));
  if (!attempt) return null;
  const rows = await db
    .select({ questionId: schema.assessmentAnswers.questionId, value: schema.assessmentAnswers.value })
    .from(schema.assessmentAnswers)
    .where(eq(schema.assessmentAnswers.attemptId, attemptId));
  const answers: Answers = Object.fromEntries(rows.map((r) => [r.questionId, r.value]));
  return { attempt, answers };
}

export type SaveResult = { ok: true } | { ok: false; reason: "not_found" | "finished" | "invalid" };

export async function saveAnswer(
  userId: string,
  attemptId: string,
  questionId: string,
  value: unknown,
): Promise<SaveResult> {
  const db = await getDb();
  const [attempt] = await db.select().from(schema.assessmentAttempts).where(owned(userId, attemptId));
  if (!attempt) return { ok: false, reason: "not_found" };
  if (attempt.status !== "in_progress") return { ok: false, reason: "finished" };

  const def = getDefinition(attempt.slug, attempt.version);
  const question = def?.questions.find((q) => q.id === questionId);
  if (!def || !question) return { ok: false, reason: "invalid" };
  const clean = validateAnswer(question, value);
  if (clean === null) return { ok: false, reason: "invalid" };

  await db
    .insert(schema.assessmentAnswers)
    .values({ attemptId, questionId, value: clean })
    .onConflictDoUpdate({
      target: [schema.assessmentAnswers.attemptId, schema.assessmentAnswers.questionId],
      set: { value: clean, answeredAt: new Date() },
    });
  return { ok: true };
}

export type CompleteResult =
  | { ok: true; report: Report }
  | { ok: false; reason: "not_found" }
  | { ok: false; reason: "missing"; missing: number };

/**
 * Идемпотентно: повторный вызов возвращает уже сохранённый результат и ничего не пересчитывает и не добавляет.
 */
export async function completeAttempt(userId: string, attemptId: string): Promise<CompleteResult> {
  const db = await getDb();
  const data = await getAttemptWithAnswers(userId, attemptId);
  if (!data) return { ok: false, reason: "not_found" };
  const { attempt, answers } = data;

  if (attempt.status === "completed") {
    const [saved] = await db
      .select()
      .from(schema.assessmentResults)
      .where(eq(schema.assessmentResults.attemptId, attemptId));
    if (saved) return { ok: true, report: saved.report as Report };
  }

  const def = getDefinition(attempt.slug, attempt.version);
  if (!def) return { ok: false, reason: "not_found" };
  const missing = requiredIds(def).filter((id) => answers[id] === undefined).length;
  if (missing > 0) return { ok: false, reason: "missing", missing };

  const report = buildReport(def, answers);
  await db.transaction(async (tx) => {
    await tx
      .insert(schema.assessmentResults)
      .values({ attemptId, report })
      .onConflictDoNothing({ target: schema.assessmentResults.attemptId });
    await tx
      .update(schema.assessmentAttempts)
      .set({ status: "completed", completedAt: new Date() })
      .where(and(eq(schema.assessmentAttempts.id, attemptId), eq(schema.assessmentAttempts.status, "in_progress")));
  });

  // Если параллельный запрос успел раньше, берём то, что он сохранил.
  const [saved] = await db
    .select()
    .from(schema.assessmentResults)
    .where(eq(schema.assessmentResults.attemptId, attemptId));
  return { ok: true, report: saved.report as Report };
}

export async function getReport(userId: string, attemptId: string) {
  const db = await getDb();
  const [row] = await db
    .select({
      report: schema.assessmentResults.report,
      completedAt: schema.assessmentAttempts.completedAt,
      slug: schema.assessmentAttempts.slug,
    })
    .from(schema.assessmentResults)
    .innerJoin(schema.assessmentAttempts, eq(schema.assessmentAttempts.id, schema.assessmentResults.attemptId))
    .where(and(eq(schema.assessmentAttempts.id, attemptId), eq(schema.assessmentAttempts.userId, userId)));
  return row ? { report: row.report as Report, completedAt: row.completedAt, slug: row.slug } : null;
}

export type TestStatus = {
  inProgress: { id: string; answered: number } | null;
  completed: { id: string; completedAt: Date | null }[];
};

/** Статусы всех тестов пользователя: незавершённая попытка с числом ответов и история завершённых. */
export async function getStatuses(userId: string): Promise<Record<string, TestStatus>> {
  const db = await getDb();
  const attempts = await db
    .select()
    .from(schema.assessmentAttempts)
    .where(eq(schema.assessmentAttempts.userId, userId))
    .orderBy(desc(schema.assessmentAttempts.startedAt));

  const activeIds = attempts.filter((a) => a.status === "in_progress").map((a) => a.id);
  const counts = activeIds.length
    ? await db
        .select({ attemptId: schema.assessmentAnswers.attemptId, n: count() })
        .from(schema.assessmentAnswers)
        .where(inArray(schema.assessmentAnswers.attemptId, activeIds))
        .groupBy(schema.assessmentAnswers.attemptId)
    : [];

  const out: Record<string, TestStatus> = {};
  for (const a of attempts) {
    const s = (out[a.slug] ??= { inProgress: null, completed: [] });
    if (a.status === "in_progress") {
      s.inProgress = { id: a.id, answered: counts.find((c) => c.attemptId === a.id)?.n ?? 0 };
    } else {
      s.completed.push({ id: a.id, completedAt: a.completedAt });
    }
  }
  return out;
}

export type { AnswerValue };
