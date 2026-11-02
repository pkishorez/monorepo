import { useEffect, useState } from 'react';
import { AnimatePresence, motion, useReducedMotion } from 'motion/react';
import type { BackgroundJob } from '@kestack/connect/code';
import {
  BotIcon,
  ChevronDownIcon,
  SquareIcon,
  SquareTerminalIcon,
} from 'lucide-react';
import { Spinner } from '@kestack/web-platform/ui/components/spinner';
import { since } from '../../../../../../../../../../../../ui/labels/status/index.ts';
import { Count } from '../../../../words/index.ts';

/*
 * What the session runs now, as one quiet line over its Draft, so a
 * session never looks idle while it works: "Working" while its turn runs,
 * and how many Background Jobs run on, which outlive it. A tap opens the
 * jobs, each with how long it has run and its own stop; a subagent's opens
 * it whole, over the page. Nothing runs, nothing shows.
 */

const ENTER = { duration: 0.2, ease: [0.23, 1, 0.32, 1] } as const;

export function Activity({
  running,
  jobs,
  stopping,
  disabled,
  openable,
  onOpen,
  onStop,
}: {
  /** Whether its turn runs. */
  readonly running: boolean;
  readonly jobs: ReadonlyArray<BackgroundJob>;
  /** The jobs asked to stop. */
  readonly stopping: ReadonlyArray<string>;
  /** Out of reach: nothing can be stopped. */
  readonly disabled: boolean;
  /** Whether a job's subagent can be opened. */
  readonly openable: (job: BackgroundJob) => boolean;
  readonly onOpen: (job: BackgroundJob) => void;
  readonly onStop: (job: BackgroundJob) => void;
}) {
  const reduced = useReducedMotion() === true;
  const [open, setOpen] = useState(false);
  const shown = running || jobs.length > 0;
  useEffect(() => {
    if (jobs.length === 0) setOpen(false);
  }, [jobs.length]);
  const now = useNow(open && jobs.length > 0);
  return (
    <AnimatePresence initial={false}>
      {shown && (
        <motion.div
          key="activity"
          initial={reduced ? { opacity: 0 } : { opacity: 0, y: 6 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, transition: { duration: 0.12, ease: 'easeIn' } }}
          transition={ENTER}
          className="mb-2 flex min-w-0 flex-col gap-1"
        >
          <AnimatePresence initial={false}>
            {open && jobs.length > 0 && (
              <motion.ul
                key="jobs"
                aria-label="Running in the background"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0, transition: { duration: 0.1 } }}
                className="flex min-w-0 flex-col rounded-xl border border-border bg-card p-1 shadow-[0_1px_2px_rgb(0_0_0/0.04),0_4px_12px_rgb(0_0_0/0.06)] dark:shadow-none"
              >
                <AnimatePresence initial={false}>
                  {jobs.map((job, at) => (
                    <motion.li
                      key={job.id}
                      layout="position"
                      initial={reduced ? false : { opacity: 0, y: 4 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, transition: { duration: 0.1 } }}
                      transition={{ ...ENTER, delay: reduced ? 0 : at * 0.04 }}
                      className="flex min-w-0 items-center"
                    >
                      <Job
                        job={job}
                        now={now}
                        stopping={stopping.includes(job.id)}
                        disabled={disabled}
                        openable={openable(job)}
                        onOpen={() => {
                          setOpen(false);
                          onOpen(job);
                        }}
                        onStop={() => onStop(job)}
                      />
                    </motion.li>
                  ))}
                </AnimatePresence>
              </motion.ul>
            )}
          </AnimatePresence>
          <button
            type="button"
            aria-expanded={jobs.length > 0 ? open : undefined}
            disabled={jobs.length === 0}
            onClick={() => setOpen((was) => !was)}
            className="focus-ring flex min-h-9 min-w-0 items-center gap-2 self-start rounded-full px-3 text-xs text-muted-foreground transition-colors duration-150 enabled:cursor-pointer enabled:hover:bg-muted enabled:hover:text-foreground pointer-coarse:min-h-11 motion-reduce:transition-none"
          >
            <Spinner aria-hidden className="size-3 shrink-0" />
            <span
              role="status"
              className="flex min-w-0 items-center gap-1 truncate"
            >
              {running ? 'Working' : 'Working in the background'}
              {jobs.length > 0 && (
                <>
                  <span aria-hidden>·</span>
                  <Count value={jobs.length} />
                  {running
                    ? ' in the background'
                    : jobs.length === 1
                      ? ' job'
                      : ' jobs'}
                </>
              )}
            </span>
            {jobs.length > 0 && (
              <ChevronDownIcon
                aria-hidden
                className={`size-3.5 shrink-0 opacity-60 transition-[rotate] duration-150 motion-reduce:transition-none ${open ? 'rotate-180' : ''}`}
              />
            )}
          </button>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

/** The time now, a second at a time while `on`. */
const useNow = (on: boolean) => {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!on) return;
    setNow(Date.now());
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, [on]);
  return now;
};

function Job({
  job,
  now,
  stopping,
  disabled,
  openable,
  onOpen,
  onStop,
}: {
  readonly job: BackgroundJob;
  readonly now: number;
  readonly stopping: boolean;
  readonly disabled: boolean;
  readonly openable: boolean;
  readonly onOpen: () => void;
  readonly onStop: () => void;
}) {
  const Icon = job.kind === 'agent' ? BotIcon : SquareTerminalIcon;
  const label = (
    <>
      <Icon aria-hidden className="size-3.5 shrink-0 text-muted-foreground" />
      <span className="min-w-0 flex-1 truncate" title={job.title}>
        {job.title}
      </span>
      {job.startedAt !== undefined && (
        <span className="shrink-0 text-xs text-muted-foreground tabular-nums">
          {since(job.startedAt, now)}
        </span>
      )}
    </>
  );
  const row =
    'flex min-h-10 min-w-0 flex-1 items-center gap-2 rounded-lg px-2.5 text-left text-sm pointer-coarse:min-h-11';
  return (
    <>
      {openable ? (
        <button
          type="button"
          onClick={onOpen}
          className={`focus-ring ${row} cursor-pointer transition-colors duration-150 hover:bg-muted motion-reduce:transition-none`}
        >
          {label}
        </button>
      ) : (
        <span className={row}>{label}</span>
      )}
      <button
        type="button"
        aria-label={`Stop ${job.title}`}
        title="Stop"
        disabled={disabled || stopping}
        onClick={onStop}
        className="focus-ring flex size-9 shrink-0 cursor-pointer items-center justify-center rounded-lg text-muted-foreground transition-colors duration-150 hover:bg-muted hover:text-foreground disabled:cursor-default disabled:opacity-50 pointer-coarse:size-11 motion-reduce:transition-none"
      >
        {stopping ? (
          <Spinner aria-hidden className="size-3.5" />
        ) : (
          <SquareIcon aria-hidden className="size-3 fill-current" />
        )}
      </button>
    </>
  );
}
