import { z } from "zod";
import type { CandidateCard } from "@/modules/visibility/service";
import { estimateExperience } from "./experience";
import { findSkill, norm, type SkillSources } from "./skills";

/**
 * Сопоставление вакансии и опубликованной карточки кандидата. Чистая функция: без БД, AI и времени (кроме «сегодня» для дат).
 * Учитываются только навыки, стаж и формат работы. Пол, возраст, национальность, религия, здоровье и результаты тестов
 * в расчёте не участвуют: их нет во входных данных.
 */
export const ALGORITHM_VERSION = "rules-1";

export type VacancyCriteria = {
  mustSkills: string[];
  niceSkills: string[];
  minExperienceYears: number | null;
  workFormat: "office" | "hybrid" | "remote" | null;
};

export const explanationSchema = z.object({
  /** Подтверждено данными кандидата: что нашлось в его опубликованной карточке. */
  confirmed: z.array(z.string()),
  /** Чего не хватает по требованиям вакансии. */
  gaps: z.array(z.string()),
  /** Что можно развить (желательные навыки, которых нет, и разница в стаже). */
  develop: z.array(z.string()),
  /** Ограничения данных: чего не удалось определить. */
  notes: z.array(z.string()),
});
export type Explanation = z.infer<typeof explanationSchema>;

export type Scored = { score: number; mustMatched: number; mustTotal: number; explanation: Explanation };

const FORMAT_RU = { office: "офис", hybrid: "гибрид", remote: "удалённо" } as const;
const fmt = (f: string) => FORMAT_RU[f as keyof typeof FORMAT_RU] ?? f;
const years = (n: number) => String(n).replace(".", ",");

/** Источники для поиска навыков: список навыков резюме и остальной текст карточки. */
export function skillSources(card: CandidateCard): SkillSources {
  const r = card.resume;
  const text = [
    card.headline,
    card.desiredRole,
    card.about,
    r.basics.headline,
    r.basics.summary,
    ...r.experience.flatMap((e) => [e.position, e.description]),
    ...r.projects.flatMap((p) => [p.name, p.description]),
    ...r.certificates.map((c) => c.name),
  ].join(" ");
  return { listed: r.skills.map(norm), text: norm(text) };
}

export function scoreCandidate(vac: VacancyCriteria, card: CandidateCard, now = new Date()): Scored {
  const src = skillSources(card);
  const confirmed: string[] = [];
  const gaps: string[] = [];
  const develop: string[] = [];
  const notes: string[] = [];
  const where = { skills: "указан в разделе «Навыки» резюме", text: "упоминается в описании опыта или проектов" } as const;

  let earned = 0;
  let possible = 0;

  // Обязательные навыки: главный вес.
  let mustMatched = 0;
  for (const s of vac.mustSkills) {
    const ev = findSkill(s, src);
    if (ev) {
      mustMatched++;
      confirmed.push(`Обязательный навык «${s}»: ${where[ev]}`);
    } else gaps.push(`Обязательный навык «${s}» не найден в карточке`);
  }
  if (vac.mustSkills.length > 0) {
    possible += 55;
    earned += (55 * mustMatched) / vac.mustSkills.length;
  }

  // Желательные навыки.
  let niceMatched = 0;
  for (const s of vac.niceSkills) {
    const ev = findSkill(s, src);
    if (ev) {
      niceMatched++;
      confirmed.push(`Желательный навык «${s}»: ${where[ev]}`);
    } else develop.push(`Желательный навык «${s}» можно освоить`);
  }
  if (vac.niceSkills.length > 0) {
    possible += 20;
    earned += (20 * niceMatched) / vac.niceSkills.length;
  }

  // Стаж по датам резюме.
  const exp = estimateExperience(card.resume.experience, now);
  if (vac.minExperienceYears !== null) {
    if (exp.years === null) {
      notes.push("Даты мест работы не удалось разобрать, поэтому стаж не учтён в оценке.");
    } else {
      possible += 15;
      earned += 15 * Math.min(1, exp.years / Math.max(vac.minExperienceYears, 0.5));
      if (exp.years >= vac.minExperienceYears) confirmed.push(`Стаж по датам в резюме ≈ ${years(exp.years)} г. (требуется от ${vac.minExperienceYears})`);
      else {
        gaps.push(`Стаж по датам в резюме ≈ ${years(exp.years)} г., требуется от ${vac.minExperienceYears}`);
        develop.push(`До требуемого стажа не хватает ≈ ${years(Math.round((vac.minExperienceYears - exp.years) * 2) / 2)} г.`);
      }
      if (exp.parsed < exp.total) notes.push(`Даты разобраны у ${exp.parsed} из ${exp.total} мест работы; стаж мог быть недооценён.`);
    }
  }

  // Формат работы.
  if (vac.workFormat !== null) {
    if (card.workFormat === null) {
      notes.push("Кандидат не указал желаемый формат работы.");
    } else {
      possible += 10;
      if (card.workFormat === vac.workFormat) {
        earned += 10;
        confirmed.push(`Формат работы совпадает: ${fmt(card.workFormat)}`);
      } else if (card.workFormat === "hybrid" || vac.workFormat === "hybrid") {
        earned += 5;
        notes.push(`Формат: кандидат — ${fmt(card.workFormat)}, вакансия — ${fmt(vac.workFormat)}; частично совместимо.`);
      } else {
        gaps.push(`Формат работы: кандидат указал «${fmt(card.workFormat)}», в вакансии — «${fmt(vac.workFormat)}»`);
      }
    }
  }

  const score = possible === 0 ? 0 : Math.round((100 * earned) / possible);
  if (possible === 0) notes.push("В вакансии нет критериев для сравнения: добавьте обязательные навыки.");
  return { score, mustMatched, mustTotal: vac.mustSkills.length, explanation: { confirmed, gaps, develop, notes } };
}

/** Проходит ли кандидат фильтр по обязательным требованиям. includePartial — показать и тех, у кого есть хотя бы половина. */
export function passesFilter(s: Pick<Scored, "mustMatched" | "mustTotal">, includePartial: boolean): boolean {
  if (s.mustTotal === 0) return true;
  if (s.mustMatched === s.mustTotal) return true;
  return includePartial && s.mustMatched > 0 && s.mustMatched * 2 >= s.mustTotal;
}
