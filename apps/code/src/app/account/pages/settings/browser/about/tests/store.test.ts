import { afterEach, describe, expect, it, vi } from 'vitest';
import { clearAndReload } from '../store.ts';

/*
 * A fresh start over a browser faked here: every database, both
 * storages, every cache and every service worker go, then the page
 * reloads; a part that fails keeps none of the rest.
 */

const browser = () => {
  const deleted: Array<string> = [];
  const fake = {
    indexedDB: {
      databases: () =>
        Promise.resolve([
          { name: 'code:account:a' },
          { name: 'code:preferences' },
        ]),
      deleteDatabase: (name: string) => {
        deleted.push(name);
        const request: Record<string, () => void> = {};
        setTimeout(() => request.onsuccess?.(), 0);
        return request;
      },
    },
    localStorage: { clear: vi.fn() },
    sessionStorage: { clear: vi.fn() },
    caches: {
      keys: () => Promise.resolve(['precache', 'runtime']),
      delete: vi.fn(() => Promise.resolve(true)),
    },
    navigator: {
      serviceWorker: {
        getRegistrations: () => Promise.resolve([{ unregister: vi.fn() }]),
      },
    },
    location: { reload: vi.fn() },
  };
  for (const [name, value] of Object.entries(fake)) vi.stubGlobal(name, value);
  return { fake, deleted };
};

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('clearAndReload', () => {
  it('deletes everything this browser keeps, then reloads', async () => {
    const { fake, deleted } = browser();
    await clearAndReload();
    expect(deleted).toEqual(['code:account:a', 'code:preferences']);
    expect(fake.localStorage.clear).toHaveBeenCalledOnce();
    expect(fake.sessionStorage.clear).toHaveBeenCalledOnce();
    expect(fake.caches.delete).toHaveBeenCalledTimes(2);
    expect(fake.location.reload).toHaveBeenCalledOnce();
  });

  it('still reloads when a part fails', async () => {
    const { fake } = browser();
    fake.localStorage.clear.mockImplementation(() => {
      throw new Error('private mode');
    });
    vi.stubGlobal('localStorage', fake.localStorage);
    await clearAndReload();
    expect(fake.caches.delete).toHaveBeenCalledTimes(2);
    expect(fake.location.reload).toHaveBeenCalledOnce();
  });
});
