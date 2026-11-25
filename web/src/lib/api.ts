export type Lang = { code: string; name: string; native: string; script: string };
export type City = { id: string; name: string; native: string; state: string; lang: string };
export type Flag = { enabled: boolean; value: string | number | null };
export type Flags = Record<'ritual_pack' | 'voice_guide' | 'ai_pandit' | 'guide_style' | 'pre_muhurat_minutes', Flag>;

export type Festival = {
  id: string;
  name: string;
  blurb: string;
  date: string;
  muhurat: string;
  muhuratLocal: string;
  windowEnd: string;
  practice: boolean;
};

export type FestivalDef = {
  id: string;
  name: string;
  date: string;
  blurb: string;
  windowMinutes: number;
  muhurat: Record<string, string>;
};

export type Services = {
  sarvam: { configured: boolean; tts: string; stt: string; chat: string };
  flagsmith: { configured: boolean; mode: string; admin: boolean };
  nudgebee: { configured: boolean; prescaleConfigured: boolean; p95ThresholdMs: number };
};

export type Config = {
  now: string;
  simulatedClock: boolean;
  city: City;
  lang: string;
  festival: Festival | null;
  traits: Record<string, string>;
  flags: Flags;
  flagsSource: 'flagsmith' | 'offline' | 'fallback';
  services: Services;
  pod: string;
};

export type Step = { title: string; text: string; meaning: string; mantra?: { deva: string; roman: string } };
export type Ritual = {
  id: string;
  title: string;
  festival: string;
  theme: ThemeId;
  duration: number;
  intro: string;
  samagri: string[];
  steps: Step[];
  closing: string;
};
export type ThemeId = 'lakshmi' | 'kali' | 'karthigai' | 'pongal' | 'lohri';
export type RitualResponse = {
  lang: string;
  requestedLang?: string;
  translated: boolean;
  ritual: Ritual;
  english: Ritual;
  ui: { quiet: string; askHint: string };
};

export class ApiError extends Error {
  constructor(
    message: string,
    public status: number,
    public body: Record<string, unknown> = {},
  ) {
    super(message);
  }
}

async function request<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, init);
  const isJson = res.headers.get('content-type')?.includes('application/json');
  const body = isJson ? await res.json() : null;
  if (!res.ok) throw new ApiError((body as { error?: string })?.error ?? res.statusText, res.status, body ?? {});
  return body as T;
}

const post = <T>(url: string, data: unknown) =>
  request<T>(url, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(data) });

export const api = {
  meta: () => request<{ cities: City[]; languages: Lang[]; festivals: FestivalDef[]; services: Services }>('/api/meta'),
  config: (p: { device: string; city: string; lang: string }) =>
    request<Config>(`/api/config?${new URLSearchParams(p)}`),
  ritual: (id: string, lang: string) => request<RitualResponse>(`/api/ritual/${id}?lang=${encodeURIComponent(lang)}`),
  ask: (data: { utterance: string; lang: string; ritualId: string; stepIndex: number; city: string }) =>
    post<{ intent: 'next' | 'back' | 'repeat' | 'answer'; reply: string }>('/api/ask', data),
  stt: async (wav: ArrayBuffer, lang: string) =>
    request<{ transcript: string; language: string }>(`/api/stt?lang=${encodeURIComponent(lang)}`, {
      method: 'POST',
      headers: { 'content-type': 'audio/wav' },
      body: wav,
    }),
  tts: async (text: string, lang: string): Promise<Blob> => {
    const res = await fetch('/api/tts', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ text, lang }),
    });
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      throw new ApiError(body.error ?? 'Voice unavailable', res.status, body);
    }
    return res.blob();
  },
  sessionEvent: (data: { type: 'start' | 'complete' | 'abandon'; variant: string; ritualId: string; city: string; lang: string }) =>
    post<{ ok: true }>('/api/session/event', data).catch(() => undefined),
  post,
  get: request,
};
