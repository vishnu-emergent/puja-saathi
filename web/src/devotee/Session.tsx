import { useCallback, useEffect, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { api, ApiError, type Config, type RitualResponse } from '../lib/api';
import { Diya, type DiyaState } from '../components/Diya';
import { KolamProgress } from '../components/Kolam';
import { prefetchSpeech, quickIntent, Recorder, speak, stopSpeaking } from '../lib/voice';
import { cx } from '../lib/util';

type Bubble = { who: 'you' | 'saathi' | 'note'; text: string; lang?: string } | null;

type Props = {
  config: Config;
  ritualRes: RitualResponse;
  embed: boolean;
  onExit: (completed: boolean) => void;
};

export function Session({ config, ritualRes, embed, onExit }: Props) {
  const { ritual, ui } = ritualRes;
  const textLang = ritualRes.lang; // language the text is actually in
  const [index, setIndex] = useState(-1); // -1 = intro
  const [phase, setPhase] = useState<DiyaState>('idle');
  const [level, setLevel] = useState(0);
  const [bubble, setBubble] = useState<Bubble>(null);
  const [typing, setTyping] = useState(false);
  const [draft, setDraft] = useState('');
  const [quietForced, setQuietForced] = useState(false);
  const recorder = useRef<Recorder | null>(null);
  const indexRef = useRef(index);
  indexRef.current = index;

  const voiceAvailable = config.services.sarvam.configured && !embed;
  const quiet = !config.flags.voice_guide.enabled || quietForced;
  const voiceOn = voiceAvailable && !quiet;
  const story = config.flags.guide_style.value === 'story';
  const panditOn = config.flags.ai_pandit.enabled && config.services.sarvam.configured;
  const variant = story ? 'story' : 'steps';
  const total = ritual.steps.length;
  const step = index >= 0 ? ritual.steps[index] : null;

  // ---------------------------------------------------------------- analytics for the A/B test
  const finished = useRef(false);
  const leaving = useRef(false);
  const leave = useCallback(() => {
    if (leaving.current || finished.current) return;
    leaving.current = true;
    onExit(false);
  }, [onExit]);
  useEffect(() => {
    api.sessionEvent({ type: 'start', variant, ritualId: ritual.id, city: config.city.id, lang: config.lang });
    return () => {
      if (!finished.current) api.sessionEvent({ type: 'abandon', variant, ritualId: ritual.id, city: config.city.id, lang: config.lang });
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ---------------------------------------------------------------- speaking
  const sayToken = useRef(0);
  const say = useCallback(
    async (text: string) => {
      if (!voiceOn) return;
      const mine = ++sayToken.current;
      try {
        setPhase('speaking');
        await speak(text, textLang);
      } catch (e) {
        if (e instanceof ApiError && e.body.quiet) setQuietForced(true);
      } finally {
        // Only the most recent utterance may return the lamp to idle.
        if (sayToken.current === mine) setPhase((p) => (p === 'speaking' ? 'idle' : p));
      }
    },
    [voiceOn, textLang],
  );

  const stepSpeech = (i: number) => (i < 0 ? ritual.intro : `${ritual.steps[i].title}. ${ritual.steps[i].text}`);

  // Speak each step as it arrives; warm the next one.
  useEffect(() => {
    setBubble(null);
    if (!voiceOn) return;
    say(stepSpeech(index));
    if (index + 1 < total) prefetchSpeech(stepSpeech(index + 1), textLang);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [index, voiceOn]);

  // Flagsmith turned voice off mid-puja: stop talking, stop listening, keep going.
  useEffect(() => {
    if (!quiet) return;
    stopSpeaking();
    recorder.current?.cancel();
    recorder.current = null;
    setPhase('idle');
  }, [quiet]);

  useEffect(() => () => {
    stopSpeaking();
    recorder.current?.cancel();
  }, []);

  // ---------------------------------------------------------------- navigation
  const go = useCallback(
    (to: number) => {
      if (finished.current || leaving.current) return;
      stopSpeaking();
      if (to >= total) {
        finished.current = true;
        api.sessionEvent({ type: 'complete', variant, ritualId: ritual.id, city: config.city.id, lang: config.lang });
        onExit(true);
        return;
      }
      setIndex(Math.max(-1, to));
    },
    [total, variant, ritual.id, config.city.id, config.lang, onExit],
  );

  const act = useCallback(
    (intent: 'next' | 'back' | 'repeat') => {
      const i = indexRef.current;
      if (intent === 'next') go(i + 1);
      else if (intent === 'back') go(i - 1);
      else {
        setBubble(null);
        say(stepSpeech(i));
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [go, say],
  );

  // ---------------------------------------------------------------- understanding the devotee
  const handleUtterance = useCallback(
    async (utterance: string) => {
      const text = utterance.trim();
      if (!text) {
        setBubble({ who: 'note', text: 'I didn’t catch that — tap the lamp and try again.' });
        setPhase('idle');
        return;
      }
      setBubble({ who: 'you', text });
      const quick = quickIntent(text);
      if (quick) {
        setPhase('idle');
        act(quick);
        return;
      }
      if (!panditOn) {
        setPhase('idle');
        setBubble({ who: 'note', text: 'Questions are paused right now. Say “next”, “back” or “repeat”.' });
        return;
      }
      setPhase('thinking');
      try {
        const res = await api.ask({ utterance: text, lang: textLang, ritualId: ritual.id, stepIndex: Math.max(0, indexRef.current), city: config.city.id });
        if (res.intent !== 'answer') {
          setPhase('idle');
          act(res.intent);
          return;
        }
        setBubble({ who: 'saathi', text: res.reply, lang: textLang });
        setPhase('idle');
        if (res.reply) say(res.reply);
      } catch (e) {
        setPhase('idle');
        setBubble({ who: 'note', text: e instanceof ApiError && e.body.off ? 'Questions are paused right now.' : 'I couldn’t reach the pandit just now. Please try again.' });
      }
    },
    [act, panditOn, textLang, ritual.id, config.city.id, say],
  );

  const stopListening = useCallback(async () => {
    const rec = recorder.current;
    if (!rec) return;
    recorder.current = null;
    setPhase('thinking');
    try {
      const wav = await rec.stop();
      if (wav.byteLength < 16000 * 2 * 0.3) {
        setPhase('idle');
        setBubble({ who: 'note', text: 'That was very short — hold on a moment longer.' });
        return;
      }
      const { transcript } = await api.stt(wav, config.lang);
      await handleUtterance(transcript);
    } catch (e) {
      setPhase('idle');
      if (e instanceof ApiError && e.body.quiet) setQuietForced(true);
      else setBubble({ who: 'note', text: 'I couldn’t hear that clearly. Try again, or type instead.' });
    }
  }, [config.lang, handleUtterance]);

  const startListening = useCallback(async () => {
    if (!voiceOn) return;
    stopSpeaking();
    setBubble(null);
    const rec = new Recorder(setLevel);
    recorder.current = rec;
    try {
      await rec.start(() => stopListening());
      setPhase('listening');
    } catch {
      recorder.current = null;
      setPhase('idle');
      setTyping(true);
      setBubble({ who: 'note', text: 'Microphone is blocked — you can type your question instead.' });
    }
  }, [voiceOn, stopListening]);

  const onLamp = () => {
    if (phase === 'listening') stopListening();
    else if (phase === 'speaking') {
      stopSpeaking();
      setPhase('idle');
    } else if (phase === 'idle') startListening();
  };

  // ---------------------------------------------------------------- keyboard
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (finished.current || leaving.current) return;
      const tag = (e.target as HTMLElement)?.tagName;
      if (tag === 'INPUT' || (e.key === ' ' && tag === 'BUTTON')) return;
      if (e.key === 'ArrowRight') act('next');
      else if (e.key === 'ArrowLeft') act('back');
      else if (e.key === ' ' && voiceOn) {
        e.preventDefault();
        onLamp();
      } else if (e.key === 'Escape') leave();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  const submitTyped = (e: React.FormEvent) => {
    e.preventDefault();
    const q = draft.trim();
    if (!q) return;
    setDraft('');
    handleUtterance(q);
  };

  const status =
    phase === 'listening'
      ? 'Listening… tap the lamp when you’re done'
      : phase === 'thinking'
        ? 'Understanding…'
        : phase === 'speaking'
          ? 'Speaking — tap the lamp to interrupt'
          : voiceOn
            ? ui.askHint
            : quiet
              ? 'Voice is resting. Use the arrows, or type a question.'
              : 'Use the arrows to move through the puja.';

  return (
    <div className={cx('session', quiet && 'is-quiet')}>
      <header className="session__top">
        <button className="icon-btn" onClick={leave} aria-label="Leave the puja">
          <svg width="18" height="18" viewBox="0 0 24 24" aria-hidden>
            <path d="M6 6l12 12M18 6L6 18" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
          </svg>
        </button>
        <div className="session__title">
          <span lang={textLang}>{ritual.title}</span>
          <small>{index < 0 ? 'Before we begin' : `Step ${index + 1} of ${total}`}</small>
        </div>
        <span className="icon-btn icon-btn--ghost" aria-hidden />
      </header>

      <div className="session__progress">
        <KolamProgress total={total} current={Math.max(0, index)} />
      </div>

      <AnimatePresence>
        {quiet && voiceAvailable && (
          <motion.div className="quiet-banner" initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }} lang={textLang}>
            <span className="quiet-banner__icon" aria-hidden>
              ☾
            </span>
            {ui.quiet}
          </motion.div>
        )}
      </AnimatePresence>

      <main className="session__stage">
        <AnimatePresence mode="wait">
          <motion.article
            key={index}
            className="step"
            initial={{ opacity: 0, y: 18, filter: 'blur(6px)' }}
            animate={{ opacity: 1, y: 0, filter: 'blur(0px)' }}
            exit={{ opacity: 0, y: -12, filter: 'blur(4px)' }}
            transition={{ duration: 0.55, ease: [0.22, 1, 0.36, 1] }}
          >
            {step ? (
              <>
                <p className="step__num">{String(index + 1).padStart(2, '0')}</p>
                <h2 className="step__title" lang={textLang}>
                  {step.title}
                </h2>
                <p className="step__text" lang={textLang}>
                  {step.text}
                </p>
                {step.mantra && <Mantra mantra={step.mantra} voiceOn={voiceOn} />}
                {story && (
                  <aside className="story">
                    <span className="story__label">✦ Why we do this</span>
                    <p lang={textLang}>{step.meaning}</p>
                  </aside>
                )}
              </>
            ) : (
              <>
                <p className="step__num">ॐ</p>
                <h2 className="step__title" lang={textLang}>
                  {ritual.festival}
                </h2>
                <p className="step__text" lang={textLang}>
                  {ritual.intro}
                </p>
              </>
            )}
          </motion.article>
        </AnimatePresence>
      </main>

      <footer className="dock">
        <AnimatePresence mode="wait">
          {bubble && (
            <motion.div
              key={bubble.text}
              className={cx('bubble', `bubble--${bubble.who}`)}
              initial={{ opacity: 0, y: 8, scale: 0.98 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 4 }}
              lang={bubble.lang}
            >
              {bubble.who === 'you' && <span className="bubble__who">You</span>}
              {bubble.who === 'saathi' && <span className="bubble__who">Saathi</span>}
              {bubble.text}
            </motion.div>
          )}
        </AnimatePresence>

        <div className="dock__row">
          <button className="nav-btn" onClick={() => act('back')} disabled={index < 0} aria-label="Previous step">
            <svg width="22" height="22" viewBox="0 0 24 24" aria-hidden>
              <path d="M15 5l-7 7 7 7" stroke="currentColor" strokeWidth="1.8" fill="none" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </button>

          <button
            className={cx('lamp-btn', `lamp-btn--${phase}`, !voiceOn && 'is-disabled')}
            onClick={onLamp}
            disabled={!voiceOn || phase === 'thinking'}
            aria-label={phase === 'listening' ? 'Stop listening' : 'Speak to Puja Saathi'}
          >
            <Diya size={112} state={voiceOn ? phase : quiet ? 'off' : 'idle'} level={level} />
            {phase === 'listening' && <span className="lamp-btn__ring" style={{ transform: `scale(${1 + level * 0.35})` }} />}
          </button>

          <button className="nav-btn nav-btn--next" onClick={() => act('next')} aria-label={index === total - 1 ? 'Finish' : 'Next step'}>
            {index === total - 1 ? (
              <span className="nav-btn__label">Finish</span>
            ) : (
              <svg width="22" height="22" viewBox="0 0 24 24" aria-hidden>
                <path d="M9 5l7 7-7 7" stroke="currentColor" strokeWidth="1.8" fill="none" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            )}
          </button>
        </div>

        <p className="dock__status" lang={phase === 'idle' && voiceOn ? textLang : undefined}>
          {status}
        </p>

        {(typing || !voiceOn) && !embed ? (
          <form className="ask" onSubmit={submitTyped}>
            <input
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              placeholder={panditOn ? 'Ask anything — “I don’t have marigolds…”' : 'Type next, back or repeat'}
              aria-label="Type a question"
            />
            <button className="btn btn--small" disabled={!draft.trim() || phase === 'thinking'}>
              Ask
            </button>
          </form>
        ) : (
          !embed && (
            <button className="linkish" onClick={() => setTyping(true)}>
              Prefer typing?
            </button>
          )
        )}
      </footer>
    </div>
  );
}

function Mantra({ mantra, voiceOn }: { mantra: { deva: string; roman: string }; voiceOn: boolean }) {
  const [playing, setPlaying] = useState(false);
  const play = async () => {
    setPlaying(true);
    try {
      await speak(mantra.deva, 'hi-IN');
    } catch {
      /* voice may be paused */
    } finally {
      setPlaying(false);
    }
  };
  return (
    <div className="mantra">
      <p className="mantra__deva" lang="sa">
        {mantra.deva}
      </p>
      <p className="mantra__roman">{mantra.roman}</p>
      {voiceOn && (
        <button className="mantra__play" onClick={play} disabled={playing}>
          {playing ? 'Chanting…' : '▸ Hear the mantra'}
        </button>
      )}
    </div>
  );
}
