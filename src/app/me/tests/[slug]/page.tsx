import Link from "next/link";
import { notFound } from "next/navigation";
import { requireEmployeeAccess } from "@/modules/billing/access";
import { startAttemptAction } from "@/modules/assessments/actions";
import { getDefinition } from "@/modules/assessments/definitions";
import { getStatuses } from "@/modules/assessments/service";

export default async function TestIntroPage({ params }: { params: Promise<{ slug: string }> }) {
  const user = await requireEmployeeAccess();
  const { slug } = await params;
  const def = getDefinition(slug);
  if (!def) notFound();
  const status = (await getStatuses(user.id))[slug];

  return (
    <div className="max-w-2xl">
      <Link href="/me/tests" className="text-sm text-mist hover:text-snow">
        ← Все тесты
      </Link>
      <h1 className="mb-3 mt-3 font-display text-3xl">{def.title}</h1>
      <p className="font-mono text-xs text-mist">
        ~{def.minutes} минут · {def.questions.length} заданий · без ограничения времени
      </p>
      <p className="mt-6 text-mist">{def.intro}</p>

      <section className="mt-8 rounded-3xl border border-line p-6" aria-labelledby="limits">
        <h2 id="limits" className="font-mono text-xs uppercase tracking-[0.15em] text-mist">
          Что важно знать
        </h2>
        <p className="mt-3 text-sm text-mist">{def.limits}</p>
        <p className="mt-3 text-sm text-mist">
          Ответы сохраняются автоматически, тест можно прервать и продолжить. Результат видите только вы.
        </p>
      </section>

      <form action={startAttemptAction} className="mt-8">
        <input type="hidden" name="slug" value={def.slug} />
        <button type="submit" className="rounded-full bg-neuron px-7 py-3.5 text-sm font-semibold text-ink hover:bg-snow">
          {status?.inProgress ? "Продолжить тест" : "Начать тест"}
        </button>
      </form>
    </div>
  );
}
