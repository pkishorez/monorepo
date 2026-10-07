import { Cause, Effect, Queue, Schema, Semaphore, Stream } from 'effect';
import type { Entity } from '../../core/index.js';
import { Memory } from '../../db/memory/index.js';
import { EntityESchema } from '../../eschema/index.js';
import { syncStore } from '../domain/stored-entity/index.js';
import type {
  Doorbell,
  Leadership,
  SyncStore,
} from '../store/contract/index.js';

export type Todo = { id: string; listId: string; title: string };

export const Todo = EntityESchema.make('Todo', 'id', {
  listId: Schema.String,
  title: Schema.String,
}).build();

/** `_u` as an ISO time `seconds` after a fixed start, so order and time agree. */
export const at = (seconds: number) =>
  new Date(Date.UTC(2026, 0, 1, 0, 0, seconds)).toISOString();

export const todo = (
  id: string,
  seconds: number,
  fields: Partial<Omit<Todo, 'id'>> = {},
): Entity<Todo> => ({
  value: { id, listId: 'a', title: id, ...fields },
  meta: { _e: 'Todo', _v: 'v1', _u: at(seconds), _d: false },
});

/** A Backend holding Entities, read forward and backward in pages. */
export const backend = (initial: Entity<Todo>[] = [], pageSize = 2) => {
  const rows = [...initial];
  const calls = { fetch: 0, fetchOlder: 0 };
  const sorted = () =>
    [...rows].sort((l, r) => (l.meta._u < r.meta._u ? -1 : 1));
  return {
    rows,
    calls,
    add: (...entities: Entity<Todo>[]) => rows.push(...entities),
    fetch: ({ after }: { after: Entity<Todo> | null }) =>
      Effect.sync(() => {
        calls.fetch += 1;
        return sorted()
          .filter((row) => after === null || row.meta._u > after.meta._u)
          .slice(0, pageSize);
      }),
    fetchOlder: ({ before }: { before: Entity<Todo> | null }) =>
      Effect.sync(() => {
        calls.fetchOlder += 1;
        return sorted()
          .reverse()
          .filter((row) => before === null || row.meta._u < before.meta._u)
          .slice(0, pageSize);
      }),
  };
};

/** One lock per key, shared by everyone holding this value: tabs in one process. */
export const sharedLeadership = (): Leadership => {
  const locks = new Map<string, Semaphore.Semaphore>();
  return {
    run: (key, effect) => {
      const lock = locks.get(key) ?? Semaphore.makeUnsafe(1);
      locks.set(key, lock);
      return lock.withPermit(effect);
    },
  };
};

export const sharedDoorbell = (): Doorbell => {
  const listeners = new Map<string, Set<Queue.Queue<void, Cause.Done>>>();
  return {
    ring: (topic) =>
      Effect.sync(() => {
        for (const queue of listeners.get(topic) ?? [])
          Queue.offerUnsafe(queue, undefined);
      }),
    listen: (topic) =>
      Stream.callback<void>((queue) =>
        Effect.acquireRelease(
          Effect.sync(() => {
            const set = listeners.get(topic) ?? new Set();
            listeners.set(topic, set);
            set.add(queue);
          }),
          () => Effect.sync(() => listeners.get(topic)?.delete(queue)),
        ),
      ),
  };
};

/** A durable store, Leadership, and Doorbell shared like tabs of one browser. */
export const sharedStore = (): SyncStore => {
  const table = Memory.make(syncStore).layer;
  return {
    table: () => table,
    leadership: sharedLeadership(),
    doorbell: sharedDoorbell(),
  };
};
