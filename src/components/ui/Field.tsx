import type { ComponentProps, ReactNode } from "react";

const control =
  "w-full rounded-xl border border-line bg-graphite px-4 py-3 text-sm text-snow placeholder:text-mist/70 focus:border-neuron focus:outline-none aria-[invalid=true]:border-danger";

export function Field({
  label,
  error,
  hint,
  children,
}: {
  label: string;
  error?: string;
  hint?: string;
  children: ReactNode;
}) {
  return (
    <label className="block">
      <span className="mb-2 block text-sm font-medium">{label}</span>
      {children}
      {hint && !error && <span className="mt-1.5 block text-xs text-mist">{hint}</span>}
      {error && (
        <span role="alert" className="mt-1.5 block text-xs text-danger">
          {error}
        </span>
      )}
    </label>
  );
}

export function Input({ error, ...props }: ComponentProps<"input"> & { error?: string }) {
  return <input className={control} aria-invalid={error ? true : undefined} {...props} />;
}

export function Textarea({ error, ...props }: ComponentProps<"textarea"> & { error?: string }) {
  return <textarea className={`${control} min-h-28 resize-y`} aria-invalid={error ? true : undefined} {...props} />;
}

export function Select({ error, ...props }: ComponentProps<"select"> & { error?: string }) {
  return <select className={control} aria-invalid={error ? true : undefined} {...props} />;
}

export function SubmitButton({ children, pending }: { children: ReactNode; pending: boolean }) {
  return (
    <button
      type="submit"
      disabled={pending}
      className="inline-flex items-center justify-center rounded-full bg-neuron px-6 py-3 text-sm font-semibold text-ink transition-colors hover:bg-snow disabled:cursor-wait disabled:opacity-60"
    >
      {pending ? "Подождите…" : children}
    </button>
  );
}

export function FormMessage({ error, ok }: { error?: string; ok?: string }) {
  if (error) {
    return (
      <p role="alert" className="rounded-xl border border-danger/50 bg-danger/10 px-4 py-3 text-sm text-danger">
        {error}
      </p>
    );
  }
  if (ok) {
    return (
      <p role="status" className="rounded-xl border border-neuron/50 bg-neuron/10 px-4 py-3 text-sm text-neuron">
        {ok}
      </p>
    );
  }
  return null;
}
