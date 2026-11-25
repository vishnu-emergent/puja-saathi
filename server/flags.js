// Flagsmith integration.
//
//  • Devotee flags are evaluated per identity (an anonymous device id) with
//    traits { city, state, language, festival } so segments pick the ritual,
//    the A/B variant and the kill switches.
//  • With a server-side key (ser.*) we use local evaluation: the environment
//    document is polled every few seconds and segments are evaluated in-process.
//  • The control room (and NudgeBee) flip flags through the Flagsmith Admin API.
//  • Without any Flagsmith keys, an offline mirror evaluates flag-spec.js so the
//    app still runs — and the UI says clearly that it is offline.

import { createHash } from 'node:crypto';
import { Flagsmith } from '@flagsmith/nodejs';
import { FEATURES, SEGMENTS } from './data/flag-spec.js';

const ENV_KEY = process.env.FLAGSMITH_ENVIRONMENT_KEY?.trim();
const SERVER_KEY = process.env.FLAGSMITH_SERVER_KEY?.trim();
const ADMIN_KEY = process.env.FLAGSMITH_ADMIN_API_KEY?.trim();
const API_URL = (process.env.FLAGSMITH_API_URL || 'https://api.flagsmith.com/api/v1/').replace(/\/?$/, '/');

const sdkKey = SERVER_KEY || ENV_KEY;
const localEval = Boolean(SERVER_KEY?.startsWith('ser.'));

export const flagsConfig = {
  configured: Boolean(sdkKey),
  mode: !sdkKey ? 'offline' : localEval ? 'local-evaluation' : 'remote',
  adminConfigured: Boolean(ADMIN_KEY && ENV_KEY),
};

const DEFAULTS = Object.fromEntries(
  FEATURES.map((f) => [f.name, { enabled: f.default_enabled, value: f.value ? castValue(f.value) : null }]),
);

function castValue(v) {
  return v.type === 'integer' ? Number(v.value) : v.value;
}

const flagsmith = sdkKey
  ? new Flagsmith({
      environmentKey: sdkKey,
      ...(process.env.FLAGSMITH_SDK_URL ? { apiUrl: process.env.FLAGSMITH_SDK_URL } : {}),
      enableLocalEvaluation: localEval,
      environmentRefreshIntervalSeconds: 3,
      requestTimeoutSeconds: 5,
      defaultFlagHandler: (name) => ({
        enabled: DEFAULTS[name]?.enabled ?? false,
        isDefault: true,
        value: DEFAULTS[name]?.value ?? null,
      }),
    })
  : null;

// ------------------------------------------------------------ offline mirror

const offlineState = Object.fromEntries(Object.entries(DEFAULTS).map(([k, v]) => [k, { ...v }]));

function pct(identity, segmentName) {
  const h = createHash('md5').update(`${segmentName},${identity}`).digest();
  return (h.readUInt32BE(0) / 0xffffffff) * 100;
}

function offlineEvaluate(identity, traits) {
  const out = Object.fromEntries(Object.entries(offlineState).map(([k, v]) => [k, { ...v }]));
  for (const seg of SEGMENTS) {
    const match = seg.conditions.every((c) =>
      c.operator === 'PERCENTAGE_SPLIT' ? pct(identity, seg.name) < Number(c.value) : String(traits[c.property]) === c.value,
    );
    if (!match) continue;
    for (const o of seg.overrides) {
      if (out[o.feature].enabled) out[o.feature].value = castValue(o.value);
    }
  }
  return out;
}

// ------------------------------------------------------------ evaluation

const cache = new Map();
const CACHE_MS = localEval ? 0 : 2500;

function toPlain(flags) {
  const out = {};
  for (const f of FEATURES) {
    const enabled = flags.isFeatureEnabled(f.name);
    let value = flags.getFeatureValue(f.name);
    if (f.value?.type === 'integer' && value != null) value = Number(value);
    out[f.name] = { enabled, value: value ?? DEFAULTS[f.name].value };
  }
  return out;
}

export async function identityFlags(identity, traits) {
  if (!flagsmith) return { flags: offlineEvaluate(identity, traits), source: 'offline' };

  const ck = `${identity}|${JSON.stringify(traits)}`;
  const hit = cache.get(ck);
  if (hit && Date.now() - hit.at < CACHE_MS) return hit.value;

  try {
    const flags = await flagsmith.getIdentityFlags(identity, traits);
    const value = { flags: toPlain(flags), source: 'flagsmith' };
    if (CACHE_MS) cache.set(ck, { at: Date.now(), value });
    if (cache.size > 5000) cache.clear();
    return value;
  } catch (err) {
    console.warn('[flags] Flagsmith unavailable, using defaults:', err.message);
    return { flags: offlineEvaluate(identity, traits), source: 'fallback' };
  }
}

let envCache = null;
let envInflight = null;

/** Environment-level flags (the global kill switches). Memoised for 2s so hot paths never hammer Flagsmith. */
export async function environmentFlags() {
  if (!flagsmith) return { flags: offlineState, source: 'offline' };
  if (envCache && Date.now() - envCache.at < 2000) return envCache.value;
  envInflight ??= flagsmith
    .getEnvironmentFlags()
    .then((flags) => ({ flags: toPlain(flags), source: 'flagsmith' }))
    .catch((err) => ({ flags: envCache?.value.flags ?? DEFAULTS, source: 'fallback', error: err.message }))
    .then((value) => {
      envCache = { at: Date.now(), value };
      envInflight = null;
      return value;
    });
  return envInflight;
}

// ------------------------------------------------------------ admin (writes)

let featureIds = null;

async function admin(pathname, init = {}) {
  const res = await fetch(new URL(pathname, API_URL.replace(/api\/v1\/$/, '')), {
    ...init,
    headers: { authorization: `Api-Key ${ADMIN_KEY}`, 'content-type': 'application/json', ...(init.headers ?? {}) },
    signal: AbortSignal.timeout(10_000),
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`Flagsmith ${init.method ?? 'GET'} ${pathname} → ${res.status} ${text.slice(0, 200)}`);
  return text ? JSON.parse(text) : {};
}

async function resolveFeatureIds() {
  if (featureIds) return featureIds;
  const env = await admin(`api/v1/environments/${ENV_KEY}/`);
  const list = await admin(`api/v1/projects/${env.project}/features/?page_size=999`);
  featureIds = Object.fromEntries((list.results ?? list).map((f) => [f.name, f.id]));
  return featureIds;
}

/** Turn a feature on/off for the whole environment (what NudgeBee does during a rush). */
export async function setFeatureEnabled(name, enabled) {
  if (!FEATURES.some((f) => f.name === name)) throw new Error(`Unknown feature ${name}`);
  if (!flagsConfig.adminConfigured) {
    if (flagsConfig.configured) {
      throw new Error('Set FLAGSMITH_ADMIN_API_KEY and FLAGSMITH_ENVIRONMENT_KEY to change flags from the control room.');
    }
    offlineState[name].enabled = enabled;
    return { source: 'offline' };
  }
  const ids = await resolveFeatureIds();
  if (!ids[name]) throw new Error(`Feature "${name}" not found in Flagsmith — run npm run flagsmith:setup.`);
  await admin(`api/__future__/environments/${ENV_KEY}/features/${ids[name]}/`, {
    method: 'PATCH',
    body: JSON.stringify({ environment_default: { enabled } }),
  });
  cache.clear();
  envCache = null;
  return { source: 'flagsmith', featureId: ids[name] };
}

export function closeFlags() {
  flagsmith?.close?.();
}
