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
 * One request, the server on the left and the browser on the right. The
 * browser asks for a URL. Start reads it as a Route, runs the Loaders of
 * both places it names at once, and both come back. Then the HTML leaves
 * with the Snapshot beside it, the browser draws the page, and only then
 * does a Runtime start, in the browser. The server never runs one.
 */

const STEPS: ReadonlyArray<{
  readonly message?: { readonly text: string; readonly to: string };
  readonly label: string;
}> = [
  {
    message: { text: 'GET /blog/hello', to: 'to Start' },
    label: 'the browser asks for a URL',
  },
  { label: '1 · read: the URL as a Route' },
  { label: '2 · load: both Loaders at once' },
  { label: '3 · start: each page from its data' },
  {
    message: { text: 'HTML + Snapshot', to: 'to the browser' },
    label: '4 · draw: the HTML, the Snapshot beside it',
  },
  { label: 'the browser shows the HTML' },
  { label: 'it hydrates, and its Runtime starts' },
];
const DURATIONS = [1300, 1100, 1100, 1300, 1300, 1300, 2400];

const READ = 1;
const LOADING = 2;
const LOADED = 3;
const DRAWN = 5;
const HYDRATED = 6;

export function RequestPicture() {
  const [ref, step, round] = useSteps(DURATIONS, HYDRATED);
  const now = STEPS[step]!;
  const loader = step >= LOADED ? 'ready' : step >= LOADING ? 'loading' : '—';
  return (
    <div ref={ref} className="grid place-items-center px-2 py-10 sm:px-4">
      <div className="w-full max-w-lg">
        <div className="flex h-10 items-end justify-center">
          <AnimatePresence mode="popLayout">
            {now.message && (
              <motion.span
                key={`${round}-${step}`}
                initial={{ opacity: 0, y: -10 }}
                animate={{ opacity: 1, y: 0, transition: ENTER }}
                exit={{ opacity: 0, y: 14, transition: EXIT }}
                className="flex items-center gap-2"
              >
                <Message>{now.message.text}</Message>
                <span className="font-mono text-xs text-muted-foreground">
                  {now.message.to}
                </span>
              </motion.span>
            )}
          </AnimatePresence>
        </div>
        <div className="mt-3 grid grid-cols-2 gap-2 sm:gap-6">
          <div>
            <p className="mb-2 flex items-center justify-between gap-2 font-mono text-[11px] text-muted-foreground">
              Server
              <Pill>no Runtime</Pill>
            </p>
            <div className="grid gap-2">
              <p className="font-mono text-[11px] text-muted-foreground">
                Route
              </p>
              <Box
                name={step >= READ ? 'Blog › Post' : '—'}
                compact
                flash={step >= READ ? round + 1 : 0}
              />
              <p className="mt-1 font-mono text-[11px] text-muted-foreground">
                Loaders
              </p>
              {['Blog', 'Blog.Post'].map((place) => (
                <Box
                  key={place}
                  name={place}
                  compact
                  flash={step >= LOADED ? round + 1 : 0}
                >
                  <Pill>
                    <Roll value={loader} />
                  </Pill>
                </Box>
              ))}
            </div>
          </div>
          <div>
            <p className="mb-2 flex items-center justify-between gap-2 font-mono text-[11px] text-muted-foreground">
              Browser
              <Pill>
                <Roll value={step >= HYDRATED ? 'Runtime' : 'no Runtime'} />
              </Pill>
            </p>
            <div className="relative rounded-xl border border-border bg-muted/40 p-2">
              <p className="truncate rounded-md border border-border bg-background px-2 py-1 font-mono text-[11px] text-muted-foreground">
                /blog/hello
              </p>
              <div className="relative mt-2 h-[6.75rem] rounded-lg border border-border bg-background p-2.5">
                {step >= DRAWN && (
                  <motion.div
                    key={round}
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1, transition: ENTER }}
                  >
                    <p className="text-[13px] font-medium">Hello</p>
                    <span className="mt-2 block h-1.5 w-full rounded-full bg-muted" />
                    <span className="mt-1.5 block h-1.5 w-4/5 rounded-full bg-muted" />
                    <span className="mt-3 inline-block">
                      <Pill>Snapshot</Pill>
                    </span>
                  </motion.div>
                )}
                <Flash at={step >= HYDRATED ? round + 1 : 0} />
              </div>
            </div>
          </div>
        </div>
        <p className="mt-5 h-4 text-center font-mono text-[11px] text-muted-foreground">
          <AnimatePresence mode="wait" initial={false}>
            <motion.span
              key={`${round}-${step}`}
              className="inline-block"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1, transition: ENTER }}
              exit={{ opacity: 0, transition: EXIT }}
            >
              {now.label}
            </motion.span>
          </AnimatePresence>
        </p>
      </div>
    </div>
  );
}
