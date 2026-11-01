import { AnimatePresence, motion } from 'motion/react';
import {
  ENTER,
  EXIT,
  Flash,
  Message,
  useSteps,
} from '../../../../../components/index.ts';

/*
 * Props flowing down. A Playlist holds which song is playing; under it,
 * three Songs each read one Prop, `playing`. A Message changes the
 * Playlist's Model, the Playlist flashes, and then the Props flow down:
 * the Song whose Prop turned true lights up, the one whose Prop turned
 * false goes quiet. The Songs never write it.
 */

const SONGS = ['a', 'b', 'c'] as const;
const STEPS: ReadonlyArray<{
  readonly playing: string | null;
  readonly message?: string;
  /** Whether the Props have reached the Songs yet. */
  readonly down: boolean;
}> = [
  { playing: null, down: true },
  { playing: null, message: 'Next', down: true },
  { playing: 'a', down: false },
  { playing: 'a', down: true },
  { playing: 'a', message: 'Next', down: true },
  { playing: 'b', down: false },
  { playing: 'b', down: true },
  { playing: 'b', message: 'Stopped', down: true },
  { playing: null, down: false },
  { playing: null, down: true },
];
const DURATIONS = [1200, 800, 500, 1500, 800, 500, 1500, 800, 500, 1500];

export function PropsPicture() {
  const [ref, step, round] = useSteps(DURATIONS, 6);
  const now = STEPS[step]!;
  // What the Songs see: the last Props handed down.
  const seen = now.down
    ? now.playing
    : (STEPS.slice(0, step).findLast((s) => s.down)?.playing ?? null);
  return (
    <div ref={ref} className="grid place-items-center px-4 py-8">
      <div className="w-full max-w-80">
        <div className="flex h-10 items-end justify-center">
          <AnimatePresence mode="popLayout">
            {now.message && (
              <motion.span
                key={`${round}-${step}`}
                initial={{ opacity: 0, y: -10 }}
                animate={{ opacity: 1, y: 0, transition: ENTER }}
                exit={{ opacity: 0, y: 14, transition: EXIT }}
              >
                <Message>{now.message}</Message>
              </motion.span>
            )}
          </AnimatePresence>
        </div>
        <div className="relative mx-auto mt-4 flex h-10 w-48 items-center justify-between rounded-lg border border-border bg-background px-3 text-sm shadow-[0_1px_2px_rgba(0,0,0,0.04)]">
          <span className="font-medium">Playlist</span>
          <span className="font-mono text-[11px] text-muted-foreground">
            playing: {now.playing ?? 'null'}
          </span>
          <Flash
            at={
              STEPS.slice(0, step + 1).filter((s) => !s.down).length + round * 3
            }
          />
        </div>
        <div className="relative h-10">
          {SONGS.map((song, index) => (
            <span
              key={song}
              aria-hidden
              className={`absolute top-0 h-full w-px transition-colors duration-300 ${
                !now.down ? 'bg-foreground/50' : 'bg-border'
              }`}
              style={{ left: `${(index * 2 + 1) * (100 / 6)}%` }}
            />
          ))}
          <span className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 bg-card px-1.5 font-mono text-[10px] text-muted-foreground">
            props
          </span>
        </div>
        <div className="grid grid-cols-3 gap-2">
          {SONGS.map((song) => {
            const playing = seen === song;
            return (
              <div
                key={song}
                className={`rounded-lg border px-2 py-2 text-center transition-colors duration-300 ${
                  playing
                    ? 'border-emerald-500/60 bg-emerald-500/10'
                    : 'border-border bg-background'
                }`}
              >
                <span className="block text-sm font-medium">Song {song}</span>
                <span className="block font-mono text-[10px] text-muted-foreground">
                  playing: {playing ? 'true' : 'false'}
                </span>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
