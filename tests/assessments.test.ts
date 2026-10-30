import { beforeAll, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { catalog, getDefinition } from "@/modules/assessments/definitions";
import { buildReport, clientQuestions, OPEN_MAX, requiredIds, scoreAttempt, validateAnswer } from "@/modules/assessments/engine";
import * as svc from "@/modules/assessments/service";
import type { Answers, AssessmentDefinition, SingleQuestion } from "@/modules/assessments/types";
import { registerUser } from "@/modules/auth/service";
import { getDb, schema } from "@/server/db";

const defs = catalog();

describe("целостность определений тестов", () => {
  it("в каталоге три теста", () => {
    expect(defs.map((d) => d.slug).sort()).toEqual(["analytics", "management", "soft-skills"]);
  });

  for (const def of defs) {
    describe(def.title, () => {
      const keys = new Set(def.competencies.map((c) => c.key));

      it("id заданий уникальны, у вариантов нет повторов", () => {
        const ids = def.questions.map((q) => q.id);
        expect(new Set(ids).size).toBe(ids.length);
        for (const q of def.questions) {
          if (q.type === "scenario" || q.type === "single") {
            expect(new Set(q.options.map((o) => o.id)).size).toBe(q.options.length);
            expect(q.options.length).toBeGreaterThanOrEqual(3);
          }
        }
      });

      it("все баллы и задания ссылаются на существующие компетенции", () => {
        for (const q of def.questions) {
          if (q.type === "scenario") {
            for (const o of q.options) {
              for (const [k, v] of Object.entries(o.scores)) {
                expect(keys.has(k), `${q.id}: ${k}`).toBe(true);
                expect(v).toBeGreaterThanOrEqual(0);
                expect(v).toBeLessThanOrEqual(3);
              }
            }
          } else if (q.type === "single" || q.type === "likert") {
            expect(keys.has(q.competency), `${q.id}: ${q.competency}`).toBe(true);
          }
        }
      });

      it("у каждой компетенции есть хотя бы одно оцениваемое задание и тексты для отчёта", () => {
        const scored = scoreAttempt(def, {});
        const covered = new Set([...scored.situational, ...scored.objective].map((c) => c.key));
        for (const c of def.competencies) {
          expect(covered.has(c.key), `нет заданий для ${c.key}`).toBe(true);
          expect(c.develop.length).toBeGreaterThan(20);
          expect(c.exercises.length).toBeGreaterThanOrEqual(2);
          expect(c.careers.length).toBeGreaterThanOrEqual(2);
        }
      });
    });
  }

  it("в аналитическом тесте ровно один верный ответ в каждом задании", () => {
    const def = getDefinition("analytics")!;
    for (const q of def.questions as SingleQuestion[]) {
      expect(q.options.filter((o) => o.id === q.correct)).toHaveLength(1);
    }
  });

  it("в ситуационных заданиях нет варианта, лучшего по всем направлениям сразу", () => {
    for (const slug of ["soft-skills", "management"]) {
      const def = getDefinition(slug)!;
      for (const q of def.questions) {
        if (q.type !== "scenario") continue;
        const keys = new Set(q.options.flatMap((o) => Object.keys(o.scores)));
        const dominant = q.options.filter((o) =>
          q.options.every((p) => [...keys].every((k) => (o.scores[k] ?? 0) >= (p.scores[k] ?? 0))),
        );
        expect(dominant, `${q.id}: есть доминирующий вариант`).toHaveLength(0);
      }
    }
  });
});

describe("числовые задания пересчитаны независимо", () => {
  const def = getDefinition("analytics")!;
  const q = (id: string) => def.questions.find((x) => x.id === id) as SingleQuestion;
  const text = (qq: SingleQuestion) => qq.options.find((o) => o.id === qq.correct)!.text;

  it("рост продаж в процентах", () => {
    const rows = q("an-growth").table!.rows as [string, number, number][];
    const best = rows.map(([n, a, b]) => ({ n, pct: (b - a) / a })).sort((x, y) => y.pct - x.pct)[0];
    expect(best.n).toBe("Восток");
    expect(text(q("an-growth"))).toBe(best.n);
  });

  it("средняя цена штуки", () => {
    const rows = q("an-average").table!.rows as [string, number, number][];
    const avg = rows.reduce((s, [, n, p]) => s + n * p, 0) / rows.reduce((s, [, n]) => s + n, 0);
    expect(avg).toBe(450);
    expect(text(q("an-average"))).toContain("450");
  });

  it("плюс 20% и минус 20%", () => {
    expect(Math.round(1.2 * 0.8 * 100)).toBe(96);
    expect(text(q("an-percent"))).toContain("96%");
  });

  it("доход на час", () => {
    const rows = q("an-priority").table!.rows as [string, number, number][];
    const best = rows.map(([n, d, h]) => ({ n, v: d / h })).sort((x, y) => y.v - x.v)[0];
    expect(best.n).toBe("Б");
    expect(text(q("an-priority"))).toBe(best.n);
  });

  it("числовые ряды", () => {
    const s1 = [2, 3, 5, 9, 17];
    const diffs = s1.slice(1).map((v, i) => v - s1[i]);
    expect(diffs).toEqual([1, 2, 4, 8]);
    expect(17 + 16).toBe(33);
    expect(text(q("an-series1"))).toBe("33");
    const s2 = [4, 5, 8, 12];
    expect(s2.slice(2).every((v, i) => v === s2[i] + s2[i + 1] - 1)).toBe(true);
    expect(8 + 12 - 1).toBe(19);
    expect(text(q("an-series2"))).toBe("19");
  });

  it("противоречие: 5 + 6 меньше 12", () => {
    expect(5 + 6).toBeLessThan(12);
  });
});

function allCorrect(def: AssessmentDefinition): Answers {
  const a: Answers = {};
  for (const q of def.questions) {
    if (q.type === "single") a[q.id] = q.correct;
    else if (q.type === "scenario") a[q.id] = q.options[0].id;
    else if (q.type === "likert") a[q.id] = 5;
  }
  return a;
}

describe("подсчёт баллов", () => {
  const analytics = getDefinition("analytics")!;
  const soft = getDefinition("soft-skills")!;

  it("аналитика: все верно = 100%, все неверно = 0%", () => {
    const good = buildReport(analytics, allCorrect(analytics));
    expect(good.overallPercent).toBe(100);
    expect(good.correctCount).toEqual({ right: 11, total: 11 });
    const wrong: Answers = {};
    for (const q of analytics.questions as SingleQuestion[]) wrong[q.id] = q.options.find((o) => o.id !== q.correct)!.id;
    const bad = buildReport(analytics, wrong);
    expect(bad.overallPercent).toBe(0);
    expect(bad.correctCount).toEqual({ right: 0, total: 11 });
  });

  it("ровный профиль не порождает «сильные стороны»", () => {
    const r = buildReport(analytics, allCorrect(analytics));
    expect(r.flat).toBe(true);
    expect(r.strengths).toEqual([]);
    expect(r.growth).toEqual([]);
  });

  it("неровный профиль выделяет сильные стороны и зоны роста с рекомендациями", () => {
    const a: Answers = {};
    for (const q of analytics.questions as SingleQuestion[]) {
      a[q.id] = q.competency === "tab" ? q.correct : q.options.find((o) => o.id !== q.correct)!.id;
    }
    const r = buildReport(analytics, a);
    expect(r.flat).toBe(false);
    expect(r.strengths[0].key).toBe("tab");
    expect(r.strengths[0].careers?.length).toBeGreaterThan(0);
    expect(r.growth.every((g) => g.develop && g.exercises?.length)).toBe(true);
    expect(r.growth.some((g) => g.key === "tab")).toBe(false);
  });

  it("ситуации: баллы выбранного варианта делятся на максимум по направлению", () => {
    const q = soft.questions.find((x) => x.id === "ss-deadline")!;
    if (q.type !== "scenario") throw new Error();
    const s = scoreAttempt(soft, { "ss-deadline": "a" });
    // fbk во всём тесте встречается в нескольких заданиях; здесь отвечено одно, где выбранный вариант даёт максимум 3
    const fbk = s.situational.find((c) => c.key === "fbk")!;
    expect(fbk.points).toBe(3);
    const all = scoreAttempt(soft, {});
    expect(all.situational.find((c) => c.key === "fbk")!.max).toBe(fbk.max);
    expect(all.situational.every((c) => c.points === 0)).toBe(true);
  });

  it("самооценка: обратная шкала и отдельный блок", () => {
    const hi = scoreAttempt(soft, { "sl-cfl": 1, "sl-com": 5 });
    expect(hi.selfAssessment.find((c) => c.key === "cfl")!.percent).toBe(100);
    expect(hi.selfAssessment.find((c) => c.key === "com")!.percent).toBe(100);
    const lo = scoreAttempt(soft, { "sl-cfl": 5, "sl-com": 1 });
    expect(lo.selfAssessment.find((c) => c.key === "cfl")!.percent).toBe(0);
    // самооценка не попадает в основные баллы
    expect(buildReport(soft, { "sl-com": 5 }).competencies.some((c) => c.points > 0)).toBe(false);
  });

  it("свободные ответы не обязательны и не влияют на баллы", () => {
    const mgmt = getDefinition("management")!;
    expect(requiredIds(mgmt)).toHaveLength(9);
    const base = allCorrect(mgmt);
    const withOpen = { ...base, "mg-open-plan": "Мой план из трёх шагов" };
    expect(buildReport(mgmt, withOpen).overallPercent).toBe(buildReport(mgmt, base).overallPercent);
    expect(buildReport(mgmt, withOpen).openAnswers).toHaveLength(1);
    expect(buildReport(mgmt, withOpen).openAnswers[0].rubric.length).toBeGreaterThan(2);
  });

  it("отчёт аналитики объясняет ответы", () => {
    const r = buildReport(analytics, allCorrect(analytics));
    expect(r.review).toHaveLength(11);
    expect(r.review.every((x) => x.explain.length > 10)).toBe(true);
  });
});

describe("порядок заданий и защита ключей", () => {
  const def = getDefinition("soft-skills")!;

  it("один seed даёт один порядок, разные seed — разный", () => {
    const ids = (seed: number) => clientQuestions(def, seed).map((q) => q.id).join(",");
    expect(ids(7)).toBe(ids(7));
    expect(ids(7)).not.toBe(ids(8));
    expect(ids(7).split(",").sort()).toEqual(def.questions.map((q) => q.id).sort());
  });

  it("на клиент не уходят баллы, верные ответы и пояснения", () => {
    for (const d of defs) {
      const json = JSON.stringify(clientQuestions(d, 1));
      expect(json).not.toContain('"scores"');
      expect(json).not.toContain('"correct"');
      expect(json).not.toContain('"explain"');
      expect(json).not.toContain('"rubric"');
    }
  });

  it("проверка значения отклоняет чужие варианты и неверные типы", () => {
    const sc = def.questions.find((q) => q.type === "scenario")!;
    expect(validateAnswer(sc, "a")).toBe("a");
    expect(validateAnswer(sc, "zzz")).toBeNull();
    expect(validateAnswer(sc, 1)).toBeNull();
    const lk = def.questions.find((q) => q.type === "likert")!;
    expect(validateAnswer(lk, 3)).toBe(3);
    for (const bad of [0, 6, 3.5, "3", null, undefined]) expect(validateAnswer(lk, bad)).toBeNull();
    const open = { id: "o", type: "open" as const, prompt: "p", rubric: [] };
    expect(validateAnswer(open, " текст ")).toBe("текст");
    expect(validateAnswer(open, "x".repeat(OPEN_MAX + 1))).toBeNull();
  });
});

describe("прохождение в БД", () => {
  let alice: string;
  let bob: string;

  beforeAll(async () => {
    await getDb();
    const base = { password: "longenoughpass", acceptService: true as const, acceptMarketing: false };
    alice = (await registerUser({ ...base, fullName: "Alice", email: "alice-test@example.com", role: "employee" })).id;
    bob = (await registerUser({ ...base, fullName: "Bob", email: "bob-test@example.com", role: "employee" })).id;
  });

  it("незнакомый тест не стартует; повторный старт возвращает ту же попытку", async () => {
    expect(await svc.startOrResume(alice, "nope")).toBeNull();
    const a = await svc.startOrResume(alice, "analytics");
    const b = await svc.startOrResume(alice, "analytics");
    expect(a!.id).toBe(b!.id);
    expect(a!.version).toBe(1);
  });

  it("параллельный старт даёт одну попытку", async () => {
    const results = await Promise.all([1, 2, 3, 4].map(() => svc.startOrResume(bob, "soft-skills")));
    expect(new Set(results.map((r) => r!.id)).size).toBe(1);
    const db = await getDb();
    const rows = await db.select().from(schema.assessmentAttempts).where(eq(schema.assessmentAttempts.userId, bob));
    expect(rows.filter((r) => r.slug === "soft-skills")).toHaveLength(1);
  });

  it("ответы сохраняются, перезаписываются и возобновляются", async () => {
    const attempt = (await svc.startOrResume(alice, "analytics"))!;
    expect(await svc.saveAnswer(alice, attempt.id, "an-series1", "a")).toEqual({ ok: true });
    expect(await svc.saveAnswer(alice, attempt.id, "an-series1", "c")).toEqual({ ok: true });
    expect(await svc.saveAnswer(alice, attempt.id, "an-series1", "zzz")).toEqual({ ok: false, reason: "invalid" });
    expect(await svc.saveAnswer(alice, attempt.id, "no-such", "a")).toEqual({ ok: false, reason: "invalid" });
    const data = await svc.getAttemptWithAnswers(alice, attempt.id);
    expect(data!.answers).toEqual({ "an-series1": "c" });
    expect((await svc.getStatuses(alice)).analytics.inProgress).toMatchObject({ id: attempt.id, answered: 1 });
  });

  it("чужой пользователь не может сохранять, завершать и читать (IDOR)", async () => {
    const attempt = (await svc.startOrResume(alice, "analytics"))!;
    expect(await svc.saveAnswer(bob, attempt.id, "an-series1", "a")).toEqual({ ok: false, reason: "not_found" });
    expect(await svc.completeAttempt(bob, attempt.id)).toEqual({ ok: false, reason: "not_found" });
    expect(await svc.getAttemptWithAnswers(bob, attempt.id)).toBeNull();
    expect(await svc.getReport(bob, attempt.id)).toBeNull();
  });

  it("нельзя завершить с пропусками; завершение идемпотентно и не дублирует результат", async () => {
    const attempt = (await svc.startOrResume(alice, "analytics"))!;
    const early = await svc.completeAttempt(alice, attempt.id);
    expect(early).toMatchObject({ ok: false, reason: "missing", missing: 10 });

    const def = getDefinition("analytics")!;
    for (const q of def.questions as SingleQuestion[]) await svc.saveAnswer(alice, attempt.id, q.id, q.correct);

    const first = await svc.completeAttempt(alice, attempt.id);
    const second = await svc.completeAttempt(alice, attempt.id);
    const parallel = await Promise.all([svc.completeAttempt(alice, attempt.id), svc.completeAttempt(alice, attempt.id)]);
    expect(first.ok && second.ok && parallel.every((p) => p.ok)).toBe(true);
    if (first.ok && second.ok) expect(second.report).toEqual(first.report);

    const db = await getDb();
    const results = await db.select().from(schema.assessmentResults).where(eq(schema.assessmentResults.attemptId, attempt.id));
    expect(results).toHaveLength(1);

    // после завершения ответы менять нельзя
    expect(await svc.saveAnswer(alice, attempt.id, "an-series1", "a")).toEqual({ ok: false, reason: "finished" });
    const stored = await svc.getReport(alice, attempt.id);
    expect(stored!.report.overallPercent).toBe(100);
  });

  it("после завершения можно пройти тест снова, история сохраняется", async () => {
    const again = await svc.startOrResume(alice, "analytics");
    const statuses = await svc.getStatuses(alice);
    expect(again!.status).toBe("in_progress");
    expect(statuses.analytics.completed).toHaveLength(1);
    expect(statuses.analytics.inProgress?.id).toBe(again!.id);
  });

  it("попытка считается по версии методики, с которой начата", async () => {
    const attempt = (await svc.startOrResume(bob, "soft-skills"))!;
    expect(getDefinition(attempt.slug, attempt.version)).toBeDefined();
    expect(getDefinition("soft-skills", 99)).toBeUndefined();
  });
});
