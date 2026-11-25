import { useId } from 'react';
import { cx } from '../lib/util';

export type DiyaState = 'idle' | 'listening' | 'thinking' | 'speaking' | 'off';

type Props = {
  size?: number;
  state?: DiyaState;
  /** 0..1 live microphone level — makes the flame breathe with your voice */
  level?: number;
  className?: string;
};

/**
 * A clay diya drawn in SVG. The flame is alive: it flickers at rest, sways
 * while the guide speaks, grows with your voice while listening, and goes out
 * (with a wisp of smoke) when voice is paused.
 */
export function Diya({ size = 160, state = 'idle', level = 0, className }: Props) {
  const uid = useId().replace(/:/g, '');
  const lit = state !== 'off';
  const grow = state === 'listening' ? 1 + Math.min(level, 1) * 0.55 : 1;

  return (
    <div className={cx('diya', `diya--${state}`, className)} style={{ width: size, height: size }} aria-hidden>
      <svg viewBox="0 0 200 200" width={size} height={size}>
        <defs>
          <radialGradient id={`glow-${uid}`} cx="50%" cy="50%" r="50%">
            <stop offset="0" stopColor="var(--flame-core)" stopOpacity="0.55" />
            <stop offset="0.35" stopColor="var(--accent)" stopOpacity="0.22" />
            <stop offset="1" stopColor="var(--accent)" stopOpacity="0" />
          </radialGradient>
          <radialGradient id={`flame-${uid}`} cx="50%" cy="72%" r="70%">
            <stop offset="0" stopColor="#fffaf0" />
            <stop offset="0.28" stopColor="var(--flame-core)" />
            <stop offset="0.62" stopColor="var(--flame-mid)" />
            <stop offset="1" stopColor="var(--flame-edge)" stopOpacity="0.9" />
          </radialGradient>
          <linearGradient id={`clay-${uid}`} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor="var(--clay-top)" />
            <stop offset="1" stopColor="var(--clay-bottom)" />
          </linearGradient>
          <linearGradient id={`rim-${uid}`} x1="0" y1="0" x2="1" y2="0">
            <stop offset="0" stopColor="var(--clay-rim)" stopOpacity="0.4" />
            <stop offset="0.5" stopColor="var(--clay-rim)" />
            <stop offset="1" stopColor="var(--clay-rim)" stopOpacity="0.4" />
          </linearGradient>
        </defs>

        {lit && <circle className="diya__halo" cx="100" cy="92" r="92" fill={`url(#glow-${uid})`} />}

        {lit ? (
          <g className="diya__flame-wrap" style={{ transform: `scale(${grow})` }}>
            <g className="diya__flame">
              <path
                d="M100 40 C 112 62, 122 78, 122 94 C 122 108, 112 118, 100 118 C 88 118, 78 108, 78 94 C 78 78, 88 62, 100 40 Z"
                fill={`url(#flame-${uid})`}
              />
              <path d="M100 76 C 105 86, 108 92, 108 99 C 108 106, 104 110, 100 110 C 96 110, 92 106, 92 99 C 92 92, 95 86, 100 76 Z" fill="#fffdf6" opacity="0.85" />
            </g>
          </g>
        ) : (
          <g className="diya__smoke">
            <path d="M100 112 C 94 100, 108 92, 100 80 C 93 70, 106 62, 100 50" fill="none" stroke="var(--muted)" strokeWidth="2" strokeLinecap="round" opacity="0.5" />
          </g>
        )}

        <rect x="98" y="112" width="4" height="10" rx="2" fill={lit ? '#2b160b' : '#3a3330'} />
        <path d="M28 124 C 40 162, 70 176, 100 176 C 130 176, 160 162, 172 124 Z" fill={`url(#clay-${uid})`} />
        <path d="M166 124 C 176 120, 186 116, 192 108 C 186 124, 176 128, 166 130 Z" fill={`url(#clay-${uid})`} />
        <ellipse cx="100" cy="124" rx="72" ry="9" fill="var(--clay-inner)" />
        <path d="M28 124 Q 100 140 172 124" fill="none" stroke={`url(#rim-${uid})`} strokeWidth="3" strokeLinecap="round" />
        <path d="M52 150 Q 100 162 148 150" fill="none" stroke="var(--clay-rim)" strokeOpacity="0.35" strokeWidth="1.5" strokeDasharray="2 6" strokeLinecap="round" />
      </svg>
    </div>
  );
}
