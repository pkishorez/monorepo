import * as Effect from 'effect/Effect';
import * as Option from 'effect/Option';
import * as SubscriptionRef from 'effect/SubscriptionRef';
import * as TestClock from 'effect/testing/TestClock';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ClientBuildInfo } from '../../shared/config/index.js';
import {
  controlReply,
  matchControlRequest,
} from '../../shared/commands/index.js';
import {
  PwaClient,
  type PwaClientServices,
  PwaRegistration,
  PwaUpdate,
  RuntimeCacheControl,
} from '../index.js';
import {
  FakeBrowser,
  FakeRegistration,
  FakeWorker,
  fire,
  settle,
} from '../../../test/fake-browser.js';

const config = (overrides: Partial<ClientBuildInfo> = {}): ClientBuildInfo => ({
  enabled: true,
  swUrl: '/sw.js',
  scope: '/',
  update: { mode: 'prompt', checkIntervalMinutes: 60 },
  buildId: null,
  manifestUrl: '/manifest.webmanifest',
  appleTouchIconUrl: null,
  ...overrides,
});

const run = <A>(
  program: Effect.Effect<A, never, PwaClientServices>,
  info: ClientBuildInfo = config(),
) =>
  Effect.runPromise(
    program.pipe(
      Effect.provide(PwaClient.layer(info)),
      Effect.provide(TestClock.layer()),
    ),
  );

const updateTag = Effect.gen(function* () {
  const update = yield* PwaUpdate;
  return (yield* SubscriptionRef.get(update.state))._tag;
});

let browser: FakeBrowser;
beforeEach(() => {
  browser = new FakeBrowser();
  browser.install();
});
afterEach(() => {
  vi.unstubAllGlobals();
});

describe('PwaRegistration', () => {
  it('registers swUrl with updateViaCache none and reads the Build ID meta', async () => {
    browser.document.meta = 'abc123';
    const result = await run(PwaRegistration);
    expect(browser.container.register).toHaveBeenCalledWith('/sw.js', {
      scope: '/',
      updateViaCache: 'none',
    });
    expect(Option.isSome(result.registration)).toBe(true);
    expect(result.buildId).toEqual(Option.some('abc123'));
  });

  it('when disabled, registers nothing and removes an old swUrl registration and its caches', async () => {
    const ours = browser.container.registration;
    ours.active = new FakeWorker();
    const foreign = new FakeRegistration();
    foreign.active = new FakeWorker('https://app.test/other-sw.js');
    browser.container.others.push(foreign);
    browser.cacheNames.add('pwa-toolkit:precache:abc');
    browser.cacheNames.add('app-cache');
    const tag = await run(
      Effect.andThen(PwaRegistration, () => updateTag),
      config({ enabled: false }),
    );
    expect(browser.container.register).not.toHaveBeenCalled();
    expect(tag).toBe('Unsupported');
    expect(ours.unregister).toHaveBeenCalledOnce();
    expect(foreign.unregister).not.toHaveBeenCalled();
    expect([...browser.cacheNames]).toEqual(['app-cache']);
  });

  it('when disabled with nothing registered, leaves caches alone', async () => {
    browser.cacheNames.add('pwa-toolkit:runtime:images');
    await run(PwaRegistration, config({ enabled: false }));
    expect([...browser.cacheNames]).toEqual(['pwa-toolkit:runtime:images']);
  });

  it('is Unsupported without the Service Worker API', async () => {
    delete browser.navigator['serviceWorker'];
    expect(await run(updateTag)).toBe('Unsupported');
  });

  it('is Unsupported when registration fails', async () => {
    browser.container.register.mockRejectedValueOnce(new Error('insecure'));
    expect(await run(updateTag)).toBe('Unsupported');
  });

  it('builds with inert values during SSR', async () => {
    vi.unstubAllGlobals();
    const result = await run(
      Effect.gen(function* () {
        const registration = yield* PwaRegistration;
        return {
          registration: Option.isNone(registration.registration),
          update: yield* updateTag,
        };
      }),
    );
    expect(result).toEqual({
      registration: true,
      update: 'Unsupported',
    });
  });
});

describe('PwaUpdate', () => {
  it('is Available when a waiting worker exists behind a controller', async () => {
    browser.container.controller = new FakeWorker();
    browser.container.registration.waiting = new FakeWorker();
    expect(await run(updateTag)).toBe('Available');
  });

  it('ignores a waiting worker on first install (no controller)', async () => {
    browser.container.registration.waiting = new FakeWorker();
    expect(await run(updateTag)).toBe('Idle');
  });

  it('becomes Available when an installing update finishes installing', async () => {
    browser.container.controller = new FakeWorker();
    const tag = await run(
      Effect.gen(function* () {
        const registration = browser.container.registration;
        const next = new FakeWorker();
        next.state = 'installing';
        registration.installing = next;
        yield* fire(registration, 'updatefound');
        registration.installing = null;
        registration.waiting = next;
        next.becomes('installed');
        return yield* updateTag;
      }),
    );
    expect(tag).toBe('Available');
  });

  it('checks on load, focus, visibility and every checkIntervalMinutes', async () => {
    const calls = await run(
      Effect.gen(function* () {
        const update = browser.container.registration.update;
        yield* settle;
        const onLoad = update.mock.calls.length;
        yield* fire(browser.window, 'focus');
        yield* settle;
        yield* fire(browser.document, 'visibilitychange');
        yield* settle;
        yield* TestClock.adjust('60 minutes');
        yield* settle;
        return [onLoad, update.mock.calls.length];
      }),
    );
    expect(calls).toEqual([1, 4]);
  });

  it('apply sends SKIP_WAITING to the waiting worker; controllerchange reloads', async () => {
    browser.container.controller = new FakeWorker();
    const waiting = new FakeWorker();
    browser.container.registration.waiting = waiting;
    const tag = await run(
      Effect.gen(function* () {
        const update = yield* PwaUpdate;
        yield* update.apply;
        expect(browser.reload).not.toHaveBeenCalled();
        yield* fire(browser.container, 'controllerchange');
        yield* fire(browser.container, 'controllerchange');
        return yield* updateTag;
      }),
    );
    expect(waiting.received.map((m) => matchControlRequest(m))).toEqual([
      Option.some({ __pwaToolkit: 1, type: 'SKIP_WAITING' }),
    ]);
    expect(tag).toBe('Applying');
    expect(browser.reload).toHaveBeenCalledTimes(1);
  });

  it('returns to Available when the waiting worker refuses', async () => {
    browser.container.controller = new FakeWorker();
    const waiting = new FakeWorker();
    waiting.reply = controlReply.failed('nope');
    browser.container.registration.waiting = waiting;
    const tag = await run(
      Effect.gen(function* () {
        yield* (yield* PwaUpdate).apply;
        return yield* updateTag;
      }),
    );
    expect(tag).toBe('Available');
  });

  it('never reloads on the first-install claim', async () => {
    await run(
      Effect.gen(function* () {
        yield* PwaUpdate;
        yield* fire(browser.container, 'controllerchange');
      }),
    );
    expect(browser.reload).not.toHaveBeenCalled();
  });

  it('every tab reloads on controllerchange, even one that did not accept', async () => {
    browser.container.controller = new FakeWorker();
    await run(
      Effect.gen(function* () {
        yield* PwaUpdate;
        yield* fire(browser.container, 'controllerchange');
      }),
    );
    expect(browser.reload).toHaveBeenCalledTimes(1);
  });

  it('navigated applies only in auto-on-navigation mode', async () => {
    const received = async (mode: 'prompt' | 'auto-on-navigation') => {
      browser = new FakeBrowser();
      browser.install();
      browser.container.controller = new FakeWorker();
      const waiting = new FakeWorker();
      browser.container.registration.waiting = waiting;
      await run(
        Effect.flatMap(PwaUpdate, (update) => update.navigated),
        config({ update: { mode, checkIntervalMinutes: 60 } }),
      );
      return waiting.received.length;
    };
    expect(await received('prompt')).toBe(0);
    expect(await received('auto-on-navigation')).toBe(1);
  });
});

describe('RuntimeCacheControl', () => {
  it('deletes only Runtime Caches, with no registration needed', async () => {
    for (const name of [
      'pwa-toolkit:runtime:images',
      'pwa-toolkit:runtime:pages:abc',
      'pwa-toolkit:precache:abc',
      'app-cache',
    ]) {
      browser.cacheNames.add(name);
    }
    await Effect.runPromise(
      Effect.flatMap(RuntimeCacheControl, (c) => c.clear).pipe(
        Effect.provide(RuntimeCacheControl.layer),
      ),
    );
    expect([...browser.cacheNames]).toEqual([
      'pwa-toolkit:precache:abc',
      'app-cache',
    ]);
  });
});
