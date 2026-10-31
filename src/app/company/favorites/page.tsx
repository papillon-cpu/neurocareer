import Link from "next/link";
import { requireRole } from "@/modules/auth/dal";
import { listFavorites, listOpenedContacts, type FavoriteItem } from "@/modules/vacancies/favorites";
import { removeFavoriteAction } from "@/modules/vacancies/actions";
import { PageTitle, Panel } from "@/components/app/Dashboard";

export const metadata = { title: "Избранное" };

const fmt = new Intl.DateTimeFormat("ru-RU", { dateStyle: "medium" });

function Who({ item }: { item: FavoriteItem }) {
  if (!item.card) return <span className="text-mist">Профиль больше не опубликован</span>;
  return (
    <Link href={`/company/vacancies/${item.vacancyId}/candidates/${item.candidateId}`} className="font-semibold hover:text-neuron">
      {item.card.headline || "Кандидат"}
    </Link>
  );
}

export default async function FavoritesPage() {
  const user = await requireRole("employer");
  const [favorites, opened] = await Promise.all([listFavorites(user.id), listOpenedContacts(user.id)]);

  return (
    <>
      <PageTitle title="Избранное" lead="Кандидаты, которых вы отметили, и история открытых контактов. Данные берутся из опубликованных профилей: если кандидат скрыл профиль, он пропадает из карточки." />
      <div className="space-y-6">
        <Panel title="Избранные кандидаты">
          {favorites.length === 0 ? (
            <p className="text-sm text-mist">Пока пусто. Нажмите «В избранное» на карточке кандидата.</p>
          ) : (
            <ul className="divide-y divide-line">
              {favorites.map((f) => (
                <li key={f.candidateId} className="flex flex-col gap-2 py-4 sm:flex-row sm:items-center sm:justify-between">
                  <div className="text-sm">
                    <Who item={f} />
                    <p className="mt-1 text-xs text-mist">
                      {[f.card?.city, f.card?.desiredRole && `хочет: ${f.card.desiredRole}`, `вакансия «${f.vacancyTitle}»`, fmt.format(f.addedAt)].filter(Boolean).join(" · ")}
                    </p>
                  </div>
                  <form action={removeFavoriteAction}>
                    <input type="hidden" name="candidateId" value={f.candidateId} />
                    <button type="submit" className="rounded-full border border-line px-4 py-2 text-sm hover:border-neuron hover:text-neuron">
                      Убрать
                    </button>
                  </form>
                </li>
              ))}
            </ul>
          )}
        </Panel>

        <Panel title="История открытых контактов">
          {opened.length === 0 ? (
            <p className="text-sm text-mist">Вы ещё не открывали контакты.</p>
          ) : (
            <ul className="divide-y divide-line">
              {opened.map((o) => (
                <li key={o.candidateId} className="py-4 text-sm">
                  <Who item={o} />
                  <p className="mt-1 text-xs text-mist">
                    {[o.chargeKind === "paid" ? "оплачено отдельно" : "в рамках подписки", `вакансия «${o.vacancyTitle}»`, fmt.format(o.addedAt)].join(" · ")}
                  </p>
                </li>
              ))}
            </ul>
          )}
        </Panel>
      </div>
    </>
  );
}
