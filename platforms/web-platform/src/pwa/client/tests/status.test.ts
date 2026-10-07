import * as Effect from 'effect/Effect';
import * as Option from 'effect/Option';
import * as TestClock from 'effect/testing/TestClock';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { run, statusTag } from '../../../../test/pwa/client-run.js';
import {
  FakeBrowser,
  FakeWorker,
  fire,
  settle,
} from '../../../../test/pwa/fake-browser.js';
import { commandReply, matchCommand } from '../../shared/commands/index.js';
import { Pwa } from '../index.js';

let browser: FakeBrowser;
beforeEach(() => {
  browser = new FakeBrowser();
  browser.install();
});
afterEach(() => {
  vi.unstubAllGlobals();
});

/** A page controlled by an active worker. */
const controlled = () => {
  const active = new FakeWorker();
  browser.container.controller = active;
  browser.container.registration.active = active;
};

describe('status', () => {
  it('is Installing on a first visit, then Ready once the worker takes control, with no reload', async () => {
    const worker = new FakeWorker();
    worker.state = 'installing';
    browser.container.registration.installing = worker;
    const tags = await run(
      Effect.gen(function* () {
        const before = yield* statusTag;
        browser.container.registration.installing = null;
        browser.container.registration.active = worker;
        browser.container.controller = worker;
        yield* fire(browser.container, 'controllerchange');
        return [before, yield* statusTag];
      }),
    );
    expect(tags).toEqual(['Installing', 'Ready']);
    expect(browser.reload).not.toHaveBeenCalled();
  });

  it('is Unsupported when the first install fails', async () => {
    const worker = new FakeWorker();
    worker.state = 'installing';
    browser.container.registration.installing = worker;
    const tag = await run(
      Effect.gen(function* () {
        browser.container.registration.installing = null;
        worker.becomes('redundant');
        return yield* statusTag;
      }),
    );
    expect(tag).toBe('Unsupported');
  });

  it('is Ready when an active worker controls the page', async () => {
    controlled();
    expect(await run(statusTag)).toBe('Ready');
  });

  it('is Ready after a hard reload: active worker, no controller', async () => {
    browser.container.registration.active = new FakeWorker();
    expect(await run(statusTag)).toBe('Ready');
  });

  it('is UpdateReady when a waiting worker exists behind a controller', async () => {
    controlled();
    browser.container.registration.waiting = new FakeWorker();
    expect(await run(statusTag)).toBe('UpdateReady');
  });

  it('becomes UpdateReady when an installing update finishes installing', async () => {
    controlled();
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
        return yield* statusTag;
      }),
    );
    expect(tag).toBe('UpdateReady');
  });

  it('checks on load, focus, visibility and every checkIntervalMinutes', async () => {
    controlled();
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

  it('applyUpdate sends SKIP_WAITING to the waiting worker; controllerchange reloads', async () => {
    controlled();
    const waiting = new FakeWorker();
    browser.container.registration.waiting = waiting;
    const tag = await run(
      Effect.gen(function* () {
        const pwa = yield* Pwa;
        yield* pwa.applyUpdate;
        expect(browser.reload).not.toHaveBeenCalled();
        yield* fire(browser.container, 'controllerchange');
        yield* fire(browser.container, 'controllerchange');
        return yield* statusTag;
      }),
    );
    expect(waiting.received.map((m) => matchCommand(m))).toEqual([
      Option.some({ __pwaToolkit: 1, type: 'SKIP_WAITING' }),
    ]);
    expect(tag).toBe('Updating');
    expect(browser.reload).toHaveBeenCalledTimes(1);
  });

  it('returns to UpdateReady when the waiting worker refuses', async () => {
    controlled();
    const waiting = new FakeWorker();
    waiting.reply = commandReply.failed('nope');
    browser.container.registration.waiting = waiting;
    const tag = await run(
      Effect.gen(function* () {
        yield* (yield* Pwa).applyUpdate;
        return yield* statusTag;
      }),
    );
    expect(tag).toBe('UpdateReady');
  });

  it('every page reloads on controllerchange, even one that did not accept', async () => {
    controlled();
    const tag = await run(
      Effect.gen(function* () {
        yield* fire(browser.container, 'controllerchange');
        return yield* statusTag;
      }),
    );
    expect(tag).toBe('Updating');
    expect(browser.reload).toHaveBeenCalledTimes(1);
  });
});
