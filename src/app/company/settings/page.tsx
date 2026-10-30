import { requireRole } from "@/modules/auth/dal";
import { getEmployerWithCompany } from "@/modules/profile/queries";
import { PageTitle } from "@/components/app/Dashboard";
import { CompanyForm } from "@/components/app/ProfileForms";

export const metadata = { title: "Компания" };

export default async function CompanySettingsPage() {
  const user = await requireRole("employer");
  const d = await getEmployerWithCompany(user.id);
  return (
    <>
      <PageTitle title="Настройки компании" />
      <CompanyForm
        initial={{
          fullName: d.fullName,
          position: d.position,
          name: d.company?.name ?? "",
          industry: d.company?.industry ?? "",
          size: d.company?.size ?? "",
          site: d.company?.site ?? "",
          description: d.company?.description ?? "",
        }}
      />
    </>
  );
}
