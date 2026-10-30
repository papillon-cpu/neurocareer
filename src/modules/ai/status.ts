import { hasConsent } from "@/modules/consent/service";
import { aiAvailable, type AiTask } from "./config";

export type AiStatus = "ready" | "no_consent" | "unconfigured";

/** Что показывать пользователю: AI доступен, нужно согласие или администратор не подключил ключи. */
export async function aiStatus(userId: string, task: AiTask): Promise<AiStatus> {
  if (!aiAvailable(task)) return "unconfigured";
  return (await hasConsent(userId, "external_ai")) ? "ready" : "no_consent";
}
