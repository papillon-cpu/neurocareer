import Link from "next/link";
import { requireRole } from "@/modules/auth/dal";
import { listVacancies, hasSubscription, STATUS_LABEL } from "@/modules/vacancies/service";
import { ButtonLink } from "@/components/ui/Button";
import { PageTitle, Panel } from "@/components/app/Dashboard";
import { Notice } from "@/components/vacancies/Notice";

export const metadata = { title: "Вакансии" };

const fmt = new Intl.DateTimeFormat("ru-RU", { dateStyle: "medium" });

export default async function VacanciesPage({ searchParams }: { searchParams: Promise<{ m?: string }> }) {
  const user = await requireRole("employer");
  const [{ m }, list, subscribed] = await Promise.all([searchParams, listVacancies(user.id), hasSubscription(user.id)]);

  return (
    <>
      <PageTitle title="Вакансии" lead="Создайте вакансию, отправьте на модерацию и получите объяснимый подбор среди кандидатов, которые сами опубликовали профиль." />
      <Notice code={m} />
      {!subscribed && (
        <p role="status" className="mb-6 rounded-2xl border border-violet/60 bg-violet/10 px-4 py-3 text-sm">
          Создавать вакансии и подбирать кандидатов можно при действующей подписке.{" "}
          <Link href="/company/billing" className="text-neuron underline-offset-4 hover:underline">
            Оформить подписку →
          </Link>
        </p>
      )}
      <div className="mb-6">{subscribed && <ButtonLink href="/company/vacancies/new">Новая вакансия</ButtonLink>}</div>
      <Panel title="Ваши вакансии">
        {list.length === 0 ? (
          <p className="text-sm text-mist">Вакансий пока нет.</p>
        ) : (
          <ul className="divide-y divide-line">
            {list.map((v) => (
              <li key={v.id} className="flex flex-col gap-1 py-4 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <Link href={`/company/vacancies/${v.id}`} className="font-semibold hover:text-neuron">
                    {v.title}
                  </Link>
                  <p className="mt-1 text-xs text-mist">
                    Обязательных навыков: {v.mustSkills.length} · обновлена {fmt.format(v.updatedAt)}
                  </p>
                </div>
                <span className="w-fit rounded-full border border-line px-3 py-1 font-mono text-xs text-mist">{STATUS_LABEL[v.status]}</span>
              </li>
            ))}
          </ul>
        )}
      </Panel>
    </>
  );
}
