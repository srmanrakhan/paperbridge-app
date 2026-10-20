import { num } from "@/lib/format";

type Series = { label: string; values: number[]; color: string; dash?: string; width?: number };

const W = 760;
const H = 340;
const M = { top: 16, right: 150, bottom: 36, left: 76 };

// A tick step of 1, 2 or 5 x 10^n that gives about five gridlines.
function niceStep(span: number) {
  const raw = span / 5;
  const pow = Math.pow(10, Math.floor(Math.log10(raw)));
  const f = raw / pow;
  return (f <= 1 ? 1 : f <= 2 ? 2 : f <= 5 ? 5 : 10) * pow;
}

// Simple weekly line chart in SVG, amounts in zł. Lines are labelled at their right end, so colour is never the only cue.
export function CashChart({ series }: { series: Series[] }) {
  const all = series.flatMap((s) => s.values);
  const step = niceStep(Math.max(1, Math.max(0, ...all) - Math.min(0, ...all)));
  const lo = Math.min(0, Math.floor(Math.min(...all) / step) * step);
  const hi = Math.max(0, Math.ceil(Math.max(...all) / step) * step);
  const weeks = series[0].values.length - 1;
  const x = (i: number) => M.left + (i / weeks) * (W - M.left - M.right);
  const y = (v: number) => M.top + (1 - (v - lo) / (hi - lo)) * (H - M.top - M.bottom);
  const ticks: number[] = [];
  for (let t = lo; t <= hi + 1e-6; t += step) ticks.push(t);

  // Keep right-end labels from overlapping.
  const ends = series
    .map((s) => ({ s, y: y(s.values[weeks]) }))
    .sort((a, b) => a.y - b.y);
  for (let i = 1; i < ends.length; i++) if (ends[i].y - ends[i - 1].y < 30) ends[i].y = ends[i - 1].y + 30;

  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="w-full" role="img" aria-label="13-week cash forecast in zł, with and without the purchase">
      {ticks.map((t) => (
        <g key={t}>
          <line x1={M.left} x2={W - M.right} y1={y(t)} y2={y(t)} stroke={t === 0 ? "#86868b" : "#e8e8ed"} strokeWidth={1} />
          <text x={M.left - 10} y={y(t) + 4} textAnchor="end" fontSize={12} fill="#6e6e73">
            {num(t)}
          </text>
        </g>
      ))}
      {[0, 4, 8, 13].map((w) => (
        <text key={w} x={x(w)} y={H - 12} textAnchor="middle" fontSize={12} fill="#6e6e73">
          {w === 0 ? "Today" : `Week ${w}`}
        </text>
      ))}
      {series.map((s) => (
        <polyline
          key={s.label}
          fill="none"
          stroke={s.color}
          strokeWidth={s.width ?? 2.5}
          strokeDasharray={s.dash}
          strokeLinejoin="round"
          strokeLinecap="round"
          points={s.values.map((v, i) => `${x(i)},${y(v)}`).join(" ")}
        />
      ))}
      {ends.map(({ s, y: ly }) => (
        <g key={s.label}>
          <circle cx={x(weeks)} cy={y(s.values[weeks])} r={3.5} fill={s.color} />
          <text x={x(weeks) + 12} y={ly + 4} fontSize={13} fill="#1d1d1f">
            {s.label}
          </text>
        </g>
      ))}
    </svg>
  );
}
