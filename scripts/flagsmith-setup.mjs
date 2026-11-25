#!/usr/bin/env node
// Creates Puja Saathi's features, segments and segment overrides in your
// Flagsmith project from server/data/flag-spec.js. Safe to re-run.
//
//   FLAGSMITH_ADMIN_API_KEY   Organisation Settings → API Keys
//   FLAGSMITH_ENVIRONMENT_KEY the environment's client-side key
//
//   npm run flagsmith:setup

import { FEATURES, SEGMENTS } from '../server/data/flag-spec.js';

const ADMIN = process.env.FLAGSMITH_ADMIN_API_KEY;
const ENV = process.env.FLAGSMITH_ENVIRONMENT_KEY;
const BASE = (process.env.FLAGSMITH_API_URL || 'https://api.flagsmith.com/api/v1/').replace(/api\/v1\/?$/, '');

if (!ADMIN || !ENV) {
  console.error('Set FLAGSMITH_ADMIN_API_KEY and FLAGSMITH_ENVIRONMENT_KEY in .env first.');
  process.exit(1);
}

async function api(path, init = {}) {
  const res = await fetch(new URL(path, BASE), {
    ...init,
    headers: { authorization: `Api-Key ${ADMIN}`, 'content-type': 'application/json' },
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`${init.method ?? 'GET'} ${path} → ${res.status}\n${text.slice(0, 500)}`);
  return text ? JSON.parse(text) : {};
}
const list = (r) => r.results ?? r;

const env = await api(`api/v1/environments/${ENV}/`);
const project = env.project;
console.log(`Environment "${env.name}" (id ${env.id}) · project ${project}\n`);

// ---- features
const existing = Object.fromEntries(list(await api(`api/v1/projects/${project}/features/?page_size=999`)).map((f) => [f.name, f]));
const ids = {};
for (const f of FEATURES) {
  if (existing[f.name]) {
    ids[f.name] = existing[f.name].id;
    console.log(`  ✓ feature ${f.name} exists`);
    continue;
  }
  const created = await api(`api/v1/projects/${project}/features/`, {
    method: 'POST',
    body: JSON.stringify({
      name: f.name,
      type: 'STANDARD',
      description: f.description,
      default_enabled: f.default_enabled,
      initial_value: f.value ? f.value.value : null,
    }),
  });
  ids[f.name] = created.id;
  console.log(`  + feature ${f.name}`);
}

// ---- segments
const segs = Object.fromEntries(list(await api(`api/v1/projects/${project}/segments/?page_size=999`)).map((s) => [s.name, s]));
const segIds = {};
for (const s of SEGMENTS) {
  const body = {
    name: s.name,
    description: s.description,
    project,
    rules: [{ type: 'ALL', rules: [{ type: 'ALL', conditions: s.conditions }], conditions: [] }],
  };
  if (segs[s.name]) {
    segIds[s.name] = segs[s.name].id;
    console.log(`  ✓ segment ${s.name} exists`);
  } else {
    const created = await api(`api/v1/projects/${project}/segments/`, { method: 'POST', body: JSON.stringify(body) });
    segIds[s.name] = created.id;
    console.log(`  + segment ${s.name}`);
  }
}

// ---- segment overrides (one PATCH per feature, all its overrides together)
const byFeature = {};
SEGMENTS.forEach((s, i) =>
  s.overrides.forEach((o) => (byFeature[o.feature] ??= []).push({ segment: { id: segIds[s.name] }, enabled: true, priority: i, value: o.value })),
);
for (const [feature, overrides] of Object.entries(byFeature)) {
  const f = FEATURES.find((x) => x.name === feature);
  await api(`api/__future__/environments/${ENV}/features/${ids[feature]}/`, {
    method: 'PATCH',
    body: JSON.stringify({
      environment_default: { enabled: f.default_enabled, value: f.value },
      segment_overrides: overrides,
    }),
  });
  console.log(`  ⇢ ${feature}: ${overrides.length} segment override(s)`);
}

console.log(`
Done. Feature ids for your NudgeBee workflow:
  voice_guide → ${ids.voice_guide}

NudgeBee HTTP task to turn voice OFF during a rush:
  PATCH ${BASE}api/__future__/environments/${ENV}/features/${ids.voice_guide}/
  Authorization: Api-Key <FLAGSMITH_ADMIN_API_KEY>
  {"environment_default": {"enabled": false}}
`);
