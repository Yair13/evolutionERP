import { useId } from "react";

type Props = {
  values: number[];
  className?: string;
};

/** Gráfico compacto sin librerías externas. */
export function Sparkline({ values, className }: Props) {
  const gid = useId().replace(/:/g, "");
  const w = 120;
  const h = 36;
  const pad = 2;
  if (values.length === 0) return <svg className={className} width={w} height={h} aria-hidden />;

  const max = Math.max(1, ...values);
  const min = Math.min(0, ...values);
  const span = Math.max(1, max - min);
  const step = values.length > 1 ? (w - pad * 2) / (values.length - 1) : 0;

  const pts = values.map((v, i) => {
    const x = pad + i * step;
    const y = pad + (1 - (v - min) / span) * (h - pad * 2);
    return `${x.toFixed(1)},${y.toFixed(1)}`;
  });

  const d = `M ${pts.join(" L ")}`;
  const gradId = `sparkFill-${gid}`;

  return (
    <svg className={className} width={w} height={h} viewBox={`0 0 ${w} ${h}`} role="img" aria-label="Tendencia de movimientos">
      <defs>
        <linearGradient id={gradId} x1="0" x2="0" y1="0" y2="1">
          <stop offset="0%" stopColor="rgba(15, 110, 99, 0.35)" />
          <stop offset="100%" stopColor="rgba(15, 110, 99, 0)" />
        </linearGradient>
      </defs>
      <path
        d={`${d} L ${w - pad},${h - pad} L ${pad},${h - pad} Z`}
        fill={`url(#${gradId})`}
        stroke="none"
      />
      <path d={d} fill="none" stroke="var(--accent)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
