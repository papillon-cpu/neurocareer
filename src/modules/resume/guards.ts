import type { ResumeContent } from "./content";

// Защита от выдумывания. Ответ модели считается непроверенным: всё, что не находится в исходном тексте,
// удаляется, а не «принимается на веру». Это страхует и от галлюцинаций, и от инструкций,
// спрятанных в загруженном файле.

const norm = (s: string) => s.toLowerCase().replace(/ё/g, "е").replace(/\s+/g, " ").trim();
const digits = (s: string) => s.replace(/\D/g, "");

function words(s: string): string[] {
  return norm(s)
    .split(/[^a-zа-я0-9+#.]+/i)
    .filter((w) => w.length > 3);
}

/** Доля значимых слов значения, которые встречаются в источнике. */
export function overlap(value: string, source: string): number {
  const w = words(value);
  if (w.length === 0) return 1;
  const src = norm(source);
  return w.filter((x) => src.includes(x)).length / w.length;
}

const inText = (value: string, src: string) => value.trim() === "" || norm(src).includes(norm(value));

export function groundContent(
  content: ResumeContent,
  sourceText: string,
): { content: ResumeContent; removed: string[] } {
  const removed: string[] = [];
  const drop = (what: string) => removed.push(what);
  const src = sourceText;
  const keepText = (v: string, label: string, min = 0.6) => {
    if (v && overlap(v, src) < min) {
      drop(label);
      return "";
    }
    return v;
  };
  const keepExact = (v: string, label: string) => {
    if (v && !inText(v, src)) {
      drop(`${label}: ${v.slice(0, 40)}`);
      return "";
    }
    return v;
  };
  const keepName = (v: string) => {
    if (v && !v.split(/\s+/).every((w) => inText(w, src))) {
      drop("имя");
      return "";
    }
    return v;
  };
  const keepDate = (v: string, label: string) => {
    const ys = v.match(/\d{4}/g);
    if (v && ys && !ys.every((y) => src.includes(y))) {
      drop(`${label}: ${v}`);
      return "";
    }
    return v;
  };

  const b = content.basics;
  const srcDigits = digits(src);
  const phoneDigits = digits(b.phone);
  const basics = {
    fullName: keepName(b.fullName),
    headline: keepText(b.headline, "специализация"),
    email: keepExact(b.email, "email"),
    phone: phoneDigits && !srcDigits.includes(phoneDigits.slice(-10)) ? (drop("телефон"), "") : b.phone,
    city: keepExact(b.city, "город"),
    summary: keepText(b.summary, "раздел «О себе»"),
  };

  const experience = content.experience
    .map((e) => ({
      company: keepExact(e.company, "компания"),
      position: keepExact(e.position, "должность"),
      start: keepDate(e.start, "дата начала"),
      end: e.end && !/[0-9]/.test(e.end) ? e.end : keepDate(e.end, "дата окончания"),
      description: keepText(e.description, "описание опыта"),
    }))
    .filter((e) => e.company || e.position);

  const education = content.education
    .map((e) => ({
      institution: keepExact(e.institution, "учебное заведение"),
      degree: keepText(e.degree, "специальность"),
      start: keepDate(e.start, "дата начала учёбы"),
      end: keepDate(e.end, "дата окончания учёбы"),
    }))
    .filter((e) => e.institution);

  const only = <T,>(items: T[], pick: (t: T) => string, label: string) =>
    items.filter((i) => {
      const ok = inText(pick(i), src);
      if (!ok) drop(`${label}: ${pick(i).slice(0, 40)}`);
      return ok;
    });

  return {
    content: {
      ...content,
      basics,
      experience,
      education,
      skills: only(content.skills, (s) => s, "навык"),
      languages: only(content.languages, (l) => l.name, "язык"),
      certificates: only(content.certificates, (c) => c.name, "сертификат"),
      projects: only(content.projects, (p) => p.name, "проект"),
    },
    removed,
  };
}

/**
 * Переформулировка не должна добавлять числа: достижения «в 2 раза» и «на 30%» — это факты,
 * которые может подтвердить только человек. Возвращает числа, которых не было в оригинале.
 */
export function invention(original: string, rewritten: string): string[] {
  const nums = (s: string) => new Set((s.match(/\d+(?:[.,]\d+)?/g) ?? []).map((n) => n.replace(",", ".")));
  const had = nums(original);
  return [...nums(rewritten)].filter((n) => !had.has(n));
}
