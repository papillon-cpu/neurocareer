import Link from "next/link";
import type { Completeness } from "@/modules/profile/completeness";

export function PageTitle({ title, lead }: { title: string; lead?: string }) {
  return (
    <div className="mb-10">
      <h1 className="font-display text-3xl">{title}</h1>
      {lead && <p className="mt-3 max-w-2xl text-mist">{lead}</p>}
    </div>
  );
}

export function Panel({
  title,
  children,
  className = "",
}: {
  title: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <section className={`rounded-3xl border border-line bg-panel p-6 ${className}`}>
      <h2 className="font-mono text-xs uppercase tracking-[0.15em] text-mist">{title}</h2>
      <div className="mt-4">{children}</div>
    </section>
  );
}

export function CompletenessPanel({
  data,
  href,
  title = "Заполненность профиля",
}: {
  data: Completeness;
  href: string;
  title?: string;
}) {
  return (
    <Panel title={title}>
      <p className="font-display text-5xl">{data.percent}%</p>
      <div
        role="progressbar"
        aria-valuenow={data.percent}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-label={title}
        className="mt-4 h-1.5 overflow-hidden rounded-full bg-line"
      >
        <div className="h-full rounded-full bg-neuron" style={{ width: `${data.percent}%` }} />
      </div>
      <ul className="mt-5 space-y-1.5 text-sm">
        {data.items.map((i) => (
          <li key={i.key} className={i.done ? "text-mist line-through decoration-line" : ""}>
            {i.done ? "✓ " : "○ "}
            {i.label}
          </li>
        ))}
      </ul>
      {data.next ? (
        <Link href={href} className="mt-5 inline-block text-sm text-neuron underline-offset-4 hover:underline">
          Заполнить: {data.next.label} →
        </Link>
      ) : (
        <p className="mt-5 text-sm text-neuron">Профиль заполнен полностью.</p>
      )}
    </Panel>
  );
}
