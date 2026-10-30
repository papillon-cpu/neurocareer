import { requireRole } from "@/modules/auth/dal";
import { moderateVacancyAction } from "@/modules/vacancies/actions";
import { FORMATS, LEVELS, listForModeration, STATUS_LABEL } from "@/modules/vacancies/service";
import { PageTitle, Panel } from "@/components/app/Dashboard";

export const metadata = { title: "Модерация вакансий" };

const fmt = new Intl.DateTimeFormat("ru-RU", { dateStyle: "medium", timeStyle: "short" });
const MESSAGES: Record<string, { ok: boolean; text: string }> = {
  approved: { ok: true, text: "Вакансия одобрена и опубликована." },
  rejected: { ok: true, text: "Вакансия отклонена. Причина видна работодателю." },
  note_required: { ok: false, text: "Для отклонения укажите причину (не короче 3 символов)." },
  bad_status: { ok: false, text: "Вакансия уже обработана или изменила статус." },
  sensitive: { ok: false, text: "В тексте есть формулировки о личных признаках: одобрить нельзя, отклоните с причиной." },
  not_found: { ok: false, text: "Вакансия не найдена." },
};

export default async function AdminVacanciesPage({ searchParams }: { searchParams: Promise<{ m?: string }> }) {
  await requireRole("admin");
  const [{ m }, rows] = await Promise.all([searchParams, listForModeration()]);
  const msg = m ? MESSAGES[m] : undefined;
  const pending = rows.filter((r) => r.vacancy.status === "pending").length;

  return (
    <>
      <PageTitle title="Модерация вакансий" lead={`На проверке: ${pending}. Одобрение открывает работодателю подбор. Отклонить или снять можно и опубликованную вакансию: нужна причина.`} />
      {msg && (
        <p role={msg.ok ? "status" : "alert"} className={`mb-6 rounded-xl border px-4 py-3 text-sm ${msg.ok ? "border-neuron/50 bg-neuron/10 text-neuron" : "border-danger/50 bg-danger/10 text-danger"}`}>
          {msg.text}
        </p>
      )}
      {rows.length === 0 ? (
        <Panel title="Очередь">
          <p className="text-sm text-mist">Вакансий на модерации нет.</p>
        </Panel>
      ) : (
        <div className="space-y-6">
          {rows.map(({ vacancy: v, company, email }) => (
            <Panel key={v.id} title={`${STATUS_LABEL[v.status]} · ${fmt.format(v.updatedAt)}`}>
              <h2 className="font-display text-xl">{v.title}</h2>
              <p className="mt-1 text-xs text-mist">
                {company ?? "Компания не указана"} · {email}
              </p>
              <dl className="mt-4 space-y-3 text-sm">
                <div>
                  <dt className="text-xs text-mist">Задачи</dt>
                  <dd className="whitespace-pre-line">{v.tasks}</dd>
                </div>
                <div>
                  <dt className="text-xs text-mist">Обязательные / желательные навыки</dt>
                  <dd>
                    {v.mustSkills.join(", ") || "—"} / {v.niceSkills.join(", ") || "—"}
                  </dd>
                </div>
                <div>
                  <dt className="text-xs text-mist">Условия</dt>
                  <dd>
                    {[v.level && LEVELS[v.level], v.workFormat && FORMATS[v.workFormat], v.minExperienceYears !== null && `опыт от ${v.minExperienceYears} лет`, v.city].filter(Boolean).join(" · ") || "—"}
                  </dd>
                </div>
                {v.extra && (
                  <div>
                    <dt className="text-xs text-mist">Прочее</dt>
                    <dd className="whitespace-pre-line">{v.extra}</dd>
                  </div>
                )}
                {v.status === "rejected" && v.moderationNote && (
                  <div>
                    <dt className="text-xs text-mist">Причина отклонения</dt>
                    <dd>{v.moderationNote}</dd>
                  </div>
                )}
              </dl>
              {(v.status === "pending" || v.status === "published") && (
                <form action={moderateVacancyAction} className="mt-5 flex flex-col gap-3 border-t border-line pt-5 sm:flex-row sm:items-center">
                  <input type="hidden" name="id" value={v.id} />
                  <input
                    name="note"
                    maxLength={500}
                    placeholder="Причина (обязательна при отклонении)"
                    aria-label="Причина отклонения"
                    className="w-full rounded-xl border border-line bg-graphite px-4 py-2.5 text-sm sm:max-w-sm"
                  />
                  {v.status === "pending" && (
                    <button name="decision" value="approve" type="submit" className="rounded-full bg-neuron px-5 py-2.5 text-sm font-semibold text-ink hover:bg-snow">
                      Одобрить
                    </button>
                  )}
                  <button name="decision" value="reject" type="submit" className="rounded-full border border-line px-5 py-2.5 text-sm hover:border-danger hover:text-danger">
                    {v.status === "pending" ? "Отклонить" : "Снять с публикации"}
                  </button>
                </form>
              )}
            </Panel>
          ))}
        </div>
      )}
    </>
  );
}
