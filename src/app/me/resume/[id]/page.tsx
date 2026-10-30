import Link from "next/link";
import { notFound } from "next/navigation";
import { z } from "zod";
import { requireEmployeeAccess } from "@/modules/billing/access";
import { getResumeForUser } from "@/modules/resume/service";
import { aiStatus } from "@/modules/ai/status";
import { ResumeEditor } from "@/components/resume/ResumeEditor";

export const metadata = { title: "Редактор резюме" };

export default async function ResumeEditorPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ v?: string }>;
}) {
  const user = await requireEmployeeAccess();
  const [{ id }, { v }] = await Promise.all([params, searchParams]);
  if (!z.uuid().safeParse(id).success) notFound();

  const [data, ai] = await Promise.all([getResumeForUser(user.id, id), aiStatus(user.id, "resume_rewrite")]);
  if (!data) notFound();
  const version = data.versions.find((x) => x.id === v) ?? data.versions[0];

  return (
    <>
      <Link href="/me/resume" className="text-sm text-mist hover:text-snow">
        ← Все резюме
      </Link>
      <h1 className="mb-8 mt-3 font-display text-3xl">{data.resume.title}</h1>
      <ResumeEditor
        key={version.id}
        resumeId={data.resume.id}
        versionId={version.id}
        initialLabel={version.label}
        initialContent={version.content}
        reviewNotes={version.reviewNotes}
        sourceText={version.sourceText}
        aiStatus={ai}
        versions={data.versions.map((x) => ({ id: x.id, label: x.label, needsReview: x.reviewNotes.length > 0 }))}
      />
    </>
  );
}
