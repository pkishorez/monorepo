import { AnimatePresence, motion } from 'motion/react';
import {
  ENTER,
  EXIT,
  Flash,
  useSteps,
} from '../../../../../components/index.ts';

/*
 * A Child asking its parent for something, the kabuki way. The Playlist
 * provides a Player to everything below it. A Song is pressed: it calls
 * play, which climbs up as a Message to the Playlist. The Playlist's
 * Update runs and it flashes; then the answer comes back down the usual
 * way, as Props, and the Song that asked lights up.
 */

const SONGS = ['a', 'b', 'c'] as const;
const ORDER = ['b', 'c', 'a'] as const;
/** Each round of asking: pressed, climbing, handled, Props down, holding. */
const PHASES = [700, 700, 500, 500, 1300];
const DURATIONS = ORDER.flatMap(() => PHASES);

export function AskPicture() {
  const [ref, step, round] = useSteps(DURATIONS, 3 * PHASES.length - 1);
  const index = Math.floor(step / PHASES.length);
  const phase = step % PHASES.length;
  const asking = ORDER[index]!;
  const before = index === 0 ? null : ORDER[index - 1]!;
  const playing = phase >= 3 ? asking : before;
  const handled = round * ORDER.length + index + (phase >= 2 ? 1 : 0);
  const column = SONGS.indexOf(asking);
  return (
    <div ref={ref} className="grid place-items-center px-4 py-8">
      <div className="w-full max-w-80">
        <div className="relative mx-auto flex h-11 w-56 items-center justify-between rounded-lg border border-border bg-background px-3 text-sm shadow-[0_1px_2px_rgba(0,0,0,0.04)]">
          <span className="font-medium">Playlist</span>
          <span
            className={`rounded-full border px-2 py-0.5 font-mono text-[10px] transition-colors duration-200 ${
              phase === 2
                ? 'border-foreground bg-foreground text-background'
                : 'border-border text-muted-foreground'
            }`}
          >
            provides Player
          </span>
          <Flash at={handled} />
        </div>
        <div className="relative h-20">
          {SONGS.map((song, at) => (
            <span
              key={song}
              aria-hidden
              className={`absolute top-0 h-full w-px transition-colors duration-300 ${
                (phase === 1 && at === column) || phase === 3
                  ? 'bg-foreground/50'
                  : 'bg-border'
              }`}
              style={{ left: `${(at * 2 + 1) * (100 / 6)}%` }}
            />
          ))}
          <AnimatePresence>
            {phase === 1 && (
              <motion.span
                key={`up-${round}-${index}`}
                className="absolute -translate-x-1/2 rounded-md border border-foreground bg-background px-1.5 py-0.5 font-mono text-[10px] whitespace-nowrap"
                style={{ left: `${(column * 2 + 1) * (100 / 6)}%` }}
                initial={{ top: '75%', opacity: 0 }}
                animate={{ top: '10%', opacity: 1 }}
                exit={{ opacity: 0, transition: EXIT }}
                transition={{ duration: 0.6, ease: [0.45, 0, 0.55, 1] }}
              >
                ↑ play('{asking}')
              </motion.span>
            )}
            {phase === 3 && (
              <motion.span
                key={`down-${round}-${index}`}
                className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 bg-card px-1.5 font-mono text-[10px] text-muted-foreground"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1, transition: ENTER }}
                exit={{ opacity: 0, transition: EXIT }}
              >
                props ↓
              </motion.span>
            )}
          </AnimatePresence>
        </div>
        <div className="grid grid-cols-3 gap-2">
          {SONGS.map((song) => (
            <motion.div
              key={song}
              animate={{ scale: phase === 0 && song === asking ? 0.94 : 1 }}
              transition={{ type: 'spring', stiffness: 500, damping: 26 }}
              className={`rounded-lg border px-2 py-2 text-center transition-colors duration-300 ${
                playing === song
                  ? 'border-emerald-500/60 bg-emerald-500/10'
                  : 'border-border bg-background'
              }`}
            >
              <span className="block text-sm font-medium">Song {song}</span>
              <span className="block font-mono text-[10px] text-muted-foreground">
                requires Player
              </span>
            </motion.div>
          ))}
        </div>
      </div>
    </div>
  );
}
