/** Показывается везде, где оплата идёт через тестового провайдера: чтобы её нельзя было принять за настоящую. */
export function TestModeBanner() {
  return (
    <p role="status" className="rounded-2xl border border-violet/60 bg-violet/10 px-4 py-3 text-sm">
      <b>Тестовый режим оплаты.</b> Реальные деньги не списываются, платёжный провайдер ещё не подключён.
    </p>
  );
}
