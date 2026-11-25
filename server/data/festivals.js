// The festive calendar, Diwali → Pongal.
//
// Muhurat times are local (IST) and per city. They are representative
// demo values, close to typical panchang timings; a production build would
// pull them from a panchang service. Everything downstream — Flagsmith traits,
// NudgeBee pre-scale crons, the countdown in the app — is derived from this file,
// so updating the calendar updates the whole system.

export const FESTIVALS = [
  {
    id: 'diwali',
    name: 'Deepavali',
    date: '2026-11-08',
    blurb: 'The night of lamps. Lakshmi Puja at pradosh kaal — Kali Puja at midnight in Bengal.',
    windowMinutes: 110,
    muhurat: {
      delhi: '17:58',
      mumbai: '18:29',
      ahmedabad: '18:22',
      kolkata: '23:15',
      chennai: '17:52',
      bengaluru: '18:05',
      hyderabad: '17:57',
      amritsar: '17:54',
      kochi: '18:12',
      bhubaneswar: '17:35',
    },
  },
  {
    id: 'karthigai',
    name: 'Karthigai Deepam',
    date: '2026-11-24',
    blurb: 'Rows of clay lamps at dusk, for the column of light at Thiruvannamalai.',
    windowMinutes: 90,
    muhurat: { chennai: '18:02', kochi: '18:16' },
  },
  {
    id: 'lohri',
    name: 'Lohri',
    date: '2027-01-13',
    blurb: 'A bonfire for the harvest, sesame and jaggery for the fire.',
    windowMinutes: 120,
    muhurat: { amritsar: '19:05', delhi: '19:20' },
  },
  {
    id: 'pongal',
    name: 'Thai Pongal',
    date: '2027-01-15',
    blurb: 'A new pot boiling over at sunrise — “Pongalo Pongal!”',
    windowMinutes: 120,
    muhurat: { chennai: '07:12', bengaluru: '07:20' },
  },
];

const IST_OFFSET = '+05:30';

/** Absolute instant of a festival's muhurat in a city, or null if not observed there. */
export function muhuratInstant(festival, cityId) {
  const hhmm = festival.muhurat[cityId];
  if (!hhmm) return null;
  return new Date(`${festival.date}T${hhmm}:00${IST_OFFSET}`);
}

/** How long after the muhurat a festival still counts as "today" for the app. */
const AFTERGLOW_MS = 6 * 60 * 60 * 1000;

/**
 * The festival a city should be preparing for at `now`:
 * the ongoing one, else the next upcoming one, else the most recent (practice mode).
 */
export function festivalForCity(cityId, now) {
  const observed = FESTIVALS.map((f) => ({ f, at: muhuratInstant(f, cityId) }))
    .filter((x) => x.at)
    .sort((a, b) => a.at - b.at);
  if (observed.length === 0) return null;

  const t = now.getTime();
  const current = observed.find(({ at }) => t <= at.getTime() + AFTERGLOW_MS);
  const pick = current ?? observed[observed.length - 1];
  const at = pick.at;
  const windowEnd = new Date(at.getTime() + pick.f.windowMinutes * 60_000);
  return {
    id: pick.f.id,
    name: pick.f.name,
    blurb: pick.f.blurb,
    date: pick.f.date,
    muhurat: at.toISOString(),
    muhuratLocal: pick.f.muhurat[cityId],
    windowEnd: windowEnd.toISOString(),
    practice: !current,
  };
}

/** Earliest muhurat of a festival across all cities — used by the control room's time travel. */
export function earliestMuhurat(festival) {
  return Object.keys(festival.muhurat)
    .map((c) => muhuratInstant(festival, c))
    .sort((a, b) => a - b)[0];
}
