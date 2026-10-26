import { pcm } from './pcm.ts';

/*
 * The AudioWorklet that hears the microphone: it runs `pcm` on every block
 * and posts each Chunk it completes to the page, the samples moved, not
 * copied. Its outputs stay silent. Loaded from its own source text, so no
 * file of its own has to be served.
 */

/** The processor's name, as the page asks for it. */
export const PROCESSOR = 'code-dictation';

/** About an eighth of a second at 16 kHz: how often the level moves. */
const CHUNK = 2048;

/** The processor's own source text, which carries `pcm` in it. */
export const source = `
const pcm = ${pcm.toString()};
registerProcessor(${JSON.stringify(PROCESSOR)}, class extends AudioWorkletProcessor {
  constructor() {
    super();
    this.chunks = pcm(sampleRate, ${CHUNK});
  }
  process(inputs) {
    const input = inputs[0];
    if (input !== undefined && input.length > 0)
      for (const chunk of this.chunks(input))
        this.port.postMessage(chunk, [chunk.samples.buffer]);
    return true;
  }
});
`;

/** Adds the processor to `context`. */
export const addProcessor = async (context: AudioContext) => {
  const url = URL.createObjectURL(
    new Blob([source], { type: 'text/javascript' }),
  );
  try {
    await context.audioWorklet.addModule(url);
  } finally {
    URL.revokeObjectURL(url);
  }
};
