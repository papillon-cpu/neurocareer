import { requireEmployeeAccess } from "@/modules/billing/access";
import { PageTitle } from "@/components/app/Dashboard";
import { aiStatus } from "@/modules/ai/status";
import { AiStatusNote } from "@/components/ai/AiStatusNote";
import { ImportForm } from "@/components/resume/ImportForm";

export const metadata = { title: "Загрузка резюме" };

export default async function ImportPage() {
  const user = await requireEmployeeAccess();
  const ai = await aiStatus(user.id, "resume_parse");
  return (
    <>
      <PageTitle
        title="Загрузить старое резюме"
        lead="Мы извлечём текст и разложим его по полям. Сам файл не сохраняется, остаётся только извлечённый текст, чтобы ты мог сверить результат. Разбор по правилам приблизительный: всё нужно проверить."
      />
      <div className="mb-6 max-w-xl">
        <AiStatusNote status={ai} />
      </div>
      <ImportForm aiReady={ai === "ready"} />
    </>
  );
}
