import Link from "next/link";
import type { ComponentProps } from "react";

type Variant = "primary" | "ghost";

const styles: Record<Variant, string> = {
  primary:
    "bg-neuron text-ink hover:bg-white font-semibold",
  ghost:
    "border border-line text-snow hover:border-neuron hover:text-neuron",
};

export function ButtonLink({
  variant = "primary",
  className = "",
  ...props
}: ComponentProps<typeof Link> & { variant?: Variant }) {
  return (
    <Link
      className={`inline-flex items-center justify-center gap-2 rounded-full px-6 py-3 text-sm transition-colors ${styles[variant]} ${className}`}
      {...props}
    />
  );
}
