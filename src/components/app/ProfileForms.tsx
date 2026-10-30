"use client";

import { useActionState } from "react";
import { saveCompanyAction, updateEmployeeProfileAction } from "@/modules/profile/actions";
import { Field, FormMessage, Input, Select, SubmitButton, Textarea } from "@/components/ui/Field";

type Employee = {
  fullName: string;
  headline: string;
  city: string;
  desiredRole: string;
  workFormat: string | null;
  about: string;
};

export function EmployeeProfileForm({ initial }: { initial: Employee }) {
  const [state, action, pending] = useActionState(updateEmployeeProfileAction, {});
  const fe = state.fieldErrors ?? {};
  return (
    <form action={action} className="max-w-2xl space-y-5" noValidate>
      <FormMessage error={state.error} ok={state.ok ? "Профиль сохранён." : undefined} />
      <Field label="Имя" error={fe.fullName?.[0]}>
        <Input name="fullName" defaultValue={state.values?.fullName ?? initial.fullName} required error={fe.fullName?.[0]} />
      </Field>
      <Field label="Специализация" hint="Например: QA-инженер, продуктовый дизайнер" error={fe.headline?.[0]}>
        <Input name="headline" defaultValue={state.values?.headline ?? initial.headline} error={fe.headline?.[0]} />
      </Field>
      <div className="grid gap-5 sm:grid-cols-2">
        <Field label="Город" error={fe.city?.[0]}>
          <Input name="city" defaultValue={state.values?.city ?? initial.city} error={fe.city?.[0]} />
        </Field>
        <Field label="Формат работы" error={fe.workFormat?.[0]}>
          <Select key={state.values?.workFormat ?? "initial"} name="workFormat" defaultValue={state.values?.workFormat ?? initial.workFormat ?? ""}>
            <option value="">Не указан</option>
            <option value="office">Офис</option>
            <option value="hybrid">Гибрид</option>
            <option value="remote">Удалённо</option>
          </Select>
        </Field>
      </div>
      <Field label="Желаемая должность" error={fe.desiredRole?.[0]}>
        <Input name="desiredRole" defaultValue={state.values?.desiredRole ?? initial.desiredRole} error={fe.desiredRole?.[0]} />
      </Field>
      <Field label="О себе" hint="Опыт, сильные стороны, чем хочешь заниматься" error={fe.about?.[0]}>
        <Textarea name="about" defaultValue={state.values?.about ?? initial.about} error={fe.about?.[0]} />
      </Field>
      <SubmitButton pending={pending}>Сохранить</SubmitButton>
    </form>
  );
}

type CompanyInitial = {
  fullName: string;
  position: string;
  name: string;
  industry: string;
  size: string;
  site: string;
  description: string;
};

export function CompanyForm({ initial }: { initial: CompanyInitial }) {
  const [state, action, pending] = useActionState(saveCompanyAction, {});
  const fe = state.fieldErrors ?? {};
  return (
    <form action={action} className="max-w-2xl space-y-5" noValidate>
      <FormMessage error={state.error} ok={state.ok ? "Данные сохранены." : undefined} />
      <div className="grid gap-5 sm:grid-cols-2">
        <Field label="Ваше имя" error={fe.fullName?.[0]}>
          <Input name="fullName" defaultValue={state.values?.fullName ?? initial.fullName} required error={fe.fullName?.[0]} />
        </Field>
        <Field label="Ваша должность" error={fe.position?.[0]}>
          <Input name="position" defaultValue={state.values?.position ?? initial.position} error={fe.position?.[0]} />
        </Field>
      </div>
      <Field label="Название компании" error={fe.name?.[0]}>
        <Input name="name" defaultValue={state.values?.name ?? initial.name} required error={fe.name?.[0]} />
      </Field>
      <div className="grid gap-5 sm:grid-cols-2">
        <Field label="Отрасль" error={fe.industry?.[0]}>
          <Input name="industry" defaultValue={state.values?.industry ?? initial.industry} error={fe.industry?.[0]} />
        </Field>
        <Field label="Размер компании" error={fe.size?.[0]}>
          <Select key={state.values?.size ?? "initial"} name="size" defaultValue={state.values?.size ?? initial.size}>
            <option value="">Не указан</option>
            <option value="1-10">1–10 человек</option>
            <option value="11-50">11–50</option>
            <option value="51-200">51–200</option>
            <option value="201-1000">201–1000</option>
            <option value="1000+">Больше 1000</option>
          </Select>
        </Field>
      </div>
      <Field label="Сайт" hint="https://example.com" error={fe.site?.[0]}>
        <Input name="site" defaultValue={state.values?.site ?? initial.site} error={fe.site?.[0]} />
      </Field>
      <Field label="Описание компании" error={fe.description?.[0]}>
        <Textarea name="description" defaultValue={state.values?.description ?? initial.description} error={fe.description?.[0]} />
      </Field>
      <SubmitButton pending={pending}>Сохранить</SubmitButton>
    </form>
  );
}
