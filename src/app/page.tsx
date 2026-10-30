import { brand } from "@/config/brand";
import { defaultPricing, formatRub } from "@/config/pricing";
import { ButtonLink } from "@/components/ui/Button";
import { SkillMap } from "@/components/SkillMap";
import { ThemeToggle } from "@/components/ThemeToggle";

const tests = [
  {
    n: "01",
    title: "Soft Skills",
    text: "Ситуации без очевидно «правильных» ответов: коммуникация, обратная связь, конфликты, ответственность.",
  },
  {
    n: "02",
    title: "Аналитика",
    text: "Закономерности, таблицы, причины и следствия, решения при неполных данных. Ответы проверяет код, а не нейросеть.",
  },
  {
    n: "03",
    title: "Управленческий потенциал",
    text: "Кейсы про приоритеты, делегирование, риски и изменения. Каждый кейс оценивается по заранее заданной рубрике.",
  },
];

const principles = [
  "Согласия раздельные: публикация профиля, передача данных работодателю и внешние AI — три разных решения.",
  "Контакты скрыты, пока работодатель не откроет их, а результаты тестов — пока ты сам их не откроешь.",
  "AI предлагает, человек решает. Автоматических отказов нет.",
  "Нет выдуманных норм и процентилей: пока методика не валидирована, это предварительная оценка.",
];

export default function Home() {
  return (
    <>
      <header className="sticky top-0 z-20 border-b border-line/60 bg-ink/80 backdrop-blur">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-5 py-4">
          <a href="#top" className="font-display text-sm tracking-wide">
            {brand.name}
          </a>
          <nav aria-label="Основная" className="hidden gap-8 text-sm text-mist md:flex">
            <a className="hover:text-snow" href="#tests">Тесты</a>
            <a className="hover:text-snow" href="#career">Сотрудникам</a>
            <a className="hover:text-snow" href="#employers">Работодателям</a>
            <a className="hover:text-snow" href="#privacy">Приватность</a>
          </nav>
          <ThemeToggle />
        </div>
      </header>

      <main id="top">
        <section className="relative overflow-hidden">
          <div className="grid-lines absolute inset-0" aria-hidden />
          <div className="relative mx-auto grid max-w-6xl gap-12 px-5 pb-24 pt-20 lg:grid-cols-[1.2fr_0.8fr] lg:pt-28">
            <div className="rise">
              <p className="mb-6 font-mono text-xs uppercase tracking-[0.2em] text-neuron">
                AI-платформа нейрокарьерного развития
              </p>
              <h1 className="font-display text-4xl font-semibold leading-[1.1] sm:text-5xl lg:text-6xl">
                Твой потенциал.
                <br />
                <span className="text-neuron">Твоя следующая</span>
                <br />
                карьерная высота.
              </h1>
              <p className="mt-8 max-w-xl text-lg text-mist">
                Узнай свои сильные стороны, раскрой профессиональный потенциал и найди
                возможности, которые подходят именно тебе.
              </p>
              <div className="mt-10 flex flex-col gap-3 sm:flex-row">
                <ButtonLink href="#career">Я развиваю карьеру</ButtonLink>
                <ButtonLink href="#employers" variant="ghost">
                  Я ищу сотрудников
                </ButtonLink>
              </div>
            </div>
            <div className="rise [animation-delay:150ms]">
              <SkillMap />
            </div>
          </div>
        </section>

        <section id="tests" className="mx-auto max-w-6xl scroll-mt-20 px-5 py-24">
          <h2 className="font-display text-3xl sm:text-4xl">Три оценки потенциала</h2>
          <p className="mt-4 max-w-2xl text-mist">
            Собственная методика NEUROCAREER с оригинальными заданиями. Это предварительная
            оценка навыков и потенциала, а не научно доказанный психометрический тест.
          </p>
          <ol className="mt-12 divide-y divide-line border-y border-line">
            {tests.map((t) => (
              <li key={t.n} className="grid gap-3 py-8 md:grid-cols-[6rem_1fr_2fr] md:items-baseline">
                <span className="font-mono text-sm text-neuron">{t.n}</span>
                <h3 className="font-display text-xl">{t.title}</h3>
                <p className="text-mist">{t.text}</p>
              </li>
            ))}
          </ol>
        </section>

        <section id="career" className="scroll-mt-20 border-y border-line bg-graphite">
          <div className="mx-auto grid max-w-6xl gap-12 px-5 py-24 lg:grid-cols-2">
            <div>
              <p className="font-mono text-xs uppercase tracking-[0.2em] text-neuron">Сотрудникам</p>
              <h2 className="mt-4 font-display text-3xl sm:text-4xl">
                Карьерный консультант, который знает твой опыт
              </h2>
            </div>
            <ul className="space-y-5 text-mist">
              <li><b className="text-snow">AI-консультант</b> разбирает опыт и достижения, предлагает направления и план развития навыков.</li>
              <li><b className="text-snow">Конструктор резюме</b> достаёт данные из старого PDF/DOCX и ничего не выдумывает: сомнительное помечает на проверку.</li>
              <li><b className="text-snow">Публикация — только по твоему решению.</b> Ты выбираешь, что увидят работодатели.</li>
            </ul>
          </div>
        </section>

        <section id="employers" className="mx-auto max-w-6xl scroll-mt-20 px-5 py-24">
          <p className="font-mono text-xs uppercase tracking-[0.2em] text-violet">Работодателям</p>
          <h2 className="mt-4 max-w-3xl font-display text-3xl sm:text-4xl">
            Подбор по навыкам и опыту, а не по словам в резюме
          </h2>
          <div className="mt-12 grid gap-10 lg:grid-cols-[1.3fr_1fr]">
            <ul className="space-y-5 text-mist">
              <li><b className="text-snow">Объяснимое соответствие:</b> какие требования подтверждены, чего не хватает, что можно развить.</li>
              <li><b className="text-snow">Подтверждённое отдельно от выводов AI:</b> факты из профиля и предположения не смешиваются.</li>
              <li><b className="text-snow">Решение за вами.</b> Платформа не отказывает кандидатам автоматически.</li>
            </ul>
            <div className="rounded-3xl border border-line bg-panel p-8">
              <p className="font-mono text-xs text-mist">Подписка</p>
              <p className="mt-2 font-display text-4xl">
                {formatRub(defaultPricing.subscriptionPriceRub)}
                <span className="text-base text-mist"> / месяц</span>
              </p>
              <ul className="mt-6 space-y-2 text-sm text-mist">
                <li>Вакансии и AI-подбор кандидатов</li>
                <li>До {defaultPricing.includedContacts} уникальных контактов в период</li>
                <li>
                  Каждый следующий контакт — {formatRub(defaultPricing.extraContactPriceRub)}
                </li>
                <li>Повторное открытие контакта не списывается</li>
              </ul>
              <p className="mt-6 font-mono text-xs text-mist">
                Стартовые условия; оплата будет подключена на этапе монетизации.
              </p>
            </div>
          </div>
        </section>

        <section id="privacy" className="border-t border-line bg-graphite">
          <div className="mx-auto max-w-6xl px-5 py-24">
            <h2 className="font-display text-3xl sm:text-4xl">Приватность — часть продукта</h2>
            <ul className="mt-10 grid gap-x-12 gap-y-6 text-mist md:grid-cols-2">
              {principles.map((p) => (
                <li key={p} className="border-l-2 border-neuron pl-4">{p}</li>
              ))}
            </ul>
          </div>
        </section>
      </main>

      <footer className="border-t border-line">
        <div className="mx-auto flex max-w-6xl flex-col gap-2 px-5 py-8 text-xs text-mist sm:flex-row sm:justify-between">
          <span>© {brand.name}. Проект на стадии разработки.</span>
          <span>Юридические тексты будут проверены специалистом до запуска.</span>
        </div>
      </footer>
    </>
  );
}
