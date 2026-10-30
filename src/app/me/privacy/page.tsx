import { requireRole } from "@/modules/auth/dal";
import { consentTexts } from "@/modules/consent/texts";
import { getConsents } from "@/modules/profile/queries";
import { PageTitle, Panel } from "@/components/app/Dashboard";

export const metadata = { title: "Приватность" };

const fmt = new Intl.DateTimeFormat("ru-RU", { dateStyle: "long", timeStyle: "short" });

export default async function PrivacyPage() {
  const user = await requireRole("employee");
  const consents = await getConsents(user.id);
  return (
    <>
      <PageTitle
        title="Приватность и согласия"
        lead="Каждое согласие хранится отдельно: что именно, какой версии текста и когда. Управление и отзыв согласий появятся на этапе приватности."
      />
      <Panel title="Твои согласия">
        <ul className="divide-y divide-line">
          {consents.map((c) => (
            <li key={c.id} className="flex flex-col gap-1 py-4 sm:flex-row sm:justify-between">
              <div>
                <p className="font-semibold">{consentTexts[c.purpose].title}</p>
                <p className="mt-1 text-xs text-mist">Версия текста: {c.textVersion}</p>
              </div>
              <p className="text-sm text-mist">
                {c.granted ? "Дано" : "Отозвано"} · {fmt.format(c.createdAt)}
              </p>
            </li>
          ))}
        </ul>
        <p className="mt-4 text-sm text-mist">
          Публикация профиля, передача данных работодателям и внешние AI-провайдеры не включены: на них нет
          твоего согласия.
        </p>
      </Panel>
    </>
  );
}
