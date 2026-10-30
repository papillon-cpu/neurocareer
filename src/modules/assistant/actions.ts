"use server";

import { redirect } from "next/navigation";
import { z } from "zod";
import { requireEmployeeAccess } from "@/modules/billing/access";
import * as service from "./service";

const uuid = z.uuid();

export async function newConversationAction(): Promise<void> {
  const user = await requireEmployeeAccess();
  const id = await service.createConversation(user.id);
  redirect(id ? `/me/assistant?c=${id}` : "/me/assistant?error=limit");
}

export async function deleteConversationAction(form: FormData): Promise<void> {
  const user = await requireEmployeeAccess();
  const id = uuid.safeParse(form.get("id"));
  if (id.success) await service.deleteConversation(user.id, id.data);
  redirect("/me/assistant");
}

export async function sendMessageAction(conversationId: string, text: string): Promise<service.ReplyResult> {
  const user = await requireEmployeeAccess();
  if (!uuid.safeParse(conversationId).success || typeof text !== "string") {
    return { ok: false, error: "Диалог не найден." };
  }
  return service.reply(user.id, conversationId, text);
}
