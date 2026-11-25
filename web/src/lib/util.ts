export function deviceId(): string {
  try {
    let id = localStorage.getItem('ps.device');
    if (!id) {
      id = `dev-${crypto.randomUUID().slice(0, 12)}`;
      localStorage.setItem('ps.device', id);
    }
    return id;
  } catch {
    return 'dev-ephemeral';
  }
}

export function load<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}

export function save(key: string, value: unknown) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    /* storage unavailable — fine */
  }
}

const IST = 'Asia/Kolkata';

export const fmtTime = (iso: string) =>
  new Intl.DateTimeFormat('en-IN', { hour: 'numeric', minute: '2-digit', timeZone: IST }).format(new Date(iso));

export const fmtDate = (iso: string) =>
  new Intl.DateTimeFormat('en-IN', { weekday: 'short', day: 'numeric', month: 'short', timeZone: IST }).format(new Date(iso));

export const fmtDateLong = (iso: string) =>
  new Intl.DateTimeFormat('en-IN', { day: 'numeric', month: 'long', year: 'numeric', timeZone: IST }).format(new Date(iso));

export function splitDuration(ms: number) {
  const s = Math.max(0, Math.floor(ms / 1000));
  return { d: Math.floor(s / 86400), h: Math.floor((s % 86400) / 3600), m: Math.floor((s % 3600) / 60), s: s % 60 };
}

export const pad2 = (n: number) => String(n).padStart(2, '0');

export const cx = (...xs: (string | false | null | undefined)[]) => xs.filter(Boolean).join(' ');
