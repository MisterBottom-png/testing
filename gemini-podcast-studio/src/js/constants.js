'use strict';

const STORAGE_KEY = 'geminiPodcastStudio.preferences.v2';
const API_KEY_STORAGE_KEY = 'geminiPodcastStudio.apiKey.v1';
const SESSION_KEY = 'geminiPodcastStudio.sessionKey.v1';
const DEFAULT_MAX_TTS_CHARACTERS = 12000;
const MAX_HISTORY = 30;

const SCRIPT_PROGRESS_MESSAGES = [
  'Planning the episode…',
  'Defining the discussion…',
  'Writing the dialogue…',
  'Checking the structure…'
];
const AUDIO_PROGRESS_MESSAGES = [
  'Preparing the transcript…',
  'Assigning character voices…',
  'Generating the conversation…',
  'Processing the audio…'
];

const CHARACTER_TEMPLATES = [
  { name: 'Anna', role: 'Astrophysicist', personality: 'Enthusiastic, intelligent and optimistic', direction: 'Speak warmly and clearly with lively pacing', accent: '' },
  { name: 'Mark', role: 'Sceptical journalist', personality: 'Dry, curious and politely challenging', direction: 'Speak calmly with restrained humour', accent: '' },
  { name: 'Maya', role: 'Science presenter', personality: 'Curious, precise and approachable', direction: 'Speak clearly with confident conversational energy', accent: '' },
  { name: 'Jonas', role: 'Critical analyst', personality: 'Thoughtful, pragmatic and mildly witty', direction: 'Speak evenly with deliberate pacing', accent: '' },
  { name: 'Elena', role: 'Historian', personality: 'Reflective, vivid and intellectually playful', direction: 'Speak warmly with measured emphasis', accent: '' },
  { name: 'David', role: 'Investigative host', personality: 'Direct, sceptical and fair-minded', direction: 'Speak calmly with crisp articulation', accent: '' }
];

const VOICES = [
  ['Zephyr', 'Bright'], ['Puck', 'Upbeat'], ['Charon', 'Informative'],
  ['Kore', 'Firm'], ['Fenrir', 'Excitable'], ['Leda', 'Youthful'],
  ['Orus', 'Firm'], ['Aoede', 'Breezy'], ['Callirrhoe', 'Easy-going'],
  ['Autonoe', 'Bright'], ['Enceladus', 'Breathy'], ['Iapetus', 'Clear'],
  ['Umbriel', 'Easy-going'], ['Algieba', 'Smooth'], ['Despina', 'Smooth'],
  ['Erinome', 'Clear'], ['Algenib', 'Gravelly'], ['Rasalgethi', 'Informative'],
  ['Laomedeia', 'Upbeat'], ['Achernar', 'Soft'], ['Alnilam', 'Firm'],
  ['Schedar', 'Even'], ['Gacrux', 'Mature'], ['Pulcherrima', 'Forward'],
  ['Achird', 'Friendly'], ['Zubenelgenubi', 'Casual'], ['Vindemiatrix', 'Gentle'],
  ['Sadachbia', 'Lively'], ['Sadaltager', 'Knowledgeable'], ['Sulafat', 'Warm']
];

const ICONS = {
  settings: '<svg class="icon" viewBox="0 0 24 24" aria-hidden="true"><path d="M12 15.5a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7Z"/><path d="M19.4 15a1.7 1.7 0 0 0 .34 1.88l.06.06-2.83 2.83-.06-.06A1.7 1.7 0 0 0 15 19.4a1.7 1.7 0 0 0-1 .6l-.04.08V22h-4v-1.92l-.04-.08a1.7 1.7 0 0 0-1-.6 1.7 1.7 0 0 0-1.88.34l-.06.06-2.83-2.83.06-.06A1.7 1.7 0 0 0 4.6 15a1.7 1.7 0 0 0-.6-1l-.08-.04H2v-4h1.92L4 9.92a1.7 1.7 0 0 0 .6-1 1.7 1.7 0 0 0-.34-1.88l-.06-.06 2.83-2.83.06.06A1.7 1.7 0 0 0 9 4.6a1.7 1.7 0 0 0 1-.6l.04-.08V2h4v1.92l.04.08a1.7 1.7 0 0 0 1 .6 1.7 1.7 0 0 0 1.88-.34l.06-.06 2.83 2.83-.06.06A1.7 1.7 0 0 0 19.4 9c.12.4.33.75.6 1l.08.04H22v4h-1.92L20 14.08a1.7 1.7 0 0 0-.6.92Z"/></svg>',
  sun: '<svg class="icon" viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.93 4.93l1.42 1.42M17.66 17.66l1.41 1.41M2 12h2M20 12h2M4.93 19.07l1.42-1.42M17.66 6.34l1.41-1.41"/></svg>',
  moon: '<svg class="icon" viewBox="0 0 24 24" aria-hidden="true"><path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8Z"/></svg>',
  close: '<svg class="icon" viewBox="0 0 24 24" aria-hidden="true"><path d="m18 6-12 12M6 6l12 12"/></svg>',
  more: '<svg class="icon" viewBox="0 0 24 24" aria-hidden="true"><circle cx="5" cy="12" r="1"/><circle cx="12" cy="12" r="1"/><circle cx="19" cy="12" r="1"/></svg>',
  grip: '<svg class="icon" viewBox="0 0 24 24" aria-hidden="true"><circle cx="9" cy="5" r="1"/><circle cx="15" cy="5" r="1"/><circle cx="9" cy="12" r="1"/><circle cx="15" cy="12" r="1"/><circle cx="9" cy="19" r="1"/><circle cx="15" cy="19" r="1"/></svg>',
  chevron: '<svg class="icon" viewBox="0 0 24 24" aria-hidden="true"><path d="m6 9 6 6 6-6"/></svg>'
};
