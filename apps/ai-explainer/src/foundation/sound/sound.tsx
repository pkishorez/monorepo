import { Audio, Sequence } from 'remotion';
import { fps, mix } from '../canvas/index.ts';
import { bed } from './bed.ts';
import chime from './sounds/chime.mp3';
import click from './sounds/click.mp3';
import musicBed from './sounds/music-bed.mp3';
import swell from './sounds/swell.mp3';
import whoosh from './sounds/whoosh.mp3';

// Each effect with the level it plays at under a voice levelled to -18 LUFS:
// heard, never competing.
const effects = {
  whoosh: { src: whoosh, volume: 0.22 },
  click: { src: click, volume: 0.45 },
  swell: { src: swell, volume: 0.42 },
  chime: { src: chime, volume: 0.5 },
} as const;

export type SoundName = keyof typeof effects;

// The swell is three seconds long and peaks at its end; start it that long
// before the moment it should land on.
export const swellSeconds = 3;

// One sound effect starting at frame `at`, `volume` times its usual level.
export function Sound({
  name,
  at,
  volume = 1,
}: {
  name: SoundName;
  at: number;
  volume?: number;
}) {
  const effect = effects[name];
  return (
    <Sequence from={Math.round(at)} layout="none">
      <Audio src={effect.src} volume={effect.volume * volume} />
    </Sequence>
  );
}

const seam = (t: number) =>
  Math.sin((Math.max(0, Math.min(1, t)) * Math.PI) / 2);

// The bed rests about 24 dB under narration and rises a little in the
// silences between lines.
const level = { under: 0.2, open: 0.42 };

// The music bed for a video of `durationInFrames`, ducking whenever `speaking`
// says the narrator is (0 to 1), or at the `level` given for each frame.
// Repeats of the loop crossfade at equal power, so the seam neither dips nor
// swells.
export function Music({
  durationInFrames,
  speaking = () => 0,
  level: levelAt,
}: {
  durationInFrames: number;
  speaking?: (frame: number) => number;
  level?: (frame: number) => number;
}) {
  const loop = bed.loop * fps;
  const overlap = bed.overlap * fps;
  const repeats = Math.ceil(durationInFrames / loop);
  return Array.from({ length: repeats }, (_, i) => {
    const from = i * loop;
    return (
      <Sequence
        key={i}
        from={from}
        durationInFrames={loop + overlap}
        layout="none"
      >
        <Audio
          src={musicBed}
          volume={(local) => {
            const frame = from + local;
            const fadeIn =
              i === 0 ? Math.min(1, local / (2 * fps)) : seam(local / overlap);
            const fadeOut = Math.min(
              seam((loop + overlap - local) / overlap),
              (durationInFrames - frame) / (2.5 * fps),
            );
            return (
              Math.max(0, Math.min(fadeIn, fadeOut)) *
              (levelAt
                ? levelAt(frame)
                : mix(level.open, level.under, speaking(frame)))
            );
          }}
        />
      </Sequence>
    );
  });
}
