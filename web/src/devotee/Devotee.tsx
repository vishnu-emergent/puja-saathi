import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { api, type City, type Config, type Lang, type RitualResponse } from '../lib/api';
import { deviceId, load, save } from '../lib/util';
import { stopSpeaking } from '../lib/voice';
import { Welcome } from './Welcome';
import { Home } from './Home';
import { Session } from './Session';
import { Complete } from './Complete';
import { Ambient } from '../components/Ambient';
import { useWide } from '../lib/useWide';

type Place = { city: string; lang: string };
type Screen = 'welcome' | 'home' | 'session' | 'complete';

const params = new URLSearchParams(location.search);
const EMBED = params.get('embed') === '1';

function initialPlace(): Place | null {
  const city = params.get('city');
  const lang = params.get('lang');
  if (city) return { city, lang: lang ?? '' };
  return load<Place | null>('ps.place', null);
}

export function Devotee() {
  const [meta, setMeta] = useState<{ cities: City[]; languages: Lang[] } | null>(null);
  const [place, setPlace] = useState<Place | null>(initialPlace);
  const [screen, setScreen] = useState<Screen>(place ? 'home' : 'welcome');
  const [config, setConfig] = useState<Config | null>(null);
  const [configError, setConfigError] = useState<string | null>(null);
  const [ritualRes, setRitualRes] = useState<RitualResponse | null>(null);
  const [ritualLoading, setRitualLoading] = useState(false);
  const [ritualError, setRitualError] = useState<string | null>(null);
  const skew = useRef(0);
  const wide = useWide();
  const device = useMemo(() => (EMBED && place ? `embed-${place.city}` : deviceId()), [place]);

  useEffect(() => {
    api.meta().then(setMeta).catch(() => setConfigError('The guide is unreachable. Is the server running?'));
  }, []);

  // Poll config: flags, festival and the (possibly simulated) clock.
  useEffect(() => {
    if (!place) return;
    let alive = true;
    const tick = async () => {
      try {
        const c = await api.config({ device, city: place.city, lang: place.lang });
        if (!alive) return;
        skew.current = new Date(c.now).getTime() - Date.now();
        setConfig(c);
        setConfigError(null);
      } catch {
        if (alive) setConfigError('Reconnecting to the guide…');
      }
    };
    tick();
    const id = setInterval(tick, EMBED ? 2500 : 4000);
    return () => {
      alive = false;
      clearInterval(id);
    };
  }, [place, device]);

  const pack = config?.flags.ritual_pack.value as string | undefined;
  const lang = config?.lang;
  const inSession = screen === 'session' || screen === 'complete';

  // Load (and translate) the ritual pack Flagsmith chose — but never swap it mid-puja.
  const [retry, setRetry] = useState(0);
  const retriedAt = useRef(0);
  useEffect(() => {
    if (!pack || !lang || inSession) return;
    const same = ritualRes && ritualRes.ritual.id === pack && (ritualRes.requestedLang ?? ritualRes.lang) === lang;
    if (same) {
      const incomplete = !ritualRes.translated && ritualRes.lang !== 'en-IN';
      if (!incomplete) return;
      if (retriedAt.current === retry) {
        // Some lines fell back to English (e.g. a rate limit) — quietly fetch again shortly.
        const t = setTimeout(() => setRetry((r) => r + 1), 6000);
        return () => clearTimeout(t);
      }
    }
    retriedAt.current = retry;
    let alive = true;
    setRitualLoading(true);
    setRitualError(null);
    api
      .ritual(pack, lang)
      .then((r) => alive && setRitualRes(r))
      .catch((e: Error) => alive && setRitualError(e.message))
      .finally(() => alive && setRitualLoading(false));
    return () => {
      alive = false;
    };
  }, [pack, lang, inSession, ritualRes, retry]);

  const theme = ritualRes?.ritual.theme ?? 'lakshmi';
  useEffect(() => {
    document.documentElement.dataset.theme = theme;
  }, [theme]);
  useEffect(() => {
    document.documentElement.classList.toggle('embed', EMBED);
  }, []);

  const choose = useCallback((city: string, l: string) => {
    const p = { city, lang: l };
    setPlace(p);
    save('ps.place', p);
    setRitualRes(null);
    setConfig(null);
    setScreen('home');
  }, []);

  const now = useCallback(() => new Date(Date.now() + skew.current), []);

  if (screen === 'welcome' || !place) {
    return meta ? (
      <Welcome cities={meta.cities} languages={meta.languages} initial={place} onDone={choose} />
    ) : (
      <Boot error={configError} />
    );
  }

  return (
    <div className={wide ? 'devotee devotee--wide' : 'devotee'}>
      {wide && <Ambient density={screen === 'session' ? 0.6 : 1} />}
      <AnimatePresence mode="wait">
        {screen === 'home' && (
          <motion.div key="home" className="screen" {...fade}>
            <Home
              config={config}
              ritualRes={ritualRes}
              loading={ritualLoading || !config}
              error={ritualError ?? configError}
              languages={meta?.languages ?? []}
              now={now}
              embed={EMBED}
              onBegin={() => setScreen('session')}
              onChangePlace={() => setScreen('welcome')}
              onLanguage={(l) => choose(place.city, l)}
            />
          </motion.div>
        )}
        {screen === 'session' && config && ritualRes && (
          <motion.div key="session" className="screen" {...fade}>
            <Session
              config={config}
              ritualRes={ritualRes}
              embed={EMBED}
              onExit={(completed) => {
                stopSpeaking();
                setScreen(completed ? 'complete' : 'home');
              }}
            />
          </motion.div>
        )}
        {screen === 'complete' && config && ritualRes && (
          <motion.div key="complete" className="screen" {...fade}>
            <Complete config={config} ritualRes={ritualRes} embed={EMBED} onHome={() => setScreen('home')} />
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

const fade = {
  initial: { opacity: 0, y: 12 },
  animate: { opacity: 1, y: 0, transition: { duration: 0.5, ease: [0.22, 1, 0.36, 1] as const } },
  exit: { opacity: 0, y: -8, transition: { duration: 0.25 } },
};

function Boot({ error }: { error: string | null }) {
  return (
    <div className="boot">
      <div className="boot__spark" />
      <p>{error ?? 'Lighting the lamp…'}</p>
    </div>
  );
}
