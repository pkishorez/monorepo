// The narration voices. `voice` is the one every Explainer speaks with;
// `pnpm voiceover <name> kokoro` speaks with the local one instead.
// Changing a voice changes the next voiceover run, not audio already made.
export const voices = {
  gemini: {
    engine: 'gemini',
    model: 'gemini-3.8-flash-tts',
    speaker: 'Charon',
    // Read before every line, to set the delivery.
    direction:
      'Read this like a calm, friendly teacher walking a developer through code, unhurried and clear:',
    speed: 1,
  },
  kokoro: {
    engine: 'kokoro',
    model: 'onnx-community/Kokoro-82M-v1.0-ONNX',
    speaker: 'am_michael',
    direction: '',
    speed: 1.05,
  },
} as const;

export type Voice = (typeof voices)[keyof typeof voices];

export const voice: Voice = voices.gemini;
