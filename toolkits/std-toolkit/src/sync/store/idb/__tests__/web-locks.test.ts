import { Effect, Fiber } from 'effect';
import { expect, it } from 'vitest';
import { webLockLeadership, type BrowserLockManager } from '../web-locks.js';

// A lock manager holding one lock per name, granted in request order.
const fakeLocks = (): BrowserLockManager & { held: Set<string> } => {
  const held = new Set<string>();
  const queues = new Map<string, Array<() => void>>();
  return {
    held,
    request: (name, { signal }, callback) =>
      new Promise((resolve, reject) => {
        const grant = () => {
          held.add(name);
          void callback(null).then(() => {
            held.delete(name);
            queues.get(name)?.shift()?.();
            resolve(undefined);
          });
        };
        if (!held.has(name)) return grant();
        const queue = queues.get(name) ?? [];
        queues.set(name, queue);
        queue.push(grant);
        signal.addEventListener('abort', () => {
          queue.splice(queue.indexOf(grant), 1);
          reject(signal.reason);
        });
      }),
  };
};

it('holds the lock only while the effect runs', async () => {
  const locks = fakeLocks();
  const leadership = webLockLeadership(locks);
  const seen = await Effect.runPromise(
    leadership.run(
      'a',
      Effect.sync(() => [...locks.held]),
    ),
  );
  expect(seen).toEqual(['std-sync:a']);
  expect(locks.held.size).toBe(0);
});

it('stops waiting when interrupted', async () => {
  const locks = fakeLocks();
  const leadership = webLockLeadership(locks);
  await Effect.runPromise(
    Effect.gen(function* () {
      const holder = yield* Effect.forkChild(leadership.run('a', Effect.never));
      yield* Effect.sleep('5 millis');
      const waiter = yield* Effect.forkChild(leadership.run('a', Effect.void));
      yield* Effect.sleep('5 millis');
      yield* Fiber.interrupt(waiter);
      yield* Fiber.interrupt(holder);
    }),
  );
  expect(locks.held.size).toBe(0);
});
