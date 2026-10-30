import Link from "next/link";
import { redirectIfSignedIn } from "@/modules/auth/dal";
import { RegisterForm } from "@/components/auth/AuthForms";
import { brand } from "@/config/brand";

export const metadata = { title: `Регистрация — ${brand.name}` };

const COPY = {
  employee: { title: "Регистрация сотрудника", lead: "Тесты, резюме и карьерный консультант.", other: "Вы работодатель? Регистрация для работодателей →", otherRole: "employer" },
  employer: { title: "Регистрация работодателя", lead: "Вакансии и подбор кандидатов.", other: "Вы ищете работу? Регистрация для сотрудников →", otherRole: "employee" },
} as const;

export default async function RegisterPage({
  searchParams,
}: {
  searchParams: Promise<{ role?: string }>;
}) {
  await redirectIfSignedIn();
  const { role } = await searchParams;
  // Роль задана ссылкой с главной: показываем анкету только для неё. Без роли (прямая ссылка) выбор остаётся.
  const chosen = role === "employer" || role === "employee" ? role : null;
  const copy = chosen ? COPY[chosen] : null;
  return (
    <main className="mx-auto w-full max-w-xl px-5 py-16">
      <Link href="/" className="font-display text-sm">
        {brand.name}
      </Link>
      <h1 className="mt-10 font-display text-3xl">{copy ? copy.title : "Создать аккаунт"}</h1>
      {copy && <p className="mt-3 text-mist">{copy.lead}</p>}
      <div className="mt-8">
        <RegisterForm initialRole={chosen ?? "employee"} locked={chosen !== null} />
      </div>
      {copy && (
        <p className="mt-6 text-sm text-mist">
          <Link href={`/register?role=${copy.otherRole}`} className="text-neuron underline-offset-4 hover:underline">
            {copy.other}
          </Link>
        </p>
      )}
    </main>
  );
}
