import Link from "next/link";
import { notFound } from "next/navigation";
import { formatKopecks } from "@/config/pricing";
import { requireRole } from "@/modules/auth/dal";
import { aiAvailable } from "@/modules/ai/config";
import { contactUsage, quoteContact } from "@/modules/billing/contacts";
import { hasReported, recommendationFor, REPORT_REASONS } from "@/modules/matching/service";
import { explainAiAction, payExtraContactAction, reportAction, unlockContactAction } from "@/modules/vacancies/actions";
import { getOwnVacancy } from "@/modules/vacancies/service";
import { contactsShareable, getCandidateForEmployer } from "@/modules/visibility/service";
import { PageTitle, Panel } from "@/components/app/Dashboard";
import { Notice } from "@/components/vacancies/Notice";

export const metadata = { title: "Кандидат" };

const btn = "rounded-full border border-line px-4 py-2 text-sm text-snow hover:border-neuron hover:text-neuron";
const primary = "rounded-full bg-neuron px-5 py-2.5 text-sm font-semibold text-ink hover:bg-snow";
const FORMAT = { office: "Офис", hybrid: "Гибрид", remote: "Удалённо" } as const;

function List({ title, items, mark, tone = "" }: { title: string; items: string[]; mark: string; tone?: string }) {
  if (items.length === 0) return null;
  return (
    <div>
      <h3 className="mb-2 text-xs text-mist">{title}</h3>
      <ul className="space-y-1.5 text-sm">
        {items.map((t) => (
          <li key={t} className={tone}>
            <span aria-hidden="true">{mark} </span>
            {t}
          </li>
        ))}
      </ul>
    </div>
  );
}

export default async function CandidatePage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string; candidateId: string }>;
  searchParams: Promise<{ m?: string }>;
}) {
  const user = await requireRole("employer");
  const [{ id, candidateId }, { m }] = await Promise.all([params, searchParams]);
  // Доступ к карточке только через рекомендацию по вашей вакансии; чужие и скрытые профили дают 404.
  const rec = await recommendationFor(user.id, id, candidateId);
  const vacancy = await getOwnVacancy(user.id, id);
  if (!rec || !vacancy) notFound();

  const [data, quote, usage, shareable, reported] = await Promise.all([
    getCandidateForEmployer(user.id, candidateId),
    quoteContact(user.id, candidateId),
    contactUsage(user.id),
    contactsShareable(candidateId),
    hasReported(user.id, rec.id),
  ]);
  if (!data) notFound();
  const { card, contacts } = data;
  const r = card.resume;
  const included = usage?.subscription.includedContacts ?? 0;
  const aiReady = aiAvailable("match_explain");
  const hidden = { vacancyId: id, candidateId };

  return (
    <>
      <Link href={`/company/vacancies/${id}`} className="text-sm text-mist hover:text-snow">
        ← {vacancy.title}
      </Link>
      <div className="mt-4">
        <PageTitle title={card.headline || "Кандидат"} lead={[card.city, card.desiredRole && `хочет: ${card.desiredRole}`, card.workFormat && FORMAT[card.workFormat as keyof typeof FORMAT]].filter(Boolean).join(" · ")} />
      </div>
      <Notice code={m} />

      <div className="grid gap-6 lg:grid-cols-[1.4fr_1fr]">
        <div className="space-y-6">
          <Panel title="Почему рекомендован">
            <div className="mb-5 flex items-end gap-3">
              <p className="font-display text-5xl tabular-nums">{rec.score}</p>
              <p className="pb-1 text-sm text-mist">из 100 · совпадение с требованиями по данным профиля. Это не вероятность найма.</p>
            </div>
            <p className="mb-5 text-sm text-mist">
              Обязательные навыки: {rec.mustMatched} из {rec.mustTotal}. Объяснение построено по данным, которые кандидат опубликовал, без AI.
            </p>
            <div className="space-y-5">
              <List title="Подтверждено данными" items={rec.explanation.confirmed} mark="✓" />
              <List title="Чего не хватает" items={rec.explanation.gaps} mark="○" tone="text-snow" />
              <List title="Что можно развить" items={rec.explanation.develop} mark="→" />
              <List title="Ограничения данных" items={rec.explanation.notes} mark="•" tone="text-mist" />
            </div>
          </Panel>

          <Panel title="Вывод AI">
            {rec.ai ? (
              <div className="space-y-4 text-sm">
                <p className="rounded-xl border border-violet/60 bg-violet/10 px-4 py-3 text-xs">
                  Это вывод AI, а не факт из профиля. Он не влияет на оценку и порядок, проверьте его на собеседовании.
                </p>
                <p>{rec.ai.summary}</p>
                <List title="Что может пригодиться из опыта" items={rec.ai.transferable} mark="→" />
                <List title="Что стоит выяснить" items={rec.ai.toVerify} mark="?" />
              </div>
            ) : (
              <>
                <p className="text-sm text-mist">
                  Необязательное пояснение от AI: как опыт кандидата соотносится с задачами. Выполняется только если AI подключён и сам кандидат разрешил такую обработку. Имя и контакты AI не получает.
                </p>
                {aiReady ? (
                  <form action={explainAiAction} className="mt-4">
                    <input type="hidden" name="vacancyId" value={id} />
                    <input type="hidden" name="candidateId" value={candidateId} />
                    <button type="submit" className={btn}>
                      Получить вывод AI
                    </button>
                  </form>
                ) : (
                  <p className="mt-3 text-sm">AI пока не подключён администратором. Подбор по данным работает без него.</p>
                )}
              </>
            )}
          </Panel>

          <Panel title="Карточка кандидата">
            <div className="space-y-5 text-sm">
              {card.about && <p className="whitespace-pre-line">{card.about}</p>}
              {r.skills.length > 0 && (
                <div>
                  <h3 className="mb-2 text-xs text-mist">Навыки</h3>
                  <ul className="flex flex-wrap gap-2">
                    {r.skills.map((s) => (
                      <li key={s} className="rounded-full border border-line px-3 py-1 text-xs">
                        {s}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
              {r.experience.length > 0 && (
                <div>
                  <h3 className="mb-2 text-xs text-mist">Опыт</h3>
                  <ul className="space-y-3">
                    {r.experience.map((e, i) => (
                      <li key={i}>
                        <p className="font-semibold">
                          {[e.position, e.company].filter(Boolean).join(", ")} <span className="font-normal text-mist">{[e.start, e.end].filter(Boolean).join(" — ")}</span>
                        </p>
                        {e.description && <p className="mt-1 whitespace-pre-line text-mist">{e.description}</p>}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
              {r.education.length > 0 && (
                <div>
                  <h3 className="mb-2 text-xs text-mist">Образование</h3>
                  <ul className="space-y-1">
                    {r.education.map((e, i) => (
                      <li key={i}>{[e.institution, e.degree].filter(Boolean).join(" · ")}</li>
                    ))}
                  </ul>
                </div>
              )}
              {r.languages.length > 0 && (
                <p>
                  <span className="text-xs text-mist">Языки: </span>
                  {r.languages.map((l) => [l.name, l.level].filter(Boolean).join(" — ")).join(", ")}
                </p>
              )}
            </div>
            <p className="mt-5 text-xs text-mist">Имя и контакты скрыты, пока вы не откроете контакт. Результаты тестов не передаются.</p>
          </Panel>
        </div>

        <div className="space-y-6">
          <Panel title="Контакты">
            {contacts ? (
              <dl className="space-y-3 text-sm">
                <div>
                  <dt className="text-xs text-mist">Имя</dt>
                  <dd className="font-semibold">{contacts.fullName || "—"}</dd>
                </div>
                {contacts.email && (
                  <div>
                    <dt className="text-xs text-mist">Email</dt>
                    <dd>{contacts.email}</dd>
                  </div>
                )}
                {contacts.phone && (
                  <div>
                    <dt className="text-xs text-mist">Телефон</dt>
                    <dd>{contacts.phone}</dd>
                  </div>
                )}
                <p className="text-xs text-mist">Контакт открыт в этом периоде подписки, повторных списаний нет.</p>
              </dl>
            ) : !shareable ? (
              <p className="text-sm text-mist">Кандидат не передаёт контакты работодателям (или не выбрал, что показывать). Открыть нечего, поэтому ничего не списывается.</p>
            ) : quote.state === "no_subscription" ? (
              <p className="text-sm text-mist">Подписка не действует: контакты закрыты.</p>
            ) : quote.state === "already" ? (
              <p className="text-sm text-mist">Контакт уже открыт, но кандидат сейчас ничего не передаёт.</p>
            ) : quote.state === "included" ? (
              <form action={unlockContactAction} className="space-y-4">
                <input type="hidden" name="vacancyId" value={hidden.vacancyId} />
                <input type="hidden" name="candidateId" value={hidden.candidateId} />
                <p className="text-sm">
                  Входит в подписку: будет использован контакт <strong>{quote.used + 1}</strong> из {quote.included}. Доплаты нет.
                </p>
                <button type="submit" className={primary}>
                  Открыть контакт
                </button>
              </form>
            ) : (
              <form action={payExtraContactAction} className="space-y-4">
                <input type="hidden" name="vacancyId" value={hidden.vacancyId} />
                <input type="hidden" name="candidateId" value={hidden.candidateId} />
                <input type="hidden" name="priceKopecks" value={quote.priceKopecks} />
                <p className="text-sm">
                  Лимит подписки ({included}) исчерпан. Контакт стоит <strong>{formatKopecks(quote.priceKopecks)}</strong> и откроется после подтверждённой оплаты. Пока вы не оплатили, ничего не списывается.
                </p>
                <button type="submit" className={primary}>
                  Оплатить {formatKopecks(quote.priceKopecks)} и открыть
                </button>
              </form>
            )}
          </Panel>

          <Panel title="Жалоба на рекомендацию">
            {reported ? (
              <p className="text-sm text-mist">Вы уже отправили жалобу на эту рекомендацию. Администратор её рассмотрит.</p>
            ) : (
              <details>
                <summary className="cursor-pointer text-sm text-neuron">Рекомендация ошибочна</summary>
                <form action={reportAction} className="mt-4 space-y-3">
                  <input type="hidden" name="vacancyId" value={hidden.vacancyId} />
                  <input type="hidden" name="candidateId" value={hidden.candidateId} />
                  <select name="reason" className="w-full rounded-xl border border-line bg-graphite px-4 py-3 text-sm" defaultValue="wrong_match" aria-label="Причина жалобы">
                    {Object.entries(REPORT_REASONS).map(([k, label]) => (
                      <option key={k} value={k}>
                        {label}
                      </option>
                    ))}
                  </select>
                  <textarea
                    name="comment"
                    maxLength={1000}
                    placeholder="Что именно неверно (необязательно)"
                    aria-label="Комментарий"
                    className="min-h-24 w-full rounded-xl border border-line bg-graphite px-4 py-3 text-sm"
                  />
                  <button type="submit" className={btn}>
                    Отправить жалобу
                  </button>
                </form>
              </details>
            )}
          </Panel>
        </div>
      </div>
    </>
  );
}
