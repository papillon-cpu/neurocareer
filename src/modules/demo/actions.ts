"use server";

import { eq } from "drizzle-orm";
import { redirect } from "next/navigation";
import { endSession, homeFor, startSession } from "@/modules/auth/dal";
import { getDb, schema } from "@/server/db";
import { DEMO_ACCOUNTS, demoEnabled } from "./config";

/** Вход в демо-аккаунт выбранной роли без пароля. Работает только в демо-режиме и только для заранее созданных демо-аккаунтов. */
export async function switchDemoRoleAction(form: FormData): Promise<void> {
  if (!demoEnabled()) redirect("/");
  const role = form.get("role");
  if (role !== "admin" && role !== "employer" && role !== "employee") redirect("/");

  const db = await getDb();
  const [user] = await db.select().from(schema.users).where(eq(schema.users.email, DEMO_ACCOUNTS[role]));
  if (!user || user.deletedAt || user.role !== role) redirect("/?demo=missing");

  await endSession();
  await startSession(user.id);
  await db.insert(schema.auditEvents).values({ actorUserId: user.id, type: "demo.switch", meta: { role } });
  redirect(homeFor(user.role));
}
