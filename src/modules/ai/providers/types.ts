export type ChatMessage = { role: "user" | "assistant"; content: string };

export type ProviderRequest = {
  model: string;
  system: string;
  messages: ChatMessage[];
  maxTokens: number;
  signal: AbortSignal;
};

export type ProviderResult = { text: string; inputTokens: number; outputTokens: number };

/** Транспорт провайдера: одна операция — отправить сообщения и получить текст ответа. */
export interface Provider {
  complete(req: ProviderRequest): Promise<ProviderResult>;
}

/** Модель провайдера: идентификатор для запроса и человекочитаемое название. */
export type ProviderModel = { id: string; label: string };

/** Готовность провайдера: ключи на месте и провайдер отвечает. Секреты в тексте не попадают. */
export type HealthStatus = { ok: boolean; detail: string };
