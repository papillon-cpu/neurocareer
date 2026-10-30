import { count, desc } from "drizzle-orm";
import { requireRole } from "@/modules/auth/dal";
import { getDb, schema } from "@/server/db";
import { PageTitle, Panel } from "@/components/app/Dashboard";

const roleLabel = { employee: "Сотрудник", employer: "Работодатель", admin: "Администратор" } as const;
const fmt = new Intl.DateTimeFormat("ru-RU", { dateStyle: "medium", timeStyle: "short" });

export default async function AdminHome() {
  await requireRole("admin");
  const db = await getDb();
  const [totals, latest] = await Promise.all([
    db.select({ role: schema.users.role, n: count() }).from(schema.users).groupBy(schema.users.role),
    db
      .select({ id: schema.users.id, email: schema.users.email, role: schema.users.role, createdAt: schema.users.createdAt })
      .from(schema.users)
      .orderBy(desc(schema.users.createdAt))
      .limit(50),
  ]);
  const byRole = Object.fromEntries(totals.map((t) => [t.role, t.n]));

  return (
    <>
      <PageTitle title="Пользователи" lead="Только чтение. Действия администратора (блокировки, модерация, тарифы) появятся на этапе администрирования." />
      <div className="mb-6 grid gap-4 sm:grid-cols-3">
        {(["employee", "employer", "admin"] as const).map((r) => (
          <Panel key={r} title={roleLabel[r]}>
            <p className="font-display text-4xl">{byRole[r] ?? 0}</p>
          </Panel>
        ))}
      </div>
      <Panel title="Последние 50 регистраций">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[32rem] text-left text-sm">
            <thead className="text-xs text-mist">
              <tr>
                <th className="py-2 pr-4 font-normal">Email</th>
                <th className="py-2 pr-4 font-normal">Роль</th>
                <th className="py-2 font-normal">Зарегистрирован</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {latest.map((u) => (
                <tr key={u.id}>
                  <td className="py-3 pr-4">{u.email}</td>
                  <td className="py-3 pr-4">{roleLabel[u.role]}</td>
                  <td className="py-3 text-mist">{fmt.format(u.createdAt)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Panel>
    </>
  );
}
