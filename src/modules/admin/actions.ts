"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireRole } from "@/modules/auth/dal";
import { setUserBlocked } from "./users";

export async function setUserBlockedAction(form: FormData): Promise<void> {
  const admin = await requireRole("admin");
  const res = await setUserBlocked(admin.id, String(form.get("userId") ?? ""), form.get("block") === "yes");
  revalidatePath("/admin");
  redirect(`/admin?m=${res.ok ? (res.blocked ? "blocked" : "unblocked") : res.error}`);
}
