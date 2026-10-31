import Link from "next/link";
import { redirectIfSignedIn } from "@/modules/auth/dal";
import { ResetPasswordForm } from "@/components/auth/AuthForms";
import { isResetTokenValid } from "@/modules/auth/password-reset";
import { brand } from "@/config/brand";

export const metadata = { title: `Новый пароль — ${brand.name}` };

export default async function ResetPasswordPage({ searchParams }: { searchParams: Promise<{ token?: string }> }) {
  await redirectIfSignedIn();
  const { token } = await searchParams;
  const valid = token ? await isResetTokenValid(token) : false;
  return (
    <main className="mx-auto w-full max-w-md px-5 py-16">
      <Link href="/" className="font-display text-sm">
        {brand.name}
      </Link>
      <h1 className="mt-10 font-display text-3xl">Новый пароль</h1>
      <div className="mt-8">
        {token && valid ? (
          <ResetPasswordForm token={token} />
        ) : (
          <p role="alert" className="text-sm text-danger">
            Ссылка недействительна или устарела.{" "}
            <Link href="/forgot-password" className="text-neuron underline-offset-4 hover:underline">
              Запросить новую
            </Link>
          </p>
        )}
      </div>
    </main>
  );
}
