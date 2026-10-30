"use client";

import { useActionState } from "react";
import { importResumeAction } from "@/modules/resume/actions";
import { FormMessage, SubmitButton } from "@/components/ui/Field";

export function ImportForm({ aiReady }: { aiReady: boolean }) {
  const [state, action, pending] = useActionState(importResumeAction, {});
  return (
    <form action={action} className="max-w-xl space-y-5">
      <FormMessage error={state.error} />
      <label className="block">
        <span className="mb-2 block text-sm font-medium">Файл резюме (PDF или DOCX, до 5 МБ)</span>
        <input
          type="file"
          name="file"
          required
          accept=".pdf,.docx,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
          className="block w-full cursor-pointer rounded-xl border border-dashed border-line bg-graphite p-4 text-sm text-mist file:mr-4 file:rounded-full file:border-0 file:bg-neuron file:px-4 file:py-2 file:text-sm file:font-semibold file:text-ink"
        />
      </label>
      {aiReady && (
        <label className="flex gap-3 rounded-2xl border border-line p-4 text-sm">
          <input type="checkbox" name="useAi" defaultChecked className="mt-1 size-4 accent-neuron" />
          <span>
            <b>Разобрать с помощью AI.</b>{" "}
            <span className="text-mist">
              Текст резюме будет передан внешнему AI-провайдеру (вы дали на это согласие). Каждое значение сверяется с исходным текстом, а то, чего в нём нет, удаляется.
            </span>
          </span>
        </label>
      )}
      <SubmitButton pending={pending}>Загрузить и разобрать</SubmitButton>
    </form>
  );
}
