import type { Traffic } from './useOps';

const W = 640;
const H = 180;
const SLOTS = 90;

/** p95 latency (line) over request rate (bars), with the NudgeBee alert threshold. */
export function TrafficChart({ history, threshold }: { history: Traffic[]; threshold: number }) {
  const maxP95 = Math.max(threshold * 1.5, ...history.map((h) => h.p95));
  const maxRps = Math.max(20, ...history.map((h) => h.rps));
  const x = (i: number) => (W / (SLOTS - 1)) * (SLOTS - history.length + i);
  const y = (ms: number) => H - 8 - (ms / maxP95) * (H - 24);
  const line = history.map((h, i) => `${i === 0 ? 'M' : 'L'} ${x(i).toFixed(1)} ${y(h.p95).toFixed(1)}`).join(' ');
  const area = history.length > 1 ? `${line} L ${x(history.length - 1)} ${H} L ${x(0)} ${H} Z` : '';
  const barW = W / SLOTS - 2;
  const ty = y(threshold);
  const last = history[history.length - 1];

  return (
    <div className="chart">
      <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" role="img" aria-label="p95 latency and requests per second">
        <defs>
          <linearGradient id="lat-fill" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor="var(--c-lat)" stopOpacity="0.28" />
            <stop offset="1" stopColor="var(--c-lat)" stopOpacity="0" />
          </linearGradient>
        </defs>
        {[0.25, 0.5, 0.75].map((f) => (
          <line key={f} x1="0" x2={W} y1={H * f} y2={H * f} className="chart__grid" />
        ))}
        {history.map((h, i) => {
          const bh = (h.rps / maxRps) * (H * 0.45);
          return <rect key={h.at} x={x(i) - barW / 2} y={H - bh} width={Math.max(1, barW)} height={bh} className={h.rushing ? 'chart__bar is-rush' : 'chart__bar'} />;
        })}
        {area && <path d={area} fill="url(#lat-fill)" />}
        {history.length > 1 && <path d={line} className="chart__line" vectorEffect="non-scaling-stroke" />}
        <line x1="0" x2={W} y1={ty} y2={ty} className="chart__threshold" vectorEffect="non-scaling-stroke" />
      </svg>
      <span className="chart__tag chart__tag--threshold" style={{ top: `${(ty / H) * 100}%` }}>
        alert at {threshold} ms
      </span>
      {last && (
        <span className="chart__tag chart__tag--now" style={{ top: `${(y(last.p95) / H) * 100}%` }}>
          {last.p95} ms
        </span>
      )}
    </div>
  );
}
