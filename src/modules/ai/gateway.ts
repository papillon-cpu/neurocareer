import { and, eq, gte, sql } from "drizzle-orm";
import type { z } from "zod";
import { rateLimit } from "@/modules/auth/rate-limit";
import { hasConsent } from "@/modules/consent/service";
import type { ConsentPurpose } from "@/server/db/schema";
import { getDb, schema } from "@/server/db";
import { limits, TASKS, type AiTask, type ProviderId } from "./config";
import { AiBudgetError, AiConsentError, AiInvalidOutputError, AiNotConfiguredError, AiProviderError, AiRateLimitError } from "./errors";
import { classifyError, providers, type ChatMessage } from "./providers";
import { chainWithSettings, getAiSettings, missingWithSettings, modelWithSettings } from "./settings";

/**
 * Чьё согласие нужно перед отправкой данных провайдеру. По умолчанию — согласие самого пользователя на внешний AI.
 * Если AI обрабатывает данные другого человека (кандидата для работодателя), нужно его согласие на эту цель;
 * "none" — в запросе нет персональных данных (например, текст вакансии, написанный самим работодателем).
 */
export type AiConsent = "none" | { purpose: ConsentPurpose; userIds: string[] };
export type AiContext = { userId: string; task: AiTask; consent?: AiConsent };
export type AiRequest = { system: string; messages: ChatMessage[] };
export type AiResult = { text: string; provider: ProviderId; model: string };

const MAX_ATTEMPTS_PER_PROVIDER = 2;

async function logUsage(
  ctx: AiContext,
  provider: ProviderId,
  model: string,
  status: string,
  t0: number,
  tokens = { inputTokens: 0, outputTokens: 0 },
) {
  const db = await getDb();
  await db.insert(schema.aiUsage).values({
    userId: ctx.userId,
    task: ctx.task,
    provider,
    model,
    status,
    latencyMs: Date.now() - t0,
    ...tokens,
  });
}

async function tokensUsedThisMonth(userId: string): Promise<number> {
  const db = await getDb();
  const start = new Date();
  start.setUTCDate(1);
  start.setUTCHours(0, 0, 0, 0);
  const [row] = await db
    .select({ n: sql<number>`coalesce(sum(${schema.aiUsage.inputTokens} + ${schema.aiUsage.outputTokens}), 0)::int` })
    .from(schema.aiUsage)
    .where(and(eq(schema.aiUsage.userId, userId), gte(schema.aiUsage.createdAt, start)));
  return row?.n ?? 0;
}

/**
 * Единая точка вызова AI. Порядок проверок важен: сначала доступность и согласие,
 * и только потом данные пользователя уходят провайдеру. Все задачи здесь — чтение без побочных эффектов,
 * поэтому временные сбои можно безопасно повторить и переключиться на резервного провайдера.
 */
export async function aiComplete(ctx: AiContext, req: AiRequest): Promise<AiResult> {
  const settings = await getAiSettings();
  const chain = chainWithSettings(ctx.task, settings);
  if (chain.length === 0) throw new AiNotConfiguredError(missingWithSettings(ctx.task, settings));

  const required = ctx.consent ?? { purpose: "external_ai" as const, userIds: [ctx.userId] };
  if (required !== "none") {
    for (const id of required.userIds) if (!(await hasConsent(id, required.purpose))) throw new AiConsentError();
  }

  const { requestsPerHour, tokensPerMonth } = limits();
  if (!(await rateLimit(`ai:${ctx.userId}`, requestsPerHour, 60 * 60 * 1000)).ok) throw new AiRateLimitError();
  if ((await tokensUsedThisMonth(ctx.userId)) >= tokensPerMonth) throw new AiBudgetError();

  const { maxOutputTokens, timeoutMs } = TASKS[ctx.task];
  let lastError: AiProviderError = new AiProviderError("unknown", false);

  for (const id of chain) {
    const model = modelWithSettings(id, settings)!;
    for (let attempt = 1; attempt <= MAX_ATTEMPTS_PER_PROVIDER; attempt++) {
      const t0 = Date.now();
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), timeoutMs);
      try {
        const res = await providers[id].complete({
          model,
          system: req.system,
          messages: req.messages,
          maxTokens: maxOutputTokens,
          signal: controller.signal,
        });
        await logUsage(ctx, id, model, "ok", t0, { inputTokens: res.inputTokens, outputTokens: res.outputTokens });
        return { text: res.text, provider: id, model };
      } catch (e) {
        const err = classifyError(e);
        lastError = err;
        await logUsage(ctx, id, model, err.code, t0);
        // Повтор только при временных сбоях; постоянная ошибка (ключ, запрос) сразу уходит к резервному.
        if (!err.transient) break;
      } finally {
        clearTimeout(timer);
      }
    }
  }
  throw lastError;
}

/** Достаёт JSON из ответа модели (с учётом блоков ```json и текста вокруг). */
export function extractJson(text: string): unknown {
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const body = fenced ? fenced[1] : text;
  const start = body.indexOf("{");
  const end = body.lastIndexOf("}");
  if (start === -1 || end <= start) throw new Error("no json");
  return JSON.parse(body.slice(start, end + 1));
}

/**
 * Структурированный ответ: проверяется по схеме Zod. При несоответствии делается одна попытка исправления,
 * затем понятная ошибка. Непроверенный ответ модели дальше не передаётся никогда.
 */
export async function aiCompleteJson<T extends z.ZodType>(
  ctx: AiContext,
  req: AiRequest,
  schemaDef: T,
): Promise<{ data: z.infer<T>; provider: ProviderId; model: string }> {
  let current = req;
  for (let attempt = 0; attempt < 2; attempt++) {
    const res = await aiComplete(ctx, current);
    try {
      const parsed = schemaDef.safeParse(extractJson(res.text));
      if (parsed.success) return { data: parsed.data, provider: res.provider, model: res.model };
      current = repairRequest(req, res.text, parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).slice(0, 5).join("; "));
    } catch {
      current = repairRequest(req, res.text, "ответ не является корректным JSON");
    }
  }
  throw new AiInvalidOutputError();
}

function repairRequest(original: AiRequest, previous: string, problem: string): AiRequest {
  return {
    system: original.system,
    messages: [
      ...original.messages,
      { role: "assistant", content: previous.slice(0, 6000) },
      { role: "user", content: `Ответ не прошёл проверку (${problem}). Верни только исправленный JSON без пояснений.` },
    ],
  };
}
