import { redirect } from "next/navigation";
import { formatKopecks } from "@/config/pricing";
import { requireRole } from "@/modules/auth/dal";
import { hasEmployeeAccess } from "@/modules/billing/access";
import { startEmployeePaymentAction } from "@/modules/billing/actions";
import { getProvider } from "@/modules/billing/provider";
import { getPricing } from "@/modules/billing/settings";
import { PageTitle, Panel } from "@/components/app/Dashboard";
import { TestModeBanner } from "@/components/billing/TestModeBanner";

export const metadata = { title: "Доступ к платформе" };

const ERRORS: Record<string, string> = {
  unavailable: "Оплата пока не подключена. Попробуйте позже.",
  limit: "Слишком много попыток. Попробуйте через час.",
};

export default async function PayPage({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  const user = await requireRole("employee");
  if (await hasEmployeeAccess(user.id)) redirect("/me");
  const [{ employeeAccessKopecks }, { error }] = await Promise.all([getPricing(), searchParams]);
  const provider = getProvider();

  return (
    <>
      <PageTitle
        title="Откройте доступ"
        lead="Одна оплата, и сразу открывается всё: тесты потенциала, отчёты, конструктор резюме с AI и карьерный консультант."
      />
      <div className="grid max-w-4xl gap-6 md:grid-cols-[1.2fr_1fr]">
        <Panel title="Что входит">
          <ul className="space-y-3 text-sm">
            <li>Три теста: Soft Skills, аналитические способности, управленческий потенциал, с персональными отчётами и AI-пояснением.</li>
            <li>Конструктор резюме: с нуля или из старого файла, версии под разные вакансии, сохранение в PDF.</li>
            <li>Улучшение формулировок и карьерный AI-консультант (после вашего согласия на внешний AI).</li>
            <li className="text-mist">Оплата разовая, без подписки. Профиль и настройки приватности доступны бесплатно.</li>
          </ul>
        </Panel>
        <Panel title="Оплата">
          <p className="font-display text-5xl tabular-nums">{formatKopecks(employeeAccessKopecks)}</p>
          <p className="mt-1 text-sm text-mist">один раз</p>
          <div className="mt-5 space-y-4">
            {provider?.isTest && <TestModeBanner />}
            {error && ERRORS[error] && (
              <p role="alert" className="rounded-xl border border-danger/50 bg-danger/10 px-4 py-3 text-sm text-danger">
                {ERRORS[error]}
              </p>
            )}
            {provider || employeeAccessKopecks === 0 ? (
              <form action={startEmployeePaymentAction}>
                <button type="submit" className="w-full rounded-full bg-neuron px-6 py-3.5 text-sm font-semibold text-ink hover:bg-snow">
                  {employeeAccessKopecks === 0 ? "Получить доступ" : `Оплатить ${formatKopecks(employeeAccessKopecks)}`}
                </button>
              </form>
            ) : (
              <p className="text-sm text-mist">Оплата пока не подключена. Как только она заработает, здесь появится кнопка.</p>
            )}
          </div>
        </Panel>
      </div>
    </>
  );
}
