"use client";

import { useActionState } from "react";
import { savePricingAction } from "@/modules/billing/actions";
import { Field, FormMessage, Input, SubmitButton } from "@/components/ui/Field";

type Values = { employeeAccess: number; subscription: number; subscriptionDays: number; includedContacts: number; extraContact: number };

export function PricingForm({ initial }: { initial: Values }) {
  const [state, action, pending] = useActionState(savePricingAction, {});
  return (
    <form action={action} className="max-w-xl space-y-5">
      <FormMessage error={state.error} ok={state.ok ? "Тарифы сохранены. Они применяются к новым платежам." : undefined} />
      <Field label="Доступ сотрудника, ₽" hint="Разовая оплата. 0 — бесплатно.">
        <Input name="employeeAccess" type="number" min={0} step="1" defaultValue={initial.employeeAccess} required />
      </Field>
      <Field label="Подписка работодателя, ₽">
        <Input name="subscription" type="number" min={0} step="1" defaultValue={initial.subscription} required />
      </Field>
      <div className="grid gap-5 sm:grid-cols-2">
        <Field label="Срок подписки, дней">
          <Input name="subscriptionDays" type="number" min={1} max={366} step="1" defaultValue={initial.subscriptionDays} required />
        </Field>
        <Field label="Включённых контактов за период">
          <Input name="includedContacts" type="number" min={0} step="1" defaultValue={initial.includedContacts} required />
        </Field>
      </div>
      <Field label="Дополнительный контакт, ₽">
        <Input name="extraContact" type="number" min={0} step="1" defaultValue={initial.extraContact} required />
      </Field>
      <SubmitButton pending={pending}>Сохранить</SubmitButton>
    </form>
  );
}
