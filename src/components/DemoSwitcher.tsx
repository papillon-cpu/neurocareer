import { getCurrentUser } from "@/modules/auth/dal";
import { DEMO_LABELS, demoEnabled } from "@/modules/demo/config";
import { switchDemoRoleAction } from "@/modules/demo/actions";

const ORDER = ["admin", "employer", "employee"] as const;

/** Переключатель «Админ / Работодатель / Сотрудник» рядом с кнопкой темы. Показывается только в демо-режиме. */
export async function DemoSwitcher() {
  if (!demoEnabled()) return null;
  const user = await getCurrentUser();
  return (
    <form action={switchDemoRoleAction} className="flex items-center gap-0.5 rounded-full border border-line p-0.5" aria-label="Демо-режим: смотреть сайт как">
      {ORDER.map((role) => (
        <button
          key={role}
          type="submit"
          name="role"
          value={role}
          title={`Демо-режим: открыть как «${DEMO_LABELS[role]}»`}
          aria-current={user?.role === role ? "true" : undefined}
          className="rounded-full px-2.5 py-1 text-[11px] text-mist transition-colors hover:text-snow aria-[current=true]:bg-neuron aria-[current=true]:font-semibold aria-[current=true]:text-ink"
        >
          {DEMO_LABELS[role]}
        </button>
      ))}
    </form>
  );
}
