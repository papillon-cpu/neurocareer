"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { sendMessageAction } from "@/modules/assistant/actions";

type Msg = { role: "user" | "assistant"; content: string };

const SUGGESTIONS = [
  "Помоги сформулировать мои карьерные цели",
  "Какие у меня сильные стороны, судя по профилю?",
  "Составь план развития навыков на 3 месяца",
  "Как подготовиться к собеседованию?",
];

export function Chat({ conversationId, initial, disabled }: { conversationId: string; initial: Msg[]; disabled: boolean }) {
  const [messages, setMessages] = useState<Msg[]>(initial);
  const [text, setText] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const end = useRef<HTMLDivElement>(null);

  useEffect(() => {
    end.current?.scrollIntoView({ block: "end" });
  }, [messages, pending]);

  function send(value: string) {
    const content = value.trim();
    if (!content || pending || disabled) return;
    setError(null);
    start(async () => {
      const res = await sendMessageAction(conversationId, content);
      if (res.ok) {
        setMessages((m) => [...m, { role: "user", content }, { role: "assistant", content: res.reply }]);
        setText("");
      } else {
        setError(res.error); // текст остаётся в поле: ничего не потеряно
      }
    });
  }

  return (
    <div className="flex flex-col">
      <div className="min-h-64 space-y-4 rounded-3xl border border-line bg-panel p-5" aria-live="polite">
        {messages.length === 0 && (
          <div>
            <p className="text-sm text-mist">С чего начнём? Можно выбрать готовый вопрос или написать свой.</p>
            <div className="mt-4 flex flex-wrap gap-2">
              {SUGGESTIONS.map((s) => (
                <button
                  key={s}
                  type="button"
                  disabled={disabled || pending}
                  onClick={() => send(s)}
                  className="rounded-full border border-line px-4 py-2 text-xs text-mist hover:border-neuron hover:text-neuron disabled:opacity-40"
                >
                  {s}
                </button>
              ))}
            </div>
          </div>
        )}
        {messages.map((m, i) => (
          <div key={i} className={m.role === "user" ? "flex justify-end" : "flex justify-start"}>
            <div
              className={`max-w-[85%] whitespace-pre-wrap rounded-2xl px-4 py-3 text-sm leading-relaxed ${
                m.role === "user" ? "bg-neuron/15 text-snow" : "bg-graphite text-snow"
              }`}
            >
              {m.content}
            </div>
          </div>
        ))}
        {pending && <p className="text-xs text-mist">Консультант думает…</p>}
        <div ref={end} />
      </div>

      {error && (
        <p role="alert" className="mt-3 rounded-xl border border-danger/50 bg-danger/10 px-4 py-3 text-sm text-danger">
          {error}
        </p>
      )}

      <form
        className="mt-4 flex gap-3"
        onSubmit={(e) => {
          e.preventDefault();
          send(text);
        }}
      >
        <label className="sr-only" htmlFor="chat-input">
          Сообщение консультанту
        </label>
        <textarea
          id="chat-input"
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              send(text);
            }
          }}
          rows={2}
          maxLength={4000}
          disabled={disabled}
          placeholder={disabled ? "AI сейчас недоступен" : "Напишите сообщение. Enter — отправить, Shift+Enter — новая строка"}
          className="min-w-0 flex-1 resize-none rounded-2xl border border-line bg-graphite px-4 py-3 text-sm focus:border-neuron focus:outline-none disabled:opacity-50"
        />
        <button
          type="submit"
          disabled={disabled || pending || !text.trim()}
          className="self-end rounded-full bg-neuron px-6 py-3 text-sm font-semibold text-ink hover:bg-snow disabled:cursor-not-allowed disabled:opacity-40"
        >
          Отправить
        </button>
      </form>
      <p className="mt-3 text-xs text-mist">
        Консультант — AI: он может ошибаться и не заменяет решение человека. Он не ставит диагнозов и не оценивает личность.
      </p>
    </div>
  );
}
