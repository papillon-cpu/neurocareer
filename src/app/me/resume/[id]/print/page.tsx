import Link from "next/link";
import { notFound } from "next/navigation";
import { z } from "zod";
import { requireEmployeeAccess } from "@/modules/billing/access";
import { getResumeForUser } from "@/modules/resume/service";
import { PrintButton } from "@/components/resume/PrintButton";
import { ResumeView } from "@/components/resume/ResumeView";

export const metadata = { title: "Резюме для PDF" };

export default async function ResumePrintPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ v?: string }>;
}) {
  const user = await requireEmployeeAccess();
  const [{ id }, { v }] = await Promise.all([params, searchParams]);
  if (!z.uuid().safeParse(id).success) notFound();

  const data = await getResumeForUser(user.id, id);
  if (!data) notFound();
  const version = data.versions.find((x) => x.id === v) ?? data.versions[0];

  return (
    <div className="mx-auto max-w-3xl">
      <div className="no-print mb-6 space-y-3">
        <Link href={`/me/resume/${id}?v=${version.id}`} className="text-sm text-mist hover:text-snow">
          ← Вернуться к редактору
        </Link>
        {version.reviewNotes.length > 0 && (
          <p role="alert" className="rounded-xl border border-violet/60 bg-violet/10 px-4 py-3 text-sm">
            Эта версия ещё не проверена вами после импорта. Проверьте данные в редакторе, прежде чем отправлять
            резюме.
          </p>
        )}
        <div className="flex flex-wrap items-center gap-4">
          <PrintButton />
          <p className="text-xs text-mist">Откроется диалог печати: выберите «Сохранить как PDF».</p>
        </div>
      </div>
      <ResumeView content={version.content} />
    </div>
  );
}
