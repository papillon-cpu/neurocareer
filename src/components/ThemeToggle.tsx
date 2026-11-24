"use client";

import { useEffect, useState } from "react";

const STORAGE_KEY = "theme";
type Theme = "light" | "dark";

/**
 * NEUROCAREER theme toggle.
 * The real theme always lives in the DOM: the server renders the dark theme by
 * default, while the saved user choice is applied by the inline script in layout.tsx.
 * So after hydration we sync the state with document.documentElement, and every
 * click reads the current theme from the DOM instead of React state - the state
 * can still lag behind right after hydration and would toggle the wrong way.
 */
export function ThemeToggle() {
  const [theme, setTheme] = useState<Theme>("dark");

  useEffect(() => {
    const stored = localStorage.getItem(STORAGE_KEY);
    const current = document.documentElement.dataset.theme;
    const next: Theme =
      stored === "light" || stored === "dark" ? stored : current === "light" ? "light" : "dark";
    setTheme(next);
  }, []);

  function toggle() {
    const current = document.documentElement.dataset.theme === "light" ? "light" : "dark";
    const next: Theme = current === "light" ? "dark" : "light";
    document.documentElement.dataset.theme = next;
    document.documentElement.style.colorScheme = next;
    setTheme(next);
    try {
      localStorage.setItem(STORAGE_KEY, next);
    } catch {
      // Private browsing: just do not persist the choice.
    }
  }

  return (
    <button
      type="button"
      onClick={toggle}
      aria-label={theme === "dark" ? "Enable light theme" : "Enable dark theme"}
      aria-pressed={theme === "light"}
      title={theme === "dark" ? "Light theme" : "Dark theme"}
      className="theme-toggle grid size-9 shrink-0 place-items-center rounded-full border border-line/70 bg-ink-soft text-mist transition-colors hover:border-mist/40"
    >
      <svg className="moon" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden>
        <path d="M21 12.9A9 9 0 1 1 11.1 3a7 7 0 0 0 9.9 9.9Z" />
      </svg>
      <svg className="sun" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden>
        <circle cx="12" cy="12" r="4" />
        <path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" />
      </svg>
    </button>
  );
}
