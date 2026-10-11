// The one place that knows the text-to-speech engines. `pnpm voiceover`
// only needs a WAV file for each line.
import { execFileSync } from 'node:child_process';
import { readFileSync, rmSync, writeFileSync } from 'node:fs';
import { KokoroTTS } from 'kokoro-js';
import type { Voice } from '../src/foundation/voice/index.ts';

let kokoro: KokoroTTS | undefined;

// Speaks `text` in `voice` into the WAV file at `wav`.
export async function speak(voice: Voice, text: string, wav: string) {
  if (voice.engine === 'gemini') return gemini(voice, text, wav);
  kokoro ??= await KokoroTTS.from_pretrained(voice.model, {
    dtype: 'q8',
    device: 'cpu',
  });
  const audio = await kokoro.generate(text, {
    voice: voice.speaker as never,
    speed: voice.speed,
  });
  await audio.save(wav);
}

// Gemini answers with raw 24 kHz, 16-bit mono PCM; ffmpeg wraps it as WAV.
async function gemini(voice: Voice, text: string, wav: string) {
  const key = process.env.GEMINI_API_KEY ?? keyFromEnvFile();
  if (!key)
    throw new Error('Set GEMINI_API_KEY, or put it in apps/ai-explainer/.env');
  const response = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${voice.model}:generateContent`,
    {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-goog-api-key': key },
      body: JSON.stringify({
        contents: [{ parts: [{ text: `${voice.direction} ${text}` }] }],
        generationConfig: {
          responseModalities: ['AUDIO'],
          speechConfig: {
            voiceConfig: { prebuiltVoiceConfig: { voiceName: voice.speaker } },
          },
        },
      }),
    },
  );
  const body = (await response.json()) as {
    error?: { message: string };
    candidates?: { content: { parts: { inlineData: { data: string } }[] } }[];
  };
  const data = body.candidates?.[0]?.content.parts[0]?.inlineData.data;
  if (!response.ok || !data)
    throw new Error(
      `Gemini could not speak: ${body.error?.message ?? response.status}`,
    );
  const pcm = `${wav}.pcm`;
  writeFileSync(pcm, Buffer.from(data, 'base64'));
  execFileSync('ffmpeg', [
    '-y',
    '-loglevel',
    'error',
    '-f',
    's16le',
    '-ar',
    '24000',
    '-ac',
    '1',
    '-i',
    pcm,
    wav,
  ]);
  rmSync(pcm);
}

function keyFromEnvFile() {
  try {
    return readFileSync('.env', 'utf8')
      .match(/^GEMINI_API_KEY=(.+)$/m)?.[1]
      ?.trim();
  } catch {
    return undefined;
  }
}
