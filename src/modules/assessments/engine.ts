import type {
  AnswerValue,
  Answers,
  AssessmentDefinition,
  CompetencyScore,
  Question,
  Report,
  ReportItem,
  Scores,
} from "./types";

/* ---------- порядок заданий ---------- */

function mulberry32(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function shuffled<T>(items: T[], rnd: () => number): T[] {
  const a = [...items];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rnd() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

export type ClientQuestion =
  | { id: string; type: "scenario" | "single"; prompt: string; table?: { headers: string[]; rows: (string | number)[][] }; options: { id: string; text: string }[] }
  | { id: string; type: "likert"; statement: string }
  | { id: string; type: "open"; prompt: string };

/**
 * Порядок заданий и вариантов зависит только от seed попытки, поэтому при возобновлении теста
 * человек видит всё в том же порядке. Ключи проверки и баллы сюда не попадают.
 */
export function clientQuestions(def: AssessmentDefinition, seed: number): ClientQuestion[] {
  const rnd = mulberry32(seed);
  return shuffled(def.questions, rnd).map((q): ClientQuestion => {
    switch (q.type) {
      case "scenario":
        return { id: q.id, type: "scenario", prompt: q.prompt, options: shuffled(q.options, rnd).map(({ id, text }) => ({ id, text })) };
      case "single":
        return {
          id: q.id,
          type: "single",
          prompt: q.prompt,
          table: q.table,
          options: shuffled(q.options, rnd).map(({ id, text }) => ({ id, text })),
        };
      case "likert":
        return { id: q.id, type: "likert", statement: q.statement };
      case "open":
        return { id: q.id, type: "open", prompt: q.prompt };
    }
  });
}

/* ---------- проверка ответа ---------- */

export const OPEN_MAX = 3000;

/** Проверяет, что значение подходит к заданию. Возвращает очищенное значение или null. */
export function validateAnswer(q: Question, value: unknown): AnswerValue | null {
  switch (q.type) {
    case "scenario":
    case "single":
      return typeof value === "string" && q.options.some((o) => o.id === value) ? value : null;
    case "likert":
      return typeof value === "number" && Number.isInteger(value) && value >= 1 && value <= 5 ? value : null;
    case "open":
      return typeof value === "string" && value.length <= OPEN_MAX ? value.trim() : null;
  }
}

/** Задания, без ответа на которые тест нельзя завершить (свободные ответы необязательны). */
export function requiredIds(def: AssessmentDefinition): string[] {
  return def.questions.filter((q) => q.type !== "open").map((q) => q.id);
}

/* ---------- подсчёт баллов ---------- */

type Acc = Map<string, { points: number; max: number }>;

function add(acc: Acc, key: string, points: number, max: number) {
  const cur = acc.get(key) ?? { points: 0, max: 0 };
  acc.set(key, { points: cur.points + points, max: cur.max + max });
}

function finish(def: AssessmentDefinition, acc: Acc): CompetencyScore[] {
  return def.competencies
    .filter((c) => acc.has(c.key))
    .map((c) => {
      const { points, max } = acc.get(c.key)!;
      return { key: c.key, title: c.title, points, max, percent: max > 0 ? Math.round((points / max) * 100) : null };
    });
}

/**
 * Чистая детерминированная функция: никаких обращений к AI, времени или БД.
 * Ситуационные задания: сумма баллов выбранных вариантов / сумма максимумов по каждому направлению.
 * Объективные: 1 за верный ответ. Самооценка считается отдельно и не смешивается с поведением в ситуациях.
 */
export function scoreAttempt(def: AssessmentDefinition, answers: Answers): Scores {
  const situ: Acc = new Map();
  const obj: Acc = new Map();
  const self: Acc = new Map();
  let answered = 0;
  let scored = 0;

  for (const q of def.questions) {
    const a = answers[q.id];
    if (q.type === "scenario") {
      const keys = new Set(q.options.flatMap((o) => Object.keys(o.scores)));
      const chosen = q.options.find((o) => o.id === a);
      for (const key of keys) {
        const max = Math.max(...q.options.map((o) => o.scores[key] ?? 0));
        add(situ, key, chosen ? (chosen.scores[key] ?? 0) : 0, max);
      }
      if (chosen) {
        answered++;
        scored++;
      }
    } else if (q.type === "single") {
      add(obj, q.competency, a === q.correct ? 1 : 0, 1);
      if (a !== undefined) {
        answered++;
        scored++;
      }
    } else if (q.type === "likert") {
      if (typeof a === "number") {
        const v = q.reverse ? 6 - a : a;
        add(self, q.competency, v - 1, 4);
        answered++;
        scored++;
      } else add(self, q.competency, 0, 4);
    } else if (typeof a === "string" && a.trim()) {
      answered++;
    }
  }
  return {
    situational: finish(def, situ),
    objective: finish(def, obj),
    selfAssessment: finish(def, self),
    answered,
    scored,
  };
}

/* ---------- отчёт ---------- */

// Если разброс между направлениями меньше, «сильные стороны» и «зоны роста» были бы шумом.
const FLAT_SPREAD = 15;

const mean = (xs: number[]) => (xs.length ? Math.round(xs.reduce((s, x) => s + x, 0) / xs.length) : 0);

export function buildReport(def: AssessmentDefinition, answers: Answers): Report {
  const scores = scoreAttempt(def, answers);
  const kind = scores.objective.length > 0 ? "objective" : "situational";
  const main = kind === "objective" ? scores.objective : scores.situational;
  const withPercent = main.filter((c) => c.percent !== null) as (CompetencyScore & { percent: number })[];

  const sorted = [...withPercent].sort((a, b) => b.percent - a.percent);
  const spread = sorted.length ? sorted[0].percent - sorted[sorted.length - 1].percent : 0;
  const flat = spread < FLAT_SPREAD;

  const item = (c: CompetencyScore & { percent: number }, withAdvice: boolean): ReportItem => {
    const meta = def.competencies.find((x) => x.key === c.key)!;
    return {
      key: c.key,
      title: c.title,
      what: meta.what,
      percent: c.percent,
      ...(withAdvice ? { develop: meta.develop, exercises: meta.exercises } : { careers: meta.careers }),
    };
  };

  const strengths = flat ? [] : sorted.slice(0, 3).map((c) => item(c, false));
  const growthPool = flat ? [] : sorted.slice(-3).filter((c) => !strengths.some((s) => s.key === c.key));
  const growth = growthPool.reverse().map((c) => item(c, true));

  const review: Report["review"] = [];
  let right = 0;
  let total = 0;
  for (const q of def.questions) {
    if (q.type !== "single") continue;
    total++;
    const a = answers[q.id];
    const ok = a === q.correct;
    if (ok) right++;
    review.push({
      id: q.id,
      prompt: q.prompt,
      yourAnswer: q.options.find((o) => o.id === a)?.text ?? "Нет ответа",
      correctAnswer: q.options.find((o) => o.id === q.correct)!.text,
      right: ok,
      explain: q.explain,
    });
  }

  const openAnswers = def.questions.flatMap((q) => {
    if (q.type !== "open") return [];
    const a = answers[q.id];
    return typeof a === "string" && a.trim() ? [{ prompt: q.prompt, answer: a, rubric: q.rubric }] : [];
  });

  return {
    slug: def.slug,
    version: def.version,
    title: def.title,
    kind,
    overallPercent: mean(withPercent.map((c) => c.percent)),
    ...(kind === "objective" ? { correctCount: { right, total } } : {}),
    competencies: main,
    selfAssessment: scores.selfAssessment,
    flat,
    strengths,
    growth,
    review: kind === "objective" ? review : [],
    openAnswers,
    limits: def.limits,
    completedQuestions: scores.answered,
    totalQuestions: def.questions.length,
  };
}
