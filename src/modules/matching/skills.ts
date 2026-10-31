/** Сопоставление навыков по тексту: без AI, детерминированно. */

// Группы названий одного и того же навыка. Расширяется по жалобам на подбор; неоднозначные сокращения (go, r, c) сюда не входят.
const ALIASES: string[][] = [
  ["javascript", "js", "джаваскрипт"],
  ["typescript", "ts", "тайпскрипт"],
  ["postgresql", "postgres", "постгрес", "постгресql"],
  ["kubernetes", "k8s", "кубернетес"],
  ["node.js", "nodejs", "node js", "node"],
  ["react", "react.js", "reactjs"],
  ["vue", "vue.js", "vuejs"],
  ["1с", "1c"],
  ["c#", "csharp", "си шарп"],
  ["python", "питон"],
  ["sql", "эс кью эль"],
  ["excel", "эксель", "ms excel", "microsoft excel"],
  ["power bi", "powerbi"],
  ["ci/cd", "ci cd", "cicd"],
  ["c++", "cpp", "си плюс плюс"],
  ["golang", "go lang", "язык go"],
  ["php", "пхп"],
  ["java", "джава"],
  ["kotlin", "котлин"],
  ["swift", "свифт"],
  ["docker", "докер"],
  ["git", "гит"],
  ["linux", "линукс"],
  ["mysql", "майскл", "my sql"],
  ["mongodb", "mongo", "монго"],
  ["redis", "редис"],
  ["rabbitmq", "rabbit mq", "кролик"],
  ["kafka", "apache kafka", "кафка"],
  ["angular", "angular.js", "angularjs", "ангуляр"],
  ["next.js", "nextjs", "next js"],
  ["django", "джанго"],
  ["fastapi", "fast api"],
  ["spring", "spring boot", "springboot", "спринг"],
  ["figma", "фигма"],
  ["photoshop", "adobe photoshop", "фотошоп"],
  ["jira", "джира"],
  ["scrum", "скрам"],
  ["agile", "аджайл"],
  ["amocrm", "amo crm", "амо црм"],
  ["bitrix24", "битрикс24", "битрикс 24", "bitrix"],
  ["power point", "powerpoint", "павер поинт", "пауэрпоинт"],
  ["google analytics", "ga4", "гугл аналитикс"],
  ["seo", "сео", "поисковая оптимизация"],
  ["smm", "смм"],
  ["crm", "срм"],
  ["machine learning", "ml", "машинное обучение"],
  ["data science", "анализ данных", "датасайенс"],
  ["тестирование", "qa", "quality assurance", "тестировщик"],
  ["немецкий", "german", "немецкий язык"],
  ["китайский", "chinese", "китайский язык"],
  ["английский", "english", "английский язык"],
  ["управление проектами", "project management", "проектный менеджмент"],
  ["продажи", "sales", "b2b продажи"],
  ["бухгалтерский учет", "бухучет", "бухгалтерия", "accounting"],
];

/** Нижний регистр, ё→е, лишние знаки в пробелы; символы +, #, ., / внутри слова сохраняются (c++, c#, node.js, ci/cd). */
export function norm(s: string): string {
  return s
    .toLowerCase()
    .replaceAll("ё", "е")
    .replace(/[^a-zа-я0-9+#./\s]/g, " ")
    .replace(/(^|\s)[./]+|[./]+(?=\s|$)/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/** Все допустимые написания навыка (сам навык + синонимы). */
export function variants(skill: string): string[] {
  const n = norm(skill);
  if (!n) return [];
  const group = ALIASES.find((g) => g.some((a) => norm(a) === n));
  return [...new Set([n, ...(group ?? []).map(norm)])];
}

const padded = (s: string) => ` ${s} `;

/** Целое слово или фраза внутри нормализованного текста (чтобы «java» не находилось в «javascript»). */
export function hasPhrase(haystackNorm: string, phraseNorm: string): boolean {
  return phraseNorm !== "" && padded(haystackNorm).includes(padded(phraseNorm));
}

export type SkillEvidence = "skills" | "text" | null;

export type SkillSources = {
  /** Раздел «Навыки» резюме (нормализованные записи). */
  listed: string[];
  /** Остальной текст резюме и профиля: опыт, проекты, сертификаты, «О себе» (нормализованный). */
  text: string;
};

/** Где в данных кандидата подтверждается навык: в списке навыков, в тексте резюме или нигде. */
export function findSkill(skill: string, src: SkillSources): SkillEvidence {
  const vs = variants(skill);
  if (vs.length === 0) return null;
  if (src.listed.some((entry) => vs.some((v) => entry === v || hasPhrase(entry, v)))) return "skills";
  if (vs.some((v) => hasPhrase(src.text, v))) return "text";
  return null;
}

/** Убирает пустые и повторяющиеся (с учётом регистра и синонимов) навыки; сохраняет первое написание. */
export function cleanSkillList(list: string[], max = 40): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of list) {
    const s = raw.trim().replace(/\s+/g, " ").slice(0, 60);
    const vs = variants(s);
    if (vs.length === 0 || vs.some((v) => seen.has(v))) continue;
    vs.forEach((v) => seen.add(v));
    out.push(s);
    if (out.length >= max) break;
  }
  return out;
}
