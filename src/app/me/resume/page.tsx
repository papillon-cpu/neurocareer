import Link from "next/link";
import { requireEmployeeAccess } from "@/modules/billing/access";
import { createBlankResumeAction } from "@/modules/resume/actions";
import { listResumes, MAX_RESUMES } from "@/modules/resume/service";
import { PageTitle, Panel } from "@/components/app/Dashboard";

export const metadata = { title: "Резюме" };

const fmt = new Intl.DateTimeFormat("ru-RU", { dateStyle: "medium" });
const btn =
  "inline-flex rounded-full bg-neuron px-6 py-3 text-sm font-semibold text-ink hover:bg-snow";

export default async function ResumesPage({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  const user = await requireEmployeeAccess();
  const [resumes, { error }] = await Promise.all([listResumes(user.id), searchParams]);

  return (
    <>
      <PageTitle
        title="Моё резюме"
        lead="Создай резюме с нуля или загрузи старое: данные из файла извлекаются без выдумывания, а перед использованием ты проверяешь каждое поле."
      />
      {error === "limit" && (
        <p role="alert" className="mb-6 rounded-xl border border-danger/50 bg-danger/10 px-4 py-3 text-sm text-danger">
          Можно хранить не больше {MAX_RESUMES} резюме. Удалите ненужное.
        </p>
      )}
      <div className="mb-10 flex flex-wrap gap-3">
        <form action={createBlankResumeAction}>
          <button type="submit" className={btn}>
            Создать с нуля
          </button>
        </form>
        <Link href="/me/resume/import" className="inline-flex rounded-full border border-line px-6 py-3 text-sm hover:border-neuron hover:text-neuron">
          Загрузить PDF или DOCX
        </Link>
      </div>

      {resumes.length === 0 ? (
        <Panel title="Пока пусто">
          <p className="text-sm text-mist">
            У тебя нет резюме. Начни с пустого шаблона (имя и email подставятся из профиля) или загрузи файл.
          </p>
        </Panel>
      ) : (
        <ul className="grid gap-4 md:grid-cols-2">
          {resumes.map((r) => (
            <li key={r.id} className="rounded-3xl border border-line bg-panel p-6">
              <Link href={`/me/resume/${r.id}`} className="font-display text-lg hover:text-neuron">
                {r.title}
              </Link>
              <p className="mt-1 text-xs text-mist">Изменено {fmt.format(r.updatedAt)}</p>
              <ul className="mt-4 flex flex-wrap gap-2">
                {r.versions.map((v) => (
                  <li key={v.id}>
                    <Link
                      href={`/me/resume/${r.id}?v=${v.id}`}
                      className="rounded-full border border-line px-3 py-1 text-xs text-mist hover:text-snow"
                    >
                      {v.label}
                      {v.needsReview ? " · проверить" : ""}
                    </Link>
                  </li>
                ))}
              </ul>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}
