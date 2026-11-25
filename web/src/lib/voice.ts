// Voice in and out.
//  • speak(): Sarvam TTS through our API, with an in-memory cache and a
//    single "current utterance" so navigating never overlaps two voices.
//  • Recorder: captures the mic, exposes a live level for the diya flame,
//    and converts whatever the browser records into 16 kHz mono WAV — the
//    format Sarvam's speech-to-text likes best.

import { api } from './api';

const audioCache = new Map<string, Promise<string>>();
let current: HTMLAudioElement | null = null;
let currentToken = 0;

function audioUrl(text: string, lang: string) {
  const key = `${lang}|${text}`;
  let p = audioCache.get(key);
  if (!p) {
    p = api.tts(text, lang).then((blob) => URL.createObjectURL(blob));
    p.catch(() => audioCache.delete(key));
    audioCache.set(key, p);
  }
  return p;
}

export function prefetchSpeech(text: string, lang: string) {
  audioUrl(text, lang).catch(() => undefined);
}

export function stopSpeaking() {
  currentToken++;
  if (current) {
    current.pause();
    current.src = '';
    current = null;
  }
}

/** Speak text; resolves when finished, rejects on failure. A newer call cancels an older one silently. */
export async function speak(text: string, lang: string, onStart?: () => void): Promise<'done' | 'cancelled'> {
  stopSpeaking();
  const token = currentToken;
  const url = await audioUrl(text, lang);
  if (token !== currentToken) return 'cancelled';
  const audio = new Audio(url);
  current = audio;
  return new Promise((resolve, reject) => {
    audio.onended = () => resolve('done');
    audio.onerror = () => reject(new Error('Could not play audio'));
    audio
      .play()
      .then(() => onStart?.())
      .catch((err) => (token !== currentToken ? resolve('cancelled') : reject(err)));
    const cancelCheck = setInterval(() => {
      if (token !== currentToken) {
        clearInterval(cancelCheck);
        resolve('cancelled');
      }
    }, 120);
    audio.addEventListener('ended', () => clearInterval(cancelCheck));
    audio.addEventListener('error', () => clearInterval(cancelCheck));
  });
}

// ---------------------------------------------------------------- recorder

export class Recorder {
  private stream: MediaStream | null = null;
  private recorder: MediaRecorder | null = null;
  private chunks: Blob[] = [];
  private ctx: AudioContext | null = null;
  private raf = 0;
  private autoStop: ReturnType<typeof setTimeout> | null = null;

  constructor(
    private onLevel: (level: number) => void,
    private maxSeconds = 20,
  ) {}

  static supported() {
    return typeof navigator !== 'undefined' && !!navigator.mediaDevices?.getUserMedia && typeof MediaRecorder !== 'undefined';
  }

  async start(onAutoStop: () => void) {
    this.stream = await navigator.mediaDevices.getUserMedia({
      audio: { echoCancellation: true, noiseSuppression: true, channelCount: 1 },
    });
    this.ctx = new AudioContext();
    const source = this.ctx.createMediaStreamSource(this.stream);
    const analyser = this.ctx.createAnalyser();
    analyser.fftSize = 512;
    source.connect(analyser);
    const data = new Uint8Array(analyser.fftSize);
    const loop = () => {
      analyser.getByteTimeDomainData(data);
      let sum = 0;
      for (const v of data) sum += ((v - 128) / 128) ** 2;
      this.onLevel(Math.min(1, Math.sqrt(sum / data.length) * 4));
      this.raf = requestAnimationFrame(loop);
    };
    loop();

    this.chunks = [];
    this.recorder = new MediaRecorder(this.stream);
    this.recorder.ondataavailable = (e) => e.data.size && this.chunks.push(e.data);
    this.recorder.start(250);
    this.autoStop = setTimeout(onAutoStop, this.maxSeconds * 1000);
  }

  /** Stop and return 16 kHz mono WAV bytes. */
  async stop(): Promise<ArrayBuffer> {
    const rec = this.recorder;
    if (!rec) throw new Error('Not recording');
    const stopped = new Promise<void>((r) => (rec.onstop = () => r()));
    if (rec.state !== 'inactive') rec.stop();
    await stopped;
    const blob = new Blob(this.chunks, { type: rec.mimeType || 'audio/webm' });
    const decodeCtx = this.ctx!;
    const decoded = await decodeCtx.decodeAudioData(await blob.arrayBuffer());
    this.cleanup();
    return toWav16k(decoded);
  }

  cancel() {
    try {
      if (this.recorder && this.recorder.state !== 'inactive') this.recorder.stop();
    } catch {
      /* already stopped */
    }
    this.cleanup();
  }

  private cleanup() {
    cancelAnimationFrame(this.raf);
    if (this.autoStop) clearTimeout(this.autoStop);
    this.stream?.getTracks().forEach((t) => t.stop());
    this.ctx?.close().catch(() => undefined);
    this.stream = null;
    this.recorder = null;
    this.ctx = null;
    this.onLevel(0);
  }
}

async function toWav16k(buffer: AudioBuffer): Promise<ArrayBuffer> {
  const rate = 16000;
  const length = Math.max(1, Math.ceil(buffer.duration * rate));
  const offline = new OfflineAudioContext(1, length, rate);
  const src = offline.createBufferSource();
  src.buffer = buffer;
  src.connect(offline.destination);
  src.start();
  const rendered = await offline.startRendering();
  const pcm = rendered.getChannelData(0);

  const out = new ArrayBuffer(44 + pcm.length * 2);
  const view = new DataView(out);
  const str = (o: number, s: string) => [...s].forEach((c, i) => view.setUint8(o + i, c.charCodeAt(0)));
  str(0, 'RIFF');
  view.setUint32(4, 36 + pcm.length * 2, true);
  str(8, 'WAVE');
  str(12, 'fmt ');
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, 1, true);
  view.setUint32(24, rate, true);
  view.setUint32(28, rate * 2, true);
  view.setUint16(32, 2, true);
  view.setUint16(34, 16, true);
  str(36, 'data');
  view.setUint32(40, pcm.length * 2, true);
  for (let i = 0; i < pcm.length; i++) {
    const s = Math.max(-1, Math.min(1, pcm[i]));
    view.setInt16(44 + i * 2, s < 0 ? s * 0x8000 : s * 0x7fff, true);
  }
  return out;
}

// ---------------------------------------------------------------- quick intents (no LLM round-trip)

const NEXT = ['next', 'continue', 'done', 'aage', 'agla', 'आगे', 'अगला', 'हो गया', 'পরের', 'পরেরটা', 'হয়ে গেছে', 'அடுத்து', 'அடுத்தது', 'முடிந்தது', 'తదుపరి', 'తర్వాత', 'पुढे', 'पुढचं', 'આગળ', 'પછી', 'ಮುಂದೆ', 'ಮುಂದಿನ', 'ਅੱਗੇ', 'ਅਗਲਾ', 'അടുത്തത്', 'അടുത്ത', 'ପରବର୍ତ୍ତୀ', 'ଆଗକୁ'];
const BACK = ['back', 'previous', 'peeche', 'पीछे', 'पिछला', 'আগের', 'পিছনে', 'முந்தைய', 'பின்னால்', 'వెనుక', 'మునుపటి', 'मागे', 'मागील', 'પાછળ', 'ಹಿಂದೆ', 'ಹಿಂದಿನ', 'ਪਿੱਛੇ', 'പിന്നോട്ട്', 'മുമ്പത്തെ', 'ପଛକୁ'];
const REPEAT = ['repeat', 'again', 'dobara', 'phir se', 'दोबारा', 'फिर से', 'फिर', 'আবার', 'மீண்டும்', 'మళ్ళీ', 'మళ్లీ', 'पुन्हा', 'ફરી', 'ಮತ್ತೆ', 'ಮತ್ತೊಮ್ಮೆ', 'ਦੁਬਾਰਾ', 'ਫਿਰ', 'വീണ്ടും', 'ପୁଣି'];

export function quickIntent(utterance: string): 'next' | 'back' | 'repeat' | null {
  const u = utterance.toLowerCase().replace(/[.,!?।॥]/g, ' ').trim();
  const words = u.split(/\s+/);
  if (words.length > 4) return null; // longer sentences are probably questions
  const has = (list: string[]) => list.some((k) => u === k || words.includes(k) || (k.includes(' ') && u.includes(k)));
  if (has(REPEAT)) return 'repeat';
  if (has(BACK)) return 'back';
  if (has(NEXT)) return 'next';
  return null;
}
