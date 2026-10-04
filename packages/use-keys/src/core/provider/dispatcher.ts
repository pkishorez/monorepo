import type { Key, Keys } from '../key/index.ts';
import type { KeySink } from '../key-input/index.ts';
import {
  type Cancel,
  createKeymap,
  describe,
  type Entry,
  type Outcome,
} from '../keymap/index.ts';
import { development } from './development.ts';

export type Timing = {
  /** Ms a key is held before a Shortcut that asks to Repeats. */
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
  readonly possible: () => void;
  readonly cancel: (reason: Cancel) => void;
  /** Whether it Commits again while its key stays down. */
  readonly repeat: () => boolean;
};

type Clock = {
  readonly now: () => number;
  readonly schedule: (run: () => void, ms: number) => () => void;
};

/**
 * One Keys Provider's state: the Keys under way, every listener that
 * watches them, and every Shortcut and Sequence that waits for keys. It
 * hears the page through the KeySink it gives, and runs the timers a
 * Shortcut's Repeats and a Sequence's steps need.
 */
export const createDispatcher = (options: {
  readonly mac: boolean;
  readonly enabled: () => boolean;
  readonly timing: () => Timing;
  readonly clock: Clock;
}) => {
  const { clock } = options;
  const keymap = createKeymap({
    mac: options.mac,
    timeout: () => options.timing().timeout,
  });
  const watchers = new Set<Watcher>();
  const declared = new Map<number, Declared & { readonly entry: Entry }>();
  let hearing: ReadonlyArray<Watcher> = [];
  let keys: Keys = [];
  let startAt = 0;
  let stopRepeat = () => {};
  let stopDeadline = () => {};

  const dispatch = (outcomes: ReadonlyArray<Outcome>) => {
    for (const outcome of outcomes) {
      const listener = declared.get(outcome.id);
      if (outcome.type === 'commit') listener?.commit();
      if (outcome.type === 'possible') listener?.possible();
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

  // Commits `id` again while `key` stays down: after the delay, then at
  // the interval.
  const repeat = (id: number, key: Key) => {
    const again = (ms: number) => {
      stopRepeat = clock.schedule(() => {
        if (!keys.some((k) => k.code === key.code && k.upAt === null)) return;
        declared.get(id)?.commit();
        again(options.timing().interval);
      }, ms);
    };
    again(options.timing().delay);
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
      if (!options.enabled()) return;
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
      const index = keys.findLastIndex(
        (key) => key.code === code && key.upAt === null,
      );
      if (index === -1) return;
      lift(index, clock.now());
      if (keys.every((key) => key.upAt !== null)) end(false);
    },
    press: (name, textEntry) => {
      if (!options.enabled()) return false;
      stopRepeat();
      const { taken, outcomes } = keymap.press({
        name,
        keys,
        now: clock.now(),
        textEntry,
      });
      dispatch(outcomes);
      watchDeadline();
      const pressed = textEntry ? undefined : keys.at(-1);
      const repeats = outcomes.find(
        (outcome) =>
          outcome.type === 'commit' && declared.get(outcome.id)?.repeat(),
      );
      if (repeats !== undefined && pressed !== undefined) {
        repeat(repeats.id, pressed);
      }
      return taken;
    },
    interrupt,
  };

  return {
    sink,
    interrupt,
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
      const added = keymap.add(entry);
      if ('conflict' in added) {
        const other = declared.get(added.conflict)?.entry;
        const message = `use-keys: "${entry.paths.map(describe).join('", "')}" conflicts with "${other?.paths.map(describe).join('", "') ?? ''}", which is Enabled in the same KeysProvider.`;
        if (development()) throw new Error(message);
        console.warn(message);
        return () => {};
      }
      declared.set(added.id, { ...listener, entry });
      return () => {
        keymap.remove(added.id);
        declared.delete(added.id);
      };
    },
    /** Every declared Shortcut and Sequence, as people write them. */
    declared: () =>
      [...declared.values()].flatMap(({ entry }) => entry.paths.map(describe)),
    keys: () => keys,
  };
};

export type Dispatcher = ReturnType<typeof createDispatcher>;
