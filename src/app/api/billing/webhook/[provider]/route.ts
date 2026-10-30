import { processPaymentEvent } from "@/modules/billing/payments";
import { getProvider } from "@/modules/billing/provider";

const MAX_BODY = 10_000;

/**
 * Приём событий от платёжного провайдера. Доверия к запросу нет, пока не проверена подпись.
 * Повторная доставка того же события безопасна (идемпотентность) и отвечает 200,
 * чтобы провайдер не слал его бесконечно.
 */
export async function POST(request: Request, ctx: { params: Promise<{ provider: string }> }) {
  const { provider: id } = await ctx.params;
  const provider = getProvider();
  if (!provider || provider.id !== id) return Response.json({ error: "unknown_provider" }, { status: 404 });

  const raw = await request.text();
  if (raw.length > MAX_BODY) return Response.json({ error: "too_large" }, { status: 413 });

  const event = provider.verifyWebhook(raw, request.headers);
  if (!event) return Response.json({ error: "invalid_signature" }, { status: 401 });

  const outcome = await processPaymentEvent(provider.id, event);
  return Response.json({ outcome });
}
