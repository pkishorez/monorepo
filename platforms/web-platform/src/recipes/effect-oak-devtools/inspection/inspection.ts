import { useMemo, useState } from 'react';
import type { Entry } from 'effect-oak';
import type { AppRuntime } from 'effect-oak/react';
import type { Around, Step } from '../step/index.ts';
import { allEntries, pathTo, tipFrom } from './log-walk.ts';
import { usePaced } from './pace.ts';

/*
 * One Inspection of a running app: what the Timeline, the Inspector and the
 * panel share. The Branch in view follows the Head until a Step on another
 * Branch is shown; the Step shown is the Runtime's, so the app moves with it.
 */

export type Tab = 'timeline' | 'inspector';

/** How the Step shown is told below the Timeline and the Inspector. */
export type Detail = 'happened' | 'snapshot' | 'json';

/** Everything the panel shares: the Branch in view, the Step shown, the Instance picked. */
export interface Inspection {
  readonly runtime: AppRuntime;
  /** Every entry on every Branch, oldest first. */
  readonly entries: ReadonlyArray<Entry>;
  /** The Branch in view, oldest first: the Head's, or one picked on the Timeline. */
  readonly view: ReadonlyArray<Entry>;
  /** The Step shown; live, the Head's. */
  readonly step: Step;
  readonly live: boolean;
  readonly around: (step: Step) => Around | undefined;
  /** Time Travel to a Step; one on another Branch brings that Branch into view. */
  readonly show: (step: Step) => void;
  /** One Step along the Branch in view, back (-1) or forward (1). */
  readonly move: (by: -1 | 1) => void;
  readonly goLive: () => void;
  /** Go live from the Step shown, growing a new Branch from it. */
  readonly fork: () => void;
  readonly tab: Tab;
  readonly setTab: (tab: Tab) => void;
  readonly detail: Detail;
  readonly setDetail: (detail: Detail) => void;
  /** The Instance picked in the Inspector, or `null` for the whole Snapshot. */
  readonly picked: string | null;
  readonly pick: (instance: string | null) => void;
  /** How many of the newest rows the Timeline shows; `null` for every one. */
  readonly limit: number | null;
  readonly setLimit: (limit: number | null) => void;
}

export const useInspection = (
  live: AppRuntime,
  /** How many of the newest rows the Timeline shows at first. */
  initialLimit: number | null = 50,
): Inspection => {
  // A flood of Messages reaches the panel a few times a second, not each time.
  const runtime = usePaced(live);
  /** The tip of the Branch in view; `undefined` follows the Head. */
  const [tip, setTip] = useState<number | undefined>(undefined);
  const [tab, setTab] = useState<Tab>('timeline');
  const [detail, setDetail] = useState<Detail>('happened');
  const [picked, pick] = useState<string | null>(null);
  const [limit, setLimit] = useState(initialLimit);

  // Worked out again only when what the panel sees changes, so a panel that
  // has nothing new draws nothing new.
  return useMemo((): Inspection => {
    const all = allEntries(runtime.children);
    const byId = new Map(all.map((entry) => [entry.id, entry]));
    const view = pathTo(
      byId,
      tip !== undefined && byId.has(tip) ? tip : runtime.head,
    );
    const { shown } = runtime;
    const step: Step =
      shown === 'init'
        ? 'init'
        : shown === null
          ? (byId.get(runtime.head ?? -1) ?? 'init')
          : (byId.get(shown) ?? 'init');

    const show = (at: Step) => {
      if (at !== 'init' && !view.includes(at))
        setTip(tipFrom(at, runtime.children).id);
      runtime.show(at === 'init' ? 'init' : at.id);
    };

    return {
      runtime,
      entries: all,
      view,
      step,
      live: shown === null,
      around: (at) => {
        const after = runtime.snapshotAt(at === 'init' ? null : at.id);
        return after
          ? {
              before: at === 'init' ? undefined : runtime.snapshotAt(at.parent),
              after,
            }
          : undefined;
      },
      show,
      move: (by) => {
        const index = step === 'init' ? -1 : view.indexOf(step);
        const next = index + by;
        if (next === -1) show('init');
        else if (view[next]) show(view[next]);
      },
      goLive: () => {
        setTip(undefined);
        runtime.show(null);
      },
      fork: () => {
        setTip(undefined);
        runtime.start(step === 'init' ? null : step.id);
      },
      tab,
      setTab,
      detail,
      setDetail,
      picked,
      pick,
      limit,
      setLimit,
    };
  }, [runtime, tip, tab, detail, picked, limit]);
};
