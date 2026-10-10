// The one place that knows which text-to-speech engine speaks the Foundation
// voice. To change engines, rewrite this file: `pnpm voiceover` only needs a
// WAV file for each line.
import { KokoroTTS } from 'kokoro-js';
import { voice } from '../src/foundation/voice/index.ts';

let tts: KokoroTTS | undefined;

// Speaks `text` into the WAV file at `wav`.
export async function speak(text: string, wav: string) {
  tts ??= await KokoroTTS.from_pretrained(voice.model, {
    dtype: 'q8',
    device: 'cpu',
  });
  const audio = await tts.generate(text, {
    voice: voice.speaker as never,
    speed: voice.speed,
  });
  await audio.save(wav);
}
