import Link from "next/link";
import { notFound } from "next/navigation";
import { requireRole } from "@/modules/auth/dal";
import { latestRun } from "@/modules/matching/service";
import { norm, findSkill } from "@/modules/matching/skills";
import { readAnalysis } from "@/modules/vacancies/analyzer";
import { runMatchingAction, vacancyOpAction } from "@/modules/vacancies/actions";
import { FORMATS, getOwnVacancy, hasSubscription, LEVELS, STATUS_LABEL, type Vacancy } from "@/modules/vacancies/service";
import { PageTitle, Panel } from "@/components/app/Dashboard";
import { Notice } from "@/components/vacancies/Notice";

export const metadata = { title: "Вакансия" };

const dateTime = new Intl.DateTimeFormat("ru-RU", { dateStyle: "medium", timeStyle: "short" });
const btn = "rounded-full border border-line px-4 py-2 text-sm text-snow hover:border-neuron hover:text-neuron";
const primary = "rounded-full bg-neuron px-5 py-2.5 text-sm font-semibold text-ink hover:bg-snow";

function Op({ id, op, children, primaryStyle = false }: { id: string; op: string; children: React.ReactNode; primaryStyle?: boolean }) {
  return (
    <form action={vacancyOpAction}>
      <input type="hidden" name="id" value={id} />
      <input type="hidden" name="op" value={op} />
      <button type="submit" className={primaryStyle ? primary : btn}>
        {children}
      </button>
    </form>
  );
}

function Chips({ items, empty }: { items: string[]; empty: string }) {
  if (items.length === 0) return <span className="text-sm text-mist">{empty}</span>;
  return (
    <ul className="flex flex-wrap gap-2">
      {items.map((s) => (
        <li key={s} className="rounded-full border border-line px-3 py-1 text-xs">
          {s}
        </li>
      ))}
    </ul>
  );
}

function Details({ v }: { v: Vacancy }) {
  const money = new Intl.NumberFormat("ru-RU");
  const salary =
    v.salaryFrom !== null || v.salaryTo !== null
      ? [v.salaryFrom !== null ? `от ${money.format(v.salaryFrom)}` : "", v.salaryTo !== null ? `до ${money.format(v.salaryTo)}` : ""].filter(Boolean).join(" ") + " ₽"
      : "не указана";
  const facts = [
    ["Уровень", v.level ? LEVELS[v.level] : "не указан"],
    ["Опыт", v.minExperienceYears !== null ? `от ${v.minExperienceYears} лет` : "не указан"],
    ["Формат", v.workFormat ? FORMATS[v.workFormat] : "не указан"],
    ["Город", v.city || "не указан"],
    ["Вилка", salary],
  ];
  return (
    <div className="space-y-5 text-sm">
      <dl className="grid gap-x-8 gap-y-3 sm:grid-cols-3">
        {facts.map(([k, val]) => (
          <div key={k}>
            <dt className="text-xs text-mist">{k}</dt>
            <dd>{val}</dd>
          </div>
        ))}
      </dl>
      <div>
        <p className="mb-2 text-xs text-mist">Задачи</p>
        <p className="whitespace-pre-line">{v.tasks || "—"}</p>
      </div>
      <div>
        <p className="mb-2 text-xs text-mist">Обязательные навыки</p>
        <Chips items={v.mustSkills} empty="не указаны" />
      </div>
      <div>
        <p className="mb-2 text-xs text-mist">Желательные навыки</p>
        <Chips items={v.niceSkills} empty="не указаны" />
      </div>
      {v.extra && (
        <div>
          <p className="mb-2 text-xs text-mist">Прочее</p>
          <p className="whitespace-pre-line">{v.extra}</p>
        </div>
      )}
    </div>
  );
}

export default async function VacancyPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ m?: string }> }) {
  const user = await requireRole("employer");
  const [{ id }, { m }] = await Promise.all([params, searchParams]);
  const v = await getOwnVacancy(user.id, id);
  if (!v) notFound();
  const subscribed = await hasSubscription(user.id);
  const analysis = readAnalysis(v.analysis);
  const editable = (v.status === "draft" || v.status === "rejected") && subscribed;

  const present = { listed: [...v.mustSkills, ...v.niceSkills].map(norm), text: "" };
  const suggestions = analysis ? [...analysis.mustSkills, ...analysis.niceSkills].filter((s) => !findSkill(s, present)) : [];
  const run = v.status === "published" && subscribed ? await latestRun(user.id, v.id) : null;

  return (
    <>
      <Link href="/company/vacancies" className="text-sm text-mist hover:text-snow">
        ← Все вакансии
      </Link>
      <div className="mt-4">
        <PageTitle title={v.title} />
      </div>
      <Notice code={m} />
      {!subscribed && v.status !== "closed" && (
        <p role="status" className="mb-6 rounded-2xl border border-violet/60 bg-violet/10 px-4 py-3 text-sm">
          Подписка не действует: правка, отправка и подбор закрыты. Вакансию можно закрыть.{" "}
          <Link href="/company/billing" className="text-neuron underline-offset-4 hover:underline">
            Продлить →
          </Link>
        </p>
      )}

      <div className="space-y-6">
        <Panel title={`Статус: ${STATUS_LABEL[v.status]}`}>
          {v.status === "rejected" && v.moderationNote && (
            <p className="mb-4 rounded-xl border border-danger/50 bg-danger/10 px-4 py-3 text-sm text-danger">Причина отклонения: {v.moderationNote}</p>
          )}
          {v.status === "pending" && <p className="mb-4 text-sm text-mist">Вакансия ждёт проверки администратором. Подбор откроется после одобрения.</p>}
          {v.status === "published" && v.publishedAt && <p className="mb-4 text-sm text-mist">Одобрена {dateTime.format(v.publishedAt)}.</p>}
          <div className="flex flex-wrap gap-3">
            {editable && (
              <Link href={`/company/vacancies/${v.id}/edit`} className={btn}>
                Редактировать
              </Link>
            )}
            {editable && (
              <Op id={v.id} op="submit" primaryStyle>
                Отправить на модерацию
              </Op>
            )}
            {(v.status === "pending" || v.status === "published") && (
              <Op id={v.id} op="withdraw">
                {v.status === "pending" ? "Отозвать с модерации" : "Снять с публикации"}
              </Op>
            )}
            {v.status !== "closed" && (
              <Op id={v.id} op="close">
                Закрыть вакансию
              </Op>
            )}
            {v.status === "closed" && subscribed && (
              <Op id={v.id} op="reopen">
                Открыть снова
              </Op>
            )}
          </div>
        </Panel>

        <Panel title="Вакансия">
          <Details v={v} />
        </Panel>

        {v.status !== "closed" && (
          <Panel title="Проверка вакансии">
            <p className="text-sm text-mist">
              Показывает, чего не хватает, и предлагает структурированные требования. Это подсказка: на подбор влияют только навыки, которые вы сами внесли в вакансию.
            </p>
            {subscribed && (
              <div className="mt-4">
                <Op id={v.id} op="analyze">
                  {analysis ? "Проверить заново" : "Проверить вакансию"}
                </Op>
              </div>
            )}
            {analysis && (
              <div className="mt-5 space-y-4 border-t border-line pt-5 text-sm">
                <p className="text-xs text-mist">
                  {analysis.source === "ai"
                    ? "Разбор выполнил AI по тексту вашей вакансии. Проверьте его."
                    : "Проверка по правилам. AI не использовался (не подключён или не ответил), структурирование текста недоступно."}
                  {v.analyzedAt ? ` · ${dateTime.format(v.analyzedAt)}` : ""}
                </p>
                {analysis.summary && <p>{analysis.summary}</p>}
                {analysis.seniority && <p>Уровень по тексту: {LEVELS[analysis.seniority]}</p>}
                {analysis.responsibilities.length > 0 && (
                  <ul className="list-inside list-disc space-y-1">
                    {analysis.responsibilities.map((r) => (
                      <li key={r}>{r}</li>
                    ))}
                  </ul>
                )}
                {suggestions.length > 0 && (
                  <div>
                    <p className="mb-2 text-xs text-mist">Предложенные навыки, которых нет в вашей вакансии</p>
                    <Chips items={suggestions} empty="" />
                    {editable && (
                      <div className="mt-3">
                        <Op id={v.id} op="applySkills">
                          Добавить в вакансию
                        </Op>
                      </div>
                    )}
                  </div>
                )}
                {analysis.issues.length > 0 && (
                  <div>
                    <p className="mb-2 text-xs text-mist">Что стоит исправить</p>
                    <ul className="list-inside list-disc space-y-1">
                      {analysis.issues.map((i) => (
                        <li key={i}>{i}</li>
                      ))}
                    </ul>
                  </div>
                )}
                {analysis.questions.length > 0 && (
                  <div>
                    <p className="mb-2 text-xs text-mist">Что уточнить</p>
                    <ul className="list-inside list-disc space-y-1">
                      {analysis.questions.map((q) => (
                        <li key={q}>{q}</li>
                      ))}
                    </ul>
                  </div>
                )}
                {analysis.issues.length === 0 && analysis.questions.length === 0 && suggestions.length === 0 && <p>Замечаний нет.</p>}
              </div>
            )}
          </Panel>
        )}

        <Panel title="Подбор кандидатов">
          {v.status !== "published" ? (
            <p className="text-sm text-mist">Подбор доступен для одобренной вакансии{subscribed ? "" : " и при действующей подписке"}.</p>
          ) : !subscribed ? (
            <p className="text-sm text-mist">Подбор закрыт: подписка не действует.</p>
          ) : (
            <>
              <ul className="space-y-1.5 text-sm text-mist">
                <li>Ищем только среди кандидатов, которые сами опубликовали профиль и видны вам без имени и контактов.</li>
                <li>Сначала отбираем тех, у кого есть обязательные навыки, затем сравниваем навыки, стаж по датам резюме и формат работы.</li>
                <li>Оценка показывает совпадение с вашими требованиями по данным профиля. Это не вероятность найма и не оценка человека: решение остаётся за вами.</li>
                <li>Результаты тестов не используются и вам не передаются. Пол, возраст и другие личные признаки в подборе не участвуют.</li>
              </ul>
              <form action={runMatchingAction} className="mt-5 flex flex-wrap items-center gap-x-6 gap-y-3">
                <input type="hidden" name="id" value={v.id} />
                <label className="flex items-center gap-2 text-sm">
                  <input type="checkbox" name="includePartial" className="size-4 accent-neuron" />
                  Показать и тех, кому не хватает части обязательных навыков
                </label>
                <button type="submit" className={primary}>
                  Подобрать кандидатов
                </button>
              </form>

              {run && run.at && (
                <div className="mt-6 border-t border-line pt-5">
                  <p className="text-xs text-mist">
                    Последний подбор: {dateTime.format(run.at)}. Найдено: {run.items.length}
                    {run.hidden > 0 ? `. Ещё ${run.hidden} скрыли профиль после подбора` : ""}.
                  </p>
                  {run.items.length === 0 ? (
                    <p className="mt-3 text-sm">Подходящих опубликованных кандидатов пока нет. Попробуйте отметить показ частичных совпадений или ослабить обязательные требования.</p>
                  ) : (
                    <ol className="mt-3 divide-y divide-line">
                      {run.items.map((r) => (
                        <li key={r.id} className="flex flex-col gap-2 py-4 sm:flex-row sm:items-center sm:justify-between">
                          <div>
                            <Link href={`/company/vacancies/${v.id}/candidates/${r.candidateId}`} className="font-semibold hover:text-neuron">
                              {r.card.headline}
                              {r.card.city ? ` · ${r.card.city}` : ""}
                            </Link>
                            <p className="mt-1 text-xs text-mist">
                              Обязательные навыки: {r.mustMatched} из {r.mustTotal} · подтверждено фактов: {r.explanation.confirmed.length} · не хватает: {r.explanation.gaps.length}
                            </p>
                          </div>
                          <div className="flex items-center gap-4">
                            <p className="font-display text-2xl tabular-nums" title="Совпадение с требованиями по данным профиля, не вероятность найма">
                              {r.score}
                              <span className="text-sm text-mist"> / 100</span>
                            </p>
                            <Link href={`/company/vacancies/${v.id}/candidates/${r.candidateId}`} className={btn}>
                              Подробнее
                            </Link>
                          </div>
                        </li>
                      ))}
                    </ol>
                  )}
                </div>
              )}
            </>
          )}
        </Panel>
      </div>
    </>
  );
}
