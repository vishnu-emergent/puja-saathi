// Sarvam AI client — speech-to-text, translation, text-to-speech and chat.
// Translations and synthesized audio are cached on disk, so a pack is only
// translated / voiced once per language and the live demo stays instant.

import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { languageByCode } from './data/places.js';

const BASE = 'https://api.sarvam.ai';
const KEY = process.env.SARVAM_API_KEY?.trim();

export const sarvamConfig = {
  configured: Boolean(KEY),
  sttModel: process.env.SARVAM_STT_MODEL || 'saaras:v4',
  ttsModel: process.env.SARVAM_TTS_MODEL || 'bulbul:v3',
  ttsSpeaker: process.env.SARVAM_TTS_SPEAKER || 'kavya',
  translateModel: process.env.SARVAM_TRANSLATE_MODEL || 'sarvam-translate:v1',
  chatModel: process.env.SARVAM_CHAT_MODEL || 'sarvam-105b-conversations',
};

export class SarvamError extends Error {
  constructor(message, status = 502) {
    super(message);
    this.status = status;
  }
}

function requireKey() {
  if (!KEY) throw new SarvamError('Sarvam AI is not configured (set SARVAM_API_KEY).', 503);
}

async function call(pathname, init, { timeoutMs = 30_000 } = {}) {
  requireKey();
  const res = await fetch(`${BASE}${pathname}`, {
    ...init,
    headers: { 'api-subscription-key': KEY, ...(init.headers ?? {}) },
    signal: AbortSignal.timeout(timeoutMs),
  });
  const text = await res.text();
  let body;
  try {
    body = text ? JSON.parse(text) : {};
  } catch {
    body = { raw: text };
  }
  if (!res.ok) {
    const msg = body?.error?.message || body?.message || body?.detail || text.slice(0, 200) || res.statusText;
    throw new SarvamError(`Sarvam ${pathname} → ${res.status}: ${typeof msg === 'string' ? msg : JSON.stringify(msg)}`, res.status === 429 ? 429 : 502);
  }
  return body;
}

// ---------------------------------------------------------------- disk cache

const CACHE_DIR = process.env.CACHE_DIR || path.resolve('.cache');
const TRANSLATIONS_FILE = path.join(CACHE_DIR, 'translations.json');
const TTS_DIR = path.join(CACHE_DIR, 'tts');

const translations = (() => {
  try {
    return existsSync(TRANSLATIONS_FILE) ? JSON.parse(readFileSync(TRANSLATIONS_FILE, 'utf8')) : {};
  } catch {
    return {};
  }
})();

let flushTimer = null;
function scheduleFlush() {
  if (flushTimer) return;
  flushTimer = setTimeout(async () => {
    flushTimer = null;
    try {
      await mkdir(CACHE_DIR, { recursive: true });
      await writeFile(TRANSLATIONS_FILE, JSON.stringify(translations));
    } catch (err) {
      console.warn('[sarvam] could not persist translation cache:', err.message);
    }
  }, 500);
}

const hash = (...parts) => createHash('sha1').update(parts.join('\u0000')).digest('hex').slice(0, 20);

// ---------------------------------------------------------------- translate

const inflight = new Map();

export async function translate(text, target) {
  if (!text || target === 'en-IN') return text;
  const key = `${target}:${hash(text)}`;
  if (translations[key]) return translations[key];
  if (inflight.has(key)) return inflight.get(key);

  const p = (async () => {
    const body = await call('/translate', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        input: text,
        source_language_code: 'en-IN',
        target_language_code: target,
        model: sarvamConfig.translateModel,
        mode: 'formal',
      }),
    });
    const out = (body.translated_text || '').trim();
    if (!out) throw new SarvamError('Sarvam translate returned an empty result.');
    translations[key] = out;
    scheduleFlush();
    return out;
  })().finally(() => inflight.delete(key));

  inflight.set(key, p);
  return p;
}

/** Translate many strings with bounded concurrency; falls back to English per-string on failure. */
export async function translateMany(texts, target, { concurrency = 4, onError } = {}) {
  const out = new Array(texts.length);
  let i = 0;
  let failures = 0;
  async function worker() {
    while (i < texts.length) {
      const idx = i++;
      try {
        out[idx] = await translate(texts[idx], target);
      } catch (err) {
        failures++;
        onError?.(err);
        out[idx] = texts[idx];
      }
    }
  }
  await Promise.all(Array.from({ length: Math.min(concurrency, texts.length) }, worker));
  return { texts: out, failures };
}

export function isTranslated(text, target) {
  return target === 'en-IN' || Boolean(translations[`${target}:${hash(text)}`]);
}

// ---------------------------------------------------------------- speech

export async function synthesize(text, lang, { pace = 0.95 } = {}) {
  const clean = text.trim().slice(0, 2400);
  const file = path.join(TTS_DIR, `${hash(sarvamConfig.ttsModel, sarvamConfig.ttsSpeaker, lang, String(pace), clean)}.wav`);
  try {
    return await readFile(file);
  } catch {
    /* not cached yet */
  }
  const body = await call(
    '/text-to-speech',
    {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        text: clean,
        language_code: lang,
        model: sarvamConfig.ttsModel,
        speaker: sarvamConfig.ttsSpeaker,
        pace,
        speech_sample_rate: 22050,
      }),
    },
    { timeoutMs: 45_000 },
  );
  if (!Array.isArray(body.audios) || body.audios.length === 0) throw new SarvamError('Sarvam TTS returned no audio.');
  const audio = Buffer.from(body.audios.join(''), 'base64');
  try {
    await mkdir(TTS_DIR, { recursive: true });
    await writeFile(file, audio);
  } catch (err) {
    console.warn('[sarvam] could not cache audio:', err.message);
  }
  return audio;
}

export async function transcribe(wav, lang) {
  const form = new FormData();
  form.append('file', new Blob([wav], { type: 'audio/wav' }), 'speech.wav');
  form.append('model', sarvamConfig.sttModel);
  form.append('mode', 'transcribe');
  form.append('language_code', lang || 'unknown');
  const body = await call('/speech-to-text', { method: 'POST', body: form }, { timeoutMs: 30_000 });
  return { transcript: (body.transcript || '').trim(), language: body.language_code || lang };
}

// ---------------------------------------------------------------- chat (the "pandit")

function extractJson(s) {
  if (!s) return null;
  const start = s.indexOf('{');
  const end = s.lastIndexOf('}');
  if (start === -1 || end <= start) return null;
  try {
    return JSON.parse(s.slice(start, end + 1));
  } catch {
    return null;
  }
}

/**
 * Understand what the devotee said mid-puja: a navigation intent, or a question
 * to answer in their language, grounded in the current step.
 */
export async function askPandit({ utterance, lang, ritual, stepIndex, city }) {
  const language = languageByCode(lang)?.name ?? 'English';
  const step = ritual.steps[stepIndex];
  const outline = ritual.steps.map((s, i) => `${i + 1}. ${s.title}`).join('\n');
  const system = [
    `You are "Puja Saathi", a warm, patient elder guiding a young person through ${ritual.title} at home in ${city}.`,
    `They are on step ${stepIndex + 1} of ${ritual.steps.length}: "${step.title}" — ${step.text}`,
    `Full outline:\n${outline}`,
    `Samagri: ${ritual.samagri.join('; ')}.`,
    'Classify what they said and respond with ONLY a JSON object: {"intent": "next" | "back" | "repeat" | "answer", "reply": string}.',
    '- "next"/"back"/"repeat" only when they are clearly asking to move on, go back or hear the step again; reply may be empty then.',
    `- Otherwise intent is "answer": reply in ${language} (native script), in at most two short, spoken sentences.`,
    '- If something from the samagri is missing, suggest a simple, respectful household substitute.',
    '- Families have different customs; never scold, never be preachy, never invent elaborate rules.',
  ].join('\n');

  const body = await call(
    '/v1/chat/completions',
    {
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization: `Bearer ${KEY}` },
      body: JSON.stringify({
        model: sarvamConfig.chatModel,
        messages: [
          { role: 'system', content: system },
          { role: 'user', content: utterance },
        ],
        temperature: 0.4,
        max_tokens: 300,
        reasoning_effort: null,
      }),
    },
    { timeoutMs: 30_000 },
  );
  const content = body?.choices?.[0]?.message?.content ?? '';
  const parsed = extractJson(content);
  const intent = ['next', 'back', 'repeat', 'answer'].includes(parsed?.intent) ? parsed.intent : 'answer';
  const reply = (parsed?.reply ?? (parsed ? '' : content)).toString().trim();
  return { intent, reply };
}
