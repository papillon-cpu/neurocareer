import Link from "next/link";
import { requireRole } from "@/modules/auth/dal";
import { hasEmployeeAccess } from "@/modules/billing/access";
import { setConsentAction } from "@/modules/consent/actions";
import { hasConsent } from "@/modules/consent/service";
import { consentTexts } from "@/modules/consent/texts";
import { getConsents } from "@/modules/profile/queries";
import { hideProfileAction, revokeSharingAction } from "@/modules/visibility/actions";
import { getPublishedCard, getVisibility, publishableVersions } from "@/modules/visibility/service";
import { PageTitle, Panel } from "@/components/app/Dashboard";
import { DeleteAccountForm, PublishForm, SharingForm } from "@/components/privacy/PrivacyForms";

export const metadata = { title: "Приватность" };

const fmt = new Intl.DateTimeFormat("ru-RU", { dateStyle: "long", timeStyle: "short" });
const btn = "rounded-full border border-line px-4 py-1.5 text-xs text-mist hover:border-neuron hover:text-neuron";

export default async function PrivacyPage() {
  const user = await requireRole("employee");
  const [consents, ai, marketing, sharing, access, vis, versions] = await Promise.all([
    getConsents(user.id),
    hasConsent(user.id, "external_ai"),
    hasConsent(user.id, "marketing"),
    hasConsent(user.id, "employer_data_sharing"),
    hasEmployeeAccess(user.id),
    getVisibility(user.id),
    publishableVersions(user.id),
  ]);
  const card = vis.published ? await getPublishedCard(user.id) : null;

  const toggles = [
    { purpose: "external_ai" as const, on: ai, note: "Без этого согласия AI-консультант и AI в резюме не получают ваших данных." },
    { purpose: "marketing" as const, on: marketing, note: "Необязательно." },
  ];

  return (
    <>
      <PageTitle
        title="Приватность и согласия"
        lead="По умолчанию работодатели не видят ничего. Каждое разрешение отдельное, и каждое можно отозвать. Мы храним, что именно вы разрешили, какой версии текста и когда."
      />
      <div className="space-y-6">
        <Panel title="Публикация профиля в базе кандидатов">
          <p className="font-semibold">{card ? "Профиль опубликован" : "Профиль не опубликован"}</p>
          <div className="mt-3 text-sm text-mist">
            <p>Работодатели увидят: специализацию, город, желаемую должность, формат работы, «О себе» и выбранную версию резюме. Имя, email и телефон скрыты, пока работодатель не откроет ваш контакт, а после этого передаётся только то, что вы выберете ниже. Результаты тестов не передаются.</p>
            {card && <p className="mt-2">Сейчас видно: «{card.headline}»{card.city ? `, ${card.city}` : ""}.</p>}
          </div>
          <div className="mt-5">
            {access ? (
              <PublishForm versions={versions} current={card ? vis.resumeVersionId : null} />
            ) : (
              <p className="text-sm">
                Публикация доступна после открытия доступа к платформе.{" "}
                <Link href="/me/pay" className="text-neuron underline-offset-4 hover:underline">
                  Открыть доступ →
                </Link>
              </p>
            )}
          </div>
          {(card || vis.published) && (
            <div className="mt-5 flex flex-wrap gap-3 border-t border-line pt-5">
              <form action={hideProfileAction}>
                <button type="submit" className={btn}>Скрыть профиль (согласие сохранится)</button>
              </form>
              <form action={hideProfileAction}>
                <input type="hidden" name="revoke" value="yes" />
                <button type="submit" className={btn}>Скрыть и отозвать согласие</button>
              </form>
            </div>
          )}
        </Panel>

        <Panel title="Контакты для работодателей">
          {access ? (
            <>
              <SharingForm shareEmail={vis.shareEmail} sharePhone={vis.sharePhone} consented={sharing} />
              {sharing && (
                <form action={revokeSharingAction} className="mt-5 border-t border-line pt-5">
                  <button type="submit" className={btn}>Отозвать согласие на передачу данных</button>
                </form>
              )}
            </>
          ) : (
            <p className="text-sm text-mist">Выбор контактов появится после открытия доступа. По умолчанию ничего не передаётся.</p>
          )}
        </Panel>

        <Panel title="Другие согласия">
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
                  <button type="submit" className={btn}>{t.on ? "Отозвать" : "Разрешить"}</button>
                </form>
              </li>
            ))}
          </ul>
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

        <Panel title="Удаление данных">
          <DeleteAccountForm />
        </Panel>
      </div>
    </>
  );
}
