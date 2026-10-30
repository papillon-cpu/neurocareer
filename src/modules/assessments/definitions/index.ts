import type { AssessmentDefinition } from "../types";
import { analytics } from "./analytics";
import { management } from "./management";
import { softSkills } from "./soft-skills";

// Каталог тестов. Чтобы обновить методику, добавьте новую версию ТЕСТА с тем же slug и version + 1
// и оставьте предыдущую в списке: незавершённые попытки досчитаются по своей версии,
// а завершённые результаты хранятся снимком отчёта и не меняются.
const all: AssessmentDefinition[] = [softSkills, analytics, management];

export function getDefinition(slug: string, version?: number): AssessmentDefinition | undefined {
  const versions = all.filter((d) => d.slug === slug);
  if (version !== undefined) return versions.find((d) => d.version === version);
  return versions.sort((a, b) => b.version - a.version)[0];
}

/** Актуальные версии всех тестов для каталога. */
export function catalog(): AssessmentDefinition[] {
  const slugs = [...new Set(all.map((d) => d.slug))];
  return slugs.map((s) => getDefinition(s)!);
}
