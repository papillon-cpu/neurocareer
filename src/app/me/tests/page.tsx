import Link from "next/link";
import { requireEmployeeAccess } from "@/modules/billing/access";
import { startAttemptAction } from "@/modules/assessments/actions";
import { catalog } from "@/modules/assessments/definitions";
import { requiredIds } from "@/modules/assessments/engine";
import { getStatuses } from "@/modules/assessments/service";
import { PageTitle } from "@/components/app/Dashboard";

export const metadata = { title: "Тесты" };

const fmt = new Intl.DateTimeFormat("ru-RU", { dateStyle: "medium" });
const primary = "inline-flex rounded-full bg-neuron px-5 py-2.5 text-sm font-semibold text-ink hover:bg-snow";
const ghost = "inline-flex rounded-full border border-line px-5 py-2.5 text-sm text-mist hover:border-neuron hover:text-neuron";

export default async function TestsPage() {
  const user = await requireEmployeeAccess();
  const statuses = await getStatuses(user.id);

  return (
    <>
      <PageTitle
        title="Оценка потенциала"
        lead="Три предварительные оценки навыков по собственной методике NEUROCAREER. Это не научно доказанные психометрические тесты. Результаты видите только вы."
      />
      <ul className="space-y-4">
        {catalog().map((def) => {
          const s = statuses[def.slug];
          const total = requiredIds(def).length;
          const last = s?.completed[0];
          return (
            <li key={def.slug} className="rounded-3xl border border-line bg-panel p-6 sm:p-8">
              <div className="flex flex-wrap items-start justify-between gap-4">
                <div className="max-w-xl">
                  <h2 className="font-display text-xl">{def.title}</h2>
                  <p className="mt-2 text-sm text-mist">{def.tagline}</p>
                  <p className="mt-3 font-mono text-xs text-mist">
                    ~{def.minutes} минут · {def.questions.length} заданий
                  </p>
                </div>
                <div className="flex flex-wrap gap-3">
                  {s?.inProgress ? (
                    <form action={startAttemptAction}>
                      <input type="hidden" name="slug" value={def.slug} />
                      <button type="submit" className={primary}>
                        Продолжить ({s.inProgress.answered} из {total})
                      </button>
                    </form>
                  ) : (
                    <Link href={`/me/tests/${def.slug}`} className={last ? ghost : primary}>
                      {last ? "Пройти ещё раз" : "Начать"}
                    </Link>
                  )}
                </div>
              </div>
              {s?.completed.length ? (
                <ul className="mt-5 flex flex-wrap gap-2 border-t border-line pt-4">
                  {s.completed.map((c, i) => (
                    <li key={c.id}>
                      <Link
                        href={`/me/tests/report/${c.id}`}
                        className="rounded-full border border-line px-3 py-1 text-xs text-mist hover:text-snow"
                      >
                        {i === 0 ? "Последний результат" : "Результат"} · {c.completedAt ? fmt.format(c.completedAt) : ""}
                      </Link>
                    </li>
                  ))}
                </ul>
              ) : null}
            </li>
          );
        })}
      </ul>
    </>
  );
}
