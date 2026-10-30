import { afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { providers, type Provider, type ProviderRequest } from "@/modules/ai/providers";
import { resetRateLimits } from "@/modules/auth/rate-limit";
import { registerUser } from "@/modules/auth/service";
import { quoteContact, unlockContact } from "@/modules/billing/contacts";
import { setConsent } from "@/modules/consent/service";
import { estimateExperience, parseMonth } from "@/modules/matching/experience";
import { aiTextProblems, sensitiveFindings } from "@/modules/matching/rules";
import { passesFilter, scoreCandidate } from "@/modules/matching/score";
import * as match from "@/modules/matching/service";
import { findSkill, norm } from "@/modules/matching/skills";
import { analyzeVacancy } from "@/modules/vacancies/analyzer";
import * as vac from "@/modules/vacancies/service";
import { emptyContent } from "@/modules/resume/content";
import * as resumes from "@/modules/resume/service";
import * as visibility from "@/modules/visibility/service";
import { getDb, schema } from "@/server/db";

const original = { ...providers };
let n = 0;

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

type CandOpts = {
  skills?: string[];
  experience?: { position: string; start: string; end: string; description?: string }[];
  workFormat?: "office" | "hybrid" | "remote" | null;
  publish?: boolean;
  share?: boolean;
  about?: string;
};

async function candidate(o: CandOpts = {}) {
  const i = ++n;
  const u = await registerUser({ fullName: `Иван Петров ${i}`, email: `mc-${i}@example.com`, password: "longenoughpass", role: "employee", acceptService: true, acceptMarketing: false });
  const db = await getDb();
  await db
    .update(schema.employeeProfiles)
    .set({ headline: "Разработчик", city: "Казань", desiredRole: "Backend", workFormat: o.workFormat === undefined ? "remote" : o.workFormat, about: o.about ?? "Пишу сервисы." })
    .where(eq(schema.employeeProfiles.userId, u.id));
  const c = emptyContent({ fullName: `Иван Петров ${i}`, email: `resume-${i}@example.com`, phone: "+7 900 123-45-67", headline: "Dev" });
  c.skills = o.skills ?? ["TypeScript", "PostgreSQL"];
  c.experience = (o.experience ?? [{ position: "Backend", start: "2019-01", end: "2023-01" }]).map((e) => ({ company: "Компания", description: "", ...e }));
  const r = await resumes.createResume(u.id, { title: "Резюме", content: c, source: "manual", reviewNotes: [] });
  if (o.publish !== false) await visibility.publishProfile(u.id, { resumeVersionId: r.versionId, acceptPublication: true });
  if (o.share) await visibility.saveSharing(u.id, { shareEmail: true, sharePhone: false, acceptSharing: true });
  return { id: u.id, versionId: r.versionId };
}

async function employer(opts: { subscription?: boolean; included?: number } = {}) {
  const db = await getDb();
  const [u] = await db.insert(schema.users).values({ email: `me-${++n}@example.com`, passwordHash: "x", role: "employer" }).returning({ id: schema.users.id });
  if (opts.subscription !== false) {
    await db.insert(schema.subscriptions).values({
      userId: u.id,
      periodStart: new Date(Date.now() - 86_400_000),
      periodEnd: new Date(Date.now() + 29 * 86_400_000),
      priceKopecks: 100_000,
      includedContacts: opts.included ?? 50,
      extraContactKopecks: 20_000,
    });
  }
  return u.id;
}

const input = (o: Partial<Record<string, string>> = {}) =>
  vac.vacancyInputSchema.parse({
    title: "Backend-разработчик",
    tasks: "Разрабатывать сервисы на TypeScript, поддерживать PostgreSQL.",
    mustSkills: "TypeScript, PostgreSQL",
    niceSkills: "Docker",
    minExperienceYears: "3",
    level: "middle",
    workFormat: "remote",
    city: "",
    salaryFrom: "",
    salaryTo: "",
    extra: "",
    ...o,
  });

async function publishedVacancy(employerId: string, o: Partial<Record<string, string>> = {}) {
  const created = await vac.createVacancy(employerId, input(o));
  if (!created.ok) throw new Error(created.error);
  expect(await vac.submitVacancy(employerId, created.id)).toEqual({ ok: true });
  const [admin] = await (await getDb()).insert(schema.users).values({ email: `adm-${++n}@example.com`, passwordHash: "x", role: "admin" }).returning({ id: schema.users.id });
  expect(await vac.moderateVacancy(admin.id, created.id, { approve: true })).toEqual({ ok: true });
  return { id: created.id, adminId: admin.id };
}

beforeAll(async () => {
  await getDb();
});
beforeEach(() => {
  resetRateLimits();
  delete process.env.ANTHROPIC_API_KEY;
});
afterEach(() => {
  Object.assign(providers, original);
});

describe("чистая логика подбора", () => {
  it("навыки: целое слово, синонимы, раздел навыков и текст", () => {
    const src = { listed: ["javascript", "react (hooks)"].map(norm), text: norm("Писал сервисы на k8s и Node.js") };
    expect(findSkill("JS", src)).toBe("skills");
    expect(findSkill("React", src)).toBe("skills");
    expect(findSkill("Kubernetes", src)).toBe("text");
    expect(findSkill("Node", src)).toBe("text");
    expect(findSkill("Java", src)).toBeNull(); // «java» не находится внутри «javascript»
    expect(findSkill("Docker", src)).toBeNull();
  });

  it("стаж: объединение интервалов, настоящее время, непонятные даты не угадываются", () => {
    const now = new Date(Date.UTC(2026, 9, 1));
    expect(parseMonth("03.2020", now)).toBe(2020 * 12 + 2);
    expect(parseMonth("март 2020", now)).toBe(2020 * 12 + 2);
    expect(parseMonth("по н.в.", now)).toBe(2026 * 12 + 9);
    expect(parseMonth("давно", now)).toBeNull();
    const e = estimateExperience(
      [
        { start: "2018-01", end: "2020-12" }, // 3 года
        { start: "2020-01", end: "2021-12" }, // пересекается: итого 2018-01..2021-12 = 4 года
        { start: "неизвестно", end: "" },
      ],
      now,
    );
    expect(e).toEqual({ years: 4, parsed: 2, total: 3 });
    expect(estimateExperience([{ start: "2020", end: "" }], now).years).toBeNull(); // пустой конец — не «до сегодня»
  });

  it("признаки, по которым нельзя подбирать, находятся в тексте вакансии и ответах AI", () => {
    expect(sensitiveFindings("Ищем только мужчин до 30 лет, без детей")).toEqual(expect.arrayContaining(["пол", "возраст", "семейное положение"]));
    expect(sensitiveFindings("Разработка сервисов на TypeScript, опыт от 3 лет")).toEqual([]);
    expect(aiTextProblems("Вероятность найма высокая")).not.toEqual([]);
    expect(aiTextProblems("Опыт соотносится с задачами вакансии.")).toEqual([]);
  });

  it("оценка: подтверждённое, пробелы и развитие раздельно; неизвестный стаж не штрафуется молча", () => {
    const card = {
      candidateId: "x",
      headline: "Dev",
      city: "",
      desiredRole: "",
      workFormat: "office",
      about: "",
      resume: { ...emptyContent(), skills: ["TypeScript"], experience: [{ company: "", position: "Dev", start: "2022-01", end: "2023-12", description: "PostgreSQL" }] },
    };
    const s = scoreCandidate({ mustSkills: ["TypeScript", "PostgreSQL", "Go"], niceSkills: ["Docker"], minExperienceYears: 4, workFormat: "remote" }, card, new Date(Date.UTC(2026, 0, 1)));
    expect(s.mustMatched).toBe(2);
    expect(s.explanation.confirmed.join("\n")).toContain("«PostgreSQL»: упоминается в описании");
    expect(s.explanation.gaps.join("\n")).toContain("«Go»");
    expect(s.explanation.gaps.join("\n")).toContain("Стаж по датам");
    expect(s.explanation.develop.join("\n")).toContain("Docker");
    expect(s.score).toBeGreaterThan(0);
    expect(s.score).toBeLessThan(100);
    expect(passesFilter(s, false)).toBe(false);
    expect(passesFilter(s, true)).toBe(true);

    const noDates = scoreCandidate({ mustSkills: ["TypeScript"], niceSkills: [], minExperienceYears: 4, workFormat: null }, { ...card, resume: { ...card.resume, experience: [] } });
    expect(noDates.explanation.notes.join("\n")).toContain("стаж не учтён");
    expect(noDates.score).toBe(100);
  });
});

describe("вакансии", () => {
  it("создание, правка и отправка требуют действующей подписки; чужую вакансию не видно", async () => {
    const free = await employer({ subscription: false });
    expect(await vac.createVacancy(free, input())).toEqual({ ok: false, error: "no_subscription" });

    const a = await employer();
    const b = await employer();
    const created = await vac.createVacancy(a, input());
    if (!created.ok) throw new Error("create");
    expect(await vac.getOwnVacancy(b, created.id)).toBeNull();
    expect(await vac.updateVacancy(b, created.id, input({ title: "Взлом" }))).toEqual({ ok: false, error: "not_found" });
    expect(await vac.submitVacancy(b, created.id)).toEqual({ ok: false, error: "not_found" });
    expect(await vac.closeVacancy(b, created.id)).toEqual({ ok: false, error: "not_found" });
    expect(await vac.getOwnVacancy(a, "not-a-uuid")).toBeNull();

    // подписка закончилась: правка и отправка закрыты, закрыть можно
    const db = await getDb();
    await db.update(schema.subscriptions).set({ periodEnd: new Date(Date.now() - 1000) }).where(eq(schema.subscriptions.userId, a));
    expect(await vac.updateVacancy(a, created.id, input())).toEqual({ ok: false, error: "no_subscription" });
    expect(await vac.submitVacancy(a, created.id)).toEqual({ ok: false, error: "no_subscription" });
    expect(await vac.closeVacancy(a, created.id)).toEqual({ ok: true });
  });

  it("проверки формы: вилка, навыки списком без дублей и синонимов", () => {
    expect(vac.vacancyInputSchema.safeParse({ ...input(), salaryFrom: "200000", salaryTo: "100000" }).success).toBe(false);
    const ok = input({ mustSkills: "JS, javascript;  TypeScript\nts, " });
    expect(ok.mustSkills).toEqual(["JS", "TypeScript"]);
    expect(vac.vacancyInputSchema.safeParse({ ...input(), title: "ab" }).success).toBe(false);
  });

  it("публикация: неполная и дискриминационная вакансии не уходят на модерацию; модерация одобряет и отклоняет", async () => {
    const e = await employer();
    const empty = await vac.createVacancy(e, input({ tasks: "коротко", mustSkills: "" }));
    if (!empty.ok) throw new Error("create");
    expect(await vac.submitVacancy(e, empty.id)).toMatchObject({ ok: false, error: "incomplete" });

    const bad = await vac.createVacancy(e, input({ extra: "Ищем только мужчин до 30 лет" }));
    if (!bad.ok) throw new Error("create");
    expect(await vac.submitVacancy(e, bad.id)).toMatchObject({ ok: false, error: "sensitive", details: expect.arrayContaining(["пол", "возраст"]) });

    const good = await vac.createVacancy(e, input());
    if (!good.ok) throw new Error("create");
    expect(await vac.submitVacancy(e, good.id)).toEqual({ ok: true });
    expect((await vac.getOwnVacancy(e, good.id))!.status).toBe("pending");
    expect(await vac.updateVacancy(e, good.id, input())).toEqual({ ok: false, error: "bad_status" }); // на модерации не правится

    const [admin] = await (await getDb()).insert(schema.users).values({ email: `adm-${++n}@example.com`, passwordHash: "x", role: "admin" }).returning({ id: schema.users.id });
    expect(await vac.moderateVacancy(admin.id, good.id, { approve: false, note: "Уточните задачи" })).toEqual({ ok: true });
    const rejected = (await vac.getOwnVacancy(e, good.id))!;
    expect(rejected).toMatchObject({ status: "rejected", moderationNote: "Уточните задачи" });

    expect(await vac.updateVacancy(e, good.id, input({ title: "Backend v2" }))).toEqual({ ok: true });
    expect((await vac.getOwnVacancy(e, good.id))!.status).toBe("draft");
    expect(await vac.moderateVacancy(admin.id, good.id, { approve: true })).toEqual({ ok: false, error: "bad_status" }); // черновик не одобряется

    await vac.submitVacancy(e, good.id);
    expect(await vac.moderateVacancy(admin.id, good.id, { approve: true })).toEqual({ ok: true });
    expect((await vac.getOwnVacancy(e, good.id))!.status).toBe("published");
    expect(await vac.closeVacancy(e, good.id)).toEqual({ ok: true });
    expect(await vac.reopenVacancy(e, good.id)).toEqual({ ok: true });
    expect((await vac.getOwnVacancy(e, good.id))!.status).toBe("draft");

    const types = (await (await getDb()).select().from(schema.auditEvents)).map((a) => a.type);
    expect(types).toEqual(expect.arrayContaining(["vacancy.submitted", "vacancy.rejected", "vacancy.approved", "vacancy.closed"]));
  });

  it("лимит одновременно открытых вакансий", async () => {
    const e = await employer();
    for (let i = 0; i < vac.MAX_OPEN_VACANCIES; i++) expect((await vac.createVacancy(e, input())).ok).toBe(true);
    expect(await vac.createVacancy(e, input())).toEqual({ ok: false, error: "limit" });
  });
});

describe("AI-анализ вакансии", () => {
  it("без AI — честная проверка по правилам с пометкой", async () => {
    const e = await employer();
    const created = await vac.createVacancy(e, input({ minExperienceYears: "" }));
    if (!created.ok) throw new Error("create");
    const res = await analyzeVacancy(e, created.id);
    if (!res.ok) throw new Error("analyze");
    expect(res.analysis.source).toBe("rules");
    expect(res.aiNote).toContain("AI не подключён");
    expect(res.analysis.issues.join("\n")).toContain("опыт");
    expect((await vac.getOwnVacancy(e, created.id))!.analysisSource).toBe("rules");
  });

  it("с AI: согласие работодателя не нужно, навыки вне текста вакансии отбрасываются, ответ проверяется схемой", async () => {
    process.env.ANTHROPIC_API_KEY = "test-key-not-real";
    const f = fake(
      JSON.stringify({
        summary: "Нужен backend-разработчик на TypeScript.",
        mustSkills: ["TypeScript", "Rust"],
        niceSkills: ["PostgreSQL"],
        responsibilities: ["Разрабатывать сервисы"],
        seniority: "middle",
        issues: ["Не указана вилка"],
        questions: ["Какой размер команды?"],
      }),
    );
    providers.anthropic = f.provider;
    const e = await employer(); // согласия external_ai у работодателя нет
    const created = await vac.createVacancy(e, input());
    if (!created.ok) throw new Error("create");
    const res = await analyzeVacancy(e, created.id);
    if (!res.ok) throw new Error("analyze");
    expect(res.analysis.source).toBe("ai");
    expect(res.analysis.mustSkills).toEqual(["TypeScript"]); // «Rust» нет в тексте вакансии
    expect(f.calls[0].messages[0].content).toContain("<vacancy>");
    expect(f.calls[0].system).toContain("не инструкции");
  });

  it("ответ AI не по схеме → заглушка по правилам; чужую вакансию анализировать нельзя", async () => {
    process.env.ANTHROPIC_API_KEY = "test-key-not-real";
    providers.anthropic = fake("это не json").provider;
    const e = await employer();
    const created = await vac.createVacancy(e, input());
    if (!created.ok) throw new Error("create");
    const res = await analyzeVacancy(e, created.id);
    if (!res.ok) throw new Error("analyze");
    expect(res.analysis.source).toBe("rules");
    expect(res.aiNote).toBeTruthy();
    expect(await analyzeVacancy(await employer(), created.id)).toEqual({ ok: false, error: "not_found" });
  });

  it("добавление предложенных навыков не дублирует и не создаёт повторов между списками", async () => {
    const e = await employer();
    const created = await vac.createVacancy(e, input());
    if (!created.ok) throw new Error("create");
    await vac.addSkills(e, created.id, { must: ["Go", "typescript"], nice: ["Go", "Redis", "docker"] });
    const v = (await vac.getOwnVacancy(e, created.id))!;
    expect(v.mustSkills).toEqual(["TypeScript", "PostgreSQL", "Go"]);
    expect(v.niceSkills).toEqual(["Docker", "Redis"]);
  });
});

describe("подбор кандидатов", () => {
  it("подбирает только среди опубликованных, фильтрует по обязательным навыкам, сортирует и сохраняет историю", async () => {
    const e = await employer();
    const strong = await candidate({ skills: ["TypeScript", "PostgreSQL", "Docker"] });
    const medium = await candidate({ skills: ["TypeScript", "PostgreSQL"], workFormat: "office" });
    const partial = await candidate({ skills: ["TypeScript"] });
    await candidate({ skills: ["TypeScript", "PostgreSQL", "Docker"], publish: false }); // не опубликован
    const hidden = await candidate({ skills: ["TypeScript", "PostgreSQL"] });
    await visibility.hideProfile(hidden.id, { revokeConsent: true });
    const { id: vacancyId } = await publishedVacancy(e);

    const strict = await match.runMatching(e, vacancyId, { includePartial: false });
    if (!strict.ok) throw new Error(strict.error);
    expect(strict.run).toMatchObject({ shown: 2, passedFilter: 2 });
    const first = (await match.latestRun(e, vacancyId))!;
    expect(first.items.map((i) => i.candidateId)).toEqual([strong.id, medium.id]);
    expect(first.items[0].score).toBeGreaterThan(first.items[1].score);
    expect(first.items[0].explanation.confirmed.join("\n")).toContain("«Docker»");
    expect(first.items[1].explanation.gaps.join("\n")).toContain("Формат работы");
    expect(first.items[1].explanation.develop.join("\n")).toContain("Docker");

    const withPartial = await match.runMatching(e, vacancyId, { includePartial: true });
    if (!withPartial.ok) throw new Error("run");
    expect(withPartial.run.shown).toBe(3);
    const second = (await match.latestRun(e, vacancyId))!;
    expect(second.items.map((i) => i.candidateId)).toContain(partial.id);
    expect(second.items.find((i) => i.candidateId === partial.id)!.explanation.gaps.join("\n")).toContain("«PostgreSQL»");

    // история: оба запуска сохранены, версия алгоритма записана
    const db = await getDb();
    const rows = await db.select().from(schema.matchRecommendations).where(eq(schema.matchRecommendations.vacancyId, vacancyId));
    expect(rows).toHaveLength(5);
    expect(new Set(rows.map((r) => r.runId)).size).toBe(2);
    expect(rows.every((r) => r.algorithmVersion === "rules-1")).toBe(true);
    // в истории нет персональных данных кандидата
    const dump = JSON.stringify(rows);
    expect(dump).not.toContain("Иван Петров");
    expect(dump).not.toContain("example.com");
    expect(dump).not.toContain("+7 900");
  });

  it("скрытый после запуска профиль пропадает из выдачи и не доступен по рекомендации", async () => {
    const e = await employer();
    const c = await candidate();
    const { id } = await publishedVacancy(e);
    await match.runMatching(e, id, { includePartial: false });
    expect((await match.recommendationFor(e, id, c.id))!.candidateId).toBe(c.id);
    await visibility.hideProfile(c.id, { revokeConsent: false });
    const run = (await match.latestRun(e, id))!;
    expect(run.items.map((i) => i.candidateId)).not.toContain(c.id);
    expect(run.hidden).toBe(1);
    expect(await match.recommendationFor(e, id, c.id)).toBeNull();
  });

  it("права: нужна подписка, опубликованная своя вакансия; чужие данные недоступны", async () => {
    const a = await employer();
    const b = await employer();
    const c = await candidate();
    const { id } = await publishedVacancy(a);
    const draft = await vac.createVacancy(a, input());
    if (!draft.ok) throw new Error("create");

    expect(await match.runMatching(b, id, { includePartial: false })).toEqual({ ok: false, error: "not_found" });
    expect(await match.runMatching(a, draft.id, { includePartial: false })).toEqual({ ok: false, error: "bad_status" });
    expect(await match.latestRun(b, id)).toBeNull();
    await match.runMatching(a, id, { includePartial: false });
    expect(await match.recommendationFor(b, id, c.id)).toBeNull();

    const db = await getDb();
    await db.update(schema.subscriptions).set({ periodEnd: new Date(Date.now() - 1000) }).where(eq(schema.subscriptions.userId, a));
    expect(await match.runMatching(a, id, { includePartial: false })).toEqual({ ok: false, error: "no_subscription" });
  });

  it("результаты тестов не участвуют: даже если кандидат разрешил, рекомендация их не содержит", async () => {
    const e = await employer();
    const c = await candidate();
    const db = await getDb();
    await db.update(schema.profileVisibility).set({ shareTestResults: true }).where(eq(schema.profileVisibility.userId, c.id));
    const { id } = await publishedVacancy(e);
    await match.runMatching(e, id, { includePartial: false });
    const rec = (await match.recommendationFor(e, id, c.id))!;
    expect(JSON.stringify(rec)).not.toMatch(/assessment|report|percent|компетенц/i);
  });
});

describe("AI-вывод по кандидату", () => {
  async function setup(aiConsent: boolean) {
    const e = await employer();
    const c = await candidate({ about: "Звоните +7 900 111-22-33 или пишите ivan@example.org" });
    if (aiConsent) await setConsent(c.id, "ai_matching", true);
    const { id } = await publishedVacancy(e);
    await match.runMatching(e, id, { includePartial: false });
    const rec = (await match.recommendationFor(e, id, c.id))!;
    return { e, c, rec };
  }
  const good = JSON.stringify({ summary: "Опыт backend-разработки соотносится с задачами вакансии.", transferable: ["Опыт работы с БД"], toVerify: ["Опыт с Docker?"] });

  it("AI не настроен → явный отказ без вызова провайдера", async () => {
    const { e, rec } = await setup(true);
    expect(await match.explainWithAi(e, rec.id)).toEqual({ ok: false, error: "not_configured" });
  });

  it("без разрешения кандидата данные провайдеру не уходят", async () => {
    process.env.ANTHROPIC_API_KEY = "test-key-not-real";
    const f = fake(good);
    providers.anthropic = f.provider;
    const { e, rec } = await setup(false);
    expect(await match.explainWithAi(e, rec.id)).toEqual({ ok: false, error: "no_candidate_consent" });
    expect(f.calls).toHaveLength(0);
  });

  it("с разрешением: отправляется карточка без имени и контактов, вывод сохраняется отдельно от данных", async () => {
    process.env.ANTHROPIC_API_KEY = "test-key-not-real";
    const f = fake(good);
    providers.anthropic = f.provider;
    const { e, c, rec } = await setup(true);
    const res = await match.explainWithAi(e, rec.id);
    expect(res).toMatchObject({ ok: true, ai: { summary: expect.stringContaining("backend") } });
    const sent = JSON.stringify(f.calls[0]);
    for (const secret of ["Иван", "Петров", "example", "+7 900", "111-22-33", c.id]) expect(sent).not.toContain(secret);
    expect(sent).toContain("[скрыто]");
    expect((await match.recommendationFor(e, await vacancyOf(rec.id), c.id))!.ai).toMatchObject({ transferable: ["Опыт работы с БД"] });
  });

  it("ответ с недопустимыми формулировками не сохраняется; чужой работодатель не может запросить", async () => {
    process.env.ANTHROPIC_API_KEY = "test-key-not-real";
    providers.anthropic = fake(JSON.stringify({ summary: "Вероятность найма высокая.", transferable: [], toVerify: [] })).provider;
    const { e, rec } = await setup(true);
    expect(await match.explainWithAi(e, rec.id)).toMatchObject({ ok: false, error: "rejected" });
    expect(await match.explainWithAi(await employer(), rec.id)).toEqual({ ok: false, error: "not_found" });
  });
});

async function vacancyOf(recId: string): Promise<string> {
  const db = await getDb();
  const [r] = await db.select().from(schema.matchRecommendations).where(eq(schema.matchRecommendations.id, recId));
  return r.vacancyId;
}

describe("жалобы на рекомендации", () => {
  it("жалоба сохраняется один раз, чужую рекомендацию оспорить нельзя, администратор закрывает", async () => {
    const e = await employer();
    const other = await employer();
    const c = await candidate();
    const { id, adminId } = await publishedVacancy(e);
    await match.runMatching(e, id, { includePartial: false });
    const rec = (await match.recommendationFor(e, id, c.id))!;

    expect(await match.reportRecommendation(other, rec.id, { reason: "wrong_match", comment: "" })).toEqual({ ok: false, error: "not_found" });
    expect(await match.reportRecommendation(e, rec.id, { reason: "wrong_facts", comment: "Нет такого навыка" })).toEqual({ ok: true, already: false });
    expect(await match.reportRecommendation(e, rec.id, { reason: "other", comment: "" })).toEqual({ ok: true, already: true });
    expect(await match.hasReported(e, rec.id)).toBe(true);

    const list = await match.listReports();
    expect(list).toHaveLength(1);
    expect(list[0]).toMatchObject({ vacancyTitle: "Backend-разработчик", report: { status: "open", reason: "wrong_facts" } });
    expect(await match.resolveReport(adminId, list[0].report.id, "Проверено")).toBe(true);
    expect(await match.resolveReport(adminId, list[0].report.id, "")).toBe(false);
  });
});

describe("контакты и удаление данных", () => {
  it("контакты можно открыть только если кандидат их разрешил; лимит 50 включённых, затем платный", async () => {
    const closed = await candidate({ share: false });
    const open = await candidate({ share: true });
    expect(await visibility.contactsShareable(closed.id)).toBe(false);
    expect(await visibility.contactsShareable(open.id)).toBe(true);

    const e = await employer({ included: 1 });
    expect(await quoteContact(e, open.id)).toMatchObject({ state: "included", used: 0, included: 1 });
    expect(await unlockContact(e, open.id)).toMatchObject({ state: "unlocked", used: 1 });
    const second = await candidate({ share: true });
    expect(await quoteContact(e, second.id)).toEqual({ state: "payment_required", priceKopecks: 20_000 });
    expect((await visibility.getCandidateForEmployer(e, open.id))!.contacts).toMatchObject({ email: expect.stringContaining("resume-") });
    expect((await visibility.getCandidateForEmployer(e, second.id))!.contacts).toBeNull();
  });

  it("удаление аккаунта кандидата убирает его рекомендации, работодателя — вакансии и историю", async () => {
    const reg = await registerUser({ fullName: "Работодатель", email: `mc-emp-${++n}@example.com`, password: "longenoughpass", role: "employer", acceptService: true, acceptMarketing: false });
    const db = await getDb();
    await db.insert(schema.subscriptions).values({
      userId: reg.id,
      periodStart: new Date(Date.now() - 86_400_000),
      periodEnd: new Date(Date.now() + 29 * 86_400_000),
      priceKopecks: 100_000,
      includedContacts: 50,
      extraContactKopecks: 20_000,
    });
    const c = await candidate();
    const other = await candidate();
    const { id } = await publishedVacancy(reg.id);
    await match.runMatching(reg.id, id, { includePartial: false });
    const forCandidate = async (uid: string) =>
      (await db.select().from(schema.matchRecommendations).where(eq(schema.matchRecommendations.candidateUserId, uid))).length;
    expect(await forCandidate(c.id)).toBe(1);

    expect(await visibility.deleteAccount(c.id, "longenoughpass")).toEqual({ ok: true });
    expect(await forCandidate(c.id)).toBe(0);
    expect(await forCandidate(other.id)).toBe(1); // чужие рекомендации не тронуты

    expect(await visibility.deleteAccount(reg.id, "longenoughpass")).toEqual({ ok: true });
    expect(await forCandidate(other.id)).toBe(0);
    expect(await db.select().from(schema.vacancies).where(eq(schema.vacancies.employerUserId, reg.id))).toHaveLength(0);
  });
});
