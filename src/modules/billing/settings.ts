import { eq } from "drizzle-orm";
import { z } from "zod";
import { defaultPricing } from "@/config/pricing";
import { getDb, schema } from "@/server/db";

export const pricingSchema = z.object({
  employeeAccessKopecks: z.number().int().min(0).max(10_000_000),
  subscriptionKopecks: z.number().int().min(0).max(10_000_000),
  subscriptionDays: z.number().int().min(1).max(366),
  includedContacts: z.number().int().min(0).max(10_000),
  extraContactKopecks: z.number().int().min(0).max(10_000_000),
});

export type Pricing = z.infer<typeof pricingSchema>;

export const DEFAULT_PRICING: Pricing = {
  employeeAccessKopecks: defaultPricing.employeeAccessPriceRub * 100,
  subscriptionKopecks: defaultPricing.subscriptionPriceRub * 100,
  subscriptionDays: defaultPricing.subscriptionPeriodDays,
  includedContacts: defaultPricing.includedContacts,
  extraContactKopecks: defaultPricing.extraContactPriceRub * 100,
};

const KEY = "pricing";

/** Действующие тарифы. Изменения применяются только к новым платежам: купленные периоды хранят свои значения. */
export async function getPricing(): Promise<Pricing> {
  const db = await getDb();
  const [row] = await db.select().from(schema.adminSettings).where(eq(schema.adminSettings.key, KEY));
  const merged = pricingSchema.safeParse({ ...DEFAULT_PRICING, ...((row?.value as object | undefined) ?? {}) });
  return merged.success ? merged.data : DEFAULT_PRICING;
}

export async function setPricing(adminId: string, input: unknown): Promise<{ ok: true; pricing: Pricing } | { ok: false; error: string }> {
  const parsed = pricingSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "Проверьте значения: суммы, срок и число контактов вне допустимых пределов." };
  const db = await getDb();
  await db.transaction(async (tx) => {
    await tx
      .insert(schema.adminSettings)
      .values({ key: KEY, value: parsed.data, updatedBy: adminId })
      .onConflictDoUpdate({ target: schema.adminSettings.key, set: { value: parsed.data, updatedAt: new Date(), updatedBy: adminId } });
    await tx.insert(schema.auditEvents).values({ actorUserId: adminId, type: "pricing.updated", meta: parsed.data });
  });
  return { ok: true, pricing: parsed.data };
}
