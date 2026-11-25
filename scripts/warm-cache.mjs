#!/usr/bin/env node
// Pre-translates (and optionally pre-voices) ritual packs with Sarvam so the
// live demo is instant. Hits the running server, which owns the cache.
//   npm run warm                       → all packs × demo languages, text only
//   npm run warm -- --voice            → also synthesize every step
//   npm run warm -- --langs bn-IN,ta-IN

const BASE = process.env.WARM_URL || `http://localhost:${process.env.PORT || 8787}`;
const args = process.argv.slice(2);
const voice = args.includes('--voice');
const langsArg = args[args.indexOf('--langs') + 1];
const langs = args.includes('--langs') && langsArg ? langsArg.split(',') : ['hi-IN', 'bn-IN', 'ta-IN', 'mr-IN', 'pa-IN', 'kn-IN', 'te-IN', 'gu-IN', 'ml-IN'];
const packs = ['lakshmi_puja', 'kali_puja', 'karthigai_deepam', 'pongal', 'lohri'];

for (const pack of packs) {
  for (const lang of langs) {
    const t = Date.now();
    const res = await fetch(`${BASE}/api/ritual/${pack}?lang=${lang}`);
    if (!res.ok) {
      console.log(`✗ ${pack} ${lang}: ${res.status}`);
      continue;
    }
    const { ritual, translated } = await res.json();
    console.log(`${translated ? '✓' : '△'} ${pack.padEnd(18)} ${lang}  ${Date.now() - t} ms`);
    if (voice) {
      const lines = [ritual.intro, ...ritual.steps.map((s) => `${s.title}. ${s.text}`), ritual.closing];
      for (const text of lines) {
        const r = await fetch(`${BASE}/api/tts`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ text, lang }) });
        if (!r.ok) console.log(`   ✗ tts ${r.status}`);
      }
      console.log(`   ♪ voiced ${lines.length} lines`);
    }
  }
}
