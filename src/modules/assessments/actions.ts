"use server";

import { redirect } from "next/navigation";
import { z } from "zod";
import { requireEmployeeAccess } from "@/modules/billing/access";
import { rateLimit } from "@/modules/auth/rate-limit";
import { explainReport, reviewOpenAnswers, type ExplainResult, type OpenReviewResult } from "./ai";
import * as service from "./service";

const uuid = z.uuid();

export async function startAttemptAction(form: FormData): Promise<void> {
  const user = await requireEmployeeAccess();
  const slug = z.string().max(40).safeParse(form.get("slug"));
  if (!slug.success) redirect("/me/tests");
  const attempt = await service.startOrResume(user.id, slug.data);
  if (!attempt) redirect("/me/tests");
  redirect(`/me/tests/attempt/${attempt.id}`);
}

export type AnswerState = { ok: true } | { ok: false; error: string };

/** Вызывается из теста при каждом выборе: прогресс сохраняется сразу. */
export async function saveAnswerAction(attemptId: string, questionId: string, value: string | number): Promise<AnswerState> {
  const user = await requireEmployeeAccess();
  if (!uuid.safeParse(attemptId).success || typeof questionId !== "string" || questionId.length > 60) {
    return { ok: false, error: "Не удалось сохранить ответ." };
  }
  if (!(await rateLimit(`answer:${user.id}`, 600, 60 * 60 * 1000)).ok) {
    return { ok: false, error: "Слишком много запросов. Подождите немного." };
  }
  const res = await service.saveAnswer(user.id, attemptId, questionId, value);
  if (res.ok) return res;
  return {
    ok: false,
    error: res.reason === "finished" ? "Тест уже завершён." : "Не удалось сохранить ответ. Обновите страницу.",
  };
}

export async function completeAttemptAction(attemptId: string): Promise<AnswerState> {
  const user = await requireEmployeeAccess();
  if (!uuid.safeParse(attemptId).success) return { ok: false, error: "Тест не найден." };
  const res = await service.completeAttempt(user.id, attemptId);
  if (!res.ok) {
    return {
      ok: false,
      error:
        res.reason === "missing"
          ? `Остались неотвеченные задания: ${res.missing}. Ответьте на них, чтобы завершить тест.`
          : "Тест не найден.",
    };
  }
  redirect(`/me/tests/report/${attemptId}`);
}

/** AI-пояснение к своему результату. Права и согласие проверяются на сервере. */
export async function explainReportAction(attemptId: string, refresh = false): Promise<ExplainResult> {
  const user = await requireEmployeeAccess();
  if (!uuid.safeParse(attemptId).success) return { ok: false, error: "Результат не найден." };
  return explainReport(user.id, attemptId, refresh === true);
}

/** Разбор свободных ответов по рубрике. Только для своей попытки; согласие и лимиты проверяет AI-шлюз. */
export async function reviewOpenAnswersAction(attemptId: string): Promise<OpenReviewResult> {
  const user = await requireEmployeeAccess();
  if (!uuid.safeParse(attemptId).success) return { ok: false, error: "Результат не найден." };
  return reviewOpenAnswers(user.id, attemptId);
}
