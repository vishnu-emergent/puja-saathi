#!/usr/bin/env node
// Start or stop a muhurat rush from the terminal (same as the control-room button).
//   npm run rush -- mumbai 60 64     → city, seconds, concurrency
//   npm run rush -- stop
const BASE = process.env.RUSH_URL || 'http://localhost:8787';
const [a = 'mumbai', seconds = '60', concurrency = '64'] = process.argv.slice(2);
const body = a === 'stop' ? { action: 'stop' } : { city: a, seconds: Number(seconds), concurrency: Number(concurrency) };
const res = await fetch(`${BASE}/api/ops/rush`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
console.log(res.status, await res.text());
