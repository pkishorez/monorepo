// Hand-rolled browser for client and extras tests: just enough of window,
// document and navigator.
import * as Effect from 'effect/Effect';
import { vi } from 'vitest';
import { BUILD_ID_META_NAME } from '../src/shared/build/index.js';
import {
  controlReply,
  type ControlReply,
} from '../src/shared/commands/index.js';

export class FakeWorker extends EventTarget {
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

export class FakeRegistration extends EventTarget {
  waiting: FakeWorker | null = null;
  installing: FakeWorker | null = null;
  active: FakeWorker | null = null;
  readonly update = vi.fn(async () => undefined);
  readonly unregister = vi.fn(async () => true);
}

export class FakeContainer extends EventTarget {
  controller: FakeWorker | null = null;
  readonly registration = new FakeRegistration();
  readonly register = vi.fn(async () => this.registration);
  readonly others: Array<FakeRegistration> = [];
  readonly getRegistrations = vi.fn(async () => [
    this.registration,
    ...this.others,
  ]);
}

export class FakeMediaQuery extends EventTarget {
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

export class FakeBrowser {
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

export const settle = Effect.promise(
  () => new Promise((r) => setTimeout(r, 5)),
);
export const fire = (target: EventTarget, type: string) =>
  Effect.sync(() => target.dispatchEvent(new Event(type)));
