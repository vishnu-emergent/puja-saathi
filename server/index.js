import express from 'express';
import { pbkdf2Sync, randomBytes } from 'node:crypto';
import { existsSync } from 'node:fs';
import path from 'node:path';

import { CITIES, LANGUAGES, LANGUAGE_CODES, cityById, languageByCode } from './data/places.js';
import { FESTIVALS, earliestMuhurat, festivalForCity } from './data/festivals.js';
import { RITUALS } from './data/rituals.js';
import { FEATURES, SEGMENTS } from './data/flag-spec.js';
import { askPandit, isTranslated, sarvamConfig, synthesize, transcribe, translateMany } from './sarvam.js';
import { environmentFlags, flagsConfig, identityFlags, setFeatureEnabled, closeFlags } from './flags.js';
import {
  POD,
  alertNudgeBee,
  clock,
  emit,
  liveSessions,
  metricsMiddleware,
  nudgebeeConfig,
  recentEvents,
  registry,
  broadcast,
  startRush,
  startTrafficProbe,
  stopRush,
  subscribe,
  trafficSnapshot,
  triggerPrescale,
} from './ops.js';
import { compileSchedule } from './schedule.js';

const app = express();
app.disable('x-powered-by');
app.set('trust proxy', true);
app.use(metricsMiddleware);
app.use(express.json({ limit: '64kb' }));

const asyncRoute = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);

const UI_STRINGS = {
  quiet:
    'Many devotees are praying at this very moment, so I have switched to quiet mode. Read along — your puja continues.',
  askHint: 'Tap the lamp and ask me anything — or say “next”.',
};

// ------------------------------------------------------------ health & metrics

app.get('/healthz', (_req, res) => res.json({ ok: true, pod: POD }));
app.get('/metrics', asyncRoute(async (_req, res) => {
  res.set('content-type', registry.contentType);
  res.send(await registry.metrics());
}));

// ------------------------------------------------------------ meta & config

app.get('/api/meta', (_req, res) => {
  res.json({
    cities: CITIES,
    languages: LANGUAGES,
    festivals: FESTIVALS,
    services: services(),
  });
});

function services() {
  return {
    sarvam: { configured: sarvamConfig.configured, tts: sarvamConfig.ttsModel, stt: sarvamConfig.sttModel, chat: sarvamConfig.chatModel },
    flagsmith: { configured: flagsConfig.configured, mode: flagsConfig.mode, admin: flagsConfig.adminConfigured },
    nudgebee: nudgebeeConfig,
  };
}

app.get('/api/config', asyncRoute(async (req, res) => {
  const city = cityById(String(req.query.city || '')) ?? CITIES[0];
  const lang = LANGUAGE_CODES.has(String(req.query.lang)) ? String(req.query.lang) : city.lang;
  const device = String(req.query.device || '').slice(0, 64) || 'anonymous';
  const now = clock.now();
  const festival = festivalForCity(city.id, now);

  const traits = { city: city.id, state: city.state, language: lang, festival: festival?.id ?? 'none' };
  const { flags, source } = await identityFlags(device, traits);

  res.json({
    now: now.toISOString(),
    simulatedClock: clock.simulated,
    city,
    lang,
    festival,
    traits,
    flags,
    flagsSource: source,
    services: services(),
    pod: POD,
  });
}));

// ------------------------------------------------------------ ritual packs (translated by Sarvam)

app.get('/api/ritual/:id', asyncRoute(async (req, res) => {
  const ritual = RITUALS[req.params.id];
  if (!ritual) return res.status(404).json({ error: 'Unknown ritual pack' });
  const lang = LANGUAGE_CODES.has(String(req.query.lang)) ? String(req.query.lang) : 'en-IN';

  const strings = [
    ritual.title,
    ritual.festival,
    ritual.intro,
    ritual.closing,
    UI_STRINGS.quiet,
    UI_STRINGS.askHint,
    ...ritual.samagri,
    ...ritual.steps.flatMap((s) => [s.title, s.text, s.meaning]),
  ];

  if (!sarvamConfig.configured && lang !== 'en-IN') {
    return res.json({ lang: 'en-IN', requestedLang: lang, translated: false, ritual, ui: UI_STRINGS, english: ritual });
  }

  let lastError = null;
  const { texts, failures } = await translateMany(strings, lang, { onError: (e) => (lastError = e) });
  if (failures) emit('sarvam', `Translation partially failed (${failures}/${strings.length})`, lastError?.message ?? '', 'warn');

  let i = 0;
  const next = () => texts[i++];
  const out = {
    ...ritual,
    title: next(),
    festival: next(),
    intro: next(),
    closing: next(),
  };
  const ui = { quiet: next(), askHint: next() };
  out.samagri = ritual.samagri.map(() => next());
  out.steps = ritual.steps.map((s) => ({ ...s, title: next(), text: next(), meaning: next() }));

  res.json({ lang, translated: failures === 0, ritual: out, ui, english: ritual });
}));

app.get('/api/ritual/:id/status', (req, res) => {
  const ritual = RITUALS[req.params.id];
  const lang = String(req.query.lang);
  if (!ritual) return res.status(404).json({ error: 'Unknown ritual pack' });
  res.json({ cached: isTranslated(ritual.intro, lang) && isTranslated(ritual.closing, lang) });
});

// ------------------------------------------------------------ voice (Sarvam), guarded by Flagsmith

async function voiceAllowed() {
  const { flags } = await environmentFlags();
  return flags.voice_guide?.enabled !== false;
}

app.post('/api/tts', asyncRoute(async (req, res) => {
  const { text, lang } = req.body ?? {};
  if (typeof text !== 'string' || !text.trim()) return res.status(400).json({ error: 'text is required' });
  if (!LANGUAGE_CODES.has(lang)) return res.status(400).json({ error: 'unsupported language' });
  if (!(await voiceAllowed())) return res.status(503).json({ error: 'Voice is paused (Flagsmith voice_guide is off).', quiet: true });
  const audio = await synthesize(text, lang);
  res.set({ 'content-type': 'audio/wav', 'cache-control': 'private, max-age=86400' });
  res.send(audio);
}));

app.post(
  '/api/stt',
  express.raw({ type: ['audio/*', 'application/octet-stream'], limit: '4mb' }),
  asyncRoute(async (req, res) => {
    const lang = LANGUAGE_CODES.has(String(req.query.lang)) ? String(req.query.lang) : 'unknown';
    if (!Buffer.isBuffer(req.body) || req.body.length < 1000) return res.status(400).json({ error: 'No audio received' });
    if (!(await voiceAllowed())) return res.status(503).json({ error: 'Voice is paused (Flagsmith voice_guide is off).', quiet: true });
    res.json(await transcribe(req.body, lang));
  }),
);

app.post('/api/ask', asyncRoute(async (req, res) => {
  const { utterance, lang, ritualId, stepIndex, city } = req.body ?? {};
  const ritual = RITUALS[ritualId];
  if (!ritual) return res.status(400).json({ error: 'Unknown ritual pack' });
  if (typeof utterance !== 'string' || !utterance.trim()) return res.status(400).json({ error: 'utterance is required' });
  const idx = Math.max(0, Math.min(ritual.steps.length - 1, Number(stepIndex) || 0));
  const { flags } = await environmentFlags();
  if (flags.ai_pandit?.enabled === false) return res.status(503).json({ error: 'The AI pandit is switched off (Flagsmith ai_pandit).', off: true });
  const result = await askPandit({
    utterance: utterance.slice(0, 500),
    lang: LANGUAGE_CODES.has(lang) ? lang : 'en-IN',
    ritual,
    stepIndex: idx,
    city: cityById(city)?.name ?? 'India',
  });
  res.json(result);
}));

// ------------------------------------------------------------ sessions & A/B tracking

const SALT = randomBytes(16);
const SESSION_COST = Number(process.env.SESSION_COST_ITERATIONS || 160_000);
app.post('/api/session/prepare', asyncRoute(async (req, res) => {
  // The per-devotee cost of preparing a guided session. Voice sessions are
  // heavier (audio pipeline); in quiet mode the work drops sharply — which is
  // exactly why NudgeBee flips `voice_guide` off during a rush.
  const voice = await voiceAllowed();
  const started = performance.now();
  pbkdf2Sync(String(Math.random()), SALT, voice ? SESSION_COST : Math.round(SESSION_COST / 10), 32, 'sha256');
  res.set('x-pod', POD);
  res.json({ pod: POD, mode: voice ? 'voice' : 'quiet', ms: Math.round(performance.now() - started) });
}));

const experiment = { steps: { started: 0, completed: 0 }, story: { started: 0, completed: 0 } };
app.post('/api/session/event', (req, res) => {
  const { type, variant, ritualId, city, lang } = req.body ?? {};
  const v = experiment[variant] ? variant : 'steps';
  if (type === 'start') {
    experiment[v].started++;
    liveSessions.inc();
    emit('app', 'Puja started', `${RITUALS[ritualId]?.title ?? ritualId} · ${cityById(city)?.name ?? city} · ${languageByCode(lang)?.name ?? lang} · variant "${v}"`);
  } else if (type === 'complete') {
    experiment[v].completed++;
    liveSessions.dec();
    emit('app', 'Puja completed 🪔', `${RITUALS[ritualId]?.title ?? ritualId} · ${cityById(city)?.name ?? city} · variant "${v}"`);
  } else if (type === 'abandon') {
    liveSessions.dec();
  } else {
    return res.status(400).json({ error: 'unknown event type' });
  }
  broadcast('experiment', experiment);
  res.json({ ok: true });
});

// ------------------------------------------------------------ control room

app.get('/api/ops/stream', subscribe);

app.get('/api/ops/state', asyncRoute(async (_req, res) => {
  const env = await environmentFlags();
  const now = clock.now();
  res.json({
    now: now.toISOString(),
    simulatedClock: clock.simulated,
    pod: POD,
    services: services(),
    flags: env.flags,
    flagsSource: env.source,
    features: FEATURES.map((f) => ({ name: f.name, description: f.description })),
    segments: SEGMENTS.map((s) => ({
      name: s.name,
      description: s.description,
      rule: s.conditions.map((c) => (c.operator === 'PERCENTAGE_SPLIT' ? `${c.value}% of identities` : `${c.property} = ${c.value}`)).join(' AND '),
      overrides: s.overrides.map((o) => `${o.feature} → ${o.value.value}`),
    })),
    events: recentEvents(),
    traffic: trafficSnapshot(),
    experiment,
    cities: CITIES.map((c) => ({ ...c, festival: festivalForCity(c.id, now) })),
  });
}));

app.get('/api/ops/schedule', asyncRoute(async (_req, res) => {
  const env = await environmentFlags();
  const lead = Number(env.flags.pre_muhurat_minutes?.value) || 20;
  res.json({ leadMinutes: lead, rows: compileSchedule(lead) });
}));

app.post('/api/ops/clock', (req, res) => {
  const { festival, iso, reset, leadMinutes = 25 } = req.body ?? {};
  if (reset) {
    clock.reset();
    emit('app', 'Clock reset to real time');
  } else if (festival) {
    const f = FESTIVALS.find((x) => x.id === festival);
    if (!f) return res.status(400).json({ error: 'unknown festival' });
    clock.set(new Date(earliestMuhurat(f).getTime() - Number(leadMinutes) * 60_000));
    emit('app', `Time travel → ${f.name}`, `${leadMinutes} minutes before the first muhurat (${f.date})`);
  } else if (iso) {
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return res.status(400).json({ error: 'invalid date' });
    clock.set(d);
    emit('app', 'Clock moved', d.toISOString());
  }
  const now = clock.now();
  broadcast('clock', { now: now.toISOString(), simulatedClock: clock.simulated });
  res.json({ now: now.toISOString(), simulatedClock: clock.simulated });
});

app.post('/api/ops/rush', (req, res) => {
  const { action = 'start', seconds, concurrency, city } = req.body ?? {};
  if (action === 'stop') {
    stopRush();
    return res.json({ stopped: true });
  }
  res.json(
    startRush({
      seconds: Math.min(180, Math.max(10, Number(seconds) || 45)),
      concurrency: Math.min(200, Math.max(4, Number(concurrency) || 48)),
      city: cityById(city)?.name ?? null,
    }),
  );
});

app.post('/api/ops/flag', asyncRoute(async (req, res) => {
  const { name, enabled } = req.body ?? {};
  if (typeof enabled !== 'boolean') return res.status(400).json({ error: 'enabled must be boolean' });
  try {
    const out = await setFeatureEnabled(name, enabled);
    emit('flagsmith', `${name} → ${enabled ? 'ON' : 'OFF'}`, `Changed from the control room (${out.source}).`);
    res.json(out);
  } catch (err) {
    emit('flagsmith', `Could not change ${name}`, err.message, 'error');
    res.status(502).json({ error: err.message });
  }
}));

app.post('/api/ops/incident', asyncRoute(async (_req, res) => {
  const t = trafficSnapshot();
  res.json(
    await alertNudgeBee(
      {
        alert: 'MuhuratRush',
        severity: 'high',
        app: 'puja-saathi',
        namespace: process.env.POD_NAMESPACE || 'puja-saathi',
        deployment: 'puja-saathi',
        p95_ms: t?.p95 ?? 0,
        rps: t?.rps ?? 0,
        pods_answering: t?.pods?.length ?? 0,
        manual: true,
        at: new Date().toISOString(),
      },
      { force: true },
    ),
  );
}));

app.post('/api/ops/prescale', asyncRoute(async (req, res) => {
  const { festival, city, replicas } = req.body ?? {};
  try {
    await triggerPrescale({ festival, city, replicas: Number(replicas) || 6, deployment: 'puja-saathi' });
    res.json({ ok: true });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
}));

// NudgeBee workflows report progress here (HTTP request task). Protected by OPS_TOKEN when set.
app.post('/api/ops/events', (req, res) => {
  const token = process.env.OPS_TOKEN;
  const given = req.get('authorization')?.replace(/^Bearer\s+/i, '') || req.query.token;
  if (token && given !== token) return res.status(401).json({ error: 'unauthorized' });
  const { title, detail = '', level = 'info', source = 'nudgebee', stage = null } = req.body ?? {};
  if (typeof title !== 'string' || !title.trim()) return res.status(400).json({ error: 'title is required' });
  const safeLevel = ['info', 'warn', 'error', 'success'].includes(level) ? level : 'info';
  const safeStage = ['detected', 'triggered', 'approval', 'approved', 'scaled', 'degraded', 'resolved'].includes(stage) ? stage : null;
  res.json(emit(String(source).slice(0, 24), title.slice(0, 160), String(detail).slice(0, 600), safeLevel, safeStage));
});

// ------------------------------------------------------------ flag watcher → control room

let lastEnvFlags = null;
setInterval(async () => {
  const { flags, source } = await environmentFlags();
  const snapshot = JSON.stringify(flags);
  if (lastEnvFlags && snapshot !== lastEnvFlags) {
    const before = JSON.parse(lastEnvFlags);
    for (const name of Object.keys(flags)) {
      if (before[name]?.enabled !== flags[name].enabled) {
        emit('flagsmith', `${name} is now ${flags[name].enabled ? 'ON' : 'OFF'}`, `Observed in Flagsmith (${source}).`, flags[name].enabled ? 'success' : 'warn');
      }
    }
  }
  lastEnvFlags = snapshot;
  broadcast('flags', { flags, source });
}, 3000).unref();

// ------------------------------------------------------------ static web app

const dist = path.resolve('dist');
if (existsSync(dist)) {
  app.use(express.static(dist, { index: false, maxAge: '1h' }));
  app.get(/^\/(?!api\/).*/, (_req, res) => res.sendFile(path.join(dist, 'index.html')));
}

app.use((err, _req, res, _next) => {
  const status = err.status && err.status >= 400 ? err.status : 500;
  if (status >= 500) console.error('[error]', err.message);
  res.status(status).json({ error: err.message || 'Something went wrong' });
});

const port = Number(process.env.PORT || 8787);
const server = app.listen(port, () => {
  console.log(`🪔 Puja Saathi on http://localhost:${port} (pod ${POD})`);
  console.log(`   Sarvam: ${sarvamConfig.configured ? 'on' : 'OFF'} · Flagsmith: ${flagsConfig.mode} · NudgeBee webhook: ${nudgebeeConfig.configured ? 'on' : 'off'}`);
  emit('app', 'Guide online', `Pod ${POD} is serving devotees.`, 'success');
  startTrafficProbe();
});

for (const sig of ['SIGINT', 'SIGTERM']) {
  process.on(sig, () => {
    closeFlags();
    server.close(() => process.exit(0));
    setTimeout(() => process.exit(0), 3000).unref();
  });
}
