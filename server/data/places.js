// Cities, states and the languages Puja Saathi speaks.
// Every language listed here is supported end-to-end by Sarvam AI
// (speech-to-text, translation and text-to-speech).

export const LANGUAGES = [
  { code: 'hi-IN', name: 'Hindi', native: 'हिन्दी', script: 'deva' },
  { code: 'bn-IN', name: 'Bengali', native: 'বাংলা', script: 'beng' },
  { code: 'ta-IN', name: 'Tamil', native: 'தமிழ்', script: 'taml' },
  { code: 'te-IN', name: 'Telugu', native: 'తెలుగు', script: 'telu' },
  { code: 'mr-IN', name: 'Marathi', native: 'मराठी', script: 'deva' },
  { code: 'gu-IN', name: 'Gujarati', native: 'ગુજરાતી', script: 'gujr' },
  { code: 'kn-IN', name: 'Kannada', native: 'ಕನ್ನಡ', script: 'knda' },
  { code: 'ml-IN', name: 'Malayalam', native: 'മലയാളം', script: 'mlym' },
  { code: 'pa-IN', name: 'Punjabi', native: 'ਪੰਜਾਬੀ', script: 'guru' },
  { code: 'od-IN', name: 'Odia', native: 'ଓଡ଼ିଆ', script: 'orya' },
  { code: 'en-IN', name: 'English', native: 'English', script: 'latn' },
];

export const LANGUAGE_CODES = new Set(LANGUAGES.map((l) => l.code));

export const languageByCode = (code) => LANGUAGES.find((l) => l.code === code);

export const CITIES = [
  { id: 'delhi', name: 'Delhi', native: 'दिल्ली', state: 'Delhi', lang: 'hi-IN' },
  { id: 'mumbai', name: 'Mumbai', native: 'मुंबई', state: 'Maharashtra', lang: 'mr-IN' },
  { id: 'kolkata', name: 'Kolkata', native: 'কলকাতা', state: 'West Bengal', lang: 'bn-IN' },
  { id: 'chennai', name: 'Chennai', native: 'சென்னை', state: 'Tamil Nadu', lang: 'ta-IN' },
  { id: 'bengaluru', name: 'Bengaluru', native: 'ಬೆಂಗಳೂರು', state: 'Karnataka', lang: 'kn-IN' },
  { id: 'hyderabad', name: 'Hyderabad', native: 'హైదరాబాద్', state: 'Telangana', lang: 'te-IN' },
  { id: 'ahmedabad', name: 'Ahmedabad', native: 'અમદાવાદ', state: 'Gujarat', lang: 'gu-IN' },
  { id: 'amritsar', name: 'Amritsar', native: 'ਅੰਮ੍ਰਿਤਸਰ', state: 'Punjab', lang: 'pa-IN' },
  { id: 'kochi', name: 'Kochi', native: 'കൊച്ചി', state: 'Kerala', lang: 'ml-IN' },
  { id: 'bhubaneswar', name: 'Bhubaneswar', native: 'ଭୁବନେଶ୍ୱର', state: 'Odisha', lang: 'od-IN' },
];

export const cityById = (id) => CITIES.find((c) => c.id === id);
