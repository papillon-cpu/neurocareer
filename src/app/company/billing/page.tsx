import { formatKopecks } from "@/config/pricing";
import { requireRole } from "@/modules/auth/dal";
import { startSubscriptionAction } from "@/modules/billing/actions";
import { contactUsage } from "@/modules/billing/contacts";
import { listPayments } from "@/modules/billing/payments";
import { getProvider } from "@/modules/billing/provider";
import { getPricing } from "@/modules/billing/settings";
import { PageTitle, Panel } from "@/components/app/Dashboard";
import { TestModeBanner } from "@/components/billing/TestModeBanner";

export const metadata = { title: "Подписка и платежи" };

const date = new Intl.DateTimeFormat("ru-RU", { dateStyle: "long" });
const dateTime = new Intl.DateTimeFormat("ru-RU", { dateStyle: "medium", timeStyle: "short" });
const KIND = { employee_access: "Доступ сотрудника", employer_subscription: "Подписка", extra_contact: "Дополнительный контакт" } as const;
const STATUS = { pending: "ожидает оплаты", succeeded: "оплачен", failed: "не прошёл", canceled: "отменён" } as const;
const ERRORS: Record<string, string> = {
  unavailable: "Оплата пока не подключена. Попробуйте позже.",
  limit: "Слишком много попыток. Попробуйте через час.",
};

export default async function BillingPage({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  const user = await requireRole("employer");
  const [pricing, usage, payments, { error }] = await Promise.all([getPricing(), contactUsage(user.id), listPayments(user.id), searchParams]);
  const provider = getProvider();
  const sub = usage?.subscription;

  return (
    <>
      <PageTitle title="Подписка и платежи" lead="Подписка открывает вакансии, AI-подбор и просмотр контактов кандидатов." />
      <div className="space-y-6">
        {provider?.isTest && <TestModeBanner />}
        {error && ERRORS[error] && (
          <p role="alert" className="rounded-xl border border-danger/50 bg-danger/10 px-4 py-3 text-sm text-danger">
            {ERRORS[error]}
          </p>
        )}

        <div className="grid gap-6 md:grid-cols-2">
          <Panel title="Текущий период">
            {sub && usage ? (
              <>
                <p className="font-semibold">Подписка действует до {date.format(sub.periodEnd)}</p>
                <p className="mt-4 font-display text-4xl tabular-nums">
                  {usage.includedUsed} <span className="text-lg text-mist">из {sub.includedContacts} контактов</span>
                </p>
                <div
                  role="progressbar"
                  aria-valuemin={0}
                  aria-valuemax={sub.includedContacts}
                  aria-valuenow={usage.includedUsed}
                  aria-label="Использовано включённых контактов"
                  className="mt-3 h-1.5 overflow-hidden rounded-full bg-line"
                >
                  <div className="h-full rounded-full bg-neuron" style={{ width: `${sub.includedContacts ? Math.min(100, (usage.includedUsed / sub.includedContacts) * 100) : 100}%` }} />
                </div>
                <p className="mt-3 text-sm text-mist">
                  Дополнительные контакты в этом периоде: {usage.paidCount} по {formatKopecks(sub.extraContactKopecks)}.
                </p>
              </>
            ) : (
              <>
                <p className="font-semibold">Подписки нет</p>
                <p className="mt-2 text-sm text-mist">Без подписки нельзя публиковать вакансии, получать подбор и открывать контакты.</p>
              </>
            )}
          </Panel>

          <Panel title={sub ? "Продлить" : "Оформить подписку"}>
            <p className="font-display text-4xl tabular-nums">{formatKopecks(pricing.subscriptionKopecks)}</p>
            <p className="mt-1 text-sm text-mist">за {pricing.subscriptionDays} дн.</p>
            <ul className="mt-4 space-y-1.5 text-sm text-mist">
              <li>Публикация вакансий</li>
              <li>AI-подбор релевантных кандидатов</li>
              <li>До {pricing.includedContacts} уникальных контактов за период</li>
              <li>Каждый следующий контакт: {formatKopecks(pricing.extraContactKopecks)}</li>
            </ul>
            {provider || pricing.subscriptionKopecks === 0 ? (
              <form action={startSubscriptionAction} className="mt-5">
                <button type="submit" className="rounded-full bg-neuron px-6 py-3 text-sm font-semibold text-ink hover:bg-snow">
                  {sub ? "Продлить" : "Оформить"} за {formatKopecks(pricing.subscriptionKopecks)}
                </button>
              </form>
            ) : (
              <p className="mt-5 text-sm text-mist">Оплата пока не подключена.</p>
            )}
            {sub && <p className="mt-3 text-xs text-mist">Продление начнётся после конца текущего периода: оплаченное время не теряется.</p>}
          </Panel>
        </div>

        <Panel title="Правила">
          <ul className="space-y-2 text-sm text-mist">
            <li>Контакт считается открытым в рамках периода: повторный просмотр того же кандидата в этом периоде ничего не списывает.</li>
            <li>Стоимость контакта сверх лимита показывается до действия; контакт открывается только после подтверждённой оплаты.</li>
            <li>Автоматического продления нет: когда период закончится, новые контакты закроются, а подписку можно продлить вручную.</li>
            <li>Если платёж не прошёл, ничего не списывается и доступ не меняется.</li>
            <li>Изменение тарифов не влияет на уже оплаченный период.</li>
          </ul>
        </Panel>

        <Panel title="История платежей">
          {payments.length === 0 ? (
            <p className="text-sm text-mist">Платежей пока нет.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[30rem] text-left text-sm">
                <thead className="text-xs text-mist">
                  <tr>
                    <th className="py-2 pr-4 font-normal">Дата</th>
                    <th className="py-2 pr-4 font-normal">За что</th>
                    <th className="py-2 pr-4 font-normal">Сумма</th>
                    <th className="py-2 font-normal">Статус</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-line">
                  {[...payments].reverse().map((p) => (
                    <tr key={p.id}>
                      <td className="py-3 pr-4 text-mist">{dateTime.format(p.createdAt)}</td>
                      <td className="py-3 pr-4">{KIND[p.kind]}</td>
                      <td className="py-3 pr-4 tabular-nums">{formatKopecks(p.amountKopecks)}</td>
                      <td className="py-3">{STATUS[p.status]}{p.provider === "sandbox" ? " · тест" : ""}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Panel>
      </div>
    </>
  );
}
