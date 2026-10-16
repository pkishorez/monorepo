import { AnimatePresence, motion } from 'motion/react';
import {
  Box,
  ENTER,
  EXIT,
  Flash,
  Message,
  Pill,
  Roll,
  useSteps,
} from '../../../../../components/index.ts';

/*
 * The Snapshot on the left, the page React draws from it on the right. A
 * Liked Message arrives for one Card. That Card's Actor takes it and its
 * likes roll; then only its own block on the page draws again, outlined
 * the way React's devtools mark a render. The Board and the other Cards
 * stay still.
 */

const CARDS = ['Coffee', 'Tea', 'Cocoa'] as const;
/** Which Card each Message is for, in turn. */
const LIKES = [1, 0, 1, 2] as const;
/** Each Message: it arrives, its Actor changes, its block draws again. */
const PHASES = [900, 900, 1500];
const STEPS = LIKES.flatMap(() => PHASES);

/** The app after this many Messages and phases, and how often each part drew. */
function after(messages: number, drawn: number) {
  const likes = [2, 0, 1];
  const changed = [0, 0, 0];
  const draws = [0, 0, 0];
  for (let at = 0; at < messages; at++) {
    const card = LIKES[at % LIKES.length]!;
    likes[card]! += 1;
    changed[card]! += 1;
    if (at < drawn) draws[card]! += 1;
  }
  return { likes, changed, draws };
}

export function DrawsPicture() {
  const [ref, step, round] = useSteps(STEPS, 2);
  const index = Math.floor(step / PHASES.length);
  const phase = step % PHASES.length;
  const done = round * LIKES.length + index;
  const target = LIKES[index]!;
  const app = after(done + (phase >= 1 ? 1 : 0), done + (phase >= 2 ? 1 : 0));
  return (
    <div ref={ref} className="grid place-items-center px-4 py-10">
      <div className="w-full max-w-md">
        <div className="flex h-10 items-end justify-center">
          <AnimatePresence mode="popLayout">
            {phase === 0 && (
              <motion.span
                key={`${round}-${index}`}
                initial={{ opacity: 0, y: -10 }}
                animate={{ opacity: 1, y: 0, transition: ENTER }}
                exit={{ opacity: 0, y: 14, transition: EXIT }}
                className="flex items-center gap-2"
              >
                <Message>Liked</Message>
                <span className="font-mono text-xs text-muted-foreground">
                  to {CARDS[target]}
                </span>
              </motion.span>
            )}
          </AnimatePresence>
        </div>
        <div className="mt-3 grid grid-cols-2 gap-3 sm:gap-6">
          <div>
            <p className="mb-2 font-mono text-[11px] text-muted-foreground">
              Snapshot
            </p>
            <Box name="Board" compact />
            <div className="mt-2 ml-3 grid gap-2 border-l border-dashed border-border pl-3">
              {CARDS.map((card, at) => (
                <Box key={card} name={card} compact flash={app.changed[at]}>
                  <Pill>
                    <Roll value={app.likes[at]!} />
                  </Pill>
                </Box>
              ))}
            </div>
          </div>
          <div>
            <p className="mb-2 font-mono text-[11px] text-muted-foreground">
              Page
            </p>
            <div className="grid gap-2 rounded-xl border border-border bg-muted/40 p-2">
              {CARDS.map((card, at) => (
                <div
                  key={card}
                  className="relative flex h-11 items-center justify-between gap-2 rounded-lg border border-border bg-background px-2.5"
                >
                  <span className="text-[13px] font-medium">{card}</span>
                  <span className="rounded-md border border-border px-1.5 py-0.5 font-mono text-[11px] text-muted-foreground">
                    ♥{' '}
                    <Roll
                      value={
                        app.likes[at]! - (app.changed[at]! - app.draws[at]!)
                      }
                    />
                  </span>
                  <Flash at={app.draws[at]} />
                </div>
              ))}
            </div>
          </div>
        </div>
        <p className="mt-4 flex items-center justify-center gap-2 font-mono text-[11px] text-muted-foreground">
          <span className="size-2.5 rounded-[3px] border-[1.5px] border-foreground" />
          drew again
        </p>
      </div>
    </div>
  );
}
