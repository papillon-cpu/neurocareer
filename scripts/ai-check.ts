/**
 * Живая проверка AI-провайдера: реальный запрос к модели и разбор ответа.
 * Запуск: npm run ai:check  (ключи берутся из .env.local)
 *
 * Скрипт делает то же, что делает приложение: отправляет промпт провайдеру через тот же
 * код шлюза и проверяет, что ответ разбирается Zod-схемой.
 */
import { existsSync } from "node:fs";
import { z } from "zod";
import { unified } from "../src/modules/ai/catalog";
import { isConfigured, providerModel, type ProviderId } from "../src/modules/ai/config";

// Ключи лежат в .env.local — подгружаем их так же, как это делает приложение.
for (const file of [".env.local", ".env"]) {
  if (existsSync(file)) process.loadEnvFile(file);
}

/** Ожидаемая форма ответа: три вопроса для оценки soft skills. */
const answerSchema = z.object({
  questions: z.array(z.string().min(1)).min(3).max(3),
});

const SYSTEM = `Ты помогаешь оценивать soft skills кандидата. Ответь строго JSON без пояснений: {"questions":["вопрос 1","вопрос 2","вопрос 3"]}`;

async function main() {
  const provider = (process.argv[2] ?? "gigachat") as ProviderId;
  const label = { anthropic: "Anthropic", openai: "OpenAI", gigachat: "GigaChat", yandexai: "YandexGPT (AI Studio)", yandex: "YandexGPT (старый API)" }[provider];

  if (!isConfigured(provider)) {
    console.error(`Провайдер ${label} не настроен: нет ключа или модели в окружении.`);
    process.exit(1);
  }

  const model = providerModel(provider)!;
  console.log(`Провайдер: ${label}`);
  console.log(`Модель: ${model}`);
  console.log("Запрос…");

  const t0 = Date.now();
  const res = await unified[provider].complete("Составь 3 вопроса для оценки soft skills кандидата.", {
    system: SYSTEM,
    model,
    maxTokens: 800,
  });
  const ms = Date.now() - t0;

  const raw = res.text.trim();
  const start = raw.indexOf("{");
  const end = raw.lastIndexOf("}");
  if (start === -1 || end <= start) {
    console.error("Ответ не содержит JSON:");
    console.error(raw.slice(0, 500));
    process.exit(1);
  }
  const parsed = answerSchema.safeParse(JSON.parse(raw.slice(start, end + 1)));
  if (!parsed.success) {
    console.error("Ответ не прошёл проверку схемой:", parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; "));
    console.error(raw.slice(0, 500));
    process.exit(1);
  }

  console.log(`Ответ: ${ms} мс, токены: вход ${res.inputTokens}, выход ${res.outputTokens}`);
  console.log("JSON разобран по схеме:", JSON.stringify(parsed.data, null, 2));
  console.log("OK");
}

main().catch((e) => {
  console.error("Проверка не пройдена:", e);
  process.exit(1);
});
