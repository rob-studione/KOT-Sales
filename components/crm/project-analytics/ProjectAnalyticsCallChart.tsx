import type { ProjectAnalyticsDto } from "@/lib/crm/projectAnalytics";
import { formatIsoMonthDay } from "@/lib/crm/format";

export function ProjectAnalyticsCallChart({ trend }: { trend: ProjectAnalyticsDto["trend"] }) {
  if (trend.length === 0) return <p className="text-sm text-zinc-500">Nėra duomenų pasirinktam laikotarpiui.</p>;

  const w = 640;
  const h = 200;
  const padL = 36;
  const padR = 12;
  const padT = 12;
  const padB = 28;
  const innerW = w - padL - padR;
  const innerH = h - padT - padB;

  const maxY = Math.max(1, ...trend.map((d) => Math.max(d.calls, d.answered + d.notAnswered)));
  const n = trend.length;
  const stepX = n <= 1 ? innerW : innerW / (n - 1);

  function xAt(i: number): number {
    return padL + (n <= 1 ? innerW / 2 : i * stepX);
  }

  function yAt(v: number): number {
    return padT + innerH - (v / maxY) * innerH;
  }

  const lineCalls = trend.map((d, i) => `${xAt(i)},${yAt(d.calls)}`).join(" ");
  const lineAns = trend.map((d, i) => `${xAt(i)},${yAt(d.answered)}`).join(" ");
  const lineNo = trend.map((d, i) => `${xAt(i)},${yAt(d.notAnswered)}`).join(" ");

  const showMany = n > 14;
  const labelEvery = showMany ? Math.ceil(n / 7) : 1;

  return (
    <div className="w-full overflow-x-auto">
      <svg viewBox={`0 0 ${w} ${h}`} className="h-auto w-full max-w-3xl text-zinc-900" role="img" aria-label="Skambučių tendencija per dieną">
        <rect x={0} y={0} width={w} height={h} fill="transparent" />
        {[0, 0.25, 0.5, 0.75, 1].map((t) => {
          const y = padT + innerH * (1 - t);
          return (
            <g key={t}>
              <line x1={padL} y1={y} x2={w - padR} y2={y} stroke="#e4e4e7" strokeWidth={1} />
              <text x={4} y={y + 4} fontSize={10} fill="#71717a">
                {Math.round(maxY * t)}
              </text>
            </g>
          );
        })}
        <polyline fill="none" stroke="#18181b" strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" points={lineCalls} />
        <polyline fill="none" stroke="#16a34a" strokeWidth={1.5} strokeDasharray="4 3" points={lineAns} />
        <polyline fill="none" stroke="#dc2626" strokeWidth={1.5} strokeDasharray="3 3" points={lineNo} />
        {trend.map((d, i) =>
          i % labelEvery === 0 || i === n - 1 ? (
            <text key={`${d.date}-${i}`} x={xAt(i)} y={h - 6} fontSize={9} fill="#71717a" textAnchor="middle">
              {formatIsoMonthDay(d.date)}
            </text>
          ) : null
        )}
      </svg>
      <div className="mt-2 flex flex-wrap gap-4 text-xs text-zinc-600">
        <span className="inline-flex items-center gap-1.5">
          <span className="h-0.5 w-4 bg-[#7C4A57]" /> Skambučiai
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span className="h-0.5 w-4 bg-green-600" /> Atsiliepė
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span className="h-0.5 w-4 bg-red-600" /> Neatsiliepė
        </span>
      </div>
    </div>
  );
}
