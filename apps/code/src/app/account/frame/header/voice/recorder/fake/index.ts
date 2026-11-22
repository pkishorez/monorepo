import type { Runtime, Snapshot } from '@kestack/kabuki';
import { MICROPHONE_CONTROLS, MicrophoneFake } from './actor.ts';
import { microphoneOver } from './serve.ts';

/*
 * The Microphone fake: the microphones of the computer the browser runs
 * on, as a Fake the Fake World runs, for Code's fake mode (`src/fake.ts`).
 * Its Actor starts with the Built-in Microphone, the site yet to be
 * allowed; its Controls plug microphones in and out, answer the browser's
 * ask, make opening slow, broken or blocked, and the sound loud or silent.
 * `serve` gives `Recorder`, the real one over it, its audio made-up PCM
 * the Speech fake hears as any other.
 *
 * `kept` is the Snapshot a reload keeps: no ask waiting and nothing
 * recording, as the page that asked is gone, and no longer blocked, as a
 * reload is what ends it.
 */

const kept = (
  snapshot: Snapshot<typeof MicrophoneFake>,
): Snapshot<typeof MicrophoneFake> => ({
  ...snapshot,
  root: {
    ...snapshot.root,
    model: {
      ...snapshot.root.model,
      asking: false,
      recording: null,
      untilReload: { blocked: false },
    },
  },
});

export const microphone = {
  name: 'Microphone',
  actor: MicrophoneFake,
  controls: MICROPHONE_CONTROLS,
  serve: (runtime: Runtime<typeof MicrophoneFake>) => microphoneOver(runtime),
  kept,
};

export {
  blank,
  MICROPHONE_CONTROLS,
  MicrophoneFake,
  PLUGGED_IN,
  type MicrophoneMessage,
  type MicrophoneModel,
} from './actor.ts';
export { microphoneOver } from './serve.ts';
export { CHUNK, CHUNK_MS, chunkOf } from './sound.ts';
