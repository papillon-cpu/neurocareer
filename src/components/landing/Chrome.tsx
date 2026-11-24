import Link from "next/link";
import { brand } from "@/config/brand";
import { DemoSwitcher } from "@/components/DemoSwitcher";
import { ThemeToggle } from "@/components/ThemeToggle";
import { REQUESTS_URL } from "@/config/site";

export type NavAnchor = { href: string; label: string };

/** Шапка публичных страниц. Справа: переключатель демо-режима (если включён), тема, вход. */
export function SiteHeader({ nav = [], loginHref = "/login" }: { nav?: NavAnchor[]; loginHref?: string }) {
  return (
    <header className="sticky top-0 z-20 border-b border-line/60 bg-ink/80 backdrop-blur">
      <div className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-5 py-4">
        <Link href="/" className="font-display text-sm tracking-wide">
          {brand.name}
        </Link>
        {nav.length > 0 && (
          <nav aria-label="Основная" className="hidden gap-8 text-sm text-mist md:flex">
            {nav.map((n) => (
              <a key={n.href} className="hover:text-snow" href={n.href}>
                {n.label}
              </a>
            ))}
          </nav>
        )}
        <div className="flex items-center gap-3">
          <DemoSwitcher />
          <ThemeToggle />
          <Link href={loginHref} className="rounded-full border border-line px-4 py-1.5 text-xs text-mist hover:border-neuron hover:text-neuron">
            Войти
          </Link>
        </div>
      </div>
    </header>
  );
}

export function SiteFooter() {
  return (
    <footer className="border-t border-line">
      <div className="mx-auto flex max-w-6xl flex-col gap-2 px-5 py-8 text-xs text-mist sm:flex-row sm:justify-between">
        <span>© {brand.name}. Проект на стадии разработки.</span>
        <a href={REQUESTS_URL} target="_blank" rel="noreferrer" className="hover:text-neuron">
          Написать, что изменить на сайте
        </a>
        <span>Юридические тексты будут проверены специалистом до запуска.</span>
      </div>
    </footer>
  );
}
