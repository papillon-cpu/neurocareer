"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import { rewriteTextAction } from "@/modules/resume/actions";
import type { AiStatus } from "@/modules/ai/status";

const btn = "rounded-full border border-line px-4 py-1.5 text-xs text-mist transition-colors hover:border-neuron hover:text-neuron disabled:opacity-40";

/** Показывает «было / стало» и применяет только по явному нажатию. Сам ничего не меняет. */
export function AiRewrite({
  text,
  kind,
  status,
  onApply,
}: {
  text: string;
  kind: "experience" | "summary";
  status: AiStatus;
  onApply: (value: string) => void;
}) {
  const [pending, start] = useTransition();
  const [suggestion, setSuggestion] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  if (status === "unconfigured") return null;
  if (status === "no_consent") {
    return (
      <p className="text-xs text-mist">
        Улучшение с AI доступно после{" "}
        <Link href="/me/privacy" className="text-neuron underline-offset-4 hover:underline">
          согласия на внешний AI
        </Link>
        .
      </p>
    );
  }

  function run() {
    setError(null);
    setSuggestion(null);
    start(async () => {
      const res = await rewriteTextAction(text, kind);
      if (res.ok) setSuggestion(res.suggestion);
      else setError(res.error);
    });
  }

  return (
    <div className="space-y-2">
      <button type="button" className={btn} onClick={run} disabled={pending || text.trim().length < 15}>
        {pending ? "AI думает…" : "Улучшить формулировку с AI"}
      </button>
      {error && (
        <p role="alert" className="text-xs text-danger">
          {error}
        </p>
      )}
      {suggestion && (
        <div className="rounded-2xl border border-violet/60 bg-violet/10 p-4 text-sm">
          <p className="font-mono text-xs uppercase tracking-[0.15em] text-mist">Предложение AI</p>
          <p className="mt-2 whitespace-pre-line">{suggestion}</p>
          <p className="mt-2 text-xs text-mist">Проверьте, что всё в тексте соответствует действительности: AI мог изменить смысл.</p>
          <div className="mt-3 flex gap-2">
            <button
              type="button"
              className={btn}
              onClick={() => {
                onApply(suggestion);
                setSuggestion(null);
              }}
            >
              Применить
            </button>
            <button type="button" className={btn} onClick={() => setSuggestion(null)}>
              Отклонить
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
