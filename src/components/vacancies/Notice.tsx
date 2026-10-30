import { NOTICES } from "@/modules/vacancies/notices";

/** Результат действия по коду из адреса. Неизвестный код ничего не показывает. */
export function Notice({ code }: { code?: string }) {
  const n = code ? NOTICES[code] : undefined;
  if (!n) return null;
  return (
    <p
      role={n.ok ? "status" : "alert"}
      className={`mb-6 rounded-xl border px-4 py-3 text-sm ${n.ok ? "border-neuron/50 bg-neuron/10 text-neuron" : "border-danger/50 bg-danger/10 text-danger"}`}
    >
      {n.text}
    </p>
  );
}
