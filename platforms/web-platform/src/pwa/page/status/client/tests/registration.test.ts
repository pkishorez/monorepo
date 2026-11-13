import * as Effect from 'effect/Effect';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  config,
  run,
  statusTag,
} from '../../../../../../test/pwa/client-run.js';
import {
  FakeBrowser,
  FakeRegistration,
  FakeWorker,
} from '../../../../../../test/pwa/fake-browser.js';
import { clearRuntimeCache } from '../index.js';

let browser: FakeBrowser;
beforeEach(() => {
  browser = new FakeBrowser();
  browser.install();
});
afterEach(() => {
  vi.unstubAllGlobals();
});

describe('registration', () => {
  it('registers swUrl with updateViaCache none', async () => {
    await run(statusTag);
    expect(browser.container.register).toHaveBeenCalledWith('/sw.js', {
      scope: '/',
      updateViaCache: 'none',
    });
  });

  it('when disabled, registers nothing and removes an old swUrl registration and its caches', async () => {
    const ours = browser.container.registration;
    ours.active = new FakeWorker();
    const foreign = new FakeRegistration();
    foreign.active = new FakeWorker('https://app.test/other-sw.js');
    browser.container.others.push(foreign);
    browser.cacheNames.add('web-platform:pwa:precache:abc');
    browser.cacheNames.add('pwa-toolkit:precache:abc');
    browser.cacheNames.add('app-cache');
    const tag = await run(statusTag, config({ enabled: false }));
    expect(browser.container.register).not.toHaveBeenCalled();
    expect(tag).toBe('Unsupported');
    expect(ours.unregister).toHaveBeenCalledOnce();
    expect(foreign.unregister).not.toHaveBeenCalled();
    expect([...browser.cacheNames]).toEqual(['app-cache']);
  });

  it('when disabled with nothing registered, leaves caches alone', async () => {
    browser.cacheNames.add('web-platform:pwa:runtime:images');
    await run(statusTag, config({ enabled: false }));
    expect([...browser.cacheNames]).toEqual([
      'web-platform:pwa:runtime:images',
    ]);
  });

  it('is Unsupported without the Service Worker API', async () => {
    delete browser.navigator['serviceWorker'];
    expect(await run(statusTag)).toBe('Unsupported');
  });

  it('is Unsupported when registration fails', async () => {
    browser.container.register.mockRejectedValueOnce(new Error('insecure'));
    expect(await run(statusTag)).toBe('Unsupported');
  });

  it('is Unsupported during SSR', async () => {
    vi.unstubAllGlobals();
    expect(await run(statusTag)).toBe('Unsupported');
  });
});

describe('clearRuntimeCache', () => {
  it('deletes only Runtime Caches, with no registration needed', async () => {
    for (const name of [
      'web-platform:pwa:runtime:images',
      'web-platform:pwa:runtime:pages:abc',
      'web-platform:pwa:precache:abc',
      'app-cache',
    ]) {
      browser.cacheNames.add(name);
    }
    await Effect.runPromise(clearRuntimeCache);
    expect([...browser.cacheNames]).toEqual([
      'web-platform:pwa:precache:abc',
      'app-cache',
    ]);
  });
});
