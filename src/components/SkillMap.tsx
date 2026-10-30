// Иллюстрация формата отчёта. Значения — демонстрационные и подписаны как пример.
const axes = [
  { label: "Коммуникация", value: 0.78 },
  { label: "Анализ", value: 0.64 },
  { label: "Приоритизация", value: 0.85 },
  { label: "Делегирование", value: 0.52 },
  { label: "Адаптивность", value: 0.72 },
  { label: "Системность", value: 0.6 },
];

const C = 150;
const R = 100;

function point(i: number, v: number) {
  const a = (Math.PI * 2 * i) / axes.length - Math.PI / 2;
  return [C + Math.cos(a) * R * v, C + Math.sin(a) * R * v] as const;
}

export function SkillMap() {
  const poly = axes.map((a, i) => point(i, a.value).join(",")).join(" ");
  return (
    <figure className="rounded-3xl border border-line bg-panel/70 p-6 backdrop-blur">
      <svg
        viewBox="0 0 300 300"
        role="img"
        aria-label="Пример карты компетенций в отчёте"
        className="mx-auto w-full max-w-sm"
      >
        {[0.25, 0.5, 0.75, 1].map((r) => (
          <polygon
            key={r}
            points={axes.map((_, i) => point(i, r).join(",")).join(" ")}
            fill="none"
            stroke="var(--color-line)"
          />
        ))}
        {axes.map((a, i) => {
          const [x, y] = point(i, 1);
          const [lx, ly] = point(i, 1.2);
          return (
            <g key={a.label}>
              <line x1={C} y1={C} x2={x} y2={y} stroke="var(--color-line)" />
              <text
                x={lx}
                y={ly}
                fill="var(--color-mist)"
                fontSize="9"
                textAnchor="middle"
                dominantBaseline="middle"
              >
                {a.label}
              </text>
            </g>
          );
        })}
        <polygon
          points={poly}
          fill="var(--color-neuron)"
          fillOpacity="0.18"
          stroke="var(--color-neuron)"
          strokeWidth="1.5"
        />
        {axes.map((a, i) => {
          const [x, y] = point(i, a.value);
          return <circle key={a.label} cx={x} cy={y} r="3" fill="var(--color-neuron)" />;
        })}
      </svg>
      <figcaption className="mt-4 font-mono text-xs text-mist">
        Пример формата отчёта · значения демонстрационные, не результат реального человека
      </figcaption>
    </figure>
  );
}
