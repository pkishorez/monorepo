// Usage: pnpm render <composition> [remotion flags]
// Renders one Explainer or Walkthrough to generated/<composition>.mp4
// (git-ignored). Extra flags go to Remotion. A Walkthrough keeps its
// recording's own 60 fps picture: Remotion mixes only its sound, which is
// laid under the recording.
// The finished mix is levelled to about -14.5 LUFS with true peaks under
// -1 dBTP, the level social video players expect.
import { execFileSync, spawnSync } from 'node:child_process';
import { existsSync, rmSync } from 'node:fs';

const [name, ...flags] = process.argv.slice(2);
if (!name) throw new Error('Usage: pnpm render <composition>');

const output = `generated/${name}.mp4`;
const recording = `public/recordings/${name}.mp4`;
const walkthrough = existsSync(recording);
const raw = `generated/${name}.raw.${walkthrough ? 'wav' : 'mp4'}`;
const loudness = -14.5;
// -2 dB of sample peak, oversampled, keeps true peaks under -1 dBTP.
const ceiling = 0.79;

execFileSync(
  'pnpm',
  [
    'exec',
    'remotion',
    'render',
    'src/studio.tsx',
    name,
    raw,
    ...(walkthrough ? ['--codec=wav'] : []),
    ...flags,
  ],
  { stdio: 'inherit' },
);

// First pass measures the mix's loudness; ffmpeg prints it on stderr.
const { stderr } = spawnSync(
  'ffmpeg',
  [
    '-hide_banner',
    '-nostats',
    '-i',
    raw,
    '-vn',
    '-af',
    'loudnorm=print_format=json',
    '-f',
    'null',
    '-',
  ],
  { encoding: 'utf8' },
);
const measured = stderr.match(/"input_i" : "(-?[\d.]+)"/)?.[1];
if (!measured) throw new Error(`Could not measure the loudness of ${raw}`);
// Then the whole mix is raised by one gain, and a limiter holds the few
// peaks that would pass the ceiling.
const gain = loudness - Number(measured);
execFileSync(
  'ffmpeg',
  [
    '-y',
    '-loglevel',
    'error',
    ...(walkthrough
      ? ['-i', recording, '-i', raw, '-map', '0:v', '-map', '1:a', '-shortest']
      : ['-i', raw]),
    '-c:v',
    'copy',
    '-af',
    `volume=${gain.toFixed(2)}dB,aresample=192000,alimiter=limit=${ceiling}:attack=1:release=60:level=false,aresample=48000`,
    '-c:a',
    'aac',
    '-b:a',
    '256k',
    '-movflags',
    '+faststart',
    output,
  ],
  { stdio: 'inherit' },
);
rmSync(raw);
