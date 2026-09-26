/**
 * The Kokoro voices worth offering: every English voice graded C or better
 * on the model card. The first letter of an id picks the accent, the second
 * the gender.
 */
export const voices = [
  { id: 'af_heart', name: 'Heart', accent: 'American', gender: 'female' },
  { id: 'af_bella', name: 'Bella', accent: 'American', gender: 'female' },
  { id: 'af_nicole', name: 'Nicole', accent: 'American', gender: 'female' },
  { id: 'af_aoede', name: 'Aoede', accent: 'American', gender: 'female' },
  { id: 'af_kore', name: 'Kore', accent: 'American', gender: 'female' },
  { id: 'af_sarah', name: 'Sarah', accent: 'American', gender: 'female' },
  { id: 'af_alloy', name: 'Alloy', accent: 'American', gender: 'female' },
  { id: 'af_nova', name: 'Nova', accent: 'American', gender: 'female' },
  { id: 'am_fenrir', name: 'Fenrir', accent: 'American', gender: 'male' },
  { id: 'am_michael', name: 'Michael', accent: 'American', gender: 'male' },
  { id: 'am_puck', name: 'Puck', accent: 'American', gender: 'male' },
  { id: 'bf_emma', name: 'Emma', accent: 'British', gender: 'female' },
  { id: 'bf_isabella', name: 'Isabella', accent: 'British', gender: 'female' },
  { id: 'bm_george', name: 'George', accent: 'British', gender: 'male' },
  { id: 'bm_fable', name: 'Fable', accent: 'British', gender: 'male' },
] as const;

export type Voice = (typeof voices)[number];
export type VoiceId = Voice['id'];

export const defaultVoice: VoiceId = 'af_heart';

/** Kokoro truncates past about 500 phonemes, so longer runs are cut at spaces. */
const longestPiece = 300;

const cutAtSpaces = (sentence: string): ReadonlyArray<string> => {
  const pieces: Array<string> = [];
  let piece = '';
  for (const word of sentence.split(/\s+/)) {
    if (piece && piece.length + word.length + 1 > longestPiece) {
      pieces.push(piece);
      piece = word;
    } else {
      piece = piece ? `${piece} ${word}` : word;
    }
  }
  if (piece) pieces.push(piece);
  return pieces;
};

/** The text in the pieces Kokoro speaks one at a time: sentences, cut short. */
export const sentencesOf = (text: string): ReadonlyArray<string> =>
  [...new Intl.Segmenter('en', { granularity: 'sentence' }).segment(text)]
    .map(({ segment }) => segment.trim())
    .filter((sentence) => sentence.length > 0)
    .flatMap(cutAtSpaces);
