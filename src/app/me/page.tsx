import { requireRole } from "@/modules/auth/dal";
import { employeeCompleteness } from "@/modules/profile/completeness";
import { getEmployeeProfile } from "@/modules/profile/queries";
import { CompletenessPanel, PageTitle, Panel } from "@/components/app/Dashboard";

export default async function EmployeeHome() {
  const user = await requireRole("employee");
  const profile = await getEmployeeProfile(user.id);
  const completeness = employeeCompleteness(profile);
  const name = profile.fullName.split(" ")[0] || "";

  return (
    <>
      <PageTitle
        title={name ? `Здравствуй, ${name}` : "Здравствуй"}
        lead="Здесь будет вся твоя карьерная работа. Сейчас доступен профиль и настройки приватности; остальное появится по мере готовности."
      />
      <div className="grid gap-6 md:grid-cols-2">
        <CompletenessPanel data={completeness} href="/me/profile" />
        <div className="grid gap-6">
          <Panel title="Публикация профиля">
            <p className="font-semibold">Не опубликован</p>
            <p className="mt-2 text-sm text-mist">
              Работодатели не видят твой профиль. Публикация включится отдельным шагом с отдельным согласием.
            </p>
          </Panel>
          <Panel title="Тесты и резюме">
            <p className="text-sm text-mist">
              Три оценки потенциала и конструктор резюме ещё в разработке. Результатов пока нет, и мы не
              показываем цифр, которых не существует.
            </p>
          </Panel>
        </div>
      </div>
    </>
  );
}
