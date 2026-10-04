import type { Keys } from '../key/index.ts';
import { commands, exact, overlaps, presses, type Step } from './shortcut.ts';

export { describe } from './shortcut.ts';
export type { Shortcut, Step } from './shortcut.ts';

/** Why a Sequence gave up before its last step. */
export type Cancel = 'key' | 'late' | 'interrupted';

/** What the keymap decided for one of its entries. */
export type Outcome =
  | { readonly id: number; readonly type: 'commit' }
  | { readonly id: number; readonly type: 'possible' }
  | { readonly id: number; readonly type: 'cancel'; readonly reason: Cancel };

export type Entry = {
  /** Its Sequences; a Shortcut is a Sequence of one step. */
  readonly paths: ReadonlyArray<ReadonlyArray<Step>>;
  /** Whether a step holding Ctrl, Alt or Cmd may be pressed in Text Entry. */
  readonly inTextEntry: boolean;
};

export type Press = {
  readonly name: string;
  /** The Keys, with every modifier down right now. */
  readonly keys: Keys;
  readonly now: number;
  readonly textEntry: boolean;
};

type Exact = ReturnType<typeof exact>;
type Stored = {
  readonly paths: ReadonlyArray<ReadonlyArray<Exact>>;
  readonly inTextEntry: boolean;
};
// A Sequence under way: `next` is the index of its step still to come.
type Candidate = {
  readonly id: number;
  readonly path: ReadonlyArray<Exact>;
  readonly next: number;
};

/**
 * Every Enabled Shortcut and Sequence of one Keys Provider, as steps waiting
 * for keys. It refuses an entry whose keys are the same as, or the start of,
 * another's. For each key going down it says which entries Commit, which
 * become Possible and which Cancel, and whether the key is Taken. It never
 * keeps time itself: the caller passes the time, and asks `expire` when
 * `deadline` passes.
 */
export const createKeymap = (options: {
  readonly mac: boolean;
  /** Ms a Sequence waits for its next step. */
  readonly timeout: () => number;
}) => {
  const entries = new Map<number, Stored>();
  let candidates: ReadonlyArray<Candidate> = [];
  let lastAt = 0;
  let nextId = 0;

  const store = (entry: Entry): Stored => ({
    inTextEntry: entry.inTextEntry,
    paths: entry.paths
      .filter((path) => path.length > 0)
      .map((path) => path.map((step) => exact(step, options.mac))),
  });

  // Whether one path's steps are the same as, or the start of, the other's.
  const prefixes = (a: ReadonlyArray<Exact>, b: ReadonlyArray<Exact>) =>
    a.every((step, i) => i >= b.length || overlaps(step, b[i] as Exact));

  const conflict = (entry: Stored) => {
    for (const [id, other] of entries) {
      const clash = entry.paths.some((path) =>
        other.paths.some((theirs) => prefixes(path, theirs)),
      );
      if (clash) return id;
    }
    return undefined;
  };

  const pending = () => new Set(candidates.map(({ id }) => id));

  const cancel = (ids: Iterable<number>, reason: Cancel): Outcome[] =>
    [...ids].map((id) => ({ id, type: 'cancel', reason }));

  const pressable = (entry: Stored, step: Exact, press: Press) =>
    presses(step, press.name, press.keys) &&
    (!press.textEntry || (entry.inTextEntry && commands(step)));

  // Moves every Sequence under way on by the key, if any can take it.
  const advance = (press: Press): Outcome[] | undefined => {
    const before = pending();
    const moved: Candidate[] = [];
    const committed = new Set<number>();
    for (const candidate of candidates) {
      const entry = entries.get(candidate.id);
      const step = candidate.path[candidate.next];
      if (entry === undefined || step === undefined) continue;
      if (!pressable(entry, step, press)) continue;
      if (candidate.next + 1 === candidate.path.length) {
        committed.add(candidate.id);
      } else moved.push({ ...candidate, next: candidate.next + 1 });
    }
    if (committed.size === 0 && moved.length === 0) return undefined;
    candidates = committed.size > 0 ? [] : moved;
    const left = [...before].filter(
      (id) => !committed.has(id) && !pending().has(id),
    );
    return [
      ...[...committed].map((id): Outcome => ({ id, type: 'commit' })),
      ...cancel(left, 'key'),
    ];
  };

  // Starts every Shortcut and Sequence whose first step is the key.
  const begin = (press: Press): Outcome[] => {
    const outcomes: Outcome[] = [];
    const started: Candidate[] = [];
    for (const [id, entry] of entries) {
      const first = entry.paths.filter((path) => {
        const step = path[0];
        return step !== undefined && pressable(entry, step, press);
      });
      if (first.some((path) => path.length === 1)) {
        outcomes.push({ id, type: 'commit' });
      } else if (first.length > 0) {
        outcomes.push({ id, type: 'possible' });
        for (const path of first) started.push({ id, path, next: 1 });
      }
    }
    candidates = started;
    return outcomes;
  };

  return {
    /**
     * Adds an entry, unless its keys conflict with one already in: then it
     * returns the id of that one, and adds nothing.
     */
    add: (entry: Entry) => {
      const stored = store(entry);
      const clash = conflict(stored);
      if (clash !== undefined) return { conflict: clash } as const;
      const id = nextId++;
      entries.set(id, stored);
      return { id } as const;
    },

    /** Removes an entry; a Sequence of it under way ends without a word. */
    remove: (id: number) => {
      entries.delete(id);
      candidates = candidates.filter((candidate) => candidate.id !== id);
    },

    /** A key other than a modifier went down. */
    press: (press: Press) => {
      const late = expire(press.now);
      const advanced = advance(press);
      if (advanced !== undefined) {
        lastAt = press.now;
        return { taken: true, outcomes: [...late, ...advanced] };
      }
      const stopped = cancel(pending(), 'key');
      const begun = begin(press);
      lastAt = press.now;
      return {
        taken: begun.length > 0,
        outcomes: [...late, ...stopped, ...begun],
      };
    },

    /** When the Sequences under way are too late, if any are under way. */
    deadline: () =>
      candidates.length > 0 ? lastAt + options.timeout() : undefined,

    /** Cancels the Sequences under way if their next step is late at `now`. */
    expire: (now: number) => expire(now),

    /** The page lost focus: every Sequence under way Cancels. */
    interrupt: () => {
      const outcomes = cancel(pending(), 'interrupted');
      candidates = [];
      return outcomes;
    },
  };

  function expire(now: number): Outcome[] {
    if (candidates.length === 0 || now - lastAt <= options.timeout()) return [];
    const outcomes = cancel(pending(), 'late');
    candidates = [];
    return outcomes;
  }
};

export type Keymap = ReturnType<typeof createKeymap>;
