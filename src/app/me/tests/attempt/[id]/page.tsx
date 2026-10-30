import { notFound, redirect } from "next/navigation";
import { z } from "zod";
import { requireEmployeeAccess } from "@/modules/billing/access";
import { getDefinition } from "@/modules/assessments/definitions";
import { clientQuestions, requiredIds } from "@/modules/assessments/engine";
import { getAttemptWithAnswers } from "@/modules/assessments/service";
import { Runner } from "@/components/tests/Runner";

export const metadata = { title: "Прохождение теста" };

export default async function AttemptPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await requireEmployeeAccess();
  const { id } = await params;
  if (!z.uuid().safeParse(id).success) notFound();

  const data = await getAttemptWithAnswers(user.id, id);
  if (!data) notFound();
  const { attempt, answers } = data;
  if (attempt.status === "completed") redirect(`/me/tests/report/${id}`);

  const def = getDefinition(attempt.slug, attempt.version);
  if (!def) notFound();

  return (
    <>
      <h1 className="mb-8 text-center font-display text-2xl">{def.title}</h1>
      <Runner
        attemptId={attempt.id}
        questions={clientQuestions(def, attempt.seed)}
        initialAnswers={answers}
        requiredIds={requiredIds(def)}
      />
    </>
  );
}
