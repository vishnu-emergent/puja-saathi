#!/usr/bin/env node
// Prints the NudgeBee schedule triggers (UTC cron) for every muhurat:
// scale up `lead` minutes before devotees arrive, scale down after the window.
//   npm run panchang:cron            (lead = 20 min)
//   npm run panchang:cron -- 30      (custom lead)

import { compileSchedule } from '../server/schedule.js';

const lead = Number(process.argv[2] || 20);
const rows = compileSchedule(lead);
const w = (s, n) => String(s).padEnd(n);

console.log(`\nNudgeBee pre-scale schedule · lead ${lead} min · cron in UTC\n`);
console.log(w('FESTIVAL', 18) + w('CITY', 13) + w('MUHURAT (IST)', 24) + w('SCALE-UP CRON', 18) + w('SCALE-DOWN CRON', 18) + 'REPLICAS');
for (const r of rows) {
  console.log(w(r.festivalName, 18) + w(r.cityName, 13) + w(r.muhuratLocal, 24) + w(r.scaleUpCron, 18) + w(r.scaleDownCron, 18) + r.replicas);
}
console.log(`\nIn NudgeBee: Workflow Builder → new automation → Schedule trigger (cron above)
→ task k8s.horizontal_rightsize { kind: Deployment, namespace: puja-saathi, name: puja-saathi,
  scaling_mode: change_to, max: <replicas> }.\n`);
