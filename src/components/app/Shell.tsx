import Link from "next/link";
import { brand } from "@/config/brand";
import { logoutAction } from "@/modules/auth/actions";
import { ThemeToggle } from "@/components/ThemeToggle";
import { NavLink } from "./NavLink";

export type NavItem = { href: string; label: string; exact?: boolean };

export function Shell({
  nav,
  upcoming,
  email,
  area,
  children,
}: {
  nav: NavItem[];
  upcoming?: string[];
  email: string;
  area: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex min-h-screen flex-col">
      <header className="shell-chrome sticky top-0 z-20 border-b border-line/60 bg-ink/85 backdrop-blur">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center gap-x-6 gap-y-2 px-5 py-3">
          <Link href="/" className="font-display text-sm">
            {brand.name}
          </Link>
          <span className="rounded-full border border-line px-3 py-1 font-mono text-xs text-mist">{area}</span>
          <div className="ml-auto flex items-center gap-3">
            <span className="hidden max-w-48 truncate text-xs text-mist sm:block">{email}</span>
            <ThemeToggle />
            <form action={logoutAction}>
              <button type="submit" className="rounded-full border border-line px-4 py-1.5 text-xs text-mist hover:border-neuron hover:text-neuron">
                Выйти
              </button>
            </form>
          </div>
          <nav aria-label="Разделы" className="flex w-full flex-wrap gap-1">
            {nav.map((n) => (
              <NavLink key={n.href} href={n.href} exact={n.exact}>
                {n.label}
              </NavLink>
            ))}
          </nav>
        </div>
      </header>
      <div className="mx-auto w-full max-w-6xl flex-1 px-5 py-10">{children}</div>
      {upcoming && upcoming.length > 0 && (
        <footer className="shell-chrome border-t border-line">
          <p className="mx-auto max-w-6xl px-5 py-5 text-xs text-mist">
            Появятся в следующих этапах: {upcoming.join(", ")}.
          </p>
        </footer>
      )}
    </div>
  );
}
