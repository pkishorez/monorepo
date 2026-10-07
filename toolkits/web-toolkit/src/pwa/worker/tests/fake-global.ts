// Test fixture: an in-memory service worker global scope (no browser).
import type { ServiceWorkerGlobal } from '../global-scope/index.js';

export const ORIGIN = 'https://app.test';

type NetworkHandler = (
  request: Request,
  init: RequestInit | undefined,
) => Response | Promise<Response>;

const keyOf = (request: RequestInfo | URL): string =>
  typeof request === 'string' || request instanceof URL
    ? new URL(request, ORIGIN).href
    : request.url;

class FakeCache {
  readonly entries = new Map<string, Response>();
  match(request: RequestInfo | URL): Promise<Response | undefined> {
    return Promise.resolve(this.entries.get(keyOf(request))?.clone());
  }
  async put(request: RequestInfo | URL, response: Response): Promise<void> {
    const key = keyOf(request);
    const body = await response.arrayBuffer();
    this.entries.delete(key);
    this.entries.set(
      key,
      new Response(body, {
        status: response.status,
        headers: response.headers,
      }),
    );
  }
  delete(request: RequestInfo | URL): Promise<boolean> {
    return Promise.resolve(this.entries.delete(keyOf(request)));
  }
  keys(): Promise<ReadonlyArray<Request>> {
    return Promise.resolve(
      [...this.entries.keys()].map((url) => new Request(url)),
    );
  }
}

class FakeCacheStorage {
  readonly caches = new Map<string, FakeCache>();
  open(name: string): Promise<FakeCache> {
    const cache = this.caches.get(name) ?? new FakeCache();
    this.caches.set(name, cache);
    return Promise.resolve(cache);
  }
  keys(): Promise<Array<string>> {
    return Promise.resolve([...this.caches.keys()]);
  }
  delete(name: string): Promise<boolean> {
    return Promise.resolve(this.caches.delete(name));
  }
  /** Seeds a cache with `url → body` entries. */
  seed(name: string, entries: Record<string, string | Response>): void {
    const cache = this.caches.get(name) ?? new FakeCache();
    for (const [url, body] of Object.entries(entries)) {
      cache.entries.set(
        new URL(url, ORIGIN).href,
        typeof body === 'string' ? new Response(body) : body,
      );
    }
    this.caches.set(name, cache);
  }
  urls(name: string): Array<string> {
    return [...(this.caches.get(name)?.entries.keys() ?? [])].map(
      (url) => new URL(url).pathname,
    );
  }
}

export interface FakeEvent {
  readonly waitUntil: (promise: Promise<unknown>) => void;
  readonly respondWith: (response: Promise<Response>) => void;
  readonly lifetimes: Array<Promise<unknown>>;
  response: Promise<Response> | undefined;
}

export const makeFakeGlobal = (
  options: { readonly active?: boolean; readonly waiting?: boolean } = {},
) => {
  const listeners = new Map<string, (event: unknown) => void>();
  const caches = new FakeCacheStorage();
  const requests: Array<{ url: string; init: RequestInit | undefined }> = [];
  const calls = { skipWaiting: 0, claim: 0 };
  let network: NetworkHandler = () => Promise.reject(new TypeError('offline'));

  const global = {
    location: { origin: ORIGIN },
    caches,
    registration: {
      active: options.active === true ? {} : null,
      waiting: options.waiting === true ? {} : null,
    },
    clients: { claim: () => Promise.resolve(void calls.claim++) },
    skipWaiting: () => Promise.resolve(void calls.skipWaiting++),
    fetch: (input: RequestInfo | URL, init?: RequestInit) => {
      const request =
        typeof input === 'string' || input instanceof URL
          ? new Request(new URL(input, ORIGIN))
          : input;
      requests.push({ url: new URL(request.url).pathname, init });
      return Promise.resolve().then(() => network(request, init));
    },
    addEventListener: (type: string, listener: (event: unknown) => void) => {
      listeners.set(type, listener);
    },
  } as unknown as ServiceWorkerGlobal;

  const dispatch = (type: string, fields: object = {}): FakeEvent => {
    const event: FakeEvent = {
      lifetimes: [],
      response: undefined,
      waitUntil: (promise) => void event.lifetimes.push(promise),
      respondWith: (response) => void (event.response = response),
      ...fields,
    };
    const listener = listeners.get(type);
    if (listener === undefined) throw new Error(`no ${type} listener`);
    listener(event);
    return event;
  };

  return {
    global,
    caches,
    calls,
    requests,
    listeners,
    dispatch,
    setNetwork: (handler: NetworkHandler) => void (network = handler),
    /** A fetch event; `mode: 'navigate'` requests cannot be built in node, so it is faked. */
    fetchEvent: (
      path: string,
      init: { method?: string; mode?: string; destination?: string } = {},
    ): FakeEvent => {
      const url = new URL(path, ORIGIN).href;
      const request =
        init.mode === undefined && init.destination === undefined
          ? new Request(url, { method: init.method ?? 'GET' })
          : ({
              url,
              method: init.method ?? 'GET',
              mode: init.mode ?? 'cors',
              destination: init.destination ?? '',
              headers: new Headers(),
              clone() {
                return this;
              },
            } as unknown as Request);
      return dispatch('fetch', { request });
    },
  };
};

/** Waits for every lifetime promise, including ones added while waiting. */
export const settle = async (event: FakeEvent): Promise<void> => {
  await event.response;
  let seen = 0;
  while (seen < event.lifetimes.length) {
    seen = event.lifetimes.length;
    await Promise.allSettled(event.lifetimes);
  }
};

export const text = async (event: FakeEvent): Promise<string> => {
  if (event.response === undefined) throw new Error('no respondWith');
  return (await event.response).text();
};

export const sleep = (ms: number) =>
  new Promise<void>((resolve) => setTimeout(resolve, ms));
