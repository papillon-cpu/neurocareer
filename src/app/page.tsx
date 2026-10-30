import Link from "next/link";
import { SiteFooter, SiteHeader } from "@/components/landing/Chrome";

const choices = [
  {
    href: "/employees",
    label: "Сотрудникам",
    title: "Я развиваю карьеру",
    text: "Оценка потенциала, конструктор резюме и карьерный консультант. Профиль виден работодателям только по твоему решению.",
    cta: "Узнать больше",
    accent: "text-neuron",
  },
  {
    href: "/employers",
    label: "Работодателям",
    title: "Я ищу сотрудников",
    text: "Вакансии и объяснимый подбор среди кандидатов, которые сами опубликовали профиль.",
    cta: "Узнать больше",
    accent: "text-violet",
  },
] as const;

export default async function Home({ searchParams }: { searchParams: Promise<{ demo?: string }> }) {
  const { demo } = await searchParams;
  return (
    <>
      <SiteHeader />
      <main id="top" className="relative overflow-hidden">
        <div className="grid-lines absolute inset-0" aria-hidden />
        <div className="relative mx-auto max-w-5xl px-5 pb-24 pt-20 lg:pt-28">
          {demo === "missing" && (
            <p role="alert" className="mb-8 rounded-xl border border-danger/50 bg-danger/10 px-4 py-3 text-sm text-danger">
              Демо-аккаунта этой роли ещё нет. Создайте демо-аккаунты командой <code>npm run db:seed -- --demo</code>.
            </p>
          )}
          <p className="mb-6 font-mono text-xs uppercase tracking-[0.2em] text-neuron">AI-платформа нейрокарьерного развития</p>
          <h1 className="font-display text-4xl font-semibold leading-[1.1] sm:text-5xl">Кто вы?</h1>
          <p className="mt-6 max-w-xl text-lg text-mist">Выберите, что вам нужно, и мы покажем только то, что относится к вам.</p>
          <div className="mt-12 grid gap-6 md:grid-cols-2">
            {choices.map((c) => (
              <Link
                key={c.href}
                href={c.href}
                className="group rounded-3xl border border-line bg-panel p-8 transition-colors hover:border-neuron focus-visible:border-neuron"
              >
                <p className={`font-mono text-xs uppercase tracking-[0.2em] ${c.accent}`}>{c.label}</p>
                <h2 className="mt-4 font-display text-2xl">{c.title}</h2>
                <p className="mt-4 text-mist">{c.text}</p>
                <p className="mt-8 text-sm text-neuron">{c.cta} →</p>
              </Link>
            ))}
          </div>
        </div>
      </main>
      <SiteFooter />
    </>
  );
}
