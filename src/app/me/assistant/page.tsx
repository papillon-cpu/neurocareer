import Link from "next/link";
import { z } from "zod";
import { requireEmployeeAccess } from "@/modules/billing/access";
import { aiStatus } from "@/modules/ai/status";
import { deleteConversationAction, newConversationAction } from "@/modules/assistant/actions";
import { getConversation, listConversations } from "@/modules/assistant/service";
import { AiStatusNote } from "@/components/ai/AiStatusNote";
import { Chat } from "@/components/ai/Chat";
import { PageTitle } from "@/components/app/Dashboard";

export const metadata = { title: "Карьерный консультант" };

const btn = "rounded-full border border-line px-4 py-1.5 text-xs text-mist hover:border-neuron hover:text-neuron";

export default async function AssistantPage({ searchParams }: { searchParams: Promise<{ c?: string; error?: string }> }) {
  const user = await requireEmployeeAccess();
  const [{ c, error }, conversations, status] = await Promise.all([
    searchParams,
    listConversations(user.id),
    aiStatus(user.id, "assistant"),
  ]);

  const wanted = c && z.uuid().safeParse(c).success ? c : conversations[0]?.id;
  const current = wanted ? await getConversation(user.id, wanted) : null;

  return (
    <>
      <PageTitle
        title="Карьерный консультант"
        lead="AI помогает сформулировать цели, увидеть сильные стороны, составить план развития и подготовиться к собеседованию. Он видит только то, что вы написали в профиле и в диалоге."
      />
      <div className="mb-6">
        <AiStatusNote status={status} />
      </div>
      {error === "limit" && (
        <p role="alert" className="mb-6 rounded-xl border border-danger/50 bg-danger/10 px-4 py-3 text-sm text-danger">
          Достигнут лимит диалогов. Удалите ненужные.
        </p>
      )}

      <div className="grid gap-8 lg:grid-cols-[16rem_minmax(0,1fr)]">
        <aside className="space-y-3">
          <form action={newConversationAction}>
            <button type="submit" className="w-full rounded-full bg-neuron px-5 py-2.5 text-sm font-semibold text-ink hover:bg-snow">
              Новый диалог
            </button>
          </form>
          <ul className="space-y-1">
            {conversations.map((conv) => (
              <li key={conv.id}>
                <Link
                  href={`/me/assistant?c=${conv.id}`}
                  aria-current={conv.id === current?.conversation.id ? "page" : undefined}
                  className={`block truncate rounded-xl px-3 py-2 text-sm ${
                    conv.id === current?.conversation.id ? "bg-panel text-snow" : "text-mist hover:text-snow"
                  }`}
                >
                  {conv.title}
                </Link>
              </li>
            ))}
          </ul>
        </aside>

        <section>
          {current ? (
            <>
              <Chat
                key={current.conversation.id}
                conversationId={current.conversation.id}
                initial={current.messages.map((m) => ({ role: m.role, content: m.content }))}
                disabled={status !== "ready"}
              />
              <form action={deleteConversationAction} className="mt-6">
                <input type="hidden" name="id" value={current.conversation.id} />
                <button type="submit" className={btn}>
                  Удалить этот диалог
                </button>
              </form>
            </>
          ) : (
            <div className="rounded-3xl border border-line bg-panel p-8">
              <p className="text-sm text-mist">Диалогов пока нет. Нажмите «Новый диалог», чтобы начать.</p>
            </div>
          )}
        </section>
      </div>
    </>
  );
}
