import Link from "next/link";
import { requireRole } from "@/modules/auth/dal";
import { hasSubscription } from "@/modules/vacancies/service";
import { PageTitle } from "@/components/app/Dashboard";
import { VacancyForm } from "@/components/vacancies/VacancyForm";

export const metadata = { title: "Новая вакансия" };

export default async function NewVacancyPage() {
  const user = await requireRole("employer");
  const subscribed = await hasSubscription(user.id);
  return (
    <>
      <Link href="/company/vacancies" className="text-sm text-mist hover:text-snow">
        ← Все вакансии
      </Link>
      <div className="mt-4">
        <PageTitle title="Новая вакансия" />
      </div>
      {subscribed ? (
        <VacancyForm
          initial={{ title: "", tasks: "", mustSkills: "", niceSkills: "", minExperienceYears: "", level: "", workFormat: "", city: "", salaryFrom: "", salaryTo: "", extra: "" }}
        />
      ) : (
        <p className="text-sm text-mist">
          Нужна действующая подписка.{" "}
          <Link href="/company/billing" className="text-neuron underline-offset-4 hover:underline">
            Оформить →
          </Link>
        </p>
      )}
    </>
  );
}
