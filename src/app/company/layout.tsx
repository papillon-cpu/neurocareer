import { requireRole } from "@/modules/auth/dal";
import { Shell } from "@/components/app/Shell";

export default async function EmployerLayout({ children }: { children: React.ReactNode }) {
  const user = await requireRole("employer");
  return (
    <Shell
      area="Кабинет работодателя"
      email={user.email}
      nav={[
        { href: "/company", label: "Главная", exact: true },
        { href: "/company/vacancies", label: "Вакансии" },
        { href: "/company/settings", label: "Компания" },
        { href: "/company/billing", label: "Подписка" },
      ]}
    >
      {children}
    </Shell>
  );
}
