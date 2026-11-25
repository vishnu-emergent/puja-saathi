import { useEffect, useRef } from 'react';

/**
 * The room the puja happens in: slow embers rising through the dark, tinted
 * by the festival theme, and a faint kolam mandala turning in the corner.
 * One canvas, ~60fps, paused when the tab is hidden; still under reduced motion.
 */
export function Ambient({ density = 1 }: { density?: number }) {
  const ref = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = ref.current!;
    const ctx = canvas.getContext('2d')!;
    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    let w = 0;
    let h = 0;
    let dpr = 1;
    let color = '243,166,50';
    let raf = 0;

    const readColor = () => {
      const v = getComputedStyle(document.documentElement).getPropertyValue('--flame-mid').trim();
      const m = /^#?([0-9a-f]{6})$/i.exec(v.replace('#', '').length === 6 ? v.replace('#', '') : '');
      if (m) {
        const n = parseInt(m[1], 16);
        color = `${(n >> 16) & 255},${(n >> 8) & 255},${n & 255}`;
      }
    };

    type P = { x: number; y: number; r: number; vy: number; vx: number; a: number; tw: number; ph: number };
    let ps: P[] = [];
    const spawn = (fresh = false): P => ({
      x: Math.random() * w,
      y: fresh ? Math.random() * h : h + 10,
      r: 0.6 + Math.random() * 2.2,
      vy: 0.12 + Math.random() * 0.45,
      vx: (Math.random() - 0.5) * 0.15,
      a: 0.15 + Math.random() * 0.55,
      tw: 0.6 + Math.random() * 1.6,
      ph: Math.random() * Math.PI * 2,
    });

    const resize = () => {
      dpr = Math.min(2, window.devicePixelRatio || 1);
      w = window.innerWidth;
      h = window.innerHeight;
      canvas.width = w * dpr;
      canvas.height = h * dpr;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      const count = Math.round(Math.min(110, (w * h) / 16000) * density);
      ps = Array.from({ length: count }, () => spawn(true));
    };

    let t = 0;
    const frame = () => {
      t += 1 / 60;
      ctx.clearRect(0, 0, w, h);
      for (const p of ps) {
        p.y -= p.vy;
        p.x += p.vx + Math.sin(t * 0.6 + p.ph) * 0.12;
        if (p.y < -12) Object.assign(p, spawn());
        const life = Math.min(1, p.y / (h * 0.9));
        const alpha = p.a * (0.55 + 0.45 * Math.sin(t * p.tw + p.ph)) * life;
        const g = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, p.r * 5);
        g.addColorStop(0, `rgba(${color},${alpha})`);
        g.addColorStop(1, `rgba(${color},0)`);
        ctx.fillStyle = g;
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.r * 5, 0, Math.PI * 2);
        ctx.fill();
      }
      raf = requestAnimationFrame(frame);
    };

    readColor();
    resize();
    const themeWatch = new MutationObserver(() => setTimeout(readColor, 950));
    themeWatch.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
    window.addEventListener('resize', resize);
    const vis = () => {
      cancelAnimationFrame(raf);
      if (!document.hidden && !reduce) raf = requestAnimationFrame(frame);
    };
    document.addEventListener('visibilitychange', vis);
    if (reduce) frame();
    else raf = requestAnimationFrame(frame);
    if (reduce) cancelAnimationFrame(raf);

    return () => {
      cancelAnimationFrame(raf);
      themeWatch.disconnect();
      window.removeEventListener('resize', resize);
      document.removeEventListener('visibilitychange', vis);
    };
  }, [density]);

  return (
    <div className="ambient" aria-hidden>
      <canvas ref={ref} />
      <Mandala />
    </div>
  );
}

/** A kolam-style mandala: rings of pulli dots joined by petal loops. */
function Mandala() {
  const petals = 16;
  const rings = [70, 130, 200, 270];
  return (
    <svg className="mandala" viewBox="-300 -300 600 600">
      {rings.map((r, i) => (
        <circle key={r} r={r} className="mandala__ring" strokeDasharray={i % 2 ? '2 10' : undefined} />
      ))}
      {Array.from({ length: petals }, (_, i) => {
        const a = (i / petals) * Math.PI * 2;
        const a2 = ((i + 0.5) / petals) * Math.PI * 2;
        const p = (r: number, ang: number) => `${(Math.cos(ang) * r).toFixed(1)} ${(Math.sin(ang) * r).toFixed(1)}`;
        return (
          <g key={i}>
            <path className="mandala__petal" d={`M ${p(70, a)} Q ${p(170, a2)} ${p(270, a)}`} />
            <path className="mandala__petal" d={`M ${p(130, a)} Q ${p(200, a2 + 0.2)} ${p(130, a + (Math.PI * 2) / petals)}`} />
            <circle cx={Math.cos(a) * 200} cy={Math.sin(a) * 200} r="3" className="mandala__dot" />
            <circle cx={Math.cos(a2) * 270} cy={Math.sin(a2) * 270} r="2.2" className="mandala__dot" />
          </g>
        );
      })}
    </svg>
  );
}
