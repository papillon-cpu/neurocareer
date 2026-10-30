"use client";

import { useState, useTransition } from "react";
import { explainReportAction } from "@/modules/assessments/actions";
import type { Commentary } from "@/modules/assessments/ai";
import type { AiStatus } from "@/modules/ai/status";
import { AiStatusNote } from "@/components/ai/AiStatusNote";
import { Panel } from "@/components/app/Dashboard";

const btn = "rounded-full border border-line px-5 py-2 text-sm text-mist transition-colors hover:border-neuron hover:text-neuron disabled:opacity-40";

export function AiCommentary({ attemptId, status, initial }: { attemptId: string; status: AiStatus; initial: Commentary | null }) {
  const [commentary, setCommentary] = useState<Commentary | null>(initial);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  function run(refresh: boolean) {
    setError(null);
    start(async () => {
      const res = await explainReportAction(attemptId, refresh);
      if (res.ok) setCommentary(res.commentary);
      else setError(res.error);
    });
  }

  return (
    <Panel title="AI-пояснение к результату">
      {commentary ? (
        <div className="space-y-4 text-sm">
          <p>{commentary.summary}</p>
          {commentary.strengths && <p><b>Что проявилось в ответах. </b><span className="text-mist">{commentary.strengths}</span></p>}
          {commentary.growth && <p><b>Над чем можно поработать. </b><span className="text-mist">{commentary.growth}</span></p>}
          <div>
            <p className="font-semibold">Следующие шаги</p>
            <ul className="mt-2 list-disc space-y-1 pl-5 text-mist">
              {commentary.nextSteps.map((s) => <li key={s}>{s}</li>)}
            </ul>
          </div>
          <p className="text-xs text-mist">
            Пояснение написано AI по расчётным показателям выше и может быть неточным. Это не оценка личности и не заключение о пригодности.
          </p>
          {status === "ready" && (
            <button type="button" className={btn} onClick={() => run(true)} disabled={pending}>
              {pending ? "AI думает…" : "Пояснить заново"}
            </button>
          )}
        </div>
      ) : (
        <div className="space-y-4">
          <p className="text-sm text-mist">
            AI простыми словами объяснит ваши показатели и предложит небольшие шаги. Ему передаются только расчётные показатели этого теста, без ваших имени, контактов и свободных ответов.
          </p>
          <AiStatusNote status={status} />
          {status === "ready" && (
            <button type="button" className={btn} onClick={() => run(false)} disabled={pending}>
              {pending ? "AI думает…" : "Пояснить результат с помощью AI"}
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
