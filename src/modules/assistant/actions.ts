"use server";

import { redirect } from "next/navigation";
import { z } from "zod";
import { requireRole } from "@/modules/auth/dal";
import * as service from "./service";

const uuid = z.uuid();

export async function newConversationAction(): Promise<void> {
  const user = await requireRole("employee");
  const id = await service.createConversation(user.id);
  redirect(id ? `/me/assistant?c=${id}` : "/me/assistant?error=limit");
}

export async function deleteConversationAction(form: FormData): Promise<void> {
  const user = await requireRole("employee");
  const id = uuid.safeParse(form.get("id"));
  if (id.success) await service.deleteConversation(user.id, id.data);
  redirect("/me/assistant");
}

export async function sendMessageAction(conversationId: string, text: string): Promise<service.ReplyResult> {
  const user = await requireRole("employee");
  if (!uuid.safeParse(conversationId).success || typeof text !== "string") {
    return { ok: false, error: "Диалог не найден." };
  }
  return service.reply(user.id, conversationId, text);
}
