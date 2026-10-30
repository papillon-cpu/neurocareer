"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { requireRole } from "@/modules/auth/dal";
import { echoValues, zodState, type FormState } from "@/modules/auth/schemas";
import { BillingUnavailableError } from "@/modules/billing/payments";
import { quoteContact, startExtraContactPayment, unlockContact } from "@/modules/billing/contacts";
import * as match from "@/modules/matching/service";
import { contactsShareable } from "@/modules/visibility/service";
import { getDb, schema } from "@/server/db";
import { analyzeVacancy } from "./analyzer";
import { NOTICES } from "./notices";
import * as svc from "./service";
import { moderateVacancy } from "./service";

const id = z.uuid();
const base = "/company/vacancies";


function back(vacancyId: string, notice: string): never {
  redirect(`${base}/${vacancyId}?m=${notice}`);
}

function failNotice(res: { ok: false; error: string }, fallback = "unavailable"): string {
  return res.error in NOTICES ? res.error : fallback;
}

/* ---------- вакансия: создание и правка ---------- */

export async function saveVacancyAction(_prev: FormState, form: FormData): Promise<FormState> {
  const user = await requireRole("employer");
  const parsed = svc.vacancyInputSchema.safeParse(Object.fromEntries(form.entries()));
  if (!parsed.success) return zodState(parsed.error, form);

  const editing = form.get("id");
  const res =
    typeof editing === "string" && editing !== ""
      ? await svc.updateVacancy(user.id, editing, parsed.data).then((r) => (r.ok ? { ...r, id: editing } : r))
      : await svc.createVacancy(user.id, parsed.data);
  if (!res.ok) return { error: NOTICES[failNotice(res)].text, values: echoValues(form) };
  revalidatePath(base);
  redirect(`${base}/${res.id}?m=saved`);
}

/* ---------- вакансия: статусы и анализ ---------- */

export async function vacancyOpAction(form: FormData): Promise<void> {
  const user = await requireRole("employer");
  const vid = id.safeParse(form.get("id"));
  if (!vid.success) redirect(base);
  const op = form.get("op");
  let notice: string;

  if (op === "analyze") {
    const r = await analyzeVacancy(user.id, vid.data);
    notice = r.ok ? "analyzed" : failNotice(r);
  } else if (op === "applySkills") {
    const r = await analyzeVacancy(user.id, vid.data); // берём свежий разбор, а не данные из формы
    notice = !r.ok ? failNotice(r) : "analyzed";
    if (r.ok) {
      const added = await svc.addSkills(user.id, vid.data, { must: r.analysis.mustSkills, nice: r.analysis.niceSkills });
      notice = added.ok ? "skills_added" : failNotice(added);
    }
  } else {
    const run = { submit: svc.submitVacancy, withdraw: svc.withdrawVacancy, close: svc.closeVacancy, reopen: svc.reopenVacancy } as const;
    const key = typeof op === "string" && op in run ? (op as keyof typeof run) : null;
    if (!key) redirect(`${base}/${vid.data}`);
    const r = await run[key](user.id, vid.data);
    notice = r.ok ? ({ submit: "submitted", withdraw: "withdrawn", close: "closed", reopen: "reopened" } as const)[key] : failNotice(r);
  }
  revalidatePath(base, "layout");
  back(vid.data, notice);
}

/* ---------- подбор ---------- */

export async function runMatchingAction(form: FormData): Promise<void> {
  const user = await requireRole("employer");
  const vid = id.safeParse(form.get("id"));
  if (!vid.success) redirect(base);
  const r = await match.runMatching(user.id, vid.data, { includePartial: form.get("includePartial") === "on" });
  revalidatePath(`${base}/${vid.data}`);
  back(vid.data, r.ok ? "matched" : failNotice(r));
}

function candidateBack(vacancyId: string, candidateId: string, notice: string): never {
  redirect(`${base}/${vacancyId}/candidates/${candidateId}?m=${notice}`);
}

/** Общий вход для действий на странице кандидата: роль, формат id и наличие рекомендации по вакансии работодателя (IDOR). */
async function candidateContext(form: FormData) {
  const user = await requireRole("employer");
  const vid = id.safeParse(form.get("vacancyId"));
  const cid = id.safeParse(form.get("candidateId"));
  if (!vid.success || !cid.success) redirect(base);
  const rec = await match.recommendationFor(user.id, vid.data, cid.data);
  if (!rec) redirect(base);
  return { user, vacancyId: vid.data, candidateId: cid.data, rec };
}

export async function explainAiAction(form: FormData): Promise<void> {
  const { user, vacancyId, candidateId, rec } = await candidateContext(form);
  const r = await match.explainWithAi(user.id, rec.id);
  const notice = r.ok
    ? "ai_done"
    : r.error === "not_configured"
      ? "ai_not_configured"
      : r.error === "no_candidate_consent"
        ? "ai_no_consent"
        : r.error === "no_subscription"
          ? "no_subscription"
          : "ai_failed";
  revalidatePath(`${base}/${vacancyId}`, "layout");
  candidateBack(vacancyId, candidateId, notice);
}

const reportSchema = z.object({
  reason: z.enum(["wrong_match", "wrong_facts", "sensitive", "other"]),
  comment: z.string().trim().max(1000),
});

export async function reportAction(form: FormData): Promise<void> {
  const { user, vacancyId, candidateId, rec } = await candidateContext(form);
  const parsed = reportSchema.safeParse({ reason: form.get("reason"), comment: form.get("comment") ?? "" });
  if (!parsed.success) candidateBack(vacancyId, candidateId, "unavailable");
  const r = await match.reportRecommendation(user.id, rec.id, parsed.data);
  candidateBack(vacancyId, candidateId, r.ok ? (r.already ? "reported_already" : "reported") : "unavailable");
}

/* ---------- контакты ---------- */

async function audit(userId: string, type: string, meta: Record<string, unknown>) {
  const db = await getDb();
  await db.insert(schema.auditEvents).values({ actorUserId: userId, type, meta });
}

/** Открытие контакта в рамках лимита. Стоимость показана на странице заранее; здесь она проверяется заново на сервере. */
export async function unlockContactAction(form: FormData): Promise<void> {
  const { user, vacancyId, candidateId } = await candidateContext(form);
  if (!(await contactsShareable(candidateId))) candidateBack(vacancyId, candidateId, "not_shareable");
  const r = await unlockContact(user.id, candidateId);
  if (r.state === "unlocked") await audit(user.id, "contact.unlocked", { candidateId, charge: "included" });
  const notice =
    r.state === "unlocked" ? "unlocked" : r.state === "already" ? "already" : r.state === "no_subscription" ? "no_subscription" : "payment_required";
  revalidatePath(base, "layout");
  candidateBack(vacancyId, candidateId, notice);
}

/** Контакт сверх лимита: уходит на оплату. Контакт откроется только после подтверждённого платежа. */
export async function payExtraContactAction(form: FormData): Promise<void> {
  const { user, vacancyId, candidateId } = await candidateContext(form);
  if (!(await contactsShareable(candidateId))) candidateBack(vacancyId, candidateId, "not_shareable");
  const expected = Number(form.get("priceKopecks"));
  const quote = await quoteContact(user.id, candidateId);
  // Цена в форме должна совпадать с текущей: работодатель платит ровно ту сумму, которую видел.
  if (quote.state === "payment_required" && quote.priceKopecks !== expected) candidateBack(vacancyId, candidateId, "price_changed");
  let target: string;
  try {
    const r = await startExtraContactPayment(user.id, candidateId, `${base}/${vacancyId}/candidates/${candidateId}`);
    if (r.state !== "redirect") candidateBack(vacancyId, candidateId, r.state === "already" ? "already" : r.state === "no_subscription" ? "no_subscription" : "unavailable");
    await audit(user.id, "contact.payment_started", { candidateId });
    target = r.redirectUrl;
  } catch (e) {
    if (!(e instanceof BillingUnavailableError)) throw e;
    target = `${base}/${vacancyId}/candidates/${candidateId}?m=payment_unavailable`;
  }
  redirect(target);
}

/* ---------- администратор ---------- */

export async function moderateVacancyAction(form: FormData): Promise<void> {
  const admin = await requireRole("admin");
  const vid = id.safeParse(form.get("id"));
  if (!vid.success) redirect("/admin/vacancies");
  const approve = form.get("decision") === "approve";
  const note = String(form.get("note") ?? "").trim();
  if (!approve && note.length < 3) redirect("/admin/vacancies?m=note_required");
  const r = await moderateVacancy(admin.id, vid.data, approve ? { approve: true } : { approve: false, note });
  revalidatePath("/admin/vacancies");
  redirect(`/admin/vacancies?m=${r.ok ? (approve ? "approved" : "rejected") : r.error}`);
}

export async function resolveReportAction(form: FormData): Promise<void> {
  const admin = await requireRole("admin");
  const rid = id.safeParse(form.get("id"));
  if (!rid.success) redirect("/admin/reports");
  await match.resolveReport(admin.id, rid.data, String(form.get("note") ?? ""));
  revalidatePath("/admin/reports");
  redirect("/admin/reports?m=resolved");
}
