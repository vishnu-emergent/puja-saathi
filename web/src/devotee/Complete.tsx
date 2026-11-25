import { useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import type { Config, RitualResponse } from '../lib/api';
import { speak, stopSpeaking } from '../lib/voice';
import { useWide } from '../lib/useWide';


export function Complete({ config, ritualRes, embed, onHome }: { config: Config; ritualRes: RitualResponse; embed: boolean; onHome: () => void }) {
  const { ritual } = ritualRes;
  const [copied, setCopied] = useState(false);
  const wide = useWide();
  const LAMPS = wide ? 84 : 21;
  const cols = wide ? 21 : 11;

  useEffect(() => {
    if (!embed && config.flags.voice_guide.enabled && config.services.sarvam.configured) {
      const t = setTimeout(() => speak(ritual.closing, ritualRes.lang).catch(() => undefined), 900);
      return () => {
        clearTimeout(t);
        stopSpeaking();
      };
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const share = async () => {
    const text = `${ritual.closing}\n\n— Puja Saathi 🪔`;
    try {
      if (navigator.share) await navigator.share({ text });
      else {
        await navigator.clipboard.writeText(text);
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
      }
    } catch {
      /* share sheet dismissed */
    }
  };

  return (
    <div className="complete">
      <div className={wide ? 'lamps lamps--field' : 'lamps'} aria-hidden>
        {Array.from({ length: LAMPS }, (_, i) => (
          <motion.span
            key={i}
            className="lamp"
            initial={{ opacity: 0, scale: 0.4 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{
              delay: 0.2 + Math.hypot((i % cols) - (cols - 1) / 2, Math.floor(i / cols) * 1.6) * (wide ? 0.07 : 0.09),
              duration: 0.6,
              ease: [0.22, 1, 0.36, 1],
            }}
          >
            <span className="lamp__flame" style={{ animationDelay: `${(i * 137) % 900}ms` }} />
            <span className="lamp__bowl" />
          </motion.span>
        ))}
      </div>

      <motion.p className="eyebrow" initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 1.4 }}>
        {ritual.title} · complete
      </motion.p>
      <motion.h1
        className="complete__title"
        lang={ritualRes.lang}
        initial={{ opacity: 0, y: 14 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 1.6, duration: 0.8, ease: [0.22, 1, 0.36, 1] }}
      >
        {ritual.closing}
      </motion.h1>

      <motion.div className="complete__actions" initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 2.2 }}>
        {!embed && (
          <button className="btn btn--primary" onClick={share}>
            {copied ? 'Copied ✓' : 'Share the blessing'}
          </button>
        )}
        <button className="btn btn--ghost" onClick={onHome}>
          Back home
        </button>
      </motion.div>
    </div>
  );
}
