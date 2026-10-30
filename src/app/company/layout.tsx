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
        { href: "/company/settings", label: "Компания" },
        { href: "/company/billing", label: "Подписка" },
      ]}
      upcoming={["вакансии", "поиск кандидатов", "AI-рекомендации", "контакты"]}
    >
      {children}
    </Shell>
  );
}
