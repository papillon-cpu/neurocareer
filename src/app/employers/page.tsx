import { brand } from "@/config/brand";
import { ButtonLink } from "@/components/ui/Button";
import { SiteFooter, SiteHeader } from "@/components/landing/Chrome";
import { defaultPricing, formatRub } from "@/config/pricing";

export const metadata = { title: `Работодателям — ${brand.name}` };

const steps = [
  { n: "01", title: "Опишите вакансию", text: "Задачи, обязательные и желательные навыки, опыт, формат. Администратор проверяет вакансию перед публикацией." },
  { n: "02", title: "Получите подбор", text: "Среди кандидатов, которые сами опубликовали профиль. Видно, что подтверждено данными, чего не хватает и что можно развить." },
  { n: "03", title: "Откройте контакт", text: "Цена показывается до действия. Контакты видны только если кандидат разрешил их передавать." },
];

const principles = [
  "Подтверждённое данными отдельно от выводов AI: факты из профиля и предположения не смешиваются.",
  "Оценка — это совпадение с вашими требованиями, а не вероятность найма.",
  "Платформа не отказывает кандидатам автоматически: решение за вами.",
  "Результаты тестов кандидатов работодателям не передаются. Пол, возраст и другие личные признаки в подборе не участвуют.",
];

export default function EmployersPage() {
  return (
    <>
      <SiteHeader
        nav={[
          { href: "#how", label: "Как это работает" },
          { href: "#price", label: "Подписка" },
          { href: "#principles", label: "Принципы" },
        ]}
      />
      <main id="top">
        <section className="relative overflow-hidden">
          <div className="grid-lines absolute inset-0" aria-hidden />
          <div className="relative mx-auto max-w-6xl px-5 pb-24 pt-20 lg:pt-28">
            <div className="rise max-w-3xl">
              <p className="mb-6 font-mono text-xs uppercase tracking-[0.2em] text-violet">Работодателям</p>
              <h1 className="font-display text-4xl font-semibold leading-[1.1] sm:text-5xl lg:text-6xl">
                Подбор по навыкам и опыту, <span className="text-neuron">а не по словам в резюме</span>
              </h1>
              <p className="mt-8 max-w-xl text-lg text-mist">
                Объяснимое соответствие вакансии и кандидата: какие требования подтверждены, чего не хватает, что можно развить.
              </p>
              <div className="mt-10 flex flex-col gap-3 sm:flex-row">
                <ButtonLink href="/register?role=employer">Создать аккаунт</ButtonLink>
                <ButtonLink href="/login" variant="ghost">
                  Войти
                </ButtonLink>
              </div>
            </div>
          </div>
        </section>

        <section id="how" className="mx-auto max-w-6xl scroll-mt-20 px-5 py-24">
          <h2 className="font-display text-3xl sm:text-4xl">Как это работает</h2>
          <ol className="mt-12 divide-y divide-line border-y border-line">
            {steps.map((s) => (
              <li key={s.n} className="grid gap-3 py-8 md:grid-cols-[6rem_1fr_2fr] md:items-baseline">
                <span className="font-mono text-sm text-neuron">{s.n}</span>
                <h3 className="font-display text-xl">{s.title}</h3>
                <p className="text-mist">{s.text}</p>
              </li>
            ))}
          </ol>
        </section>

        <section id="price" className="scroll-mt-20 border-y border-line bg-graphite">
          <div className="mx-auto grid max-w-6xl gap-12 px-5 py-24 lg:grid-cols-2">
            <h2 className="font-display text-3xl sm:text-4xl">Подписка с понятной стоимостью контактов</h2>
            <div className="rounded-3xl border border-line bg-panel p-8">
              <p className="font-mono text-xs text-mist">Подписка</p>
              <p className="mt-2 font-display text-4xl">
                {formatRub(defaultPricing.subscriptionPriceRub)}
                <span className="text-base text-mist"> / месяц</span>
              </p>
              <ul className="mt-6 space-y-2 text-sm text-mist">
                <li>Вакансии и подбор кандидатов</li>
                <li>До {defaultPricing.includedContacts} уникальных контактов в период</li>
                <li>Каждый следующий контакт — {formatRub(defaultPricing.extraContactPriceRub)}</li>
                <li>Повторное открытие контакта не списывается</li>
              </ul>
              <p className="mt-6 font-mono text-xs text-mist">Стартовые условия; оплата пока в тестовом режиме.</p>
            </div>
          </div>
        </section>

        <section id="principles" className="scroll-mt-20">
          <div className="mx-auto max-w-6xl px-5 py-24">
            <h2 className="font-display text-3xl sm:text-4xl">Принципы подбора</h2>
            <ul className="mt-10 grid gap-x-12 gap-y-6 text-mist md:grid-cols-2">
              {principles.map((p) => (
                <li key={p} className="border-l-2 border-violet pl-4">{p}</li>
              ))}
            </ul>
            <div className="mt-12">
              <ButtonLink href="/register?role=employer">Создать аккаунт</ButtonLink>
            </div>
          </div>
        </section>
      </main>
      <SiteFooter />
    </>
  );
}
