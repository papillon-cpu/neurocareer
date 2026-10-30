import type { ResumeContent } from "@/modules/resume/content";

// «Бумага»: цвета заданы явно и не зависят от темы сайта, чтобы PDF всегда был на белом.
const paper = "bg-white text-neutral-900 shadow-xl print:shadow-none";

const period = (start: string, end: string) => [start, end].filter(Boolean).join(" — ");

function H({ children }: { children: React.ReactNode }) {
  return (
    <h3 className="mb-2 border-b border-neutral-300 pb-1 text-[11px] font-semibold uppercase tracking-[0.14em] text-neutral-500">
      {children}
    </h3>
  );
}

function Experience({ items }: { items: ResumeContent["experience"] }) {
  if (!items.length) return null;
  return (
    <section>
      <H>Опыт работы</H>
      <div className="space-y-4">
        {items.map((e, i) => (
          <article key={i} className="break-inside-avoid">
            <div className="flex flex-wrap justify-between gap-x-4">
              <p className="font-semibold">{[e.position, e.company].filter(Boolean).join(", ")}</p>
              <p className="text-xs text-neutral-500">{period(e.start, e.end)}</p>
            </div>
            {e.description && <p className="mt-1 whitespace-pre-line text-sm text-neutral-700">{e.description}</p>}
          </article>
        ))}
      </div>
    </section>
  );
}

function Education({ items }: { items: ResumeContent["education"] }) {
  if (!items.length) return null;
  return (
    <section>
      <H>Образование</H>
      <div className="space-y-2">
        {items.map((e, i) => (
          <article key={i} className="break-inside-avoid">
            <div className="flex flex-wrap justify-between gap-x-4">
              <p className="font-semibold">{e.institution}</p>
              <p className="text-xs text-neutral-500">{period(e.start, e.end)}</p>
            </div>
            {e.degree && <p className="text-sm text-neutral-700">{e.degree}</p>}
          </article>
        ))}
      </div>
    </section>
  );
}

function Projects({ items }: { items: ResumeContent["projects"] }) {
  if (!items.length) return null;
  return (
    <section>
      <H>Проекты</H>
      <div className="space-y-3">
        {items.map((p, i) => (
          <article key={i} className="break-inside-avoid">
            <p className="font-semibold">{p.name}</p>
            {p.description && <p className="whitespace-pre-line text-sm text-neutral-700">{p.description}</p>}
          </article>
        ))}
      </div>
    </section>
  );
}

function SimpleLists({ c }: { c: ResumeContent }) {
  return (
    <>
      {c.skills.length > 0 && (
        <section>
          <H>Навыки</H>
          <p className="text-sm">{c.skills.join(" · ")}</p>
        </section>
      )}
      {c.languages.length > 0 && (
        <section>
          <H>Языки</H>
          <ul className="space-y-0.5 text-sm">
            {c.languages.map((l, i) => (
              <li key={i}>{[l.name, l.level].filter(Boolean).join(" — ")}</li>
            ))}
          </ul>
        </section>
      )}
      {c.certificates.length > 0 && (
        <section>
          <H>Сертификаты</H>
          <ul className="space-y-0.5 text-sm">
            {c.certificates.map((x, i) => (
              <li key={i}>{[x.name, x.issuer, x.year].filter(Boolean).join(", ")}</li>
            ))}
          </ul>
        </section>
      )}
    </>
  );
}

const contacts = (c: ResumeContent) =>
  [c.basics.email, c.basics.phone, c.basics.city].filter(Boolean);

export function ResumeView({ content: c }: { content: ResumeContent }) {
  const empty = !c.basics.fullName && !c.experience.length && !c.skills.length && !c.basics.summary;

  if (c.template === "modern") {
    return (
      <div className={`grid min-h-[28rem] overflow-hidden rounded-lg sm:grid-cols-[13rem_1fr] ${paper}`}>
        <aside className="space-y-5 bg-neutral-100 p-6 print:bg-neutral-100">
          <div className="space-y-1 text-xs text-neutral-700">
            {contacts(c).map((x) => (
              <p key={x} className="break-words">
                {x}
              </p>
            ))}
          </div>
          <SimpleLists c={c} />
        </aside>
        <div className="space-y-5 p-6 sm:p-8">
          <header>
            <h2 className="text-2xl font-bold leading-tight">{c.basics.fullName || "Имя Фамилия"}</h2>
            {c.basics.headline && <p className="mt-1 text-neutral-600">{c.basics.headline}</p>}
          </header>
          {empty && <p className="text-sm text-neutral-400">Заполните форму слева, и резюме появится здесь.</p>}
          {c.basics.summary && (
            <section>
              <H>О себе</H>
              <p className="whitespace-pre-line text-sm text-neutral-700">{c.basics.summary}</p>
            </section>
          )}
          <Experience items={c.experience} />
          <Education items={c.education} />
          <Projects items={c.projects} />
        </div>
      </div>
    );
  }

  return (
    <div className={`space-y-5 rounded-lg p-6 sm:p-10 ${paper}`}>
      <header className="border-b-2 border-neutral-900 pb-4">
        <h2 className="text-3xl font-bold leading-tight">{c.basics.fullName || "Имя Фамилия"}</h2>
        {c.basics.headline && <p className="mt-1 text-lg text-neutral-600">{c.basics.headline}</p>}
        {contacts(c).length > 0 && <p className="mt-2 text-sm text-neutral-600">{contacts(c).join("  ·  ")}</p>}
      </header>
      {empty && <p className="text-sm text-neutral-400">Заполните форму, и резюме появится здесь.</p>}
      {c.basics.summary && (
        <section>
          <H>О себе</H>
          <p className="whitespace-pre-line text-sm text-neutral-700">{c.basics.summary}</p>
        </section>
      )}
      <Experience items={c.experience} />
      <Education items={c.education} />
      <Projects items={c.projects} />
      <SimpleLists c={c} />
    </div>
  );
}
