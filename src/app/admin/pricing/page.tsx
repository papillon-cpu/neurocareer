import { requireRole } from "@/modules/auth/dal";
import { getPricing } from "@/modules/billing/settings";
import { PageTitle } from "@/components/app/Dashboard";
import { PricingForm } from "@/components/billing/PricingForm";

export const metadata = { title: "Тарифы" };

export default async function AdminPricingPage() {
  await requireRole("admin");
  const p = await getPricing();
  return (
    <>
      <PageTitle title="Тарифы и лимиты" lead="Изменения применяются только к новым платежам: уже оплаченные периоды сохраняют свои условия. Каждое изменение записывается в журнал." />
      <PricingForm
        initial={{
          employeeAccess: p.employeeAccessKopecks / 100,
          subscription: p.subscriptionKopecks / 100,
          subscriptionDays: p.subscriptionDays,
          includedContacts: p.includedContacts,
          extraContact: p.extraContactKopecks / 100,
        }}
      />
    </>
  );
}
