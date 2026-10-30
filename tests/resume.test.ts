import { beforeAll, describe, expect, it } from "vitest";
import JSZip from "jszip";
import { parseResumeText } from "@/modules/resume/parser";
import { detectKind, extractResumeText, MAX_RESUME_BYTES, ResumeFileError } from "@/modules/resume/extract";
import { emptyContent, readContent } from "@/modules/resume/content";
import * as svc from "@/modules/resume/service";
import { registerUser } from "@/modules/auth/service";
import { getDb } from "@/server/db";

const SAMPLE = `Анна Смирнова
Руководитель отдела тестирования
anna.smirnova@example.com
+7 (999) 123-45-67
Город: Казань

О себе
Восемь лет в тестировании веб-продуктов, строю процессы качества.

Опыт работы

Март 2019 — по настоящее время
Руководитель QA
Ромашка
• Выстроила автоматизацию на Playwright
• Сократила время регрессии вдвое

2015 – 2019
QA-инженер
Лютик
Ручное и автоматизированное тестирование

Образование
Казанский федеральный университет
Прикладная информатика, 2011 – 2015

Навыки
Playwright, TypeScript, SQL; Postman, Jira

Языки
Английский — B2
Немецкий - A1
`;

describe("разбор текста резюме", () => {
  const { content, notes } = parseResumeText(SAMPLE);

  it("достаёт контакты и шапку", () => {
    expect(content.basics.fullName).toBe("Анна Смирнова");
    expect(content.basics.headline).toBe("Руководитель отдела тестирования");
    expect(content.basics.email).toBe("anna.smirnova@example.com");
    expect(content.basics.phone).toContain("999");
    expect(content.basics.city).toBe("Казань");
    expect(content.basics.summary).toContain("Восемь лет");
  });

  it("разбирает опыт с датами, не склеивая записи", () => {
    expect(content.experience).toHaveLength(2);
    expect(content.experience[0]).toMatchObject({
      position: "Руководитель QA",
      company: "Ромашка",
      start: "Март 2019",
    });
    expect(content.experience[0].end).toMatch(/настоящее время/);
    expect(content.experience[0].description).toContain("Playwright");
    expect(content.experience[1]).toMatchObject({ position: "QA-инженер", company: "Лютик", start: "2015", end: "2019" });
  });

  it("разбирает образование, навыки и языки", () => {
    expect(content.education[0].institution).toContain("университет");
    expect(content.education[0].end).toBe("2015");
    expect(content.skills).toEqual(["Playwright", "TypeScript", "SQL", "Postman", "Jira"]);
    expect(content.languages).toEqual([
      { name: "Английский", level: "B2" },
      { name: "Немецкий", level: "A1" },
    ]);
  });

  it("всегда просит пользователя проверить данные", () => {
    expect(notes[0]).toMatch(/автоматически/);
    expect(notes.some((n) => /Опыт работы/.test(n))).toBe(true);
  });

  it("ничего не выдумывает на бессвязном тексте", () => {
    const r = parseResumeText("просто какой-то текст без структуры и без контактов вообще");
    expect(r.content.basics.email).toBe("");
    expect(r.content.basics.phone).toBe("");
    expect(r.content.experience).toEqual([]);
    expect(r.content.skills).toEqual([]);
    expect(r.notes.join(" ")).toMatch(/email/);
    expect(r.notes.join(" ")).toMatch(/Опыт работы/);
  });

  it("формат DOCX: пустая строка между каждым абзацем не ломает записи", () => {
    const docxLike = SAMPLE.split("\n").filter(Boolean).join("\n\n");
    const r = parseResumeText(docxLike).content;
    expect(r.experience).toHaveLength(2);
    expect(r.experience[0]).toMatchObject({ position: "Руководитель QA", company: "Ромашка", start: "Март 2019" });
    expect(r.experience[1]).toMatchObject({ position: "QA-инженер", company: "Лютик", start: "2015", end: "2019" });
    expect(r.education).toHaveLength(1);
    expect(r.skills).toContain("Playwright");
  });

  it("убирает хвостовые запятые у образования, но не трогает буквы", () => {
    const r = parseResumeText("Образование\nKazan University\nInformation Systems, 2014 – 2018\n\nИнформатика, 2010 – 2014");
    expect(r.content.education[0].degree).toBe("Information Systems");
    expect(r.content.education[0].institution).toBe("Kazan University");
    expect(r.content.education[1].institution).toBe("Информатика");
  });

  it("не принимает фразу в шапке за имя", () => {
    expect(parseResumeText("резюме для вакансии\nemail: a@b.co").content.basics.fullName).toBe("");
  });
});

async function makeDocx(paragraphs: string[]): Promise<Uint8Array> {
  const zip = new JSZip();
  zip.file(
    "[Content_Types].xml",
    `<?xml version="1.0" encoding="UTF-8"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/></Types>`,
  );
  zip.file(
    "_rels/.rels",
    `<?xml version="1.0" encoding="UTF-8"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>`,
  );
  const body = paragraphs.map((p) => `<w:p><w:r><w:t>${p}</w:t></w:r></w:p>`).join("");
  zip.file(
    "word/document.xml",
    `<?xml version="1.0" encoding="UTF-8"?><w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body>${body}</w:body></w:document>`,
  );
  return zip.generateAsync({ type: "uint8array" });
}

function makePdf(lines: string[]): Uint8Array {
  const stream = "BT /F1 12 Tf 50 750 Td 14 TL " + lines.map((l) => `(${l}) Tj T*`).join(" ") + " ET";
  const objs = [
    "<< /Type /Catalog /Pages 2 0 R >>",
    "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
    "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >>",
    `<< /Length ${stream.length} >>\nstream\n${stream}\nendstream`,
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>",
  ];
  let pdf = "%PDF-1.4\n";
  const offsets: number[] = [];
  objs.forEach((o, i) => {
    offsets.push(pdf.length);
    pdf += `${i + 1} 0 obj\n${o}\nendobj\n`;
  });
  const xref = pdf.length;
  pdf += `xref\n0 ${objs.length + 1}\n0000000000 65535 f \n`;
  offsets.forEach((o) => (pdf += `${String(o).padStart(10, "0")} 00000 n \n`));
  pdf += `trailer\n<< /Size ${objs.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF`;
  return new TextEncoder().encode(pdf);
}

describe("извлечение текста из файлов", () => {
  it("DOCX: достаёт текст, включая кириллицу", async () => {
    const r = await extractResumeText(await makeDocx(["Анна Смирнова", "Навыки", "Playwright, SQL, TypeScript, Postman"]));
    expect(r.kind).toBe("docx");
    expect(r.text).toContain("Анна Смирнова");
    expect(parseResumeText(r.text).content.skills).toContain("Playwright");
  });

  it("PDF: достаёт текст", async () => {
    const r = await extractResumeText(makePdf(["John Smith", "Skills", "TypeScript, SQL, Playwright, Jira"]));
    expect(r.kind).toBe("pdf");
    expect(r.text).toContain("John Smith");
  });

  it("отклоняет не PDF/DOCX по содержимому, а не по имени", async () => {
    const text = new TextEncoder().encode("Это обычный текстовый файл, переименованный в resume.pdf");
    expect(detectKind(text)).toBeNull();
    await expect(extractResumeText(text)).rejects.toBeInstanceOf(ResumeFileError);
  });

  it("отклоняет ZIP без document.xml, пустой и слишком большой файл", async () => {
    const zip = new JSZip();
    zip.file("hello.txt", "hi");
    await expect(extractResumeText(await zip.generateAsync({ type: "uint8array" }))).rejects.toThrow(/Word/);
    await expect(extractResumeText(new Uint8Array(0))).rejects.toThrow(/пустой/);
    const big = new Uint8Array(MAX_RESUME_BYTES + 1);
    big.set([0x25, 0x50, 0x44, 0x46, 0x2d]);
    await expect(extractResumeText(big)).rejects.toThrow(/5 МБ/);
  });

  it("не принимает документ почти без текста (скан)", async () => {
    await expect(extractResumeText(await makeDocx(["Привет"]))).rejects.toThrow(/скан/);
  });
});

describe("резюме в БД и права доступа", () => {
  let alice: string;
  let bob: string;
  let ids: { resumeId: string; versionId: string };

  beforeAll(async () => {
    await getDb();
    const base = { password: "longenoughpass", acceptService: true as const, acceptMarketing: false };
    alice = (await registerUser({ ...base, fullName: "Alice", email: "alice-resume@example.com", role: "employee" })).id;
    bob = (await registerUser({ ...base, fullName: "Bob", email: "bob-resume@example.com", role: "employee" })).id;
    ids = await svc.createResume(alice, {
      title: "Моё резюме",
      content: emptyContent({ fullName: "Alice" }),
      source: "import",
      sourceText: "исходный текст",
      reviewNotes: ["проверьте"],
    });
  });

  it("владелец видит резюме и версии", async () => {
    const data = await svc.getResumeForUser(alice, ids.resumeId);
    expect(data?.versions).toHaveLength(1);
    expect(data?.versions[0].sourceText).toBe("исходный текст");
    expect((await svc.listResumes(alice))[0].versions[0].needsReview).toBe(true);
  });

  it("чужой пользователь не может читать, менять, подтверждать и удалять (IDOR)", async () => {
    expect(await svc.getResumeForUser(bob, ids.resumeId)).toBeNull();
    expect(await svc.saveVersion(bob, ids.versionId, { label: "x", content: emptyContent({ fullName: "Hacked" }) })).toBe(false);
    expect(await svc.confirmReview(bob, ids.versionId)).toBe(false);
    expect(await svc.deleteVersion(bob, ids.versionId)).toBe(false);
    expect(await svc.deleteResume(bob, ids.resumeId)).toBe(false);
    expect(await svc.addVersion(bob, ids.resumeId, ids.versionId, "копия")).toBeNull();
    const data = await svc.getResumeForUser(alice, ids.resumeId);
    expect(data?.versions[0].content.basics.fullName).toBe("Alice");
    expect(await svc.listResumes(bob)).toEqual([]);
  });

  it("сохранение чистит пустые записи и отклоняет невалидное содержимое", async () => {
    const c = emptyContent({ fullName: "Alice A" });
    c.skills = ["TS", "", "SQL"];
    c.experience = [{ company: "", position: "", start: "", end: "", description: "" }];
    expect(await svc.saveVersion(alice, ids.versionId, { label: "Основная версия", content: c })).toBe(true);
    const v = (await svc.getResumeForUser(alice, ids.resumeId))!.versions[0];
    expect(v.content.skills).toEqual(["TS", "SQL"]);
    expect(v.content.experience).toEqual([]);
    const bad = { ...c, skills: Array(100).fill("x") };
    expect(await svc.saveVersion(alice, ids.versionId, { label: "x", content: bad })).toBe(false);
  });

  it("копия версии наследует пометки проверки; последнюю версию удалить нельзя", async () => {
    const copyId = await svc.addVersion(alice, ids.resumeId, ids.versionId, "Под вакансию QA Lead");
    expect(copyId).toBeTruthy();
    let data = (await svc.getResumeForUser(alice, ids.resumeId))!;
    expect(data.versions).toHaveLength(2);
    expect(data.versions[1].reviewNotes).toEqual(["проверьте"]);
    expect(await svc.deleteVersion(alice, copyId!)).toBe(true);
    expect(await svc.deleteVersion(alice, ids.versionId)).toBe(false);
    expect(await svc.confirmReview(alice, ids.versionId)).toBe(true);
    data = (await svc.getResumeForUser(alice, ids.resumeId))!;
    expect(data.versions[0].reviewNotes).toEqual([]);
  });

  it("ограничивает число резюме", async () => {
    const base = { password: "longenoughpass", acceptService: true as const, acceptMarketing: false };
    const carol = (await registerUser({ ...base, fullName: "Carol", email: "carol-resume@example.com", role: "employee" })).id;
    for (let i = 0; i < svc.MAX_RESUMES; i++) {
      await svc.createResume(carol, { title: `r${i}`, content: emptyContent(), source: "manual" });
    }
    await expect(svc.createResume(carol, { title: "лишнее", content: emptyContent(), source: "manual" })).rejects.toBeInstanceOf(
      svc.LimitError,
    );
  });

  it("удаление резюме удаляет версии; readContent переживает повреждённые данные", async () => {
    expect(await svc.deleteResume(alice, ids.resumeId)).toBe(true);
    expect(await svc.getResumeForUser(alice, ids.resumeId)).toBeNull();
    expect(readContent({ garbage: true }).basics.fullName).toBe("");
  });
});
