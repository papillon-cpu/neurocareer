import Link from "next/link";
import { notFound } from "next/navigation";
import { z } from "zod";
import { requireEmployeeAccess } from "@/modules/billing/access";
import { getReport } from "@/modules/assessments/service";
import { aiStatus } from "@/modules/ai/status";
import { commentarySchema } from "@/modules/assessments/ai";
import { AiCommentary } from "@/components/tests/AiCommentary";
import { ReportView } from "@/components/tests/ReportView";

export const metadata = { title: "Результат теста" };

export default async function ReportPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await requireEmployeeAccess();
  const { id } = await params;
  if (!z.uuid().safeParse(id).success) notFound();
  const [data, ai] = await Promise.all([getReport(user.id, id), aiStatus(user.id, "report_commentary")]);
  if (!data) notFound();
  const saved = commentarySchema.safeParse(data.aiCommentary);

  return (
    <>
      <Link href="/me/tests" className="mb-6 inline-block text-sm text-mist hover:text-snow">
        ← Все тесты
      </Link>
      <ReportView report={data.report} completedAt={data.completedAt} />
      <div className="mt-6">
        <AiCommentary attemptId={id} status={ai} initial={saved.success ? saved.data : null} />
      </div>
    </>
  );
}
