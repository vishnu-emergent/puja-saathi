// Panchang → NudgeBee cron compiler.
// For every (festival, city) muhurat, NudgeBee should scale the guide up
// `pre_muhurat_minutes` before devotees arrive. NudgeBee schedule triggers use
// standard 5-field cron in UTC, so we convert from IST here.

import { FESTIVALS, muhuratInstant } from './data/festivals.js';
import { cityById } from './data/places.js';

const pad = (n) => String(n).padStart(2, '0');

export function replicasFor(cityId) {
  // Rough per-city weighting: metro populations need more headroom.
  const heavy = new Set(['delhi', 'mumbai', 'kolkata', 'chennai', 'bengaluru']);
  return heavy.has(cityId) ? 8 : 5;
}

export function compileSchedule(leadMinutes = 20) {
  const rows = [];
  for (const f of FESTIVALS) {
    for (const cityId of Object.keys(f.muhurat)) {
      const at = muhuratInstant(f, cityId);
      const scaleAt = new Date(at.getTime() - leadMinutes * 60_000);
      const scaleDownAt = new Date(at.getTime() + (f.windowMinutes + 15) * 60_000);
      const cron = (d) => `${d.getUTCMinutes()} ${d.getUTCHours()} ${d.getUTCDate()} ${d.getUTCMonth() + 1} *`;
      rows.push({
        festival: f.id,
        festivalName: f.name,
        city: cityId,
        cityName: cityById(cityId)?.name ?? cityId,
        muhurat: at.toISOString(),
        muhuratLocal: `${f.date} ${f.muhurat[cityId]} IST`,
        scaleUpAt: scaleAt.toISOString(),
        scaleUpUtc: `${scaleAt.getUTCFullYear()}-${pad(scaleAt.getUTCMonth() + 1)}-${pad(scaleAt.getUTCDate())} ${pad(scaleAt.getUTCHours())}:${pad(scaleAt.getUTCMinutes())} UTC`,
        scaleUpCron: cron(scaleAt),
        scaleDownCron: cron(scaleDownAt),
        replicas: replicasFor(cityId),
      });
    }
  }
  return rows.sort((a, b) => a.scaleUpAt.localeCompare(b.scaleUpAt));
}
