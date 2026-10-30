import Link from "next/link";
import type { AiStatus } from "@/modules/ai/status";

/** Сообщает, почему AI недоступен, и что с этим делать. Для «ready» ничего не показывает. */
export function AiStatusNote({ status }: { status: AiStatus }) {
  if (status === "ready") return null;
  return (
    <p role="status" className="rounded-2xl border border-violet/60 bg-violet/10 px-4 py-3 text-sm">
      {status === "no_consent" ? (
        <>
          Чтобы пользоваться AI, нужно ваше отдельное согласие на передачу данных внешним AI-провайдерам.{" "}
          <Link href="/me/privacy" className="text-neuron underline-offset-4 hover:underline">
            Открыть настройки приватности →
          </Link>
        </>
      ) : (
        "AI пока не подключён: администратор ещё не добавил ключи провайдера. Остальные функции работают."
      )}
    </p>
  );
}
