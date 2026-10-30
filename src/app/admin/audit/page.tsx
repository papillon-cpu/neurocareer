import { desc, eq } from "drizzle-orm";
import { requireRole } from "@/modules/auth/dal";
import { getDb, schema } from "@/server/db";
import { PageTitle, Panel } from "@/components/app/Dashboard";

export const metadata = { title: "Журнал действий" };

const fmt = new Intl.DateTimeFormat("ru-RU", { dateStyle: "medium", timeStyle: "medium" });

const LABELS: Record<string, string> = {
  "user.registered": "Регистрация",
  "consent.granted": "Согласие дано",
  "consent.revoked": "Согласие отозвано",
  "profile.published": "Профиль опубликован",
  "profile.hidden": "Профиль скрыт",
  "profile.consent_revoked": "Отозвано согласие на публикацию",
  "account.deleted": "Аккаунт удалён",
  "pricing.updated": "Изменены тарифы",
  "payment.succeeded": "Платёж подтверждён",
  "payment.needs_review": "Платёж требует ручной проверки",
};

/** Журнал хранит только технические данные: тип события, кто совершил, когда. Содержимое профилей и резюме в него не попадает. */
export default async function AuditPage() {
  await requireRole("admin");
  const db = await getDb();
  const rows = await db
    .select({ id: schema.auditEvents.id, type: schema.auditEvents.type, at: schema.auditEvents.createdAt, meta: schema.auditEvents.meta, email: schema.users.email })
    .from(schema.auditEvents)
    .leftJoin(schema.users, eq(schema.users.id, schema.auditEvents.actorUserId))
    .orderBy(desc(schema.auditEvents.createdAt))
    .limit(100);

  return (
    <>
      <PageTitle title="Журнал действий" lead="Последние 100 событий. В журнале нет содержимого профилей, резюме и сообщений." />
      <Panel title="События">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[34rem] text-left text-sm">
            <thead className="text-xs text-mist">
              <tr>
                <th className="py-2 pr-4 font-normal">Когда</th>
                <th className="py-2 pr-4 font-normal">Событие</th>
                <th className="py-2 font-normal">Кто</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {rows.map((r) => (
                <tr key={r.id}>
                  <td className="py-3 pr-4 text-mist">{fmt.format(r.at)}</td>
                  <td className="py-3 pr-4">
                    {LABELS[r.type] ?? r.type}
                    {typeof r.meta?.purpose === "string" ? <span className="text-mist"> · {r.meta.purpose}</span> : null}
                  </td>
                  <td className="py-3 text-mist">{r.email ?? "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Panel>
    </>
  );
}
