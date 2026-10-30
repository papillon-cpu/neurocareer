/** Сопоставление навыков по тексту: без AI, детерминированно. */

// Группы названий одного и того же навыка. Список намеренно короткий: расширяется по жалобам на подбор.
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
  ["английский", "english"],
  ["ci/cd", "ci cd", "cicd"],
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
