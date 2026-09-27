import * as Effect from 'effect/Effect';
import * as Option from 'effect/Option';
import * as SubscriptionRef from 'effect/SubscriptionRef';
import * as TestClock from 'effect/testing/TestClock';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { BUILD_ID_META_NAME } from '../../domain/build/index.js';
import type { ClientBuildInfo } from '../../domain/config/index.js';
import {
  matchControlRequest,
  controlReply,
  type ControlReply,
} from '../../domain/control-channel/index.js';
import {
  Connectivity,
  DisplayMode,
  PwaClient,
  type PwaClientServices,
  PwaInstall,
  PwaRegistration,
  PwaUpdate,
  RuntimeCacheControl,
  StoragePersistence,
} from '../index.js';

// Hand-rolled browser: just enough of window, document and navigator.

class FakeWorker extends EventTarget {
  state: ServiceWorkerState = 'installed';
  constructor(readonly scriptURL = 'https://app.test/sw.js') {
    super();
  }
  readonly received: Array<unknown> = [];
  reply: ControlReply | null = controlReply.done();

  postMessage(message: unknown, transfer: Array<MessagePort>) {
    this.received.push(message);
    if (this.reply !== null) transfer[0]?.postMessage(this.reply);
  }
  becomes(state: ServiceWorkerState) {
    this.state = state;
    this.dispatchEvent(new Event('statechange'));
  }
}

class FakeRegistration extends EventTarget {
  waiting: FakeWorker | null = null;
  installing: FakeWorker | null = null;
  active: FakeWorker | null = null;
  readonly update = vi.fn(async () => undefined);
  readonly unregister = vi.fn(async () => true);
}

class FakeContainer extends EventTarget {
  controller: FakeWorker | null = null;
  readonly registration = new FakeRegistration();
  readonly register = vi.fn(async () => this.registration);
  readonly others: Array<FakeRegistration> = [];
  readonly getRegistrations = vi.fn(async () => [
    this.registration,
    ...this.others,
  ]);
}

class FakeMediaQuery extends EventTarget {
  constructor(
    readonly media: string,
    private readonly env: FakeBrowser,
  ) {
    super();
  }
  get matches() {
    return (
      this.env.displayMode === /\(display-mode: (.+)\)/.exec(this.media)?.[1]
    );
  }
}

class FakeBrowser {
  displayMode = 'browser';
  readonly container = new FakeContainer();
  readonly queries = new Map<string, FakeMediaQuery>();
  readonly storage = new Map<string, string>();
  readonly cacheNames = new Set<string>();
  readonly reload = vi.fn();
  readonly window = Object.assign(new EventTarget(), {
    location: { reload: this.reload },
    matchMedia: (media: string) => {
      const query = this.queries.get(media) ?? new FakeMediaQuery(media, this);
      this.queries.set(media, query);
      return query;
    },
  });
  readonly document = Object.assign(new EventTarget(), {
    visibilityState: 'visible',
    meta: null as string | null,
    querySelector: (selector: string) =>
      selector === `meta[name="${BUILD_ID_META_NAME}"]` && this.document.meta
        ? { getAttribute: () => this.document.meta }
        : null,
  });
  readonly navigator: Record<string, unknown> = {
    serviceWorker: this.container,
    onLine: true,
    userAgent: 'Mozilla/5.0 (X11; Linux x86_64) Chrome/140.0 Safari/537.36',
    maxTouchPoints: 0,
  };

  install() {
    vi.stubGlobal('window', this.window);
    vi.stubGlobal('document', this.document);
    vi.stubGlobal('navigator', this.navigator);
    vi.stubGlobal('localStorage', {
      getItem: (key: string) => this.storage.get(key) ?? null,
      setItem: (key: string, value: string) => this.storage.set(key, value),
    });
    vi.stubGlobal('caches', {
      keys: async () => [...this.cacheNames],
      delete: async (name: string) => this.cacheNames.delete(name),
    });
  }
  setDisplayMode(mode: string) {
    this.displayMode = mode;
    for (const query of this.queries.values()) {
      query.dispatchEvent(new Event('change'));
    }
  }
}

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
const installTag = Effect.gen(function* () {
  const install = yield* PwaInstall;
  return (yield* SubscriptionRef.get(install.state))._tag;
});
const settle = Effect.promise(() => new Promise((r) => setTimeout(r, 5)));
const fire = (target: EventTarget, type: string) =>
  Effect.sync(() => target.dispatchEvent(new Event(type)));

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
        const online = yield* Connectivity;
        const mode = yield* DisplayMode;
        return {
          registration: Option.isNone(registration.registration),
          update: yield* updateTag,
          install: yield* installTag,
          online: yield* SubscriptionRef.get(online.online),
          mode: yield* SubscriptionRef.get(mode.mode),
        };
      }),
    );
    expect(result).toEqual({
      registration: true,
      update: 'Unsupported',
      install: 'Unsupported',
      online: true,
      mode: 'browser',
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

const IOS_SAFARI =
  'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1';

const installEvent = (outcome: 'accepted' | 'dismissed') =>
  Object.assign(new Event('beforeinstallprompt', { cancelable: true }), {
    prompt: vi.fn(async () => undefined),
    userChoice: Promise.resolve({ outcome }),
  });

describe('PwaInstall', () => {
  it('captures beforeinstallprompt and prompts once', async () => {
    const event = installEvent('accepted');
    const result = await run(
      Effect.gen(function* () {
        const install = yield* PwaInstall;
        browser.window.dispatchEvent(event);
        const before = yield* installTag;
        const first = yield* install.prompt;
        const second = yield* install.prompt;
        return { before, first, second, after: yield* installTag };
      }),
    );
    expect(event.defaultPrevented).toBe(true);
    expect(result).toEqual({
      before: 'Available',
      first: 'accepted',
      second: 'unavailable',
      after: 'Installed',
    });
  });

  it('remembers a native dismissal for 30 days', async () => {
    const tag = await run(
      Effect.gen(function* () {
        const install = yield* PwaInstall;
        browser.window.dispatchEvent(installEvent('dismissed'));
        expect(yield* install.prompt).toBe('dismissed');
        return yield* installTag;
      }),
    );
    expect(tag).toBe('Dismissed');
    expect(await run(installTag)).toBe('Dismissed');
  });

  it('forgets a dismissal after 30 days', async () => {
    const days = (n: number) => String(Date.now() - n * 24 * 60 * 60 * 1000);
    browser.navigator['userAgent'] = IOS_SAFARI;
    browser.storage.set('pwa-toolkit:install-dismissed-at', days(29));
    expect(await run(installTag)).toBe('Dismissed');
    browser.storage.set('pwa-toolkit:install-dismissed-at', days(31));
    expect(await run(installTag)).toBe('ManualIos');
  });

  it('offers manual steps on iOS Safari (iPhone and iPadOS), not other iOS browsers', async () => {
    browser.navigator['userAgent'] = IOS_SAFARI;
    expect(await run(installTag)).toBe('ManualIos');
    browser.navigator['userAgent'] =
      'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Safari/605.1.15';
    browser.navigator['maxTouchPoints'] = 5;
    expect(await run(installTag)).toBe('ManualIos');
    browser.navigator['userAgent'] = IOS_SAFARI.replace(
      'Version/18.0',
      'CriOS/140.0',
    );
    expect(await run(installTag)).toBe('Unsupported');
  });

  it('is Installed when running standalone or after appinstalled', async () => {
    browser.displayMode = 'standalone';
    expect(await run(installTag)).toBe('Installed');
    browser.displayMode = 'browser';
    browser.navigator['standalone'] = true;
    expect(await run(installTag)).toBe('Installed');
    delete browser.navigator['standalone'];
    const tag = await run(
      Effect.andThen(fire(browser.window, 'appinstalled'), () => installTag),
    );
    expect(tag).toBe('Installed');
  });
});

describe('Connectivity and DisplayMode', () => {
  it('follows online and offline events', async () => {
    const values = await run(
      Effect.gen(function* () {
        const { online } = yield* Connectivity;
        yield* fire(browser.window, 'offline');
        const offline = yield* SubscriptionRef.get(online);
        yield* fire(browser.window, 'online');
        return [offline, yield* SubscriptionRef.get(online)];
      }),
    );
    expect(values).toEqual([false, true]);
  });

  it('follows display-mode media queries', async () => {
    const modes = await run(
      Effect.gen(function* () {
        const { mode } = yield* DisplayMode;
        const before = yield* SubscriptionRef.get(mode);
        browser.setDisplayMode('window-controls-overlay');
        return [before, yield* SubscriptionRef.get(mode)];
      }),
    );
    expect(modes).toEqual(['browser', 'window-controls-overlay']);
  });
});

describe('StoragePersistence', () => {
  it('is none without the Storage API', async () => {
    const result = await run(
      Effect.flatMap(StoragePersistence, (s) => s.persisted),
    );
    expect(result).toEqual(Option.none());
  });

  it('reads persisted, persist and estimate', async () => {
    browser.navigator['storage'] = {
      persisted: async () => false,
      persist: async () => true,
      estimate: async () => ({ usage: 10 }),
    };
    const result = await run(
      Effect.gen(function* () {
        const storage = yield* StoragePersistence;
        return [
          yield* storage.persisted,
          yield* storage.persist,
          yield* storage.estimate,
        ];
      }),
    );
    expect(result).toEqual([
      Option.some(false),
      Option.some(true),
      Option.some({ usage: 10, quota: 0 }),
    ]);
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
