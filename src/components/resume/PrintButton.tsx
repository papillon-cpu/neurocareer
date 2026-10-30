"use client";

export function PrintButton() {
  return (
    <button
      type="button"
      onClick={() => window.print()}
      className="rounded-full bg-neuron px-6 py-3 text-sm font-semibold text-ink hover:bg-snow"
    >
      Сохранить как PDF
    </button>
  );
}
