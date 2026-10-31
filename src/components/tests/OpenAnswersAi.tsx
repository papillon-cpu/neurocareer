"use client";

import { useState, useTransition } from "react";
import { reviewOpenAnswersAction } from "@/modules/assessments/actions";
import type { OpenFeedback } from "@/modules/assessments/ai";
import type { AiStatus } from "@/modules/ai/status";
import { AiStatusNote } from "@/components/ai/AiStatusNote";
import { Panel } from "@/components/app/Dashboard";

const btn = "rounded-full border border-line px-5 py-2 text-sm text-mist transition-colors hover:border-neuron hover:text-neuron disabled:opacity-40";

export function OpenAnswersAi({ attemptId, status }: { attemptId: string; status: AiStatus }) {
  const [feedback, setFeedback] = useState<OpenFeedback | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  function run() {
    setError(null);
    start(async () => {
      const res = await reviewOpenAnswersAction(attemptId);
      if (res.ok) setFeedback(res.feedback);
      else setError(res.error);
    });
  }

  return (
    <Panel title="AI-разбор свободных ответов">
      {feedback ? (
        <div className="space-y-6 text-sm">
          {feedback.map((f) => (
            <div key={f.prompt}>
              <p className="font-semibold">{f.prompt}</p>
              {f.covered.length > 0 && (
                <ul className="mt-2 space-y-1">
                  {f.covered.map((c) => (
                    <li key={c}>
                      <span aria-hidden="true">✓ </span>
                      {c}
                    </li>
                  ))}
                </ul>
              )}
              {f.missing.length > 0 && (
                <ul className="mt-2 space-y-1 text-mist">
                  {f.missing.map((c) => (
                    <li key={c}>
                      <span aria-hidden="true">○ </span>
                      {c}
                    </li>
                  ))}
                </ul>
              )}
              {f.tip && <p className="mt-2 text-mist">{f.tip}</p>}
            </div>
          ))}
          <p className="text-xs text-mist">
            Это подсказка AI для самопроверки, а не оценка: баллы и результат теста от неё не меняются, разбор нигде не сохраняется. AI может ошибаться, ориентируйтесь на критерии выше.
          </p>
          <button type="button" className={btn} onClick={run} disabled={pending}>
            {pending ? "AI думает…" : "Разобрать заново"}
          </button>
        </div>
      ) : (
        <div className="space-y-4">
          <p className="text-sm text-mist">
            AI отметит, какие критерии видны в ваших свободных ответах, а каких не хватает. Для этого ему передаются сами ответы (без имени и контактов) и критерии. На результат теста это не влияет.
          </p>
          <AiStatusNote status={status} />
          {status === "ready" && (
            <button type="button" className={btn} onClick={run} disabled={pending}>
              {pending ? "AI думает…" : "Разобрать ответы с помощью AI"}
            </button>
          )}
        </div>
      )}
      {error && (
        <p role="alert" className="mt-4 rounded-xl border border-danger/50 bg-danger/10 px-4 py-3 text-sm text-danger">
          {error}
        </p>
      )}
    </Panel>
  );
}
