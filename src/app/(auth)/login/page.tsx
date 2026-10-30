import Link from "next/link";
import { redirectIfSignedIn } from "@/modules/auth/dal";
import { LoginForm } from "@/components/auth/AuthForms";
import { brand } from "@/config/brand";

export const metadata = { title: `Вход — ${brand.name}` };

export default async function LoginPage() {
  await redirectIfSignedIn();
  return (
    <main className="mx-auto w-full max-w-md px-5 py-16">
      <Link href="/" className="font-display text-sm">
        {brand.name}
      </Link>
      <h1 className="mt-10 font-display text-3xl">Вход</h1>
      <div className="mt-8">
        <LoginForm />
      </div>
    </main>
  );
}
