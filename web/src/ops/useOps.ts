import { useEffect, useRef, useState } from 'react';
import { api, type Flags, type Services } from '../lib/api';

export type OpsEvent = {
  id: number;
  at: string;
  source: string;
  title: string;
  detail: string;
  level: 'info' | 'warn' | 'error' | 'success';
  stage: string | null;
  pod: string;
};

export type Traffic = {
  at: string;
  rps: number;
  p50: number;
  p95: number;
  errors: number;
  pods: string[];
  rushing: boolean;
  rushCity: string | null;
  threshold: number;
};

export type Experiment = Record<'steps' | 'story', { started: number; completed: number }>;

export type OpsState = {
  now: string;
  simulatedClock: boolean;
  pod: string;
  services: Services;
  flags: Flags;
  flagsSource: string;
  features: { name: string; description: string }[];
  segments: { name: string; description: string; rule: string; overrides: string[] }[];
  events: OpsEvent[];
  traffic: Traffic | null;
  experiment: Experiment;
};

/** Live control-room state: one snapshot, then Server-Sent Events. */
export function useOps() {
  const [state, setState] = useState<OpsState | null>(null);
  const [history, setHistory] = useState<Traffic[]>([]);
  const [connected, setConnected] = useState(false);
  const [clock, setClock] = useState<{ now: string; simulated: boolean; skew: number } | null>(null);
  const seen = useRef(new Set<number>());

  useEffect(() => {
    let alive = true;
    const load = () =>
      api
        .get<OpsState>('/api/ops/state')
        .then((s) => {
          if (!alive) return;
          s.events.forEach((e) => seen.current.add(e.id));
          setState(s);
          setClock({ now: s.now, simulated: s.simulatedClock, skew: new Date(s.now).getTime() - Date.now() });
        })
        .catch(() => undefined);
    load();

    const es = new EventSource('/api/ops/stream');
    es.onopen = () => {
      setConnected(true);
      load();
    };
    es.onerror = () => setConnected(false);
    es.addEventListener('event', (m) => {
      const e = JSON.parse((m as MessageEvent).data) as OpsEvent;
      if (seen.current.has(e.id)) return;
      seen.current.add(e.id);
      setState((s) => (s ? { ...s, events: [...s.events, e].slice(-120) } : s));
    });
    es.addEventListener('traffic', (m) => {
      const t = JSON.parse((m as MessageEvent).data) as Traffic;
      setHistory((h) => [...h, t].slice(-90));
      setState((s) => (s ? { ...s, traffic: t } : s));
    });
    es.addEventListener('flags', (m) => {
      const { flags, source } = JSON.parse((m as MessageEvent).data);
      setState((s) => (s ? { ...s, flags, flagsSource: source } : s));
    });
    es.addEventListener('experiment', (m) => {
      const experiment = JSON.parse((m as MessageEvent).data);
      setState((s) => (s ? { ...s, experiment } : s));
    });
    es.addEventListener('clock', (m) => {
      const c = JSON.parse((m as MessageEvent).data);
      setClock({ now: c.now, simulated: c.simulatedClock, skew: new Date(c.now).getTime() - Date.now() });
    });
    return () => {
      alive = false;
      es.close();
    };
  }, []);

  return { state, history, connected, clock };
}
