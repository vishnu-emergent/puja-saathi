import { useEffect, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import type { Config, Festival, Lang, RitualResponse } from '../lib/api';
import { Diya } from '../components/Diya';
import { cx, fmtDate, fmtDateLong, fmtTime, load, pad2, save, splitDuration } from '../lib/util';
import { Arrow } from './Welcome';
import { useWide } from '../lib/useWide';

type Props = {
  config: Config | null;
  ritualRes: RitualResponse | null;
  loading: boolean;
  error: string | null;
  languages: Lang[];
  now: () => Date;
  embed: boolean;
  onBegin: () => void;
  onChangePlace: () => void;
  onLanguage: (lang: string) => void;
};

export function Home({ config, ritualRes, loading, error, languages, now, embed, onBegin, onChangePlace }: Props) {
  const wide = useWide();
  const lang = languages.find((l) => l.code === config?.lang);
  const ritual = ritualRes?.ritual;
  const switching = loading && ritualRes && ritualRes.ritual.id !== config?.flags.ritual_pack.value;

  if (!ritual || !config) {
    return (
      <div className="home home--loading">
        <Diya size={120} state="thinking" />
        <p className="loading-copy">
          {error ?? (
            <>
              Preparing your puja{lang && lang.code !== 'en-IN' ? <> in <span lang={lang.code}>{lang.native}</span></> : null}…
            </>
          )}
        </p>
        {!error && <p className="fineprint">Sarvam AI is translating every step for you</p>}
      </div>
    );
  }

  const quiet = !config.flags.voice_guide.enabled;
  const story = config.flags.guide_style.value === 'story';
  const textLang = ritualRes.lang;

  const cta = (
    <div className="home__cta">
      <button className="btn btn--primary btn--lg" onClick={onBegin} disabled={Boolean(switching)}>
        Begin the puja
        <Arrow />
      </button>
      {!embed && (
        <p className="fineprint provenance">
          Ritual chosen for {config.city.state} by <b>Flagsmith</b> · voice by <b>Sarvam AI</b>
          {config.flagsSource !== 'flagsmith' && <span className="warn"> · flags offline</span>}
        </p>
      )}
    </div>
  );

  return (
    <div className={cx('home', switching && 'is-switching')}>
      <header className="topbar">
        <div className="brand">
          <Diya size={28} />
          <span>Puja Saathi</span>
        </div>
        {!embed && (
          <button className="place-pill" onClick={onChangePlace} aria-label="Change city or language">
            <span>{config.city.name}</span>
            <span className="dot-sep" />
            <span lang={config.lang}>{lang?.native}</span>
            <svg width="12" height="12" viewBox="0 0 24 24" aria-hidden>
              <path d="M6 9l6 6 6-6" stroke="currentColor" strokeWidth="2" fill="none" strokeLinecap="round" />
            </svg>
          </button>
        )}
      </header>

      <AnimatePresence>
        {quiet && config.services.sarvam.configured && (
          <motion.div className="quiet-banner" initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} exit={{ opacity: 0, height: 0 }} lang={textLang}>
            <span className="quiet-banner__icon" aria-hidden>
              ☾
            </span>
            {ritualRes.ui.quiet}
          </motion.div>
        )}
      </AnimatePresence>

      <div className="home__grid">
        <div className="home__main">
          <AnimatePresence mode="wait">
            <motion.section
              key={`${ritual.id}-${textLang}`}
              className="hero"
              initial={{ opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              transition={{ duration: 0.6, ease: [0.22, 1, 0.36, 1] }}
            >
              {config.festival && (
                <p className="eyebrow">
                  {config.festival.name} · {fmtDate(config.festival.muhurat)} · {config.city.name}
                </p>
              )}
              <h1 className="hero__title" lang={textLang}>
                {ritual.title}
              </h1>
              <p className="hero__lede" lang={textLang}>
                {ritual.intro}
              </p>
              <div className="hero__meta">
                <span>≈ {ritual.duration} min</span>
                <span className="dot-sep" />
                <span>{ritual.steps.length} steps</span>
                {story && (
                  <span className="badge badge--story" title="You are in the story-mode experiment">
                    ✦ Story mode
                  </span>
                )}
                {quiet && <span className="badge badge--quiet">Quiet mode</span>}
              </div>
              {wide && cta}
            </motion.section>
          </AnimatePresence>

          {!wide && config.festival && <Muhurat festival={config.festival} cityName={config.city.name} now={now} />}

          <Samagri key={ritual.id} items={ritual.samagri} storageKey={`ps.samagri.${config.city.id}.${ritual.id}`} lang={textLang} />
        </div>

        {wide && (
          <aside className="home__side">
            {config.festival && <MuhuratRing festival={config.festival} cityName={config.city.name} now={now} />}
            <section className="path">
              <h2 className="path__head">The path tonight</h2>
              <ol>
                {ritual.steps.map((st, i) => (
                  <li key={i} lang={textLang}>
                    <span className="path__num">{String(i + 1).padStart(2, '0')}</span>
                    <span>{st.title}</span>
                    {st.mantra && <span className="path__mantra">mantra</span>}
                  </li>
                ))}
              </ol>
            </section>
          </aside>
        )}
      </div>

      {!wide && cta}
    </div>
  );
}

function Muhurat({ festival, cityName, now }: { festival: Festival; cityName: string; now: () => Date }) {
  const [t, setT] = useState(() => now().getTime());
  useEffect(() => {
    const id = setInterval(() => setT(now().getTime()), 1000);
    return () => clearInterval(id);
  }, [now]);

  const start = new Date(festival.muhurat).getTime();
  const end = new Date(festival.windowEnd).getTime();
  const state = t < start ? 'soon' : t <= end ? 'live' : 'past';
  const left = splitDuration(start - t);

  return (
    <section className={cx('muhurat', `muhurat--${state}`)}>
      <div className="muhurat__left">
        <p className="muhurat__label">Muhurat in {cityName}</p>
        <p className="muhurat__time">{fmtTime(festival.muhurat)}</p>
        <p className="muhurat__date">{fmtDateLong(festival.muhurat)}</p>
      </div>
      <div className="muhurat__right">
        {state === 'soon' && (
          <>
            <p className="muhurat__label">Begins in</p>
            <p className="countdown" aria-live="off">
              {left.d > 0 && (
                <>
                  <span>{left.d}</span>
                  <small>d</small>
                </>
              )}
              <span>{pad2(left.h)}</span>
              <small>h</small>
              <span>{pad2(left.m)}</span>
              <small>m</small>
              {left.d === 0 && (
                <>
                  <span>{pad2(left.s)}</span>
                  <small>s</small>
                </>
              )}
            </p>
          </>
        )}
        {state === 'live' && (
          <p className="muhurat__live">
            <span className="pulse" /> The muhurat is now
          </p>
        )}
        {state === 'past' && <p className="muhurat__past">The muhurat has passed — you can still follow along.</p>}
      </div>
    </section>
  );
}

function MuhuratRing({ festival, cityName, now }: { festival: Festival; cityName: string; now: () => Date }) {
  const [t, setT] = useState(() => now().getTime());
  useEffect(() => {
    const id = setInterval(() => setT(now().getTime()), 1000);
    return () => clearInterval(id);
  }, [now]);

  const start = new Date(festival.muhurat).getTime();
  const end = new Date(festival.windowEnd).getTime();
  const state = t < start ? 'soon' : t <= end ? 'live' : 'past';
  const left = splitDuration(start - t);
  const HORIZON = 6 * 3600_000; // the ring fills over the final six hours
  const frac = state === 'soon' ? Math.max(0.015, 1 - Math.min(1, (start - t) / HORIZON)) : 1;
  const R = 170;
  const C = 2 * Math.PI * R;
  const ticks = 72;
  const angle = frac * 2 * Math.PI - Math.PI / 2;

  return (
    <section className={cx('ring', `ring--${state}`)}>
      <div className="ring__dial">
        <svg viewBox="-200 -200 400 400" aria-hidden>
          {Array.from({ length: ticks }, (_, i) => {
            const a = (i / ticks) * Math.PI * 2 - Math.PI / 2;
            const on = i / ticks <= frac;
            const long = i % 6 === 0;
            const r1 = long ? 186 : 190;
            return (
              <line
                key={i}
                x1={Math.cos(a) * r1}
                y1={Math.sin(a) * r1}
                x2={Math.cos(a) * 196}
                y2={Math.sin(a) * 196}
                className={on ? 'ring__tick is-on' : 'ring__tick'}
              />
            );
          })}
          <circle r={R} className="ring__track" />
          <circle
            r={R}
            className="ring__arc"
            strokeDasharray={`${C * frac} ${C}`}
            transform="rotate(-90)"
          />
          <circle cx={Math.cos(angle) * R} cy={Math.sin(angle) * R} r="7" className="ring__sun" />
        </svg>
        <div className="ring__center">
          {state === 'soon' && (
            <>
              <p className="ring__label">Muhurat begins in</p>
              <p className="ring__count">
                {left.d > 0 && (
                  <>
                    {left.d}
                    <small>d</small>
                  </>
                )}
                {pad2(left.h)}
                <small>h</small>
                {pad2(left.m)}
                <small>m</small>
                {left.d === 0 && (
                  <>
                    {pad2(left.s)}
                    <small>s</small>
                  </>
                )}
              </p>
            </>
          )}
          {state === 'live' && (
            <>
              <p className="ring__label">
                <span className="pulse" /> Now
              </p>
              <p className="ring__now">The muhurat is now</p>
            </>
          )}
          {state === 'past' && (
            <>
              <p className="ring__label">Practice mode</p>
              <p className="ring__past">The muhurat has passed — you can still follow along.</p>
            </>
          )}
          <p className="ring__time">{fmtTime(festival.muhurat)}</p>
          <p className="ring__where">
            {cityName} · {fmtDateLong(festival.muhurat)}
          </p>
        </div>
      </div>
    </section>
  );
}

function Samagri({ items, storageKey, lang }: { items: string[]; storageKey: string; lang: string }) {
  const [done, setDone] = useState<number[]>(() => load(storageKey, []));
  const toggle = (i: number) => {
    const next = done.includes(i) ? done.filter((x) => x !== i) : [...done, i];
    setDone(next);
    save(storageKey, next);
  };
  const ready = done.length;

  return (
    <section className="samagri">
      <div className="samagri__head">
        <h2>Samagri</h2>
        <span className="samagri__count">
          {ready} of {items.length} ready
        </span>
      </div>
      <div className="samagri__bar">
        <motion.span animate={{ width: `${(ready / items.length) * 100}%` }} transition={{ type: 'spring', stiffness: 120, damping: 20 }} />
      </div>
      <ul className="samagri__list">
        {items.map((item, i) => (
          <li key={i}>
            <button className={cx('check', done.includes(i) && 'is-on')} onClick={() => toggle(i)} lang={lang}>
              <span className="check__box" aria-hidden>
                <svg viewBox="0 0 16 16" width="12" height="12">
                  <path d="M3 8.5l3 3 7-7" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              </span>
              <span>{item}</span>
            </button>
          </li>
        ))}
      </ul>
    </section>
  );
}
