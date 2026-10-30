import { requireRole } from "@/modules/auth/dal";
import { employerCompleteness } from "@/modules/profile/completeness";
import { getEmployerWithCompany } from "@/modules/profile/queries";
import { defaultPricing, formatRub } from "@/config/pricing";
import { CompletenessPanel, PageTitle, Panel } from "@/components/app/Dashboard";

export default async function EmployerHome() {
  const user = await requireRole("employer");
  const data = await getEmployerWithCompany(user.id);
  const completeness = employerCompleteness(data);

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
            <p className="font-semibold">Не оформлена</p>
            <p className="mt-2 text-sm text-mist">
              Стартовые условия: {formatRub(defaultPricing.subscriptionPriceRub)} в месяц, до{" "}
              {defaultPricing.includedContacts} контактов, затем {formatRub(defaultPricing.extraContactPriceRub)} за
              каждый новый. Оплата ещё не подключена.
            </p>
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
