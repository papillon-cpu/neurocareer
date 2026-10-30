"use client";

import { useActionState } from "react";
import { deleteAccountAction, publishProfileAction, saveSharingAction } from "@/modules/visibility/actions";
import { consentTexts } from "@/modules/consent/texts";
import { Field, FormMessage, Input, Select, SubmitButton } from "@/components/ui/Field";

type Version = { id: string; label: string; reviewed: boolean };

export function PublishForm({ versions, current }: { versions: Version[]; current: string | null }) {
  const [state, action, pending] = useActionState(publishProfileAction, {});
  const ready = versions.filter((v) => v.reviewed);
  return (
    <form action={action} className="space-y-4">
      <FormMessage error={state.error} ok={state.ok ? "Готово. Профиль опубликован." : undefined} />
      {versions.length === 0 ? (
        <p className="text-sm text-mist">Сначала создайте резюме: публиковать нечего.</p>
      ) : (
        <>
          <Field label="Какую версию резюме показывать работодателям" hint={ready.length < versions.length ? "Непроверенные версии не публикуются: сначала подтвердите проверку в редакторе." : undefined}>
            <Select key={state.values?.resumeVersionId ?? "initial"} name="resumeVersionId" defaultValue={state.values?.resumeVersionId ?? current ?? ready[0]?.id ?? ""}>
              {versions.map((v) => (
                <option key={v.id} value={v.id} disabled={!v.reviewed}>
                  {v.label}
                  {v.reviewed ? "" : " (не проверена)"}
                </option>
              ))}
            </Select>
          </Field>
          <label className="flex gap-3 rounded-2xl border border-line p-4 text-sm">
            <input type="checkbox" name="acceptPublication" className="mt-1 size-4 accent-neuron" />
            <span>
              <b>{consentTexts.profile_publication.title}.</b> <span className="text-mist">{consentTexts.profile_publication.text}</span>
            </span>
          </label>
          <SubmitButton pending={pending}>{current ? "Обновить публикацию" : "Опубликовать профиль"}</SubmitButton>
        </>
      )}
    </form>
  );
}

export function SharingForm({ shareEmail, sharePhone, consented }: { shareEmail: boolean; sharePhone: boolean; consented: boolean }) {
  const [state, action, pending] = useActionState(saveSharingAction, {});
  return (
    <form action={action} className="space-y-4">
      <FormMessage error={state.error} ok={state.ok ? "Сохранено." : undefined} />
      <fieldset className="space-y-2 text-sm">
        <legend className="mb-2 font-medium">Что увидит работодатель после того, как откроет ваш контакт</legend>
        <label className="flex items-center gap-3">
          <input type="checkbox" name="shareEmail" defaultChecked={state.values ? state.values.shareEmail === "on" : shareEmail} className="size-4 accent-neuron" /> Email из резюме
        </label>
        <label className="flex items-center gap-3">
          <input type="checkbox" name="sharePhone" defaultChecked={state.values ? state.values.sharePhone === "on" : sharePhone} className="size-4 accent-neuron" /> Телефон из резюме
        </label>
        <p className="text-xs text-mist">Имя тоже передаётся только после открытия контакта и только при вашем согласии ниже.</p>
      </fieldset>
      {!consented && (
        <label className="flex gap-3 rounded-2xl border border-line p-4 text-sm">
          <input type="checkbox" name="acceptSharing" className="mt-1 size-4 accent-neuron" />
          <span>
            <b>{consentTexts.employer_data_sharing.title}.</b> <span className="text-mist">{consentTexts.employer_data_sharing.text}</span>
          </span>
        </label>
      )}
      <SubmitButton pending={pending}>Сохранить</SubmitButton>
    </form>
  );
}

export function DeleteAccountForm() {
  const [state, action, pending] = useActionState(deleteAccountAction, {});
  return (
    <form action={action} className="max-w-md space-y-4">
      <FormMessage error={state.error} />
      <p className="text-sm text-mist">
        Профиль, резюме, результаты тестов и диалоги с AI будут удалены безвозвратно. Платёжные записи сохраняются по правилам финансового учёта, но без ваших персональных данных. Вход после удаления невозможен.
      </p>
      <Field label="Пароль">
        <Input name="password" type="password" autoComplete="current-password" required />
      </Field>
      <Field label="Для подтверждения введите слово УДАЛИТЬ">
        <Input name="confirm" autoComplete="off" required />
      </Field>
      <button
        type="submit"
        disabled={pending}
        className="rounded-full bg-danger px-6 py-3 text-sm font-semibold text-ink hover:opacity-90 disabled:cursor-wait disabled:opacity-60"
      >
        {pending ? "Удаляем…" : "Удалить аккаунт и данные"}
      </button>
    </form>
  );
}
