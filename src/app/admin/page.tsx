import { count } from "drizzle-orm";
import { requireRole } from "@/modules/auth/dal";
import { setUserBlockedAction } from "@/modules/admin/actions";
import { listUsers } from "@/modules/admin/users";
import { getDb, schema } from "@/server/db";
import { PageTitle, Panel } from "@/components/app/Dashboard";

const roleLabel = { employee: "Сотрудник", employer: "Работодатель", admin: "Администратор" } as const;
const fmt = new Intl.DateTimeFormat("ru-RU", { dateStyle: "medium", timeStyle: "short" });
const MESSAGES: Record<string, { ok: boolean; text: string }> = {
  blocked: { ok: true, text: "Пользователь заблокирован: войти он не может, профиль скрыт из подбора, данные сохранены." },
  unblocked: { ok: true, text: "Пользователь разблокирован." },
  forbidden: { ok: false, text: "Администраторов, удалённые аккаунты и себя блокировать нельзя." },
  not_found: { ok: false, text: "Пользователь не найден." },
};

export default async function AdminHome({ searchParams }: { searchParams: Promise<{ m?: string; q?: string }> }) {
  const admin = await requireRole("admin");
  const { m, q } = await searchParams;
  const db = await getDb();
  const [totals, users] = await Promise.all([db.select({ role: schema.users.role, n: count() }).from(schema.users).groupBy(schema.users.role), listUsers(q ?? "")]);
  const byRole = Object.fromEntries(totals.map((t) => [t.role, t.n]));
  const msg = m ? MESSAGES[m] : undefined;

  return (
    <>
      <PageTitle title="Пользователи" lead="Поиск по email и блокировка. Блокировка закрывает вход и скрывает профиль из подбора, но ничего не удаляет." />
      {msg && (
        <p role={msg.ok ? "status" : "alert"} className={`mb-6 rounded-xl border px-4 py-3 text-sm ${msg.ok ? "border-neuron/50 bg-neuron/10 text-neuron" : "border-danger/50 bg-danger/10 text-danger"}`}>
          {msg.text}
        </p>
      )}
      <div className="mb-6 grid gap-4 sm:grid-cols-3">
        {(["employee", "employer", "admin"] as const).map((r) => (
          <Panel key={r} title={roleLabel[r]}>
            <p className="font-display text-4xl">{byRole[r] ?? 0}</p>
          </Panel>
        ))}
      </div>
      <Panel title={q ? `Найдено по «${q}»` : "Последние 50 регистраций"}>
        <form className="mb-4 flex gap-3" role="search">
          <input name="q" defaultValue={q ?? ""} placeholder="Часть email" aria-label="Поиск по email" className="w-full max-w-xs rounded-xl border border-line bg-graphite px-4 py-2 text-sm" />
          <button type="submit" className="rounded-full border border-line px-4 py-2 text-sm hover:border-neuron hover:text-neuron">
            Найти
          </button>
        </form>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[40rem] text-left text-sm">
            <thead className="text-xs text-mist">
              <tr>
                <th className="py-2 pr-4 font-normal">Email</th>
                <th className="py-2 pr-4 font-normal">Роль</th>
                <th className="py-2 pr-4 font-normal">Зарегистрирован</th>
                <th className="py-2 pr-4 font-normal">Статус</th>
                <th className="py-2 font-normal" />
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {users.map((u) => (
                <tr key={u.id}>
                  <td className="py-3 pr-4">{u.email}</td>
                  <td className="py-3 pr-4">{roleLabel[u.role]}</td>
                  <td className="py-3 pr-4 text-mist">{fmt.format(u.createdAt)}</td>
                  <td className="py-3 pr-4">{u.deletedAt ? "удалён" : u.blockedAt ? "заблокирован" : "активен"}</td>
                  <td className="py-3 text-right">
                    {u.role !== "admin" && !u.deletedAt && u.id !== admin.id && (
                      <form action={setUserBlockedAction}>
                        <input type="hidden" name="userId" value={u.id} />
                        <input type="hidden" name="block" value={u.blockedAt ? "no" : "yes"} />
                        <button type="submit" className="rounded-full border border-line px-3 py-1 text-xs text-mist hover:border-neuron hover:text-neuron">
                          {u.blockedAt ? "Разблокировать" : "Заблокировать"}
                        </button>
                      </form>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Panel>
    </>
  );
}
