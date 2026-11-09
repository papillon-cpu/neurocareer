import { requireRole } from "@/modules/auth/dal";
import { isConfigured, type ProviderId } from "@/modules/ai/config";
import { PROVIDER_LABELS } from "@/modules/ai/catalog";
import { getAiSettings } from "@/modules/ai/settings";
import { PageTitle } from "@/components/app/Dashboard";
import { AiSettingsForm } from "@/components/ai/AiSettingsForm";

export const metadata = { title: "AI" };

/** Как получить ключ для каждого провайдера: подсказка для администратора, без секретов. */
const HINTS: Record<ProviderId, string> = {
  anthropic: "console.anthropic.com → API-ключи. Из России Anthropic официально недоступен.",
  openai: "platform.openai.com → API-ключи. Из России OpenAI официально недоступен.",
  gigachat: "developers.sber.ru → личный кабинет → ключ авторизации. Работает из России, оплата в рублях.",
  yandexai: "console.yandex.ru → AI Studio → API-ключ (роль ai.languageModels.user) и folder id. Работает из России.",
  yandex: "Старый API Yandex Cloud. Для новых кабинетов используйте YandexGPT (AI Studio).",
};

export default async function AdminAiPage() {
  await requireRole("admin");
  const settings = await getAiSettings();
  // Провайдер без ключа в окружении виден как «нужен ключ»: выбрать его можно, но работать он не будет.
  const providers = PROVIDER_LABELS.map((p) => ({
    id: p.id,
    label: isConfigured(p.id) ? p.label : `${p.label} (нужен ключ)`,
  }));
  return (
    <>
      <PageTitle
        title="AI: провайдер и модель"
        lead="Провайдер и модель определяют, куда уходят запросы пользователей. Ключи задаются в переменных окружения на сервере и в базу не попадают."
      />
      <AiSettingsForm providers={providers} hints={HINTS} initial={{ provider: settings.provider ?? "", model: settings.model ?? "" }} />
    </>
  );
}
