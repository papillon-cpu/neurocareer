// Типы движка тестирования. Определения тестов живут в коде и версионируются:
// старые версии остаются в реестре, чтобы незавершённые попытки считались по своей методике.

export type Competency = {
  key: string;
  title: string;
  /** Что именно проверяет это направление. */
  what: string;
  /** Как развивать, если результат ниже других. */
  develop: string;
  exercises: string[];
  /** Идеи, где это качество востребовано. Не вывод о пригодности. */
  careers: string[];
};

export type Option = { id: string; text: string };

/** Ситуационное задание: варианты — разные стратегии, у каждой свои баллы по компетенциям (0–3). */
export type ScenarioQuestion = {
  id: string;
  type: "scenario";
  prompt: string;
  options: (Option & { scores: Record<string, number> })[];
};

/** Задание с одним верным ответом: проверяется детерминированно. */
export type SingleQuestion = {
  id: string;
  type: "single";
  competency: string;
  prompt: string;
  table?: { headers: string[]; rows: (string | number)[][] };
  options: Option[];
  correct: string;
  explain: string;
};

/** Самооценка по шкале 1–5; reverse — шкала обращается (5 → 1). */
export type LikertQuestion = {
  id: string;
  type: "likert";
  competency: string;
  statement: string;
  reverse?: boolean;
};

/** Свободный ответ: не оценивается автоматически, после теста показывается рубрика для самопроверки. */
export type OpenQuestion = {
  id: string;
  type: "open";
  prompt: string;
  rubric: string[];
};

export type Question = ScenarioQuestion | SingleQuestion | LikertQuestion | OpenQuestion;

export type AssessmentDefinition = {
  slug: string;
  version: number;
  title: string;
  tagline: string;
  intro: string;
  minutes: number;
  /** Что тест не может сказать. Показывается до и после прохождения. */
  limits: string;
  competencies: Competency[];
  questions: Question[];
};

export type AnswerValue = string | number;
export type Answers = Record<string, AnswerValue>;

export type CompetencyScore = {
  key: string;
  title: string;
  /** Доля набранных баллов от возможных для этого направления, 0–100. null — по направлению не было заданий. */
  percent: number | null;
  points: number;
  max: number;
};

export type Scores = {
  situational: CompetencyScore[];
  objective: CompetencyScore[];
  selfAssessment: CompetencyScore[];
  answered: number;
  scored: number;
};

export type ReportItem = {
  key: string;
  title: string;
  what: string;
  percent: number;
  develop?: string;
  exercises?: string[];
  careers?: string[];
};

export type Report = {
  slug: string;
  version: number;
  title: string;
  kind: "situational" | "objective";
  overallPercent: number;
  correctCount?: { right: number; total: number };
  competencies: CompetencyScore[];
  selfAssessment: CompetencyScore[];
  /** Профиль слишком ровный, чтобы выделять сильные стороны и зоны роста. */
  flat: boolean;
  strengths: ReportItem[];
  growth: ReportItem[];
  /** Для объективных заданий: что было верно и почему (показывается только после завершения). */
  review: { id: string; prompt: string; yourAnswer: string; correctAnswer: string; right: boolean; explain: string }[];
  openAnswers: { prompt: string; answer: string; rubric: string[] }[];
  limits: string;
  completedQuestions: number;
  totalQuestions: number;
};
