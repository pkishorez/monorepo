import { Effect, Queue, Semaphore, Stream, type Cause } from 'effect';
import { Memory } from '../../../db/memory/index.js';
import {
  makeStore,
  spaceTable,
  type Doorbell,
  type Leader,
  type SpaceTable,
} from '../contract/index.js';

/*
 * The Store in this process's memory, gone when it ends. Every app given the
 * same `Store.memory()` shares it as tabs share IndexedDB: one Leader per
 * Instance, the rest following, and a Doorbell between them. So two
 * participants run side by side in one test.
 */

/** One lock per space, taken in turn. */
const inProcessLeader = (): Leader => {
  const locks = new Map<string, Semaphore.Semaphore>();
  return (name, effect) =>
    Effect.suspend(() => {
      let lock = locks.get(name);
      if (lock === undefined) {
        lock = Semaphore.makeUnsafe(1);
        locks.set(name, lock);
      }
      return lock.withPermit(effect);
    });
};

/** Rings reach every listener of the topic in this process, its ringer's too. */
const inProcessDoorbell = (): Doorbell => {
  const listeners = new Map<string, Set<Queue.Queue<void, Cause.Done>>>();
  return {
    ring: (topic) =>
      Effect.sync(() => {
        for (const queue of listeners.get(topic) ?? [])
          Queue.offerUnsafe(queue, undefined);
      }),
    listen: (topic, initial = false) =>
      Stream.callback<void>(
        (queue) =>
          Effect.acquireRelease(
            Effect.sync(() => {
              const here = listeners.get(topic) ?? new Set();
              listeners.set(topic, here.add(queue));
              if (initial) Queue.offerUnsafe(queue, undefined);
            }),
            () => Effect.sync(() => listeners.get(topic)?.delete(queue)),
          ),
        // Rings that arrive while a listener is busy fold into one read.
        { bufferSize: 1, strategy: 'sliding' },
      ),
  };
};

/** A Store in memory, shared by every app given this Layer. */
const memory = () => {
  const spaces = new Map<string, SpaceTable>();
  return makeStore({
    table: (name) => {
      let table = spaces.get(name);
      if (table === undefined) {
        table = Memory.make(spaceTable).layer;
        spaces.set(name, table);
      }
      return table;
    },
    names: Effect.sync(() => [...spaces.keys()]),
    destroy: (name) => Effect.sync(() => spaces.delete(name)),
    leader: inProcessLeader(),
    doorbell: inProcessDoorbell(),
  });
};

export const Store = { memory };
