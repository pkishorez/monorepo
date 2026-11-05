// @vitest-environment jsdom
import { Effect, Exit, Fiber, Scope, Stream } from 'effect';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { holdScreen, keepScreenOn } from '../actor.ts';
import { Preferences, preferencesMemory } from '../storage/index.ts';

/*
 * The screen kept on, over a browser's wake lock faked here: asked for as it
 * starts, again when the page shows or, refused, at the next tap or key, and
 * let go as it stops. And whether Preferences says so, followed.
 */

/** A wake lock as a browser holds it. */
const sentinel = () => {
  const lock = {
    released: false,
    release: vi.fn(() => {
      lock.released = true;
      return Promise.resolve();
    }),
  };
  return lock;
};

type Lock = ReturnType<typeof sentinel>;

let asked: Array<{
  readonly grant: () => Lock;
  readonly refuse: () => void;
}>;
let visibility: DocumentVisibilityState;

/** Lets what a settled request runs, run. */
const settle = () => new Promise((resolve) => setTimeout(resolve));

/** Starts holding the screen; what it gives back stops it. */
const hold = () => {
  const scope = Effect.runSync(Scope.make());
  Effect.runFork(holdScreen.pipe(Scope.provide(scope)));
  return () => Effect.runPromise(Scope.close(scope, Exit.void));
};

/** Answers the latest request and lets it land. */
const grant = async () => {
  const lock = asked.at(-1)!.grant();
  await settle();
  return lock;
};

const showing = (state: DocumentVisibilityState) => {
  visibility = state;
  document.dispatchEvent(new Event('visibilitychange'));
};

beforeEach(() => {
  asked = [];
  visibility = 'visible';
  vi.spyOn(document, 'visibilityState', 'get').mockImplementation(
    () => visibility,
  );
  Object.defineProperty(navigator, 'wakeLock', {
    configurable: true,
    value: {
      request: () =>
        new Promise((resolve, reject) => {
          asked.push({
            grant: () => {
              const lock = sentinel();
              resolve(lock);
              return lock;
            },
            refuse: () => reject(new DOMException('', 'NotAllowedError')),
          });
        }),
    },
  });
});

afterEach(() => {
  vi.restoreAllMocks();
  Reflect.deleteProperty(navigator, 'wakeLock');
});

describe('holdScreen', () => {
  it('asks as it starts, and only once while it holds', async () => {
    const stop = hold();
    await settle();
    expect(asked).toHaveLength(1);
    await grant();
    window.dispatchEvent(new Event('pointerup'));
    showing('visible');
    expect(asked).toHaveLength(1);
    await stop();
  });

  it('does not ask twice while it waits for an answer', async () => {
    const stop = hold();
    await settle();
    window.dispatchEvent(new Event('pointerup'));
    expect(asked).toHaveLength(1);
    await stop();
  });

  it('asks again when the page shows, after the browser let go as it hid', async () => {
    const stop = hold();
    await settle();
    const lock = await grant();
    lock.released = true;
    showing('hidden');
    expect(asked).toHaveLength(1);
    showing('visible');
    expect(asked).toHaveLength(2);
    await stop();
  });

  it('never asks while the page is hidden', async () => {
    visibility = 'hidden';
    const stop = hold();
    await settle();
    window.dispatchEvent(new Event('pointerup'));
    expect(asked).toHaveLength(0);
    showing('visible');
    expect(asked).toHaveLength(1);
    await stop();
  });

  it('refused, asks again at the next tap or key, not before', async () => {
    const stop = hold();
    await settle();
    asked[0]!.refuse();
    await settle();
    expect(asked).toHaveLength(1);
    window.dispatchEvent(new Event('pointerup'));
    expect(asked).toHaveLength(2);
    asked[1]!.refuse();
    await settle();
    window.dispatchEvent(new Event('keydown'));
    expect(asked).toHaveLength(3);
    await stop();
  });

  it('let go while showing, asks again at the next tap', async () => {
    const stop = hold();
    await settle();
    const lock = await grant();
    lock.released = true;
    expect(asked).toHaveLength(1);
    window.dispatchEvent(new Event('pointerup'));
    expect(asked).toHaveLength(2);
    await stop();
  });

  it('lets go as it stops, and asks no more', async () => {
    const stop = hold();
    await settle();
    const lock = await grant();
    await stop();
    expect(lock.release).toHaveBeenCalledOnce();
    showing('visible');
    window.dispatchEvent(new Event('pointerup'));
    expect(asked).toHaveLength(1);
  });

  it('stopped while asking, lets go of what is granted after', async () => {
    const stop = hold();
    await settle();
    await stop();
    const lock = await grant();
    expect(lock.release).toHaveBeenCalledOnce();
  });

  it('does nothing in a browser without a wake lock', async () => {
    Reflect.deleteProperty(navigator, 'wakeLock');
    await Effect.runPromise(holdScreen.pipe(Effect.scoped));
    expect(asked).toHaveLength(0);
  });
});

describe('keepScreenOn', () => {
  it('is on until turned off, and follows each change', async () => {
    const heard = await Effect.runPromise(
      Effect.gen(function* () {
        const following = yield* keepScreenOn.pipe(
          Stream.take(3),
          Stream.runCollect,
          Effect.forkChild,
        );
        yield* Effect.sleep('10 millis');
        const store = yield* Preferences;
        yield* store.setVim(true);
        yield* Effect.sleep('10 millis');
        yield* store.setKeepScreenOn(false);
        yield* Effect.sleep('10 millis');
        yield* store.setKeepScreenOn(true);
        return yield* Fiber.join(following);
      }).pipe(Effect.provide(preferencesMemory())),
    );
    expect(heard).toEqual([true, false, true]);
  });
});
