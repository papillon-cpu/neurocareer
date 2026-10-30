"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { requireRole } from "@/modules/auth/dal";
import { rateLimit } from "@/modules/auth/rate-limit";
import type { FormState } from "@/modules/auth/schemas";
import { getEmployeeProfile } from "@/modules/profile/queries";
import { emptyContent, resumeContentSchema } from "./content";
import { extractResumeText, ResumeFileError } from "./extract";
import { parseResumeText } from "./parser";
import * as service from "./service";

const uuid = z.uuid();
const MAX_JSON_CHARS = 300_000;

export async function createBlankResumeAction(): Promise<void> {
  const user = await requireRole("employee");
  const profile = await getEmployeeProfile(user.id);
  let ids;
  try {
    ids = await service.createResume(user.id, {
      title: "Резюме",
      source: "manual",
      content: emptyContent({
        fullName: profile.fullName,
        headline: profile.headline,
        city: profile.city,
        email: user.email,
        summary: profile.about,
      }),
    });
  } catch (e) {
    if (e instanceof service.LimitError) redirect("/me/resume?error=limit");
    throw e;
  }
  redirect(`/me/resume/${ids.resumeId}?v=${ids.versionId}`);
}

export async function importResumeAction(_prev: FormState, form: FormData): Promise<FormState> {
  const user = await requireRole("employee");
  const file = form.get("file");
  if (!(file instanceof File) || file.size === 0) return { error: "Выберите файл PDF или DOCX." };

  if (!rateLimit(`resume-import:${user.id}`, 10, 60 * 60 * 1000).ok) {
    return { error: "Слишком много загрузок. Попробуйте через час." };
  }

  let ids;
  try {
    const { text } = await extractResumeText(new Uint8Array(await file.arrayBuffer()));
    const { content, notes } = parseResumeText(text);
    ids = await service.createResume(user.id, {
      title: file.name.replace(/\.(pdf|docx)$/i, "").slice(0, 80) || "Импортированное резюме",
      content,
      source: "import",
      sourceText: text,
      reviewNotes: notes,
    });
  } catch (e) {
    if (e instanceof ResumeFileError || e instanceof service.LimitError) return { error: e.message };
    throw e;
  }
  redirect(`/me/resume/${ids.resumeId}?v=${ids.versionId}`);
}

export async function saveVersionAction(_prev: FormState, form: FormData): Promise<FormState> {
  const user = await requireRole("employee");
  const versionId = uuid.safeParse(form.get("versionId"));
  const label = z.string().trim().min(1).max(80).safeParse(form.get("label"));
  const raw = form.get("content");
  if (!versionId.success) return { error: "Версия не найдена." };
  if (!label.success) return { error: "Название версии: от 1 до 80 символов." };
  if (typeof raw !== "string" || raw.length > MAX_JSON_CHARS) return { error: "Слишком большое резюме." };

  let json: unknown;
  try {
    json = JSON.parse(raw);
  } catch {
    return { error: "Не удалось прочитать данные формы." };
  }
  const content = resumeContentSchema.safeParse(json);
  if (!content.success) {
    const first = content.error.issues[0];
    return { error: `Проверьте поля: ${first?.message ?? "данные не прошли проверку"}.` };
  }
  const saved = await service.saveVersion(user.id, versionId.data, { label: label.data, content: content.data });
  if (!saved) return { error: "Версия не найдена." };
  revalidatePath("/me/resume", "layout");
  return { ok: true };
}

export async function confirmReviewAction(form: FormData): Promise<void> {
  const user = await requireRole("employee");
  const versionId = uuid.safeParse(form.get("versionId"));
  if (versionId.success) await service.confirmReview(user.id, versionId.data);
  revalidatePath("/me/resume", "layout");
}

export async function newVersionAction(form: FormData): Promise<void> {
  const user = await requireRole("employee");
  const resumeId = uuid.safeParse(form.get("resumeId"));
  const fromId = uuid.safeParse(form.get("fromVersionId"));
  const label = z.string().trim().min(1).max(80).safeParse(form.get("label"));
  if (!resumeId.success || !fromId.success || !label.success) return;
  let id: string | null;
  try {
    id = await service.addVersion(user.id, resumeId.data, fromId.data, label.data);
  } catch (e) {
    if (e instanceof service.LimitError) return;
    throw e;
  }
  if (id) redirect(`/me/resume/${resumeId.data}?v=${id}`);
}

export async function deleteVersionAction(form: FormData): Promise<void> {
  const user = await requireRole("employee");
  const resumeId = uuid.safeParse(form.get("resumeId"));
  const versionId = uuid.safeParse(form.get("versionId"));
  if (!resumeId.success || !versionId.success) return;
  await service.deleteVersion(user.id, versionId.data);
  redirect(`/me/resume/${resumeId.data}`);
}

export async function deleteResumeAction(form: FormData): Promise<void> {
  const user = await requireRole("employee");
  const resumeId = uuid.safeParse(form.get("resumeId"));
  if (resumeId.success) await service.deleteResume(user.id, resumeId.data);
  redirect("/me/resume");
}
