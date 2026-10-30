import { z } from "zod";

const s = (max: number) => z.string().trim().max(max, `Не длиннее ${max} символов`);

export const TEMPLATES = [
  { id: "classic", title: "Классический" },
  { id: "modern", title: "С боковой колонкой" },
] as const;

export const resumeContentSchema = z.object({
  template: z.enum(["classic", "modern"]).default("classic"),
  basics: z.object({
    fullName: s(120),
    headline: s(160),
    email: s(254),
    phone: s(40),
    city: s(80),
    summary: s(2000),
  }),
  experience: z
    .array(
      z.object({
        company: s(160),
        position: s(160),
        start: s(30),
        end: s(30),
        description: s(3000),
      }),
    )
    .max(30),
  education: z
    .array(z.object({ institution: s(200), degree: s(200), start: s(30), end: s(30) }))
    .max(15),
  skills: z.array(s(60)).max(60),
  languages: z.array(z.object({ name: s(60), level: s(60) })).max(15),
  certificates: z.array(z.object({ name: s(200), issuer: s(200), year: s(10) })).max(20),
  projects: z.array(z.object({ name: s(200), description: s(2000) })).max(20),
});

export type ResumeContent = z.infer<typeof resumeContentSchema>;

export function emptyContent(basics: Partial<ResumeContent["basics"]> = {}): ResumeContent {
  return {
    template: "classic",
    basics: { fullName: "", headline: "", email: "", phone: "", city: "", summary: "", ...basics },
    experience: [],
    education: [],
    skills: [],
    languages: [],
    certificates: [],
    projects: [],
  };
}

const blank = (o: Record<string, unknown>) => Object.values(o).every((v) => v === "");

/** Убирает полностью пустые записи, чтобы в резюме не попадали «пустые» блоки. */
export function compactContent(c: ResumeContent): ResumeContent {
  return {
    ...c,
    experience: c.experience.filter((e) => !blank(e)),
    education: c.education.filter((e) => !blank(e)),
    skills: c.skills.filter(Boolean),
    languages: c.languages.filter((e) => !blank(e)),
    certificates: c.certificates.filter((e) => !blank(e)),
    projects: c.projects.filter((e) => !blank(e)),
  };
}

/** Содержимое из БД проверяется при чтении: старые версии формата не должны ронять страницу. */
export function readContent(raw: unknown): ResumeContent {
  const parsed = resumeContentSchema.safeParse(raw);
  return parsed.success ? parsed.data : emptyContent();
}
