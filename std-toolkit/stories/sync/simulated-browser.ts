import {
  webLockLeadershipWithEnvironment,
  type BrowserDocument,
  type BrowserLockManager,
} from '../../src/sync/platform/browser/web-locks/web-locks.js';

type LockRequest = {
  readonly name: string;
  readonly signal: AbortSignal;
  readonly callback: (lock: unknown) => Promise<void>;
  readonly resolve: (value: unknown) => void;
  readonly reject: (error: unknown) => void;
  readonly onAbort: () => void;
};

type LockQueue = {
  owner: boolean;
  readonly waiting: LockRequest[];
};

export class SimulatedLockManager {
  readonly #queues = new Map<string, LockQueue>();

  forTab(_tab: string): BrowserLockManager {
    return {
      request: (name, _options, callback) =>
        this.request(name, _options.signal, callback),
    };
  }

  private request(
    name: string,
    signal: AbortSignal,
    callback: (lock: unknown) => Promise<void>,
  ): Promise<unknown> {
    return new Promise((resolve, reject) => {
      if (signal.aborted) {
        reject(signal.reason);
        return;
      }
      const queue = this.#queues.get(name) ?? { owner: false, waiting: [] };
      this.#queues.set(name, queue);
      const request = {
        name,
        signal,
        callback,
        resolve,
        reject,
        onAbort: () => {
          const index = queue.waiting.indexOf(request);
          if (index < 0) return;
          queue.waiting.splice(index, 1);
          reject(signal.reason);
          this.#deleteEmpty(name, queue);
        },
      } satisfies LockRequest;
      signal.addEventListener('abort', request.onAbort, { once: true });
      queue.waiting.push(request);
      this.#drain(name, queue);
    });
  }

  #drain(name: string, queue: LockQueue) {
    if (queue.owner) return;
    const request = queue.waiting.shift();
    if (!request) {
      this.#deleteEmpty(name, queue);
      return;
    }
    if (request.signal.aborted) {
      request.reject(request.signal.reason);
      this.#drain(name, queue);
      return;
    }
    queue.owner = true;
    request.signal.removeEventListener('abort', request.onAbort);
    void request
      .callback({ name })
      .then(request.resolve, request.reject)
      .finally(() => {
        queue.owner = false;
        this.#drain(name, queue);
      });
  }

  #deleteEmpty(name: string, queue: LockQueue) {
    if (!queue.owner && queue.waiting.length === 0) this.#queues.delete(name);
  }
}

export class SimulatedDocument implements BrowserDocument {
  visibilityState: 'visible' | 'hidden' = 'visible';
  readonly #listeners = new Map<string, Set<() => void>>();
  #frozen = false;
  #closed = false;

  addEventListener(type: string, listener: () => void) {
    const listeners = this.#listeners.get(type) ?? new Set();
    listeners.add(listener);
    this.#listeners.set(type, listeners);
  }

  removeEventListener(type: string, listener: () => void) {
    this.#listeners.get(type)?.delete(listener);
  }

  hide() {
    if (this.#closed || this.visibilityState === 'hidden') return;
    this.visibilityState = 'hidden';
    this.#dispatch('visibilitychange');
  }

  show() {
    if (this.#closed || this.visibilityState === 'visible') return;
    this.visibilityState = 'visible';
    this.#dispatch('visibilitychange');
  }

  freeze() {
    if (this.#closed || this.#frozen) return;
    this.#frozen = true;
    this.#dispatch('freeze');
  }

  resume() {
    if (this.#closed || !this.#frozen) return;
    this.#frozen = false;
    this.#dispatch('resume');
  }

  close() {
    if (this.#closed) return;
    this.#closed = true;
    this.#dispatch('pagehide');
  }

  #dispatch(type: string) {
    for (const listener of this.#listeners.get(type) ?? []) listener();
  }
}

type PlatformOptions = {
  readonly releaseWhen: 'hidden' | 'frozen';
};

export const makeSimulatedBrowserPlatform = (options: PlatformOptions) => {
  const locks = new SimulatedLockManager();

  return {
    locks,
    openTab(tab: string) {
      const document = new SimulatedDocument();
      return {
        document,
        leadershipLayer: webLockLeadershipWithEnvironment(
          { locks: locks.forTab(tab), document },
          { releaseWhen: options.releaseWhen },
        ),
      };
    },
  };
};
