import { requireRole } from "@/modules/auth/dal";
import { explanationSchema } from "@/modules/matching/score";
import { listReports, REPORT_REASONS, type ReportReason } from "@/modules/matching/service";
import { resolveReportAction } from "@/modules/vacancies/actions";
import { PageTitle, Panel } from "@/components/app/Dashboard";

export const metadata = { title: "Жалобы на подбор" };

const fmt = new Intl.DateTimeFormat("ru-RU", { dateStyle: "medium", timeStyle: "short" });

export default async function AdminReportsPage({ searchParams }: { searchParams: Promise<{ m?: string }> }) {
  await requireRole("admin");
  const [{ m }, rows] = await Promise.all([searchParams, listReports()]);
  const open = rows.filter((r) => r.report.status === "open").length;

  return (
    <>
      <PageTitle
        title="Жалобы на подбор"
        lead={`Открытых: ${open}. Здесь видно, что именно показали работодателю: оценка и объяснение сохранены в истории рекомендаций. Кандидат в жалобе не раскрывается.`}
      />
      {m === "resolved" && <p role="status" className="mb-6 rounded-xl border border-neuron/50 bg-neuron/10 px-4 py-3 text-sm text-neuron">Жалоба закрыта.</p>}
      {rows.length === 0 ? (
        <Panel title="Жалобы">
          <p className="text-sm text-mist">Жалоб нет.</p>
        </Panel>
      ) : (
        <div className="space-y-6">
          {rows.map(({ report, rec, vacancyTitle, reporterEmail }) => {
            const ex = explanationSchema.safeParse(rec.explanation);
            return (
              <Panel key={report.id} title={`${report.status === "open" ? "Открыта" : "Закрыта"} · ${fmt.format(report.createdAt)}`}>
                <p className="font-semibold">{REPORT_REASONS[report.reason as ReportReason] ?? report.reason}</p>
                {report.comment && <p className="mt-2 whitespace-pre-line text-sm">{report.comment}</p>}
                <p className="mt-2 text-xs text-mist">
                  Вакансия «{vacancyTitle}» · работодатель {reporterEmail} · оценка {rec.score}/100 · обязательных навыков {rec.mustMatched} из {rec.mustTotal} · алгоритм {rec.algorithmVersion}
                </p>
                {ex.success && (
                  <ul className="mt-3 list-inside list-disc space-y-1 text-sm text-mist">
                    {[...ex.data.confirmed, ...ex.data.gaps].map((t) => (
                      <li key={t}>{t}</li>
                    ))}
                  </ul>
                )}
                {report.status === "open" ? (
                  <form action={resolveReportAction} className="mt-5 flex flex-col gap-3 border-t border-line pt-5 sm:flex-row">
                    <input type="hidden" name="id" value={report.id} />
                    <input name="note" maxLength={500} placeholder="Заметка о решении" aria-label="Заметка о решении" className="w-full rounded-xl border border-line bg-graphite px-4 py-2.5 text-sm sm:max-w-sm" />
                    <button type="submit" className="rounded-full border border-line px-5 py-2.5 text-sm hover:border-neuron hover:text-neuron">
                      Закрыть жалобу
                    </button>
                  </form>
                ) : (
                  report.resolutionNote && <p className="mt-3 text-sm">Решение: {report.resolutionNote}</p>
                )}
              </Panel>
            );
          })}
        </div>
      )}
    </>
  );
}
