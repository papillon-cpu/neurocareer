import { requireRole } from "@/modules/auth/dal";
import { getEmployeeProfile } from "@/modules/profile/queries";
import { PageTitle } from "@/components/app/Dashboard";
import { EmployeeProfileForm } from "@/components/app/ProfileForms";

export const metadata = { title: "Профиль" };

export default async function ProfilePage() {
  const user = await requireRole("employee");
  const p = await getEmployeeProfile(user.id);
  return (
    <>
      <PageTitle title="Профессиональный профиль" lead="Эти сведения видишь только ты, пока не опубликуешь профиль." />
      <EmployeeProfileForm
        initial={{
          fullName: p.fullName,
          headline: p.headline,
          city: p.city,
          desiredRole: p.desiredRole,
          workFormat: p.workFormat,
          about: p.about,
        }}
      />
    </>
  );
}
