"use client";

import { useActionState, useState, useTransition } from "react";
import { checkProviderAction, loadProviderModelsAction, saveAiSettingsAction } from "@/modules/ai/actions";
import { Field, FormMessage, Input, Select, SubmitButton } from "@/components/ui/Field";

type Provider = { id: string; label: string };

/** Подсказка, когда у провайдера нет ключа: где его взять. */
const NEEDS_KEY = "нужен ключ";

export function AiSettingsForm({
  providers,
  hints,
  initial,
}: {
  providers: Provider[];
  hints: Record<string, string>;
  initial: { provider: string; model: string };
}) {
  const [state, action, pending] = useActionState(saveAiSettingsAction, {});
  const [provider, setProvider] = useState(initial.provider);
  const [models, setModels] = useState<{ id: string; label: string }[]>([]);
  const [model, setModel] = useState(initial.model);
  const [loadingModels, startLoading] = useTransition();
  const [checking, startChecking] = useTransition();
  const [check, setCheck] = useState<{ ok: boolean; detail: string } | null>(null);
  const [modelsError, setModelsError] = useState<string | null>(null);

  const loadModels = (id: string) => {
    setModelsError(null);
    setModels([]);
    if (!id) return;
    startLoading(async () => {
      const res = await loadProviderModelsAction(id);
      if (res.ok) setModels(res.models);
      else setModelsError(res.error);
    });
  };

  const runCheck = (id: string) => {
    setCheck(null);
    startChecking(async () => {
      setCheck(await checkProviderAction(id));
    });
  };

  const chosen = providers.find((p) => p.id === provider);

  return (
    <div className="max-w-2xl space-y-6">
      <form action={action} className="space-y-5">
        <FormMessage error={state.error} ok={state.ok ? "Провайдер и модель сохранены. Новые запросы пойдут к ним." : undefined} />
        <Field label="Провайдер" hint={chosen ? hints[chosen.id] : "Кто отвечает на запросы AI."}>
          <Select
            name="provider"
            value={provider}
            onChange={(e) => {
              setProvider(e.target.value);
              setModel("");
              loadModels(e.target.value);
            }}
          >
            <option value="">— выберите провайдера —</option>
            {providers.map((p) => (
              <option key={p.id} value={p.id}>
                {p.label}
              </option>
            ))}
          </Select>
        </Field>

        <Field
          label="Модель"
          hint="Список моделей подгружается у провайдера по его ключу. Можно вписать название вручную."
          error={modelsError ?? undefined}
        >
          <Input
            name="model"
            value={model}
            onChange={(e) => setModel(e.target.value)}
            list="ai-models"
            placeholder={provider ? "например, GigaChat-3-Pro" : "сначала выберите провайдера"}
            disabled={!provider}
          />
        </Field>
        <datalist id="ai-models">
          {models.map((m) => (
            <option key={m.id} value={m.id}>
              {m.label}
            </option>
          ))}
        </datalist>

        <SubmitButton pending={pending}>Сохранить</SubmitButton>
      </form>

      {provider && (
        <div className="rounded-2xl border border-line bg-panel p-5">
          <p className="text-sm text-mist">
            Проверка связи: провайдер должен ответить по ключу из окружения сервера.
          </p>
          <button
            type="button"
            onClick={() => runCheck(provider)}
            disabled={checking}
            className="mt-3 rounded-full border border-line px-4 py-2 text-sm transition-colors hover:border-neuron disabled:opacity-60"
          >
            {checking ? "Проверяем…" : "Проверить подключение"}
          </button>
          {check && (
            <p role="status" className={`mt-3 text-sm ${check.ok ? "text-neuron" : "text-danger"}`}>
              {check.ok ? `Готово: ${check.detail}` : `Не готово: ${check.detail}`}
            </p>
          )}
        </div>
      )}
    </div>
  );
}

/** Список провайдеров с пометкой «нужен ключ» — используется в подсказках админки. */
export const needsKeyNote = NEEDS_KEY;
