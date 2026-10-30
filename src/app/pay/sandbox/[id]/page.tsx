import Link from "next/link";
import { eq } from "drizzle-orm";
import { notFound, redirect } from "next/navigation";
import { z } from "zod";
import { formatKopecks } from "@/config/pricing";
import { getCurrentUser } from "@/modules/auth/dal";
import { sandboxResolveAction } from "@/modules/billing/actions";
import { getProvider } from "@/modules/billing/provider";
import { getDb, schema } from "@/server/db";

export const metadata = { title: "Тестовая оплата" };

const WHAT = {
  employee_access: "Доступ к тестам, резюме и AI-консультанту",
  employer_subscription: "Подписка работодателя",
  extra_contact: "Дополнительный контакт кандидата",
} as const;

const btn = "w-full rounded-full px-6 py-3.5 text-sm font-semibold";

/** Страница-имитация оплаты у провайдера. Существует только в тестовом режиме. */
export default async function SandboxPayPage({ params }: { params: Promise<{ id: string }> }) {
  if (getProvider()?.id !== "sandbox") notFound();
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  const { id } = await params;
  if (!z.uuid().safeParse(id).success) notFound();

  const db = await getDb();
  const [p] = await db.select().from(schema.payments).where(eq(schema.payments.id, id));
  if (!p || p.userId !== user.id || p.provider !== "sandbox") notFound();

  return (
    <main className="mx-auto w-full max-w-md px-5 py-16">
      <p className="rounded-2xl border border-violet/60 bg-violet/10 px-4 py-3 text-sm">
        <b>ТЕСТОВАЯ ОПЛАТА.</b> Это имитация платёжной страницы для разработки. Реальные деньги не списываются.
      </p>
      <h1 className="mt-8 font-display text-2xl">{WHAT[p.kind]}</h1>
      <p className="mt-4 font-display text-5xl tabular-nums">{formatKopecks(p.amountKopecks)}</p>

      {p.status === "pending" ? (
        <form action={sandboxResolveAction} className="mt-8 space-y-3">
          <input type="hidden" name="paymentId" value={p.id} />
          <button type="submit" name="outcome" value="succeeded" className={`${btn} bg-neuron text-ink hover:bg-snow`}>
            Имитировать успешную оплату
          </button>
          <button type="submit" name="outcome" value="failed" className={`${btn} border border-line text-mist hover:border-danger hover:text-danger`}>
            Имитировать отказ банка
          </button>
          <button type="submit" name="outcome" value="canceled" className={`${btn} border border-line text-mist hover:text-snow`}>
            Отменить
          </button>
        </form>
      ) : (
        <div className="mt-8 space-y-4">
          <p role="status" className="text-sm text-mist">
            Платёж уже обработан: {p.status === "succeeded" ? "оплачен" : p.status === "failed" ? "не прошёл" : "отменён"}.
          </p>
          <Link href={p.kind === "employee_access" ? "/me" : "/company/billing"} className="text-sm text-neuron underline-offset-4 hover:underline">
            Вернуться на платформу →
          </Link>
        </div>
      )}
    </main>
  );
}
