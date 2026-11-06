import { createContext, useContext, useEffect, useMemo, useRef } from 'react';
import { ChevronLeftIcon, ChevronRightIcon, GitBranchIcon } from 'lucide-react';
import type { AppRuntime } from '@kestack/kabuki/react/view';
import { SEED } from './todos.ts';

/*
 * The app's History, a Step at a time, in the tab bar. Every Message the
 * list took is a Step; going back shows the list right after any one of
 * them, while the live app waits. The view draws whichever Step it is
 * handed, so to-dos leave and arrive as you step, and turn back halfway
 * when you step back quickly. Fork carries on from the Step shown, as a new
 * Branch.
 *
 * Every part keeps its size whatever the Step: nothing moves as you drag.
 */

/**
 * The running app, handed down from where it is mounted, with what it
 * shows. The runtime is one live object, the same whatever changes, so
 * the Step shown and the Branch ride beside it as values: a new one is
 * what tells the view to draw again.
 */
export type TimelineSource = {
  readonly runtime: AppRuntime;
  readonly shown: AppRuntime['shown'];
  readonly branch: AppRuntime['branch'];
};

export const TimelineContext = createContext<TimelineSource | null>(null);

type Message = {
  readonly _tag: string;
  readonly id?: string;
  readonly text?: string;
  readonly to?: string;
};

export type Timeline = {
  /** The Step shown: 0 is the list as it started, `total` is now. */
  readonly at: number;
  readonly total: number;
  readonly live: boolean;
  /** What a Step did, in words. */
  readonly describe: (step: number) => string;
  readonly showAt: (step: number) => void;
  readonly goLive: () => void;
  /** Carries on from the Step shown. */
  readonly fork: () => void;
};

export const useTimeline = (): Timeline | null => {
  const source = useContext(TimelineContext);
  const branch = source?.branch;
  // Each to-do's text by id, to name the Steps by what they did.
  const names = useMemo(() => {
    const names = new Map(SEED.map((item, i) => [`${i}`, item.text]));
    let next = SEED.length;
    for (const entry of branch ?? []) {
      const message = entry.message as Message;
      if (message._tag === 'Added') names.set(`${next++}`, message.text ?? '');
    }
    return names;
  }, [branch]);
  if (!source || !branch) return null;
  const { runtime, shown } = source;
  const at =
    shown === null
      ? branch.length
      : shown === 'init'
        ? 0
        : branch.findIndex((entry) => entry.id === shown) + 1;

  const describe = (step: number): string => {
    if (step === 0) return 'The list as it started';
    const message = branch[step - 1]?.message as Message | undefined;
    const name = (id?: string) => `“${names.get(id ?? '') ?? 'a to-do'}”`;
    switch (message?._tag) {
      case 'Added':
        return `Added “${message.text}”`;
      case 'Toggled':
        return `Toggled ${name(message.id)}`;
      case 'Removed':
        return `Deleted ${name(message.id)}`;
      case 'ClearedCompleted':
        return 'Cleared the completed';
      case 'Filtered':
        return `Showed ${message.to}`;
      default:
        return message?._tag ?? '';
    }
  };

  return {
    at,
    total: branch.length,
    live: shown === null,
    describe,
    showAt: (step) =>
      runtime.show(
        step >= branch.length
          ? null
          : step <= 0
            ? 'init'
            : branch[step - 1]!.id,
      ),
    goLive: () => runtime.show(null),
    fork: () => {
      if (shown === null) return;
      runtime.start(shown === 'init' ? null : shown);
      runtime.show(null);
    },
  };
};

/**
 * The History a Step at a time: back, forward, where it stands, and going
 * live or forking. Clicks queue: three quick ones go back three Steps,
 * even before the first has been drawn.
 */
export function TimelineBar() {
  const timeline = useTimeline();
  // Where the clicks so far are taking it, until the view gets there.
  const heading = useRef<number | null>(null);
  const at = timeline?.at ?? 0;
  useEffect(() => {
    heading.current = null;
  }, [at]);
  if (!timeline) return null;
  const { total, live, describe, showAt, goLive, fork } = timeline;
  const step = (by: number) => {
    const from = heading.current ?? at;
    const to = Math.min(Math.max(from + by, 0), total);
    if (to === from) return;
    heading.current = to;
    showAt(to);
  };
  return (
    <div
      role="group"
      aria-label="Time travel"
      className="flex items-center gap-1.5"
    >
      <div className="flex items-center rounded-xl bg-(--pg-raised)">
        <button
          type="button"
          onClick={() => step(-1)}
          disabled={at === 0}
          aria-label="Step back"
          title={at > 0 ? `Back to: ${describe(at - 1)}` : 'At the start'}
          className={STEP}
        >
          <ChevronLeftIcon className="size-4" strokeWidth={2} />
        </button>
        <span
          aria-live="polite"
          aria-label={`Step ${at} of ${total}`}
          className="w-14 text-center font-mono text-xs text-(--pg-text-2) tabular-nums"
        >
          {at}
          <span className="text-(--pg-text-4)"> / </span>
          {total}
        </span>
        <button
          type="button"
          onClick={() => step(1)}
          disabled={live}
          aria-label="Step forward"
          title={live ? 'Showing now' : `Forward to: ${describe(at + 1)}`}
          className={STEP}
        >
          <ChevronRightIcon className="size-4" strokeWidth={2} />
        </button>
      </div>
      <button
        type="button"
        onClick={goLive}
        disabled={live}
        title={live ? 'Showing the list as it is now' : 'Back to now'}
        className="flex h-9 cursor-pointer items-center gap-1.5 rounded-xl px-2.5 text-xs font-medium text-(--pg-text) transition-colors duration-150 hover:bg-(--pg-raised) focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-(--pg-focus) disabled:cursor-default disabled:text-(--pg-text-4) disabled:hover:bg-transparent"
      >
        <span
          aria-hidden
          className={`size-1.5 rounded-full transition-colors duration-150 ${live ? 'bg-(--pg-live)' : 'bg-(--pg-accent)'}`}
        />
        Live
      </button>
      <button
        type="button"
        onClick={fork}
        disabled={live}
        title="Carry on from this Step"
        className="flex h-9 cursor-pointer items-center gap-1.5 rounded-xl bg-(--pg-accent) px-3 text-xs font-semibold text-(--pg-accent-ink) transition-[background-color,color,transform] duration-150 hover:bg-(--pg-accent-hover) focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-(--pg-focus) active:scale-[0.97] disabled:cursor-default disabled:bg-(--pg-raised) disabled:text-(--pg-text-4)"
      >
        <GitBranchIcon className="size-3.5" strokeWidth={2} />
        Fork
      </button>
    </div>
  );
}

const STEP =
  'grid size-9 cursor-pointer place-items-center rounded-xl text-(--pg-text-2) transition-[color,background-color,transform] duration-150 hover:bg-(--pg-raised) hover:text-(--pg-text) focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-(--pg-focus) active:scale-90 disabled:cursor-default disabled:text-(--pg-text-4) disabled:hover:bg-transparent disabled:active:scale-100';
