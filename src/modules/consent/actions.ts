"use server";

import { revalidatePath } from "next/cache";
import { requireRole } from "@/modules/auth/dal";
import { setConsent } from "./service";

// Пока управляются только эти цели; публикация и передача работодателям — на этапе приватности.
const MANAGED = ["external_ai", "ai_matching", "marketing"] as const;

export async function setConsentAction(form: FormData): Promise<void> {
  const user = await requireRole("employee");
  const purpose = form.get("purpose");
  const grant = form.get("grant") === "yes";
  if (typeof purpose !== "string" || !(MANAGED as readonly string[]).includes(purpose)) return;
  await setConsent(user.id, purpose as (typeof MANAGED)[number], grant);
  revalidatePath("/me", "layout");
}
