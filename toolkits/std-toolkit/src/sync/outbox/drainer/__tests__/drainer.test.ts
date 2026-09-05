import { Deferred, Effect, Fiber } from 'effect';
import { describe, expect, it } from 'vitest';
import { Memory } from '../../../../db/memory/index.js';
import {
  actionHandlerName,
  collectionHandlerName,
  collectionName,
  stdSyncName,
} from '../../../domain/identity/index.js';
import type { Connectivity } from '../../../domain/connectivity/index.js';
import { syncStore } from '../../../domain/stored-entity/index.js';
import {
  makeOutbox,
  OutboxUnreachable,
  queueKey,
  type OutboxEntry,
  type Request,
} from '../../outbox/index.js';
import { makeSyncStore } from '../../../platform/sync-store/index.js';
import { makeEffectRunner } from '../../../platform/effect-runner/index.js';
import { makeSyncFlow } from '../../../flow/sync-flow/index.js';

const todos = collectionHandlerName(
  collectionName(stdSyncName('test'), 'todos'),
);

const runner = makeEffectRunner<never>(undefined);

const connectivity = (initial = true) => {
  let online = initial;
  const listeners = new Set<() => void>();
  const port: Connectivity = {
    isOnline: () => online,
    subscribe: (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
  };
  return {
    port,
    set: (next: boolean) => {
      online = next;
      for (const listener of listeners) listener();
    },
  };
};

const harness = (options?: { online?: boolean }) => {
  const store = makeSyncStore(Memory.make(syncStore).layer);
  const net = connectivity(options?.online ?? true);
  const built = makeOutbox({
    syncName: 'test',
    store,
    runner,
    channel: null,
    connectivity: net.port,
    flow: makeSyncFlow({ id: 'test', participantPrefix: 'test' }),
    report: () => Effect.void,
  });
  const outbox = built.runtime;
  let seq = 0;
  const entity = (
    key: string,
    body: Omit<
      Extract<OutboxEntry['body'], { kind: 'entity' }>,
      'kind' | 'key'
    >,
  ): Omit<OutboxEntry, 'status'> => {
    const at = String(++seq).padStart(4, '0');
    return {
      id: `e${at}`,
      name: todos,
      queue: queueKey(todos, key),
      enqueuedAt: at,
      body: { kind: 'entity', key, ...body },
    };
  };
  const action = (name: string, queue: string, payload: unknown) => {
    const at = String(++seq).padStart(4, '0');
    return {
      id: `a${at}`,
      name: actionHandlerName(name),
      queue: queueKey(actionHandlerName(name), queue),
      enqueuedAt: at,
      body: { kind: 'action' as const, payload },
    };
  };
  const start = () => Effect.runFork(built.drain(() => Effect.void));
  const flush = () => new Promise((resolve) => setTimeout(resolve, 20));
  return { store: outbox.entries, outbox, net, entity, action, start, flush };
};

describe('outbox drainer', () => {
  it('folds a queue into one request, deletes the group, and resolves waiters', async () => {
    const h = harness();
    const requests: Request[] = [];
    h.outbox.registerHandler(todos, {
      kind: 'entity',
      send: (request) => Effect.sync(() => void requests.push(request)),
    });
    const a = h.entity('a', {
      op: 'insert',
      base: null,
      after: { id: 'a', t: 1 },
      changed: [],
    });
    const b = h.entity('a', {
      op: 'update',
      base: { id: 'a', t: 1 },
      after: { id: 'a', t: 2 },
      changed: ['t'],
    });
    await runner.runPromise(h.outbox.enqueue([a]));
    await runner.runPromise(h.outbox.enqueue([b]));
    const fiber = h.start();
    await runner.runPromise(
      Effect.all([h.outbox.delivered(a.id), h.outbox.delivered(b.id)]),
    );
    expect(requests).toEqual([{ op: 'insert', value: { id: 'a', t: 2 } }]);
    expect(await runner.runPromise(h.store.list())).toEqual([]);
    await runner.runPromise(Fiber.interrupt(fiber));
  });

  it('marks a rejected group failed, rejects its waiter, and continues the queue', async () => {
    const h = harness();
    let calls = 0;
    h.outbox.registerHandler(todos, {
      kind: 'entity',
      send: () =>
        Effect.suspend(() =>
          ++calls === 1 ? Effect.fail(new Error('nope')) : Effect.void,
        ),
    });
    const a = h.entity('a', {
      op: 'insert',
      base: null,
      after: { id: 'a' },
      changed: [],
    });
    await runner.runPromise(h.outbox.enqueue([a]));
    const fiber = h.start();
    await expect(
      runner.runPromise(h.outbox.delivered(a.id)),
    ).rejects.toMatchObject({
      _tag: 'OutboxEntryFailed',
    });
    expect((await runner.runPromise(h.store.byId(a.id)))?.status).toBe(
      'failed',
    );
    const b = h.entity('a', {
      op: 'update',
      base: { id: 'a' },
      after: { id: 'a', t: 1 },
      changed: ['t'],
    });
    await runner.runPromise(h.outbox.enqueue([b]));
    await runner.runPromise(h.outbox.delivered(b.id));
    expect(calls).toBe(2);
    await runner.runPromise(Fiber.interrupt(fiber));
  });

  it('keeps an unreachable group pending until the next signal', async () => {
    const h = harness();
    let reachable = false;
    const sent: unknown[] = [];
    h.outbox.registerHandler(todos, {
      kind: 'entity',
      send: (request) =>
        Effect.suspend(() =>
          reachable
            ? Effect.sync(() => void sent.push(request))
            : Effect.fail(new OutboxUnreachable({})),
        ),
    });
    const a = h.entity('a', {
      op: 'insert',
      base: null,
      after: { id: 'a' },
      changed: [],
    });
    await runner.runPromise(h.outbox.enqueue([a]));
    const fiber = h.start();
    await h.flush();
    expect((await runner.runPromise(h.store.byId(a.id)))?.status).toBe(
      'pending',
    );
    expect(sent).toEqual([]);
    reachable = true;
    h.net.set(true);
    await runner.runPromise(h.outbox.delivered(a.id));
    expect(sent).toHaveLength(1);
    await runner.runPromise(Fiber.interrupt(fiber));
  });

  it('does not send while offline and sends when connectivity returns', async () => {
    const h = harness({ online: false });
    const sent: unknown[] = [];
    h.outbox.registerHandler(todos, {
      kind: 'entity',
      send: (request) => Effect.sync(() => void sent.push(request)),
    });
    const a = h.entity('a', {
      op: 'insert',
      base: null,
      after: { id: 'a' },
      changed: [],
    });
    await runner.runPromise(h.outbox.enqueue([a]));
    const fiber = h.start();
    await h.flush();
    expect(sent).toEqual([]);
    h.net.set(true);
    await runner.runPromise(h.outbox.delivered(a.id));
    expect(sent).toHaveLength(1);
    await runner.runPromise(Fiber.interrupt(fiber));
  });

  it('runs queues in parallel and an action queue one entry at a time', async () => {
    const h = harness();
    const order: string[] = [];
    const gate = runner.runSync(Deferred.make<void>());
    h.outbox.registerHandler(actionHandlerName('archive'), {
      kind: 'action',
      send: (payload) =>
        Effect.gen(function* () {
          order.push(`start:${String(payload)}`);
          yield* Deferred.await(gate);
          order.push(`end:${String(payload)}`);
        }),
    });
    const p1 = h.action('archive', 'queue-1', 'p1');
    const p2 = h.action('archive', 'queue-1', 'p2');
    const q1 = h.action('archive', 'queue-2', 'q1');
    for (const entry of [p1, p2, q1])
      await runner.runPromise(h.outbox.enqueue([entry]));
    const fiber = h.start();
    await h.flush();
    expect(order.sort()).toEqual(['start:p1', 'start:q1']);
    await runner.runPromise(Deferred.succeed(gate, undefined));
    await runner.runPromise(
      Effect.all([p1, p2, q1].map((entry) => h.outbox.delivered(entry.id))),
    );
    expect(order.indexOf('start:p2')).toBeGreaterThan(order.indexOf('end:p1'));
    await runner.runPromise(Fiber.interrupt(fiber));
  });

  it('takes back in-flight entries a failed worker left behind', async () => {
    const h = harness();
    const requests: Request[] = [];
    const fiber = h.start();
    await h.flush();
    const a = h.entity('a', {
      op: 'insert',
      base: null,
      after: { id: 'a' },
      changed: [],
    });
    await runner.runPromise(h.outbox.enqueue([a]));
    await h.flush();
    await runner.runPromise(h.store.setStatus([a.id], 'in-flight'));
    h.outbox.registerHandler(todos, {
      kind: 'entity',
      send: (request) => Effect.sync(() => void requests.push(request)),
    });
    await runner.runPromise(h.outbox.delivered(a.id));
    expect(requests).toHaveLength(1);
    await runner.runPromise(Fiber.interrupt(fiber));
  });

  it('leaves an entry pending until its handler is registered', async () => {
    const h = harness();
    const a = h.action('later', '', {});
    await runner.runPromise(h.outbox.enqueue([a]));
    const fiber = h.start();
    await h.flush();
    expect((await runner.runPromise(h.store.byId(a.id)))?.status).toBe(
      'pending',
    );
    h.outbox.registerHandler(actionHandlerName('later'), {
      kind: 'action',
      send: () => Effect.void,
    });
    await runner.runPromise(h.outbox.delivered(a.id));
    await runner.runPromise(Fiber.interrupt(fiber));
  });

  it('interrupting the drainer interrupts the request itself', async () => {
    const h = harness();
    const started = runner.runSync(Deferred.make<void>());
    let interrupted = false;
    h.outbox.registerHandler(todos, {
      kind: 'entity',
      send: () =>
        Deferred.succeed(started, undefined).pipe(
          Effect.andThen(Effect.never),
          Effect.onInterrupt(() =>
            Effect.sync(() => {
              interrupted = true;
            }),
          ),
        ),
    });
    const a = h.entity('a', {
      op: 'insert',
      base: null,
      after: { id: 'a' },
      changed: [],
    });
    await runner.runPromise(h.outbox.enqueue([a]));
    const fiber = h.start();
    await runner.runPromise(Deferred.await(started));
    await runner.runPromise(Fiber.interrupt(fiber));
    expect(interrupted).toBe(true);
  });

  it('leaves an interrupted request in-flight and a new drainer resends it', async () => {
    const h = harness();
    let attempts = 0;
    const started = runner.runSync(Deferred.make<void>());
    h.outbox.registerHandler(todos, {
      kind: 'entity',
      send: () =>
        Effect.gen(function* () {
          attempts += 1;
          if (attempts === 1) {
            yield* Deferred.succeed(started, undefined);
            yield* Effect.never;
          }
        }),
    });
    const a = h.entity('a', {
      op: 'insert',
      base: null,
      after: { id: 'a' },
      changed: [],
    });
    await runner.runPromise(h.outbox.enqueue([a]));
    const first = h.start();
    await runner.runPromise(Deferred.await(started));
    await runner.runPromise(Fiber.interrupt(first));
    expect((await runner.runPromise(h.store.byId(a.id)))?.status).toBe(
      'in-flight',
    );
    const second = h.start();
    await runner.runPromise(h.outbox.delivered(a.id));
    expect(attempts).toBe(2);
    await runner.runPromise(Fiber.interrupt(second));
  });

  it('resolves a waiter from the store alone, with no doorbell', async () => {
    const h = harness();
    const a = h.entity('a', {
      op: 'insert',
      base: null,
      after: { id: 'a' },
      changed: [],
    });
    await runner.runPromise(h.outbox.enqueue([a]));
    await runner.runPromise(h.store.remove([a.id]));
    await runner.runPromise(h.outbox.delivered(a.id));
  });

  it('discard rejects the waiter and deletes the entry', async () => {
    const h = harness();
    const a = h.entity('a', {
      op: 'insert',
      base: null,
      after: { id: 'a' },
      changed: [],
    });
    await runner.runPromise(h.outbox.enqueue([a]));
    const waiting = runner.runPromise(h.outbox.delivered(a.id));
    await h.flush();
    await runner.runPromise(h.outbox.discard(a.id));
    await expect(waiting).rejects.toMatchObject({ _tag: 'OutboxEntryFailed' });
    expect(await runner.runPromise(h.store.byId(a.id))).toBeNull();
  });
});
