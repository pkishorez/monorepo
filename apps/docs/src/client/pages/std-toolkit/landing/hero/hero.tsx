import { useEffect, useState } from 'react';
import { Effect } from 'effect';
import { AnimatePresence, MotionConfig, motion } from 'motion/react';
import { PlusIcon, RotateCcwIcon } from 'lucide-react';
import { board, read, save } from './releases.ts';
import type { Release, Seen } from './releases.ts';

/*
 * std-toolkit's hero: one card, a real table in memory that three releases
 * of an app share. Pick the release that is reading; each task shows the
 * version it is stored at, and what that release reads: an older row
 * upgraded with the fields it never had, a newer one refused as too new.
 * Saving writes in the shape of the release picked. It opens with two
 * tasks saved by releases 1 and 2, read by release 3.
 */

const RELEASES: ReadonlyArray<Release> = [1, 2, 3];
const ROWS = 5;
const ROW_PX = 48;
const ENTER = { duration: 0.25, ease: [0.23, 1, 0.32, 1] } as const;
const SPRING = { type: 'spring', duration: 0.35, bounce: 0 } as const;

/** Empty rows, ruled like full ones, under whatever the board shows. */
const ruled = {
  minHeight: ROWS * ROW_PX,
  backgroundImage: `repeating-linear-gradient(to bottom, transparent 0 ${ROW_PX - 1}px, color-mix(in oklab, var(--color-border) 60%, transparent) ${ROW_PX - 1}px ${ROW_PX}px)`,
};

export function Hero() {
  const [memory, setMemory] = useState(board);
  const [release, setRelease] = useState<Release>(3);
  const [saved, setSaved] = useState(0);
  const [seen, setSeen] = useState<ReadonlyArray<Seen>>([]);

  // The board opens with a task from release 1 and one from release 2. A
  // second run finds them saved already, and says so all the same.
  useEffect(() => {
    let live = true;
    void Effect.runPromise(
      Effect.gen(function* () {
        yield* save(memory, 1, 0);
        yield* save(memory, 2, 1);
      }).pipe(Effect.ignore),
    ).then(() => live && setSaved(2));
    return () => {
      live = false;
    };
  }, [memory]);

  useEffect(() => {
    let live = true;
    void Effect.runPromise(read(memory, release)).then(
      (rows) => live && setSeen(rows),
    );
    return () => {
      live = false;
    };
  }, [memory, release, saved]);

  const add = async () => {
    if (saved >= ROWS) return;
    await Effect.runPromise(save(memory, release, saved));
    setSaved(saved + 1);
  };

  const reset = () => {
    setMemory(board());
    setSaved(0);
    setSeen([]);
  };

  return (
    <MotionConfig reducedMotion="user">
      <figure className="w-full">
        <div className="overflow-hidden rounded-2xl border border-border bg-card shadow-[0_1px_2px_rgba(0,0,0,0.04),0_12px_32px_-16px_rgba(0,0,0,0.25)]">
          <div className="flex items-center gap-3 border-b border-border px-4 py-3">
            <div className="min-w-0">
              <p className="text-sm font-medium">Reading as</p>
              <p className="font-mono text-[11px] text-muted-foreground">
                board · in memory
              </p>
            </div>
            <div
              role="radiogroup"
              aria-label="The release reading the board"
              className="ml-auto flex rounded-lg bg-muted p-0.5"
            >
              {RELEASES.map((each) => (
                <button
                  key={each}
                  type="button"
                  role="radio"
                  aria-checked={release === each}
                  onClick={() => setRelease(each)}
                  className="relative h-8 rounded-md px-2.5 text-[13px] font-medium text-muted-foreground transition-colors duration-150 aria-checked:text-foreground focus-visible:outline-2 focus-visible:outline-ring pointer-coarse:h-10"
                >
                  {release === each && (
                    <motion.span
                      layoutId="hero-release"
                      transition={SPRING}
                      className="absolute inset-0 rounded-md bg-background shadow-[0_1px_2px_rgba(0,0,0,0.08)]"
                    />
                  )}
                  <span className="relative">release {each}</span>
                </button>
              ))}
            </div>
          </div>
          <ul style={ruled}>
            <AnimatePresence initial={false}>
              {seen.map((row) => (
                <motion.li
                  key={row.taskId}
                  initial={{ opacity: 0, height: 0 }}
                  animate={{ opacity: 1, height: ROW_PX, transition: ENTER }}
                  exit={{ opacity: 0, height: 0 }}
                  className="overflow-hidden border-b border-border/60"
                >
                  <Task row={row} release={release} />
                </motion.li>
              ))}
            </AnimatePresence>
          </ul>
          <div className="flex items-center gap-2 border-t border-border px-3 py-2.5">
            <button
              type="button"
              onClick={() => void add()}
              disabled={saved >= ROWS}
              className="inline-flex h-8 items-center gap-1.5 rounded-md bg-foreground px-3 text-[13px] font-medium text-background transition-[opacity,transform] duration-150 ease-out active:scale-[0.97] disabled:opacity-40 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring pointer-coarse:h-10"
            >
              <PlusIcon className="size-3.5" />
              Save a task as release {release}
            </button>
            <button
              type="button"
              onClick={reset}
              className="ml-auto inline-flex h-8 items-center gap-1.5 rounded-md px-2 text-[12px] text-muted-foreground transition-colors duration-150 hover:bg-muted hover:text-foreground focus-visible:outline-2 focus-visible:outline-ring pointer-coarse:h-10"
            >
              <RotateCcwIcon className="size-3" />
              Reset
            </button>
          </div>
        </div>
        <figcaption className="mt-3 text-[13px] text-pretty text-muted-foreground">
          A real std-toolkit table, in memory. Switch releases: older rows read
          in the new shape, newer ones are refused as too new.
        </figcaption>
      </figure>
    </MotionConfig>
  );
}

function Task({
  row,
  release,
}: {
  readonly row: Seen;
  readonly release: Release;
}) {
  const { read } = row;
  return (
    <div className="flex h-12 items-center gap-3 px-4">
      {'tooNew' in read ? (
        <span className="min-w-0 flex-1 truncate text-sm text-muted-foreground">
          <span className="font-mono text-[12px]">{row.taskId}</span>
          <span className="ml-2 text-[12.5px] text-amber-700 dark:text-amber-400">
            too new for release {release}
          </span>
        </span>
      ) : (
        <>
          <span
            aria-hidden
            className={`grid size-4 shrink-0 place-items-center rounded-full border transition-colors duration-200 ${read.done === undefined ? 'border-dashed border-border' : read.done ? 'border-foreground bg-foreground' : 'border-muted-foreground/50'}`}
          />
          <span className="min-w-0 flex-1 truncate text-sm">{read.title}</span>
          <AnimatePresence initial={false}>
            {read.priority && (
              <motion.span
                key={read.priority}
                initial={{ opacity: 0, scale: 0.9 }}
                animate={{ opacity: 1, scale: 1, transition: ENTER }}
                exit={{ opacity: 0 }}
                className="rounded-full border border-border px-2 font-mono text-[11px] text-muted-foreground"
              >
                {read.priority}
              </motion.span>
            )}
          </AnimatePresence>
        </>
      )}
      <span
        title="The version this task is stored at"
        className="shrink-0 rounded bg-foreground/90 px-1.5 font-mono text-[10.5px] text-background"
      >
        {row.stored}
      </span>
    </div>
  );
}
