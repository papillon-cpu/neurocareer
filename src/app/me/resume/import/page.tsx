import { requireRole } from "@/modules/auth/dal";
import { PageTitle } from "@/components/app/Dashboard";
import { ImportForm } from "@/components/resume/ImportForm";

export const metadata = { title: "Загрузка резюме" };

export default async function ImportPage() {
  await requireRole("employee");
  return (
    <>
      <PageTitle
        title="Загрузить старое резюме"
        lead="Мы извлечём текст и разложим его по полям. Сам файл не сохраняется, остаётся только извлечённый текст, чтобы ты мог сверить результат. Разбор по правилам приблизительный: всё нужно проверить."
      />
      <ImportForm />
    </>
  );
}
