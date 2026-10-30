"use client";

import { useRef, useState, useTransition } from "react";
import { completeAttemptAction, saveAnswerAction } from "@/modules/assessments/actions";
import type { ClientQuestion } from "@/modules/assessments/engine";
import type { Answers } from "@/modules/assessments/types";

const LIKERT = ["Совсем не про меня", "Скорее нет", "Затрудняюсь ответить", "Скорее да", "Это про меня"];

const nav =
  "rounded-full border border-line px-5 py-2.5 text-sm text-mist transition-colors hover:border-neuron hover:text-neuron disabled:cursor-not-allowed disabled:opacity-40";

export function Runner({
  attemptId,
  questions,
  initialAnswers,
  requiredIds,
}: {
  attemptId: string;
  questions: ClientQuestion[];
  initialAnswers: Answers;
  requiredIds: string[];
}) {
  const firstOpen = questions.findIndex((q) => q.type !== "open" && initialAnswers[q.id] === undefined);
  const [index, setIndex] = useState(firstOpen === -1 ? 0 : firstOpen);
  const [answers, setAnswers] = useState<Answers>(initialAnswers);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [finishing, startFinish] = useTransition();
  const savedOpen = useRef<Record<string, string>>(
    Object.fromEntries(Object.entries(initialAnswers).filter(([, v]) => typeof v === "string").map(([k, v]) => [k, String(v)])),
  );

  const q = questions[index];
  const answeredRequired = requiredIds.filter((id) => answers[id] !== undefined).length;
  const allDone = answeredRequired === requiredIds.length;

  async function save(id: string, value: string | number, previous: string | number | undefined) {
    setSaving(true);
    setError(null);
    const res = await saveAnswerAction(attemptId, id, value);
    setSaving(false);
    if (!res.ok) {
      setError(res.error);
      setAnswers((a) => {
        const next = { ...a };
        if (previous === undefined) delete next[id];
        else next[id] = previous;
        return next;
      });
    }
  }

  function choose(value: string | number) {
    const previous = answers[q.id];
    setAnswers((a) => ({ ...a, [q.id]: value }));
    void save(q.id, value, previous);
  }

  function saveOpenIfChanged() {
    if (q.type !== "open") return;
    const text = String(answers[q.id] ?? "");
    if (text.trim() && text !== savedOpen.current[q.id]) {
      savedOpen.current[q.id] = text;
      void save(q.id, text, undefined);
    }
  }

  function go(to: number) {
    saveOpenIfChanged();
    setIndex(Math.min(Math.max(to, 0), questions.length - 1));
  }

  function finish() {
    saveOpenIfChanged();
    setError(null);
    startFinish(async () => {
      const res = await completeAttemptAction(attemptId);
      if (res && !res.ok) setError(res.error);
    });
  }

  const current = answers[q.id];

  return (
    <div className="mx-auto max-w-3xl">
      <div className="mb-6">
        <div className="flex items-center justify-between text-xs text-mist">
          <span>
            Задание {index + 1} из {questions.length}
          </span>
          <span aria-live="polite">{saving ? "Сохраняем…" : "Ответы сохраняются автоматически"}</span>
        </div>
        <div
          role="progressbar"
          aria-valuemin={0}
          aria-valuemax={requiredIds.length}
          aria-valuenow={answeredRequired}
          aria-label="Отвечено заданий"
          className="mt-2 h-1.5 overflow-hidden rounded-full bg-line"
        >
          <div className="h-full rounded-full bg-neuron transition-all" style={{ width: `${(answeredRequired / requiredIds.length) * 100}%` }} />
        </div>
      </div>

      <section className="rounded-3xl border border-line bg-panel p-6 sm:p-8" aria-labelledby="question-title">
        {q.type === "likert" ? (
          <>
            <p className="mb-2 font-mono text-xs uppercase tracking-[0.15em] text-mist">Насколько это про вас?</p>
            <h2 id="question-title" className="text-xl font-semibold leading-snug">{q.statement}</h2>
            <div role="radiogroup" aria-labelledby="question-title" className="mt-6 grid gap-2 sm:grid-cols-5">
              {LIKERT.map((label, i) => (
                <button
                  key={label}
                  type="button"
                  role="radio"
                  aria-checked={current === i + 1}
                  onClick={() => choose(i + 1)}
                  className={`rounded-2xl border px-3 py-4 text-center text-xs transition-colors ${
                    current === i + 1 ? "border-neuron bg-neuron/10 text-neuron" : "border-line text-mist hover:border-mist hover:text-snow"
                  }`}
                >
                  <span className="mb-1 block font-display text-lg">{i + 1}</span>
                  {label}
                </button>
              ))}
            </div>
          </>
        ) : q.type === "open" ? (
          <>
            <p className="mb-2 font-mono text-xs uppercase tracking-[0.15em] text-mist">Свободный ответ · необязательно</p>
            <h2 id="question-title" className="text-xl font-semibold leading-snug">{q.prompt}</h2>
            <textarea
              aria-labelledby="question-title"
              value={String(current ?? "")}
              onChange={(e) => setAnswers((a) => ({ ...a, [q.id]: e.target.value }))}
              onBlur={saveOpenIfChanged}
              maxLength={3000}
              rows={8}
              className="mt-6 w-full resize-y rounded-2xl border border-line bg-graphite p-4 text-sm focus:border-neuron focus:outline-none"
              placeholder="Опишите своими словами. Ответ не оценивается автоматически: после теста вы сможете сверить его с рубрикой."
            />
            <p className="mt-2 text-xs text-mist">{String(current ?? "").length} / 3000</p>
          </>
        ) : (
          <>
            <h2 id="question-title" className="text-xl font-semibold leading-snug">{q.prompt}</h2>
            {q.type === "single" && q.table && (
              <div className="mt-5 overflow-x-auto">
                <table className="w-full min-w-[20rem] text-left text-sm">
                  <thead className="text-xs text-mist">
                    <tr>
                      {q.table.headers.map((h) => (
                        <th key={h} className="border-b border-line py-2 pr-4 font-normal">
                          {h}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {q.table.rows.map((row, i) => (
                      <tr key={i} className="border-b border-line/60">
                        {row.map((cell, j) => (
                          <td key={j} className="py-2 pr-4 tabular-nums">
                            {cell}
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
            <div role="radiogroup" aria-labelledby="question-title" className="mt-6 space-y-3">
              {q.options.map((o) => (
                <button
                  key={o.id}
                  type="button"
                  role="radio"
                  aria-checked={current === o.id}
                  onClick={() => choose(o.id)}
                  className={`block w-full rounded-2xl border p-4 text-left text-sm transition-colors ${
                    current === o.id ? "border-neuron bg-neuron/10" : "border-line hover:border-mist"
                  }`}
                >
                  {o.text}
                </button>
              ))}
            </div>
          </>
        )}
      </section>

      {error && (
        <p role="alert" className="mt-4 rounded-xl border border-danger/50 bg-danger/10 px-4 py-3 text-sm text-danger">
          {error}
        </p>
      )}

      <div className="mt-6 flex flex-wrap items-center justify-between gap-3">
        <button type="button" className={nav} onClick={() => go(index - 1)} disabled={index === 0}>
          ← Назад
        </button>
        {index < questions.length - 1 ? (
          <button type="button" className={nav} onClick={() => go(index + 1)}>
            {q.type !== "open" && current === undefined ? "Пропустить →" : "Далее →"}
          </button>
        ) : (
          <span className="text-xs text-mist">Это последнее задание</span>
        )}
      </div>

      <nav aria-label="Все задания" className="mt-8 flex flex-wrap gap-1.5">
        {questions.map((item, i) => (
          <button
            key={item.id}
            type="button"
            onClick={() => go(i)}
            aria-label={`Задание ${i + 1}${answers[item.id] !== undefined ? ", есть ответ" : ""}`}
            aria-current={i === index ? "step" : undefined}
            className={`size-8 rounded-full border text-xs ${
              i === index
                ? "border-neuron bg-neuron text-ink"
                : answers[item.id] !== undefined
                  ? "border-neuron/60 text-neuron"
                  : "border-line text-mist"
            }`}
          >
            {i + 1}
          </button>
        ))}
      </nav>

      <div className="mt-8 rounded-3xl border border-line p-5">
        <p className="text-sm">
          Отвечено {answeredRequired} из {requiredIds.length} обязательных заданий.
          {!allDone && " Завершить можно, когда будут отвечены все."}
        </p>
        <button
          type="button"
          onClick={finish}
          disabled={!allDone || finishing}
          className="mt-4 inline-flex rounded-full bg-neuron px-6 py-3 text-sm font-semibold text-ink transition-colors hover:bg-snow disabled:cursor-not-allowed disabled:opacity-40"
        >
          {finishing ? "Считаем результат…" : "Завершить и посмотреть результат"}
        </button>
      </div>
    </div>
  );
}
