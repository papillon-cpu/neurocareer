import { requireRole } from "@/modules/auth/dal";
import { setConsentAction } from "@/modules/consent/actions";
import { hasConsent } from "@/modules/consent/service";
import { consentTexts } from "@/modules/consent/texts";
import { getConsents } from "@/modules/profile/queries";
import { PageTitle, Panel } from "@/components/app/Dashboard";

export const metadata = { title: "Приватность" };

const fmt = new Intl.DateTimeFormat("ru-RU", { dateStyle: "long", timeStyle: "short" });
const btn = "rounded-full border border-line px-4 py-1.5 text-xs text-mist hover:border-neuron hover:text-neuron";

export default async function PrivacyPage() {
  const user = await requireRole("employee");
  const [consents, ai, marketing] = await Promise.all([
    getConsents(user.id),
    hasConsent(user.id, "external_ai"),
    hasConsent(user.id, "marketing"),
  ]);

  const toggles = [
    { purpose: "external_ai" as const, on: ai, note: "Без этого согласия AI-консультант и AI в резюме не получают ваших данных." },
    { purpose: "marketing" as const, on: marketing, note: "Необязательно." },
  ];

  return (
    <>
      <PageTitle
        title="Приватность и согласия"
        lead="Каждое согласие отдельное, и каждое можно отозвать. Мы храним, что именно вы разрешили, какой версии текста и когда."
      />
      <div className="space-y-6">
        <Panel title="Управление согласиями">
          <ul className="divide-y divide-line">
            {toggles.map((t) => (
              <li key={t.purpose} className="flex flex-col gap-3 py-4 sm:flex-row sm:items-center sm:justify-between">
                <div className="max-w-xl">
                  <p className="font-semibold">{consentTexts[t.purpose].title}</p>
                  <p className="mt-1 text-sm text-mist">{consentTexts[t.purpose].text}</p>
                  <p className="mt-1 text-xs text-mist">{t.note}</p>
                </div>
                <form action={setConsentAction} className="flex items-center gap-3">
                  <input type="hidden" name="purpose" value={t.purpose} />
                  <input type="hidden" name="grant" value={t.on ? "no" : "yes"} />
                  <span className={`text-xs ${t.on ? "text-neuron" : "text-mist"}`}>{t.on ? "Разрешено" : "Не разрешено"}</span>
                  <button type="submit" className={btn}>
                    {t.on ? "Отозвать" : "Разрешить"}
                  </button>
                </form>
              </li>
            ))}
          </ul>
          <p className="mt-4 text-sm text-mist">
            Публикация профиля в базе кандидатов и передача данных работодателям не включены и появятся отдельными
            шагами: на них у вас нет согласия.
          </p>
        </Panel>

        <Panel title="История согласий">
          <ul className="divide-y divide-line">
            {[...consents].reverse().map((c) => (
              <li key={c.id} className="flex flex-col gap-1 py-3 sm:flex-row sm:justify-between">
                <div>
                  <p className="text-sm font-semibold">{consentTexts[c.purpose].title}</p>
                  <p className="text-xs text-mist">Версия текста: {c.textVersion}</p>
                </div>
                <p className="text-sm text-mist">
                  {c.granted ? "Дано" : "Отозвано"} · {fmt.format(c.createdAt)}
                </p>
              </li>
            ))}
          </ul>
        </Panel>
      </div>
    </>
  );
}
