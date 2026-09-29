import type { GestureEnd, Pointer, Pointers } from '@kstackz/use-gesture';
import { type MotionValue, motionValue } from '@kstackz/ui-toolkit/motion';
import { createContext, useContext, useSyncExternalStore } from 'react';

/** A Lab zone as the visuals name it: `Z2 · List`, in its own color. */
export type ZoneTag = {
  readonly label: string;
  readonly name: string;
  readonly color: string;
};

/** The zone a finger landed in, read from the DOM; none outside every zone. */
export const zoneTagOf = (target: Element | null): ZoneTag | undefined => {
  const zone = target?.closest<HTMLElement>('[data-lab-zone]');
  if (zone === null || zone === undefined) return undefined;
  return {
    label: zone.dataset.labZone ?? '',
    name: zone.dataset.labName ?? '',
    color: zone.dataset.labColor ?? 'currentColor',
  };
};

/** One Gesture of one provider, as the Lab saw it. */
export type Run = {
  readonly key: number;
  /** The provider's tag: '' for the Lab's own, 'A' or 'B' in Two providers. */
  readonly lane: string;
  readonly pointers: Pointers;
  /** Zone labels whose hook took the Gesture, innermost first. */
  readonly heard: ReadonlyArray<string>;
  readonly state: 'active' | 'ended' | 'interrupted';
  /** performance.now() as the first finger landed. */
  readonly zero: number;
};

/** A finger no Gesture took, with why. */
export type Stray = {
  readonly id: number;
  readonly x: MotionValue<number>;
  readonly y: MotionValue<number>;
  readonly why: string;
};

/** A piece of a log line: text, a zone chip, or a finger chip. */
export type Part =
  | string
  | { readonly zone: ZoneTag }
  | { readonly finger: string; readonly color?: string };

export type Entry = {
  readonly key: number;
  readonly run: number;
  /** ms since the run's first finger; none outside a run. */
  readonly at?: number;
  readonly parts: ReadonlyArray<Part>;
};

type State = {
  readonly runs: ReadonlyMap<string, Run>;
  readonly strays: ReadonlyArray<Stray>;
  readonly log: ReadonlyArray<Entry>;
};

const LOG_SIZE = 80;

/** How a finger reads in the visuals: its landing order, with the lane. */
export const fingerName = (run: Run, pointer: Pointer) =>
  `${run.lane}${[...run.pointers.keys()].indexOf(pointer.id) + 1}`;

const fingerPart = (run: Run, pointer: Pointer): Part => ({
  finger: fingerName(run, pointer),
  color: zoneTagOf(pointer.target)?.color,
});

const where = (pointer: Pointer): ReadonlyArray<Part> => {
  const zone = zoneTagOf(pointer.target);
  return zone === undefined ? ['outside every zone'] : ['in ', { zone }];
};

// The Lab zones a Gesture starting on `target` walks through, innermost
// first, and whether a trapped one stopped it. It mirrors the block's walk
// from the DOM, so the log can explain what the hooks then report.
const walk = (target: Element | null) => {
  const zones: Array<{ tag: ZoneTag; trapped: boolean }> = [];
  let zone = target?.closest<HTMLElement>('[data-slot="gesture-zone"]');
  while (zone !== null && zone !== undefined) {
    const tag = zoneTagOf(zone);
    const trapped = zone.hasAttribute('data-trapped');
    if (tag !== undefined) zones.push({ tag, trapped });
    if (trapped) break;
    zone = zone.parentElement?.closest<HTMLElement>(
      '[data-slot="gesture-zone"]',
    );
  }
  return zones;
};

/**
 * What the Lab shows: the latest Gesture of each provider, fingers no
 * Gesture took, and a log. Every Lab zone's hook reports here; several
 * hooks hear the same Gesture, so each report is counted once.
 */
export const createLabStore = () => {
  let state: State = { runs: new Map(), strays: [], log: [] };
  const listeners = new Set<() => void>();
  let keys = 0;
  let runs = 0;
  // Per run: which landings and liftings were logged.
  const told = new Map<number, Set<string>>();

  const emit = (next: Partial<State>) => {
    state = { ...state, ...next };
    for (const listener of listeners) listener();
  };

  const log = (run: Run | undefined, parts: ReadonlyArray<Part>) => {
    const entry: Entry = {
      key: ++keys,
      run: run?.key ?? 0,
      at:
        run === undefined
          ? undefined
          : Math.round(performance.now() - run.zero),
      parts,
    };
    emit({ log: [entry, ...state.log].slice(0, LOG_SIZE) });
  };

  const setRun = (run: Run) => {
    const next = new Map(state.runs);
    next.set(run.lane, run);
    emit({ runs: next });
    return run;
  };

  // Tells a landing or lifting once, however many hooks report it.
  const once = (run: Run, what: string) => {
    const seen = told.get(run.key) ?? new Set();
    told.set(run.key, seen);
    if (seen.has(what)) return false;
    seen.add(what);
    return true;
  };

  const explainWalk = (run: Run) => {
    const [first] = run.pointers.values();
    if (first === undefined) return;
    const zones = walk(first.target);
    const parts: Array<Part> = ['Walk: '];
    zones.forEach(({ tag }, i) => {
      if (i > 0) parts.push(' → ');
      parts.push({ zone: tag });
      if (!run.heard.includes(tag.label)) parts.push(' (hook off)');
    });
    const last = zones.at(-1);
    parts.push(
      last?.trapped === true
        ? `. ${last.tag.label} is trapped, so the walk stops there.`
        : '. No trapped zone, so it reaches the outermost one.',
    );
    log(run, parts);
  };

  return {
    subscribe: (listener: () => void) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    get: () => state,

    /** A zone's hook took a new Gesture. */
    start: (lane: string, zone: ZoneTag, pointers: Pointers) => {
      const current = state.runs.get(lane);
      if (current?.state === 'active') {
        setRun({ ...current, heard: [...current.heard, zone.label] });
        return;
      }
      const run = setRun({
        key: ++runs,
        lane,
        pointers,
        heard: [zone.label],
        state: 'active',
        zero: performance.now(),
      });
      const [first] = pointers.values();
      if (first !== undefined) {
        once(run, `down ${first.id}`);
        log(run, [
          'Gesture started: finger ',
          fingerPart(run, first),
          ' landed ',
          ...where(first),
          '.',
        ]);
      }
      // Every hook that hears it starts in this same moment; explain the
      // walk once they all have.
      queueMicrotask(() => {
        const settled = state.runs.get(lane);
        if (settled?.key === run.key) explainWalk(settled);
      });
    },

    /** A finger landed or lifted in a Gesture a zone's hook took. */
    pointer: (lane: string, pointer: Pointer, pointers: Pointers) => {
      const current = state.runs.get(lane);
      if (current === undefined) return;
      const run = setRun({ ...current, pointers });
      const lifted = pointer.end !== undefined;
      if (!once(run, `${lifted ? 'up' : 'down'} ${pointer.id}`)) return;
      if (!lifted) {
        log(run, [
          'Finger ',
          fingerPart(run, pointer),
          ' joined, landing ',
          ...where(pointer),
          '. Who hears the Gesture does not change.',
        ]);
        return;
      }
      const down = [...pointers.values()].filter((p) => p.end === undefined);
      log(run, [
        'Finger ',
        fingerPart(run, pointer),
        ' lifted',
        down.length === 0
          ? '.'
          : `; it stays in the Gesture, frozen. ${down.length} still down.`,
      ]);
    },

    /** The Gesture a zone's hook took ended. */
    end: (lane: string, pointers: Pointers, end: GestureEnd) => {
      const current = state.runs.get(lane);
      if (current === undefined || current.state !== 'active') return;
      const run = setRun({
        ...current,
        pointers,
        state: end.interrupted ? 'interrupted' : 'ended',
      });
      log(
        run,
        end.interrupted
          ? [
              'Gesture interrupted: the browser took the touch (a scroll, a system gesture) or the page lost focus.',
            ]
          : [`Gesture ended: the last finger lifted, ${pointers.size} in all.`],
      );
    },

    /** A line from a Case itself, such as a click. */
    note: (lane: string, parts: ReadonlyArray<Part>) =>
      log(state.runs.get(lane), parts),

    /** A finger landed on the stage and no Gesture took it. */
    stray: (id: number, x: number, y: number, why: string) => {
      emit({
        strays: [
          ...state.strays,
          { id, x: motionValue(x), y: motionValue(y), why },
        ],
      });
      log(undefined, [{ finger: '×' }, ` Finger ignored: ${why}.`]);
    },
    moveStray: (id: number, x: number, y: number) => {
      const stray = state.strays.find((s) => s.id === id);
      stray?.x.set(x);
      stray?.y.set(y);
    },
    liftStray: (id: number) => {
      if (!state.strays.some((s) => s.id === id)) return;
      emit({ strays: state.strays.filter((s) => s.id !== id) });
    },

    /** Forgets everything, as a new Case opens. */
    reset: () => {
      told.clear();
      emit({ runs: new Map(), strays: [], log: [] });
    },
  };
};

export type LabStore = ReturnType<typeof createLabStore>;

export const LabStoreContext = createContext<LabStore | undefined>(undefined);

export const useLabStore = () => {
  const store = useContext(LabStoreContext);
  if (store === undefined) throw new Error('Outside the Gesture Lab');
  return store;
};

export const useLab = () => {
  const store = useLabStore();
  return useSyncExternalStore(store.subscribe, store.get, store.get);
};

/** Which provider a Lab zone belongs to: '' for the Lab's own. */
export const LaneContext = createContext('');
