// @vitest-environment jsdom
import { Effect, Fiber, Stream } from 'effect';
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

/** Lets what is under way run. */
const settle = () => new Promise((resolve) => setTimeout(resolve, 5));

/** How many requests it has made, once it has made them. */
const asks = (count: number) =>
  vi.waitFor(() => expect(asked).toHaveLength(count));

/** Starts it, and waits until it listens and, the page showing, has asked. */
const hold = async () => {
  const onWindow = vi.spyOn(window, 'addEventListener');
  const onDocument = vi.spyOn(document, 'addEventListener');
  const holding = Effect.runFork(Effect.scoped(holdScreen));
  await vi.waitFor(() => {
    expect(onWindow).toHaveBeenCalledWith(
      'pointerup',
      expect.anything(),
      expect.anything(),
    );
    expect(onWindow).toHaveBeenCalledWith(
      'keydown',
      expect.anything(),
      expect.anything(),
    );
    expect(onDocument).toHaveBeenCalledWith(
      'visibilitychange',
      expect.anything(),
      undefined,
    );
  });
  if (visibility === 'visible') await asks(1);
  return holding;
};

/** Stops it, refusing what it still waits on: a stop waits for the answer. */
const stop = async (holding: Fiber.Fiber<void>) => {
  const stopped = Effect.runPromise(Fiber.interrupt(holding));
  await settle();
  asked.forEach(({ refuse }) => refuse());
  await stopped;
};

/** Answers the latest request and lets it land. */
const grant = async () => {
  const lock = asked.at(-1)!.grant();
  await settle();
  return lock;
};

const tap = async () => {
  window.dispatchEvent(new Event('pointerup'));
  await settle();
};

const press = async () => {
  window.dispatchEvent(new Event('keydown'));
  await settle();
};

const showing = async (state: DocumentVisibilityState) => {
  visibility = state;
  document.dispatchEvent(new Event('visibilitychange'));
  await settle();
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
    const holding = await hold();
    expect(asked).toHaveLength(1);
    await grant();
    await tap();
    await showing('visible');
    expect(asked).toHaveLength(1);
    await stop(holding);
  });

  it('does not ask twice while it waits for an answer', async () => {
    const holding = await hold();
    await tap();
    expect(asked).toHaveLength(1);
    await grant();
    expect(asked).toHaveLength(1);
    await stop(holding);
  });

  it('asks again when the page shows, after the browser let go as it hid', async () => {
    const holding = await hold();
    const lock = await grant();
    lock.released = true;
    await showing('hidden');
    expect(asked).toHaveLength(1);
    await showing('visible');
    await asks(2);
    await stop(holding);
  });

  it('never asks while the page is hidden', async () => {
    visibility = 'hidden';
    const holding = await hold();
    await tap();
    expect(asked).toHaveLength(0);
    await showing('visible');
    await asks(1);
    await stop(holding);
  });

  it('refused, asks again at the next tap or key, not before', async () => {
    const holding = await hold();
    asked[0]!.refuse();
    await settle();
    expect(asked).toHaveLength(1);
    await tap();
    await asks(2);
    asked[1]!.refuse();
    await settle();
    await press();
    await asks(3);
    await stop(holding);
  });

  it('let go while showing, asks again at the next tap', async () => {
    const holding = await hold();
    const lock = await grant();
    lock.released = true;
    expect(asked).toHaveLength(1);
    await tap();
    await asks(2);
    await stop(holding);
  });

  it('lets go as it stops, and asks no more', async () => {
    const holding = await hold();
    const lock = await grant();
    await stop(holding);
    expect(lock.release).toHaveBeenCalledOnce();
    await showing('visible');
    await tap();
    expect(asked).toHaveLength(1);
  });

  it('stopped while asking, lets go of what is granted after', async () => {
    const holding = await hold();
    const stopped = Effect.runPromise(Fiber.interrupt(holding));
    await settle();
    const lock = await grant();
    await stopped;
    expect(lock.release).toHaveBeenCalledOnce();
  });

  it('does nothing in a browser without a wake lock', async () => {
    Reflect.deleteProperty(navigator, 'wakeLock');
    await Effect.runPromise(Effect.scoped(holdScreen));
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
