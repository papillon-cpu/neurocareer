import Link from "next/link";
import { SiteFooter, SiteHeader } from "@/components/landing/Chrome";
import { ButtonLink } from "@/components/ui/Button";

export default async function Home({ searchParams }: { searchParams: Promise<{ demo?: string }> }) {
  const { demo } = await searchParams;
  return (
    <>
      <SiteHeader />
      <main id="top" className="relative overflow-hidden">
        <div className="grid-lines absolute inset-0" aria-hidden />
        <div className="relative mx-auto max-w-3xl px-5 pb-24 pt-24 lg:pt-32">
          {demo === "missing" && (
            <p role="alert" className="mb-8 rounded-xl border border-danger/50 bg-danger/10 px-4 py-3 text-sm text-danger">
              Демо-аккаунта этой роли ещё нет. Создайте демо-аккаунты командой <code>npm run db:seed -- --demo</code>.
            </p>
          )}
          <p className="mb-6 font-mono text-xs uppercase tracking-[0.2em] text-neuron">AI-платформа нейрокарьерного развития</p>
          <h1 className="font-display text-4xl font-semibold leading-[1.1] sm:text-5xl lg:text-6xl">
            Твой потенциал.
            <br />
            <span className="text-neuron">Твоя следующая</span>
            <br />
            карьерная высота.
          </h1>
          <p className="mt-8 max-w-xl text-lg text-mist">
            Оценка навыков, резюме и карьерный консультант для сотрудников. Объяснимый подбор кандидатов для работодателей.
          </p>
          <div className="mt-10 flex flex-col gap-3 sm:flex-row">
            <ButtonLink href="/register">Создать аккаунт</ButtonLink>
            <ButtonLink href="/login" variant="ghost">
              Войти
            </ButtonLink>
          </div>
          <p className="mt-8 text-sm text-mist">
            Подробнее:{" "}
            <Link href="/employees" className="text-neuron underline-offset-4 hover:underline">
              для сотрудников
            </Link>
            {" · "}
            <Link href="/employers" className="text-neuron underline-offset-4 hover:underline">
              для работодателей
            </Link>
          </p>
        </div>
      </main>
      <SiteFooter />
    </>
  );
}
