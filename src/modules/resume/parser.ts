import { emptyContent, type ResumeContent } from "./content";

// Разбор текста старого резюме по правилам, без AI. Ничего не додумывает:
// что не удалось определить — остаётся пустым и попадает в список «проверьте».
// Разбор с помощью AI появится на этапе интеграции Claude/GPT.

type SectionKey = "summary" | "experience" | "education" | "skills" | "languages" | "certificates" | "projects";

const HEADINGS: Record<SectionKey, RegExp> = {
  summary: /^(о себе|обо мне|профиль|цель|summary|profile|about me|about)$/i,
  experience: /^(опыт работы|опыт|трудовая деятельность|работа|work experience|experience|employment( history)?)$/i,
  education: /^(образование|education)$/i,
  skills: /^(навыки|ключевые навыки|профессиональные навыки|технологии|skills|key skills|technical skills)$/i,
  languages: /^(языки|знание языков|languages)$/i,
  certificates: /^(сертификаты|курсы|повышение квалификации|certificates|certifications|courses)$/i,
  projects: /^(проекты|projects)$/i,
};

const MONTH =
  "(?:янв|фев|мар|апр|ма[йя]|июн|июл|авг|сен|окт|ноя|дек|jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[а-яa-z]*\\.?";
const DATE = `(?:${MONTH}\\s+)?(?:\\d{1,2}[./]\\d{4}|\\d{4})`;
const NOW = "(?:по\\s+)?(?:настоящее\\s+время|наст\\.?\\s*время|н\\.\\s?в\\.?|сейчас|present|current|now)";
const RANGE = new RegExp(`(${DATE})\\s*[-–—−]\\s*(${DATE}|${NOW})`, "i");

const EMAIL = /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/;
const PHONE = /(?:\+?\d[\d\s().-]{8,}\d)/;
const BULLET = /^[•·▪●○◦*\-–—]\s+/;

const clean = (s: string) => s.replace(/\s+/g, " ").trim();

function headingOf(line: string): SectionKey | null {
  const t = line.replace(/[:：]\s*$/, "").trim();
  if (t.length > 40) return null;
  for (const key of Object.keys(HEADINGS) as SectionKey[]) if (HEADINGS[key].test(t)) return key;
  return null;
}

function splitSections(lines: string[]): { head: string[]; sections: Map<SectionKey, string[]> } {
  const head: string[] = [];
  const sections = new Map<SectionKey, string[]>();
  let current: SectionKey | null = null;
  for (const line of lines) {
    const h = headingOf(line);
    if (h) {
      current = h;
      if (!sections.has(h)) sections.set(h, []);
      continue;
    }
    if (current) sections.get(current)!.push(line);
    else head.push(line);
  }
  return { head, sections };
}

/** Делит секцию на записи: по пустым строкам, а если их нет — по строкам с диапазоном дат. */
function entries(lines: string[]): string[][] {
  const blocks: string[][] = [[]];
  for (const l of lines) {
    if (l.trim() === "") {
      if (blocks[blocks.length - 1].length) blocks.push([]);
    } else blocks[blocks.length - 1].push(l.trim());
  }
  let filled = blocks.filter((b) => b.length);
  // Если каждая строка — отдельный «блок» (так выглядит DOCX: пустая строка между абзацами),
  // пустые строки ничего не разделяют, и записи ищутся по датам.
  if (filled.length > 1 && filled.every((b) => b.length === 1)) filled = [filled.flat()];
  const dated = lines.filter((l) => RANGE.test(l)).length;
  if (filled.length <= 1 && dated >= 2) {
    const out: string[][] = [];
    for (const l of lines.map((x) => x.trim()).filter(Boolean)) {
      if (RANGE.test(l) || out.length === 0) out.push([l]);
      else out[out.length - 1].push(l);
    }
    return out;
  }
  return filled;
}

function splitList(lines: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of lines.join("\n").split(/[,;•·|\n]/)) {
    const item = raw.replace(BULLET, "").replace(/^[:：]\s*/, "").trim();
    const key = item.toLowerCase();
    if (item && item.length <= 60 && !seen.has(key)) {
      seen.add(key);
      out.push(item);
    }
  }
  return out;
}

function parseExperience(lines: string[]): ResumeContent["experience"] {
  return entries(lines).map((block) => {
    let start = "";
    let end = "";
    const rest: string[] = [];
    for (const line of block) {
      const m = line.match(RANGE);
      if (m && !start) {
        start = m[1].trim();
        end = m[2].trim();
        const remainder = clean(line.replace(RANGE, "").replace(/^[\s,|–—-]+|[\s,|–—-]+$/g, ""));
        if (remainder) rest.unshift(remainder);
      } else rest.push(line);
    }
    const [first = "", second = "", ...more] = rest;
    const secondIsHeader = second !== "" && second.length <= 80 && !BULLET.test(second);
    return {
      position: clean(first),
      company: secondIsHeader ? clean(second) : "",
      start,
      end,
      description: (secondIsHeader ? more : [second, ...more]).filter(Boolean).join("\n"),
    };
  });
}

const INSTITUTION = /(университет|институт|академия|колледж|школа|училище|university|institute|college|school|academy)/i;

function parseEducation(lines: string[]): ResumeContent["education"] {
  return entries(lines).map((block) => {
    const joined = block.join(" ");
    const range = joined.match(RANGE);
    const years = range ? null : joined.match(/\b(19|20)\d{2}\b/g);
    const body = block.map((l) => clean(l.replace(RANGE, "")).replace(/[\s,;|–—-]+$/, "")).filter(Boolean);
    const institution = body.find((l) => INSTITUTION.test(l)) ?? body[0] ?? "";
    const degree = body.filter((l) => l !== institution).join(", ");
    return {
      institution,
      degree,
      start: range ? range[1] : "",
      end: range ? range[2] : years && years.length ? years[years.length - 1] : "",
    };
  });
}

function parseLanguages(lines: string[]): ResumeContent["languages"] {
  return splitList(lines).map((item) => {
    const m = item.match(/^([^\-–—:()]+?)\s*[-–—:(]\s*(.+?)\)?$/);
    return m ? { name: clean(m[1]), level: clean(m[2]) } : { name: item, level: "" };
  });
}

export type ParsedResume = { content: ResumeContent; notes: string[] };

export function parseResumeText(text: string): ParsedResume {
  const lines = text.replace(/\r/g, "").replace(/\t/g, " ").split("\n");
  const { head, sections } = splitSections(lines);
  const content = emptyContent();
  const notes: string[] = [
    "Данные извлечены автоматически по правилам и могут быть неточными. Сравните каждое поле с исходным текстом.",
  ];

  const headText = head.join("\n");
  const email = headText.match(EMAIL)?.[0] ?? text.match(EMAIL)?.[0] ?? "";
  const phone = (headText.match(PHONE)?.[0] ?? "").trim();
  content.basics.email = email;
  content.basics.phone = phone;

  const headLines = head.map((l) => l.trim()).filter(Boolean);
  const looksLikeName = (l: string) => {
    const words = l.split(/\s+/);
    return words.length >= 2 && words.length <= 4 && !/[\d@:]/.test(l) && words.every((w) => /^[A-ZА-ЯЁ]/.test(w));
  };
  const nameLine = headLines.find(looksLikeName);
  content.basics.fullName = nameLine ?? "";
  content.basics.headline =
    headLines.find((l) => l !== nameLine && !EMAIL.test(l) && !PHONE.test(l) && l.length <= 100) ?? "";
  const city = headText.match(/(?:город|city|г\.)[:\s]+([^\n,;|]+)/i);
  content.basics.city = city ? clean(city[1]) : "";

  if (sections.has("summary")) content.basics.summary = clean(sections.get("summary")!.join(" ")).slice(0, 2000);
  if (sections.has("experience")) content.experience = parseExperience(sections.get("experience")!);
  if (sections.has("education")) content.education = parseEducation(sections.get("education")!);
  if (sections.has("skills")) content.skills = splitList(sections.get("skills")!).slice(0, 60);
  if (sections.has("languages")) content.languages = parseLanguages(sections.get("languages")!).slice(0, 15);
  if (sections.has("certificates")) {
    content.certificates = splitList(sections.get("certificates")!)
      .slice(0, 20)
      .map((name) => ({ name, issuer: "", year: name.match(/\b(19|20)\d{2}\b/)?.[0] ?? "" }));
  }
  if (sections.has("projects")) {
    content.projects = entries(sections.get("projects")!).map((b) => ({
      name: clean(b[0] ?? ""),
      description: b.slice(1).join("\n"),
    }));
  }

  if (!content.basics.fullName) notes.push("Не удалось определить имя — впишите его.");
  if (!content.basics.email) notes.push("Не найден email.");
  if (!content.basics.phone) notes.push("Не найден телефон.");
  if (!sections.has("experience")) notes.push("Раздел «Опыт работы» не найден — добавьте опыт вручную.");
  else notes.push("Опыт работы: названия должностей, компаний и даты разобраны приблизительно, проверьте каждую запись.");
  if (!sections.has("education")) notes.push("Раздел «Образование» не найден.");
  if (!sections.has("skills")) notes.push("Раздел «Навыки» не найден.");

  return { content, notes };
}
