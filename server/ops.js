// Operations: the part of Puja Saathi that NudgeBee works with.
//
//  • /metrics — Prometheus metrics (request rate, latency, live sessions).
//  • A muhurat-rush generator that sends real traffic at the Kubernetes Service
//    (a fresh TCP connection per request, so kube-proxy spreads it across pods)
//    and measures latency + which pods answered.
//  • When p95 latency stays above the threshold, it fires the NudgeBee workflow
//    webhook. The NudgeBee workflow asks for approval, scales the Deployment and
//    flips the Flagsmith `voice_guide` flag — then reports back to /api/ops/events.
//  • An event bus streamed to the control room over Server-Sent Events.

import http from 'node:http';
import https from 'node:https';
import os from 'node:os';
import client from 'prom-client';

export const POD = process.env.POD_NAME || os.hostname();

// ------------------------------------------------------------ demo clock

let clockOffsetMs = 0;
export const clock = {
  now: () => new Date(Date.now() + clockOffsetMs),
  set(date) {
    clockOffsetMs = date.getTime() - Date.now();
  },
  reset() {
    clockOffsetMs = 0;
  },
  get simulated() {
    return Math.abs(clockOffsetMs) > 60_000;
  },
};
if (process.env.DEMO_START) {
  const d = new Date(process.env.DEMO_START);
  if (!Number.isNaN(d.getTime())) clock.set(d);
}

// ------------------------------------------------------------ event bus (SSE)

const events = [];
const subscribers = new Set();
let seq = 0;

export function emit(source, title, detail = '', level = 'info', stage = null) {
  const event = { id: ++seq, at: new Date().toISOString(), source, title, detail, level, stage, pod: POD };
  events.push(event);
  if (events.length > 200) events.shift();
  broadcast('event', event);
  return event;
}

export function broadcast(type, data) {
  const payload = `event: ${type}\ndata: ${JSON.stringify(data)}\n\n`;
  for (const res of subscribers) res.write(payload);
}

export function recentEvents() {
  return events.slice(-60);
}

export function subscribe(req, res) {
  res.writeHead(200, {
    'content-type': 'text/event-stream',
    'cache-control': 'no-cache, no-transform',
    connection: 'keep-alive',
    'x-accel-buffering': 'no',
  });
  res.write(`retry: 2000\n\n`);
  subscribers.add(res);
  const ping = setInterval(() => res.write(`: ping\n\n`), 15_000);
  req.on('close', () => {
    clearInterval(ping);
    subscribers.delete(res);
  });
}

// ------------------------------------------------------------ metrics

export const registry = new client.Registry();
registry.setDefaultLabels({ app: 'puja-saathi', pod: POD });
client.collectDefaultMetrics({ register: registry });

const httpDuration = new client.Histogram({
  name: 'puja_http_request_duration_seconds',
  help: 'API latency by route',
  labelNames: ['route', 'status'],
  buckets: [0.025, 0.05, 0.1, 0.25, 0.5, 1, 2, 5],
  registers: [registry],
});
export const liveSessions = new client.Gauge({
  name: 'puja_sessions_live',
  help: 'Devotees currently inside a guided puja',
  registers: [registry],
});
const rushP95 = new client.Gauge({
  name: 'puja_rush_p95_seconds',
  help: 'p95 latency observed by the muhurat-rush probe',
  registers: [registry],
});

export function metricsMiddleware(req, res, next) {
  if (!req.path.startsWith('/api/') || req.path.startsWith('/api/ops/stream')) return next();
  const end = httpDuration.startTimer();
  res.on('finish', () => end({ route: req.route?.path ?? req.path.split('/').slice(0, 3).join('/'), status: res.statusCode }));
  next();
}

// ------------------------------------------------------------ NudgeBee

const NUDGEBEE_WEBHOOK = process.env.NUDGEBEE_WEBHOOK_URL?.trim();
const NUDGEBEE_PRESCALE_WEBHOOK = process.env.NUDGEBEE_PRESCALE_WEBHOOK_URL?.trim();
const P95_THRESHOLD_MS = Number(process.env.RUSH_P95_THRESHOLD_MS || 600);
const ALERT_COOLDOWN_MS = Number(process.env.RUSH_ALERT_COOLDOWN_MS || 5 * 60_000);

export const nudgebeeConfig = {
  configured: Boolean(NUDGEBEE_WEBHOOK),
  prescaleConfigured: Boolean(NUDGEBEE_PRESCALE_WEBHOOK),
  p95ThresholdMs: P95_THRESHOLD_MS,
};

async function postJson(url, payload) {
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(payload),
    signal: AbortSignal.timeout(10_000),
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`${res.status} ${text.slice(0, 160)}`);
  return text;
}

let lastAlertAt = 0;

export async function alertNudgeBee(payload, { force = false } = {}) {
  if (!NUDGEBEE_WEBHOOK) {
    emit('nudgebee', 'NudgeBee webhook not configured', 'Set NUDGEBEE_WEBHOOK_URL to hand this incident to NudgeBee.', 'warn');
    return { sent: false };
  }
  if (!force && Date.now() - lastAlertAt < ALERT_COOLDOWN_MS) return { sent: false, cooldown: true };
  lastAlertAt = Date.now();
  try {
    await postJson(NUDGEBEE_WEBHOOK, payload);
    emit('nudgebee', 'Incident handed to NudgeBee', `Workflow "muhurat-rush" triggered · p95 ${payload.p95_ms} ms · ${payload.pods_answering} pod(s)`, 'warn', 'triggered');
    return { sent: true };
  } catch (err) {
    emit('nudgebee', 'NudgeBee webhook failed', err.message, 'error');
    return { sent: false, error: err.message };
  }
}

export async function triggerPrescale(payload) {
  if (!NUDGEBEE_PRESCALE_WEBHOOK) throw new Error('Set NUDGEBEE_PRESCALE_WEBHOOK_URL to trigger the pre-scale workflow manually.');
  await postJson(NUDGEBEE_PRESCALE_WEBHOOK, payload);
  emit('nudgebee', 'Pre-muhurat scale-up triggered', `${payload.festival} · ${payload.city} · target ${payload.replicas} replicas`);
}

// ------------------------------------------------------------ traffic probe + rush

const TARGET = (process.env.RUSH_TARGET_URL || `http://127.0.0.1:${process.env.PORT || 8787}`).replace(/\/$/, '');
const targetUrl = new URL('/api/session/prepare', TARGET);
const transport = targetUrl.protocol === 'https:' ? https : http;

function probeOnce() {
  return new Promise((resolve) => {
    const started = performance.now();
    const req = transport.request(
      targetUrl,
      { method: 'POST', agent: false, headers: { 'content-length': 0, 'x-probe': '1' }, timeout: 15_000 },
      (res) => {
        res.resume();
        res.on('end', () => resolve({ ok: res.statusCode < 500, ms: performance.now() - started, pod: res.headers['x-pod'] || '?' }));
      },
    );
    req.on('timeout', () => req.destroy(new Error('timeout')));
    req.on('error', () => resolve({ ok: false, ms: performance.now() - started, pod: null }));
    req.end();
  });
}

const samples = []; // probe samples from the last few seconds
let rush = null; // { until, concurrency, city }
let breachSeconds = 0;

function percentile(arr, p) {
  if (arr.length === 0) return 0;
  const s = [...arr].sort((a, b) => a - b);
  return s[Math.min(s.length - 1, Math.floor((p / 100) * s.length))];
}

async function worker(isRushWorker) {
  while (isRushWorker ? rush && Date.now() < rush.until : true) {
    const sample = await probeOnce();
    samples.push({ ...sample, at: Date.now() });
    if (!isRushWorker) await new Promise((r) => setTimeout(r, 1000));
  }
}

let lastTick = null;
function tick() {
  const now = Date.now();
  while (samples.length && samples[0].at < now - 5000) samples.shift();
  const last1s = samples.filter((s) => s.at >= now - 1000);
  const lat = samples.filter((s) => s.at >= now - 3000).map((s) => s.ms);
  const pods = [...new Set(samples.filter((s) => s.pod).map((s) => s.pod))];
  const p95 = Math.round(percentile(lat, 95));
  const stats = {
    at: new Date(now).toISOString(),
    rps: last1s.length,
    p50: Math.round(percentile(lat, 50)),
    p95,
    errors: last1s.filter((s) => !s.ok).length,
    pods,
    rushing: Boolean(rush && now < rush.until),
    rushCity: rush?.city ?? null,
    threshold: P95_THRESHOLD_MS,
  };
  rushP95.set(p95 / 1000);
  lastTick = stats;
  broadcast('traffic', stats);

  if (stats.rushing && p95 > P95_THRESHOLD_MS) {
    breachSeconds++;
    if (breachSeconds === 3) {
      emit('app', 'Muhurat rush is overwhelming the guide', `p95 ${p95} ms > ${P95_THRESHOLD_MS} ms for 3s across ${pods.length} pod(s)`, 'error', 'detected');
      alertNudgeBee({
        alert: 'MuhuratRush',
        severity: 'high',
        app: 'puja-saathi',
        namespace: process.env.POD_NAMESPACE || 'puja-saathi',
        deployment: 'puja-saathi',
        city: stats.rushCity,
        p95_ms: p95,
        rps: stats.rps,
        pods_answering: pods.length,
        suggested_action: 'scale deployment/puja-saathi and turn off Flagsmith voice_guide',
        at: stats.at,
      });
    }
  } else {
    breachSeconds = 0;
  }
  if (rush && now >= rush.until) {
    emit('app', 'Rush simulation finished', `Peak traffic subsided${rush.city ? ` in ${rush.city}` : ''}.`);
    rush = null;
  }
}

export function startTrafficProbe() {
  if (process.env.DISABLE_PROBE === '1') return;
  worker(false);
  setInterval(tick, 1000).unref();
}

export function startRush({ seconds = 45, concurrency = 48, city = null } = {}) {
  if (rush && Date.now() < rush.until) return { already: true };
  rush = { until: Date.now() + seconds * 1000, concurrency, city };
  breachSeconds = 0;
  for (let i = 0; i < concurrency; i++) worker(true);
  emit('app', `Muhurat rush simulation started${city ? ` · ${city}` : ''}`, `${concurrency} concurrent devotees for ${seconds}s → ${targetUrl.host}`, 'warn');
  return { started: true };
}

export function stopRush() {
  if (rush) rush.until = 0;
}

export const trafficSnapshot = () => lastTick;
