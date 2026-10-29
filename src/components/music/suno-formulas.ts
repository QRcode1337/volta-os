// Building blocks for Suno prompts: bracketed composition cues for lyrics, style-tag chips, and the speech-tone and
// sound formulas. Plain data + string helpers, no runtime imports, so the panel and the server draft prompts share it.

export interface ChipGroup {
  label: string;
  chips: string[];
}

/** Song sections; inserting one adds `[Name – descriptor]` and an empty cue line to fill in. */
export const SONG_SECTIONS: { name: string; hint: string }[] = [
  { name: 'Intro', hint: 'airy, ominous' },
  { name: 'Verse', hint: 'restrained, intimate' },
  { name: 'Pre-Hook', hint: 'lift, tension' },
  { name: 'Hook', hint: 'huge, melodic, anthem-sized' },
  { name: 'Post-Hook', hint: 'chantable' },
  { name: 'Bridge', hint: 'tempo fractures, whispers spiral' },
  { name: 'Breakdown', hint: 'half-time, stripped back' },
  { name: 'Drop', hint: 'full weight' },
  { name: 'Final Hook', hint: 'maximal, cathartic' },
  { name: 'Outro', hint: 'fading ritual' },
];

/** Production cues that go inside square brackets on the line under a section header. */
export const LYRIC_CUES: ChipGroup[] = [
  { label: 'Dynamics', chips: ['Pianissimo', 'Piano', 'Mezzo-forte', 'Forte', 'Fortissimo', 'Crescendo', 'Decrescendo', 'Piano to forte rebuild'] },
  { label: 'Drums', chips: ['Half-time trap beat', 'Full drums', 'Drums cut', 'Drums fall away', 'Muted kick', 'Syncopated kick', '808 glide', 'Open hats', 'Double-time hats over half-time drums', 'Glitch percussion', 'Metallic ticks', 'Filtered drums', 'Sub heartbeat'] },
  { label: 'Vocals', chips: ['Whispered layers', 'Low male vocal', 'Wide female lead', 'Female ghost harmonies', 'Choir in fifths', 'Full choir', 'Octave doubles', 'Low chant response', 'Lead ad-libs', 'Reversed vocals', 'Spoken word'] },
  { label: 'Harmony', chips: ['Harmonic minor tension', 'Phrygian dominant lead motif', 'Chromatic choir cluster', 'Choir hold on root', 'Ascending synth arp', 'Soft bell arpeggio', 'Bell arp slows'] },
  { label: 'Texture / FX', chips: ['Reverse choir', 'Low sub-rumble', 'Distant thunder', 'Filtered pad', 'Cosmic wind', 'Glitch stutters', 'Tape wobble', 'VHS click', 'Static pops', 'Creature breath FX', 'Stereo glitch cuts'] },
];

/** Chips for the comma-separated style prompt. */
export const STYLE_GROUPS: ChipGroup[] = [
  { label: 'Genre', chips: ['melodic industrial trap', 'darksynth', 'glitch hop', '8-bit toycore', 'dark cinematic anthem', 'witch house', 'psytrance', 'indietronica', 'ambient', 'post-hardcore', 'black metal', 'lo-fi'] },
  { label: 'Mood', chips: ['dark emotional', 'eerie childhood nostalgia', 'ominous', 'cathartic', 'ritualistic', 'melancholic', 'triumphant', 'hypnotic'] },
  { label: 'Instruments', chips: ['deep moog synth', 'toy piano arpeggios', 'reversed bell chimes', 'wide choirs', 'evolving arpeggios', 'sub-heavy 808s', 'deep synth thump', 'glassy synth plucks', 'muted analog bass', 'warm rhodes'] },
  { label: 'Texture / FX', chips: ['TV static', 'VHS click', 'static pops', 'creature breath FX', 'whispered counting', 'stereo glitch cuts', 'tape wobble', 'vinyl crackle', 'granular delay'] },
  { label: 'Rhythm', chips: ['half time groove', 'syncopated rhythm', 'layered breakdowns', 'sub-heavy drops', 'double-time hats', 'fragments'] },
  { label: 'Vocals', chips: ['massive female hook', 'deep male verses', 'melodic syncopated harmonies', 'whispered vocals', 'choir in fifths', 'instrumental'] },
];

/** Chips for Suno Speech's Tone field: delivery, pacing, mood and setting. */
export const TONE_GROUPS: ChipGroup[] = [
  { label: 'Voice', chips: ['low warm male voice', 'soft female voice', 'raspy older voice', 'young bright voice', 'deep gravelly voice', 'breathy whisper'] },
  { label: 'Pacing', chips: ['slow and deliberate', 'measured pauses', 'urgent and quick', 'conversational', 'hushed', 'building intensity'] },
  { label: 'Mood', chips: ['ominous', 'intimate', 'documentary calm', 'conspiratorial', 'awestruck', 'cold and clinical', 'unsettling'] },
  { label: 'Setting', chips: ['close mic', 'late-night radio', 'old phone line', 'empty cathedral reverb', 'small dry room', 'field recording', 'VHS tape narration'] },
];

/** Chips for Suno Sounds: one-shots and loops for video audio. */
export const SOUND_GROUPS: ChipGroup[] = [
  { label: 'Source', chips: ['deep sub boom', 'whoosh', 'glitch burst', 'heartbeat', 'distant thunder', 'creature breath', 'radio static', 'metal scrape', 'bell hit', 'choir swell', 'riser', 'impact'] },
  { label: 'Texture', chips: ['metallic', 'granular', 'tape-saturated', 'bitcrushed', 'airy', 'wet', 'crunchy', 'clean'] },
  { label: 'Space', chips: ['huge cathedral reverb', 'tight dry room', 'outdoor night', 'underwater', 'inside a tunnel', 'through a wall'] },
  { label: 'Character', chips: ['cinematic', 'eerie', 'lo-fi', 'VHS', 'sci-fi', 'horror sting', 'documentary', 'transition'] },
];

export const KEYS = ['Any', 'C major', 'C minor', 'D minor', 'D harmonic minor', 'E minor', 'F minor', 'G minor', 'A minor', 'Bb minor', 'B minor'] as const;

export interface LyricHeader {
  title: string;
  bpm: string;
  genre: string;
  key: string;
  meter: string;
  vocals: string;
  arrangement: string;
}

/** The bracket block at the top of a lyric sheet, e.g. `[152 BPM] [Melodic Industrial Trap] [Key: D harmonic minor] [4/4]`. */
export function lyricHeader(h: LyricHeader): string {
  const line = (parts: (string | false)[]) => parts.filter(Boolean).map((p) => `[${p}]`).join(' ');
  return [
    h.title.trim() && `[⟟ “${h.title.trim().toUpperCase()}” ⟟]`,
    line([h.bpm.trim() && `${h.bpm.trim()} BPM`, h.genre.trim(), h.key.trim() && h.key !== 'Any' && `Key: ${h.key.trim()}`, h.meter.trim()]),
    line([h.vocals.trim()]),
    line([h.arrangement.trim() && `Use ${h.arrangement.trim()}`]),
  ]
    .filter(Boolean)
    .join('\n');
}

export const sectionBlock = (name: string, hint: string) => `[${name}${hint ? ` – ${hint}` : ''}]\n[ ]\n`;

/** Add a chip to a comma-separated list, or take it out when it is already there. */
export function toggleListItem(list: string, item: string): string {
  const items = list
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
  const i = items.findIndex((s) => s.toLowerCase() === item.toLowerCase());
  if (i >= 0) items.splice(i, 1);
  else items.push(item);
  return items.join(', ');
}

export const hasListItem = (list: string, item: string) =>
  list
    .split(',')
    .map((s) => s.trim().toLowerCase())
    .includes(item.toLowerCase());

// ── built-in examples (Patrick's own prompts) ──

export const EXAMPLE_STYLE =
  'Dark emotional 8-bit toycore, glitch hop, darksynth ambient, toy piano arpeggios, reversed bell chimes, whispered counting, deep synth thump, static pops, syncopated rhythm, fragments, VHS click, TV static, creature breath FX, half time groove, layered breakdowns, stereo glitch cuts, eerie childhood nostalgia, deep moog synth, melodic syncopated harmonies';

/** Opening of "Forbidden Names": the bracket format the lyric composer and the AI drafts follow. */
export const EXAMPLE_LYRICS_SKELETON = `⟁ The sigil is compressed… the spell made sharper for the machine to sing ⟁

[⟟ “FORBIDDEN NAMES” ⟟]
[152 BPM] [Melodic Industrial Trap] [Key: D harmonic minor] [4/4]
[Massive female hook + deep male verses] [Dark cinematic anthem]
[Use evolving arpeggios, wide choirs, sub-heavy drops, harmonic minor tension, half-time breakdown]

[Intro – airy, ominous]
[Soft bell arpeggio: D–F–A–C] [Reverse choir] [Low sub-rumble] [Distant thunder] [Filtered pad] [Pianissimo]
[Whispered layers]
Say the names…
Wake the flame…
What was buried…
Still remains…

[Verse 1 – restrained, intimate]
[Half-time trap beat] [Muted kick] [808 glide] [Metallic ticks] [Low male vocal] [Dm–C–Bb–A]
Semjaza on the mountain, oath-fire in the snow,
Spoke a vow in silence only fallen stars could know.

[Pre-Hook – lift, tension]
[Open hats] [Ascending synth arp] [Female ghost harmonies] [Crescendo] [Bb–C–Dm–A]
Every name is a mirror,
Every art is a spark,

[Hook – huge, melodic, anthem-sized]
[Full drums] [Wide female lead] [Choir in fifths] [Octave doubles] [Forte] [Dm–Bb–F–C]
Say the forbidden names, let the sky cave in,
Feel the old world shake underneath your skin.

[Outro – fading ritual]
[Drums fall away] [Bell arp slows] [Choir hold on D] [Cosmic wind] [Pianissimo]
They were never gone…
Only waiting…`;

/** What each AI draft writes. */
export type DraftKind = 'style' | 'lyrics' | 'tone' | 'script' | 'sound';

export const DRAFT_LIMITS: Record<DraftKind, number> = { style: 1000, lyrics: 5000, tone: 500, script: 5000, sound: 500 };
