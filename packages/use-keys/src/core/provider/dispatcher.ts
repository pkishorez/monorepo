import { describe } from '../binding/index.ts';
import type { Key, Keys } from '../key/index.ts';
import type { KeySink } from '../key-input/index.ts';
import {
  type Cancel,
  createKeymap,
  type Entry,
  type Outcome,
  type Progress,
} from '../keymap/index.ts';
import { development } from './development.ts';

export type Timing = {
  /** Ms a key is held before a Shortcut or Sequence that asks to Repeats. */
  readonly delay: number;
  /** Ms between Repeats after that. */
  readonly interval: number;
  /** Ms a Sequence waits for its next step. */
  readonly timeout: number;
};

/** How Keys ended: `interrupted` when the page lost focus, every Key lifted at once. */
export type KeysEnd = { readonly interrupted: boolean };

export type Watcher = {
  /** Whether it hears the next Keys; read as their first Key goes down. */
  readonly enabled: () => boolean;
  readonly start: (keys: Keys) => void;
  readonly key: (key: Key, keys: Keys) => void;
  readonly end: (keys: Keys, end: KeysEnd) => void;
};

export type Declared = {
  readonly commit: () => void;
  readonly possible: (progress: ReadonlyArray<Progress>) => void;
  readonly cancel: (reason: Cancel) => void;
  /** Whether it Commits again while its key stays down. */
  readonly repeat: () => boolean;
};

type Slot = Declared & { readonly entry: Entry; id: number | undefined };

type Clock = {
  readonly now: () => number;
  readonly schedule: (run: () => void, ms: number) => () => void;
};

/**
 * One Keys Provider's state: the Keys under way, every listener that
 * watches them, and every Shortcut and Sequence that waits for keys. It
 * hears the page through the KeySink it gives, and runs the timers
 * Repeats and a Sequence's steps need.
 */
export const createDispatcher = (options: {
  readonly mac: boolean;
  readonly timing: () => Timing;
  readonly clock: Clock;
}) => {
  const { clock } = options;
  const keymap = createKeymap({
    mac: options.mac,
    timeout: () => options.timing().timeout,
  });
  const watchers = new Set<Watcher>();
  const declared = new Map<number, Slot>();
  // Entries that lost a Conflict in production, waiting for the keys.
  const blocked = new Set<Slot>();
  let hearing: ReadonlyArray<Watcher> = [];
  let keys: Keys = [];
  let startAt = 0;
  let stopRepeat = () => {};
  let stopDeadline = () => {};

  const dispatch = (outcomes: ReadonlyArray<Outcome>) => {
    for (const outcome of outcomes) {
      const listener = declared.get(outcome.id);
      if (outcome.type === 'commit') listener?.commit();
      if (outcome.type === 'possible') listener?.possible(outcome.progress);
      if (outcome.type === 'cancel') listener?.cancel(outcome.reason);
    }
  };

  // Asks the keymap again when the Sequence under way would be late.
  const watchDeadline = () => {
    stopDeadline();
    const deadline = keymap.deadline();
    if (deadline === undefined) return;
    stopDeadline = clock.schedule(
      () => {
        dispatch(keymap.expire(clock.now()));
        watchDeadline();
      },
      deadline - clock.now() + 1,
    );
  };

  // Commits `id` again after the delay, then at the interval, until any
  // key goes down or lifts.
  const repeat = (id: number) => {
    const again = (ms: number) => {
      stopRepeat = clock.schedule(() => {
        const listener = declared.get(id);
        if (listener === undefined) return;
        listener.commit();
        again(options.timing().interval);
      }, ms);
    };
    again(options.timing().delay);
  };

  // Adds a slot to the keymap, or returns the id it conflicts with.
  const place = (slot: Slot) => {
    const added = keymap.add(slot.entry);
    if ('conflict' in added) return added.conflict;
    slot.id = added.id;
    declared.set(added.id, slot);
    return undefined;
  };

  const lift = (index: number, at: number) => {
    const key = keys[index];
    if (key === undefined || key.upAt !== null) return;
    const up = { ...key, upAt: at - startAt };
    keys = keys.with(index, up);
    for (const watcher of hearing) watcher.key(up, keys);
  };

  const end = (interrupted: boolean) => {
    for (const watcher of hearing) watcher.end(keys, { interrupted });
    hearing = [];
    keys = [];
  };

  const interrupt = () => {
    stopRepeat();
    stopDeadline();
    dispatch(keymap.interrupt());
    if (keys.length === 0) return;
    const now = clock.now();
    keys.forEach((_, index) => lift(index, now));
    end(true);
  };

  const sink: KeySink = {
    down: (code, name) => {
      stopRepeat();
      const now = clock.now();
      if (keys.length === 0) {
        startAt = now;
        hearing = [...watchers].filter((watcher) => watcher.enabled());
      }
      const key: Key = { code, name, downAt: now - startAt, upAt: null };
      keys = [...keys, key];
      if (keys.length === 1) for (const watcher of hearing) watcher.start(keys);
      for (const watcher of hearing) watcher.key(key, keys);
    },
    up: (code) => {
      stopRepeat();
      const index = keys.findLastIndex(
        (key) => key.code === code && key.upAt === null,
      );
      if (index === -1) return;
      lift(index, clock.now());
      if (keys.every((key) => key.upAt !== null)) end(false);
    },
    press: (name, textEntry) => {
      const { taken, outcomes } = keymap.press({
        name,
        keys,
        now: clock.now(),
        textEntry,
      });
      dispatch(outcomes);
      watchDeadline();
      const repeats = outcomes.find(
        (outcome) =>
          outcome.type === 'commit' && declared.get(outcome.id)?.repeat(),
      );
      if (repeats !== undefined) repeat(repeats.id);
      return taken;
    },
    interrupt,
  };

  return {
    sink,
    /** Adds a listener that watches every Keys while it is Enabled. */
    watch: (watcher: Watcher) => {
      watchers.add(watcher);
      return () => {
        watchers.delete(watcher);
        hearing = hearing.filter((other) => other !== watcher);
      };
    },
    /**
     * Adds a Shortcut or Sequence while it is Enabled. When its keys
     * conflict with another's, it throws in development; in production it
     * warns, and the one added first keeps the keys.
     */
    declare: (entry: Entry, listener: Declared) => {
      const slot: Slot = { ...listener, entry, id: undefined };
      const conflict = place(slot);
      if (conflict !== undefined) {
        const other = declared.get(conflict)?.entry;
        const message = `use-keys: "${entry.bindings.map(describe).join('", "')}" conflicts with "${other?.bindings.map(describe).join('", "') ?? ''}", which is Enabled in the same KeysProvider.`;
        if (development()) throw new Error(message);
        console.warn(message);
        blocked.add(slot);
      }
      return () => {
        blocked.delete(slot);
        if (slot.id === undefined) return;
        keymap.remove(slot.id);
        declared.delete(slot.id);
        for (const waiting of blocked) {
          if (place(waiting) === undefined) blocked.delete(waiting);
        }
      };
    },
    /** Every declared Shortcut and Sequence, as people write them. */
    declared: () =>
      [...declared.values()].flatMap(({ entry }) =>
        entry.bindings.map(describe),
      ),
    keys: () => keys,
    /** Whether `mod` is Cmd here, as on Apple platforms, or Ctrl. */
    mac: options.mac,
  };
};

export type Dispatcher = ReturnType<typeof createDispatcher>;
