"use client";

import Link from "next/link";
import { useActionState, useState } from "react";
import { loginAction, registerAction } from "@/modules/auth/actions";
import { consentTexts } from "@/modules/consent/texts";
import { Field, FormMessage, Input, SubmitButton } from "@/components/ui/Field";

export function LoginForm() {
  const [state, action, pending] = useActionState(loginAction, {});
  const fe = state.fieldErrors ?? {};
  return (
    <form action={action} className="space-y-5" noValidate>
      <FormMessage error={state.error} />
      <Field label="Email" error={fe.email?.[0]}>
        <Input name="email" type="email" autoComplete="email" required defaultValue={state.values?.email} error={fe.email?.[0]} />
      </Field>
      <Field label="Пароль" error={fe.password?.[0]}>
        <Input name="password" type="password" autoComplete="current-password" required error={fe.password?.[0]} />
      </Field>
      <SubmitButton pending={pending}>Войти</SubmitButton>
      <p className="text-sm text-mist">
        Нет аккаунта?{" "}
        <Link href="/register" className="text-neuron underline-offset-4 hover:underline">
          Зарегистрироваться
        </Link>
      </p>
    </form>
  );
}

const roles = [
  { value: "employee", title: "Я развиваю карьеру", text: "Тесты, резюме, карьерный консультант" },
  { value: "employer", title: "Я ищу сотрудников", text: "Вакансии и подбор кандидатов" },
] as const;

/** locked: роль выбрана на главной, тогда анкета только для неё, без второго выбора. */
export function RegisterForm({ initialRole, locked = false }: { initialRole: "employee" | "employer"; locked?: boolean }) {
  const [state, action, pending] = useActionState(registerAction, {});
  const [role, setRole] = useState(initialRole);
  const fe = state.fieldErrors ?? {};
  return (
    <form action={action} className="space-y-5" noValidate>
      <FormMessage error={state.error} />

      {locked && <input type="hidden" name="role" value={initialRole} />}
      {!locked && (
      <fieldset>
        <legend className="mb-2 text-sm font-medium">Кто вы</legend>
        <div className="grid gap-3 sm:grid-cols-2">
          {roles.map((r) => (
            <label
              key={r.value}
              className={`cursor-pointer rounded-2xl border p-4 transition-colors ${
                role === r.value ? "border-neuron bg-neuron/10" : "border-line hover:border-mist"
              }`}
            >
              <input
                type="radio"
                name="role"
                value={r.value}
                checked={role === r.value}
                onChange={() => setRole(r.value)}
                className="sr-only"
              />
              <span className="block text-sm font-semibold">{r.title}</span>
              <span className="mt-1 block text-xs text-mist">{r.text}</span>
            </label>
          ))}
        </div>
        {fe.role && <p role="alert" className="mt-1.5 text-xs text-danger">{fe.role[0]}</p>}
      </fieldset>
      )}

      <Field label="Имя" error={fe.fullName?.[0]}>
        <Input name="fullName" autoComplete="name" required defaultValue={state.values?.fullName} error={fe.fullName?.[0]} />
      </Field>
      <Field label="Email" error={fe.email?.[0]}>
        <Input name="email" type="email" autoComplete="email" required defaultValue={state.values?.email} error={fe.email?.[0]} />
      </Field>
      <Field label="Пароль" hint="Не короче 10 символов" error={fe.password?.[0]}>
        <Input name="password" type="password" autoComplete="new-password" required error={fe.password?.[0]} />
      </Field>

      <div className="space-y-3 rounded-2xl border border-line p-4 text-sm">
        <label className="flex gap-3">
          <input type="checkbox" name="acceptService" defaultChecked={state.values?.acceptService === "on"} className="mt-1 size-4 accent-neuron" />
          <span>
            <b>{consentTexts.service_processing.title}.</b>{" "}
            <span className="text-mist">{consentTexts.service_processing.text}</span>
          </span>
        </label>
        {fe.acceptService && <p role="alert" className="text-xs text-danger">{fe.acceptService[0]}</p>}
        <label className="flex gap-3">
          <input type="checkbox" name="acceptMarketing" defaultChecked={state.values?.acceptMarketing === "on"} className="mt-1 size-4 accent-neuron" />
          <span className="text-mist">{consentTexts.marketing.text} Необязательно.</span>
        </label>
        <p className="text-xs text-mist">
          Публикацию профиля и передачу данных работодателям ты настроишь отдельно, позже. Тексты согласий
          предварительные и будут проверены юристом.
        </p>
      </div>

      <SubmitButton pending={pending}>Создать аккаунт</SubmitButton>
      <p className="text-sm text-mist">
        Уже есть аккаунт?{" "}
        <Link href="/login" className="text-neuron underline-offset-4 hover:underline">
          Войти
        </Link>
      </p>
    </form>
  );
}
