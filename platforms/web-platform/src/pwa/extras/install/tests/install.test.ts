import * as Effect from 'effect/Effect';
import * as Layer from 'effect/Layer';
import * as SubscriptionRef from 'effect/SubscriptionRef';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { FakeBrowser, fire } from '../../../../../test/pwa/fake-browser.js';
import { Install } from '../index.js';

// Each run builds a fresh service, as a fresh page would.
const run = <A, E, R>(program: Effect.Effect<A, E, R>, layer: Layer.Layer<R>) =>
  Effect.runPromise(
    Effect.scoped(program.pipe(Effect.provide(layer))) as Effect.Effect<A, E>,
  );

let browser: FakeBrowser;
beforeEach(() => {
  browser = new FakeBrowser();
  browser.install();
});
afterEach(() => {
  vi.unstubAllGlobals();
});

const runInstall = <A>(program: Effect.Effect<A, never, Install>) =>
  run(program, Install.layer);

const installTag = Effect.gen(function* () {
  const install = yield* Install;
  return (yield* SubscriptionRef.get(install.state))._tag;
});

const IOS_SAFARI =
  'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1';

const installEvent = (outcome: 'accepted' | 'dismissed') =>
  Object.assign(new Event('beforeinstallprompt', { cancelable: true }), {
    prompt: vi.fn(async () => undefined),
    userChoice: Promise.resolve({ outcome }),
  });

describe('Install', () => {
  it('captures beforeinstallprompt and prompts once', async () => {
    const event = installEvent('accepted');
    const result = await runInstall(
      Effect.gen(function* () {
        const install = yield* Install;
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
    const tag = await runInstall(
      Effect.gen(function* () {
        const install = yield* Install;
        browser.window.dispatchEvent(installEvent('dismissed'));
        expect(yield* install.prompt).toBe('dismissed');
        return yield* installTag;
      }),
    );
    expect(tag).toBe('Dismissed');
    expect(await runInstall(installTag)).toBe('Dismissed');
  });

  it('forgets a dismissal after 30 days', async () => {
    const days = (n: number) => String(Date.now() - n * 24 * 60 * 60 * 1000);
    browser.navigator['userAgent'] = IOS_SAFARI;
    browser.storage.set('pwa-toolkit:install-dismissed-at', days(29));
    expect(await runInstall(installTag)).toBe('Dismissed');
    browser.storage.set('pwa-toolkit:install-dismissed-at', days(31));
    expect(await runInstall(installTag)).toBe('ManualIos');
  });

  it('offers manual steps on iOS Safari (iPhone and iPadOS), not other iOS browsers', async () => {
    browser.navigator['userAgent'] = IOS_SAFARI;
    expect(await runInstall(installTag)).toBe('ManualIos');
    browser.navigator['userAgent'] =
      'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Safari/605.1.15';
    browser.navigator['maxTouchPoints'] = 5;
    expect(await runInstall(installTag)).toBe('ManualIos');
    browser.navigator['userAgent'] = IOS_SAFARI.replace(
      'Version/18.0',
      'CriOS/140.0',
    );
    expect(await runInstall(installTag)).toBe('Unsupported');
  });

  it('is Installed when running standalone or after appinstalled', async () => {
    browser.displayMode = 'standalone';
    expect(await runInstall(installTag)).toBe('Installed');
    browser.displayMode = 'browser';
    browser.navigator['standalone'] = true;
    expect(await runInstall(installTag)).toBe('Installed');
    delete browser.navigator['standalone'];
    const tag = await runInstall(
      Effect.andThen(fire(browser.window, 'appinstalled'), () => installTag),
    );
    expect(tag).toBe('Installed');
  });
});
