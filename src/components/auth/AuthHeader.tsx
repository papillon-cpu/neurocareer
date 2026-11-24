import Link from "next/link";
import { ThemeToggle } from "@/components/ThemeToggle";
import { brand } from "@/config/brand";

/** Шапка auth-страниц: логотип и переключатель темы (на них нет общей шапки). */
export function AuthHeader() {
  return (
    <div className="flex items-center justify-between gap-4">
      <Link href="/" className="font-display text-sm">
        {brand.name}
      </Link>
      <ThemeToggle />
    </div>
  );
}
