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
 * One App, mounted in two places on a page, and the one Runtime behind
 * them. The first mount starts the Runtime; the second shares it. A Rolled
 * Message lands once, in the one History, and both mounts draw it. One
 * mount goes and the app runs on; the last goes and the Runtime stops,
 * its History kept under the app's name; mounted again, it carries on
 * where it was.
 */

type Frame = {
  /** Which of the two places has the App mounted. */
  readonly mounted: readonly [boolean, boolean];
  readonly running: boolean;
  /** How many Messages the History holds. */
  readonly messages: number;
  /** How many of them the mounts have drawn. */
  readonly drawn: number;
  readonly note: string;
};

const FRAMES: ReadonlyArray<Frame> = [
  {
    mounted: [false, false],
    running: false,
    messages: 0,
    drawn: 0,
    note: 'nothing mounted yet',
  },
  {
    mounted: [true, false],
    running: true,
    messages: 0,
    drawn: 0,
    note: 'the first mount starts the Runtime',
  },
  {
    mounted: [true, true],
    running: true,
    messages: 0,
    drawn: 0,
    note: 'a second mount shares it',
  },
  {
    mounted: [true, true],
    running: true,
    messages: 1,
    drawn: 0,
    note: 'one Message, into one History',
  },
  {
    mounted: [true, true],
    running: true,
    messages: 1,
    drawn: 1,
    note: 'both mounts draw it',
  },
  {
    mounted: [false, true],
    running: true,
    messages: 1,
    drawn: 1,
    note: 'one mount goes; the app runs on',
  },
  {
    mounted: [false, false],
    running: false,
    messages: 1,
    drawn: 1,
    note: 'the last goes; its History stays',
  },
  {
    mounted: [true, false],
    running: true,
    messages: 1,
    drawn: 1,
    note: 'mounted again, it carries on',
  },
];
const STEPS = [1200, 1400, 1400, 1100, 1500, 1500, 1800, 2400];
/** Both mounts drawing the one Message: the whole idea, held still. */
const STILL = 4;

export function MountsPicture() {
  const [ref, step, round] = useSteps(STEPS, STILL);
  const frame = FRAMES[step]!;
  return (
    <div ref={ref} className="grid place-items-center px-4 py-10">
      <div className="w-full max-w-md">
        <div className="flex h-10 items-end justify-center">
          <AnimatePresence mode="popLayout">
            {step === 3 && (
              <motion.span
                key={round}
                initial={{ opacity: 0, y: -10 }}
                animate={{ opacity: 1, y: 0, transition: ENTER }}
                exit={{ opacity: 0, y: 14, transition: EXIT }}
                className="flex items-center gap-2"
              >
                <Message>Rolled</Message>
                <span className="font-mono text-xs text-muted-foreground">
                  face 5
                </span>
              </motion.span>
            )}
          </AnimatePresence>
        </div>
        <div className="mt-3 grid grid-cols-2 gap-3 sm:gap-6">
          <div>
            <p className="mb-2 font-mono text-[11px] text-muted-foreground">
              Page
            </p>
            <div className="grid gap-2 rounded-xl border border-border bg-muted/40 p-2">
              {frame.mounted.map((mounted, at) => (
                <div
                  key={at}
                  className="relative h-11 rounded-lg border border-dashed border-border"
                >
                  <AnimatePresence initial={false}>
                    {mounted && (
                      <motion.div
                        key={`${round}-${at}`}
                        initial={{ opacity: 0, scale: 0.96 }}
                        animate={{ opacity: 1, scale: 1, transition: ENTER }}
                        exit={{ opacity: 0, scale: 0.96, transition: EXIT }}
                        className="absolute -inset-px flex items-center justify-between gap-2 rounded-lg border border-border bg-background px-2.5"
                      >
                        <span className="font-mono text-[11px]">
                          {'<DiceApp />'}
                        </span>
                        <span className="rounded-md border border-border px-1.5 py-0.5 font-mono text-[11px] text-muted-foreground">
                          <Roll value={frame.drawn > 0 ? 5 : '?'} />
                        </span>
                        <Flash at={frame.drawn} />
                      </motion.div>
                    )}
                  </AnimatePresence>
                </div>
              ))}
            </div>
          </div>
          <div>
            <p className="mb-2 font-mono text-[11px] text-muted-foreground">
              App
            </p>
            <Box name="Runtime" compact>
              <Pill>
                <Roll value={frame.running ? 'running' : 'stopped'} />
              </Pill>
            </Box>
            <div className="mt-2 rounded-lg border border-border bg-background px-3 py-2">
              <p className="font-mono text-[11px] text-muted-foreground">
                History · docs:app
              </p>
              <div className="mt-2 flex h-3 items-center gap-2">
                <span className="size-2 rounded-[2px] bg-foreground" />
                <AnimatePresence initial={false}>
                  {frame.messages > 0 && (
                    <motion.span
                      key={round}
                      initial={{ opacity: 0, scale: 0 }}
                      animate={{ opacity: 1, scale: 1, transition: ENTER }}
                      exit={{ opacity: 0, scale: 0, transition: EXIT }}
                      className="size-2 rounded-full bg-foreground"
                    />
                  )}
                </AnimatePresence>
              </div>
            </div>
          </div>
        </div>
        <p className="mt-5 text-center font-mono text-[11px] text-muted-foreground">
          <Roll value={frame.note} />
        </p>
      </div>
    </div>
  );
}
