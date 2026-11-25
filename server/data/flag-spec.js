// Single source of truth for the Flagsmith project.
// `npm run flagsmith:setup` creates exactly this in your Flagsmith project,
// and the server's offline mirror evaluates exactly this when Flagsmith is
// not configured — so the app behaves the same either way.

export const FEATURES = [
  {
    name: 'ritual_pack',
    description: 'Remote config: which ritual the guide teaches. Chosen per segment (state × festival).',
    default_enabled: true,
    value: { type: 'string', value: 'lakshmi_puja' },
  },
  {
    name: 'voice_guide',
    description: 'Kill switch for live voice (Sarvam STT/TTS). NudgeBee turns this off during a muhurat rush.',
    default_enabled: true,
    value: null,
  },
  {
    name: 'ai_pandit',
    description: 'Free-form questions answered by Sarvam-105B. Can be switched off to cap cost or latency.',
    default_enabled: true,
    value: null,
  },
  {
    name: 'guide_style',
    description: 'A/B test: "steps" (instructions only) vs "story" (adds the meaning behind each step).',
    default_enabled: true,
    value: { type: 'string', value: 'steps' },
  },
  {
    name: 'pre_muhurat_minutes',
    description: 'Lead time before each muhurat: when the app opens the session and NudgeBee pre-scales.',
    default_enabled: true,
    value: { type: 'integer', value: '20' },
  },
];

const eq = (property, value) => ({ operator: 'EQUAL', property, value });

export const SEGMENTS = [
  {
    name: 'bengal_diwali_night',
    description: 'West Bengal on Deepavali night worships Ma Kali, not Lakshmi.',
    conditions: [eq('state', 'West Bengal'), eq('festival', 'diwali')],
    overrides: [{ feature: 'ritual_pack', value: { type: 'string', value: 'kali_puja' } }],
  },
  {
    name: 'karthigai_deepam_homes',
    description: 'Homes observing Karthigai Deepam / Thrikarthika.',
    conditions: [eq('festival', 'karthigai')],
    overrides: [{ feature: 'ritual_pack', value: { type: 'string', value: 'karthigai_deepam' } }],
  },
  {
    name: 'pongal_morning',
    description: 'Thai Pongal sunrise.',
    conditions: [eq('festival', 'pongal')],
    overrides: [{ feature: 'ritual_pack', value: { type: 'string', value: 'pongal' } }],
  },
  {
    name: 'lohri_night',
    description: 'Lohri bonfire night.',
    conditions: [eq('festival', 'lohri')],
    overrides: [{ feature: 'ritual_pack', value: { type: 'string', value: 'lohri' } }],
  },
  {
    name: 'story_mode_experiment',
    description: 'A/B: 50% of devotees get the meaning behind every step.',
    conditions: [{ operator: 'PERCENTAGE_SPLIT', property: null, value: '50' }],
    overrides: [{ feature: 'guide_style', value: { type: 'string', value: 'story' } }],
  },
];
