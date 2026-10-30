import Link from "next/link";
import { notFound } from "next/navigation";
import { z } from "zod";
import { requireRole } from "@/modules/auth/dal";
import { getReport } from "@/modules/assessments/service";
import { ReportView } from "@/components/tests/ReportView";

export const metadata = { title: "Результат теста" };

export default async function ReportPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await requireRole("employee");
  const { id } = await params;
  if (!z.uuid().safeParse(id).success) notFound();
  const data = await getReport(user.id, id);
  if (!data) notFound();

  return (
    <>
      <Link href="/me/tests" className="mb-6 inline-block text-sm text-mist hover:text-snow">
        ← Все тесты
      </Link>
      <ReportView report={data.report} completedAt={data.completedAt} />
    </>
  );
}
