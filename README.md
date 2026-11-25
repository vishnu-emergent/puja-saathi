# 🪔 Puja Saathi

**Your puja, guided out loud in your mother tongue, at your city's muhurat.**

Every Deepavali, millions of young Indians celebrate far from home: in hostels, PGs and first apartments. They want to do the puja properly, so they end up on a video call with Amma halfway through: *"what do I do with the rice?"*

Puja Saathi is a patient elder in your pocket. Pick your city and language. It opens at **your city's muhurat** and teaches **your region's ritual**: Lakshmi Puja in Delhi, Kali Puja in Kolkata on the same night, Karthigai Deepam in Chennai, Lohri in Amritsar, Pongal at sunrise. It walks you through every step aloud. Tap the diya and ask *"I don't have marigolds, what can I use?"* in Bengali, and it answers in Bengali.

> **The insight:** India's festive traffic follows the **panchang**, not the clock. Millions of people open the same app at the same auspicious minute, in different languages, for different rituals. Serving that well needs three things, and each of them needs one of the sponsors' tools.

## Why each sponsor tool is essential

| | Problem | What Puja Saathi does |
|---|---|---|
| **Sarvam AI** | It's useless unless it speaks your language | Every ritual is translated into 11 languages (`sarvam-translate:v1`) and read aloud (`bulbul:v3`). Your questions are transcribed (`saaras:v4`) and answered in your language, grounded in the current step (`sarvam-105b-conversations`). |
| **Flagsmith** | India isn't one festival: rituals vary by region and festivals are time-bound | Each devotee is an identity with traits `{city, state, language, festival}`. **Segments** choose the ritual. `bengal_diwali_night` turns Lakshmi Puja into Kali Puja for West Bengal on the same night. **Remote config** holds the ritual pack and the pre-muhurat lead time. A **50% percentage-split A/B test** checks whether explaining *why* each step matters (story mode) helps people finish. **Kill switches** (`voice_guide`, `ai_pandit`) shed load in a rush. |
| **NudgeBee** | Everyone arrives at the same minute | **Proactive:** the panchang is compiled into NudgeBee **schedule triggers** (UTC cron) that pre-scale the guide 20 min before each city's muhurat. **Reactive:** when p95 crosses the threshold, the app fires a NudgeBee **webhook workflow**: Slack **approval** → `k8s.horizontal_rightsize` → **HTTP task flips Flagsmith `voice_guide` off** → devotees see a quiet-mode notice in their own language → the workflow reports back to the control room. |

The tools are chained in a single causal loop: **NudgeBee detects → scales Kubernetes → flips a Flagsmith flag → every devotee is told in their own language by Sarvam.**

## Two surfaces

- **`/`**: the devotee app. Welcome → muhurat countdown and samagri checklist → guided session (the diya is the mic, and its flame grows with your voice) → completion.
- **`/ops`**: **Muhurat Control**. It shows:
  - A festive timeline you can time-travel through.
  - Three live phones re-segmenting in real time.
  - Every Flagsmith segment, lit when it matches.
  - The rush simulator, with a p95 chart, the number of pods answering, and a 6-step incident tracker.
  - The NudgeBee pre-scale schedule compiled from the panchang.
  - Live A/B results.
  - An event stream.

## Quick start (local, about 2 minutes)

```bash
cp .env.example .env        # add your keys (all optional; see below)
npm install
npm run build && npm start  # → http://localhost:8787   and   http://localhost:8787/ops
# or, for development with hot reload:
npm run dev                 # → http://localhost:5173
```

Without any keys the app still runs. Flags come from an offline mirror of the same spec, and the UI says so. Voice needs `SARVAM_API_KEY`.

### Flagsmith (about 1 minute)
1. Create a project and copy the environment's **client-side key** into `FLAGSMITH_ENVIRONMENT_KEY`. A **server-side key** (`ser.…`) in `FLAGSMITH_SERVER_KEY` turns on local evaluation, which is recommended.
2. Create an **Organisation API key** and put it in `FLAGSMITH_ADMIN_API_KEY`.
3. `npm run flagsmith:setup` creates the 5 features, 5 segments and every segment override, and prints the exact URL NudgeBee should PATCH.

### Sarvam AI
Put your key in `SARVAM_API_KEY`. Then pre-translate (and optionally pre-voice) every pack so the demo is instant:
```bash
npm start &            # server must be running
npm run warm           # add -- --voice to pre-synthesize every step
```

### NudgeBee + Kubernetes (kind)
```bash
brew install kind helm
./k8s/deploy.sh        # kind cluster → build image → deploy web (1) + guide workers (2)
```
Install the NudgeBee agent into the cluster, then build the three automations described in **[nudgebee/WORKFLOWS.md](nudgebee/WORKFLOWS.md)**. Put the webhook URL in `.env` and re-run `./k8s/deploy.sh`.
`npm run panchang:cron` prints every pre-scale cron.

## Demo script (2 minutes)

1. **`/ops`**: three phones, Kolkata/Bengali, Delhi/Hindi and Chennai/Tamil. Click **Deepavali** on the timeline. Kolkata becomes **Kali Puja** while Delhi gets **Lakshmi Puja**, and the `bengal_diwali_night` segment lights up. Click **Thai Pongal**: Chennai turns to daylight. *One Flagsmith segment, no deploy.*
2. **`/` on a phone**: Kolkata, Bengali. Begin the puja. It speaks the step in Bengali. Tap the diya: *"আমার কাছে জবা ফুল নেই"* ("I don't have hibiscus"). The answer is grounded in the step and spoken back in Bengali.
3. **Back on `/ops`**: **Simulate muhurat rush** in Mumbai. p95 shoots past 600 ms, and the incident goes to **NudgeBee**. Approve in Slack. Pods go 2 → 8, the `voice_guide` flag flips off, and every phone shows the quiet-mode banner in its own language. Latency recovers.
4. The schedule table shows the proactive half: NudgeBee crons compiled from the panchang, with a lead time set by a Flagsmith value.

## Architecture

```
            devotee browser ─┐                       ┌─ Sarvam AI (STT · translate · TTS · chat)
                             ▼                       │
  /ops ──SSE──▶  puja-saathi-web (Express + React)  ─┼─ Flagsmith (identity flags, local eval; Admin API)
                   │  rush probe (new TCP conn/req)  │
                   ▼                                 └─ NudgeBee webhook ──▶ approval → scale → Flagsmith PATCH
            Service puja-saathi ──▶ guide workers ×N ◀───────────── k8s.horizontal_rightsize ─┘
                                     /metrics (Prometheus)              ▲ schedule triggers from the panchang
```

- `server/data/flag-spec.js`: the single source of truth for Flagsmith features and segments. It drives the setup script and the offline mirror.
- `server/data/festivals.js`: the festive calendar and per-city muhurat times. These are representative values; production would call a panchang API.
- `server/data/rituals.js`: five home-friendly ritual packs, written once in English and translated by Sarvam on demand, with a disk cache.
- `server/schedule.js`: compiles the panchang into NudgeBee cron.

## Disclosure

Built during Festive Hacks (25 Nov 2026). I built it with an AI coding assistant (Claude Code), as the rules allow, and I've reviewed and understand all the code. Muhurat times are illustrative. Ritual steps are simplified for first-timers, and families' customs vary.
