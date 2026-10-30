import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { requireRole } from "@/modules/auth/dal";
import { getOwnVacancy, hasSubscription } from "@/modules/vacancies/service";
import { PageTitle } from "@/components/app/Dashboard";
import { VacancyForm } from "@/components/vacancies/VacancyForm";

export const metadata = { title: "Правка вакансии" };

export default async function EditVacancyPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await requireRole("employer");
  const { id } = await params;
  const v = await getOwnVacancy(user.id, id);
  if (!v) notFound();
  if ((v.status !== "draft" && v.status !== "rejected") || !(await hasSubscription(user.id))) redirect(`/company/vacancies/${v.id}?m=bad_status`);
  return (
    <>
      <Link href={`/company/vacancies/${v.id}`} className="text-sm text-mist hover:text-snow">
        ← К вакансии
      </Link>
      <div className="mt-4">
        <PageTitle title="Правка вакансии" lead={v.status === "rejected" ? "После правки вакансия станет черновиком: её нужно снова отправить на модерацию." : undefined} />
      </div>
      <VacancyForm
        initial={{
          id: v.id,
          title: v.title,
          tasks: v.tasks,
          mustSkills: v.mustSkills.join(", "),
          niceSkills: v.niceSkills.join(", "),
          minExperienceYears: v.minExperienceYears?.toString() ?? "",
          level: v.level ?? "",
          workFormat: v.workFormat ?? "",
          city: v.city,
          salaryFrom: v.salaryFrom?.toString() ?? "",
          salaryTo: v.salaryTo?.toString() ?? "",
          extra: v.extra,
        }}
      />
    </>
  );
}
