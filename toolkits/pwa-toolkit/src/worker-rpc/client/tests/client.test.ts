import * as Effect from 'effect/Effect';
import * as Fiber from 'effect/Fiber';
import * as Layer from 'effect/Layer';
import * as Queue from 'effect/Queue';
import * as Schedule from 'effect/Schedule';
import * as Schema from 'effect/Schema';
import type * as Scope from 'effect/Scope';
import * as Stream from 'effect/Stream';
import * as Rpc from 'effect/unstable/rpc/Rpc';
import * as RpcGroup from 'effect/unstable/rpc/RpcGroup';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { BuildId } from '../../../domain/build/index.js';
import { WorkerHost } from '../../../domain/worker-host/index.js';
import { WorkerServer } from '../../server/index.js';
import { TabClient } from '../index.js';

const Group = RpcGroup.make(
  Rpc.make('add', {
    payload: { a: Schema.Number, b: Schema.Number },
    success: Schema.Number,
  }),
  Rpc.make('count', {
    payload: { to: Schema.Number },
    success: Schema.Number,
    stream: true,
  }),
  // Emits which worker instance served it, then stays open.
  Rpc.make('watch', { success: Schema.Number, stream: true }),
  Rpc.make('ticks', { success: Schema.Number, stream: true }),
);

const later = (f: () => void) => setTimeout(f, 0);

/**
 * An in-memory service worker and one tab: `navigator.serviceWorker`, its
 * controller, `self.clients`, and a worker that can be stopped and is woken
 * again by the next message, with all of its state gone.
 */
const makeBrowser = (builds: { tab: string; worker: string }) => {
  const workerBuildId = BuildId.make(builds.worker);
  const container = Object.assign(new EventTarget(), {
    controller: null as unknown,
  });
  const lifetimes: Array<Promise<unknown>> = [];
  const stats = { starts: 0, ticksInterrupted: 0 };

  const tab = {
    id: 'tab-1',
    postMessage: (message: unknown) => {
      const data = structuredClone(message);
      later(() =>
        container.dispatchEvent(new MessageEvent('message', { data })),
      );
    },
  };
  const openTabs = new Map([[tab.id, tab]]);

  let running:
    | {
        queue: Queue.Queue<ExtendableMessageEvent>;
        fiber: Fiber.Fiber<never, unknown>;
        alive: boolean;
      }
    | undefined;

  const start = () => {
    stats.starts++;
    const instance = stats.starts;
    const queue = Effect.runSync(Queue.make<ExtendableMessageEvent>());
    const handlers = Group.toLayer({
      add: ({ a, b }) => Effect.succeed(a + b),
      count: ({ to }) => Stream.range(1, to),
      watch: () => Stream.concat(Stream.make(instance), Stream.never),
      ticks: () =>
        Stream.fromSchedule(Schedule.spaced('20 millis')).pipe(
          Stream.ensuring(Effect.sync(() => stats.ticksInterrupted++)),
        ),
    });
    const layer = WorkerServer.layer(Group).pipe(
      Layer.provide(handlers),
      Layer.provide(
        Layer.succeed(WorkerHost)({
          buildId: workerBuildId,
          messages: Stream.fromQueue(queue),
        }),
      ),
    );
    return { queue, fiber: Effect.runFork(Layer.launch(layer)), alive: true };
  };

  const controller = {
    postMessage: (message: unknown) => {
      const data = structuredClone(message);
      later(() => {
        const current = (running ??= start());
        const open = openTabs.get(tab.id);
        const event = {
          data,
          // A stopped worker sends nothing more, not even its shutdown.
          source: open && {
            id: open.id,
            postMessage: (reply: unknown) =>
              current.alive && open.postMessage(reply),
          },
          waitUntil: (promise: Promise<unknown>) =>
            void lifetimes.push(promise),
        } as unknown as ExtendableMessageEvent;
        Queue.offerUnsafe(current.queue, event);
      });
    },
  };

  vi.stubGlobal('self', {
    clients: { get: async (id: string) => openTabs.get(id) },
  });
  vi.stubGlobal('navigator', { serviceWorker: container });
  vi.stubGlobal('document', {
    querySelector: () => ({ getAttribute: () => builds.tab }),
  });

  return {
    stats,
    lifetimes,
    claim: () => {
      container.controller = controller;
      container.dispatchEvent(new Event('controllerchange'));
    },
    /** The browser stops an idle (or overdue) worker. */
    stop: () =>
      Effect.gen(function* () {
        const current = running;
        running = undefined;
        if (current === undefined) return;
        current.alive = false;
        yield* Fiber.interrupt(current.fiber);
      }),
    closeTab: () => openTabs.delete(tab.id),
  };
};

const run = <A, E>(effect: Effect.Effect<A, E, Scope.Scope>) =>
  Effect.runPromise(Effect.scoped(effect));

afterEach(() => vi.unstubAllGlobals());

describe('Worker RPC', () => {
  it('answers a unary call and holds the worker alive while it is in flight', async () => {
    const browser = makeBrowser({ tab: 'build-a', worker: 'build-a' });
    browser.claim();
    const result = await run(
      Effect.gen(function* () {
        const client = yield* TabClient.make(Group);
        return yield* client.add({ a: 1, b: 2 });
      }),
    );
    expect(result).toBe(3);
    expect(browser.lifetimes.length).toBeGreaterThan(0);
    await Promise.all(browser.lifetimes);
  });

  it('waits for a controller before the first call goes out', async () => {
    const browser = makeBrowser({ tab: 'build-a', worker: 'build-a' });
    setTimeout(browser.claim, 50);
    const result = await run(
      Effect.flatMap(TabClient.make(Group), (client) =>
        client.add({ a: 2, b: 2 }),
      ),
    );
    expect(result).toBe(4);
  });

  it('streams every chunk of a stream call', async () => {
    const browser = makeBrowser({ tab: 'build-a', worker: 'build-a' });
    browser.claim();
    const chunks = await run(
      Effect.gen(function* () {
        const client = yield* TabClient.make(Group);
        return yield* Stream.runCollect(client.count({ to: 5 }));
      }),
    );
    expect(chunks).toEqual([1, 2, 3, 4, 5]);
  });

  it('fails calls with VersionSkew when the worker belongs to another Build ID', async () => {
    const browser = makeBrowser({ tab: 'build-new', worker: 'build-old' });
    browser.claim();
    const [first, second] = await run(
      Effect.gen(function* () {
        const client = yield* TabClient.make(Group);
        const first = yield* Effect.flip(client.add({ a: 1, b: 1 }));
        const second = yield* Effect.flip(client.add({ a: 1, b: 1 }));
        return [first, second] as const;
      }),
    );
    for (const error of [first, second]) {
      expect(error._tag).toBe('VersionSkew');
      expect(error).toMatchObject({
        tabBuildId: 'build-new',
        workerBuildId: 'build-old',
      });
    }
  });

  it('answers the next call without error after the worker is stopped while idle', async () => {
    const browser = makeBrowser({ tab: 'build-a', worker: 'build-a' });
    browser.claim();
    const results = await run(
      Effect.gen(function* () {
        const client = yield* TabClient.make(Group);
        const first = yield* client.add({ a: 1, b: 1 });
        yield* browser.stop();
        const second = yield* client.add({ a: 2, b: 3 });
        const third = yield* client.add({ a: 4, b: 5 });
        return [first, second, third];
      }),
    );
    expect(results).toEqual([2, 5, 9]);
    expect(browser.stats.starts).toBe(2);
  });

  it('reconnects after the worker is stopped, and a retried stream restarts', async () => {
    const browser = makeBrowser({ tab: 'build-a', worker: 'build-a' });
    browser.claim();
    const { seen, sum } = await run(
      Effect.gen(function* () {
        const client = yield* TabClient.make(Group, {
          livenessInterval: '50 millis',
        });
        const seen: number[] = [];
        const watching = yield* client.watch().pipe(
          Stream.retry(Schedule.spaced('10 millis')),
          Stream.tap((instance) =>
            Effect.gen(function* () {
              seen.push(instance);
              if (instance === 1) yield* browser.stop();
            }),
          ),
          Stream.take(2),
          Stream.runDrain,
          Effect.forkScoped,
        );
        yield* Fiber.join(watching);
        const sum = yield* client.add({ a: 20, b: 22 });
        return { seen, sum };
      }),
    );
    expect(seen).toEqual([1, 2]);
    expect(browser.stats.starts).toBe(2);
    expect(sum).toBe(42);
  }, 10_000);

  it('treats a tab that clients.get no longer finds as disconnected', async () => {
    const browser = makeBrowser({ tab: 'build-a', worker: 'build-a' });
    browser.claim();
    await run(
      Effect.gen(function* () {
        const client = yield* TabClient.make(Group);
        const ticking = yield* client
          .ticks()
          .pipe(Stream.runDrain, Effect.forkScoped);
        yield* Effect.sleep('60 millis');
        browser.closeTab();
        yield* Effect.sleep('100 millis');
        expect(browser.stats.ticksInterrupted).toBe(1);
        yield* Fiber.interrupt(ticking);
      }),
    );
  });
});
