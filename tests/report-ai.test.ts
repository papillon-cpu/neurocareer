import { afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { commentaryInput, explainReport, unknownPercents } from "@/modules/assessments/ai";
import { getDefinition } from "@/modules/assessments/definitions";
import * as svc from "@/modules/assessments/service";
import { providers, type Provider, type ProviderRequest } from "@/modules/ai/providers";
import { resetRateLimits } from "@/modules/auth/rate-limit";
import { registerUser } from "@/modules/auth/service";
import { setConsent } from "@/modules/consent/service";
import { getDb } from "@/server/db";
import type { SingleQuestion } from "@/modules/assessments/types";

const original = { ...providers };

function fake(text: string): { provider: Provider; calls: ProviderRequest[] } {
  const calls: ProviderRequest[] = [];
  return {
    calls,
    provider: {
      async complete(req) {
        calls.push(req);
        return { text, inputTokens: 5, outputTokens: 5 };
      },
    },
  };
}

const good = JSON.stringify({
  summary: "В ответах проявилось уверенное владение числовыми заданиями: верно 11 из 11.",
  strengths: "Результат по таблицам составил 100%.",
  growth: "",
  nextSteps: ["Раз в неделю решайте по одному заданию на причины и следствия."],
});

let counter = 0;
async function completedAttempt(consent = true) {
  const n = ++counter;
  const u = await registerUser({
    fullName: `Report ${n}`,
    email: `report-${n}@example.com`,
    password: "longenoughpass",
    role: "employee",
    acceptService: true,
    acceptMarketing: false,
  });
  if (consent) await setConsent(u.id, "external_ai", true);
  const attempt = (await svc.startOrResume(u.id, "analytics"))!;
  const def = getDefinition("analytics")!;
  for (const q of def.questions as SingleQuestion[]) await svc.saveAnswer(u.id, attempt.id, q.id, q.correct);
  await svc.completeAttempt(u.id, attempt.id);
  return { userId: u.id, attemptId: attempt.id };
}

beforeAll(async () => {
  await getDb();
});
beforeEach(() => {
  resetRateLimits();
  process.env.ANTHROPIC_API_KEY = "test-key-not-real";
});
afterEach(() => {
  Object.assign(providers, original);
});

describe("AI-пояснение к отчёту", () => {
  it("создаёт пояснение, сохраняет его и больше не обращается к провайдеру", async () => {
    const f = fake(good);
    providers.anthropic = f.provider;
    const { userId, attemptId } = await completedAttempt();

    const first = await explainReport(userId, attemptId);
    expect(first).toMatchObject({ ok: true, cached: false });
    const second = await explainReport(userId, attemptId);
    expect(second).toMatchObject({ ok: true, cached: true });
    expect(f.calls).toHaveLength(1);

    const saved = await svc.getReport(userId, attemptId);
    expect(saved!.aiCommentary).toMatchObject({ summary: expect.stringContaining("11 из 11") });

    await explainReport(userId, attemptId, true);
    expect(f.calls).toHaveLength(2);
  });

  it("провайдеру уходят только расчётные показатели", async () => {
    const f = fake(good);
    providers.anthropic = f.provider;
    const { userId, attemptId } = await completedAttempt();
    await explainReport(userId, attemptId);
    const sent = f.calls[0].messages[0].content;
    expect(sent).toContain("<report>");
    for (const forbidden of ["review", "openAnswers", "explain", "email", "@", "Report "]) {
      expect(sent).not.toContain(forbidden);
    }
    const report = (await svc.getReport(userId, attemptId))!.report;
    expect(Object.keys(commentaryInput(report)).sort()).toEqual(
      ["competencies", "correct", "flat", "growth", "kind", "overallPercent", "selfAssessment", "strengths", "test"].sort(),
    );
  });

  it("отклоняет пояснение с выдуманным процентом", async () => {
    providers.anthropic = fake(JSON.stringify({ ...JSON.parse(good), summary: "Результат 87% говорит о многом." })).provider;
    const { userId, attemptId } = await completedAttempt();
    const res = await explainReport(userId, attemptId);
    expect(res.ok).toBe(false);
    expect((await svc.getReport(userId, attemptId))!.aiCommentary).toBeNull();
  });

  it("отклоняет диагнозы, IQ и выводы о пригодности", async () => {
    for (const bad of ["Это говорит о высоком IQ.", "У вас, возможно, депрессия.", "Вы пригодны для руководящей работы."]) {
      providers.anthropic = fake(JSON.stringify({ ...JSON.parse(good), growth: bad })).provider;
      const { userId, attemptId } = await completedAttempt();
      expect((await explainReport(userId, attemptId)).ok).toBe(false);
    }
  });

  it("без согласия и для чужого результата данные не уходят", async () => {
    const f = fake(good);
    providers.anthropic = f.provider;
    const noConsent = await completedAttempt(false);
    expect((await explainReport(noConsent.userId, noConsent.attemptId)).ok).toBe(false);

    const owner = await completedAttempt();
    const other = await completedAttempt();
    expect(await explainReport(other.userId, owner.attemptId)).toEqual({ ok: false, error: "Результат не найден." });
    expect(f.calls).toHaveLength(0);
  });

  it("проверка процентов", () => {
    expect(unknownPercents("Вышло 45% и 100 %.", [45, 100])).toEqual([]);
    expect(unknownPercents("Вышло 46%.", [45])).toEqual(["46"]);
    expect(unknownPercents("Три шага по 30 минут.", [])).toEqual([]);
  });
});
