import { requireRole } from "@/modules/auth/dal";
import { employerCompleteness } from "@/modules/profile/completeness";
import { getEmployerWithCompany } from "@/modules/profile/queries";
import Link from "next/link";
import { formatKopecks } from "@/config/pricing";
import { contactUsage } from "@/modules/billing/contacts";
import { getPricing } from "@/modules/billing/settings";
import { CompletenessPanel, PageTitle, Panel } from "@/components/app/Dashboard";

export default async function EmployerHome() {
  const user = await requireRole("employer");
  const data = await getEmployerWithCompany(user.id);
  const completeness = employerCompleteness(data);
  const [usage, pricing] = await Promise.all([contactUsage(user.id), getPricing()]);
  const date = new Intl.DateTimeFormat("ru-RU", { dateStyle: "long" });

  return (
    <>
      <PageTitle
        title={data.company ? data.company.name : "Добро пожаловать"}
        lead="Начни с данных о компании: они понадобятся для вакансий и видны кандидатам. Вакансии и подбор появятся в следующих этапах."
      />
      <div className="grid gap-6 md:grid-cols-2">
        <CompletenessPanel data={completeness} href="/company/settings" title="Заполненность компании" />
        <div className="grid gap-6">
          <Panel title="Подписка">
            {usage ? (
              <>
                <p className="font-semibold">Действует до {date.format(usage.subscription.periodEnd)}</p>
                <p className="mt-2 text-sm text-mist">
                  Открыто контактов: {usage.includedUsed} из {usage.subscription.includedContacts}.
                </p>
              </>
            ) : (
              <>
                <p className="font-semibold">Не оформлена</p>
                <p className="mt-2 text-sm text-mist">
                  {formatKopecks(pricing.subscriptionKopecks)} за {pricing.subscriptionDays} дн.: вакансии, AI-подбор, до {pricing.includedContacts}{" "}
                  контактов, затем {formatKopecks(pricing.extraContactKopecks)} за каждый.
                </p>
              </>
            )}
            <Link href="/company/billing" className="mt-3 inline-block text-sm text-neuron underline-offset-4 hover:underline">
              {usage ? "Подписка и платежи →" : "Оформить →"}
            </Link>
          </Panel>
          <Panel title="Вакансии и кандидаты">
            <p className="text-sm text-mist">
              Раздел в разработке. Подбор будет объяснять, почему кандидат подходит, и опираться только на то,
              что кандидат разрешил показывать.
            </p>
          </Panel>
        </div>
      </div>
    </>
  );
}
