import Link from "next/link";
import type { CompetencyScore, Report } from "@/modules/assessments/types";
import { Panel } from "@/components/app/Dashboard";
import { Radar } from "./Radar";

function level(p: number): string {
  // Границы относятся к шкале самого теста и не означают сравнения с другими людьми.
  return p >= 70 ? "проявляется выраженно" : p >= 40 ? "проявляется" : "проявляется редко";
}

function Bars({ items, objective }: { items: CompetencyScore[]; objective: boolean }) {
  return (
    <ul className="space-y-4">
      {items.map((c) => (
        <li key={c.key}>
          <div className="flex flex-wrap items-baseline justify-between gap-2 text-sm">
            <span className="font-semibold">{c.title}</span>
            <span className="text-mist tabular-nums">
              {c.percent === null
                ? "нет данных"
                : objective
                  ? `верно ${c.points} из ${c.max}`
                  : `${c.percent}% · ${level(c.percent)}`}
            </span>
          </div>
          <div
            role="meter"
            aria-label={c.title}
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={c.percent ?? 0}
            className="mt-2 h-2 overflow-hidden rounded-full bg-line"
          >
            <div className="h-full rounded-full bg-neuron" style={{ width: `${c.percent ?? 0}%` }} />
          </div>
        </li>
      ))}
    </ul>
  );
}

export function ReportView({ report: r, completedAt }: { report: Report; completedAt: Date | null }) {
  const objective = r.kind === "objective";
  const fmt = new Intl.DateTimeFormat("ru-RU", { dateStyle: "long" });

  return (
    <div className="space-y-6">
      <div className="rounded-3xl border border-line bg-panel p-6 sm:p-8">
        <p className="font-mono text-xs uppercase tracking-[0.15em] text-neuron">
          Предварительная оценка{completedAt ? ` · ${fmt.format(completedAt)}` : ""}
        </p>
        <h1 className="mt-3 font-display text-3xl">{r.title}</h1>
        <div className="mt-6 flex flex-wrap items-end gap-x-8 gap-y-3">
          {objective && r.correctCount ? (
            <div>
              <p className="font-display text-5xl tabular-nums">
                {r.correctCount.right}
                <span className="text-2xl text-mist"> из {r.correctCount.total}</span>
              </p>
              <p className="mt-1 text-sm text-mist">верных ответов</p>
            </div>
          ) : (
            <div>
              <p className="font-display text-5xl tabular-nums">{r.overallPercent}%</p>
              <p className="mt-1 text-sm text-mist">среднее по направлениям в ответах на ситуации</p>
            </div>
          )}
        </div>
        <p className="mt-6 max-w-2xl text-sm text-mist">{r.limits}</p>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <Panel title="Профиль по направлениям">
          <Radar axes={r.competencies.map((c) => ({ label: c.title, value: c.percent ?? 0 }))} label={`Профиль по направлениям: ${r.title}`} />
        </Panel>
        <Panel title="Результаты по направлениям">
          <Bars items={r.competencies} objective={objective} />
          {!objective && (
            <p className="mt-5 text-xs text-mist">
              Проценты считаются от возможных баллов самого теста. Это не сравнение с другими людьми: нормативных данных у нас нет.
            </p>
          )}
        </Panel>
      </div>

      {r.flat ? (
        <Panel title="Сильные стороны и зоны для развития">
          <p className="text-sm text-mist">
            Результаты по направлениям очень близки, поэтому мы не выделяем «сильные» и «слабые» стороны: разница между ними могла бы оказаться случайной. Чтобы получить более детальную картину, пройдите тест ещё раз через некоторое время или пройдите другие тесты.
          </p>
        </Panel>
      ) : (
        <div className="grid gap-6 lg:grid-cols-2">
          <Panel title="Сильные стороны">
            <ul className="space-y-5">
              {r.strengths.map((s) => (
                <li key={s.key}>
                  <p className="font-semibold">
                    {s.title} <span className="text-sm font-normal text-mist">{objective ? "" : `· ${s.percent}%`}</span>
                  </p>
                  <p className="mt-1 text-sm text-mist">{s.what}</p>
                </li>
              ))}
            </ul>
          </Panel>
          <Panel title="Зоны для развития">
            <ul className="space-y-5">
              {r.growth.map((g) => (
                <li key={g.key}>
                  <p className="font-semibold">
                    {g.title} <span className="text-sm font-normal text-mist">{objective ? "" : `· ${g.percent}%`}</span>
                  </p>
                  <p className="mt-1 text-sm text-mist">{g.develop}</p>
                </li>
              ))}
            </ul>
          </Panel>
        </div>
      )}

      {r.growth.length > 0 && (
        <Panel title="Упражнения для развития">
          <div className="grid gap-6 md:grid-cols-2">
            {r.growth.map((g) => (
              <div key={g.key}>
                <p className="font-semibold">{g.title}</p>
                <ul className="mt-2 list-disc space-y-1.5 pl-5 text-sm text-mist">
                  {g.exercises?.map((e) => <li key={e}>{e}</li>)}
                </ul>
              </div>
            ))}
          </div>
        </Panel>
      )}

      {r.strengths.length > 0 && (
        <Panel title="Где эти качества часто востребованы">
          <ul className="space-y-3 text-sm">
            {r.strengths.map((s) => (
              <li key={s.key}>
                <span className="font-semibold">{s.title}:</span> <span className="text-mist">{s.careers?.join(", ")}</span>
              </li>
            ))}
          </ul>
          <p className="mt-4 text-xs text-mist">
            Это идеи для размышления, а не вывод о профессиональной пригодности: тест измеряет лишь часть того, что важно в работе.
          </p>
        </Panel>
      )}

      {r.selfAssessment.length > 0 && (
        <Panel title="Самооценка">
          <p className="mb-4 text-sm text-mist">
            Это то, как вы оцениваете себя. Она показана отдельно и не входит в результат выше: самооценка и поведение в ситуациях могут расходиться, и это нормально. Сравните два блока и подумайте, где они отличаются.
          </p>
          <Bars items={r.selfAssessment} objective={false} />
        </Panel>
      )}

      {r.review.length > 0 && (
        <Panel title="Разбор заданий">
          <ul className="space-y-5">
            {r.review.map((x, i) => (
              <li key={x.id} className="text-sm">
                <p className="font-semibold">
                  {i + 1}. {x.prompt} <span className={x.right ? "text-neuron" : "text-danger"}>{x.right ? "· верно" : "· неверно"}</span>
                </p>
                {!x.right && (
                  <p className="mt-1 text-mist">
                    Ваш ответ: {x.yourAnswer}. Верный: {x.correctAnswer}.
                  </p>
                )}
                <p className="mt-1 text-mist">{x.explain}</p>
              </li>
            ))}
          </ul>
        </Panel>
      )}

      {r.openAnswers.length > 0 && (
        <Panel title="Свободные ответы для самопроверки">
          {r.openAnswers.map((o) => (
            <div key={o.prompt} className="mb-6 last:mb-0">
              <p className="text-sm font-semibold">{o.prompt}</p>
              <p className="mt-2 whitespace-pre-line rounded-2xl bg-graphite p-4 text-sm">{o.answer}</p>
              <p className="mt-3 text-xs text-mist">Проверьте свой ответ по критериям (автоматическая оценка не выполняется):</p>
              <ul className="mt-1 list-disc space-y-1 pl-5 text-sm text-mist">
                {o.rubric.map((c) => <li key={c}>{c}</li>)}
              </ul>
            </div>
          ))}
        </Panel>
      )}

      <Panel title="Что дальше">
        <ul className="space-y-2 text-sm text-mist">
          <li>Работодатели не видят этот результат: передача возможна только с вашего отдельного согласия (появится на этапе приватности).</li>
          <li>
            <Link href="/me/tests" className="text-neuron underline-offset-4 hover:underline">Пройти другие тесты</Link>, чтобы увидеть профиль целиком.
          </li>
          <li>
            <Link href="/me/resume" className="text-neuron underline-offset-4 hover:underline">Добавить сильные стороны в резюме</Link>, но только те, которые подтверждены вашим опытом.
          </li>
        </ul>
      </Panel>
    </div>
  );
}
