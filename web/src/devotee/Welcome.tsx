import { useEffect, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import type { City, Lang } from '../lib/api';
import { Diya } from '../components/Diya';
import { cx } from '../lib/util';
import { useWide } from '../lib/useWide';
import { Ambient } from '../components/Ambient';

const NAMES = ['पूजा साथी', 'পূজা সাথী', 'பூஜா சாத்தி', 'పూజా సాథీ', 'ಪೂಜಾ ಸಾಥಿ', 'પૂજા સાથી', 'ਪੂਜਾ ਸਾਥੀ', 'പൂജാ സാഥി', 'ପୂଜା ସାଥୀ'];

type Props = {
  cities: City[];
  languages: Lang[];
  initial: { city: string; lang: string } | null;
  onDone: (city: string, lang: string) => void;
};

export function Welcome({ cities, languages, initial, onDone }: Props) {
  const [city, setCity] = useState(initial?.city ?? '');
  const [lang, setLang] = useState(initial?.lang ?? '');
  const [nameIdx, setNameIdx] = useState(0);
  const wide = useWide();

  useEffect(() => {
    document.documentElement.dataset.theme = 'lakshmi';
    const id = setInterval(() => setNameIdx((i) => (i + 1) % NAMES.length), 2200);
    return () => clearInterval(id);
  }, []);

  const pickCity = (c: City) => {
    setCity(c.id);
    if (!lang || lang === cities.find((x) => x.id === city)?.lang) setLang(c.lang);
  };

  return (
    <div className="welcome">
      {wide && <Ambient />}
      <div className="welcome__layout">
        <div className="welcome__left">
          <div className="welcome__hero">
            <motion.div
              className="welcome__diya"
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ duration: 1.2, ease: [0.22, 1, 0.36, 1] }}
            >
              <Diya size={wide ? 300 : 168} />
            </motion.div>
            <div className="welcome__brand">
              <span className="welcome__wordmark">Puja Saathi</span>
              <span className="welcome__native">
                <AnimatePresence mode="wait">
                  <motion.span
                    key={nameIdx}
                    initial={{ opacity: 0, y: 6, filter: 'blur(4px)' }}
                    animate={{ opacity: 1, y: 0, filter: 'blur(0px)' }}
                    exit={{ opacity: 0, y: -6, filter: 'blur(4px)' }}
                    transition={{ duration: 0.45 }}
                  >
                    {NAMES[nameIdx]}
                  </motion.span>
                </AnimatePresence>
              </span>
            </div>
            <h1 className="welcome__title">
              Your puja, guided <em>in your mother tongue.</em>
            </h1>
            <p className="welcome__lede">
              Far from home this festival? Puja Saathi walks you through every step, out loud, in your language — and opens right at your city’s muhurat.
            </p>
            {wide && (
              <ul className="welcome__facts">
                <li>
                  <strong>11</strong>
                  <span>languages, spoken aloud</span>
                </li>
                <li>
                  <strong>5</strong>
                  <span>regional rituals</span>
                </li>
                <li>
                  <strong>10</strong>
                  <span>cities, each with its own muhurat</span>
                </li>
              </ul>
            )}
          </div>
        </div>

        <div className="welcome__right">
          <section className="picker" aria-labelledby="where">
            <h2 id="where" className="picker__label">
              <span>01</span> Where are you celebrating?
            </h2>
            <div className="chips chips--cities">
              {cities.map((c) => (
                <button key={c.id} className={cx('chip', 'chip--city', city === c.id && 'is-on')} onClick={() => pickCity(c)}>
                  <span className="chip__main">{c.name}</span>
                  <span className="chip__sub">{c.native}</span>
                </button>
              ))}
            </div>
          </section>

          <section className="picker" aria-labelledby="lang">
            <h2 id="lang" className="picker__label">
              <span>02</span> Which language feels like home?
            </h2>
            <div className="chips chips--langs">
              {languages.map((l) => (
                <button key={l.code} className={cx('chip', 'chip--lang', lang === l.code && 'is-on')} onClick={() => setLang(l.code)} lang={l.code}>
                  <span className="chip__native">{l.native}</span>
                  {l.code !== 'en-IN' && <span className="chip__sub">{l.name}</span>}
                </button>
              ))}
            </div>
          </section>

          <div className="welcome__cta">
            <button className="btn btn--primary btn--lg" disabled={!city || !lang} onClick={() => onDone(city, lang)}>
              Light the lamp
              <Arrow />
            </button>
            <p className="fineprint">Voice by Sarvam AI · Rituals tuned to your region</p>
          </div>
        </div>
      </div>
    </div>
  );
}

export function Arrow() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden>
      <path d="M5 12h14M13 6l6 6-6 6" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
