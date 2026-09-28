// The narration voice every Explainer speaks with. Changing it changes the
// voice of the next voiceover run, not of audio already generated.
export const voice = {
  model: 'onnx-community/Kokoro-82M-v1.0-ONNX',
  speaker: 'af_heart',
  speed: 1,
} as const;
