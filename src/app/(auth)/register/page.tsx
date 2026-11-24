import { redirectIfSignedIn } from "@/modules/auth/dal";
import { RegisterForm } from "@/components/auth/AuthForms";
import { brand } from "@/config/brand";
import { AuthHeader } from "@/components/auth/AuthHeader";

export const metadata = { title: `Регистрация — ${brand.name}` };

export default async function RegisterPage({
  searchParams,
}: {
  searchParams: Promise<{ role?: string }>;
}) {
  await redirectIfSignedIn();
  const { role } = await searchParams;
  return (
    <main className="mx-auto w-full max-w-xl px-5 py-16">
      <AuthHeader />
      <h1 className="mt-10 font-display text-3xl">Создать аккаунт</h1>
      <div className="mt-8">
        <RegisterForm initialRole={role === "employer" ? "employer" : "employee"} />
      </div>
    </main>
  );
}
