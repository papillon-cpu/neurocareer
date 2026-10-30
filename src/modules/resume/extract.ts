export const MAX_RESUME_BYTES = 5 * 1024 * 1024;
const MAX_PDF_PAGES = 10;
const MAX_TEXT_CHARS = 60_000;

export class ResumeFileError extends Error {}

export type FileKind = "pdf" | "docx";

/** Тип определяется по содержимому файла, а не по имени и заявленному MIME. */
export function detectKind(bytes: Uint8Array): FileKind | null {
  const startsWith = (sig: number[]) => sig.every((b, i) => bytes[i] === b);
  if (startsWith([0x25, 0x50, 0x44, 0x46, 0x2d])) return "pdf"; // %PDF-
  if (startsWith([0x50, 0x4b, 0x03, 0x04])) return "docx"; // ZIP; проверяется ниже
  return null;
}

async function pdfText(bytes: Uint8Array): Promise<string> {
  const { extractText, getDocumentProxy } = await import("unpdf");
  let pdf;
  try {
    pdf = await getDocumentProxy(new Uint8Array(bytes));
  } catch {
    throw new ResumeFileError("Не удалось прочитать PDF. Файл повреждён или защищён паролем.");
  }
  if (pdf.numPages > MAX_PDF_PAGES) {
    throw new ResumeFileError(`В PDF больше ${MAX_PDF_PAGES} страниц. Загрузите резюме покороче.`);
  }
  const { text } = await extractText(pdf, { mergePages: true });
  return text;
}

async function docxText(bytes: Uint8Array): Promise<string> {
  const JSZip = (await import("jszip")).default;
  let zip;
  try {
    zip = await JSZip.loadAsync(bytes);
  } catch {
    throw new ResumeFileError("Файл не похож на документ Word (.docx).");
  }
  if (!zip.file("word/document.xml")) {
    throw new ResumeFileError("Файл не похож на документ Word (.docx).");
  }
  const mammoth = (await import("mammoth")).default;
  const { value } = await mammoth.extractRawText({ buffer: Buffer.from(bytes) });
  return value;
}

export async function extractResumeText(bytes: Uint8Array): Promise<{ kind: FileKind; text: string }> {
  if (bytes.byteLength === 0) throw new ResumeFileError("Файл пустой.");
  if (bytes.byteLength > MAX_RESUME_BYTES) {
    throw new ResumeFileError("Файл больше 5 МБ.");
  }
  const kind = detectKind(bytes);
  if (!kind) throw new ResumeFileError("Поддерживаются только файлы PDF и DOCX.");

  const raw = kind === "pdf" ? await pdfText(bytes) : await docxText(bytes);
  const text = raw.replace(/\u0000/g, "").slice(0, MAX_TEXT_CHARS);
  if (text.trim().length < 30) {
    throw new ResumeFileError(
      "В файле почти нет текста: возможно, это скан. Загрузите версию с текстом или заполните резюме вручную.",
    );
  }
  return { kind, text };
}
