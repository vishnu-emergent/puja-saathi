import { motion } from 'framer-motion';

/**
 * Progress drawn as a kolam: one pulli (dot) per step, and a looping line that
 * is drawn through the dots as you complete them.
 */
export function KolamProgress({ total, current }: { total: number; current: number }) {
  const gap = 34;
  const w = gap * (total - 1) + 24;
  const h = 44;
  const y = h / 2;
  const xs = Array.from({ length: total }, (_, i) => 12 + i * gap);

  const loops = xs.slice(1).map((x, i) => {
    const x0 = xs[i];
    const up = i % 2 === 0 ? -1 : 1;
    const mid = (x0 + x) / 2;
    return `M ${x0} ${y} C ${x0 + 4} ${y + up * 17}, ${mid - 4} ${y + up * 17}, ${mid} ${y} S ${x - 4} ${y - up * 17}, ${x} ${y}`;
  });

  return (
    <svg className="kolam" viewBox={`0 0 ${w} ${h}`} width={w} height={h} role="img" aria-label={`Step ${current + 1} of ${total}`}>
      {loops.map((d, i) => (
        <g key={i}>
          <path d={d} className="kolam__ghost" />
          <motion.path
            d={d}
            className="kolam__line"
            initial={false}
            animate={{ pathLength: i < current ? 1 : 0, opacity: i < current ? 1 : 0 }}
            transition={{ duration: 0.7, ease: [0.65, 0, 0.35, 1] }}
          />
        </g>
      ))}
      {xs.map((x, i) => (
        <motion.circle
          key={i}
          cx={x}
          cy={y}
          initial={false}
          animate={{ r: i === current ? 5 : 3, opacity: i <= current ? 1 : 0.35 }}
          className={i === current ? 'kolam__dot kolam__dot--now' : i < current ? 'kolam__dot kolam__dot--done' : 'kolam__dot'}
        />
      ))}
    </svg>
  );
}
