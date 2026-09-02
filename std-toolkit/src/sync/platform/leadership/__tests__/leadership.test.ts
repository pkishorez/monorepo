import { Deferred, Effect, Fiber } from 'effect';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { inMemoryLeadership } from '../in-memory/index.js';
import { webLockLeadership } from '../../browser/web-locks/index.js';
import {
  leadershipIdentity,
  makeLeadership,
  type LeadershipIdentity,
} from '../index.js';

const identity = (partitionKey: string): LeadershipIdentity =>
  leadershipIdentity({
    scope: ['test.items', partitionKey],
    role: { _tag: 'Strategy', name: 'old-to-new' },
  });

class FakeDocument {
  visibilityState = 'visible';
  readonly listeners = new Map<string, Set<() => void>>();

  addEventListener(type: string, listener: () => void) {
    const listeners = this.listeners.get(type) ?? new Set();
    listeners.add(listener);
    this.listeners.set(type, listeners);
  }

  removeEventListener(type: string, listener: () => void) {
    this.listeners.get(type)?.delete(listener);
  }

  dispatch(type: string) {
    for (const listener of this.listeners.get(type) ?? []) listener();
  }

  setVisibility(visibilityState: 'hidden' | 'visible') {
    this.visibilityState = visibilityState;
    this.dispatch('visibilitychange');
  }
}

class FakeLocks {
  acquisitions = 0;
  releases = 0;

  request(
    _name: string,
    options: { readonly signal: AbortSignal },
    callback: (lock: unknown) => Promise<void>,
  ): Promise<unknown> {
    return new Promise((resolve, reject) => {
      const onAbort = () => reject(options.signal.reason);
      options.signal.addEventListener('abort', onAbort, { once: true });
      queueMicrotask(() => {
        if (options.signal.aborted) return;
        options.signal.removeEventListener('abort', onAbort);
        this.acquisitions += 1;
        void callback({}).then(() => {
          this.releases += 1;
          resolve(undefined);
        }, reject);
      });
    });
  }
}

afterEach(() => vi.unstubAllGlobals());

describe('in-memory Leadership', () => {
  it('runs only one owner for an identity across coordinators sharing a Layer', async () => {
    const layer = inMemoryLeadership();
    const first = makeLeadership(layer);
    const second = makeLeadership(layer);
    let active = 0;
    let maximum = 0;

    await Effect.runPromise(
      Effect.gen(function* () {
        const entered = yield* Deferred.make<void>();
        const release = yield* Deferred.make<void>();
        const work = Effect.acquireUseRelease(
          Effect.sync(() => {
            active += 1;
            maximum = Math.max(maximum, active);
          }),
          () =>
            Deferred.succeed(entered, undefined).pipe(
              Effect.andThen(Deferred.await(release)),
            ),
          () =>
            Effect.sync(() => {
              active -= 1;
            }),
        );

        const owner = yield* Effect.forkChild(first.run(identity('one'), work));
        yield* Deferred.await(entered);
        const follower = yield* Effect.forkChild(
          second.run(identity('one'), work),
        );
        yield* Effect.yieldNow;

        expect(active).toBe(1);
        expect(maximum).toBe(1);
        yield* Deferred.succeed(release, undefined);
        yield* Fiber.join(owner);
        yield* Fiber.join(follower);
      }),
    );

    expect(maximum).toBe(1);
    await first.dispose();
    await second.dispose();
  });

  it('allows different exact identities to run independently', async () => {
    const layer = inMemoryLeadership();
    const first = makeLeadership(layer);
    const second = makeLeadership(layer);
    let active = 0;
    let maximum = 0;

    await Effect.runPromise(
      Effect.gen(function* () {
        const release = yield* Deferred.make<void>();
        const work = Effect.acquireUseRelease(
          Effect.sync(() => {
            active += 1;
            maximum = Math.max(maximum, active);
          }),
          () => Deferred.await(release),
          () =>
            Effect.sync(() => {
              active -= 1;
            }),
        );

        const left = yield* Effect.forkChild(first.run(identity('one'), work));
        const right = yield* Effect.forkChild(
          second.run(identity('two'), work),
        );
        yield* Effect.yieldNow;
        expect(maximum).toBe(2);
        yield* Deferred.succeed(release, undefined);
        yield* Fiber.join(left);
        yield* Fiber.join(right);
      }),
    );

    await first.dispose();
    await second.dispose();
  });

  it('removes an interrupted follower without running its work', async () => {
    const layer = inMemoryLeadership();
    const first = makeLeadership(layer);
    const second = makeLeadership(layer);
    let followerEntered = false;

    await Effect.runPromise(
      Effect.gen(function* () {
        const entered = yield* Deferred.make<void>();
        const release = yield* Deferred.make<void>();
        const owner = yield* Effect.forkChild(
          first.run(
            identity('one'),
            Deferred.succeed(entered, undefined).pipe(
              Effect.andThen(Deferred.await(release)),
            ),
          ),
        );
        yield* Deferred.await(entered);
        const follower = yield* Effect.forkChild(
          second.run(
            identity('one'),
            Effect.sync(() => {
              followerEntered = true;
            }),
          ),
        );
        yield* Effect.yieldNow;
        yield* Fiber.interrupt(follower);
        yield* Deferred.succeed(release, undefined);
        yield* Fiber.join(owner);
      }),
    );

    expect(followerEntered).toBe(false);
    await first.dispose();
    await second.dispose();
  });
});

describe('Web Lock Leadership', () => {
  const install = (releaseWhen: 'hidden' | 'frozen') => {
    const document = new FakeDocument();
    const locks = new FakeLocks();
    vi.stubGlobal('document', document);
    vi.stubGlobal('navigator', { locks });
    return {
      coordinator: makeLeadership(webLockLeadership({ releaseWhen })),
      document,
      locks,
    };
  };

  it('fails clearly when browser coordination is unavailable', () => {
    vi.stubGlobal('document', undefined);
    vi.stubGlobal('navigator', {});
    expect(() => webLockLeadership()).toThrow(
      'Web Lock Leadership requires navigator.locks and document',
    );
  });

  it('releases while hidden and competes again when visible', async () => {
    const { coordinator, document, locks } = install('hidden');
    let attempts = 0;
    const fiber = Effect.runFork(
      coordinator.run(
        identity('hidden'),
        Effect.sync(() => {
          attempts += 1;
        }).pipe(Effect.andThen(Effect.never)),
      ),
    );

    await vi.waitFor(() => expect(attempts).toBe(1));
    document.setVisibility('hidden');
    await vi.waitFor(() => expect(locks.releases).toBe(1));
    expect(locks.acquisitions).toBe(1);

    document.setVisibility('visible');
    await vi.waitFor(() => expect(attempts).toBe(2));
    await Effect.runPromise(Fiber.interrupt(fiber));
    await vi.waitFor(() => expect(locks.releases).toBe(2));
    await coordinator.dispose();
    expect(
      [...document.listeners.values()].every(
        (listeners) => listeners.size === 0,
      ),
    ).toBe(true);
  });

  it('stays eligible while hidden and releases when frozen', async () => {
    const { coordinator, document, locks } = install('frozen');
    let attempts = 0;
    const fiber = Effect.runFork(
      coordinator.run(
        identity('frozen'),
        Effect.sync(() => {
          attempts += 1;
        }).pipe(Effect.andThen(Effect.never)),
      ),
    );

    await vi.waitFor(() => expect(attempts).toBe(1));
    document.setVisibility('hidden');
    expect(locks.releases).toBe(0);
    document.dispatch('freeze');
    await vi.waitFor(() => expect(locks.releases).toBe(1));

    document.dispatch('resume');
    await vi.waitFor(() => expect(attempts).toBe(2));
    await Effect.runPromise(Fiber.interrupt(fiber));
    await coordinator.dispose();
    expect(
      [...document.listeners.values()].every(
        (listeners) => listeners.size === 0,
      ),
    ).toBe(true);
  });
});
