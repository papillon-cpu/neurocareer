import { requireRole } from "@/modules/auth/dal";
import { Shell } from "@/components/app/Shell";

export default async function EmployeeLayout({ children }: { children: React.ReactNode }) {
  const user = await requireRole("employee");
  return (
    <Shell
      area="Кабинет сотрудника"
      email={user.email}
      nav={[
        { href: "/me", label: "Главная", exact: true },
        { href: "/me/profile", label: "Профиль" },
        { href: "/me/privacy", label: "Приватность" },
      ]}
      upcoming={["тесты", "резюме", "AI-консультант", "вакансии", "карьерный маршрут"]}
    >
      {children}
    </Shell>
  );
}
