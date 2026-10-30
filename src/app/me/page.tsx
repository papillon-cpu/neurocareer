import Link from "next/link";
import { requireRole } from "@/modules/auth/dal";
import { catalog } from "@/modules/assessments/definitions";
import { getStatuses } from "@/modules/assessments/service";
import { employeeCompleteness } from "@/modules/profile/completeness";
import { getEmployeeProfile } from "@/modules/profile/queries";
import { listResumes } from "@/modules/resume/service";
import { CompletenessPanel, PageTitle, Panel } from "@/components/app/Dashboard";

const link = "text-neuron underline-offset-4 hover:underline";

export default async function EmployeeHome() {
  const user = await requireRole("employee");
  const [profile, statuses, resumes] = await Promise.all([
    getEmployeeProfile(user.id),
    getStatuses(user.id),
    listResumes(user.id),
  ]);
  const completeness = employeeCompleteness(profile);
  const name = profile.fullName.split(" ")[0] || "";

  const tests = catalog();
  const done = tests.filter((t) => statuses[t.slug]?.completed.length).length;
  const started = tests.filter((t) => statuses[t.slug]?.inProgress).length;

  return (
    <>
      <PageTitle
        title={name ? `Здравствуй, ${name}` : "Здравствуй"}
        lead="Здесь вся твоя карьерная работа: профиль, оценка потенциала и резюме. AI-консультант, вакансии и карьерный маршрут появятся по мере готовности."
      />
      <div className="grid gap-6 md:grid-cols-2">
        <CompletenessPanel data={completeness} href="/me/profile" />
        <div className="grid gap-6">
          <Panel title="Тесты">
            <p className="font-display text-3xl tabular-nums">
              {done} <span className="text-lg text-mist">из {tests.length} пройдено</span>
            </p>
            {started > 0 && <p className="mt-2 text-sm text-mist">Начато и не завершено: {started}.</p>}
            <Link href="/me/tests" className={`mt-3 inline-block text-sm ${link}`}>
              {done === 0 && started === 0 ? "Начать →" : "К тестам →"}
            </Link>
          </Panel>
          <Panel title="Резюме">
            <p className="text-sm">{resumes.length === 0 ? "Резюме ещё нет." : `Резюме: ${resumes.length}.`}</p>
            <Link href="/me/resume" className={`mt-3 inline-block text-sm ${link}`}>
              {resumes.length === 0 ? "Создать →" : "К резюме →"}
            </Link>
          </Panel>
          <Panel title="Публикация профиля">
            <p className="font-semibold">Не опубликован</p>
            <p className="mt-2 text-sm text-mist">
              Работодатели не видят твой профиль и результаты тестов. Публикация включится отдельным шагом с отдельным
              согласием.
            </p>
          </Panel>
        </div>
      </div>
    </>
  );
}
