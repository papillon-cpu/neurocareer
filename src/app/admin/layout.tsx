import { requireRole } from "@/modules/auth/dal";
import { Shell } from "@/components/app/Shell";

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const user = await requireRole("admin");
  return (
    <Shell
      area="Администратор"
      email={user.email}
      nav={[
        { href: "/admin", label: "Пользователи", exact: true },
        { href: "/admin/vacancies", label: "Вакансии" },
        { href: "/admin/reports", label: "Жалобы" },
        { href: "/admin/pricing", label: "Тарифы" },
        { href: "/admin/audit", label: "Журнал" },
      ]}
      upcoming={["методики тестов"]}
    >
      {children}
    </Shell>
  );
}
