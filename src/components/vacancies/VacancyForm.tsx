"use client";

import { useActionState } from "react";
import { saveVacancyAction } from "@/modules/vacancies/actions";
import { Field, FormMessage, Input, Select, SubmitButton, Textarea } from "@/components/ui/Field";

export type VacancyInitial = {
  id?: string;
  title: string;
  tasks: string;
  mustSkills: string;
  niceSkills: string;
  minExperienceYears: string;
  level: string;
  workFormat: string;
  city: string;
  salaryFrom: string;
  salaryTo: string;
  extra: string;
};

export function VacancyForm({ initial }: { initial: VacancyInitial }) {
  const [state, action, pending] = useActionState(saveVacancyAction, {});
  const fe = state.fieldErrors ?? {};
  const val = (k: keyof VacancyInitial) => state.values?.[k] ?? initial[k] ?? "";
  return (
    <form action={action} className="max-w-3xl space-y-5" noValidate>
      <FormMessage error={state.error} />
      {initial.id && <input type="hidden" name="id" value={initial.id} />}
      <Field label="Название вакансии" error={fe.title?.[0]}>
        <Input name="title" defaultValue={val("title")} required error={fe.title?.[0]} />
      </Field>
      <Field label="Задачи" hint="Чем человек будет заниматься. Не указывайте требований к полу, возрасту и другим личным признакам." error={fe.tasks?.[0]}>
        <Textarea name="tasks" defaultValue={val("tasks")} error={fe.tasks?.[0]} />
      </Field>
      <div className="grid gap-5 md:grid-cols-2">
        <Field label="Обязательные навыки" hint="Через запятую или с новой строки. По ним подбор отбирает кандидатов." error={fe.mustSkills?.[0]}>
          <Textarea name="mustSkills" defaultValue={val("mustSkills")} error={fe.mustSkills?.[0]} />
        </Field>
        <Field label="Желательные навыки" hint="Повышают оценку, но не обязательны." error={fe.niceSkills?.[0]}>
          <Textarea name="niceSkills" defaultValue={val("niceSkills")} error={fe.niceSkills?.[0]} />
        </Field>
      </div>
      <div className="grid gap-5 sm:grid-cols-3">
        <Field label="Опыт от, лет" error={fe.minExperienceYears?.[0]}>
          <Input name="minExperienceYears" type="number" min={0} max={30} defaultValue={val("minExperienceYears")} error={fe.minExperienceYears?.[0]} />
        </Field>
        <Field label="Уровень">
          <Select key={`l-${val("level")}`} name="level" defaultValue={val("level")}>
            <option value="">Не указан</option>
            <option value="intern">Стажёр</option>
            <option value="junior">Junior</option>
            <option value="middle">Middle</option>
            <option value="senior">Senior</option>
            <option value="lead">Lead</option>
          </Select>
        </Field>
        <Field label="Формат работы">
          <Select key={`f-${val("workFormat")}`} name="workFormat" defaultValue={val("workFormat")}>
            <option value="">Не указан</option>
            <option value="office">Офис</option>
            <option value="hybrid">Гибрид</option>
            <option value="remote">Удалённо</option>
          </Select>
        </Field>
      </div>
      <div className="grid gap-5 sm:grid-cols-3">
        <Field label="Город" error={fe.city?.[0]}>
          <Input name="city" defaultValue={val("city")} error={fe.city?.[0]} />
        </Field>
        <Field label="Вилка от, ₽/мес" error={fe.salaryFrom?.[0]}>
          <Input name="salaryFrom" type="number" min={0} defaultValue={val("salaryFrom")} error={fe.salaryFrom?.[0]} />
        </Field>
        <Field label="Вилка до, ₽/мес" error={fe.salaryTo?.[0]}>
          <Input name="salaryTo" type="number" min={0} defaultValue={val("salaryTo")} error={fe.salaryTo?.[0]} />
        </Field>
      </div>
      <Field label="Прочее" hint="Условия, процесс отбора, команда." error={fe.extra?.[0]}>
        <Textarea name="extra" defaultValue={val("extra")} error={fe.extra?.[0]} />
      </Field>
      <SubmitButton pending={pending}>Сохранить</SubmitButton>
    </form>
  );
}
