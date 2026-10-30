const C = 150;
const R = 95;

export function Radar({ axes, label }: { axes: { label: string; value: number }[]; label: string }) {
  const n = axes.length;
  const pt = (i: number, v: number) => {
    const a = (Math.PI * 2 * i) / n - Math.PI / 2;
    return [C + Math.cos(a) * R * v, C + Math.sin(a) * R * v] as const;
  };
  const anchor = (i: number) => {
    const x = pt(i, 1)[0];
    return x < C - 5 ? "end" : x > C + 5 ? "start" : "middle";
  };
  return (
    <svg viewBox="-140 -10 580 320" role="img" aria-label={label} className="mx-auto w-full max-w-md">
      {[0.25, 0.5, 0.75, 1].map((r) => (
        <polygon key={r} points={axes.map((_, i) => pt(i, r).join(",")).join(" ")} fill="none" stroke="var(--color-line)" />
      ))}
      {axes.map((a, i) => {
        const [x, y] = pt(i, 1);
        const [lx, ly] = pt(i, 1.13);
        return (
          <g key={a.label}>
            <line x1={C} y1={C} x2={x} y2={y} stroke="var(--color-line)" />
            <text x={lx} y={ly} fill="var(--color-mist)" fontSize="13" textAnchor={anchor(i)} dominantBaseline="middle">
              {a.label}
            </text>
          </g>
        );
      })}
      <polygon
        points={axes.map((a, i) => pt(i, Math.max(0, Math.min(1, a.value / 100))).join(",")).join(" ")}
        fill="var(--color-neuron)"
        fillOpacity="0.18"
        stroke="var(--color-neuron)"
        strokeWidth="1.5"
      />
      {axes.map((a, i) => {
        const [x, y] = pt(i, Math.max(0, Math.min(1, a.value / 100)));
        return <circle key={a.label} cx={x} cy={y} r="3" fill="var(--color-neuron)" />;
      })}
    </svg>
  );
}
