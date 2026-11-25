import { useEffect, useMemo, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { api, type City, type Config, type FestivalDef, type Lang } from '../lib/api';
import { cx, fmtDate } from '../lib/util';
import { Diya } from '../components/Diya';
import { TrafficChart } from './TrafficChart';
import { useOps, type OpsEvent, type OpsState, type Traffic } from './useOps';

type Meta = { cities: City[]; languages: Lang[]; festivals: FestivalDef[] };
type ScheduleRow = {
  festival: string;
  festivalName: string;
  city: string;
  cityName: string;
  muhurat: string;
  muhuratLocal: string;
  scaleUpAt: string;
  scaleUpUtc: string;
  scaleUpCron: string;
  replicas: number;
};

const fmtClock = (iso: string) =>
  new Intl.DateTimeFormat('en-IN', { day: 'numeric', month: 'short', year: 'numeric', hour: 'numeric', minute: '2-digit', second: '2-digit', timeZone: 'Asia/Kolkata' }).format(new Date(iso));
const fmtHms = (iso: string) =>
  new Intl.DateTimeFormat('en-IN', { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false, timeZone: 'Asia/Kolkata' }).format(new Date(iso));

const DEFAULT_PHONES = [
  { city: 'kolkata', lang: 'bn-IN' },
  { city: 'delhi', lang: 'hi-IN' },
  { city: 'chennai', lang: 'ta-IN' },
];

export function ControlRoom() {
  const { state, history, connected, clock } = useOps();
  const [meta, setMeta] = useState<Meta | null>(null);
  const [phones, setPhones] = useState(DEFAULT_PHONES);
  const [evals, setEvals] = useState<Record<string, Config>>({});
  const [now, setNow] = useState(() => Date.now());
  const [toast, setToast] = useState<string | null>(null);

  useEffect(() => {
    document.documentElement.dataset.theme = 'ops';
    document.title = 'Muhurat Control · Puja Saathi';
    api.meta().then(setMeta).catch(() => undefined);
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);

  // What Flagsmith decided for each phone's identity.
  useEffect(() => {
    let alive = true;
    const poll = async () => {
      const entries = await Promise.all(
        phones.map((p) =>
          api
            .config({ device: `embed-${p.city}`, city: p.city, lang: p.lang })
            .then((c) => [p.city, c] as const)
            .catch(() => null),
        ),
      );
      if (alive) setEvals(Object.fromEntries(entries.filter(Boolean) as [string, Config][]));
    };
    poll();
    const id = setInterval(poll, 2500);
    return () => {
      alive = false;
      clearInterval(id);
    };
  }, [phones]);

  const flash = (msg: string) => {
    setToast(msg);
    setTimeout(() => setToast(null), 3200);
  };

  const clockNow = clock ? new Date(now + clock.skew).toISOString() : null;

  if (!state || !meta) {
    return (
      <div className="ops ops--loading">
        <Diya size={72} state="thinking" />
        <p>Connecting to the guide…</p>
      </div>
    );
  }

  return (
    <div className="ops">
      <header className="ops__bar">
        <div className="ops__brand">
          <Diya size={30} />
          <div>
            <strong>Muhurat Control</strong>
            <span>Puja Saathi operations</span>
          </div>
        </div>
        <div className={cx('ops__clock', clock?.simulated && 'is-sim')}>
          <span className="ops__clock-label">{clock?.simulated ? 'Simulated time' : 'Live time'} · IST</span>
          <span className="ops__clock-value">{clockNow ? fmtClock(clockNow) : '—'}</span>
          {clock?.simulated && (
            <button className="linkish" onClick={() => api.post('/api/ops/clock', { reset: true })}>
              back to now
            </button>
          )}
        </div>
        <ServicePills state={state} connected={connected} />
      </header>

      <Timeline festivals={meta.festivals} nowIso={clockNow} onTravel={(id) => api.post('/api/ops/clock', { festival: id }).then(() => flash('Time travelled — watch the phones re-segment'))} />

      <div className="ops__grid ops__grid--top">
        <section className="panel panel--phones">
          <PanelHead kicker="Devotees" title="Same app, different India" note="Each phone is a real identity evaluated by Flagsmith with its city, state, language and festival traits." />
          <div className="phones">
            {phones.map((p, i) => (
              <Phone
                key={i}
                phone={p}
                meta={meta}
                evalCfg={evals[p.city]}
                onChange={(next) => setPhones((ps) => ps.map((x, j) => (j === i ? next : x)))}
              />
            ))}
          </div>
        </section>

        <FlagsmithPanel state={state} evals={evals} phones={phones} meta={meta} onError={flash} />
      </div>

      <div className="ops__grid ops__grid--mid">
        <RushPanel state={state} history={history} meta={meta} onToast={flash} />
        <EventFeed events={state.events} />
      </div>

      <div className="ops__grid ops__grid--bottom">
        <SchedulePanel state={state} nowIso={clockNow} onToast={flash} />
        <ExperimentPanel state={state} />
      </div>

      <AnimatePresence>
        {toast && (
          <motion.div className="toast" initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 16 }}>
            {toast}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

// ------------------------------------------------------------------ header pills

function ServicePills({ state, connected }: { state: OpsState; connected: boolean }) {
  const s = state.services;
  const pills = [
    { name: 'Sarvam AI', on: s.sarvam.configured, detail: s.sarvam.configured ? `${s.sarvam.stt} · ${s.sarvam.tts}` : 'no API key', cls: 'sarvam' },
    { name: 'Flagsmith', on: s.flagsmith.configured && state.flagsSource === 'flagsmith', detail: s.flagsmith.configured ? s.flagsmith.mode : 'offline mirror', cls: 'flagsmith' },
    { name: 'NudgeBee', on: s.nudgebee.configured, detail: s.nudgebee.configured ? 'workflow webhook' : 'webhook not set', cls: 'nudgebee' },
  ];
  return (
    <div className="pills">
      {pills.map((p) => (
        <span key={p.name} className={cx('pill', `pill--${p.cls}`, p.on ? 'is-on' : 'is-off')} title={p.detail}>
          <i />
          {p.name}
          <small>{p.detail}</small>
        </span>
      ))}
      <span className={cx('pill', 'pill--live', connected ? 'is-on' : 'is-off')}>
        <i />
        {connected ? 'Live' : 'Reconnecting'}
      </span>
    </div>
  );
}

function PanelHead({ kicker, title, note, right }: { kicker: string; title: string; note?: string; right?: React.ReactNode }) {
  return (
    <div className="panel__head">
      <div>
        <p className="panel__kicker">{kicker}</p>
        <h2 className="panel__title">{title}</h2>
        {note && <p className="panel__note">{note}</p>}
      </div>
      {right}
    </div>
  );
}

// ------------------------------------------------------------------ timeline

const RANGE_START = new Date('2026-11-01T00:00:00+05:30').getTime();
const RANGE_END = new Date('2027-01-22T00:00:00+05:30').getTime();
const pos = (t: number) => Math.min(100, Math.max(0, ((t - RANGE_START) / (RANGE_END - RANGE_START)) * 100));

function Timeline({ festivals, nowIso, onTravel }: { festivals: FestivalDef[]; nowIso: string | null; onTravel: (id: string) => void }) {
  const nowT = nowIso ? new Date(nowIso).getTime() : null;
  const inRange = nowT != null && nowT >= RANGE_START && nowT <= RANGE_END;
  const months = ['2026-11-01', '2026-12-01', '2027-01-01'];
  return (
    <section className="timeline panel">
      <div className="timeline__head">
        <div>
          <p className="panel__kicker">Festive calendar · panchang</p>
          <h2 className="panel__title">India’s traffic follows the panchang, not the clock.</h2>
        </div>
        <p className="panel__note">Click a festival to travel to 25 minutes before its first muhurat.</p>
      </div>
      <div className="timeline__track">
        <div className="timeline__rail" />
        {months.map((m) => (
          <span key={m} className="timeline__month" style={{ left: `${pos(new Date(`${m}T00:00:00+05:30`).getTime())}%` }}>
            {new Intl.DateTimeFormat('en-IN', { month: 'short' }).format(new Date(m))}
          </span>
        ))}
        {festivals.map((f, i) => {
          const t = new Date(`${f.date}T12:00:00+05:30`).getTime();
          const active = nowT != null && Math.abs(nowT - t) < 36 * 3600 * 1000;
          const prev = festivals[i - 1];
          const crowded = prev && pos(t) - pos(new Date(`${prev.date}T12:00:00+05:30`).getTime()) < 9;
          return (
            <button key={f.id} className={cx('fest', active && 'is-active', crowded && 'is-up')} style={{ left: `${pos(t)}%` }} onClick={() => onTravel(f.id)}>
              <span className="fest__dot" />
              <span className="fest__name">{f.name}</span>
              <span className="fest__meta">
                {fmtDate(`${f.date}T12:00:00+05:30`)} · {Object.keys(f.muhurat).length} {Object.keys(f.muhurat).length === 1 ? 'city' : 'cities'}
              </span>
            </button>
          );
        })}
        {inRange && <motion.span className="timeline__needle" animate={{ left: `${pos(nowT!)}%` }} transition={{ type: 'spring', stiffness: 60, damping: 18 }} />}
      </div>
    </section>
  );
}

// ------------------------------------------------------------------ phones

function Phone({
  phone,
  meta,
  evalCfg,
  onChange,
}: {
  phone: { city: string; lang: string };
  meta: Meta;
  evalCfg?: Config;
  onChange: (p: { city: string; lang: string }) => void;
}) {
  const src = `/?embed=1&city=${phone.city}&lang=${phone.lang}`;
  const pack = evalCfg?.flags.ritual_pack.value;
  return (
    <div className="phone">
      <div className="phone__controls">
        <select
          value={phone.city}
          onChange={(e) => {
            const c = meta.cities.find((x) => x.id === e.target.value)!;
            onChange({ city: c.id, lang: c.lang });
          }}
          aria-label="City"
        >
          {meta.cities.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </select>
        <select value={phone.lang} onChange={(e) => onChange({ ...phone, lang: e.target.value })} aria-label="Language">
          {meta.languages.map((l) => (
            <option key={l.code} value={l.code}>
              {l.native}
            </option>
          ))}
        </select>
      </div>
      <div className="phone__frame">
        <div className="phone__notch" />
        <iframe key={src} src={src} title={`Puja Saathi in ${phone.city}`} />
      </div>
      <div className="phone__eval">
        {evalCfg ? (
          <>
            <code>
              {evalCfg.city.state} · {evalCfg.traits.festival}
            </code>
            <span className="arrow">→</span>
            <code className="is-value">{String(pack)}</code>
          </>
        ) : (
          <span className="muted">evaluating…</span>
        )}
      </div>
    </div>
  );
}

// ------------------------------------------------------------------ Flagsmith

function FlagsmithPanel({
  state,
  evals,
  phones,
  meta,
  onError,
}: {
  state: OpsState;
  evals: Record<string, Config>;
  phones: { city: string; lang: string }[];
  meta: Meta;
  onError: (m: string) => void;
}) {
  const [busy, setBusy] = useState<string | null>(null);
  const toggle = async (name: string, enabled: boolean) => {
    setBusy(name);
    try {
      await api.post('/api/ops/flag', { name, enabled });
    } catch (e) {
      onError((e as Error).message);
    } finally {
      setBusy(null);
    }
  };
  const f = state.flags;
  const mode = state.services.flagsmith.mode;

  return (
    <section className="panel panel--flags">
      <PanelHead
        kicker="Flagsmith"
        title="Rituals, rollouts & kill switches"
        right={<span className={cx('tag', mode === 'offline' ? 'tag--warn' : 'tag--ok')}>{mode}</span>}
      />

      <div className="switches">
        {(['voice_guide', 'ai_pandit'] as const).map((name) => (
          <div key={name} className="switch-row">
            <div>
              <code>{name}</code>
              <p>{state.features.find((x) => x.name === name)?.description}</p>
            </div>
            <button
              className={cx('switch', f[name]?.enabled && 'is-on')}
              role="switch"
              aria-checked={f[name]?.enabled}
              disabled={busy === name}
              onClick={() => toggle(name, !f[name]?.enabled)}
            >
              <span />
            </button>
          </div>
        ))}
      </div>

      <div className="remote">
        <p className="mini-label">Remote config · environment defaults</p>
        <dl>
          <div>
            <dt>ritual_pack</dt>
            <dd>{String(f.ritual_pack?.value)}</dd>
          </div>
          <div>
            <dt>guide_style</dt>
            <dd>{String(f.guide_style?.value)}</dd>
          </div>
          <div>
            <dt>pre_muhurat_minutes</dt>
            <dd>{String(f.pre_muhurat_minutes?.value)}</dd>
          </div>
        </dl>
      </div>

      <div className="segments">
        <p className="mini-label">Segments</p>
        <ul>
          {state.segments.map((s) => {
            const hits = phones.filter((p) => {
              const c = evals[p.city];
              if (!c) return false;
              return s.overrides.some((o) => {
                const [feat, val] = o.split(' → ');
                return String(c.flags[feat as keyof Config['flags']]?.value) === val;
              });
            });
            return (
              <li key={s.name} className={cx(hits.length > 0 && 'is-hit')}>
                <div className="segment__top">
                  <code>{s.name}</code>
                  <span className="segment__hits">
                    {hits.map((h) => (
                      <span key={h.city}>{meta.cities.find((c) => c.id === h.city)?.name}</span>
                    ))}
                  </span>
                </div>
                <p>
                  <span className="muted">if</span> {s.rule} <span className="muted">then</span> {s.overrides.join(', ')}
                </p>
              </li>
            );
          })}
        </ul>
      </div>
    </section>
  );
}

// ------------------------------------------------------------------ rush + NudgeBee

const STAGES = [
  { id: 'detected', label: 'Rush detected', hint: 'probe p95 over threshold' },
  { id: 'triggered', label: 'NudgeBee workflow', hint: 'webhook trigger' },
  { id: 'approved', label: 'Human approval', hint: 'Slack / in-app' },
  { id: 'scaled', label: 'Deployment scaled', hint: 'k8s.horizontal_rightsize' },
  { id: 'degraded', label: 'voice_guide OFF', hint: 'Flagsmith via HTTP task' },
  { id: 'resolved', label: 'Latency recovered', hint: 'p95 under threshold' },
];

function useIncident(state: OpsState, traffic: Traffic | null) {
  return useMemo(() => {
    const events = state.events;
    const startIdx = events.map((e) => e.stage).lastIndexOf('detected');
    const trigIdx = events.map((e) => e.stage).lastIndexOf('triggered');
    const from = Math.max(startIdx, -1) >= 0 ? startIdx : trigIdx;
    if (from < 0) return null;
    const since = events.slice(from);
    const has = (st: string) => since.some((e) => e.stage === st);
    const start = since[0];
    const podsAtStart = Number(/across (\d+) pod/.exec(start.detail)?.[1] ?? /(\d+) pod/.exec(start.detail)?.[1] ?? 0);
    const done = new Set<string>();
    if (has('detected') || from === startIdx) done.add('detected');
    if (has('triggered')) done.add('triggered');
    const scaled = has('scaled') || Boolean(traffic && podsAtStart > 0 && traffic.pods.length > podsAtStart);
    const degraded = has('degraded') || state.flags.voice_guide?.enabled === false;
    // NudgeBee only scales / flips the flag after a human approves, so observing either proves approval.
    if (has('approval') || has('approved') || scaled || degraded) done.add('approved');
    if (scaled) done.add('scaled');
    if (degraded) done.add('degraded');
    if (has('resolved') || (done.has('triggered') && traffic && !traffic.rushing && traffic.p95 < traffic.threshold)) done.add('resolved');
    return { done, at: start.at };
  }, [state.events, state.flags, traffic]);
}

function RushPanel({ state, history, meta, onToast }: { state: OpsState; history: Traffic[]; meta: Meta; onToast: (m: string) => void }) {
  const t = state.traffic;
  const [city, setCity] = useState('mumbai');
  const incident = useIncident(state, t);
  const rushing = Boolean(t?.rushing);
  const threshold = t?.threshold ?? state.services.nudgebee.p95ThresholdMs;

  const rush = () => api.post('/api/ops/rush', { city, seconds: 60, concurrency: 64 }).catch((e) => onToast(e.message));
  const stop = () => api.post('/api/ops/rush', { action: 'stop' });
  const escalate = () =>
    api
      .post<{ sent: boolean }>('/api/ops/incident', {})
      .then((r) => onToast(r.sent ? 'Incident sent to NudgeBee' : 'NudgeBee webhook is not configured'))
      .catch((e) => onToast(e.message));

  return (
    <section className="panel panel--rush">
      <PanelHead
        kicker="NudgeBee · Kubernetes"
        title="The muhurat rush"
        note="Millions open the app at the same auspicious minute. Simulate it, and watch NudgeBee respond."
        right={
          <div className="rush-actions">
            <select value={city} onChange={(e) => setCity(e.target.value)} aria-label="Rush city" disabled={rushing}>
              {meta.cities.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
            {rushing ? (
              <button className="btn btn--small btn--ghost" onClick={stop}>
                Stop rush
              </button>
            ) : (
              <button className="btn btn--small btn--fire" onClick={rush}>
                Simulate muhurat rush
              </button>
            )}
            <button className="btn btn--small btn--ghost" onClick={escalate} title="Send the incident to NudgeBee now">
              Escalate
            </button>
          </div>
        }
      />

      <div className="rush-body">
        <div className="stats">
          <Stat label="p95 latency" value={t ? `${t.p95}` : '—'} unit="ms" tone={t && t.p95 > threshold ? 'bad' : 'ok'} />
          <Stat label="requests / s" value={t ? `${t.rps}` : '—'} />
          <Stat label="pods answering" value={t ? `${t.pods.length}` : '—'} tone={incident?.done.has('scaled') ? 'good' : undefined} />
          <div className="pods">
            {(t?.pods ?? []).map((p) => (
              <motion.span key={p} className="pod" initial={{ opacity: 0, scale: 0.8 }} animate={{ opacity: 1, scale: 1 }} title={p}>
                {p.split('-').slice(-1)[0].slice(0, 5)}
              </motion.span>
            ))}
          </div>
        </div>
        <TrafficChart history={history} threshold={threshold} />
      </div>

      <ol className="stages">
        {STAGES.map((s, i) => {
          const done = incident?.done.has(s.id);
          return (
            <li key={s.id} className={cx(done && 'is-done')}>
              <span className="stage__num">{done ? '✓' : i + 1}</span>
              <span className="stage__label">{s.label}</span>
              <span className="stage__hint">{s.hint}</span>
            </li>
          );
        })}
      </ol>
    </section>
  );
}

function Stat({ label, value, unit, tone }: { label: string; value: string; unit?: string; tone?: 'ok' | 'bad' | 'good' }) {
  return (
    <div className={cx('stat', tone && `stat--${tone}`)}>
      <span className="stat__value">
        {value}
        {unit && <small>{unit}</small>}
      </span>
      <span className="stat__label">{label}</span>
    </div>
  );
}

// ------------------------------------------------------------------ event feed

function EventFeed({ events }: { events: OpsEvent[] }) {
  const list = [...events].reverse().slice(0, 40);
  return (
    <section className="panel panel--feed">
      <PanelHead kicker="Event stream" title="What just happened" />
      <ul className="feed">
        <AnimatePresence initial={false}>
          {list.map((e) => (
            <motion.li
              key={e.id}
              layout
              initial={{ opacity: 0, x: -10 }}
              animate={{ opacity: 1, x: 0 }}
              className={cx('feed__item', `lvl-${e.level}`)}
            >
              <span className={cx('src', `src--${e.source}`)}>{e.source}</span>
              <div>
                <p className="feed__title">{e.title}</p>
                {e.detail && <p className="feed__detail">{e.detail}</p>}
              </div>
              <time>{fmtHms(e.at)}</time>
            </motion.li>
          ))}
        </AnimatePresence>
      </ul>
    </section>
  );
}

// ------------------------------------------------------------------ schedule

function SchedulePanel({ state, nowIso, onToast }: { state: OpsState; nowIso: string | null; onToast: (m: string) => void }) {
  const [data, setData] = useState<{ leadMinutes: number; rows: ScheduleRow[] } | null>(null);
  const lead = state.flags.pre_muhurat_minutes?.value;
  useEffect(() => {
    api.get<{ leadMinutes: number; rows: ScheduleRow[] }>('/api/ops/schedule').then(setData).catch(() => undefined);
  }, [lead]);

  const nowT = nowIso ? new Date(nowIso).getTime() : Date.now();
  const upcoming = (data?.rows ?? []).filter((r) => new Date(r.muhurat).getTime() > nowT - 2 * 3600_000).slice(0, 7);
  const rows = upcoming.length ? upcoming : (data?.rows ?? []).slice(-5);

  const run = (r: ScheduleRow) =>
    api
      .post('/api/ops/prescale', { festival: r.festivalName, city: r.cityName, replicas: r.replicas })
      .then(() => onToast(`Pre-scale for ${r.cityName} sent to NudgeBee`))
      .catch((e) => onToast(e.message));

  return (
    <section className="panel panel--schedule">
      <PanelHead
        kicker="NudgeBee schedule triggers"
        title="Pre-scale before every muhurat"
        note={`Compiled from the panchang. Lead time = Flagsmith pre_muhurat_minutes (${data?.leadMinutes ?? '…'} min). Cron is UTC, as NudgeBee expects.`}
      />
      <table className="table">
        <thead>
          <tr>
            <th>Festival</th>
            <th>City</th>
            <th>Muhurat</th>
            <th>NudgeBee cron</th>
            <th>Replicas</th>
            <th />
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => {
            const st = new Date(r.scaleUpAt).getTime();
            const m = new Date(r.muhurat).getTime();
            const status = nowT >= st && nowT < m + 3 * 3600_000 ? 'scaled' : nowT < st ? 'pending' : 'done';
            return (
              <tr key={`${r.festival}-${r.city}`} className={`row--${status}`}>
                <td>{r.festivalName}</td>
                <td>{r.cityName}</td>
                <td className="mono">{r.muhuratLocal.replace(' IST', '')}</td>
                <td>
                  <code>{r.scaleUpCron}</code>
                </td>
                <td className="mono">×{r.replicas}</td>
                <td>
                  <button className="linkish" onClick={() => run(r)} disabled={!state.services.nudgebee.prescaleConfigured} title={state.services.nudgebee.prescaleConfigured ? 'Trigger now' : 'Set NUDGEBEE_PRESCALE_WEBHOOK_URL'}>
                    run now
                  </button>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </section>
  );
}

// ------------------------------------------------------------------ A/B

function ExperimentPanel({ state }: { state: OpsState }) {
  const e = state.experiment;
  const rate = (v: { started: number; completed: number }) => (v.started ? Math.min(100, Math.round((v.completed / v.started) * 100)) : 0);
  const variants = [
    { id: 'steps', label: 'Steps only', v: e.steps },
    { id: 'story', label: 'Story mode', v: e.story },
  ];
  return (
    <section className="panel panel--ab">
      <PanelHead kicker="Flagsmith experiment" title="Does the story help people finish?" note="story_mode_experiment · 50% percentage split on identity" />
      <div className="ab">
        {variants.map(({ id, label, v }) => (
          <div key={id} className={cx('ab__row', `ab__row--${id}`)}>
            <div className="ab__label">
              <strong>{label}</strong>
              <span>
                {v.completed}/{v.started} completed
              </span>
            </div>
            <div className="ab__bar">
              <motion.span animate={{ width: `${rate(v)}%` }} transition={{ type: 'spring', stiffness: 90, damping: 18 }} />
            </div>
            <span className="ab__pct">{rate(v)}%</span>
          </div>
        ))}
      </div>
    </section>
  );
}
