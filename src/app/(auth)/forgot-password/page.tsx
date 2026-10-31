import Link from "next/link";
import { redirectIfSignedIn } from "@/modules/auth/dal";
import { ForgotPasswordForm } from "@/components/auth/AuthForms";
import { brand } from "@/config/brand";

export const metadata = { title: `Восстановление пароля — ${brand.name}` };

export default async function ForgotPasswordPage() {
  await redirectIfSignedIn();
  return (
    <main className="mx-auto w-full max-w-md px-5 py-16">
      <Link href="/" className="font-display text-sm">
        {brand.name}
      </Link>
      <h1 className="mt-10 font-display text-3xl">Восстановление пароля</h1>
      <p className="mt-3 text-sm text-mist">Укажите email аккаунта, и мы отправим ссылку для смены пароля.</p>
      <div className="mt-8">
        <ForgotPasswordForm />
      </div>
    </main>
  );
}
