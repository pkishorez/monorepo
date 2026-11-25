import type { Runtime, Snapshot } from '@kestack/kabuki';
// Named in the declarations of the Actor this file exports.
import type {} from '@kestack/kabuki/types';
import { SPEECH_CONTROLS, SpeechFake } from './actor.js';
import { speechFakeOver } from './serve.js';

/*
 * `@kestack/ai-toolkit/speech/fake`: the Speech fake, Speech to Text as a
 * computer has it, as a Fake the Fake World runs. Its Actor starts blank,
 * switched off with nothing on disk. The model downloads by itself once
 * the app asks for it, and its one Control says what every Take turns
 * into. `serve` gives `Speech`: the real speech model and Takes over the
 * fake. Browser-safe: nothing here imports Node.
 *
 * `kept` is the Snapshot a reload keeps: no download running, as one dies
 * with a computer's restart; the wish and the model on disk stay.
 *
 * `makeFakeSpeech` is the older fake for tests: a `SpeechToText` under
 * the Node `speechLayer`.
 */

const kept = (
  snapshot: Snapshot<typeof SpeechFake>,
): Snapshot<typeof SpeechFake> => ({
  ...snapshot,
  root: {
    ...snapshot.root,
    model: { ...snapshot.root.model, downloading: null },
  },
});

export const speech = {
  name: 'Speech',
  actor: SpeechFake,
  controls: SPEECH_CONTROLS,
  serve: (runtime: Runtime<typeof SpeechFake>) => speechFakeOver(runtime),
  kept,
};

export {
  blank,
  SPEECH_CONTROLS,
  SpeechFake,
  type SpeechMessage,
  type SpeechModel,
} from './actor.js';
export { HEARD_TEXT, SPEECH_MODEL_BYTES, speechFakeOver } from './serve.js';
export {
  FAKE_MODEL_BYTES,
  makeFakeSpeech,
  type FakeSpeech,
} from './fake-speech.js';
