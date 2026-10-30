"use server";

import { eq } from "drizzle-orm";
import { z } from "zod";
import { revalidatePath } from "next/cache";
import { requireRole } from "@/modules/auth/dal";
import { formToObject, zodState, type FormState } from "@/modules/auth/schemas";
import { getDb, schema } from "@/server/db";

const text = (max: number) => z.string().trim().max(max, `Не длиннее ${max} символов`);

const employeeSchema = z.object({
  fullName: text(120).min(2, "Укажите имя"),
  headline: text(120),
  city: text(80),
  desiredRole: text(120),
  workFormat: z.enum(["office", "hybrid", "remote", ""]).transform((v) => (v === "" ? null : v)),
  about: text(2000),
});

export async function updateEmployeeProfileAction(_prev: FormState, form: FormData): Promise<FormState> {
  const user = await requireRole("employee");
  const parsed = employeeSchema.safeParse(formToObject(form));
  if (!parsed.success) return zodState(parsed.error, form);

  const db = await getDb();
  await db
    .update(schema.employeeProfiles)
    .set({ ...parsed.data, updatedAt: new Date() })
    .where(eq(schema.employeeProfiles.userId, user.id));
  revalidatePath("/me", "layout");
  return { ok: true };
}

const companySchema = z.object({
  fullName: text(120).min(2, "Укажите имя"),
  position: text(120),
  name: text(160).min(2, "Укажите название компании"),
  industry: text(120),
  size: z.enum(["", "1-10", "11-50", "51-200", "201-1000", "1000+"]),
  site: text(200).refine(
    (v) => v === "" || /^https?:\/\/[^\s/$.?#].[^\s]*$/i.test(v),
    "Адрес сайта должен начинаться с http:// или https://",
  ),
  description: text(2000),
});

export async function saveCompanyAction(_prev: FormState, form: FormData): Promise<FormState> {
  const user = await requireRole("employer");
  const parsed = companySchema.safeParse(formToObject(form));
  if (!parsed.success) return zodState(parsed.error, form);
  const { fullName, position, ...company } = parsed.data;

  const db = await getDb();
  await db.transaction(async (tx) => {
    const [profile] = await tx
      .select({ companyId: schema.employerProfiles.companyId })
      .from(schema.employerProfiles)
      .where(eq(schema.employerProfiles.userId, user.id));

    let companyId = profile?.companyId ?? null;
    if (companyId) {
      await tx.update(schema.companies).set(company).where(eq(schema.companies.id, companyId));
    } else {
      const [created] = await tx.insert(schema.companies).values(company).returning({ id: schema.companies.id });
      companyId = created.id;
    }
    await tx
      .update(schema.employerProfiles)
      .set({ fullName, position, companyId })
      .where(eq(schema.employerProfiles.userId, user.id));
  });
  revalidatePath("/company", "layout");
  return { ok: true };
}
