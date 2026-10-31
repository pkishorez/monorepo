import type { Message } from '@kestack/connect/code';
import { flushSync } from 'react-dom';
import { createRoot, type Root } from 'react-dom/client';
import { useCallback, useMemo, useState } from 'react';
import { useFollow } from '../src/device/account/connections/layout/pages/project/session/follow.ts';
import {
  Rows,
  useOpening,
  useRows,
} from '../src/device/account/connections/layout/pages/project/session/transcript/index.ts';
import { chunkOf, sessionOf } from './session.ts';
import './styles.css';

/*
 * The transcript as the session page draws it, with a long session made
 * up in `session.ts`, and the moves a reader makes timed: opening it,
 * words streaming in, opening a fold, scrolling to the top, and leaving
 * and coming back. `scripts/bench.ts` drives it in Chrome.
 *
 * Its rows reach the transcript as a session's Query hands them: each
 * change a new list, new Messages at its end.
 */

interface Entry {
  readonly id: string;
  readonly row: Message;
}

let setEntries: ((entries: ReadonlyArray<Entry>) => void) | null = null;
let toggleFold: ((id: string) => void) | null = null;
let root: Root | null = null;
let made: ReturnType<typeof sessionOf> | null = null;
let entries: ReadonlyArray<Entry> = [];
let running = false;

const forking = { fork: () => {}, pending: null };

function Session({
  initial,
  running,
}: {
  readonly initial: ReadonlyArray<Entry>;
  readonly running: boolean;
}) {
  const [rowsOf, set] = useState(initial);
  setEntries = set;
  const [open, setOpen] = useState<ReadonlyArray<string>>([]);
  const rows = useRows(useMemo(() => rowsOf.map(({ row }) => row), [rowsOf]));
  const follow = useFollow('bench', undefined);
  const toggle = useCallback(
    (id: string) =>
      setOpen((open) =>
        open.includes(id) ? open.filter((each) => each !== id) : [...open, id],
      ),
    [],
  );
  const opening = useOpening(open, toggle);
  toggleFold = opening.toggle;
  return (
    <div className="relative flex h-dvh min-h-0 flex-col">
      <div
        ref={follow.scroller}
        id="scroller"
        className="relative min-h-0 flex-1 overflow-y-auto outline-none select-text [overflow-anchor:none]"
      >
        <div
          ref={follow.content}
          className="mx-auto flex w-full max-w-4xl flex-col gap-3 px-4 pt-8 pb-10 sm:px-6"
        >
          <Rows
            rows={rows}
            opening={opening}
            running={running}
            forking={forking}
            gradual
            shift={follow.shift}
          />
        </div>
      </div>
    </div>
  );
}

const scroller = () => document.getElementById('scroller')!;

/** Runs a change, and times it drawn and laid out. */
const timed = (change: () => void) => {
  const start = performance.now();
  flushSync(change);
  void document.getElementById('scroller')?.scrollHeight;
  return performance.now() - start;
};

const frame = () => new Promise((resolve) => requestAnimationFrame(resolve));

let longTasks = 0;
/** The longest task begun since `since`. */
let longest = 0;
let since = Infinity;
new PerformanceObserver((list) => {
  for (const entry of list.getEntries()) {
    longTasks += entry.duration;
    if (entry.startTime >= since) longest = Math.max(longest, entry.duration);
  }
}).observe({ type: 'longtask', buffered: false });

/** Waits until the page has had no long task for `quiet` ms; how long its long tasks took meanwhile. */
const settled = async (quiet = 1500, limit = 20_000) => {
  const before = longTasks;
  const start = performance.now();
  let last = longTasks;
  let since = performance.now();
  while (performance.now() - start < limit) {
    await new Promise((resolve) => setTimeout(resolve, 100));
    if (longTasks !== last) {
      last = longTasks;
      since = performance.now();
    } else if (performance.now() - since >= quiet) break;
  }
  return longTasks - before;
};

const mount = () =>
  timed(() => {
    root = createRoot(document.getElementById('root')!);
    root.render(<Session initial={entries} running={running} />);
  });

declare global {
  interface Window {
    bench: typeof bench;
  }
}

const bench = {
  /** Opens a session of `turns` turns: how long until drawn, and its long tasks until quiet. */
  open: async (turns: number, live = false) => {
    running = live;
    made = sessionOf({ turns, running: live });
    entries = made.messages.map((row) => ({ id: row.id, row }));
    longest = 0;
    const draw = mount();
    since = performance.now();
    await frame();
    const busy = await settled();
    return {
      draw,
      busy,
      longest,
      nodes: document.getElementsByTagName('*').length,
      messages: entries.length,
    };
  },
  /** Leaves the session and comes back, as a phone does through the sidebar. */
  reopen: async () => {
    timed(() => root?.unmount());
    longest = 0;
    const draw = mount();
    since = performance.now();
    await frame();
    const busy = await settled();
    return { draw, busy, longest };
  },
  /** `count` more chunks of the answer still arriving: how long each took to draw. */
  stream: async (count: number) => {
    const times: number[] = [];
    for (let at = 0; at < count; at++) {
      const message = chunkOf(
        entries.map(({ row }) => row),
        made!.nextId(),
        Date.now() + at,
      );
      entries = [...entries, { id: message.id, row: message }];
      const next = entries;
      times.push(timed(() => setEntries!(next)));
      await frame();
    }
    await settled(500);
    return times;
  },
  /** Opens and shuts the last few folds of work: how long each took to draw. */
  toggle: async (count: number) => {
    const folds = [
      ...document.querySelectorAll<HTMLButtonElement>(
        '#scroller button[aria-expanded]',
      ),
    ].slice(-count);
    const times: number[] = [];
    for (const fold of folds) {
      times.push(timed(() => fold.click()));
      await frame();
    }
    for (const fold of folds.toReversed()) {
      times.push(timed(() => fold.click()));
      await frame();
    }
    await settled(500);
    return times;
  },
  /** Scrolls from the bottom to the top a step a frame: each frame's length. */
  scroll: async (step: number) => {
    const element = scroller();
    await settled(500);
    const frames: number[] = [];
    let last = await frame();
    // At most a few thousand frames, however tall it is.
    for (let at = 0; element.scrollTop > 0 && at < 5000; at++) {
      // A reader's own scroll, so the transcript stops following.
      element.dispatchEvent(new WheelEvent('wheel', { deltaY: -step }));
      element.scrollTop -= step;
      const now = (await frame()) as number;
      frames.push(now - (last as number));
      last = now;
    }
    const busy = await settled(500);
    return { frames, busy };
  },
  /**
   * Opens a session and, while the turns above are still being drawn,
   * scrolls up by `by` of what it holds: how far the turn at the top of
   * the view moved on the screen by the time all are drawn, in px.
   */
  drift: async (turns: number, by: number, short = false) => {
    running = false;
    made = sessionOf({ turns, short });
    entries = made.messages.map((row) => ({ id: row.id, row }));
    mount();
    await frame();
    const element = scroller();
    element.dispatchEvent(new WheelEvent('wheel', { deltaY: -1 }));
    element.scrollTop -= element.scrollHeight * by;
    await frame();
    const view = element.getBoundingClientRect();
    const at = document
      .elementFromPoint(view.left + view.width / 2, view.top + 4)
      ?.closest<HTMLElement>('section[data-turn]');
    const id = at?.dataset.turn;
    const top = () =>
      element
        .querySelector(`section[data-turn="${id}"]`)!
        .getBoundingClientRect().top;
    const before = top();
    const standing = () =>
      element.querySelectorAll('section[data-turn][aria-hidden]').length;
    const waiting = standing();
    await settled();
    return { moved: top() - before, waiting, left: standing() };
  },
  close: () => {
    root?.unmount();
    root = null;
  },
  toggleFold: (id: string) => toggleFold?.(id),
};

window.bench = bench;
